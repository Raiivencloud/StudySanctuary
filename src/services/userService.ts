import { db, handleFirestoreError, OperationType, auth } from '../firebase';
import { doc, getDoc, updateDoc, increment, collection, query, where, getDocs, setDoc } from 'firebase/firestore';
import { SUBSCRIPTION_PLANS } from '../constants';
import { checkRateLimit } from '../lib/rateLimit';

export const getUserCredits = async (userId: string) => {
  if (!checkRateLimit()) throw new Error('RATE_LIMIT_EXCEEDED');
  
  // Local cache check to avoid unnecessary Firestore reads
  const cachedCredits = localStorage.getItem(`user_credits_${userId}`);
  if (cachedCredits) {
    const { credits, timestamp } = JSON.parse(cachedCredits);
    // Use cache if it's less than 5 minutes old
    if (Date.now() - timestamp < 5 * 60 * 1000) {
      console.log(`[CreditSystem] Using local cached credits: ${credits}`);
      return { credits, subscriptionStatus: localStorage.getItem(`user_sub_${userId}`) || 'Gratis' };
    }
  }

  const userDocRef = doc(db, 'users', userId);
  
  let userDoc = await getDoc(userDocRef);
  
  if (!userDoc.exists()) {
    console.log(`[CreditSystem] Initializing new user: ${userId}`);
    const initialCredits = SUBSCRIPTION_PLANS.PRUEBA.credits;
    const initialData = {
      remainingCredits: initialCredits,
      subscriptionType: 'Gratis',
      hasUsedFreeTrial: false,
      createdAt: new Date().toISOString()
    };
    await setDoc(userDocRef, initialData);
    
    // Update cache
    localStorage.setItem(`user_credits_${userId}`, JSON.stringify({ credits: initialCredits, timestamp: Date.now() }));
    localStorage.setItem(`user_sub_${userId}`, 'Gratis');
    
    return { credits: initialCredits, subscriptionStatus: 'Gratis' };
  }
  
  const data = userDoc.data();
  // Ensure we always return a number for credits
  let credits = typeof data.remainingCredits === 'number' ? data.remainingCredits : 0;
  
  // Daily reset logic: if credits are 0, give 5 free credits for today
  const lastReset = data.lastCreditReset || '';
  const today = new Date().toISOString().split('T')[0];
  
  if (credits <= 0 && lastReset !== today) {
    console.log(`[CreditSystem] Daily credit reset for user: ${userId}`);
    credits = 5;
    await updateDoc(userDocRef, {
      remainingCredits: credits,
      lastCreditReset: today
    });
  }
  
  // Update cache
  localStorage.setItem(`user_credits_${userId}`, JSON.stringify({ credits, timestamp: Date.now() }));
  localStorage.setItem(`user_sub_${userId}`, data.subscriptionType || 'Gratis');
  
  return {
    credits: credits,
    subscriptionStatus: data.subscriptionType || 'Gratis'
  };
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

export const consumeCredit = async (userId: string) => {
  const userDocRef = doc(db, 'users', userId);
  
  try {
    const userDoc = await getDoc(userDocRef);
    if (!userDoc.exists()) {
      console.error(`[CreditSystem] User document not found: ${userId}`);
      return;
    }
    
    const data = userDoc.data();
    const currentCredits = data.remainingCredits || 0;
    console.log(`[CreditSystem] Current credits: ${currentCredits}`);
    
    if (currentCredits > 0) {
      const newCredits = currentCredits - 1;
      const today = new Date().toISOString().split('T')[0];
      
      // Update user credits
      await updateDoc(userDocRef, {
        remainingCredits: newCredits
      });
      
      // Log global consumption (efficiently in a single doc)
      const statsRef = doc(db, 'stats', 'global');
      try {
        await updateDoc(statsRef, {
          [`credits_${today}`]: increment(1),
          totalCreditsConsumed: increment(1)
        });
      } catch (e) {
        // If doc doesn't exist, create it
        await setDoc(statsRef, {
          [`credits_${today}`]: 1,
          totalCreditsConsumed: 1
        }, { merge: true });
      }

      console.log(`[CreditSystem] Credit consumed successfully. New credits: ${newCredits}`);
      
      // Update local cache immediately
      localStorage.setItem(`user_credits_${userId}`, JSON.stringify({ credits: newCredits, timestamp: Date.now() }));
      
      // Dispatch event to notify other components (like Sidebar)
      window.dispatchEvent(new CustomEvent('creditsUpdated', { detail: { credits: newCredits } }));
    } else {
      console.warn(`[CreditSystem] Cannot consume credit: credits are already 0 or less.`);
    }
  } catch (error: any) {
    console.error(`[CreditSystem] Error updating credits for user ${userId}:`, JSON.stringify(error, Object.getOwnPropertyNames(error)));
    throw error;
  }
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

export const updateSubscription = async (userId: string, planId: string) => {
  const plan = Object.values(SUBSCRIPTION_PLANS).find(p => p.id === planId);
  if (!plan) throw new Error('Plan no encontrado');
  
  const updateData: any = {
    subscriptionType: plan.name,
    remainingCredits: plan.credits
  };

  if (plan.id === 'prueba') {
    updateData.hasUsedFreeTrial = true;
  }
  
  await updateDoc(doc(db, 'users', userId), updateData);
  
  // Update cache
  localStorage.setItem(`user_credits_${userId}`, JSON.stringify({ credits: plan.credits, timestamp: Date.now() }));
  localStorage.setItem(`user_sub_${userId}`, plan.name);
  
  // Dispatch event to notify other components
  window.dispatchEvent(new CustomEvent('creditsUpdated', { detail: { credits: plan.credits } }));
};
