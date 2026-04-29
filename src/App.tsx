import React, { useState, useEffect, lazy, Suspense } from 'react';
import { auth } from './firebase'; 
import { onAuthStateChanged } from 'firebase/auth';

// Componentes con llaves para evitar errores de importación
import LandingView from './components/LandingView';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { Dashboard } from './components/Dashboard';
import { AIStudyView } from './components/AIStudyView';
import { CourseDetail } from './components/CourseDetail';
import { SettingsView } from './components/SettingsView';
const SubscriptionView = lazy(() => import('./components/SubscriptionView'));
import { SubscriptionSuccess } from './components/SubscriptionSuccess';
import { FilesView } from './components/FilesView';
const MultimediaGenerator = lazy(() => import('./components/MultimediaGenerator').then(m => ({ default: m.MultimediaGenerator })));
import { HelpCenterView } from './components/HelpCenterView';
import { BooksView } from './components/BooksView';
import { CalendarView } from './components/CalendarView';
import { StudyGroupsView } from './components/StudyGroupsView';
import { FeedbackView } from './components/FeedbackView';
import { PodcastView } from './components/PodcastView';
import VirtualTutor from './components/VirtualTutor';
import { TrafficAlert } from './components/TrafficAlert';
import { GoogleTagManager } from './components/GoogleTagManager';
import { isTrafficLimitReached } from './lib/trafficMonitor';
import { AdminDashboard } from './components/AdminDashboard';
import { ArenaView } from './components/ArenaView';
const MathView = lazy(() => import('./components/MathView'));
const SecurityAdmin = lazy(() => import('./components/SecurityAdmin'));

