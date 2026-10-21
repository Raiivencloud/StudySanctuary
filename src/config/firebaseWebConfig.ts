/**
 * Configuración web de Firebase leída desde variables de entorno VITE_*.
 *
 * Estos valores son PÚBLICOS por diseño (terminan en el bundle del navegador).
 * La seguridad de los datos depende de las reglas de Firestore/Storage y de las
 * restricciones de la API key en Google Cloud, no de ocultar estos valores.
 * Nunca agregues aquí secretos de servidor.
 */

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  appId: string;
  messagingSenderId?: string;
  measurementId?: string;
  firestoreDatabaseId: string;
}

export const REQUIRED_FIREBASE_WEB_ENV = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_APP_ID',
] as const;

export const DEFAULT_FIRESTORE_DATABASE_ID = '(default)';

type Env = Record<string, string | boolean | undefined>;

export class MissingConfigError extends Error {
  readonly missing: string[];

  constructor(missing: string[]) {
    super(
      `Configuración de Firebase incompleta. Faltan las variables de entorno: ${missing.join(', ')}. ` +
      'Definilas en .env (ver .env.example y docs/CONFIGURATION.md) y volvé a compilar.'
    );
    this.name = 'MissingConfigError';
    this.missing = missing;
  }
}

const read = (env: Env, key: string): string => {
  const value = env[key];
  return typeof value === 'string' ? value.trim() : '';
};

export function getMissingFirebaseWebEnv(env: Env): string[] {
  return REQUIRED_FIREBASE_WEB_ENV.filter((key) => !read(env, key));
}

export function readFirebaseWebConfig(env: Env): FirebaseWebConfig {
  const missing = getMissingFirebaseWebEnv(env);
  if (missing.length > 0) {
    throw new MissingConfigError(missing);
  }

  return {
    apiKey: read(env, 'VITE_FIREBASE_API_KEY'),
    authDomain: read(env, 'VITE_FIREBASE_AUTH_DOMAIN'),
    projectId: read(env, 'VITE_FIREBASE_PROJECT_ID'),
    storageBucket: read(env, 'VITE_FIREBASE_STORAGE_BUCKET'),
    appId: read(env, 'VITE_FIREBASE_APP_ID'),
    messagingSenderId: read(env, 'VITE_FIREBASE_MESSAGING_SENDER_ID') || undefined,
    measurementId: read(env, 'VITE_FIREBASE_MEASUREMENT_ID') || undefined,
    firestoreDatabaseId: read(env, 'VITE_FIREBASE_FIRESTORE_DATABASE_ID') || DEFAULT_FIRESTORE_DATABASE_ID,
  };
}
