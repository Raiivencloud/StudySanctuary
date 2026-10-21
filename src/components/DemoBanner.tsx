import React, { useState } from 'react';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { auth } from '../firebase';

// `npm run demo` only (VITE_DEMO_MODE=true). Never set VITE_DEMO_MODE in a production build
// (vite.config.ts refuses it).
const isDemo = () => (import.meta as any).env?.VITE_DEMO_MODE === 'true';

// Accounts created by scripts/demo/seed.ts in the Auth emulator
const DEMO_ACCOUNTS = [
  { label: 'Entrar como estudiante (demo)', sub: 'google-demo-student', email: 'valentina.demo@studysanctuary.test', name: 'Valentina (demo)' },
  { label: 'Entrar como administrador (demo)', sub: 'google-demo-admin', email: 'admin.demo@studysanctuary.test', name: 'Admin (demo)' },
];

/** Reminds whoever is watching that the AI, payments and data are simulated and local. */
export const DemoBanner: React.FC = () => {
  if (!isDemo()) return null;
  return (
    <div
      role="status"
      className="fixed bottom-2 left-2 z-[200] pointer-events-none px-3 py-1 rounded-full bg-amber-500/90 text-black text-[10px] md:text-xs font-bold shadow-lg"
    >
      <span className="md:hidden">DEMO · simulado</span>
      <span className="hidden md:inline">DEMO · IA y pagos simulados · datos locales, sin costo</span>
    </div>
  );
};

/**
 * One-click sign-in with the demo accounts. The Auth emulator accepts an unsigned Google
 * credential, so this works offline (the regular Google popup needs apis.google.com).
 */
export const DemoLogin: React.FC = () => {
  const [error, setError] = useState('');
  if (!isDemo()) return null;

  const signIn = async (account: typeof DEMO_ACCOUNTS[number]) => {
    setError('');
    try {
      const idToken = JSON.stringify({ sub: account.sub, email: account.email, email_verified: true, name: account.name });
      await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
    } catch (e: any) {
      setError(e?.message || 'No se pudo ingresar');
    }
  };

  return (
    <div className="fixed top-20 right-4 z-[200] w-[min(320px,calc(100vw-32px))] p-4 rounded-2xl bg-black/80 border border-amber-500/60 text-white shadow-2xl backdrop-blur">
      <p className="text-xs font-bold text-amber-400 mb-3 uppercase tracking-widest">Demo sin credenciales</p>
      <div className="flex flex-col gap-2">
        {DEMO_ACCOUNTS.map((account) => (
          <button
            key={account.sub}
            onClick={() => signIn(account)}
            className="px-4 py-2 rounded-xl bg-amber-500 text-black text-sm font-bold hover:bg-amber-400 transition-colors"
          >
            {account.label}
          </button>
        ))}
      </div>
      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
    </div>
  );
};