import { Toaster } from 'sonner';
import { Loader2, GraduationCap } from 'lucide-react'; 
import { View } from './types';
import { motion, AnimatePresence } from 'framer-motion';
import { VERSION } from './constants';
import { clearAppCache } from './lib/cacheUtils';
import { cn } from './lib/utils';
import { useTheme } from './contexts/ThemeContext';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [studyTab, setStudyTab] = useState<any>(undefined);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const { theme, wallpaper } = useTheme();

  useEffect(() => {
    // Check for version update to clear cache
    const storedVersion = localStorage.getItem('app_version');
    if (storedVersion && storedVersion !== VERSION) {
      console.log(`[App] New version detected: ${VERSION}. Clearing cache...`);
      clearAppCache();
    }
    localStorage.setItem('app_version', VERSION);

    const params = new URLSearchParams(window.location.search);
    const view = params.get('view');
    if (view) {
      setCurrentView(view as View);
    }
    
    // Check for astra-core-admin path
    if (window.location.pathname === '/astra-core-admin') {
      setCurrentView('astra-core-admin');
    }
  }, []);

  useEffect(() => {
    // Set sidebar open by default on desktop, closed on mobile
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setIsSidebarOpen(true);
      } else {
        setIsSidebarOpen(false);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className={cn(
        "h-screen flex items-center justify-center relative overflow-hidden transition-colors duration-500",
        theme === 'dark' ? "bg-red-600" : "bg-red-600"
      )}>
        <div className={cn(
          "absolute inset-0 bg-gradient-to-br",
          theme === 'dark' ? "from-cyan-950/20 via-black to-cyan-900/10" : "from-primary/5 via-surface to-primary/10"
        )} />
        <div className="relative z-10 flex flex-col items-center gap-4">
          <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin shadow-[0_0_30px_rgba(34,211,238,0.2)]" />
          <p className="text-primary/60 font-black animate-pulse tracking-[0.3em] uppercase text-[10px]">Cargando Sanctuary...</p>
        </div>
      </div>
    );
  }

  if (!user) return <LandingView onLogin={() => {}} />;

  const isAdmin = user.email === 'Agusgestro17@gmail.com';

  const handleCourseClick = (id: string) => {
    setSelectedCourseId(id);
    setCurrentView('course-detail');
  };

  return (
    <div className={cn(
      "flex h-screen text-on-surface selection:bg-primary/30 selection:text-primary overflow-hidden relative font-sans",
      "lg:block lg:w-full lg:h-auto lg:overflow-visible"
    )}>
      {/* Background Wallpaper - Fixed and Cover */}
      <div 
        className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat bg-fixed transition-all duration-1000"
        style={{ backgroundImage: isTrafficLimitReached() ? 'none' : `url(${wallpaper || 'https://images.unsplash.com/photo-1464802686167-b939a6910659?q=80&w=2050&auto=format&fit=crop'})` }}
      >
        {/* Glassmorphism Overlay */}
        <div className="absolute inset-0 bg-[#0a1a1a]/30" />
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-950/20 via-transparent to-cyan-950/20" />
      </div>

      <Toaster position="top-right" theme={theme} richColors closeButton />
      <TrafficAlert />
      <GoogleTagManager gtmId="GTM-TSHX7NTR" />
      
      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] lg:hidden"
          />
        )}
      </AnimatePresence>

      <Sidebar 
        currentView={currentView} 
        onViewChange={(view) => {
          setCurrentView(view);
          if (window.innerWidth < 1024) setIsSidebarOpen(false);
        }} 
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />
      
      <div className="flex-1 flex flex-col min-w-0 relative z-20 w-full max-w-full overflow-hidden lg:ml-[280px] lg:w-[calc(100%-280px)] lg:min-h-screen lg:block lg:p-5">
        {currentView !== 'arena' && (
          <Header 
            onViewChange={setCurrentView} 
            onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          />
        )}
        
        {/* On mobile Arena, we hide the global header to use an immersive one inside ArenaView */}
        {currentView === 'arena' && (
          <div className="lg:block hidden">
            <Header 
              onViewChange={setCurrentView} 
              onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
            />
          </div>
        )}
        
        <main className="flex-1 overflow-hidden lg:overflow-visible relative w-full">
          <div className={cn(
            "absolute inset-0 overflow-y-auto custom-scrollbar w-full lg:relative lg:inset-auto lg:overflow-visible lg:block",
            currentView === 'arena' ? "p-0" : "p-3 md:p-8"
          )}>
            <AnimatePresence mode="wait">
              <motion.div
                key={currentView}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className={cn(
                  "w-full lg:block",
                  currentView === 'arena' 
                    ? "max-w-none border-none rounded-none p-0 bg-transparent backdrop-blur-none h-full mx-auto" 
                    : "mx-auto w-full lg:max-w-[1600px] border border-white/10 rounded-3xl p-4 md:p-6 bg-white/5 backdrop-blur-sm"
                )}
              >
                <Suspense fallback={<div className="flex items-center justify-center p-10"><Loader2 className="animate-spin text-primary" /></div>}>
                  {currentView === 'dashboard' && (
                    <Dashboard 
                      onCourseClick={handleCourseClick} 
                      onAiClick={(tab) => {
                        setStudyTab(tab);
                        setCurrentView('ai');
                      }}
                      onUploadClick={() => setCurrentView('files')}
                      onMultimediaClick={() => setCurrentView('multimedia')}
                      onViewChange={setCurrentView}
                    />
                  )}
                  {currentView === 'ai' && <AIStudyView initialTab={studyTab} />}
                  {currentView === 'exams' && <AIStudyView initialTab="exam" />}
                  {currentView === 'exercises' && <AIStudyView initialTab="exercises" />}
                  {currentView === 'diagrams' && <AIStudyView initialTab="diagram" />}
                  {currentView === 'course-detail' && <CourseDetail courseId={selectedCourseId || ''} />}
                  {currentView === 'settings' && <SettingsView />}
                  {currentView === 'subscription' && <SubscriptionView />}
                  {currentView === 'success' && <SubscriptionSuccess planName="Plan" credits={0} planId="mensual" />}
                  {currentView === 'files' && <FilesView />}
                  {currentView === 'multimedia' && <MultimediaGenerator />}
                  {currentView === 'help-center' && <HelpCenterView />}
                  {currentView === 'books' && <BooksView />}
                  {currentView === 'arena' && <ArenaView onExit={() => setCurrentView('dashboard')} />}
                  {currentView === 'calendar' && <CalendarView />}
                  {currentView === 'study-groups' && <StudyGroupsView />}
                  {currentView === 'feedback' && <FeedbackView />}
                  {currentView === 'podcast' && <PodcastView />}
                  {currentView === 'virtual-tutor' && <VirtualTutor />}
                  {currentView === 'math' && <MathView />}
                  {currentView === 'admin-dashboard' && isAdmin && (
                    <AdminDashboard onClose={() => setCurrentView('dashboard')} />
                  )}
                  {currentView === 'astra-core-admin' && (
                    <Suspense fallback={<div className="flex items-center justify-center p-10"><Loader2 className="animate-spin text-red-500" /></div>}>
                      <SecurityAdmin 
                        isAuthenticated={isAdminAuthenticated} 
                        onAuthenticated={() => setIsAdminAuthenticated(true)}
                        onExit={() => setCurrentView('dashboard')}
                      />
                    </Suspense>
                  )}
                </Suspense>
              </motion.div>
            </AnimatePresence>

            <footer className="mt-12 py-8 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-6 px-4">
              <div className="flex items-center gap-3 opacity-50">
                <GraduationCap className="text-primary" size={24} />
                <span className="text-sm font-bold tracking-tight text-on-surface">Study Sanctuary • 2026</span>
              </div>
              
              <div className="flex items-center gap-6">
                <a 
                  href="https://discord.gg/Y5yFKEYD9r" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-[#5865F2] hover:opacity-80 transition-all font-bold text-sm"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.062 14.062 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                  </svg>
                  Comunidad de Discord
                </a>
              </div>
            </footer>
          </div>
        </main>
      </div>
    </div>
  );
}
