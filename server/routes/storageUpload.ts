/**
 * Server-side upload proxy (used first by the client because of past CORS issues).
 * Requires a Firebase ID token and only writes inside users/<uid>/.
 */
import { Router, type RequestHandler } from "express";
import multer from "multer";
import { requireUser, getUser, type AuthOptions } from "../security/auth";
import { createRateLimiter } from "../security/rateLimit";
import { logError } from "../security/http";
import { validateUserStoragePath, createDownloadToken, buildFirebaseDownloadUrl } from "../security/storagePaths";

/** Subset of the Cloud Storage API used here (allows fakes in tests). */
export interface BucketLike {
  name: string;
  file(path: string): {
    save(data: Buffer, options: Record<string, unknown>): Promise<unknown>;
  };
}

export interface StorageUploadOptions {
  auth: AuthOptions;
  maxBytes: number;
  /** Candidate bucket names, tried in order (a missing bucket moves to the next one). */
  bucketNames: string[];
  getBucket: (name: string) => BucketLike;
}

export function createUploadMiddleware(maxBytes: number): RequestHandler {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1, fields: 5, fieldSize: 4096 },
  }).single("file");
}

export function createStorageUploadRouter(options: StorageUploadOptions): Router {
  const router = Router();

  const uploadLimiter = createRateLimiter({
    windowMs: 10 * 60 * 1000,
    max: 60,
    key: (_req, res) => `upload:${getUser(res).uid}`,
  });

  // Authentication runs before multer so anonymous requests are never buffered in memory.
  router.post("/", requireUser(options.auth), uploadLimiter, createUploadMiddleware(options.maxBytes), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const { uid } = getUser(res);
    const storagePath = validateUserStoragePath(uid, req.body?.path);
    if (!storagePath) {
      return res.status(403).json({ error: "INVALID_STORAGE_PATH" });
    }

    let lastError: unknown = null;
    for (const bucketName of options.bucketNames) {
      try {
        const bucket = options.getBucket(bucketName);
        const token = createDownloadToken();

        await bucket.file(storagePath).save(req.file.buffer, {
          metadata: {
            contentType: req.file.mimetype,
            metadata: { firebaseStorageDownloadTokens: token },
          },
          resumable: false,
        });

        return res.json({ url: buildFirebaseDownloadUrl(bucket.name, storagePath, token) });
      } catch (error: any) {
        lastError = error;
        if (String(error?.message || "").includes("does not exist")) continue;
        break; // If it's not a "not exist" error, stop trying other buckets
      }
    }

    logError(`Storage upload uid=${uid}`, lastError);
    res.status(500).json({ error: "UPLOAD_FAILED" });
  });

  return router;
}
