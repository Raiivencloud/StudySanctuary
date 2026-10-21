import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createStorageUploadRouter, type BucketLike } from "../../server/routes/storageUpload";
import { validateUserStoragePath, buildFirebaseDownloadUrl } from "../../server/security/storagePaths";
import { apiErrorHandler } from "../../server/security/http";
import { withApp, fakeVerifyIdToken } from "../helpers/http";

interface Saved { bucket: string; path: string; size: number; options: any }

function buildApp({ maxBytes = 1024, missingBuckets = [] as string[], failWith = "" } = {}) {
  const saved: Saved[] = [];
  const getBucket = (name: string): BucketLike & Record<string, unknown> => ({
    name,
    file: (path: string) => ({
      save: async (data: Buffer, options: any) => {
        if (missingBuckets.includes(name)) throw new Error(`The specified bucket ${name} does not exist.`);
        if (failWith) throw new Error(failWith);
        saved.push({ bucket: name, path, size: data.length, options });
      },
      // Present so a regression that calls them would be noticed by the assertions below.
      makePublic: async () => { throw new Error("makePublic must not be called"); },
      getSignedUrl: async () => { throw new Error("getSignedUrl must not be called"); },
    }),
  });

  const app = express();
  app.use("/api/storage/upload", createStorageUploadRouter({
    auth: { verifyIdToken: fakeVerifyIdToken },
    maxBytes,
    bucketNames: ["primary-bucket", "fallback-bucket"],
    getBucket,
  }));
  app.use("/api", apiErrorHandler);
  return { app, saved };
}

function upload(base: string, { token, path, size = 10 }: { token?: string; path?: string; size?: number }) {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(size)], { type: "application/pdf" }), "doc.pdf");
  if (path !== undefined) form.append("path", path);
  return fetch(`${base}/api/storage/upload`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
}

test("validateUserStoragePath only allows the caller's folder", () => {
  assert.equal(validateUserStoragePath("u1", "users/u1/courses/c1/f_doc.pdf"), "users/u1/courses/c1/f_doc.pdf");
  assert.equal(validateUserStoragePath("u1", "users/u1/files/a.pdf"), "users/u1/files/a.pdf");
  for (const bad of [
    "users/u2/files/a.pdf",
    "users/u1",
    "users/u1/",
    "users/u1x/files/a.pdf",
    "users/u1/../u2/a.pdf",
    "users/u1/./a.pdf",
    "users/u1//a.pdf",
    "users/u1/a\\b.pdf",
    "users/u1/a\u0000.pdf",
    "public/a.pdf",
    "users/u1/" + "a".repeat(1100),
    undefined,
    42,
  ]) {
    assert.equal(validateUserStoragePath("u1", bad), null, String(bad));
  }
  assert.equal(validateUserStoragePath("", "users//a.pdf"), null);
});

test("buildFirebaseDownloadUrl encodes the object path", () => {
  assert.equal(
    buildFirebaseDownloadUrl("b", "users/u1/files/a b.pdf", "tok"),
    "https://firebasestorage.googleapis.com/v0/b/b/o/users%2Fu1%2Ffiles%2Fa%20b.pdf?alt=media&token=tok"
  );
});

test("rejects anonymous uploads before storing anything", async () => {
  const { app, saved } = buildApp();
  await withApp(app, async (base) => {
    assert.equal((await upload(base, { path: "users/user-1/files/a.pdf" })).status, 401);
    assert.equal((await upload(base, { token: "forged", path: "users/user-1/files/a.pdf" })).status, 401);
    assert.equal(saved.length, 0);
  });
});

test("rejects writing into another user's folder or traversal paths", async () => {
  const { app, saved } = buildApp();
  await withApp(app, async (base) => {
    for (const path of ["users/user-2/files/a.pdf", "users/user-1/../user-2/a.pdf", "a.pdf"]) {
      const res = await upload(base, { token: "token-user", path });
      assert.equal(res.status, 403, path);
    }
    assert.equal((await upload(base, { token: "token-user" })).status, 403);
    assert.equal(saved.length, 0);
  });
});

test("rejects files above the size limit with 413", async () => {
  const { app, saved } = buildApp({ maxBytes: 100 });
  await withApp(app, async (base) => {
    const res = await upload(base, { token: "token-user", path: "users/user-1/files/a.pdf", size: 101 });
    assert.equal(res.status, 413);
    assert.deepEqual(await res.json(), { error: "FILE_TOO_LARGE" });
    assert.equal(saved.length, 0);
  });
});

test("stores in the user's folder and returns a tokenized Firebase URL (never public/signed)", async () => {
  const { app, saved } = buildApp();
  await withApp(app, async (base) => {
    const res = await upload(base, { token: "token-user", path: "users/user-1/courses/c1/f1_doc.pdf" });
    assert.equal(res.status, 200);
    const { url } = await res.json();

    assert.equal(saved.length, 1);
    const token = saved[0].options.metadata.metadata.firebaseStorageDownloadTokens;
    assert.match(token, /^[0-9a-f-]{36}$/);
    assert.equal(saved[0].options.metadata.contentType, "application/pdf");
    assert.equal(url, `https://firebasestorage.googleapis.com/v0/b/primary-bucket/o/users%2Fuser-1%2Fcourses%2Fc1%2Ff1_doc.pdf?alt=media&token=${token}`);
  });
});

test("falls back to the next bucket only when a bucket does not exist", async () => {
  const { app, saved } = buildApp({ missingBuckets: ["primary-bucket"] });
  await withApp(app, async (base) => {
    const res = await upload(base, { token: "token-user", path: "users/user-1/files/a.pdf" });
    assert.equal(res.status, 200);
    assert.equal(saved[0].bucket, "fallback-bucket");
  });
});

test("storage errors return a generic message without bucket names", async () => {
  const { app } = buildApp({ failWith: "Permission denied on bucket primary-bucket for sa@project.iam" });
  await withApp(app, async (base) => {
    const res = await upload(base, { token: "token-user", path: "users/user-1/files/a.pdf" });
    assert.equal(res.status, 500);
    const text = await res.text();
    assert.equal(text, JSON.stringify({ error: "UPLOAD_FAILED" }));
  });
});
