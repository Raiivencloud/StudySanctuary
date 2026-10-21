/**
 * Google Calendar / Drive and Outlook Calendar endpoints.
 * Every route requires a Firebase ID token; the provider tokens used are always the ones
 * connected by that same uid (one user can never act on another user's Drive).
 */
import { Router, type RequestHandler } from "express";
import axios from "axios";
import { requireUser, getUser, type AuthOptions } from "../security/auth";
import { createRateLimiter } from "../security/rateLimit";
import { requireSameOrigin, logError } from "../security/http";
import { createUploadMiddleware } from "./storageUpload";
import type { IntegrationTokenStore } from "../integrations/tokenStore";

export interface HttpClient {
  get(url: string, config?: Record<string, unknown>): Promise<{ data: any }>;
  post(url: string, body: unknown, config?: Record<string, unknown>): Promise<{ data: any }>;
}

export interface IntegrationsRouterOptions {
  auth: AuthOptions;
  tokens: IntegrationTokenStore;
  appUrl: string;
  maxUploadBytes: number;
  http?: HttpClient;
}

interface Exam {
  id: string;
  title: string;
  date: string;
  time: string;
  location: string;
  type: 'Primary' | 'Secondary' | 'Finals' | 'Midterm' | 'Quiz';
  tags: string[];
  reminder?: 'none' | '1h' | '2h' | '1d' | '2d';
}

// Drive file IDs are URL-safe; anything else (e.g. an encoded "/") is rejected.
const DRIVE_FILE_ID = /^[A-Za-z0-9_-]{1,200}$/;

