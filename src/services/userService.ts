import { db } from '../firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { checkRateLimit } from '../lib/rateLimit';
import { authFetch } from '../lib/authFetch';

/**
 * Credits (Phase 4): the server is the only authority. The browser reads the balance from
 * /api/credits (which applies the daily refill and plan expiration on the server) and never
 * writes credits, plans or the free trial. AI actions are charged by /api/ai/generate.
 */

const CREDITS_CACHE_MS = 30 * 1000;

interface CreditsResponse {
  credits: number;
  subscriptionStatus: string;
}

const cacheBalance = (userId: string, credits: number, subscriptionStatus?: string) => {
  localStorage.setItem(`user_credits_${userId}`, JSON.stringify({ credits, timestamp: Date.now() }));
  if (subscriptionStatus) localStorage.setItem(`user_sub_${userId}`, subscriptionStatus);
};

const notifyCredits = (credits: number) => {
  window.dispatchEvent(new CustomEvent('creditsUpdated', { detail: { credits } }));
};

let profileRetries = 0;

async function fetchBalance(userId: string): Promise<CreditsResponse> {
  const response = await authFetch('/api/credits');
  if (response.status === 404) {
    // Profile still being created on first sign-in: ask again shortly so the UI shows the
    // daily credits as soon as the profile exists.
    if (profileRetries < 5) {
      profileRetries++;
      setTimeout(() => { refreshCredits(userId); }, 1500);
    }
    return { credits: 0, subscriptionStatus: 'Gratis' };
  }
  profileRetries = 0;
  if (!response.ok) throw new Error('No se pudo obtener el saldo de créditos');
  const data = await response.json();
  const balance = { credits: Number(data.credits) || 0, subscriptionStatus: data.subscriptionStatus || 'Gratis' };
  cacheBalance(userId, balance.credits, balance.subscriptionStatus);
  return balance;
}

export const getUserCredits = async (userId: string) => {
  if (!checkRateLimit()) throw new Error('RATE_LIMIT_EXCEEDED');

  // Short local cache to avoid repeated requests while navigating
  const cachedCredits = localStorage.getItem(`user_credits_${userId}`);
  if (cachedCredits) {
    try {
      const { credits, timestamp } = JSON.parse(cachedCredits);
      if (Date.now() - timestamp < CREDITS_CACHE_MS) {
        return { credits, subscriptionStatus: localStorage.getItem(`user_sub_${userId}`) || 'Gratis' };
      }
    } catch {
      // Corrupted cache: ignore and ask the server
    }
  }

  return fetchBalance(userId);
};

/**
 * Refreshes the balance after an AI action (the server already charged it) and notifies
 * the UI (Sidebar, credit badges). Replaces the old client-side credit deduction.
 */
export const refreshCredits = async (userId: string) => {
  try {
    localStorage.removeItem(`user_credits_${userId}`);
    const { credits } = await fetchBalance(userId);
    notifyCredits(credits);
  } catch (error) {
    console.warn('[CreditSystem] No se pudo actualizar el saldo:', error);
  }
};

/** Spends one credit on a non-AI action (e.g. skipping the Arena cooldown). Throws INSUFFICIENT_CREDITS. */
export const spendCredit = async (userId: string, reason: 'arena_cooldown') => {
  const actionId = (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, '');
  const response = await authFetch('/api/credits/spend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason, actionId }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || 'No se pudo descontar el crédito');
  cacheBalance(userId, data.credits);
  notifyCredits(data.credits);
  return data.credits as number;
};

let cachedAiSuspension: { value: boolean; timestamp: number } | null = null;
const SUSPENSION_CACHE_MS = 60 * 1000; // 1 minute

export const checkAiSuspension = async () => {
  if (cachedAiSuspension && Date.now() - cachedAiSuspension.timestamp < SUSPENSION_CACHE_MS) {
    return cachedAiSuspension.value;
  }

  try {
    const statsDoc = await getDoc(doc(db, 'stats', 'global'));
    const isSuspended = statsDoc.data()?.isAiSuspendedForFree || false;
    cachedAiSuspension = { value: isSuspended, timestamp: Date.now() };
    return isSuspended;
  } catch (e) {
    console.error("Error checking AI suspension status:", e);
    return false;
  }
};

export const isAiSuspendedForFreeSync = () => {
  return cachedAiSuspension?.value || false;
};

export const checkSmartCache = async (topic: string): Promise<string | null> => {
  const q = query(collection(db, 'publicLibrary'), where('topic', '==', topic));
  const querySnapshot = await getDocs(q);
  if (!querySnapshot.empty) {
    return querySnapshot.docs[0].data().content;
  }
  return null;
};

export const hasUsedFreeTrial = async (userId: string): Promise<boolean> => {
  const userDoc = await getDoc(doc(db, 'users', userId));
  if (!userDoc.exists()) return false;
  return !!userDoc.data().hasUsedFreeTrial;
};

/**
 * Only the free trial can be started from the app (server-side, once per account).
 * Paid plans are activated exclusively by a verified Mercado Pago payment.
 */
export const updateSubscription = async (userId: string, planId: string) => {
  if (planId !== 'prueba') {
    throw new Error('Los planes pagos se activan solo con un pago verificado.');
  }

  const response = await authFetch('/api/credits/trial', { method: 'POST' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error === 'TRIAL_ALREADY_USED' ? 'Ya has utilizado tu prueba gratuita' : 'No se pudo activar la prueba');
  }

  cacheBalance(userId, data.credits, data.subscriptionStatus);
  notifyCredits(data.credits);
};
