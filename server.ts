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
import compression from "compression";
import "dotenv/config";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { MercadoPagoConfig, Preference } from 'mercadopago';
import { loadServerConfig, ConfigError, type ServerConfig } from "./server/config";
import { GoogleGenAI } from "@google/genai";
import { FieldValue } from "firebase-admin/firestore";
import { createAiRouter } from "./server/ai/aiRouter";
import { createFakeGenAI } from "./server/ai/fakeGenAI";
import { createCreditService } from "./server/credits/creditService";
import { createCreditsRouter } from "./server/routes/credits";
import { createAdminRouter } from "./server/routes/admin";
import { createStorageUploadRouter } from "./server/routes/storageUpload";
import { createOAuthRouter } from "./server/routes/oauth";
import { createIntegrationsRouter } from "./server/routes/integrations";
import { InMemoryTokenStore } from "./server/integrations/tokenStore";
import { createRateLimiter, ipKey } from "./server/security/rateLimit";
import { securityHeaders, apiErrorHandler, logError } from "./server/security/http";
import { cspReportOnly, createCspReportRouter } from "./server/security/csp";
import type { OAuthStateStore } from "./server/security/oauthState";

// Load configuration from environment variables (see .env.example)
let serverConfig: ServerConfig;
try {
  serverConfig = loadServerConfig(process.env);
} catch (error) {
  if (error instanceof ConfigError) {
    console.error(`[Server] ${error.message}`);
    process.exit(1);
  }
  throw error;
}
if (serverConfig.session.ephemeral) {
  console.warn("[Server] SESSION_SECRET no definida: usando un secreto aleatorio temporal (solo desarrollo). Las sesiones se invalidan en cada reinicio.");
}

