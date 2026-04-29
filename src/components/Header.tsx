import React, { useState, useRef, useEffect } from 'react';
import { Search, Bell, HelpCircle, Sun, Moon, LogOut, User as UserIcon, Settings, CreditCard, CheckCircle2, Clock, Menu } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { View } from '../types';
import { cn } from '../lib/utils';
import { UserBadge } from './UserBadge';

interface HeaderProps {
  onViewChange?: (view: View) => void;
  onToggleSidebar?: () => void;
  onSearch?: (query: string) => void;
}

export const Header: React.FC<HeaderProps> = ({ onViewChange, onToggleSidebar, onSearch }) => {
  const { t, language, setLanguage } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const { user, userProfile, logout } = useAuth();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const searchableResources = [
    { id: 'dashboard', title: 'Dashboard', view: 'dashboard' },
    { id: 'ai', title: 'AI Study', view: 'ai' },
    { id: 'files', title: 'Files', view: 'files' },
    { id: 'multimedia', title: 'Multimedia', view: 'multimedia' },
    { id: 'settings', title: 'Settings', view: 'settings' },
    { id: 'exams', title: 'Exams', view: 'exams' },
    { id: 'exercises', title: 'Exercises', view: 'exercises' },
  ];

  const filteredResults = searchableResources.filter(r => 
    r.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && filteredResults.length > 0) {
      onViewChange?.(filteredResults[0].view as View);
      setSearchQuery('');
      setShowResults(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const [notifications, setNotifications] = useState([
    { id: 1, title: 'Nuevo material disponible', message: 'Se ha generado un nuevo resumen de Anatomía.', time: 'Hace 5 min', icon: CheckCircle2, color: 'text-emerald-400', read: false },
    { id: 2, title: 'Examen próximo', message: 'Recuerda tu examen de Bioquímica mañana.', time: 'Hace 2h', icon: Clock, color: 'text-amber-400', read: false },
    { id: 3, title: 'Suscripción', message: 'Tu periodo de prueba termina en 2 días.', time: 'Hace 5h', icon: CreditCard, color: 'text-indigo-400', read: false },
  ]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAsRead = (id?: number) => {
    if (id) {
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    } else {
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    }
  };

  return (
    <header className="flex justify-between items-center mx-4 md:mx-8 mt-4 py-4 px-6 bg-black/20 backdrop-blur-md sticky top-0 z-40 border border-white/10 shadow-2xl shadow-black/20 rounded-2xl">
      <div className="flex items-center gap-4 md:gap-6 flex-1">
        <button 
          onClick={onToggleSidebar}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary/10 text-primary hover:bg-primary/20 rounded-2xl transition-all lg:hidden border border-primary/30 shadow-[0_0_20px_rgba(34,211,238,0.1)]"
        >
          <Menu size={18} />
          <span className="text-[10px] font-black uppercase tracking-widest">MENÚ</span>
        </button>
        
        <div className="relative w-full max-w-lg hidden md:block group z-[100] rounded-full">
          <div className="absolute inset-0 bg-primary/5 blur-xl rounded-full opacity-0 group-focus-within:opacity-100 transition-opacity pointer-events-none" />
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant group-focus-within:text-primary transition-colors z-[101]" size={18} />
          <input 
            className="w-full bg-surface-container border border-outline-variant rounded-full py-3 pl-12 pr-6 text-xs text-on-surface focus:border-primary/40 focus:bg-surface-container-high transition-all outline-none shadow-inner z-[101] relative" 
            placeholder="Buscar..."
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowResults(true);
            }}
            onKeyDown={handleSearch}
            onBlur={() => setTimeout(() => setShowResults(false), 200)}
          />
          {showResults && searchQuery && (
            <div className="absolute top-full left-0 w-full mt-2 bg-surface-container rounded-3xl border border-outline-variant shadow-xl z-[102] overflow-hidden">
              {filteredResults.length > 0 ? (
                filteredResults.map((result) => (
                  <button 
                    key={result.id} 
                    className="w-full text-left px-4 py-3 hover:bg-surface-container-high text-xs text-on-surface transition-colors"
                    onClick={() => {
                      onViewChange?.(result.view as View);
                      setSearchQuery('');
                      setShowResults(false);
                    }}
                  >
                    {result.title}
                  </button>
                ))
              ) : (
                <div className="px-4 py-3 text-xs text-on-surface-variant">No se encontraron resultados</div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 md:gap-6 z-[100]">
        <div className="hidden sm:flex items-center bg-surface-container-low rounded-full p-1.5 border border-outline-variant shadow-inner">
          <button 
            onClick={() => setLanguage('es')}
            className={cn(
              "px-4 py-1.5 text-[10px] font-black rounded-full transition-all duration-300",
              language === 'es' 
                ? "bg-gradient-to-br from-primary to-primary/80 text-on-primary shadow-lg shadow-primary/30 border border-on-surface/20" 
                : "text-on-surface-variant hover:text-on-surface"
            )}
          >
            ES
          </button>
          <button 
            onClick={() => setLanguage('en')}
            className={cn(
              "px-4 py-1.5 text-[10px] font-black rounded-full transition-all duration-300",
              language === 'en' 
                ? "bg-gradient-to-br from-primary to-primary/80 text-on-primary shadow-lg shadow-primary/30 border border-on-surface/20" 
                : "text-on-surface-variant hover:text-on-surface"
            )}
          >
            EN
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={toggleTheme}
            className="p-3 text-on-surface-variant hover:bg-on-surface/5 hover:text-primary rounded-full transition-all border border-transparent hover:border-outline-variant/10"
          >
            {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
          </button>
          
          {/* Notifications */}
          <div className="relative" ref={notificationRef}>
            <button 
              onClick={() => setShowNotifications(!showNotifications)}
              className={cn(
                "p-3 text-on-surface-variant hover:bg-on-surface/5 hover:text-primary rounded-full transition-all relative border border-transparent hover:border-outline-variant/10",
                showNotifications && "bg-on-surface/10 border-outline-variant/10 text-primary"
              )}
            >
              <Bell size={20} />
              {unreadCount > 0 && (
                <span className="absolute top-3 right-3 w-2 h-2 bg-primary rounded-full border-2 border-surface shadow-[0_0_10px_rgba(34,211,238,0.8)]" />
              )}
            </button>
            
            <AnimatePresence>
              {showNotifications && (
                <motion.div
                  initial={{ opacity: 0, y: 15, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 15, scale: 0.95 }}
                  className="absolute right-0 mt-4 w-[calc(100vw-2rem)] sm:w-96 bg-surface-container-low/95 backdrop-blur-2xl rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-outline-variant z-[105] overflow-hidden"
                >
                  <div className="p-6 border-b border-outline-variant flex justify-between items-center bg-on-surface/5">
                    <h3 className="font-black text-[11px] uppercase tracking-[0.3em] text-on-surface">NOTIFICACIONES</h3>
                    {unreadCount > 0 && (
                      <button 
                        onClick={() => markAsRead()}
                        className="text-[10px] text-primary font-black hover:text-primary/80 transition-colors uppercase tracking-widest"
                      >
                        MARCAR TODO LEÍDO
                      </button>
                    )}
                  </div>
                  <div className="max-h-[32rem] overflow-y-auto custom-scrollbar">
                    {notifications.length > 0 ? (
                      notifications.map((n) => (
                        <div 
                          key={n.id} 
                          onClick={() => markAsRead(n.id)}
                          className={cn(
                            "p-5 hover:bg-on-surface/5 transition-all cursor-pointer border-b border-outline-variant last:border-0 relative group",
                            !n.read && "bg-primary/5"
                          )}
                        >
                          {!n.read && (
                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary shadow-[0_0_15px_rgba(34,211,238,0.5)]" />
                          )}
                          <div className="flex gap-4">
                            <div className={cn(
                              "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-110",
                              n.read ? "bg-on-surface/5 text-on-surface-variant" : "bg-primary/20 " + n.color
                            )}>
                              <n.icon size={18} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between items-start gap-2">
                                <p className={cn("text-xs font-black truncate", n.read ? "text-on-surface-variant" : "text-on-surface")}>{n.title}</p>
                                <p className="text-[9px] text-on-surface-variant font-black uppercase whitespace-nowrap">{n.time}</p>
                              </div>
                              <p className="text-[11px] text-on-surface-variant mt-1 leading-relaxed line-clamp-2">{n.message}</p>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-12 text-center">
                        <div className="w-16 h-16 bg-on-surface/5 rounded-full flex items-center justify-center mx-auto mb-4">
                          <Bell size={32} className="text-on-surface-variant" />
                        </div>
                        <p className="text-xs text-on-surface-variant font-bold">No hay notificaciones</p>
                      </div>
                    )}
                  </div>
                  <div className="p-4 bg-on-surface/5 text-center border-t border-outline-variant">
                    <button className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant hover:text-primary transition-colors">VER HISTORIAL COMPLETO</button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button 
            onClick={() => onViewChange?.('help-center')}
            className="p-3 text-on-surface-variant hover:bg-on-surface/5 hover:text-primary rounded-full transition-all hidden sm:block border border-transparent hover:border-outline-variant/10"
          >
            <HelpCircle size={20} />
          </button>
        </div>

        {/* Profile Menu */}
        <div className="relative" ref={profileRef}>
          <button 
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="flex items-center gap-4 pl-4 border-l border-outline-variant hover:opacity-80 transition-all group"
          >
            <div className="text-right hidden lg:block bg-white/5 px-4 py-2 rounded-full">
              <div className="flex items-center justify-end gap-2">
                <p className="text-xs font-black text-on-surface truncate max-w-[140px] group-hover:text-primary transition-colors">
                  {userProfile?.displayName || user?.displayName || 'Andrés Vignalo'}
                </p>
                {user?.email === 'Agusgestro17@gmail.com' && <UserBadge type="founder" />}
                {userProfile?.subscription?.planName === 'Trimestral' && <UserBadge type="silver" />}
                {userProfile?.subscription?.planName === 'Anual' && <UserBadge type="gold" />}
              </div>
              <p className="text-[10px] text-on-surface-variant font-bold truncate">
                {user?.email || 'vignaloandres05@gmail.com'}
              </p>
            </div>
            <div className="relative">
              <div className="absolute inset-0 bg-primary/20 blur-md rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="h-11 w-11 rounded-full overflow-hidden border-2 border-outline-variant shadow-2xl shadow-black/50 relative">
                <img 
                  alt={userProfile?.displayName || user?.displayName || "Perfil Estudiante"} 
                  className="w-full h-full object-cover" 
                  src={userProfile?.photoURL || user?.photoURL || "https://lh3.googleusercontent.com/a/default-user"}
                  referrerPolicy="no-referrer"
                />
              </div>
            </div>
          </button>


          <AnimatePresence>
            {showProfileMenu && (
              <motion.div
                initial={{ opacity: 0, y: 15, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 15, scale: 0.95 }}
                className="absolute right-0 mt-4 w-64 bg-surface-container-low/95 backdrop-blur-2xl rounded-[2rem] shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-outline-variant z-50 overflow-hidden"
              >
                <div className="p-6 border-b border-outline-variant bg-on-surface/5">
                  <div className="flex items-center gap-3 mb-3">
                    <img 
                      src={userProfile?.photoURL || user?.photoURL || "https://lh3.googleusercontent.com/a/default-user"} 
                      className="w-10 h-10 rounded-xl object-cover border border-outline-variant"
                      alt="Avatar"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-black text-on-surface truncate">{userProfile?.displayName || user?.displayName || 'Estudiante'}</p>
                      <p className="text-[9px] text-primary font-black uppercase tracking-widest">PLAN PREMIUM</p>
                    </div>
                  </div>
                </div>
                <div className="p-3">
                  <button 
                    onClick={() => {
                      onViewChange?.('settings');
                      setShowProfileMenu(false);
                    }}
                    className="flex items-center w-full gap-4 px-4 py-3 rounded-2xl text-xs font-black text-on-surface-variant hover:text-on-surface hover:bg-on-surface/5 transition-all group"
                  >
                    <UserIcon size={18} className="group-hover:text-primary transition-colors" />
                    <span className="uppercase tracking-widest text-[10px]">MI PERFIL</span>
                  </button>
                  <button 
                    onClick={() => {
                      onViewChange?.('settings');
                      setShowProfileMenu(false);
                    }}
                    className="flex items-center w-full gap-4 px-4 py-3 rounded-2xl text-xs font-black text-on-surface-variant hover:text-on-surface hover:bg-on-surface/5 transition-all group"
                  >
                    <Settings size={18} className="group-hover:text-primary transition-colors" />
                    <span className="uppercase tracking-widest text-[10px]">CONFIGURACIÓN</span>
                  </button>
                  <button 
                    onClick={() => {
                      onViewChange?.('subscription');
                      setShowProfileMenu(false);
                    }}
                    className="flex items-center w-full gap-4 px-4 py-3 rounded-2xl text-xs font-black text-on-surface-variant hover:text-on-surface hover:bg-on-surface/5 transition-all group"
                  >
                    <CreditCard size={18} className="group-hover:text-primary transition-colors" />
                    <span className="uppercase tracking-widest text-[10px]">SUSCRIPCIÓN</span>
                  </button>
                  <div className="my-2 border-t border-outline-variant" />
                  <button 
                    onClick={() => {
                      logout();
                      setShowProfileMenu(false);
                    }}
                    className="flex items-center w-full gap-4 px-4 py-3 rounded-2xl text-xs font-black text-red-400 hover:bg-red-500/10 transition-all group"
                  >
                    <LogOut size={18} />
                    <span className="uppercase tracking-widest text-[10px]">CERRAR SESIÓN</span>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
};
