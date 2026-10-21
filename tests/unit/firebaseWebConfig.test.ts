import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readFirebaseWebConfig,
  getMissingFirebaseWebEnv,
  MissingConfigError,
  REQUIRED_FIREBASE_WEB_ENV,
} from "../../src/config/firebaseWebConfig";

const completeEnv = {
  VITE_FIREBASE_API_KEY: "public-web-key",
  VITE_FIREBASE_AUTH_DOMAIN: "demo.firebaseapp.com",
  VITE_FIREBASE_PROJECT_ID: "demo-project",
  VITE_FIREBASE_STORAGE_BUCKET: "demo-project.appspot.com",
  VITE_FIREBASE_APP_ID: "1:123:web:abc",
};

test("empty env reports every required variable as missing", () => {
  assert.deepEqual(getMissingFirebaseWebEnv({}), [...REQUIRED_FIREBASE_WEB_ENV]);
});

test("missing config throws a MissingConfigError naming the variables", () => {
  const env = { ...completeEnv, VITE_FIREBASE_API_KEY: "", VITE_FIREBASE_APP_ID: "   " };
  assert.throws(() => readFirebaseWebConfig(env), (error: unknown) => {
    assert.ok(error instanceof MissingConfigError);
    assert.deepEqual(error.missing, ["VITE_FIREBASE_API_KEY", "VITE_FIREBASE_APP_ID"]);
    assert.match(error.message, /VITE_FIREBASE_API_KEY, VITE_FIREBASE_APP_ID/);
    assert.match(error.message, /\.env\.example/);
    return true;
  });
});

test("complete config is mapped and the Firestore database defaults to (default)", () => {
  const config = readFirebaseWebConfig(completeEnv);
  assert.equal(config.projectId, "demo-project");
  assert.equal(config.storageBucket, "demo-project.appspot.com");
  assert.equal(config.firestoreDatabaseId, "(default)");
  assert.equal(config.messagingSenderId, undefined);
});

test("named Firestore database is respected", () => {
  const config = readFirebaseWebConfig({ ...completeEnv, VITE_FIREBASE_FIRESTORE_DATABASE_ID: "named-db" });
  assert.equal(config.firestoreDatabaseId, "named-db");
});
