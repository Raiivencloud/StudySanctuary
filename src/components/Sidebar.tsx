import React from 'react';
import { 
  LayoutDashboard, 
  BrainCircuit, 
  LogOut, 
  Settings, 
  CreditCard, 
  HelpCircle, 
  Files, 
  FileText,
  Sparkles,
  Calendar,
  BookOpen,
  GraduationCap,
  Dumbbell,
  Network,
  Mic2,
  Bot,
  Calculator,
  Library,
  Users,
  MessageSquare,
  EyeOff,
  Eye,
  Sun,
  Moon,
  Upload,
  X,
  Video,
  Zap,
  ShieldCheck,
  Gamepad2
} from 'lucide-react';
import { auth } from '../firebase';
import { View } from '../types';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getUserCredits } from '../services/userService';

interface SidebarProps {
  currentView: View;
  onViewChange: (view: View) => void;
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onViewChange, isOpen, onClose }) => {
  const { user, userProfile, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [credits, setCredits] = React.useState(0);

  React.useEffect(() => {
    if (user) {
      getUserCredits(user.uid).then(data => setCredits(data.credits));
    }

    const handleCreditsUpdate = (event: any) => {
      if (event.detail && typeof event.detail.credits === 'number') {
        setCredits(event.detail.credits);
      }
    };

    window.addEventListener('creditsUpdated', handleCreditsUpdate);
    return () => window.removeEventListener('creditsUpdated', handleCreditsUpdate);
  }, [user]);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, color: 'text-blue-400' },
    { id: 'arena', label: 'Arena Sanctuary', icon: Gamepad2, color: 'text-orange-400' },
    { id: 'courses', label: 'Cursos', icon: BookOpen, color: 'text-cyan-400' },
    { id: 'calendar', label: 'Calendario', icon: Calendar, color: 'text-emerald-400' },
    { id: 'ai', label: 'IA', icon: BrainCircuit, color: 'text-purple-400' },
    { id: 'exams', label: 'Exámenes de Práctica', icon: FileText, color: 'text-rose-400' },
    { id: 'exercises', label: 'Ejercicios', icon: Dumbbell, color: 'text-amber-400' },
    { id: 'diagrams', label: 'Diagramas', icon: Network, color: 'text-indigo-400' },
    { id: 'podcast', label: 'Podcast', icon: Mic2, color: 'text-pink-400' },
    { id: 'virtual-tutor', label: 'Tutor Virtual', icon: Bot, color: 'text-blue-400' },
    { id: 'math', label: 'Matemáticas', icon: Calculator, color: 'text-amber-400' },
    { id: 'multimedia', label: 'Explorador', icon: Sparkles, color: 'text-cyan-400' },
    { id: 'study-groups', label: 'Grupos de Estudio', icon: Users, color: 'text-blue-400' },
    { id: 'subscription', label: 'Suscripción', icon: CreditCard, color: 'text-emerald-400' },
    { id: 'feedback', label: 'Feedback', icon: MessageSquare, color: 'text-pink-400' },
    { id: 'help-center', label: 'Ayuda', icon: HelpCircle, color: 'text-blue-400' },
    { id: 'settings', label: 'Configuración', icon: Settings, color: 'text-zinc-400' },
  ];

  const isAdmin = user?.email === 'Agusgestro17@gmail.com';
  if (isAdmin) {
    navItems.push({ id: 'admin-dashboard', label: 'Admin Panel', icon: ShieldCheck, color: 'text-rose-500' });
  }

  return (
    <>
      {/* Mobile Overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] lg:hidden"
          />
        )}
      </AnimatePresence>

      <aside className={cn(
        // Base / Mobile: Bottom drawer
        "fixed bottom-0 left-0 right-0 w-full h-auto max-h-[90vh] z-[80] flex flex-col rounded-t-[3rem] border-t border-white/10 bg-[#0a1a1a]/90 backdrop-blur-xl shadow-[0_-20px_50px_rgba(0,0,0,0.5)] transition-transform duration-500 ease-in-out",
        isOpen ? "translate-y-0" : "translate-y-full",
        
        // Desktop: Left sidebar
        "lg:fixed lg:top-0 lg:left-0 lg:h-screen lg:w-[280px] lg:z-[1000] lg:flex lg:flex-col lg:bg-black/80 lg:backdrop-blur-2xl lg:border-r lg:border-white/10 lg:transition-all lg:duration-500 lg:translate-y-0 lg:bottom-auto lg:right-auto lg:max-h-none shadow-[20px_0_50px_rgba(0,0,0,0.5)]"
      )}>
        {/* Top Section: Logo */}
        <div className="p-8 flex flex-col items-start gap-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/20">
              <Library className="text-white" size={20} />
            </div>
            {isOpen && (
              <div className="flex flex-col">
                <span className="text-lg font-bold text-white tracking-tight leading-none">Study Sanctuary</span>
                <span className="text-[8px] font-medium text-blue-400 uppercase tracking-[0.2em] mt-1">INTELLIGENT ACADEMY</span>
              </div>
            )}
          </div>
          {isOpen && (
            <button onClick={onClose} className="lg:hidden absolute top-8 right-8 text-white/40 hover:text-white">
              <X size={20} />
            </button>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 space-y-2 overflow-y-auto custom-scrollbar py-4">
          {navItems.map((item) => (
            <button 
              key={item.id}
              onClick={() => {
                onViewChange(item.id as View);
                if (window.innerWidth < 1024) onClose();
              }}
              className={cn(
                "w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all duration-500 group relative overflow-hidden",
                currentView === item.id 
                  ? "bg-gradient-to-r from-blue-500/10 to-pink-500/10 text-white border border-white/10 shadow-lg shadow-blue-500/5" 
                  : "text-white/40 hover:text-white hover:bg-white/5 border border-transparent"
              )}
            >
              <item.icon size={22} className={cn(
                "transition-all duration-500",
                currentView === item.id ? item.color : "group-hover:scale-110 group-hover:text-pink-400"
              )} />
              {isOpen && (
                <span className="text-[11px] font-medium tracking-wide">{item.label}</span>
              )}
              {currentView === item.id && (
                <>
                  <motion.div 
                    layoutId="active-pill"
                    className="absolute right-0 w-1 h-6 bg-blue-500 rounded-l-full shadow-[0_0_15px_rgba(59,130,246,0.5)]"
                  />
                </>
              )}
            </button>
          ))}
        </nav>

        {/* Bottom Section: Profile */}
        <div className="p-6 border-t border-white/5">
          <div className="flex items-center justify-between mb-4 px-2">
            <div className="flex items-center gap-2 text-emerald-400">
              <Zap size={16} />
              <span className="text-xs font-bold">{credits} Créditos</span>
            </div>
          </div>
          <div className={cn(
            "flex items-center gap-3 p-2 rounded-2xl hover:bg-white/5 transition-all duration-300 cursor-pointer group",
            !isOpen && "justify-center"
          )}>
            <img 
              src={userProfile?.photoURL || user?.photoURL || "https://lh3.googleusercontent.com/a/default-user"} 
              alt="User" 
              className="w-10 h-10 rounded-full object-cover border border-white/10"
            />
            {isOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">
                  {userProfile?.displayName || user?.displayName || 'Raiiven Games'}
                </p>
                <p className="text-[10px] text-white/40 truncate">{user?.email || 'agusgestro17@gmail.com'}</p>
              </div>
            )}
          </div>
          
          <button 
            onClick={logout}
            className={cn(
              "w-full mt-4 flex items-center gap-3 px-4 py-3 rounded-xl text-white/40 hover:text-white hover:bg-white/5 transition-all duration-300 group",
              !isOpen && "justify-center"
            )}
          >
            <LogOut size={18} className="group-hover:scale-110 transition-transform" />
            {isOpen && <span className="text-xs font-bold">Cerrar Sesión</span>}
          </button>
        </div>
      </aside>
    </>
  );
};
