import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { authFetch } from '../lib/authFetch';
import { refreshCredits } from '../services/userService';
import { COMMUNITY_URL } from '../config/brand';

type PaymentState = 'checking' | 'approved' | 'pending' | 'failed';

interface SyncResponse {
  outcome: string;
  status: string | null;
  planId: string | null;
  profile: { credits: number; planName: string; planId?: string; endsAt?: string } | null;
}

const PENDING = new Set(['pending', 'in_process', 'authorized']);
const MAX_CHECKS = 8;

/**
 * Return page of Mercado Pago (/success). Asks the server for the REAL state of the payment
 * (POST /api/payments/sync): the plan is only shown as active once the server granted it.
 */
export const SubscriptionSuccess: React.FC = () => {
  const { user, userProfile } = useAuth();
  const displayName = userProfile?.displayName || 'estudiante';
  const [state, setState] = React.useState<PaymentState>('checking');
  const [plan, setPlan] = React.useState<{ planName: string; credits: number; planId?: string; endsAt?: string }>({ planName: 'Plan', credits: 0 });

  React.useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams(window.location.search);
    const paymentId = params.get('payment_id') || params.get('collection_id');
    if (!paymentId || paymentId === 'null') {
      setState(params.get('status') === 'approved' ? 'pending' : 'failed');
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const check = async (attempt: number) => {
      try {
        const response = await authFetch('/api/payments/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentId }),
        });
        if (cancelled) return;
        const data: SyncResponse | null = response.ok ? await response.json() : null;
        if (data && (data.outcome === 'applied' || data.outcome === 'already_applied')) {
          if (data.profile) setPlan({ planName: data.profile.planName, credits: data.profile.credits, planId: data.planId || data.profile.planId, endsAt: data.profile.endsAt });
          setState('approved');
          refreshCredits(user.uid);
          return;
        }
        // Retry while Mercado Pago has not settled it (or is briefly unavailable); 4xx means it is not this user's payment
        const stillPending = response.status >= 500
          || (data !== null && data.status !== null && PENDING.has(data.status))
          || (data !== null && data.outcome === 'ignored' && data.status === null);
        if (stillPending && attempt < MAX_CHECKS) {
          setState('pending');
          timer = setTimeout(() => check(attempt + 1), 4000);
          return;
        }
        setState(stillPending ? 'pending' : 'failed');
      } catch {
        if (!cancelled && attempt < MAX_CHECKS) timer = setTimeout(() => check(attempt + 1), 4000);
        else if (!cancelled) setState('pending');
      }
    };
    check(1);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [user]);

  const copy = {
    checking: { title: 'Confirmando tu pago...', text: 'Estamos verificando el pago con Mercado Pago.', badge: '' },
    approved: { title: `¡Bienvenido a la élite, ${displayName}!`, text: `${plan.endsAt ? `Tu plan está activo hasta el ${new Date(plan.endsAt).toLocaleDateString('es-AR')}` : 'Tu plan está activo'} (pago único, sin renovación automática). Disfrutá de tus créditos${plan.planId === 'trimestral' || plan.planId === 'anual' ? ' y del sello de tu plan en tu perfil' : ''}.`, badge: `${plan.planName} - ${plan.credits} Créditos Activos` },
    pending: { title: 'Tu pago está en proceso', text: 'Mercado Pago todavía no lo acreditó. Tu plan se activará automáticamente apenas se confirme; no hace falta volver a pagar.', badge: 'Pago pendiente de acreditación' },
    failed: { title: 'No pudimos confirmar el pago', text: 'El pago no fue aprobado o no corresponde a tu cuenta. Si se te cobró, escribinos desde Ayuda y lo revisamos.', badge: '' },
  }[state];
  const Icon = state === 'approved' ? CheckCircle2 : state === 'failed' ? AlertCircle : Clock;
  const iconColor = state === 'approved' ? 'text-emerald-500' : state === 'failed' ? 'text-red-500' : 'text-amber-500';
  const planId = plan.planId;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-lg p-8 bg-surface-container-high/80 backdrop-blur-lg border border-emerald-500/20 rounded-[2rem] shadow-2xl text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, delay: 0.2 }}
          className="mx-auto mb-6"
        >
          <Icon className={`w-20 h-20 mx-auto ${iconColor}`} />
        </motion.div>
        <h2 className="text-3xl font-bold text-on-surface mb-4">{copy.title}</h2>
        <p className="text-on-surface-variant mb-8">{copy.text}</p>
        
        {copy.badge && (
          <div className={state === 'approved' ? "bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 mb-8" : "bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 mb-8"}>
            <p className={state === 'approved' ? "text-emerald-500 font-bold text-lg" : "text-amber-500 font-bold text-lg"}>{copy.badge}</p>
          </div>
        )}

        <button 
          onClick={() => window.location.href = '/'}
          className="w-full py-4 bg-emerald-500 text-white rounded-xl font-bold hover:bg-emerald-600 transition-all mb-4"
        >
          Empezar a Estudiar Ahora
        </button>
        
        {state === 'approved' && planId === 'anual' && (
          <a 
            href={COMMUNITY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-4 bg-[#5865F2] text-white rounded-xl font-bold hover:scale-105 transition-all mb-4 flex items-center justify-center gap-2 shadow-lg shadow-[#5865F2]/20"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.062 14.062 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
            </svg>
            Comunidad en Discord
          </a>
        )}
      </div>
    </motion.div>
  );
};
