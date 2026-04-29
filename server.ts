/**
 * Study Sanctuary - Server Entry Point
 * 
 * INFRASTRUCTURE CONFIGURATION (Cloud Run):
 * - Max Instances: 1 (Forced for cost optimization)
 * - Memory: 512MB (Minimum required for this application)
 * - Timeout: 300s
 */
import express from "express";
import path from "path";
import session from "express-session";
import cookieParser from "cookie-parser";
import axios from "axios";
import multer from "multer";
import compression from "compression";
import "dotenv/config";
import admin from "firebase-admin";
import fs from "fs";
import { MercadoPagoConfig, Preference } from 'mercadopago';

// Load Firebase Config
const configPath = path.join(process.cwd(), "firebase-applet-config.json");
console.log(`[Server] Loading config from: ${configPath}`);
if (!fs.existsSync(configPath)) {
  console.error(`[Server] Config file not found at: ${configPath}`);
  process.exit(1);
}
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));

// Initialize Firebase Admin
if (!admin.apps.length) {
  try {
    // Try initializing with config first
    admin.initializeApp({
      projectId: firebaseConfig.projectId,
      storageBucket: firebaseConfig.storageBucket
    });
    console.log(`[Server] Firebase Admin initialized with project: ${firebaseConfig.projectId}`);
  } catch (initError) {
    console.warn("[Server] Failed to initialize Firebase Admin with config, trying default:", initError);
    try {
      admin.initializeApp();
      console.log("[Server] Firebase Admin initialized with default credentials");
    } catch (defaultInitError) {
      console.error("[Server] Failed to initialize Firebase Admin with default credentials:", defaultInitError);
      process.exit(1);
    }
  }
}
const dbAdmin = admin.firestore();
const storageAdmin = admin.storage();

// Initialize Mercado Pago
const MP_PUBLIC_KEY = process.env.MERCADOPAGO_PUBLIC_KEY || "";

const upload = multer({ storage: multer.memoryStorage() });

