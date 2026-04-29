import React, { useState, useEffect, useRef } from 'react';
import { BookOpen, Microscope, Calendar, Play, Pause, RotateCcw, BrainCircuit, Plus, X, Image as ImageIcon, Video, Trash2, MapPin, FileText, Loader2, Clock, Sparkles, Files, GraduationCap, Zap, Dumbbell, Network, Layers, Mic2, Bot, Calculator, Globe, ChevronRight, Gamepad2 } from 'lucide-react';
import { MusicPlayer } from './MusicPlayer';
import { UserCreditStats } from './UserCreditStats';
import { Course, Task, AIActivity, CourseFile, StudyLevel } from '../types';
import { cn, compressImage } from '../lib/utils';
import { useLanguage } from '../contexts/LanguageContext';
import { useCourses } from '../contexts/CourseContext';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { getUserCredits } from '../services/userService';

import { generateSummary, generateTheory, generateExamples, generateExam } from '../services/geminiService';

import { useVisibility } from '../lib/useVisibility';

export const Dashboard: React.FC<{ 
  onCourseClick: (id: string) => void; 
  onAiClick: (tab?: any) => void; 
  onUploadClick: () => void; 
  onMultimediaClick: () => void;
  onViewChange?: (view: any) => void;
}> = ({ onCourseClick, onAiClick, onUploadClick, onMultimediaClick, onViewChange }) => {
  const isVisible = useVisibility();
  const { language } = useLanguage();
  const { courses, addCourse, tasks, activities, toggleTask, addActivity, exams, updateCourse } = useCourses();
  const { user } = useAuth();
  const [credits, setCredits] = useState(0);
  const [quickTopic, setQuickTopic] = useState('');
  const [showNewCourseModal, setShowNewCourseModal] = useState(false);
  const [newCourseFiles, setNewCourseFiles] = useState<{ id: string; name: string; type: string; file: File }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [courseUploadProgress, setCourseUploadProgress] = useState(0);
  const [newCourseData, setNewCourseData] = useState<{
    title: string;
    subtitle: string;
    type: string;
    icon: string;
    color: string;
    studyLevel: StudyLevel;
  }>({
    title: '',
    subtitle: '',
    type: 'CORE',
    icon: 'book',
    color: 'bg-cyan-500',
    studyLevel: 'Universidad'
  });

  useEffect(() => {
    if (user) {
      getUserCredits(user.uid).then(data => setCredits(data.credits));
    }
  }, [user]);

  // Focus Timer State
  const [timerMode, setTimerMode] = useState<'study' | 'rest'>('study');
  const [timeLeft, setTimeLeft] = useState(45 * 60);
  const [isActive, setIsActive] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isActive && timeLeft > 0 && isVisible) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0) {
      setIsActive(false);
      if (timerRef.current) clearInterval(timerRef.current);
      
      // Switch modes
      if (timerMode === 'study') {
        setTimerMode('rest');
        setTimeLeft(15 * 60);
        addActivity({
          title: 'Finalizó la sesión de estudio',
          description: '¡Excelente trabajo! Has completado tu sesión.',
          type: 'summary'
        });
        toast.info('Es hora de un descanso.');
      } else {
        setTimerMode('study');
        setTimeLeft(45 * 60);
        addActivity({
          title: 'Finalizó el descanso',
          description: '¡Recargado! Es hora de volver a estudiar.',
          type: 'summary'
        });
        toast.info('¡Comencemos!');
      }
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive, timeLeft, timerMode, isVisible]);

  const toggleTimer = () => setIsActive(!isActive);
  const resetTimer = () => {
    setIsActive(false);
    setTimerMode('study');
    setTimeLeft(45 * 60);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleAddCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    const courseId = Date.now().toString();
    const newCourse = { ...newCourseData, files: newCourseFiles };
    
    setIsLoading(true);
    setCourseUploadProgress(0);
    try {
      // @ts-ignore
      await addCourse(newCourse, courseId, (progress) => {
        setCourseUploadProgress(Math.round(progress));
      });
      setShowNewCourseModal(false);
      
      setNewCourseFiles([]);
      setNewCourseData({
        title: '',
        subtitle: '',
        type: 'CORE',
        icon: 'book',
        color: 'bg-cyan-500',
        studyLevel: 'Universidad'
      });

      onCourseClick(courseId);
    } catch (error) {
      console.error(error);
      toast.error('Error al crear el curso');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCourseFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      Array.from(files).forEach(file => {
        setNewCourseFiles(prev => [...prev, {
          id: Math.random().toString(36).substr(2, 9),
          name: file.name,
          type: file.type,
          file: file
        }]);
      });
    }
  };

  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(date);
  };

  const formatClock = (date: Date) => {
    return new Intl.DateTimeFormat('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(date);
  };

  const stats = [
    { label: 'Cursos Recientes', value: courses.length.toString(), icon: BookOpen, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
    { label: 'Créditos', value: credits.toString(), icon: Sparkles, color: 'text-amber-400', bg: 'bg-amber-500/10' },
    { label: 'Horas de Estudio', value: '24.5', icon: Clock, color: 'text-pink-400', bg: 'bg-pink-500/10' },
    { label: 'Racha Diaria', value: '12', icon: Zap, color: 'text-rose-400', bg: 'bg-rose-500/10' },
  ];

  return (
    <div className="w-full space-y-10 pb-32 relative px-4 md:px-8 max-w-7xl mx-auto">
      {/* Hero Section: Quick Create Focus */}
      <section className="relative overflow-hidden rounded-[3rem] border border-white/10 bg-black/40 backdrop-blur-3xl shadow-2xl shadow-black/50 p-8 md:p-16 text-center flex flex-col items-center justify-center min-h-[500px]">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-tertiary/20 opacity-50" />
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,rgba(34,211,238,0.1),transparent_70%)]" />
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="relative z-10 w-full max-w-3xl space-y-10"
        >
          <div className="space-y-4">
            <h1 className="text-4xl md:text-7xl font-black tracking-tight text-white leading-tight">
              ¿Qué quieres <span className="text-primary drop-shadow-[0_0_15px_rgba(34,211,238,0.5)]">aprender</span> hoy?
            </h1>
            <p className="text-white/60 text-lg md:text-xl font-medium">
              <span>Transforma cualquier tema o documento en un curso completo con IA.</span>
            </p>
          </div>

          <form 
            onSubmit={(e) => {
              e.preventDefault();
              if (quickTopic.trim()) {
                setNewCourseData(prev => ({ ...prev, title: quickTopic }));
                setShowNewCourseModal(true);
              }
            }}
            className="relative group max-w-2xl mx-auto w-full"
          >
            <div className="absolute -inset-1 bg-gradient-to-r from-primary via-tertiary to-primary rounded-[2.5rem] blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
            <div className="relative flex items-center bg-surface-container-low border border-white/10 rounded-[2rem] p-2 pl-6 shadow-2xl focus-within:bg-surface-container transition-all">
              <Sparkles className="text-primary w-6 h-6 mr-4 flex-shrink-0" />
              <input 
                type="text"
                value={quickTopic}
                onChange={(e) => setQuickTopic(e.target.value)}
                placeholder="Escribe un tema para tu curso..."
                className="bg-transparent border-none outline-none text-on-surface font-bold text-lg flex-1 py-4 placeholder:text-on-surface-variant/30"
              />
              <button 
                type="submit"
                className="bg-primary text-on-primary px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:scale-105 active:scale-95 transition-all shadow-lg shadow-primary/20"
              >
                Crear Curso
              </button>
            </div>
          </form>

          <div className="flex flex-wrap justify-center gap-6 pt-4">
            <div className="flex items-center gap-2 text-white/40 text-sm font-bold uppercase tracking-widest">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              IA Lista para procesar
            </div>
            <div className="w-px h-4 bg-white/10 hidden md:block" />
            <div className="flex items-center gap-2 text-white/40 text-sm font-bold uppercase tracking-widest">
              <Clock className="w-4 h-4" />
              Resultados en segundos
            </div>
          </div>
        </motion.div>
        
        {/* Decorative elements */}
        <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-primary/10 blur-[100px] rounded-full" />
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-tertiary/10 blur-[100px] rounded-full" />
      </section>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bg-black/40 backdrop-blur-md border border-white/10 p-6 rounded-[2rem] group hover:border-primary/30 transition-all shadow-lg shadow-black/5"
          >
            <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110", stat.bg)}>
              <stat.icon className={cn("w-6 h-6", stat.color)} />
            </div>
            <p className="text-on-surface-variant text-[10px] font-black uppercase tracking-widest">{stat.label}</p>
            <p className="text-2xl md:text-3xl font-black text-on-surface mt-1">{stat.value}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        {/* Left Column */}
        <div className="xl:col-span-8 space-y-10">
          {/* Quick Tools Section */}
          <section className="space-y-6">
            <h3 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
              <Layers className="w-6 h-6 text-emerald-400" />
              Abrir Asistente de Estudio
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { id: 'podcast', icon: Mic2, label: 'Podcast', color: 'bg-pink-500/20 text-pink-400', border: 'border-pink-500/10' },
                { id: 'virtual-tutor', icon: Bot, label: 'Tutor Virtual', color: 'bg-blue-500/20 text-blue-400', border: 'border-blue-500/10' },
                { id: 'math', icon: Calculator, label: 'Matemáticas', color: 'bg-amber-500/20 text-amber-400', border: 'border-amber-500/10' },
              ].map((tool) => (
                <motion.button
                  key={tool.id}
                  whileHover={{ y: -5, scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => onViewChange?.(tool.id as any)}
                  className={cn(
                    "flex flex-col items-center justify-center p-6 rounded-[2rem] bg-black/40 backdrop-blur-md border transition-all group",
                    tool.border
                  )}
                >
                  <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform", tool.color)}>
                    <tool.icon className="w-7 h-7" />
                  </div>
                  <span className="text-xs font-black text-white uppercase tracking-widest">{tool.label}</span>
                </motion.button>
              ))}
            </div>
          </section>

          {/* Multimedia & AI Section */}
          <section className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
                <Sparkles className="w-6 h-6 text-cyan-400" />
                Multimedia
              </h3>
            </div>
            
            <div className="grid grid-cols-1 gap-6">
                <motion.div 
                  whileHover={{ y: -5, scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={onMultimediaClick}
                  className="group relative overflow-hidden rounded-[2.5rem] cursor-pointer"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-cyan-600/20 to-blue-600/20 group-hover:scale-105 transition-transform duration-700" />
                  <div className="relative bg-black/40 backdrop-blur-xl p-10 border border-white/10 h-full flex flex-col justify-between min-h-[280px]">
                    <div className="space-y-6">
                      <div className="w-20 h-20 rounded-3xl bg-cyan-500/20 flex items-center justify-center text-cyan-400 group-hover:scale-110 transition-transform shadow-lg shadow-cyan-500/10">
                        <Globe className="w-10 h-10" />
                      </div>
                      <div>
                        <h4 className="text-3xl font-black text-white mb-3 uppercase tracking-tight">Explorador Estelar</h4>
                        <p className="text-cyan-400 font-bold text-xs uppercase tracking-widest mb-4">Gemelo Digital 3D</p>
                        <p className="text-white/60 text-base leading-relaxed font-medium max-w-lg">
                          Sumérgete en un modelo 3D interactivo de nuestro planeta, explorando datos geográficos y visualizaciones inmersivas.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-8">
                      <div className="px-6 py-3 bg-white/5 border border-white/10 rounded-2xl text-xs font-bold text-white/60 uppercase tracking-widest hover:bg-white/10 transition-all">
                        Explorar
                      </div>
                      <div className="px-6 py-3 bg-white/5 border border-white/10 rounded-2xl text-xs font-bold text-white/60 uppercase tracking-widest hover:bg-white/10 transition-all">
                        Datos
                      </div>
                    </div>
                  </div>
                </motion.div>

                <motion.div 
                  whileHover={{ y: -5, scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => onViewChange?.('arena')}
                  className="group relative overflow-hidden rounded-[2.5rem] cursor-pointer"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-orange-600/20 to-red-600/20 group-hover:scale-105 transition-transform duration-700" />
                  <div className="relative bg-black/40 backdrop-blur-xl p-10 border border-white/10 h-full flex flex-col justify-between min-h-[280px]">
                    <div className="space-y-6">
                      <div className="w-20 h-20 rounded-3xl bg-orange-500/20 flex items-center justify-center text-orange-400 group-hover:scale-110 transition-transform shadow-lg shadow-orange-500/10">
                        <Gamepad2 className="w-10 h-10" />
                      </div>
                      <div>
                        <h4 className="text-3xl font-black text-white mb-3 uppercase tracking-tight">Arena Sanctuary</h4>
                        <p className="text-orange-400 font-bold text-xs uppercase tracking-widest mb-4">Trivia Gamificada</p>
                        <p className="text-white/60 text-base leading-relaxed font-medium max-w-lg">
                          Compite en desafíos de trivia, sube en el ranking global y colecciona cartas legendarias.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-8">
                      <div className="px-8 py-3 bg-orange-600 rounded-2xl text-xs font-black text-white uppercase tracking-widest hover:bg-orange-500 transition-all shadow-lg shadow-orange-600/20">
                        ¡Jugar Ahora!
                      </div>
                    </div>
                  </div>
                </motion.div>
              </div>
          </section>

          {/* Recent Courses */}
          <section className="space-y-8">
            <div className="flex items-center justify-center gap-8">
              <h3 className="text-2xl font-bold text-white tracking-tight">
                Cursos Recientes
              </h3>
              <motion.button 
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowNewCourseModal(true)}
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition-all text-sm"
              >
                <Plus size={18} />
                Nuevo Curso
              </motion.button>
              <button className="text-sm font-medium text-white/40 hover:text-white transition-colors">
                Ver Todos
              </button>
            </div>

            <div className="grid grid-cols-1 gap-6">
              {courses.length > 0 ? (
                courses.map((course, idx) => (
                  <motion.div 
                    key={course.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.1 }}
                    onClick={() => onCourseClick(course.id)}
                    className="group bg-white/5 backdrop-blur-md border border-white/10 p-12 rounded-[2.5rem] hover:border-blue-500/30 transition-all duration-500 cursor-pointer relative overflow-hidden flex flex-col items-center justify-center text-center"
                  >
                    <div className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center mb-6 border border-white/10 group-hover:scale-110 transition-transform">
                      {course.icon === 'book' ? <BookOpen size={40} className="text-white/40" /> : <Microscope size={40} className="text-white/40" />}
                    </div>
                    <p className="text-lg font-medium text-white/40 mb-2 uppercase tracking-widest">Aún no hay cursos</p>
                    <button className="text-blue-500 font-bold hover:underline">Crea tu primer curso</button>
                  </motion.div>
                )).slice(0, 1) // Only show one placeholder style as per image if empty
              ) : (
                <div className="py-24 flex flex-col items-center justify-center bg-white/5 backdrop-blur-md rounded-[2.5rem] border border-white/10 border-dashed">
                  <div className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center mb-6">
                    <BookOpen size={40} className="text-white/20" />
                  </div>
                  <p className="text-lg font-medium text-white/40 mb-4 uppercase tracking-widest">Aún no hay cursos</p>
                  <button 
                    onClick={() => setShowNewCourseModal(true)}
                    className="text-blue-500 font-bold hover:underline"
                  >
                    Crea tu primer curso
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* Daily Study Plan */}
          <section className="space-y-6">
            <div className="flex items-center justify-center gap-4">
              <h3 className="text-xl font-bold text-white tracking-tight">
                Plan de Estudio Diario
              </h3>
              <span className="text-sm font-medium text-white/40 uppercase tracking-widest">
                {currentTime.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}
              </span>
            </div>

            <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-[2.5rem] min-h-[200px] flex flex-col items-center justify-center p-12">
              {tasks.length > 0 ? (
                <div className="w-full divide-y divide-white/5">
                  {tasks.map((task) => (
                    <motion.div 
                      key={task.id} 
                      className="flex items-center gap-6 py-6 group"
                    >
                      <button 
                        onClick={() => toggleTask(task.id)}
                        className={cn(
                          "w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all",
                          task.completed 
                            ? "bg-blue-500 border-blue-500 text-white" 
                            : "border-white/10 text-transparent hover:border-blue-500"
                        )}
                      >
                        <Plus size={16} className={cn(task.completed ? "rotate-45" : "")} />
                      </button>
                      <div className="flex-1">
                        <p className={cn(
                          "text-lg font-medium transition-all",
                          task.completed ? "text-white/20 line-through" : "text-white group-hover:text-blue-400"
                        )}>{task.title}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center opacity-40">
                  <BrainCircuit size={48} className="text-white mb-4" />
                  <p className="text-sm font-medium text-white uppercase tracking-widest">Aún no hay tareas</p>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Right Column */}
        <div className="xl:col-span-4 space-y-8">
          {/* Credit Stats */}
          <UserCreditStats />

          {/* Study Activity Widget */}
          <div className="bg-white/5 backdrop-blur-md p-10 rounded-[2.5rem] border border-white/10 shadow-xl flex flex-col items-center">
            <div className="flex items-center gap-3 mb-8 w-full">
              <div className="w-8 h-8 bg-blue-600/20 rounded-lg flex items-center justify-center">
                <Zap className="text-blue-400" size={16} />
              </div>
              <h3 className="text-sm font-bold text-white uppercase tracking-widest">
                Actividad de Estudio
              </h3>
            </div>
            
            <div className="py-10 flex flex-col items-center justify-center text-center">
              <p className="text-sm font-medium text-white/40 italic mb-8">No hay actividad reciente</p>
              <button className="px-6 py-3 bg-white/5 border border-white/10 rounded-xl text-[10px] font-bold text-blue-400 uppercase tracking-widest hover:bg-white/10 transition-all">
                Abrir Asistente de Estudio
              </button>
            </div>
          </div>

          {/* Focus Timer */}
          <div className="bg-white/5 backdrop-blur-md p-10 rounded-[2.5rem] border border-white/10 shadow-xl flex flex-col items-center">
            <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-[0.3em] mb-8">
              Sesión de Enfoque
            </h4>
            
            <div className="text-6xl font-bold text-white tracking-tighter mb-12 tabular-nums">
              {formatTime(timeLeft)}
            </div>
            
            <div className="flex items-center gap-6">
              <button className="w-12 h-12 flex items-center justify-center bg-white/5 border border-white/10 rounded-full text-white/40 hover:text-white transition-all">
                <img src="https://www.gstatic.com/images/branding/product/1x/drive_2020q4_48dp.png" alt="Drive" className="w-6 h-6 opacity-40" />
              </button>
              <button 
                onClick={toggleTimer}
                className="w-14 h-14 flex items-center justify-center bg-blue-600 text-white rounded-full shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition-all"
              >
                {isActive ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-1" />}
              </button>
              <button 
                onClick={resetTimer}
                className="w-12 h-12 flex items-center justify-center bg-white/5 border border-white/10 rounded-full text-white/40 hover:text-white transition-all"
              >
                <RotateCcw size={20} />
              </button>
            </div>
          </div>

          {/* Multimedia Generator Quick Action */}
          <motion.div
            whileHover={{ y: -5 }}
            onClick={onMultimediaClick}
            className="w-full p-10 bg-white/5 backdrop-blur-md border border-white/10 rounded-[2.5rem] shadow-xl flex flex-col items-center text-center cursor-pointer group"
          >
            <div className="w-12 h-12 bg-cyan-600/20 rounded-2xl flex items-center justify-center text-cyan-400 mb-6 group-hover:scale-110 transition-transform">
              <Sparkles size={24} />
            </div>
            <h3 className="text-xl font-bold text-white tracking-tight mb-2">Explorador Estelar</h3>
            <p className="text-[10px] font-medium text-cyan-400 uppercase tracking-widest mb-6">Gemelo Digital 3D</p>
            <p className="text-[10px] text-white/60 mb-8 leading-relaxed">Sumérgete en un modelo 3D interactivo de nuestro planeta, explorando datos geográficos y visualizaciones inmersivas.</p>
            
            <div className="flex gap-2">
              <button className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-[8px] font-bold text-white/60 uppercase tracking-widest hover:bg-white/10 transition-all">Explorar</button>
              <button className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-[8px] font-bold text-white/60 uppercase tracking-widest hover:bg-white/10 transition-all">Datos</button>
            </div>
          </motion.div>
        </div>
      </div>

      {/* New Course Modal */}
      <AnimatePresence>
        {showNewCourseModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowNewCourseModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl bg-surface-container-low rounded-[2.5rem] border border-outline-variant shadow-2xl overflow-hidden"
            >
              <div className="p-8 md:p-12">
                <div className="flex justify-between items-center mb-8">
                  <h3 className="text-2xl font-black text-on-surface uppercase tracking-widest">CREAR NUEVO CURSO</h3>
                  <button onClick={() => setShowNewCourseModal(false)} className="p-2 hover:bg-white/5 rounded-xl transition-colors">
                    <X size={24} className="text-on-surface-variant" />
                  </button>
                </div>

                <form onSubmit={handleAddCourse} className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Título del Curso</label>
                      <input 
                        required
                        value={newCourseData.title}
                        onChange={e => setNewCourseData({...newCourseData, title: e.target.value})}
                        className="w-full bg-surface-container border border-outline-variant rounded-2xl px-5 py-4 text-on-surface focus:border-primary/50 outline-none transition-all font-bold"
                        placeholder="Ej: Anatomía Humana"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Breve descripción...</label>
                      <input 
                        required
                        value={newCourseData.subtitle}
                        onChange={e => setNewCourseData({...newCourseData, subtitle: e.target.value})}
                        className="w-full bg-surface-container border border-outline-variant rounded-2xl px-5 py-4 text-on-surface focus:border-primary/50 outline-none transition-all font-bold"
                        placeholder="Breve descripción..."
                      />
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Tipo de Curso</label>
                      <input 
                        required
                        value={newCourseData.type}
                        onChange={e => setNewCourseData({...newCourseData, type: e.target.value})}
                        className="w-full bg-surface-container border border-outline-variant rounded-2xl px-5 py-4 text-on-surface focus:border-primary/50 outline-none transition-all font-bold"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Icono</label>
                      <select 
                        value={newCourseData.icon}
                        onChange={e => setNewCourseData({...newCourseData, icon: e.target.value})}
                        className="w-full bg-surface-container border border-outline-variant rounded-2xl px-5 py-4 text-on-surface focus:border-primary/50 outline-none transition-all font-bold appearance-none cursor-pointer"
                      >
                        <option value="book">Libro</option>
                        <option value="microscope">Microscopio</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Nivel de Estudio</label>
                    <select 
                      value={newCourseData.studyLevel}
                      onChange={e => setNewCourseData({...newCourseData, studyLevel: e.target.value as StudyLevel})}
                      className="w-full bg-surface-container border border-outline-variant rounded-2xl px-5 py-4 text-on-surface focus:border-primary/50 outline-none transition-all font-bold appearance-none cursor-pointer"
                    >
                      <option value="Inicial">Inicial</option>
                      <option value="Secundario">Secundario</option>
                      <option value="Universidad">Universidad</option>
                      <option value="Master">Master</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Color</label>
                    <div className="flex gap-4">
                      {[
                        { id: 'bg-cyan-500', color: 'bg-cyan-500' },
                        { id: 'bg-blue-500', color: 'bg-blue-500' },
                        { id: 'bg-purple-500', color: 'bg-purple-500' },
                        { id: 'bg-amber-500', color: 'bg-amber-500' },
                        { id: 'bg-rose-500', color: 'bg-rose-500' },
                      ].map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setNewCourseData({...newCourseData, color: c.id})}
                          className={cn(
                            "w-10 h-10 rounded-xl transition-all border-2",
                            newCourseData.color === c.id ? "border-on-surface scale-110" : "border-transparent opacity-50 hover:opacity-100",
                            c.color
                          )}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Cargar Archivos del Curso</label>
                    <div className="space-y-4">
                      <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-outline-variant rounded-[2rem] cursor-pointer hover:bg-white/5 transition-all group">
                        <div className="flex flex-col items-center justify-center">
                          <Plus className="w-8 h-8 text-on-surface-variant group-hover:text-primary transition-colors mb-2" />
                          <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Subir material de estudio</p>
                        </div>
                        <input 
                          type="file" 
                          className="hidden" 
                          multiple 
                          accept=".pdf,.doc,.docx,.xls,.xlsx,image/*"
                          onChange={handleCourseFileChange} 
                        />
                      </label>
                      
                      {newCourseFiles.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {newCourseFiles.map((file) => (
                            <div key={file.name} className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-xl border border-outline-variant text-[10px] font-black text-on-surface-variant">
                              <span className="truncate max-w-[150px]">{file.name}</span>
                              <button type="button" onClick={() => setNewCourseFiles(newCourseFiles.filter((f) => f.id !== file.id))} className="hover:text-rose-500 transition-colors">
                                <X size={12} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <button 
                    type="submit"
                    disabled={isLoading}
                    className={cn(
                      "w-full py-5 bg-primary text-on-primary rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-primary/20 hover:bg-primary/90 transition-all flex items-center justify-center gap-3",
                      isLoading && "opacity-70 cursor-not-allowed"
                    )}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="animate-spin" size={20} />
                        <span>Generando... {courseUploadProgress}%</span>
                      </>
                    ) : (
                      <>
                        <Sparkles size={20} />
                        <span>Crear Curso</span>
                      </>
                    )}
                  </button>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
