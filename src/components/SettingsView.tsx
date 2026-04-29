import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { useMusic } from '../contexts/MusicContext';
import { 
  User, 
  Mail, 
  Shield, 
  LogOut, 
  Globe, 
  Moon, 
  Sun, 
  Bell, 
  ChevronRight,
  ExternalLink,
  Camera,
  Image as ImageIcon,
  Lock,
  Check,
  X,
  Zap,
  Music,
  Music2,
  Video,
  Palette,
  Phone,
  Star,
  Upload,
  Link as LinkIcon
} from 'lucide-react';
import { cn, compressImage } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { doc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';

export const SettingsView: React.FC = () => {
  const { user, userProfile, logout, updateProfile } = useAuth();
  const { language, setLanguage } = useLanguage();
  const { theme, toggleTheme, wallpaper, setWallpaper } = useTheme();
  const [profilePic, setProfilePic] = useState(userProfile?.photoURL || user?.photoURL || "https://lh3.googleusercontent.com/aida-public/AB6AXuCkBia4OQbd5xt2ohXN2KjGKrIb4XmLzn0liM3RZdJGDOOBjeht7X1UYaRWSYGK3jnIdNxIFPKkMvIsZPamnZ9uQ663BHw7tY354ld5iUW0n69akoBbJ_mmlCKV0nYg-JEQNCdxN-cmUR5PaZHuIq_0uL_MJdA51pAajEbXsSxJ9G26xyRgBITM3dtUT5FuXSv6fr3ACe5h9DEAHJ26lYkG8tSpACNg1bjGzMuw6jAsuuW30T34Mu3sc9sWYtE74NuDPMGY9KcUV0UF");
  const [bannerPic, setBannerPic] = useState(userProfile?.bannerURL || "https://images.unsplash.com/photo-1516979187457-637abb4f9353?auto=format&fit=crop&w=1200&q=80");
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [isUpdatingWallpaper, setIsUpdatingWallpaper] = useState(false);
  const [customWallpaperUrl, setCustomWallpaperUrl] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);

  const wallpapers = [
    { id: 'none', name: 'Original', url: null, color: 'bg-surface-container-highest' },
    { id: 'nature', name: 'Naturaleza', url: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=1920&q=80', color: 'bg-green-900' },
    { id: 'space', name: 'Espacio', url: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1920&q=80', color: 'bg-indigo-900' },
    { id: 'abstract', name: 'Abstracto', url: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?auto=format&fit=crop&w=1920&q=80', color: 'bg-purple-900' },
    { id: 'minimal', name: 'Minimalista', url: 'https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?auto=format&fit=crop&w=1920&q=80', color: 'bg-zinc-800' },
    { id: 'forest', name: 'Bosque', url: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1920&q=80', color: 'bg-emerald-900' },
    { id: 'library', name: 'Biblioteca', url: 'https://images.unsplash.com/photo-1507842217343-583bb7270b66?auto=format&fit=crop&w=1920&q=80', color: 'bg-amber-900' },
    { id: 'mountain', name: 'Montañas', url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1920&q=80', color: 'bg-slate-900' }
  ];

  const handleUpdateWallpaper = async (url: string | null) => {
    if (!user) return;
    setIsUpdatingWallpaper(true);
    try {
      setWallpaper(url);
      const path = `users/${user.uid}`;
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          'preferences.wallpaperUrl': url,
          'preferences.wallpaperType': 'image'
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
      toast.success('Fondo de pantalla actualizado');
    } catch (error) {
      console.error('Error updating wallpaper:', error);
      toast.error('Error al actualizar el fondo');
    } finally {
      setIsUpdatingWallpaper(false);
    }
  };

  const handleWallpaperUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && user) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const rawBase64 = reader.result as string;
          const compressedBase64 = await compressImage(rawBase64, 1920, 1080, 0.7);
          handleUpdateWallpaper(compressedBase64);
        } catch (error) {
          console.error("Error processing wallpaper:", error);
          toast.error('Error al procesar la imagen');
        }
      };
      reader.readAsDataURL(file);
    }
  };

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentStatus = params.get('payment');
    if (paymentStatus === 'success') {
      toast.success('¡Pago procesado con éxito! Tu suscripción se actualizará en unos instantes.');
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
    } else if (paymentStatus === 'failure') {
      toast.error('Hubo un problema con el pago. Por favor intenta nuevamente.');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, type: 'profile' | 'banner') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const rawBase64 = reader.result as string;
          // Compress image to fit Firestore 1MB limit (aiming for ~200KB)
          const compressedBase64 = await compressImage(
            rawBase64, 
            type === 'profile' ? 400 : 1200, // Width
            type === 'profile' ? 400 : 400,  // Height
            0.6 // Quality
          );

          if (type === 'profile') {
            setProfilePic(compressedBase64);
            await updateProfile({ photoURL: compressedBase64 });
          } else {
            setBannerPic(compressedBase64);
            await updateProfile({ bannerURL: compressedBase64 });
          }
          toast.success('Imagen actualizada');
        } catch (error) {
          console.error("Error updating profile image:", error);
          toast.error('Error al procesar la imagen');
        }
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 px-4 md:px-0">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold font-headline text-on-surface">Configuración</h2>
          <p className="text-on-surface-variant">Gestiona tu perfil y preferencias de la plataforma</p>
        </div>
        <button 
          onClick={handleLogout}
          className="flex items-center gap-2 px-6 py-3 bg-error/10 text-error rounded-2xl font-bold hover:bg-error hover:text-on-error transition-all self-start md:self-center"
        >
          <LogOut size={20} />
          {'Cerrar Sesión'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Profile Section */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-card backdrop-blur-xl rounded-[2.5rem] border border-outline-variant/10 flex flex-col items-center text-center space-y-6 relative overflow-hidden pb-8 shadow-2xl">
            <div className="relative w-full h-32 group">
              <img 
                src={bannerPic} 
                alt="Banner" 
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <label className="cursor-pointer p-2 bg-on-surface/20 backdrop-blur-md rounded-full text-on-surface hover:bg-on-surface/40 transition-all">
                  <Camera size={20} />
                  <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileChange(e, 'banner')} />
                </label>
              </div>
            </div>
            
            <div className="relative group -mt-16">
              <div className="h-32 w-32 rounded-full overflow-hidden border-4 border-card shadow-xl bg-surface-container">
                <img 
                  src={profilePic} 
                  alt={user?.displayName || "Profile"}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
              <label className="absolute bottom-0 right-0 p-2 bg-primary text-on-primary rounded-full shadow-lg hover:scale-110 transition-transform cursor-pointer">
                <Camera size={18} />
                <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileChange(e, 'profile')} />
              </label>
            </div>

            <div className="space-y-1 px-8">
              <h3 className="text-2xl font-bold text-on-surface">{user?.displayName || 'Estudiante'}</h3>
              <p className="text-on-surface-variant flex items-center justify-center gap-2">
                <Mail size={14} />
                {user?.email}
              </p>
            </div>

            <div className="flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary rounded-full text-xs font-bold uppercase tracking-wider">
              <Shield size={14} />
              Cuenta Verificada
            </div>

            <div className="w-full px-8 pt-6 border-t border-outline-variant/5 grid grid-cols-2 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-primary">12</p>
                <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">Cursos</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-secondary">85%</p>
                <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">Progreso</p>
              </div>
            </div>
          </div>

          <div className="bg-card backdrop-blur-xl p-6 rounded-3xl border border-outline-variant/10 space-y-4 shadow-xl">
            <h4 className="text-sm font-bold uppercase tracking-widest text-on-surface-variant">Seguridad</h4>
            <div className="space-y-2">
              <button 
                onClick={() => setShowPasswordModal(true)}
                className="w-full flex items-center justify-between p-4 rounded-2xl hover:bg-surface-container transition-all group"
              >
                <div className="flex items-center gap-3 text-on-surface">
                  <Lock size={20} className="text-primary" />
                  <span className="font-medium">Contraseña</span>
                </div>
                <ChevronRight size={18} className="text-on-surface-variant group-hover:translate-x-1 transition-transform" />
              </button>
              <button className="w-full flex items-center justify-between p-4 rounded-2xl hover:bg-surface-container transition-all group">
                <div className="flex items-center gap-3 text-on-surface">
                  <Shield size={20} className="text-primary" />
                  <span className="font-medium">Privacidad de la cuenta</span>
                </div>
                <ChevronRight size={18} className="text-on-surface-variant group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
        </div>

        {/* Settings Options */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-card backdrop-blur-xl p-6 md:p-8 rounded-[2.5rem] border border-outline-variant/10 space-y-8 shadow-2xl">
            <section className="space-y-8">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-tertiary/10 text-tertiary rounded-2xl shadow-inner">
                  <Star size={22} />
                </div>
                <div>
                  <h4 className="text-sm font-bold uppercase tracking-widest text-on-surface-variant leading-none mb-1">Suscripción</h4>
                  <h3 className="text-2xl font-bold text-on-surface font-headline">Tu Plan Actual</h3>
                </div>
              </div>

              <div className="bg-gradient-to-br from-primary/10 via-surface-container/20 to-surface-container/20 rounded-[2.5rem] p-6 md:p-8 border border-primary/20 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-6 opacity-10">
                  <Zap size={120} className="text-primary" />
                </div>
                
                <div className="relative z-10 space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="p-4 bg-primary text-on-primary rounded-2xl shadow-lg">
                      <Zap size={32} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-primary uppercase tracking-widest">Plan de Prueba</p>
                      <h4 className="text-3xl font-bold text-on-surface font-headline">7 Días Gratis</h4>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <p className="text-on-surface-variant leading-relaxed">
                      Disfruta de todas las funciones premium de Study Sanctuary sin costo durante tus primeros 7 días. 
                      Al finalizar el periodo de prueba, podrás elegir el plan que mejor se adapte a tus necesidades.
                    </p>
                    
                    <div className="flex flex-wrap gap-3">
                      <div className="px-4 py-2 bg-surface-container rounded-full text-xs font-bold text-on-surface-variant border border-outline-variant/10">
                        IA Ilimitada
                      </div>
                      <div className="px-4 py-2 bg-surface-container rounded-full text-xs font-bold text-on-surface-variant border border-outline-variant/10">
                        Grupos de Estudio
                      </div>
                      <div className="px-4 py-2 bg-surface-container rounded-full text-xs font-bold text-on-surface-variant border border-outline-variant/10">
                        Sincronización Drive
                      </div>
                    </div>
                  </div>

                  <div className="pt-4">
                    <button 
                      onClick={() => window.location.href = '/subscription'}
                      className="w-full sm:w-auto px-8 py-4 bg-primary text-on-primary rounded-2xl font-bold hover:scale-105 transition-all shadow-lg shadow-primary/20"
                    >
                      Ver Planes Disponibles
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <div className="h-px bg-outline-variant/10 w-full" />

            <section id="design-section" className="space-y-8 scroll-mt-24">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-primary/10 text-primary rounded-2xl shadow-inner">
                    <ImageIcon size={22} />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold uppercase tracking-widest text-on-surface-variant leading-none mb-1">Personalización</h4>
                    <h3 className="text-2xl font-bold text-on-surface font-headline">Diseño del Santuario</h3>
                  </div>
                </div>
                <div className="px-4 py-1.5 bg-gradient-to-r from-primary via-secondary to-tertiary text-on-primary rounded-full text-[10px] font-bold uppercase tracking-widest shadow-lg shadow-secondary/20 animate-pulse">Premium</div>
              </div>
              
              <div className="space-y-10">
                {/* Wallpaper Selector */}
                <div className="space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <p className="font-bold text-on-surface text-lg">Ambientes de Estudio</p>
                      <p className="text-sm text-on-surface-variant">Transforma tu espacio con fondos relajantes</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="cursor-pointer px-4 py-2 bg-primary/10 text-primary rounded-xl text-xs font-bold hover:bg-primary/20 transition-all flex items-center gap-2">
                        <Upload size={14} />
                        Subir Imagen
                        <input type="file" className="hidden" accept="image/*" onChange={handleWallpaperUpload} />
                      </label>
                      <button 
                        onClick={() => setShowUrlInput(!showUrlInput)}
                        className="px-4 py-2 bg-secondary/10 text-secondary rounded-xl text-xs font-bold hover:bg-secondary/20 transition-all flex items-center gap-2"
                      >
                        <LinkIcon size={14} />
                        Desde URL
                      </button>
                    </div>
                  </div>

                  <AnimatePresence>
                    {showUrlInput && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="flex gap-2 p-4 bg-surface-container rounded-2xl border border-outline-variant/10">
                          <input 
                            type="url" 
                            value={customWallpaperUrl}
                            onChange={(e) => setCustomWallpaperUrl(e.target.value)}
                            placeholder="Pega la URL de la imagen aquí..."
                            className="flex-1 bg-transparent border-none outline-none text-sm text-on-surface"
                          />
                          <button 
                            onClick={() => {
                              if (customWallpaperUrl) {
                                handleUpdateWallpaper(customWallpaperUrl);
                                setCustomWallpaperUrl('');
                                setShowUrlInput(false);
                              }
                            }}
                            className="px-4 py-2 bg-primary text-on-primary rounded-xl text-xs font-bold"
                          >
                            Aplicar
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {wallpapers.map((wp) => (
                      <motion.button 
                        key={wp.id}
                        whileHover={{ scale: 1.05, y: -5 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleUpdateWallpaper(wp.url)}
                        className={cn(
                          "group relative aspect-[16/10] rounded-[2rem] overflow-hidden border-2 transition-all shadow-lg hover:shadow-2xl",
                          wallpaper === wp.url 
                            ? "border-primary shadow-lg shadow-primary/20" 
                            : "border-outline-variant/10 hover:border-primary/50"
                        )}
                      >
                        <div className={cn("absolute inset-0 opacity-20", wp.color)} />
                        {wp.id === 'none' ? (
                          <div className="w-full h-full bg-surface-container flex items-center justify-center">
                            <ImageIcon size={32} className="text-on-surface-variant opacity-40" />
                          </div>
                        ) : (
                          <img 
                            src={wp.url || ''} 
                            className="w-full h-full object-cover" 
                            alt={wp.name} 
                            referrerPolicy="no-referrer"
                          />
                        )}
                        
                        {/* Overlay Info */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-end p-4">
                          <div className="flex items-center gap-2">
                            <div className="p-2 bg-on-surface/20 backdrop-blur-md rounded-xl border border-on-surface/10">
                              <ImageIcon size={14} className="text-on-surface" />
                            </div>
                            <div className="text-left">
                              <p className="text-[10px] font-bold text-on-surface/60 uppercase tracking-widest leading-none mb-1">Estático</p>
                              <p className="text-sm font-bold text-on-surface leading-none">{wp.name}</p>
                            </div>
                          </div>
                        </div>
                        
                        {/* Selection Indicator */}
                        {wallpaper === wp.url && (
                          <div className="absolute top-3 right-3">
                            <div className="p-1.5 bg-primary text-on-primary rounded-full shadow-lg">
                              <Check size={12} />
                            </div>
                          </div>
                        )}
                      </motion.button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                  <div className="space-y-4 p-6 rounded-3xl bg-surface-container/30 border border-outline-variant/10">
                    <div className="flex items-center gap-3 mb-2">
                      <Globe size={18} className="text-primary" />
                      <p className="font-bold text-on-surface">Idioma</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { code: 'es', label: 'Español' },
                        { code: 'en', label: 'English' },
                        { code: 'pt', label: 'Português' }
                      ].map((lang) => (
                        <button 
                          key={lang.code}
                          onClick={() => setLanguage(lang.code as any)}
                          className={cn(
                            "px-5 py-2.5 text-xs font-bold rounded-xl border transition-all flex items-center gap-2",
                            language === lang.code 
                              ? "bg-primary text-on-primary border-primary shadow-lg shadow-primary/20" 
                              : "bg-surface-container text-on-surface-variant border-outline-variant/10 hover:border-primary/30"
                          )}
                        >
                          {lang.label}
                          {language === lang.code && <Check size={14} />}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4 p-6 rounded-3xl bg-surface-container/30 border border-outline-variant/10">
                    <div className="flex items-center gap-3 mb-2">
                      {theme === 'light' ? <Sun size={18} className="text-primary" /> : <Moon size={18} className="text-primary" />}
                      <p className="font-bold text-on-surface">Tema visual</p>
                    </div>
                    <div className="flex gap-3">
                      <button 
                        onClick={() => theme !== 'light' && toggleTheme()}
                        className={cn(
                          "flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl border transition-all font-bold text-xs",
                          theme === 'light' ? "bg-primary text-on-primary border-primary shadow-lg shadow-primary/20" : "bg-surface-container text-on-surface-variant border-outline-variant/10"
                        )}
                      >
                        <Sun size={18} />
                        Claro
                      </button>
                      <button 
                        onClick={() => theme !== 'dark' && toggleTheme()}
                        className={cn(
                          "flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl border transition-all font-bold text-xs",
                          theme === 'dark' ? "bg-primary text-on-primary border-primary shadow-lg shadow-primary/20" : "bg-surface-container text-on-surface-variant border-outline-variant/10"
                        )}
                      >
                        <Moon size={18} />
                        Oscuro
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <div className="h-px bg-outline-variant/10 w-full" />

            <section className="space-y-6">
              <h4 className="text-sm font-bold uppercase tracking-widest text-on-surface-variant">Notificaciones</h4>
              
              <div className="space-y-4">
                {[
                  { id: 'exams', label: 'Recordatorios de exámenes', desc: 'Recibe alertas 24h antes de tus exámenes' },
                  { id: 'study', label: 'Sesiones de estudio', desc: 'Notificaciones para tus bloques de estudio programados' },
                  { id: 'ai', label: 'Sugerencias de IA', desc: 'Nuevos resúmenes y planes generados' }
                ].map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-4 rounded-2xl bg-surface-container/30 border border-outline-variant/10">
                    <div className="space-y-0.5">
                      <p className="font-bold text-on-surface">{item.label}</p>
                      <p className="text-[11px] text-on-surface-variant">{item.desc}</p>
                    </div>
                    <div className="relative inline-flex h-6 w-11 items-center rounded-full bg-primary/20 cursor-pointer">
                      <span className="inline-block h-4 w-4 transform rounded-full bg-primary transition translate-x-6" />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <div className="h-px bg-outline-variant/10 w-full" />

            <section className="space-y-8">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-primary/10 text-primary rounded-2xl shadow-inner">
                  <Phone size={22} />
                </div>
                <div>
                  <h4 className="text-sm font-bold uppercase tracking-widest text-on-surface-variant leading-none mb-1">Soporte</h4>
                  <h3 className="text-2xl font-bold text-on-surface font-headline">Ayuda Directa</h3>
                </div>
              </div>

              <div className="bg-surface-container/30 rounded-[2.5rem] p-6 md:p-8 border border-outline-variant/10 shadow-xl">
                <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                  <div className="space-y-2 text-center md:text-left">
                    <p className="text-lg font-bold text-on-surface">¿Necesitas ayuda personalizada?</p>
                    <p className="text-sm text-on-surface-variant">¿Tenés dudas? Unite a nuestro Discord oficial para ayuda en tiempo real.</p>
                  </div>
                  <a 
                    href="https://discord.gg/Y5yFKEYD9r" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="w-full md:w-auto flex items-center justify-center gap-3 px-8 py-4 bg-[#5865F2] text-white rounded-2xl font-bold hover:scale-105 transition-all shadow-lg shadow-[#5865F2]/20"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.062 14.062 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                    </svg>
                    Unirse a Discord
                  </a>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
      {/* Password Modal */}
      <AnimatePresence>
        {showPasswordModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-card backdrop-blur-2xl border border-outline-variant/10 rounded-3xl w-[95%] max-w-md p-8 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-bold font-headline text-on-surface">Contraseña</h3>
                <button onClick={() => setShowPasswordModal(false)} className="text-on-surface-variant hover:text-on-surface">
                  <X size={24} />
                </button>
              </div>
              <div className="space-y-4">
                <p className="text-sm text-on-surface-variant">Para mayor seguridad, puedes establecer una contraseña para tu cuenta de Study Sanctuary.</p>
                <div>
                  <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-1 block">Nueva Contraseña</label>
                  <input 
                    type="password"
                    className="w-full bg-surface-container border border-outline-variant/10 rounded-xl p-3 outline-none focus:border-primary transition-all text-on-surface"
                    placeholder="••••••••"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-1 block">Confirmar Contraseña</label>
                  <input 
                    type="password"
                    className="w-full bg-surface-container border border-outline-variant/10 rounded-xl p-3 outline-none focus:border-primary transition-all text-on-surface"
                    placeholder="••••••••"
                  />
                </div>
                <button 
                  onClick={() => {
                    toast.success('Contraseña actualizada');
                    setShowPasswordModal(false);
                  }}
                  className="w-full py-4 bg-primary text-on-primary rounded-xl font-bold mt-4 shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all"
                >
                  Guardar Cambios
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
