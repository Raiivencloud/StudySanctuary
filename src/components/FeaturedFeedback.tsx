import React, { useState, useEffect } from 'react';
import { collection, query, where, limit, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { motion, AnimatePresence } from 'framer-motion';
import { Star } from 'lucide-react';

interface FeedbackItem {
  id: string;
  userName: string;
  userPhoto: string;
  message: string;
  rating: number;
}

export const FeaturedFeedback: React.FC = () => {
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFeedbacks = async () => {
      try {
        const q = query(
          collection(db, 'feedback'),
          where('isPublic', '==', true),
          limit(10)
        );
        const querySnapshot = await getDocs(q);
        const items: FeedbackItem[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          items.push({
            id: doc.id,
            userName: data.userName || 'Estudiante',
            userPhoto: data.userPhoto || '',
            message: data.message || '',
            rating: data.rating || 5,
          });
        });
        setFeedbacks(items);
      } catch (error) {
        console.error('Error fetching featured feedback:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchFeedbacks();
  }, []);

  useEffect(() => {
    if (feedbacks.length > 1) {
      const interval = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % feedbacks.length);
      }, 10000); // Change every 10 seconds for demo, user said "weekly" but usually these rotators are faster
      return () => clearInterval(interval);
    }
  }, [feedbacks]);

  if (loading || feedbacks.length === 0) return null;

  const current = feedbacks[currentIndex];

  return (
    <div className="fixed bottom-24 md:bottom-4 left-1/2 -translate-x-1/2 z-[40] pointer-events-none w-full max-w-xs px-4">
      <AnimatePresence mode="wait">
        <motion.div
          key={current.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="bg-surface-container-low/80 backdrop-blur-sm border border-outline-variant/10 rounded-full py-1.5 px-3 flex items-center gap-2 shadow-lg mx-auto w-fit"
        >
          <div className="w-6 h-6 rounded-full overflow-hidden border border-primary/20 flex-shrink-0">
            {current.userPhoto ? (
              <img src={current.userPhoto} alt={current.userName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-full h-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                {current.userName.charAt(0)}
              </div>
            )}
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-bold text-on-surface truncate max-w-[80px]">{current.userName}</span>
              <div className="flex gap-0.5">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} size={6} className={i < current.rating ? "fill-primary text-primary" : "text-outline-variant"} />
                ))}
              </div>
            </div>
            <p className="text-[8px] text-on-surface-variant truncate max-w-[120px] italic">"{current.message}"</p>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
