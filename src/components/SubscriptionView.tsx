import React, { useState, useEffect } from 'react';
import { Check, Zap, Star, ShieldCheck, ArrowRight, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { motion } from 'framer-motion';
import { doc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { toast } from 'sonner';
import { hasUsedFreeTrial, updateSubscription } from '../services/userService';
import { SUBSCRIPTION_PLANS } from '../constants';
import { authFetch } from '../lib/authFetch';
import { LegalModal, type LegalDocument } from './LegalModal';

const PAYMENT_ERRORS: Record<string, string> = {
  UNAUTHENTICATED: 'Tu sesión expiró. Volvé a iniciar sesión.',
  PROFILE_NOT_FOUND: 'Tu perfil todavía no está listo. Intentá de nuevo en unos segundos.',
  PAYMENTS_DISABLED: 'Los pagos no están disponibles en este momento.',
  RATE_LIMITED: 'Demasiados intentos. Esperá un minuto.',
  PAYMENT_PROVIDER_ERROR: 'Mercado Pago no respondió. Intentá de nuevo en unos minutos.',
};

const SubscriptionView: React.FC = () => {
  const { user, userProfile, logout } = useAuth();
  const { t } = useLanguage();
  const [usedTrial, setUsedTrial] = useState(false);
  const [legalDocument, setLegalDocument] = useState<LegalDocument | null>(null);

  useEffect(() => {
    if (user) {
      hasUsedFreeTrial(user.uid).then(setUsedTrial);
    }
  }, [user]);

  // Return from Mercado Pago when the payment failed (back_urls.failure)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'failure') {
      toast.error('El pago no se completó. Podés intentarlo de nuevo.');
      window.history.replaceState({}, '', `${window.location.pathname}?view=subscription`);
    }
  }, []);

  const handleSubscribe = async (planId: string) => {
    if (!user) {
      toast.error('Por favor inicia sesión para suscribirte');
      return;
    }

    if (planId === 'prueba') {
      if (usedTrial) {
        toast.error('Ya has utilizado tu prueba gratuita');
        return;
      }
      try {
        await updateSubscription(user.uid, 'prueba');
        toast.success('Prueba gratuita activada');
      } catch (error) {
        toast.error('Error al activar la prueba');
      }
      return;
    }
    
    try {
      // The server takes the user and email from the ID token (Phase 5)
      const response = await authFetch('/api/create-preference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(PAYMENT_ERRORS[errorData.error] || 'Error al crear la preferencia de pago');
      }

      const { init_point } = await response.json();
      
      if (!init_point) {
        throw new Error('No se recibió el punto de inicio de pago');
      }

      // Redirect to Mercado Pago
      window.location.href = init_point;
    } catch (error: any) {
      console.error('Error subscribing:', error);
      alert(error.message || 'Error al procesar la suscripción con Mercado Pago');
      toast.error(error.message || 'Error al procesar la suscripción con Mercado Pago');
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      toast.success('Sesión cerrada correctamente');
    } catch (error) {
      console.error('Logout error:', error);
      toast.error('Error al cerrar sesión');
    }
  };

  // Only what the code actually delivers (Phase 7): credits, duration and, for 90/365-day plans, a profile badge.
  const plans = [
    {
      id: 'prueba',
      name: SUBSCRIPTION_PLANS.PRUEBA.name,
      price: '$0',
      period: '',
      offer: SUBSCRIPTION_PLANS.PRUEBA.description,
      features: ['15 Créditos de IA de prueba', 'Se activa una sola vez por cuenta'],
      icon: Star,
      color: 'bg-emerald-500'
    },
    {
      id: 'mensual',
      name: SUBSCRIPTION_PLANS.MENSUAL.name,
      price: '$1.200',
      period: 'pago único · 30 días',
      offer: SUBSCRIPTION_PLANS.MENSUAL.description,
      features: ['300 Créditos de IA', 'Plan activo por 30 días'],
      icon: Zap,
      color: 'bg-blue-500'
    },
    {
      id: 'trimestral',
      name: SUBSCRIPTION_PLANS.TRIMESTRAL.name,
      price: '$4.200',
      period: 'pago único · 90 días',
      offer: SUBSCRIPTION_PLANS.TRIMESTRAL.description,
      features: ['1.000 Créditos de IA', 'Plan activo por 90 días', 'Sello de Estudiante Destacado (plata) en tu perfil'],
      icon: Star,
      color: 'bg-gray-400'
    },
    {
      id: 'anual',
      name: SUBSCRIPTION_PLANS.ANUAL.name,
      price: '$12.000',
      period: 'pago único · 365 días',
      offer: SUBSCRIPTION_PLANS.ANUAL.description,
      features: ['5.000 Créditos de IA', 'Plan activo por 365 días', 'Sello de Miembro de Honor (oro) en tu perfil'],
      icon: ShieldCheck,
      color: 'bg-amber-500'
    }
  ] as { id: string; name: string; price: string; period: string; offer: string; features: string[]; icon: typeof Star; color: string; popular?: boolean }[];

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-6 relative">
      <div className="absolute top-8 right-8">
        <button 
          onClick={handleLogout}
          className="flex items-center gap-2 px-4 py-2 bg-surface-container-high text-on-surface-variant hover:text-error hover:bg-error/10 rounded-xl transition-all font-bold text-sm"
        >
          <LogOut size={18} />
          Cerrar Sesión
        </button>
      </div>
      
      <div className="max-w-6xl w-full">
        <div className="text-center mb-12">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <h1 className="text-4xl md:text-5xl font-headline font-bold text-on-surface mb-4">
              Elige tu plan de estudio
            </h1>
            <p className="text-lg text-on-surface-variant max-w-2xl mx-auto">
              Cada plan suma créditos de IA por un período fijo. Se paga una sola vez con Mercado Pago.
            </p>
          </motion.div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {plans.map((plan, index) => (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className={`relative bg-surface-container-high rounded-3xl p-8 border ${plan.popular ? 'border-primary shadow-2xl scale-105 z-10' : 'border-outline-variant/10 shadow-xl'}`}
            >
              
              <div className={`w-12 h-12 ${plan.color} rounded-2xl flex items-center justify-center text-white mb-6`}>
                <plan.icon size={24} />
              </div>

              <h3 className="text-2xl font-bold text-on-surface mb-1">{plan.name}</h3>
              <p className="text-xs font-bold text-primary mb-4">{plan.offer}</p>
              <div className="mb-6">
                <div className="flex items-center gap-2">
                  <span className="text-4xl font-extrabold text-on-surface">{plan.price}</span>
                </div>
                {/* One-time payment and its duration, on its own line so it never wraps next to the price */}
                {plan.period && <p className="text-on-surface-variant text-sm mt-1">{plan.period}</p>}
              </div>

              <ul className="space-y-4 mb-8">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm text-on-surface-variant">
                    <Check size={18} className="text-primary flex-shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleSubscribe(plan.id)}
                disabled={plan.id === 'prueba' && usedTrial}
                className={`w-full py-4 rounded-2xl font-bold transition-all flex items-center justify-center gap-2 ${plan.popular ? 'bg-primary text-on-primary hover:bg-primary/90' : 'bg-surface-container-highest text-on-surface hover:bg-surface-container-high'} ${plan.id === 'prueba' && usedTrial ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {plan.id === 'prueba' && usedTrial ? 'Prueba ya utilizada' : plan.id === 'prueba' ? 'Comenzar Prueba' : 'Comenzar ahora'}
                <ArrowRight size={18} />
              </button>
            </motion.div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <p className="text-sm text-on-surface-variant opacity-80 max-w-2xl mx-auto mb-4">
            1 crédito = 1 acción de IA (un resumen, un podcast, un set de ejercicios, una respuesta del tutor…). Organizar cursos, calendario y tareas, las herramientas dentro de cada curso y los grupos de estudio no consumen créditos.
          </p>
          <p className="text-xs text-on-surface-variant opacity-60">
            Todos los planes son pagos únicos con Mercado Pago: no hay renovación automática ni débitos recurrentes. Al terminar el período, podés volver a comprar cuando quieras. Al comprar, aceptás los <button type="button" onClick={() => setLegalDocument('terms')} className="underline hover:text-on-surface">Términos</button> y la <button type="button" onClick={() => setLegalDocument('privacy')} className="underline hover:text-on-surface">Política de privacidad</button>.
          </p>
        </div>
      </div>
      {legalDocument && <LegalModal initial={legalDocument} onClose={() => setLegalDocument(null)} />}
    </div>
  );
};

export default SubscriptionView;
