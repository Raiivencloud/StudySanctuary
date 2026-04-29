import React from 'react';
import { Award } from 'lucide-react';
import { cn } from '../lib/utils';

interface BadgeProps {
  type: 'silver' | 'gold' | 'founder';
  className?: string;
}

export const UserBadge: React.FC<BadgeProps> = ({ type, className }) => {
  const isGold = type === 'gold';
  const isFounder = type === 'founder';
  
  return (
    <div className={cn(
      "flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border",
      isGold 
        ? "bg-amber-500/10 border-amber-500/30 text-amber-500" 
        : isFounder
          ? "bg-purple-500/10 border-purple-500/30 text-purple-500"
          : "bg-gray-400/10 border-gray-400/30 text-gray-400",
      className
    )}>
      <Award size={12} />
      <span>{isGold ? 'Sello de Miembro de Honor' : isFounder ? 'Fundador' : 'Sello de Estudiante Destacado'}</span>
    </div>
  );
};
