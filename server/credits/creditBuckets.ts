/**
 * PROPOSAL (not wired into the app yet): credits split by origin. See docs/CREDITS_BUCKETS_PROPOSAL.md.
 *
 * Pure functions over the user's credit state, so the rules can be tested in isolation before
 * any economic behavior changes. Once approved, creditService/paymentService would call them inside
 * their existing Firestore transactions (the state lives in users/{uid}.creditBuckets and
 * users/{uid}.remainingCredits stays as the total the app already reads).
 *
 * Invariants (tested):
 *  - remainingCredits === sum of bucket balances, never negative, integers only.
 *  - Existing balances are preserved: a legacy total becomes a "legacy" bucket that never expires.
 *  - Buying never removes existing credits; plan credits expire with their plan; purchased credits never expire.
 *  - A refund removes only the unused credits of that payment and records how many were consumed.
 */

export type BucketKind = "free" | "promo" | "legacy" | "plan" | "purchased";

export interface CreditBucket {
  /** Stable id: "free", "trial", "legacy", "payment_<id>"... */
  id: string;
  kind: BucketKind;
  balance: number;
  /** Credits originally granted (plan and purchased: needed to report consumption on refunds). */
  granted: number;
  /** Epoch ms; null = never expires. */
  expiresAt: number | null;
  /** Payment that granted it (plan and purchased buckets). */
  paymentId?: string;
  planId?: string;
  /** Fully refunded or charged back: it never receives credits again. */
  closed?: boolean;
}

export interface CreditState {
  buckets: CreditBucket[];
}

export interface LegacyProfile {
  remainingCredits?: unknown;
  creditBuckets?: unknown;
}

/** Consumption order: what expires first is used first; buckets that never expire go last (legacy before purchased). */
const KIND_ORDER: Record<BucketKind, number> = { free: 0, promo: 1, plan: 2, legacy: 3, purchased: 4 };

const isCount = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0;

export function total(state: CreditState): number {
  return state.buckets.reduce((sum, bucket) => sum + bucket.balance, 0);
}

function sorted(buckets: CreditBucket[]): CreditBucket[] {
  return [...buckets].sort((a, b) => {
    const expiryA = a.expiresAt ?? Number.POSITIVE_INFINITY;
    const expiryB = b.expiresAt ?? Number.POSITIVE_INFINITY;
    if (expiryA !== expiryB) return expiryA - expiryB;
    return KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.id.localeCompare(b.id);
  });
}

function parseBuckets(raw: unknown): CreditBucket[] | null {
  if (!Array.isArray(raw)) return null;
  const buckets: CreditBucket[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const b = item as Record<string, unknown>;
    if (typeof b.id !== "string" || !(b.kind as string in KIND_ORDER) || !isCount(b.balance) || !isCount(b.granted)) return null;
    if (b.expiresAt !== null && typeof b.expiresAt !== "number") return null;
    buckets.push({
      id: b.id, kind: b.kind as BucketKind, balance: b.balance, granted: b.granted, expiresAt: b.expiresAt as number | null,
      ...(typeof b.paymentId === "string" ? { paymentId: b.paymentId } : {}),
      ...(typeof b.planId === "string" ? { planId: b.planId } : {}),
      ...(b.closed === true ? { closed: true } : {}),
    });
  }
  return buckets;
}

/**
 * Reads the stored state, migrating legacy profiles lazily (first transaction after deploy):
 * the old total becomes a "legacy" bucket that never expires, so nobody loses or gains credits.
 * If the total and the buckets disagree (for example after a rollback to the old code), the
 * difference is absorbed by the legacy bucket: the total the user saw is what they keep.
 */
export function readState(profile: LegacyProfile): { state: CreditState; migrated: boolean; reconciled: number } {
  const legacyTotal = isCount(profile.remainingCredits) ? profile.remainingCredits : 0;
  const parsed = parseBuckets(profile.creditBuckets);
  if (!parsed) {
    const buckets = legacyTotal > 0 ? [{ id: "legacy", kind: "legacy" as const, balance: legacyTotal, granted: legacyTotal, expiresAt: null }] : [];
    return { state: { buckets }, migrated: true, reconciled: 0 };
  }

  const state: CreditState = { buckets: parsed.filter((b) => b.balance > 0 || b.kind === "plan" || b.kind === "purchased") };
  const difference = legacyTotal - total(state);
  if (difference === 0) return { state, migrated: false, reconciled: 0 };

  if (difference > 0) {
    const legacy = state.buckets.find((b) => b.id === "legacy");
    if (legacy) legacy.balance += difference;
    else state.buckets.push({ id: "legacy", kind: "legacy", balance: difference, granted: difference, expiresAt: null });
  } else {
    // The stored total is lower (credits were spent by code that did not update the buckets): spend them now.
    spend(state, -difference);
  }
  return { state, migrated: false, reconciled: difference };
}

