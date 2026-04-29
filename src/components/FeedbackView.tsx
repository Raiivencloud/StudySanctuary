import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { MessageSquare, Send, Star, AlertCircle, Lightbulb } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

export const FeedbackView: React.FC = () => {
  const { user, userProfile } = useAuth();
  const [type, setType] = useState<'opinion' | 'error' | 'suggestion'>('opinion');
  const [message, setMessage] = useState('');
  const [rating, setRating] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      toast.error('Por favor escribe un mensaje');
      return;
    }
    
    if (!user) {
      toast.error('Debes estar autenticado para enviar feedback');
      return;
    }
    
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'feedback'), {
        userId: user.uid,
        userName: userProfile?.displayName || user.displayName || 'Usuario',
        userPhoto: userProfile?.photoURL || user.photoURL || null,
        type,
        message,
        rating: type === 'opinion' ? rating : null,
        createdAt: serverTimestamp(),
        isPublic: type === 'opinion' && rating >= 4, // Automatically public if high rating
      });
      
      toast.success('¡Gracias por tu feedback! Lo revisaremos pronto.');
      setMessage('');
      setRating(0);
    } catch (error) {
      console.error('Error saving feedback:', error);
      toast.error('Error al enviar el feedback. Inténtalo de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-on-surface mb-2">Feedback</h1>
        <p className="text-on-surface-variant">Tu opinión nos ayuda a mejorar Raiivencloud.</p>
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card p-6 rounded-3xl border border-outline-variant/10 shadow-sm"
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => setType('opinion')}
              className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all ${
                type === 'opinion' 
                  ? 'bg-primary/10 border-primary text-primary' 
                  : 'bg-surface border-outline-variant/10 text-on-surface-variant hover:border-primary/50'
              }`}
            >
              <MessageSquare className="w-6 h-6" />
              <span className="text-sm font-medium">Opinión</span>
            </button>
            <button
              type="button"
              onClick={() => setType('error')}
              className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all ${
                type === 'error' 
                  ? 'bg-red-500/10 border-red-500 text-red-500' 
                  : 'bg-surface border-outline-variant/10 text-on-surface-variant hover:border-red-500/50'
              }`}
            >
              <AlertCircle className="w-6 h-6" />
              <span className="text-sm font-medium">Error</span>
            </button>
            <button
              type="button"
              onClick={() => setType('suggestion')}
              className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all ${
                type === 'suggestion' 
                  ? 'bg-amber-500/10 border-amber-500 text-amber-500' 
                  : 'bg-surface border-outline-variant/10 text-on-surface-variant hover:border-amber-500/50'
              }`}
            >
              <Lightbulb className="w-6 h-6" />
              <span className="text-sm font-medium">Sugerencia</span>
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-on-surface-variant mb-2">
              ¿Qué te gustaría decirnos?
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Escribe aquí tus comentarios..."
              className="w-full h-32 bg-surface border border-outline-variant/10 rounded-2xl p-4 text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all resize-none"
            />
          </div>

          {type === 'opinion' && (
            <div>
              <label className="block text-sm font-medium text-on-surface-variant mb-3">
                Calificación general
              </label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    className="p-1 transition-transform hover:scale-110"
                  >
                    <Star 
                      className={`w-8 h-8 ${
                        star <= rating ? 'fill-amber-400 text-amber-400' : 'text-outline-variant'
                      }`} 
                    />
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-primary text-on-primary py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-primary/90 transition-all disabled:opacity-50"
          >
            {isSubmitting ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              >
                <Send className="w-5 h-5" />
              </motion.div>
            ) : (
              <>
                <Send className="w-5 h-5" />
                Enviar Feedback
              </>
            )}
          </button>
        </form>
      </motion.div>
    </div>
  );
};
