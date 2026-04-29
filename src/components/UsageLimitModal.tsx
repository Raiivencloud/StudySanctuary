import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles } from 'lucide-react';

interface UsageLimitModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UsageLimitModal: React.FC<UsageLimitModalProps> = ({ isOpen, onClose }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="w-full max-w-md p-8 bg-surface-container-high/80 backdrop-blur-lg border border-emerald-500/20 rounded-[2rem] shadow-2xl text-center"
          >
            <button onClick={onClose} className="absolute top-4 right-4 text-on-surface-variant hover:text-emerald-500">
              <X size={24} />
            </button>
            <Sparkles className="w-16 h-16 mx-auto text-emerald-500 mb-6" />
            <h2 className="text-2xl font-bold text-on-surface mb-4">¡Tu potencial no tiene límites, pero tus créditos sí! ✨</h2>
            <p className="text-on-surface-variant mb-8">Has alcanzado el límite de consultas gratuitas. Para seguir generando podcasts personalizados, ejercicios inteligentes y resúmenes, elige uno de nuestros planes premium.</p>
            <button className="w-full py-4 bg-emerald-500 text-white rounded-xl font-bold hover:bg-emerald-600 transition-all mb-4">
              Ver Planes de Suscripción
            </button>
            <button onClick={onClose} className="text-sm text-on-surface-variant hover:text-emerald-500 underline">
              Volver al Dashboard
            </button>
            <p className="mt-6 text-[10px] text-on-surface-variant opacity-60">Tus suscripciones ayudan a mantener viva la inteligencia de Study Sanctuary</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