// Initialize Firebase Admin
if (!admin.apps.length) {
  try {
    // Try initializing with config first
    admin.initializeApp({
      projectId: serverConfig.firebase.projectId,
      storageBucket: serverConfig.firebase.storageBucket
    });
    console.log(`[Server] Firebase Admin initialized with project: ${serverConfig.firebase.projectId}`);
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
// Without FIREBASE_DATABASE_ID the Admin SDK keeps using the "(default)" database (previous behavior).
const dbAdmin = serverConfig.firebase.databaseId
  ? getFirestore(admin.app(), serverConfig.firebase.databaseId)
  : admin.firestore();
const storageAdmin = admin.storage();

// Initialize Mercado Pago
const MP_PUBLIC_KEY = process.env.MERCADOPAGO_PUBLIC_KEY || "";

declare module 'express-session' {
  interface SessionData {
    // Only the short-lived OAuth state lives in the session; provider tokens are kept per uid.
    oauthState?: OAuthStateStore;
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;
  const verifyIdToken = (token: string) => admin.auth().verifyIdToken(token);
  const authOptions = { verifyIdToken, adminEmails: serverConfig.admin.emails };
  const SESSION_COOKIE_NAME = "connect.sid";
  const integrationTokens = new InMemoryTokenStore(serverConfig.session.maxAgeMs);

  app.disable("x-powered-by");
  if (serverConfig.trustProxy > 0) {
    // Cloud Run terminates TLS in front of the container: needed for secure cookies and req.ip.
    app.set("trust proxy", serverConfig.trustProxy);
  }
  app.use(securityHeaders(serverConfig.isProduction));
  if (serverConfig.csp.mode === "report-only") {
    app.use(cspReportOnly({ firebaseAuthDomain: serverConfig.csp.firebaseAuthDomain }));
    app.use("/api/csp-report", createCspReportRouter());
  }
  app.use(compression()); // Enable Gzip/Brotli compression

  // General API rate limit per IP (the Mercado Pago webhook is excluded so retries are never dropped).
  app.use("/api", createRateLimiter({
    windowMs: 60 * 1000,
    max: serverConfig.rateLimit.apiPerMinute,
    key: (req) => (req.path === "/mercadopago-webhook" ? null : ipKey(req)),
  }));

  // Credits and AI (Phase 4). The server is the authority: credits are charged in the
  // database configured by FIREBASE_DATABASE_ID (must be the one the app reads).
  const creditService = createCreditService(dbAdmin);

  let suspensionCache = { value: false, expiresAt: 0 };
  const isAiSuspendedForFree = async () => {
    if (Date.now() < suspensionCache.expiresAt) return suspensionCache.value;
    try {
      const snap = await dbAdmin.collection("stats").doc("global").get();
      suspensionCache = { value: snap.data()?.isAiSuspendedForFree === true, expiresAt: Date.now() + 30_000 };
    } catch (error) {
      logError("AI kill switch read", error);
    }
    return suspensionCache.value;
  };

  // Mounted before the global JSON parser because it needs a larger body limit (files in base64).
  app.use("/api/ai", createAiRouter({
    enabled: serverConfig.ai.proxyEnabled,
    auth: authOptions,
    credits: creditService,
    createClient: () => serverConfig.ai.provider === "fake"
      ? createFakeGenAI()
      : new GoogleGenAI({ apiKey: serverConfig.ai.geminiApiKey! }),
    isAiSuspendedForFree,
    recordUsage: (feature, billed) => {
      const today = new Date().toISOString().split("T")[0];
      dbAdmin.collection("stats").doc("global").set({
        [`aiCalls_${today}`]: FieldValue.increment(1),
        ...(billed ? { [`credits_${today}`]: FieldValue.increment(1), totalCreditsConsumed: FieldValue.increment(1) } : {}),
      }, { merge: true }).catch((error) => logError("AI usage stats", error));
    },
    limits: {
      perMinute: serverConfig.ai.perMinute,
      maxConcurrent: serverConfig.ai.maxConcurrent,
      includedDailyQuota: serverConfig.ai.includedDailyQuota,
      maxAttempts: serverConfig.ai.maxAttempts,
      timeoutMs: serverConfig.ai.timeoutMs,
      bodyLimit: "15mb",
    },
  }));
  if (serverConfig.ai.proxyEnabled) {
    console.log(`[Server] AI proxy enabled (provider: ${serverConfig.ai.provider}).`);
  }

  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());

  app.use("/api/credits", createCreditsRouter({ auth: authOptions, credits: creditService }));
  
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

  // Admin API (Firebase ID token + admin claim or verified email in ADMIN_EMAILS)
  app.use("/api/admin", createAdminRouter({
    auth: authOptions,
    adminSecretKey: serverConfig.admin.secretKey,
    db: dbAdmin as any,
    getRuntimeStats: () => ({
      activeUsers: activeUsers.size,
      requestHistory,
      totalRequestsToday,
      historyWindowMs: MAX_HISTORY_MS,
    }),
  }));

  const APP_URL = serverConfig.appUrl;
  
  console.log(`[Server] Starting with APP_URL: ${APP_URL}`);
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.warn("[Server] Warning: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing from environment variables.");
  }

  app.use(session({
    name: SESSION_COOKIE_NAME,
    secret: serverConfig.session.secret,
    resave: false,
    saveUninitialized: false, // Sessions only hold the short-lived OAuth state
    cookie: {
      secure: serverConfig.session.cookieSecure, // HTTPS only in production (required for SameSite=None)
      sameSite: serverConfig.session.cookieSameSite, // "none" only needed for cross-site iframes
      httpOnly: true,
      maxAge: serverConfig.session.maxAgeMs,
    }
  }));


  // Server-side upload proxy (fallback for CORS issues): authenticated, users/<uid>/ only, size-limited
  app.use("/api/storage/upload", createStorageUploadRouter({
    auth: authOptions,
    maxBytes: serverConfig.uploads.maxBytes,
    bucketNames: [
      serverConfig.firebase.storageBucket,
      `${serverConfig.firebase.projectId}.firebasestorage.app`,
      `${serverConfig.firebase.projectId}.appspot.com`,
      serverConfig.firebase.projectId,
      'ai-studio-applet-webapp-6cc37.firebasestorage.app',
      'ai-studio-applet-webapp-6cc37.appspot.com'
    ].filter(Boolean) as string[],
    getBucket: (name) => storageAdmin.bucket(name),
  }));

  // OAuth (Google/Outlook) with single-use state, session sync and logout
  app.use(createOAuthRouter({
    auth: authOptions,
    tokens: integrationTokens,
    appUrl: APP_URL,
    google: { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET },
    outlook: { clientId: process.env.OUTLOOK_CLIENT_ID, clientSecret: process.env.OUTLOOK_CLIENT_SECRET },
    sessionCookie: {
      name: SESSION_COOKIE_NAME,
      secure: serverConfig.session.cookieSecure,
      sameSite: serverConfig.session.cookieSameSite,
    },
  }));

  // Google Calendar / Drive and Outlook Calendar (ID token required; tokens bound to the uid)
  app.use(createIntegrationsRouter({
    auth: authOptions,
    tokens: integrationTokens,
    appUrl: APP_URL,
    maxUploadBytes: serverConfig.uploads.maxBytes,
  }));

  app.get('/success', (req, res) => {
    res.redirect('/?view=success');
  });

  // Mercado Pago Integration
  const preferenceLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 10, key: ipKey });

  app.post("/api/create-preference", preferenceLimiter, async (req, res) => {
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
      logError("Mercado Pago preference", error);
      res.status(500).json({ error: "Error de Mercado Pago: no se pudo crear la preferencia de pago." });
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

  // JSON errors for the API (no stack traces or internal messages)
  app.use("/api", apiErrorHandler);

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

    // Rewriting the bucket CORS policy (origin "*") is opt-in: STORAGE_CORS_ON_STARTUP=true
    if (!serverConfig.storage.corsOnStartup) return;

    // Attempt to fix CORS on startup using multiple bucket variations
    const bucketNames = [
      serverConfig.firebase.storageBucket,
      `${serverConfig.firebase.projectId}.appspot.com`,
      serverConfig.firebase.projectId
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