/** Removes `amount` from the buckets in consumption order. Returns the allocation, or null without enough credits. */
function spend(state: CreditState, amount: number): { bucketId: string; amount: number }[] | null {
  if (total(state) < amount) return null;
  const allocation: { bucketId: string; amount: number }[] = [];
  let left = amount;
  for (const bucket of sorted(state.buckets)) {
    if (left === 0) break;
    const take = Math.min(bucket.balance, left);
    if (take > 0) {
      bucket.balance -= take;
      left -= take;
      allocation.push({ bucketId: bucket.id, amount: take });
    }
  }
  return allocation;
}

export function consume(state: CreditState, amount: number, now: number): { ok: true; allocation: { bucketId: string; amount: number }[] } | { ok: false } {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("INVALID_AMOUNT");
  expire(state, now);
  const allocation = spend(state, amount);
  return allocation ? { ok: true, allocation } : { ok: false };
}

/** Returns credits of a failed action to the buckets they came from (expired ones are not revived). */
export function refundAllocation(state: CreditState, allocation: { bucketId: string; amount: number }[], now: number): number {
  let returned = 0;
  for (const part of allocation) {
    const bucket = state.buckets.find((b) => b.id === part.bucketId);
    if (bucket && !bucket.closed && (bucket.expiresAt === null || bucket.expiresAt > now)) {
      bucket.balance += part.amount;
      returned += part.amount;
    }
  }
  return returned;
}

/** Same rule as today: when the user has nothing left, 5 free credits once per UTC day. */
export function dailyRefill(state: CreditState, amount: number, alreadyRefilledToday: boolean, now: number): boolean {
  expire(state, now);
  if (alreadyRefilledToday || total(state) > 0) return false;
  const free = state.buckets.find((b) => b.id === "free");
  if (free) {
    free.balance = amount;
    free.granted = amount;
  } else {
    state.buckets.push({ id: "free", kind: "free", balance: amount, granted: amount, expiresAt: null });
  }
  return true;
}

export function grantPromo(state: CreditState, id: string, amount: number, expiresAt: number | null): void {
  if (state.buckets.some((b) => b.id === id)) return;
  state.buckets.push({ id, kind: "promo", balance: amount, granted: amount, expiresAt });
}

/** A plan purchase ADDS a bucket that expires with the plan; existing credits are untouched. Idempotent per payment. */
export function grantPlan(state: CreditState, paymentId: string, planId: string, credits: number, expiresAt: number): boolean {
  const id = `payment_${paymentId}`;
  if (state.buckets.some((b) => b.id === id)) return false;
  state.buckets.push({ id, kind: "plan", balance: credits, granted: credits, expiresAt, paymentId, planId });
  return true;
}

/** Separately purchased credits (future credit packs): never expire. Idempotent per payment. */
export function grantPurchased(state: CreditState, paymentId: string, credits: number): boolean {
  const id = `payment_${paymentId}`;
  if (state.buckets.some((b) => b.id === id)) return false;
  state.buckets.push({ id, kind: "purchased", balance: credits, granted: credits, expiresAt: null, paymentId });
  return true;
}

/** Drops the unused credits of buckets past their expiry. Returns what expired, per bucket, for the ledger. */
export function expire(state: CreditState, now: number): { bucketId: string; amount: number }[] {
  const expired: { bucketId: string; amount: number }[] = [];
  for (const bucket of state.buckets) {
    if (bucket.expiresAt !== null && bucket.expiresAt <= now && bucket.balance > 0) {
      expired.push({ bucketId: bucket.id, amount: bucket.balance });
      bucket.balance = 0;
    }
  }
  return expired;
}

/**
 * Refund or chargeback of a payment: removes the UNUSED credits of that payment only and reports
 * what had been consumed. Never touches other buckets, so the balance can never go negative.
 * `refundedFraction` < 1 (partial refund) revokes that share of the granted credits, capped at the unused ones.
 */
export function revokePayment(state: CreditState, paymentId: string, refundedFraction = 1): { found: boolean; revoked: number; consumed: number } {
  const bucket = state.buckets.find((b) => b.paymentId === paymentId);
  if (!bucket) return { found: false, revoked: 0, consumed: 0 };
  const consumed = bucket.granted - bucket.balance;
  const fraction = Math.min(1, Math.max(0, refundedFraction));
  const revoked = Math.min(bucket.balance, Math.round(bucket.granted * fraction));
  bucket.balance -= revoked;
  if (fraction === 1) bucket.closed = true;
  return { found: true, revoked, consumed };
}

/** What gets stored: the buckets and the total the app reads. */
export function toStored(state: CreditState): { creditBuckets: CreditBucket[]; remainingCredits: number } {
  return { creditBuckets: sorted(state.buckets).map((b) => ({ ...b })), remainingCredits: total(state) };
}
