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

const SubscriptionView: React.FC = () => {
  const { user, userProfile, logout } = useAuth();
  const { t } = useLanguage();
  const [usedTrial, setUsedTrial] = useState(false);

  useEffect(() => {
    if (user) {
      hasUsedFreeTrial(user.uid).then(setUsedTrial);
    }
  }, [user]);

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
      const response = await fetch('/api/create-preference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId,
          userId: user.uid,
          userEmail: user.email
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al crear la preferencia de pago');
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

  const plans = [
    {
      id: 'prueba',
      name: SUBSCRIPTION_PLANS.PRUEBA.name,
      price: '$0',
      period: '',
      offer: SUBSCRIPTION_PLANS.PRUEBA.description,
      features: ['15 Créditos de IA de prueba', 'Acceso completo por 7 días'],
      icon: Star,
      color: 'bg-emerald-500'
    },
    {
      id: 'mensual',
      name: SUBSCRIPTION_PLANS.MENSUAL.name,
      price: '$1.200',
      period: '/mes',
      offer: SUBSCRIPTION_PLANS.MENSUAL.description,
      features: ['300 Créditos de IA al mes', 'Grupos de estudio ilimitados', 'Sin anuncios', 'Soporte prioritario'],
      icon: Zap,
      color: 'bg-blue-500'
    },
    {
      id: 'trimestral',
      name: SUBSCRIPTION_PLANS.TRIMESTRAL.name,
      price: '$4.200',
      oldPrice: '$7.000',
      period: '/3 meses',
      offer: SUBSCRIPTION_PLANS.TRIMESTRAL.description,
      features: ['1.000 Créditos de IA', 'Insignia de Estudiante Destacado (Plata)', 'Acceso Prioritario'],
      icon: Star,
      color: 'bg-gray-400',
      popular: true,
      savings: '¡Ahorrás $2.800!'
    },
    {
      id: 'anual',
      name: SUBSCRIPTION_PLANS.ANUAL.name,
      price: '$12.000',
      oldPrice: '$18.000',
      period: '/año',
      offer: SUBSCRIPTION_PLANS.ANUAL.description,
      features: ['5.000 Créditos de IA', 'Insignia Leyenda de Honor (Oro)', 'Velocidad Turbo', 'Soporte Preferencial'],
      icon: ShieldCheck,
      color: 'bg-amber-500',
      savings: '¡Ahorrás $6.000!'
    }
  ];

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
              Tu prueba gratuita ha finalizado o está por expirar. Continúa tu camino al éxito con Study Sanctuary Pro.
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
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary text-on-primary px-4 py-1 rounded-full text-xs font-bold uppercase tracking-widest">
                  EL MÁS ELEGIDO
                </div>
              )}
              
              <div className={`w-12 h-12 ${plan.color} rounded-2xl flex items-center justify-center text-white mb-6`}>
                <plan.icon size={24} />
              </div>

              <h3 className="text-2xl font-bold text-on-surface mb-1">{plan.name}</h3>
              <p className="text-xs font-bold text-primary mb-4">{plan.offer}</p>
              <div className="flex items-center gap-2 mb-6">
                {plan.oldPrice && (
                  <span className="text-lg font-medium text-on-surface-variant/60 line-through">{plan.oldPrice}</span>
                )}
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-on-surface">{plan.price}</span>
                  <span className="text-on-surface-variant text-sm">{plan.period}</span>
                </div>
              </div>

              <ul className="space-y-4 mb-8">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm text-on-surface-variant">
                    <Check size={18} className="text-primary flex-shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              {plan.savings && (
                <div className="absolute top-4 right-4 bg-emerald-500/20 text-emerald-600 px-3 py-1 rounded-full text-xs font-bold">
                  {plan.savings}
                </div>
              )}

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
            1 Crédito = 1 Podcast, 1 set de ejercicios o 1 análisis de IA. El resto de la plataforma (biblioteca y comunidad) es libre para suscriptores.
          </p>
          <p className="text-xs text-on-surface-variant opacity-60">
            Puedes cancelar en cualquier momento. Al suscribirte, aceptas nuestros Términos de Servicio y Política de Privacidad.
          </p>
        </div>
      </div>
    </div>
  );
};

export default SubscriptionView;
