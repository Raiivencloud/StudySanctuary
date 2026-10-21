/**
 * Storage path validation and Firebase download URL construction for the upload proxy.
 */
import crypto from "crypto";

const MAX_PATH_LENGTH = 1024;

/**
 * Returns the path if it is a safe object path inside `users/<uid>/`, otherwise null.
 * Matches the layout used by the client and storage.rules (users/{userId}/...).
 */
export function validateUserStoragePath(uid: string, requested: unknown): string | null {
  if (typeof requested !== "string" || !uid) return null;
  const path = requested.trim();
  const prefix = `users/${uid}/`;

  if (path.length > MAX_PATH_LENGTH || !path.startsWith(prefix) || path.length === prefix.length) return null;
  if (path.includes("\\") || path.includes("//") || /[\u0000-\u001f\u007f]/.test(path)) return null;
  if (path.split("/").some((segment) => segment === ".." || segment === ".")) return null;
  return path;
}

export function createDownloadToken(): string {
  return crypto.randomUUID();
}

/**
 * Same URL format produced by the Firebase SDK's getDownloadURL(): access requires the
 * random token; the object itself is not made public and no IAM signing is needed.
 */
export function buildFirebaseDownloadUrl(bucket: string, objectPath: string, token: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(objectPath)}?alt=media&token=${token}`;
}
