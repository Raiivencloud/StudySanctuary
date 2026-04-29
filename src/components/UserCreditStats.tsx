import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { SUBSCRIPTION_PLANS } from '../constants';

export const UserCreditStats: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState({ credits: 0, subscriptionType: 'Gratis', hasUsedFreeTrial: false });

  useEffect(() => {
    if (!user) return;

    const unsubscribe = onSnapshot(doc(db, 'users', user.uid), (doc) => {
      if (doc.exists()) {
        const userData = doc.data();
        setData({
          credits: userData.remainingCredits || 0,
          subscriptionType: userData.subscriptionType || 'Gratis',
          hasUsedFreeTrial: !!userData.hasUsedFreeTrial
        });
      }
    });

    return () => unsubscribe();
  }, [user]);

  const totalCredits = Object.values(SUBSCRIPTION_PLANS).find(p => p.name === data.subscriptionType)?.credits || 15;
  const progress = Math.min(100, (data.credits / totalCredits) * 100);
  
  const isTrial = data.subscriptionType === '7 DÍAS GRATIS' || (!data.subscriptionType || data.subscriptionType === 'Gratis') && !data.hasUsedFreeTrial;

  const motivationalPhrase = data.credits > totalCredits * 0.3 
    ? '¡Tu potencial de estudio está al máximo! 🔥' 
    : '¡Te estás convirtiendo en un experto! Considerá renovar pronto. ✨';

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-black/40 backdrop-blur-md border border-white/10 p-8 rounded-[2rem] shadow-lg shadow-black/5 flex flex-col gap-4"
    >
      <div className="flex justify-between items-center">
        <h3 className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest flex items-center gap-2">
          <Zap size={14} className="text-emerald-400" />
          Créditos Disponibles
        </h3>
        {isTrial && (
          <span className="bg-emerald-500/20 text-emerald-400 text-[10px] font-bold px-3 py-1 rounded-full uppercase">
            MODO PRUEBA
          </span>
        )}
      </div>

      <div className="flex items-end justify-between">
        <p className="text-3xl font-black text-on-surface">{data.credits} <span className="text-lg text-on-surface-variant">/ {totalCredits}</span></p>
      </div>

      <div className="w-full bg-white/10 rounded-full h-3 overflow-hidden">
        <motion.div 
          className="bg-emerald-500 h-full rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
        />
      </div>

      <p className="text-xs text-on-surface-variant font-medium">{motivationalPhrase}</p>

      <button 
        onClick={() => navigate('/subscription')}
        className="w-full py-3 bg-primary text-on-primary rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-primary/90 transition-all mt-2"
      >
        Cargar más créditos
      </button>
    </motion.div>
  );
};
