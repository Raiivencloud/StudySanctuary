import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  User, 
  onAuthStateChanged, 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  setPersistence,
  browserLocalPersistence
} from 'firebase/auth';
import { auth, db, googleProvider, appleProvider, logout as firebaseLogout, handleFirestoreError, OperationType } from '../firebase';
import firebaseConfig from '../../firebase-applet-config.json';
import { doc, setDoc, getDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { toast } from 'sonner';
import { UserProfile } from '../types';

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  googleAccessToken: string | null;
  loginWithGoogle: () => Promise<void>;
  loginWithApple: () => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(localStorage.getItem('google_drive_token'));

  useEffect(() => {
    let retryCount = 0;
    const maxRetries = 5;
    let timeoutId: any;
    
    const initAuth = async () => {
      try {
        // Clear any old service workers that might be intercepting auth
        if ('serviceWorker' in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          for (const registration of registrations) {
            await registration.unregister();
          }
        }

        // Set persistence once on mount
        await setPersistence(auth, browserLocalPersistence);

        // Handle redirect results (for mobile fallback)
        const result = await getRedirectResult(auth);
        if (result) {
          const credential = GoogleAuthProvider.credentialFromResult(result);
          if (credential?.accessToken) {
            setGoogleAccessToken(credential.accessToken);
            localStorage.setItem('google_drive_token', credential.accessToken);
          }
          toast.success('¡Bienvenido!');
        }
      } catch (error: any) {
        const isRateLimit = error?.message?.includes('429') || error?.code?.includes('quota');
        
        if (isRateLimit && retryCount < maxRetries) {
          retryCount++;
          const delay = 5000 * Math.pow(2, retryCount - 1);
          timeoutId = setTimeout(initAuth, delay);
          return;
        }

        if (error.code !== 'auth/no-auth-event' && error.code !== 'auth/argument-error') {
          toast.error(`Error de autenticación: ${error.message}`);
        }
      }
    };

    initAuth();

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        let profileRetryCount = 0;
        const maxProfileRetries = 3;

        const syncProfile = async () => {
          try {
            const userDocRef = doc(db, 'users', user.uid);
            const userDoc = await getDoc(userDocRef);
            
            let profileData: UserProfile;
            
            if (userDoc.exists()) {
              profileData = userDoc.data() as UserProfile;
              
              // Check trial status
              if (profileData.subscription?.status === 'trial') {
                const trialStart = profileData.subscription.trialStartDate as Timestamp;
                const now = Timestamp.now();
                const diffDays = (now.toMillis() - trialStart.toMillis()) / (1000 * 60 * 60 * 24);
                
                if (diffDays > 7) {
                  // Trial expired
                  const updatedSub = {
                    ...profileData.subscription,
                    status: 'expired' as const
                  };
                  await setDoc(userDocRef, { subscription: updatedSub }, { merge: true });
                  profileData.subscription = updatedSub;
                }
              }
            } else {
              profileData = {
                uid: user.uid,
                displayName: user.displayName || user.email?.split('@')[0] || 'Usuario',
                email: user.email,
                photoURL: user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`,
                bannerURL: "https://images.unsplash.com/photo-1516979187457-637abb4f9353?auto=format&fit=crop&w=1200&q=80",
                role: 'user',
                createdAt: serverTimestamp(),
                preferences: {
                  theme: 'dark',
                  language: 'es',
                  notifications: true
                },
                subscription: {
                  status: 'trial',
                  type: 'free',
                  trialStartDate: serverTimestamp(),
                  subscriptionEndDate: null
                }
              };
              await setDoc(userDocRef, {
                ...profileData,
                lastLogin: serverTimestamp()
              });
            }
            setUserProfile(profileData);
          } catch (error: any) {
            console.error("Error syncing user profile:", error);
            const isRateLimit = error?.message?.includes('429') || error?.code?.includes('quota');
            
            if (isRateLimit && profileRetryCount < maxProfileRetries) {
              profileRetryCount++;
              const delay = 5000 * Math.pow(2, profileRetryCount - 1);
              setTimeout(syncProfile, delay);
              return;
            }

            // Set a minimal profile if sync fails to prevent hanging
            setUserProfile({
              uid: user.uid,
              displayName: user.displayName || user.email?.split('@')[0] || 'Usuario',
              email: user.email,
              photoURL: user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`,
              subscription: {
                status: 'trial',
                type: 'free',
                trialStartDate: Timestamp.now(),
                subscriptionEndDate: null
              }
            });
          }
        };

        syncProfile();

        // Sync Google token if exists
        const token = localStorage.getItem('google_drive_token');
        if (token) {
          fetch('/api/auth/google/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accessToken: token })
          }).catch(console.error);
        }
      } else {
        setUserProfile(null);
        setGoogleAccessToken(null);
        localStorage.removeItem('google_drive_token');
      }
      setLoading(false);
    });

    return () => {
      unsubscribe();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  const updateProfile = async (updates: Partial<UserProfile>) => {
    if (!user) return;
    try {
      const userDocRef = doc(db, 'users', user.uid);
      try {
        await setDoc(userDocRef, updates, { merge: true });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
      }
      setUserProfile(prev => prev ? { ...prev, ...updates } : null);
    } catch (error) {
      console.error("Error updating profile:", error);
      throw error;
    }
  };

  const handleLoginWithGoogle = async () => {
    setLoading(true);
    try {
      console.log("[Auth] Forcing redirect login for Google...");
      await signInWithRedirect(auth, googleProvider);
    } catch (error: any) {
      console.error("[Auth] Google login error:", error);
      
      if (error.code === 'auth/unauthorized-domain') {
        const fallbackUrl = `https://${firebaseConfig.authDomain}/__/auth/handler?apiKey=${firebaseConfig.apiKey}&appName=${encodeURIComponent(firebaseConfig.projectId)}`;
        toast.error(
          <div className="flex flex-col gap-2">
            <p>El dominio aún no ha sido propagado por Google.</p>
            <button 
              onClick={() => window.open(fallbackUrl, '_blank')}
              className="text-xs underline font-bold"
            >
              Intentar vía dominio de respaldo
            </button>
          </div>,
          { duration: 10000 }
        );
      } else {
        toast.error(`Error: ${error.message}`);
      }
      setLoading(false);
    }
  };

  const handleLoginWithApple = async () => {
    setLoading(true);
    try {
      console.log("[Auth] Forcing redirect login for Apple...");
      await signInWithRedirect(auth, appleProvider);
    } catch (error: any) {
      console.error("[Auth] Apple login error:", error);
      toast.error(`Error: ${error.message}`);
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await firebaseLogout();
      setGoogleAccessToken(null);
      localStorage.removeItem('google_drive_token');
    } catch (error) {
      console.error("Logout error:", error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      userProfile,
      loading, 
      googleAccessToken,
      loginWithGoogle: handleLoginWithGoogle, 
      loginWithApple: handleLoginWithApple, 
      logout: handleLogout,
      updateProfile
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