/** Safe Content-Disposition (no quotes/CR/LF injection; UTF-8 name via RFC 5987). */
export function attachmentHeader(fileName: string): string {
  const fallback = fileName.replace(/[^\x20-\x7e]|["\\]/g, "_").slice(0, 200) || "download";
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName).slice(0, 600)}`;
}

export function createIntegrationsRouter(options: IntegrationsRouterOptions): Router {
  const router = Router();
  const http = options.http || axios;
  const authenticate = requireUser(options.auth);

  const googleToken = async (uid: string) => (await options.tokens.get(uid, "google"))?.access_token || null;

  // Sync endpoint
  router.get("/api/calendar/sync", authenticate, async (req, res) => {
    const { uid } = getUser(res);
    const google = await options.tokens.get(uid, "google");
    const outlook = await options.tokens.get(uid, "outlook");
    const exams: any[] = [];

    // Fetch from Google if connected
    if (google?.access_token) {
      try {
        const response = await http.get("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
          headers: { Authorization: `Bearer ${google.access_token}` },
          params: {
            timeMin: new Date().toISOString(),
            maxResults: 10,
            singleEvents: true,
            orderBy: "startTime"
          }
        });

        const googleExams = response.data.items.map((event: any) => {
          let reminder: Exam['reminder'] = 'none';
          const reminders = event.reminders;

          if (reminders && (reminders.useDefault || (reminders.overrides && reminders.overrides.length > 0))) {
            // Default to 1d if useDefault is true, or check overrides
            const minutes = reminders.overrides?.[0]?.minutes || 1440;
            if (minutes <= 60) reminder = '1h';
            else if (minutes <= 120) reminder = '2h';
            else if (minutes <= 1440) reminder = '1d';
            else reminder = '2d';
          }

          return {
            id: `google-${event.id}`,
            title: event.summary,
            date: new Date(event.start.dateTime || event.start.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
            time: new Date(event.start.dateTime || event.start.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            location: event.location || "Google Calendar",
            type: "Primary",
            tags: ["Google Sync", !reminders || (!reminders.useDefault && (!reminders.overrides || reminders.overrides.length === 0)) ? "Reminders not synced" : ""].filter(Boolean),
            reminder
          };
        });
        exams.push(...googleExams);
      } catch (error) {
        logError("Google Calendar sync", error);
      }
    }

    // Fetch from Outlook if connected
    if (outlook?.access_token) {
      try {
        const response = await http.get("https://graph.microsoft.com/v1.0/me/events", {
          headers: { Authorization: `Bearer ${outlook.access_token}` },
          params: {
            $select: "subject,start,location,isReminderOn,reminderMinutesBeforeStart",
            $top: 10,
            $orderby: "start/dateTime"
          }
        });

        const outlookExams = response.data.value.map((event: any) => {
          let reminder: Exam['reminder'] = 'none';
          if (event.isReminderOn) {
            const minutes = event.reminderMinutesBeforeStart || 15; // default 15m
            if (minutes <= 60) reminder = '1h';
            else if (minutes <= 120) reminder = '2h';
            else if (minutes <= 1440) reminder = '1d';
            else reminder = '2d';
          }

          return {
            id: `outlook-${event.id}`,
            title: event.subject,
            date: new Date(event.start.dateTime).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
            time: new Date(event.start.dateTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            location: event.location?.displayName || "Outlook Calendar",
            type: "Secondary",
            tags: ["Outlook Sync", !event.isReminderOn ? "Reminders not synced" : ""].filter(Boolean),
            reminder
          };
        });
        exams.push(...outlookExams);
      } catch (error) {
        logError("Outlook Calendar sync", error);
      }
    }

    if (exams.length === 0 && !google && !outlook) {
      return res.status(401).json({ error: "No calendar connected" });
    }

    res.json({ exams });
  });

  // Google Drive endpoints
  router.get("/api/drive/files", authenticate, async (req, res) => {
    const accessToken = await googleToken(getUser(res).uid);
    if (!accessToken) {
      return res.status(401).json({ error: "Google not connected" });
    }

    try {
      const response = await http.get("https://www.googleapis.com/drive/v3/files", {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: {
          pageSize: 20,
          fields: "files(id, name, mimeType, iconLink, webViewLink, size)",
          q: "trashed = false"
        }
      });

      res.json({ files: response.data.files });
    } catch (error) {
      logError("Google Drive list", error);
      res.status(500).json({ error: "Failed to list files" });
    }
  });

  router.get("/api/drive/download/:fileId", authenticate, async (req, res) => {
    const accessToken = await googleToken(getUser(res).uid);
    if (!accessToken) {
      return res.status(401).json({ error: "Google not connected" });
    }

    const { fileId } = req.params;
    if (!DRIVE_FILE_ID.test(fileId)) {
      return res.status(400).json({ error: "Invalid file id" });
    }

    try {
      // Get file metadata first to check mimeType
      const metadata = await http.get(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { fields: "name, mimeType" }
      });

      // If it's a Google Doc, we need to export it
      if (metadata.data.mimeType.startsWith('application/vnd.google-apps.')) {
        const isSpreadsheet = metadata.data.mimeType === 'application/vnd.google-apps.spreadsheet';
        const exportMimeType = isSpreadsheet
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'application/pdf';

        const response = await http.get(`https://www.googleapis.com/drive/v3/files/${fileId}/export`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: { mimeType: exportMimeType },
          responseType: 'arraybuffer'
        });

        res.setHeader('Content-Type', exportMimeType);
        res.setHeader('Content-Disposition', attachmentHeader(`${metadata.data.name}.${isSpreadsheet ? 'xlsx' : 'pdf'}`));
        return res.send(response.data);
      }

      // Otherwise, download directly
      const response = await http.get(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { alt: 'media' },
        responseType: 'arraybuffer'
      });

      res.setHeader('Content-Type', metadata.data.mimeType);
      res.setHeader('Content-Disposition', attachmentHeader(metadata.data.name));
      res.send(response.data);
    } catch (error) {
      logError("Google Drive download", error);
      res.status(500).json({ error: "Failed to download file" });
    }
  });

  const driveUploadLimiter = createRateLimiter({
    windowMs: 10 * 60 * 1000,
    max: 60,
    key: (_req, res) => `drive-upload:${getUser(res).uid}`,
  });
  // Checked before multer so requests without a connected Drive are never buffered in memory.
  const requireGoogleConnected: RequestHandler = async (_req, res, next) => {
    const accessToken = await googleToken(getUser(res).uid);
    if (!accessToken) {
      return res.status(401).json({ error: "Google not connected" });
    }
    res.locals.googleAccessToken = accessToken;
    next();
  };

  router.post(
    "/api/drive/upload",
    requireSameOrigin(options.appUrl),
    authenticate,
    driveUploadLimiter,
    requireGoogleConnected,
    createUploadMiddleware(options.maxUploadBytes),
    async (req, res) => {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      try {
        const metadata = {
          name: req.file.originalname,
          mimeType: req.file.mimetype
        };

        // Multipart upload requires a specific format
        const boundary = '-------314159265358979323846';
        const delimiter = `\r\n--${boundary}\r\n`;
        const closeDelimiter = `\r\n--${boundary}--`;

        const body = Buffer.concat([
          Buffer.from(delimiter + 'Content-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(metadata)),
          Buffer.from(delimiter + `Content-Type: ${req.file.mimetype}\r\n\r\n`),
          req.file.buffer,
          Buffer.from(closeDelimiter)
        ]);

        const response = await http.post("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", body, {
          headers: {
            Authorization: `Bearer ${res.locals.googleAccessToken}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
            'Content-Length': body.length
          }
        });

        res.json({ status: "ok", fileId: response.data.id });
      } catch (error) {
        logError("Google Drive upload", error);
        res.status(500).json({ error: "Failed to upload file" });
      }
    }
  );

  return router;
}
