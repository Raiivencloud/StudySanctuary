
import React, { useState, useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { isTrafficLimitReached, getTrafficStats } from '../lib/trafficMonitor';

export const TrafficAlert: React.FC = () => {
  const [show, setShow] = useState(false);
  const [stats, setStats] = useState(getTrafficStats());

  useEffect(() => {
    const check = () => {
      const reached = isTrafficLimitReached();
      if (reached) {
        setShow(true);
        setStats(getTrafficStats());
      }
    };

    const interval = setInterval(check, 10000);
    check(); // Initial check

    return () => clearInterval(interval);
  }, []);

  if (!show) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -50 }}
        className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] w-[90%] max-w-md"
      >
        <div className="bg-red-500/90 backdrop-blur-xl border border-red-400/50 p-4 rounded-2xl shadow-2xl flex items-center gap-4 text-white">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
            <AlertTriangle size={20} />
          </div>
          <div className="flex-1">
            <h4 className="font-black text-xs uppercase tracking-widest">Límite de tráfico alcanzado</h4>
            <p className="text-[10px] opacity-80 leading-tight mt-1">
              Has superado los {stats.limitMB}MB de tráfico en la última hora. Se han desactivado los elementos pesados para ahorrar datos.
            </p>
          </div>
          <button 
            onClick={() => setShow(false)}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
