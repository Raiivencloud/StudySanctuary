/** Pure helpers for scripts/ops/storage-buckets.ts (unit-tested). */

export function proposedCors(origins: string[]) {
  return [{
    origin: origins,
    method: ["GET", "POST", "PUT", "DELETE", "HEAD"],
    responseHeader: ["Content-Type", "Authorization", "x-goog-resumable", "x-goog-meta-fileid"],
    maxAgeSeconds: 3600,
  }];
}

export function validateOrigins(origins: string[]): string[] {
  const invalid = origins.filter((origin) => {
    try {
      const url = new URL(origin);
      return origin === "*" || url.origin !== origin || (url.protocol !== "https:" && url.hostname !== "localhost");
    } catch {
      return true;
    }
  });
  return invalid;
}