declare module 'express-session' {
  interface SessionData {
    googleTokens?: {
      access_token: string;
      refresh_token?: string;
      expiry_date?: number;
    };
    outlookTokens?: {
      access_token: string;
      refresh_token?: string;
      expiry_date?: number;
    };
  }
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

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use(cookieParser());
  app.use(compression()); // Enable Gzip/Brotli compression
  
  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.status(200).json({ status: "ok" });
  });
  
  // Total requests today tracking
  let totalRequestsToday = 0;
  let lastResetDate = new Date().toISOString().split('T')[0];

  // Request tracking for Admin Dashboard
  const requestHistory: number[] = [];
  const MAX_HISTORY_MS = 60 * 60 * 1000; // 1 hour
  
  app.use((req, res, next) => {
    // Skip static files and admin stats itself to avoid noise
    if (!req.url.startsWith('/api') || req.url === '/api/admin/stats') {
      return next();
    }
    
    const now = Date.now();
    requestHistory.push(now);
    
    const today = new Date().toISOString().split('T')[0];
    if (today !== lastResetDate) {
      totalRequestsToday = 0;
      lastResetDate = today;
    }
    totalRequestsToday++;

    // Clean up old history
    while (requestHistory.length > 0 && requestHistory[0] < now - MAX_HISTORY_MS) {
      requestHistory.shift();
    }
    
    next();
  });

  // Active users tracking (in-memory, since max-instances is 1)
  const activeUsers = new Map<string, number>();
  const ACTIVE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

  app.use((req, res, next) => {
    const userId = req.headers['x-user-id'] as string; // We'll send this from frontend
    if (userId) {
      activeUsers.set(userId, Date.now());
    }
    
    // Periodically clean up active users (every 100 requests)
    if (Math.random() < 0.01) {
      const now = Date.now();
      for (const [uid, lastSeen] of activeUsers.entries()) {
        if (lastSeen < now - ACTIVE_TIMEOUT_MS) {
          activeUsers.delete(uid);
        }
      }
    }
    
    next();
  });

  app.get("/api/admin/stats", async (req, res) => {
    const userEmail = req.headers['x-user-email'] as string;
    const adminEmail = "Agusgestro17@gmail.com";

    if (userEmail !== adminEmail) {
      return res.status(403).json({ error: "Unauthorized access to Admin Dashboard" });
    }

    try {
      const now = Date.now();
      const last24h = admin.firestore.Timestamp.fromMillis(now - 24 * 60 * 60 * 1000);

      // 1. Subscription Stats
      const usersSnapshot = await dbAdmin.collection('users').get();
      const stats = {
        total: usersSnapshot.size,
        free: 0,
        mensual: 0,
        trimestral: 0,
        anual: 0,
        activeSubscribers: 0
      };

      usersSnapshot.forEach(doc => {
        const data = doc.data();
        const sub = data.subscription;
        if (sub && sub.status === 'active') {
          stats.activeSubscribers++;
          if (sub.type === 'mensual') stats.mensual++;
          else if (sub.type === 'trimestral') stats.trimestral++;
          else if (sub.type === 'anual') stats.anual++;
        } else {
          stats.free++;
        }
      });

      // 2. Credit Consumption (Last 24h)
      const statsDoc = await dbAdmin.collection('stats').doc('global').get();
      const statsData = statsDoc.data() || {};
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(now - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      const creditsToday = statsData[`credits_${today}`] || 0;
      const creditsYesterday = statsData[`credits_${yesterday}`] || 0;
      const totalCreditsConsumed = creditsToday + creditsYesterday; // Approximate 24h
      const isAiSuspendedForFree = statsData.isAiSuspendedForFree || false;

      // 3. Request History (Bucketed by minute for the last hour)
      const bucketSize = 60 * 1000; // 1 minute
      const buckets: Record<number, number> = {};
      const oneHourAgo = now - MAX_HISTORY_MS;

      // Initialize buckets
      for (let i = 0; i < 60; i++) {
        const bucketTime = Math.floor((oneHourAgo + i * bucketSize) / bucketSize) * bucketSize;
        buckets[bucketTime] = 0;
      }

      requestHistory.forEach(timestamp => {
        const bucketTime = Math.floor(timestamp / bucketSize) * bucketSize;
        if (buckets[bucketTime] !== undefined) {
          buckets[bucketTime]++;
        }
      });

      const requestGraphData = Object.entries(buckets)
        .map(([time, count]) => ({ time: parseInt(time), count }))
        .sort((a, b) => a.time - b.time);

      // Estimated cost calculation ($0.0001 per request as a safe average)
      const estimatedCost = totalRequestsToday * 0.0001;

      res.json({
        activeUsers: activeUsers.size,
        subscriptionStats: stats,
        creditsConsumed24h: totalCreditsConsumed,
        requestGraphData,
        totalRequestsToday,
        estimatedCost,
        isAiSuspendedForFree,
        serverTime: now
      });
    } catch (error: any) {
      console.error("[Admin] Stats error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/verify-key", (req, res) => {
    const { key } = req.body;
    const adminKey = process.env.ADMIN_SECRET_KEY;
    
    if (!adminKey) {
      return res.status(500).json({ error: "ADMIN_SECRET_KEY not configured on server" });
    }
    
    if (key === adminKey) {
      res.json({ success: true });
    } else {
      res.status(401).json({ error: "Invalid Admin Key" });
    }
  });

  app.post("/api/admin/toggle-ai", async (req, res) => {
    const { key, suspend } = req.body;
    const adminKey = process.env.ADMIN_SECRET_KEY;
    
    if (key !== adminKey) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      await dbAdmin.collection('stats').doc('global').set({
        isAiSuspendedForFree: suspend
      }, { merge: true });
      
      res.json({ success: true, isAiSuspendedForFree: suspend });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  
  app.get("/api/admin/list-buckets", async (req, res) => {
    try {
      const storage = admin.storage();
      const gcs = storage.bucket().storage;
      const [buckets] = await gcs.getBuckets();
      res.json({ buckets: buckets.map(b => b.name) });
    } catch (error: any) {
      res.status(500).json({ error: error.message, projectId: admin.apps[0]?.options.projectId });
    }
  });
  
  // Normalize APP_URL
  const rawAppUrl = process.env.APP_URL || "";
  const APP_URL = rawAppUrl.endsWith('/') ? rawAppUrl.slice(0, -1) : rawAppUrl;
  
  console.log(`[Server] Starting with APP_URL: ${APP_URL}`);
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.warn("[Server] Warning: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing from environment variables.");
  }

  app.use(session({
    secret: "study-sanctuary-secret",
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: true, // Required for SameSite=None
      sameSite: 'none', // Required for cross-origin iframe
      httpOnly: true,
    }
  }));


  // Firebase Storage CORS fix
  app.get("/api/admin/fix-cors", async (req, res) => {
    const bucketNames = [
      firebaseConfig.storageBucket,
      `${firebaseConfig.projectId}.firebasestorage.app`,
      `${firebaseConfig.projectId}.appspot.com`,
      firebaseConfig.projectId,
      'ai-studio-applet-webapp-6cc37.firebasestorage.app',
      'ai-studio-applet-webapp-6cc37.appspot.com'
    ].filter(Boolean);

    let lastError = null;
    let successBucket = null;

    for (const bucketName of bucketNames) {
      try {
        console.log(`[Server] Attempting to fix CORS for bucket: ${bucketName}`);
        const bucket = storageAdmin.bucket(bucketName);
        await bucket.setCorsConfiguration([
          {
            maxAgeSeconds: 3600,
            method: ['GET', 'POST', 'PUT', 'DELETE', 'HEAD'],
            origin: ['*'],
            responseHeader: ['Content-Type', 'Authorization', 'x-goog-resumable', 'x-goog-meta-fileid'],
          },
        ]);
        console.log(`[Server] Firebase Storage CORS updated successfully for bucket: ${bucketName}`);
        successBucket = bucketName;
        break;
      } catch (error: any) {
        console.warn(`[Server] Failed to update CORS for bucket ${bucketName}:`, error.message);
        lastError = error;
        if (error.message.includes("does not exist")) continue;
        break;
      }
    }

    if (successBucket) {
      res.json({ status: "CORS updated", bucket: successBucket });
    } else {
      res.status(500).json({ error: lastError?.message || "Failed to update CORS", triedBuckets: bucketNames });
    }
  });

  // Server-side upload proxy (fallback for CORS issues)
  app.post("/api/storage/upload", upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const { path: storagePath } = req.body;
    if (!storagePath) return res.status(400).json({ error: "No storage path provided" });

    // Try multiple bucket name variations if the first one fails
    const bucketNames = [
      firebaseConfig.storageBucket,
      `${firebaseConfig.projectId}.firebasestorage.app`,
      `${firebaseConfig.projectId}.appspot.com`,
      firebaseConfig.projectId,
      'ai-studio-applet-webapp-6cc37.firebasestorage.app',
      'ai-studio-applet-webapp-6cc37.appspot.com'
    ].filter(Boolean);

    let lastError = null;
    for (const bucketName of bucketNames) {
      try {
        console.log(`[Server] Attempting proxy upload to bucket: ${bucketName}`);
        const bucket = storageAdmin.bucket(bucketName);
        const file = bucket.file(storagePath);
        
        await file.save(req.file.buffer, {
          metadata: {
            contentType: req.file.mimetype,
          },
          resumable: false
        });

        try {
          // Try signed URL first
          const [url] = await file.getSignedUrl({
            action: 'read',
            expires: '03-09-2491' // Far future
          });
          console.log(`[Server] Proxy upload success (signed URL) using bucket: ${bucketName}`);
          return res.json({ url });
        } catch (signedUrlError: any) {
          if (signedUrlError.message?.includes('IAM Service Account Credentials API') || signedUrlError.code === 403) {
            console.error(`\n[Server] CRITICAL: IAM Service Account Credentials API is not enabled.`);
            console.error(`[Server] ACTION REQUIRED: Visit this link to enable it: https://console.developers.google.com/apis/api/iamcredentials.googleapis.com/overview?project=${firebaseConfig.projectId}`);
            console.error(`[Server] Fallback: Making file public until API is enabled.\n`);
          }
          console.warn(`[Server] Failed to get signed URL for bucket ${bucketName}, making public instead:`, signedUrlError.message);
          await file.makePublic();
          console.log(`[Server] File made public successfully: ${storagePath}`);
          const publicUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
          console.log(`[Server] Proxy upload success (public URL) using bucket: ${bucketName}`);
          return res.json({ url: publicUrl });
        }
      } catch (error: any) {
        console.warn(`[Server] Failed upload attempt for bucket ${bucketName}:`, error.message);
        lastError = error;
        if (error.message.includes("does not exist")) continue;
        break; // If it's not a "not exist" error, stop trying other buckets
      }
    }

    console.error("[Server] All proxy upload attempts failed:", lastError);
    res.status(500).json({ 
      error: lastError?.message || "All upload attempts failed", 
      triedBuckets: bucketNames 
    });
  });

  // OAuth URL construction
  app.get("/api/auth/google/url", (req, res) => {
    const redirectUri = `${APP_URL}/auth/google/callback`;
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/drive.readonly",
      access_type: "offline",
      prompt: "consent"
    });

    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
    console.log(`[OAuth] Generating Google Auth URL with redirect_uri: ${redirectUri}`);
    res.json({ url: googleAuthUrl });
  });

  app.get("/api/auth/outlook/url", (req, res) => {
    const redirectUri = `${APP_URL}/auth/outlook/callback`;
    const params = new URLSearchParams({
      client_id: process.env.OUTLOOK_CLIENT_ID || "",
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "offline_access Calendars.Read",
      response_mode: "query"
    });

    const outlookAuthUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`;
    res.json({ url: outlookAuthUrl });
  });

  // Sync Firebase Google token to session
  app.post("/api/auth/google/sync", (req, res) => {
    const { accessToken } = req.body;
    if (!accessToken) return res.status(400).json({ error: "No access token provided" });
    
    req.session.googleTokens = {
      access_token: accessToken,
      expiry_date: Date.now() + 3600 * 1000 // Assume 1 hour for Firebase tokens
    };
    
    res.json({ status: "ok" });
  });

  // OAuth Callback
  app.get("/auth/google/callback", async (req, res) => {
    const { code } = req.query;
    
    if (!code) return res.status(400).send("No code provided");

    try {
      const response = await axios.post("https://oauth2.googleapis.com/token", {
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${APP_URL}/auth/google/callback`,
        grant_type: "authorization_code"
      });

      req.session.googleTokens = response.data;
      console.log("[OAuth] Google tokens received and stored in session");
      
      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', provider: 'google' }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Authentication successful. This window should close automatically.</p>
          </body>
        </html>
      `);
    } catch (error: any) {
      console.error("Google OAuth error:", error.response?.data || error.message);
      res.status(500).send("Authentication failed");
    }
  });

  app.get("/auth/outlook/callback", async (req, res) => {
    const { code } = req.query;
    
    if (!code) return res.status(400).send("No code provided");

    try {
      const response = await axios.post("https://login.microsoftonline.com/common/oauth2/v2.0/token", new URLSearchParams({
        code: code as string,
        client_id: process.env.OUTLOOK_CLIENT_ID || "",
        client_secret: process.env.OUTLOOK_CLIENT_SECRET || "",
        redirect_uri: `${APP_URL}/auth/outlook/callback`,
        grant_type: "authorization_code"
      }).toString(), {
        headers: { "Content-Type": "application/x-www-form-urlencoded" }
      });

      req.session.outlookTokens = response.data;
      
      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', provider: 'outlook' }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Authentication successful. This window should close automatically.</p>
          </body>
        </html>
      `);
    } catch (error: any) {
      console.error("Outlook OAuth error:", error.response?.data || error.message);
      res.status(500).send("Authentication failed");
    }
  });

  // Sync endpoint
  app.get("/api/calendar/sync", async (req, res) => {
    const exams: any[] = [];

    // Fetch from Google if connected
    if (req.session.googleTokens?.access_token) {
      try {
        const response = await axios.get("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
          headers: { Authorization: `Bearer ${req.session.googleTokens.access_token}` },
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
      } catch (error: any) {
        console.error("Google Sync error:", error.response?.data || error.message);
      }
    }

    // Fetch from Outlook if connected
    if (req.session.outlookTokens?.access_token) {
      try {
        const response = await axios.get("https://graph.microsoft.com/v1.0/me/events", {
          headers: { Authorization: `Bearer ${req.session.outlookTokens.access_token}` },
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
      } catch (error: any) {
        console.error("Outlook Sync error:", error.response?.data || error.message);
      }
    }

    if (exams.length === 0 && !req.session.googleTokens && !req.session.outlookTokens) {
      return res.status(401).json({ error: "No calendar connected" });
    }

    res.json({ exams });
  });
  
  // Google Drive endpoints
  app.get("/api/drive/files", async (req, res) => {
    if (!req.session.googleTokens?.access_token) {
      return res.status(401).json({ error: "Google not connected" });
    }

    try {
      const response = await axios.get("https://www.googleapis.com/drive/v3/files", {
        headers: { Authorization: `Bearer ${req.session.googleTokens.access_token}` },
        params: {
          pageSize: 20,
          fields: "files(id, name, mimeType, iconLink, webViewLink, size)",
          q: "trashed = false"
        }
      });

      res.json({ files: response.data.files });
    } catch (error: any) {
      console.error("Google Drive list error:", error.response?.data || error.message);
      res.status(500).json({ error: "Failed to list files" });
    }
  });

  app.get("/api/drive/download/:fileId", async (req, res) => {
    if (!req.session.googleTokens?.access_token) {
      return res.status(401).json({ error: "Google not connected" });
    }

    const { fileId } = req.params;

    try {
      // Get file metadata first to check mimeType
      const metadata = await axios.get(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
        headers: { Authorization: `Bearer ${req.session.googleTokens.access_token}` },
        params: { fields: "name, mimeType" }
      });

      // If it's a Google Doc, we need to export it
      if (metadata.data.mimeType.startsWith('application/vnd.google-apps.')) {
        const exportMimeType = metadata.data.mimeType === 'application/vnd.google-apps.spreadsheet' 
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'application/pdf';
          
        const response = await axios.get(`https://www.googleapis.com/drive/v3/files/${fileId}/export`, {
          headers: { Authorization: `Bearer ${req.session.googleTokens.access_token}` },
          params: { mimeType: exportMimeType },
          responseType: 'arraybuffer'
        });
        
        res.setHeader('Content-Type', exportMimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${metadata.data.name}.pdf"`);
        return res.send(response.data);
      }

      // Otherwise, download directly
      const response = await axios.get(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
        headers: { Authorization: `Bearer ${req.session.googleTokens.access_token}` },
        params: { alt: 'media' },
        responseType: 'arraybuffer'
      });

      res.setHeader('Content-Type', metadata.data.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${metadata.data.name}"`);
      res.send(response.data);
    } catch (error: any) {
      console.error("Google Drive download error:", error.response?.data || error.message);
      res.status(500).json({ error: "Failed to download file" });
    }
  });

  app.post("/api/drive/upload", upload.single('file'), async (req, res) => {
    if (!req.session.googleTokens?.access_token) {
      return res.status(401).json({ error: "Google not connected" });
    }

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

      const response = await axios.post("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", body, {
        headers: {
          Authorization: `Bearer ${req.session.googleTokens.access_token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
          'Content-Length': body.length
        }
      });

      res.json({ status: "ok", fileId: response.data.id });
    } catch (error: any) {
      console.error("Google Drive upload error:", error.response?.data || error.message);
      res.status(500).json({ error: "Failed to upload file" });
    }
  });

  app.get('/success', (req, res) => {
    res.redirect('/?view=success');
  });

  // Mercado Pago Integration
  app.post("/api/create-preference", async (req, res) => {
    const { planId, userId, userEmail } = req.body;
    
    if (!userId || !planId) {
      return res.status(400).json({ error: "Faltan parámetros: userId o planId" });
    }

    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    const publicKey = process.env.MERCADOPAGO_PUBLIC_KEY;

    if (!accessToken) {
      return res.status(500).json({ error: "Token de acceso de Mercado Pago no configurado" });
    }

    const mpClient = new MercadoPagoConfig({ accessToken });

    const plans: Record<string, { title: string, price: number, duration: number }> = {
      'mensual': { title: 'Plan Mensual - Study Sanctuary', price: 1200, duration: 30 },
      'trimestral': { title: 'Plan Trimestral - Study Sanctuary', price: 4200, duration: 90 },
      'anual': { title: 'Plan Anual - Study Sanctuary', price: 12000, duration: 365 }
    };

    const plan = plans[planId];
    if (!plan) return res.status(400).json({ error: "Invalid planId" });

    try {
      const preference = new Preference(mpClient);
      const result = await preference.create({
        body: {
          items: [
            {
              id: planId,
              title: plan.title,
              quantity: 1,
              unit_price: plan.price,
              currency_id: 'ARS'
            }
          ],
          payer: {
            email: userEmail
          },
          back_urls: {
            success: `https://studysanctuary.net/success`,
            failure: `https://studysanctuary.net/pricing`,
            pending: `https://studysanctuary.net/pricing`
          },
          auto_return: 'approved',
          notification_url: `${APP_URL}/api/mercadopago-webhook`,
          external_reference: userId,
          metadata: {
            userId,
            planId,
            duration: plan.duration
          }
        }
      });

      if (!result.init_point) {
        throw new Error("No se recibió el link de pago (init_point) de Mercado Pago");
      }

      res.json({ id: result.id, init_point: result.init_point });
    } catch (error: any) {
      console.error("Mercado Pago Preference Error:", error);
      const errorMessage = error.message || "Error desconocido al crear la preferencia";
      res.status(500).json({ error: `Error de Mercado Pago: ${errorMessage}` });
    }
  });

  app.post("/api/mercadopago-webhook", async (req, res) => {
    const { type, data } = req.body;
    
    console.log(`[Webhook] Received Mercado Pago notification: ${type}`);

    if (type === 'payment') {
      const paymentId = data.id;
      try {
        const response = await axios.get(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
          headers: { Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}` }
        });

        const payment = response.data;
        if (payment.status === 'approved') {
          const userId = payment.external_reference || payment.metadata?.user_id;
          const planId = payment.metadata?.plan_id;
          const duration = payment.metadata?.duration || 30;

          if (userId && planId) {
            console.log(`[Webhook] Updating subscription for user ${userId} (Plan: ${planId})`);
            
            const userRef = dbAdmin.collection('users').doc(userId);
            const now = admin.firestore.Timestamp.now();
            const endDate = admin.firestore.Timestamp.fromMillis(now.toMillis() + duration * 24 * 60 * 60 * 1000);

            // Map planId to credits and display name
            const planDetails: Record<string, { credits: number, name: string }> = {
              'mensual': { credits: 300, name: 'Plan Mensual' },
              'trimestral': { credits: 1000, name: 'Plan Trimestral' },
              'anual': { credits: 5000, name: 'Plan Anual' }
            };

            const details = planDetails[planId] || { credits: 0, name: 'Gratis' };

            await userRef.set({
              remainingCredits: details.credits,
              subscriptionType: details.name,
              subscription: {
                status: 'active',
                type: planId,
                planName: details.name,
                subscriptionEndDate: endDate,
                lastPaymentId: paymentId,
                updatedAt: now
              }
            }, { merge: true });
            
            console.log(`[Webhook] Subscription and credits updated successfully for ${userId}`);
          }
        }
      } catch (error: any) {
        console.error("Webhook Error processing payment:", error.response?.data || error.message);
      }
    }

    res.status(200).send("OK");
  });

  // Aggressive caching for public assets (textures, icons, etc.)
  app.use('/assets', express.static(path.join(process.cwd(), 'public/assets'), {
    maxAge: '1y',
    immutable: true,
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }));

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const viteModule = "vite";
    const { createServer: createViteServer } = await import(viteModule);
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        headers: {
          'Cache-Control': 'public, max-age=31536000, immutable'
        }
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    // Aggressive caching for production assets (JS, CSS, Images)
    app.use(express.static(distPath, {
      maxAge: '1y',
      immutable: true,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
        } else if (filePath.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2)$/)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      }
    }));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", async () => {
    console.log(`Server running on http://localhost:${PORT}`);
    
    // Log default bucket name
    try {
      const defaultBucket = storageAdmin.bucket();
      console.log("[Server] Default bucket name according to Firebase Admin:", defaultBucket.name);
    } catch (e: any) {
      console.error("[Server] Failed to get default bucket:", e.message);
    }

    // Attempt to fix CORS on startup using multiple bucket variations
    const bucketNames = [
      firebaseConfig.storageBucket,
      `${firebaseConfig.projectId}.appspot.com`,
      firebaseConfig.projectId
    ].filter(Boolean);

    for (const bucketName of bucketNames) {
      try {
        console.log(`[Server] Startup: Attempting to fix CORS for bucket: ${bucketName}`);
        const bucket = storageAdmin.bucket(bucketName);
        await bucket.setCorsConfiguration([
          {
            maxAgeSeconds: 3600,
            method: ['GET', 'POST', 'PUT', 'DELETE', 'HEAD'],
            origin: ['*'],
            responseHeader: ['Content-Type', 'Authorization', 'x-goog-resumable', 'x-goog-meta-fileid'],
          },
        ]);
        console.log(`[Server] Startup: Firebase Storage CORS configuration updated for bucket: ${bucketName}`);
        break; // Success!
      } catch (error: any) {
        if (error.message.includes("does not have storage.buckets.update access") || error.message.includes("Permission 'storage.buckets.update' denied")) {
          console.warn(`[Server] Startup: Permission denied to update CORS for bucket ${bucketName}. This is expected in some environments. Proxy upload will be used as fallback.`);
          break; // Stop trying if it's a permission issue
        }
        console.warn(`[Server] Startup: Failed to update CORS for bucket ${bucketName}:`, error.message);
        if (error.message.includes("does not exist")) continue;
        break; // Stop if it's a different kind of error
      }
    }
  });
}

startServer();
