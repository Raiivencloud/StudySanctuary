import React, { useState, useEffect } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon, 
  Plus, 
  Clock, 
  AlertTriangle, 
  X, 
  RefreshCw, 
  Bell, 
  BellOff,
  BookOpen,
  FileText,
  GraduationCap,
  ClipboardList,
  HelpCircle,
  MapPin
} from 'lucide-react';
import { useCourses } from '../contexts/CourseContext';
import { Exam, AppNotification, AIActivity } from '../types';
import { cn } from '../lib/utils';
import { useLanguage } from '../contexts/LanguageContext';
import { toast } from 'sonner';

export const CalendarView: React.FC = () => {
  const { language } = useLanguage();
  const { activities, exams, addExam, deleteExam, setExams } = useCourses();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<'month' | 'week' | 'day' | 'year'>('month');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSynced, setIsSynced] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  
  const [showModal, setShowModal] = useState(false);
  const [newExam, setNewExam] = useState<Omit<Exam, 'id' | 'tags'>>({
    title: '',
    date: new Date().toISOString().split('T')[0],
    time: '09:00',
    location: '',
    type: 'Primary',
    reminder: 'none',
    color: 'bg-blue-500'
  });

  const handlePrev = () => {
    if (view === 'month') {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    } else if (view === 'year') {
      setCurrentDate(new Date(currentDate.getFullYear() - 1, 0, 1));
    } else if (view === 'day') {
      setCurrentDate(new Date(currentDate.getTime() - 24 * 60 * 60 * 1000));
    }
  };

  const handleNext = () => {
    if (view === 'month') {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    } else if (view === 'year') {
      setCurrentDate(new Date(currentDate.getFullYear() + 1, 0, 1));
    } else if (view === 'day') {
      setCurrentDate(new Date(currentDate.getTime() + 24 * 60 * 60 * 1000));
    }
  };

  const handleToday = () => setCurrentDate(new Date());

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (year: number, month: number) => {
    return new Date(year, month, 1).getDay();
  };

  const months = language === 'es' ? [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ] : [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const handleAddExam = (e: React.FormEvent) => {
    e.preventDefault();
    const examToAdd = { ...newExam, tags: [] };
    addExam(examToAdd);
    setShowModal(false);
    
    // Simulate setting a reminder notification for the demo
    if (newExam.reminder !== 'none') {
      const notification: AppNotification = {
        id: Date.now().toString(),
        title: 'Recordatorio',
        message: `Título del Examen: ${newExam.title} - ${newExam.date} ${newExam.time}`,
        timestamp: Date.now(),
        read: false
      };
      setNotifications(prev => [notification, ...prev]);
      
      toast.success('Recordatorio', {
        description: notification.message,
        icon: <Bell size={16} />,
      });
    }

    setNewExam({
      title: '',
      date: '',
      time: '',
      location: '',
      type: 'Primary',
      reminder: 'none'
    });
  };

  const handleSyncCalendar = async (provider: 'google' | 'outlook') => {
    setIsSyncing(true);
    try {
      const response = await fetch(`/api/auth/${provider}/url`);
      if (!response.ok) throw new Error('Failed to get auth URL');
      const { url } = await response.json();

      const authWindow = window.open(
        url,
        `${provider}_oauth_popup`,
        'width=600,height=700'
      );

      if (!authWindow) {
        toast.error('Error', { description: 'Please allow popups for this site to connect your calendar.' });
        setIsSyncing(false);
      }
    } catch (error) {
      console.error('Sync error:', error);
      setIsSyncing(false);
      toast.error('Sync failed', { description: 'Could not connect to calendar service.' });
    }
  };

  const fetchSyncedEvents = async () => {
    try {
      const response = await fetch('/api/calendar/sync');
      if (response.ok) {
        const { exams: syncedExams } = await response.json();
        setExams(prev => {
          // Filter out existing synced exams to avoid duplicates
          const nonSynced = prev.filter(e => !e.id.startsWith('google-') && !e.id.startsWith('outlook-'));
          return [...nonSynced, ...syncedExams];
        });
        setIsSynced(true);
        toast.success('Calendario sincronizado con éxito');
      }
    } catch (error) {
      console.error('Fetch sync error:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (!origin.endsWith('.run.app') && !origin.includes('localhost')) return;

      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        fetchSyncedEvents();
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  const getExamTypeConfig = (type: Exam['type']) => {
    switch (type) {
      case 'Primary':
        return { icon: BookOpen, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200', dot: 'bg-blue-500' };
      case 'Secondary':
        return { icon: FileText, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-500' };
      case 'Finals':
        return { icon: GraduationCap, color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-200', dot: 'bg-rose-500' };
      case 'Midterm':
        return { icon: ClipboardList, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', dot: 'bg-amber-500' };
      case 'Quiz':
        return { icon: HelpCircle, color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-200', dot: 'bg-indigo-500' };
      default:
        return { icon: BookOpen, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary', dot: 'bg-primary' };
    }
  };

  const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  return (
    <div className="responsive-container space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 w-full">
        <div className="space-y-1 text-center md:text-left">
          <h1 className="text-2xl md:text-4xl font-headline font-extrabold text-on-surface tracking-tight">Calendario de Exámenes</h1>
          <p className="text-xs md:text-sm text-on-surface-variant max-w-lg mx-auto md:mx-0">Gestiona tus hitos académicos y fechas importantes</p>
        </div>
        <div className="flex-wrap-center gap-3">
          <div className="flex bg-surface-container-high p-1 rounded-xl">
            <button 
              onClick={() => setView('year')}
              className={cn("px-4 py-1.5 rounded-lg text-sm font-medium transition-all", view === 'year' ? "bg-card shadow-sm text-primary" : "text-on-surface-variant hover:text-on-surface")}
            >
              Año
            </button>
            <button 
              onClick={() => setView('month')}
              className={cn("px-4 py-1.5 rounded-lg text-sm font-medium transition-all", view === 'month' ? "bg-card shadow-sm text-primary" : "text-on-surface-variant hover:text-on-surface")}
            >
              Mes
            </button>
            <button 
              onClick={() => setView('day')}
              className={cn("px-4 py-1.5 rounded-lg text-sm font-medium transition-all", view === 'day' ? "bg-card shadow-sm text-primary" : "text-on-surface-variant hover:text-on-surface")}
            >
              Día
            </button>
          </div>
          
          <div className="relative">
            <button 
              onClick={() => setShowNotifications(!showNotifications)}
              className="p-2.5 bg-surface-container-high text-on-surface-variant hover:text-on-surface rounded-xl transition-all relative"
            >
              <Bell size={20} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-on-destructive text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white">
                  {unreadCount}
                </span>
              )}
            </button>
            
            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 bg-card rounded-2xl shadow-2xl border border-outline-variant/10 z-[60] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="p-4 border-b border-outline-variant/5 flex justify-between items-center bg-surface-container-low">
                  <h4 className="font-bold text-on-surface">Notificaciones</h4>
                  <button 
                    onClick={() => setNotifications(notifications.map(n => ({...n, read: true})))}
                    className="text-[10px] font-bold text-primary uppercase tracking-wider"
                  >
                    Marcar como leído
                  </button>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="p-8 text-center space-y-2">
                      <div className="w-12 h-12 bg-surface-container-low rounded-full flex items-center justify-center mx-auto text-on-surface-variant/30">
                        <BellOff size={24} />
                      </div>
                      <p className="text-xs text-on-surface-variant">No hay notificaciones nuevas</p>
                    </div>
                  ) : (
                    notifications.map(n => (
                      <div key={n.id} className={cn(
                        "p-4 border-b border-outline-variant/5 hover:bg-surface-container-low transition-all",
                        !n.read && "bg-primary/5"
                      )}>
                        <h5 className="text-sm font-bold text-on-surface">{n.title}</h5>
                        <p className="text-xs text-on-surface-variant mt-1">{n.message}</p>
                        <span className="text-[10px] text-on-surface-variant/50 mt-2 block">
                          {new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="relative group">
            <button 
              disabled={isSyncing}
              className={cn(
                "flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold transition-all",
                isSynced 
                  ? "bg-green-100 text-green-700 border border-green-200" 
                  : "bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest"
              )}
            >
              <RefreshCw size={18} className={cn(isSyncing && "animate-spin")} />
              {isSyncing ? 'Conectando...' : isSynced ? 'Sincronizado' : 'Sincronizar Calendario'}
            </button>
            
            <div className="absolute right-0 mt-2 w-48 bg-card rounded-xl shadow-xl border border-outline-variant/10 z-[60] overflow-hidden opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
              <button 
                onClick={() => handleSyncCalendar('google')}
                className="w-full px-4 py-3 text-left text-sm font-bold text-on-surface hover:bg-surface-container-low flex items-center gap-2"
              >
                <img src="https://www.google.com/favicon.ico" className="w-4 h-4" alt="Google" />
                Google Calendar
              </button>
              <button 
                onClick={() => handleSyncCalendar('outlook')}
                className="w-full px-4 py-3 text-left text-sm font-bold text-on-surface hover:bg-surface-container-low flex items-center gap-2"
              >
                <img src="https://www.microsoft.com/favicon.ico" className="w-4 h-4" alt="Outlook" />
                Outlook Calendar
              </button>
            </div>
          </div>
          <button 
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-gradient-to-br from-primary to-primary-container text-on-primary px-5 py-2.5 rounded-xl font-bold shadow-md shadow-primary/10 active:scale-95 transition-all"
          >
            <Plus size={18} />
            Agregar Examen
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Calendar Grid */}
        <div className="lg:col-span-8 space-y-6 flex flex-col items-center w-full">
          <div className="responsive-card bg-card rounded-xl overflow-hidden shadow-sm">
            <div className="flex flex-col sm:flex-row items-center justify-between p-3 md:p-6 border-b border-outline-variant/5 gap-3">
              <h2 className="text-base md:text-xl font-headline font-bold text-on-surface text-center sm:text-left">
                {view === 'year' ? currentDate.getFullYear() : `${months[currentDate.getMonth()]} ${currentDate.getFullYear()}`}
                {view === 'day' && `, ${currentDate.getDate()}`}
              </h2>
              <div className="flex items-center gap-1 scale-90 sm:scale-100">
                <button onClick={handlePrev} className="p-1.5 hover:bg-surface-container-low rounded-lg text-on-surface-variant"><ChevronLeft size={18} /></button>
                <button onClick={handleToday} className="px-2 md:px-4 py-1 hover:bg-surface-container-low rounded-lg text-[10px] md:text-sm font-semibold text-on-surface">Hoy</button>
                <button onClick={handleNext} className="p-1.5 hover:bg-surface-container-low rounded-lg text-on-surface-variant"><ChevronRight size={18} /></button>
              </div>
            </div>
            
            {view === 'month' && (
              <div className="grid grid-cols-7 w-full overflow-x-hidden">
                {days.map(day => (
                  <div key={day} className="py-2 md:py-3 text-center text-[10px] md:text-xs font-bold uppercase tracking-tighter md:tracking-widest text-on-surface-variant opacity-60 bg-surface-container-low/50 border-b border-outline-variant/5">{day}</div>
                ))}
                {Array.from({ length: 42 }).map((_, i) => {
                  const firstDay = getFirstDayOfMonth(currentDate.getFullYear(), currentDate.getMonth());
                  const daysInMonth = getDaysInMonth(currentDate.getFullYear(), currentDate.getMonth());
                  const dayNum = i - firstDay + 1;
                  const isCurrentMonth = dayNum > 0 && dayNum <= daysInMonth;
                  const dateStr = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}-${dayNum.toString().padStart(2, '0')}`;
                  
                  const isToday = isCurrentMonth && 
                    dayNum === new Date().getDate() && 
                    currentDate.getMonth() === new Date().getMonth() && 
                    currentDate.getFullYear() === new Date().getFullYear();

                  const dayActivities = activities.filter(a => {
                    const activityDate = new Date(a.timestamp);
                    return activityDate.getDate() === dayNum && 
                           activityDate.getMonth() === currentDate.getMonth() && 
                           activityDate.getFullYear() === currentDate.getFullYear();
                  });

                  return (
                    <div key={i} className={cn(
                      "min-h-[40px] md:min-h-[100px] p-0.5 md:p-2 border-r border-b border-outline-variant/5 text-[7px] md:text-sm font-medium transition-all",
                      !isCurrentMonth ? "text-on-surface-variant opacity-30 bg-surface-variant/5" : "text-on-surface/60",
                      isToday && "bg-primary/5 ring-1 ring-inset ring-primary/20"
                    )}>
                      <div className="flex justify-center md:justify-between items-start">
                        <span className={cn(
                          "w-3 h-3 md:w-6 md:h-6 flex items-center justify-center rounded-full transition-all text-[7px] md:text-sm",
                          isToday && "bg-primary text-white font-bold shadow-sm"
                        )}>
                          {isCurrentMonth ? dayNum : ''}
                        </span>
                      </div>
                      
                      <div className="mt-0.5 md:mt-1 space-y-0.5 md:space-y-1 overflow-hidden">
                        {isCurrentMonth && exams.filter(e => e.date === dateStr).map(exam => (
                          <div key={exam.id} className={cn(
                            "p-0.5 md:p-1.5 border-l-[1px] md:border-l-2 rounded shadow-sm transition-all hover:shadow-md cursor-pointer bg-card",
                            exam.color ? `border-${exam.color.split('-')[1]}-500` : "border-primary"
                          )}>
                            <p className="text-[6px] md:text-[9px] font-bold text-on-surface truncate leading-tight">{exam.title}</p>
                            <p className="hidden md:block text-[7px] text-on-surface-variant opacity-70">{exam.time}</p>
                          </div>
                        ))}

                        {isCurrentMonth && dayActivities.map(activity => (
                          <div key={activity.id} className="p-0.5 md:p-1.5 border-l-[1px] md:border-l-2 border-tertiary rounded shadow-sm bg-tertiary/5">
                            <p className="text-[6px] md:text-[9px] font-bold text-tertiary truncate leading-tight">{activity.title}</p>
                            <p className="hidden md:block text-[7px] text-tertiary/70 opacity-70">Actividad</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {view === 'year' && (
              <div className="grid grid-cols-3 md:grid-cols-4 gap-4 p-6">
                {months.map((month, idx) => (
                  <button 
                    key={month}
                    onClick={() => {
                      setCurrentDate(new Date(currentDate.getFullYear(), idx, 1));
                      setView('month');
                    }}
                    className="p-4 rounded-xl border border-outline-variant/10 hover:bg-primary/5 hover:border-primary/30 transition-all text-center"
                  >
                    <span className="text-sm font-bold text-on-surface">{month}</span>
                  </button>
                ))}
              </div>
            )}

            {view === 'day' && (
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-16 text-right text-xs font-bold text-on-surface-variant opacity-60">TODO EL DÍA</div>
                  <div className="flex-1 h-[1px] bg-outline-variant/10"></div>
                </div>
                {Array.from({ length: 24 }).map((_, hour) => {
                  const dateStr = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}-${currentDate.getDate().toString().padStart(2, '0')}`;
                  const hourExams = exams.filter(e => e.date === dateStr && parseInt(e.time.split(':')[0]) === hour);
                  
                  return (
                    <div key={hour} className="flex gap-4 min-h-[60px]">
                      <div className="w-16 text-right text-xs font-bold text-on-surface-variant opacity-60">
                        {hour.toString().padStart(2, '0')}:00
                      </div>
                      <div className="flex-1 border-t border-outline-variant/5 pt-2 relative">
                        {hourExams.map(exam => (
                          <div key={exam.id} className={cn(
                            "p-3 rounded-xl border-l-4 shadow-sm bg-surface-container-low mb-2",
                            exam.color ? `border-${exam.color.split('-')[1]}-500` : "border-primary"
                          )}>
                            <div className="flex justify-between items-start">
                              <h4 className="text-sm font-bold text-on-surface">{exam.title}</h4>
                              <span className="text-[10px] font-bold text-on-surface-variant">{exam.time}</span>
                            </div>
                            <div className="flex items-center justify-between mt-1">
                              <p className="text-xs text-on-surface-variant flex items-center gap-1">
                                <MapPin size={12} className="opacity-50" />
                                {exam.location}
                              </p>
                              {exam.location && (
                                <a 
                                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(exam.location)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[10px] font-bold text-primary hover:underline"
                                >
                                  {language === 'es' ? 'Ver en Maps' : 'View on Maps'}
                                </a>
                              )}
                            </div>
                            <div className="flex gap-2 mt-2">
                              {exam.tags?.map((tag, tagIdx) => (
                                <span key={`${exam.id}-tag-${tagIdx}`} className="px-2 py-0.5 bg-primary/10 text-primary text-[8px] font-bold rounded-full uppercase">{tag}</span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Info */}
        <div className="lg:col-span-4 space-y-6 flex flex-col items-center w-full">
          <div className="responsive-card bg-card p-4 md:p-6 rounded-xl shadow-sm space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="font-headline font-bold text-on-surface">Próximos Exámenes</h3>
              <button className="text-primary text-[10px] md:text-xs font-bold uppercase tracking-wider hover:underline">Ver Todo</button>
            </div>
            <div className="space-y-4">
              {exams.map(exam => {
                const config = getExamTypeConfig(exam.type);
                const Icon = config.icon;
                return (
                  <div key={exam.id} className="flex items-start gap-3 md:gap-4 p-3 md:p-4 rounded-2xl bg-surface-container-low/50 hover:bg-surface-container-low transition-all group border border-outline-variant/5">
                    <div className={cn(
                      "flex flex-col items-center justify-center w-12 h-14 md:w-14 md:h-16 rounded-xl border shadow-sm transition-all",
                      config.bg,
                      config.border
                    )}>
                      <span className={cn("text-[8px] md:text-[10px] font-bold uppercase leading-none mb-1 opacity-70", config.color)}>{exam.date.split(' ')[1]}</span>
                      <span className={cn("text-lg md:text-xl font-black leading-none", config.color)}>{exam.date.split(' ')[0]}</span>
                    </div>
                    <div className="flex-1 space-y-1 md:space-y-1.5">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm md:text-base font-bold text-on-surface leading-tight">{exam.title}</h4>
                        <div className={cn("p-1 md:p-1.5 rounded-lg", config.bg)}>
                          <Icon size={12} className={config.color} />
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-x-3 md:gap-x-4 gap-y-1">
                        <p className="text-[10px] md:text-[11px] text-on-surface-variant flex items-center gap-1.5 font-medium">
                          <Clock size={10} className="opacity-50" />
                          {exam.time}
                        </p>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between w-full gap-1">
                          <p className="text-[10px] md:text-[11px] text-on-surface-variant flex items-center gap-1.5 font-medium">
                            <MapPin size={10} className="opacity-50" />
                            {exam.location}
                          </p>
                          {exam.location && (
                            <a 
                              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(exam.location)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[9px] md:text-[10px] font-bold text-primary hover:underline"
                            >
                              {language === 'es' ? 'Ver en Maps' : 'View on Maps'}
                            </a>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <span className={cn(
                          "px-2 py-0.5 text-[8px] md:text-[9px] font-bold rounded-full uppercase tracking-wider",
                          config.bg,
                          config.color,
                          "border",
                          config.border
                        )}>{exam.type}</span>
                        {exam.reminder && exam.reminder !== 'none' && (
                          <span className="flex items-center gap-1 px-2 py-0.5 bg-surface-container-high text-on-surface-variant text-[8px] md:text-[9px] font-bold rounded-full uppercase tracking-wider">
                            <Bell size={8} />
                            {exam.reminder}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="responsive-card bg-tertiary-container/10 p-4 md:p-5 rounded-xl flex gap-3 md:gap-4 items-start">
            <div className="p-2 bg-card rounded-lg text-tertiary">
              <AlertTriangle size={18} />
            </div>
            <div className="space-y-1">
              <h4 className="text-xs md:text-sm font-bold text-tertiary">Fecha límite próxima</h4>
              {exams.length > 0 ? (
                (() => {
                  const nextExam = [...exams].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
                  const diff = new Date(nextExam.date).getTime() - new Date().getTime();
                  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
                  return (
                    <p className="text-[10px] md:text-xs text-on-surface-variant leading-relaxed">
                      {days > 0 
                        ? `Faltan ${days} días para tu examen de ${nextExam.title}`
                        : days === 0 
                          ? `¡Hoy es tu examen de ${nextExam.title}!`
                          : `Tu examen de ${nextExam.title} fue hace ${Math.abs(days)} días`}
                    </p>
                  );
                })()
              ) : (
                <p className="text-[10px] md:text-xs text-on-surface-variant leading-relaxed">No hay exámenes próximos programados.</p>
              )}
            </div>
          </div>
        </div>
      </div>
      {/* Add Exam Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl w-[95%] max-w-md p-8 shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold font-headline">Agregar Examen</h3>
              <button onClick={() => setShowModal(false)} className="text-on-surface-variant hover:text-on-surface">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleAddExam} className="space-y-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-1 block">Título del Examen</label>
                <input 
                  required
                  value={newExam.title}
                  onChange={e => setNewExam({...newExam, title: e.target.value})}
                  className="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg p-3 outline-none focus:border-primary transition-all"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-1 block">Fecha del Examen</label>
                  <input 
                    required
                    type="date"
                    value={newExam.date}
                    onChange={e => setNewExam({...newExam, date: e.target.value})}
                    className="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg p-3 outline-none focus:border-primary transition-all"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-1 block">Hora del Examen</label>
                  <input 
                    required
                    type="time"
                    value={newExam.time}
                    onChange={e => setNewExam({...newExam, time: e.target.value})}
                    className="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg p-3 outline-none focus:border-primary transition-all"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-1 block">Color de Etiqueta</label>
                <div className="flex gap-3">
                  {['bg-blue-500', 'bg-emerald-500', 'bg-rose-500', 'bg-amber-500', 'bg-indigo-500'].map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setNewExam({...newExam, color})}
                      className={cn(
                        "w-8 h-8 rounded-full border-2 transition-all",
                        color,
                        newExam.color === color ? "border-on-surface scale-110" : "border-transparent"
                      )}
                    />
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-1 block">Ubicación</label>
                <input 
                  required
                  value={newExam.location}
                  onChange={e => setNewExam({...newExam, location: e.target.value})}
                  className="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg p-3 outline-none focus:border-primary transition-all"
                />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-1 block">Tipo de Examen</label>
                <select 
                  value={newExam.type}
                  onChange={e => setNewExam({...newExam, type: e.target.value as any})}
                  className="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg p-3 outline-none focus:border-primary transition-all"
                >
                  <option value="Primary">Primario</option>
                  <option value="Secondary">Secundario</option>
                  <option value="Finals">Finales</option>
                  <option value="Midterm">Parcial</option>
                  <option value="Quiz">Quiz</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-1 block">Recordatorio</label>
                <select 
                  value={newExam.reminder}
                  onChange={e => setNewExam({...newExam, reminder: e.target.value as any})}
                  className="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg p-3 outline-none focus:border-primary transition-all"
                >
                  <option value="none">Ninguno</option>
                  <option value="1h">1 hora antes</option>
                  <option value="2h">2 horas antes</option>
                  <option value="1d">1 día antes</option>
                  <option value="2d">2 días antes</option>
                </select>
              </div>
              <button 
                type="submit"
                className="w-full py-4 bg-primary text-on-primary rounded-xl font-bold mt-4 shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all"
              >
                Agregar Examen
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
