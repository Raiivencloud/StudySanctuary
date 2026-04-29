import React, { useState, useEffect } from 'react';
import { ChevronRight, Timer, CheckCircle, Sparkles, ArrowRight, Send, BrainCircuit, Trophy, Check, Loader2, X, ChevronLeft, RotateCcw, ThumbsUp, ThumbsDown, FileText, Plus, Headphones, Play, Network, Dumbbell, GraduationCap, Upload } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { generateSummary, generateFlashcards, generateExam, generateTheory, generateExamples, generateExercises, generateDiagram, generatePodcastScript, generatePodcastAudio } from '../services/geminiService';
import { toast } from 'sonner';
import Markdown from 'react-markdown';
import { useCourses } from '../contexts/CourseContext';
import { Flashcard, ExamQuestion, CourseFile } from '../types';
import { UsageLimitModal } from './UsageLimitModal';
import { auth, storage } from '../firebase';
import { ref, getBlob } from 'firebase/storage';

interface CourseDetailProps {
  courseId: string | null;
}

export const CourseDetail: React.FC<CourseDetailProps> = ({ courseId }) => {
  const { t, language } = useLanguage();
  const { courses, updateCourseProgress, addFileToCourse, removeFileFromCourse, updateCourse, addActivity, getCourseContent } = useCourses();
  
  const course = courses.find(c => c.id === courseId);
  const userId = auth.currentUser?.uid;
  
  const [progress, setProgress] = useState(course?.progress || 0);
  const [isCompleted, setIsCompleted] = useState(course?.progress === 100);
  const [activeSection, setActiveSection] = useState('summary');
  const [isLimitModalOpen, setIsLimitModalOpen] = useState(false);

  // Content States (from subcollection)
  const [courseContent, setCourseContent] = useState<{ 
    summary?: string; 
    theory?: string; 
    examples?: string; 
    podcastScript?: string; 
    exams?: ExamQuestion[];
    exercises?: string;
    diagram?: string;
  } | null>(null);
  const [isLoadingContent, setIsLoadingContent] = useState(false);

  // AI States
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [generatedFlashcards, setGeneratedFlashcards] = useState<Flashcard[]>([]);
  const [isGeneratingFlashcards, setIsGeneratingFlashcards] = useState(false);
  const [isGeneratingExam, setIsGeneratingExam] = useState(false);
  const [isGeneratingTheory, setIsGeneratingTheory] = useState(false);
  const [isGeneratingExamples, setIsGeneratingExamples] = useState(false);
  const [isGeneratingExercises, setIsGeneratingExercises] = useState(false);
  const [isGeneratingDiagram, setIsGeneratingDiagram] = useState(false);
  const [isGeneratingPodcast, setIsGeneratingPodcast] = useState(false);
  const [podcastAudioUrl, setPodcastAudioUrl] = useState<string | null>(null);
  const [showFlashcardsModal, setShowFlashcardsModal] = useState(false);
  const [showExamModal, setShowExamModal] = useState(false);
  const [showTheoryModal, setShowTheoryModal] = useState(false);
  const [showExamplesModal, setShowExamplesModal] = useState(false);
  const [showExercisesModal, setShowExercisesModal] = useState(false);
  const [showDiagramModal, setShowDiagramModal] = useState(false);
  const [currentFlashcardIndex, setCurrentFlashcardIndex] = useState(0);
  const [isFlashcardFlipped, setIsFlashcardFlipped] = useState(false);
  const [aiQuestion, setAiQuestion] = useState('');

  // Feedback States
  const [feedback, setFeedback] = useState<Record<string, 'up' | 'down' | null>>({});
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  useEffect(() => {
    if (course) {
      setProgress(course.progress);
      setIsCompleted(course.progress === 100);
      
      // Fetch content from subcollection
      const fetchContent = async () => {
        setIsLoadingContent(true);
        const content = await getCourseContent(course.id);
        setCourseContent(content);
        setIsLoadingContent(false);
      };
      fetchContent();
    }
  }, [course?.id]);

  const [hasAttemptedGeneration, setHasAttemptedGeneration] = useState(false);

  useEffect(() => {
    if (course && course.files && course.files.length > 0 && courseContent === null && !isGeneratingSummary && !isLoadingContent && !hasAttemptedGeneration) {
      setHasAttemptedGeneration(true);
      handleGenerateAll();
    }
  }, [course?.id, course?.files?.length, courseContent, isLoadingContent, hasAttemptedGeneration]);

  const handleGenerateAll = async () => {
    if (!course || !course.files || course.files.length === 0) {
      return;
    }
    
    setIsGeneratingSummary(true);
    setIsGeneratingTheory(true);
    setIsGeneratingExamples(true);
    setIsGeneratingExam(true);
    setIsGeneratingExercises(true);
    setIsGeneratingDiagram(true);

    try {
      const file = course.files[0];
      let fileData: any = undefined;

      // Ensure we have the file data
      try {
        fileData = await getFileData(file);
      } catch (e) {
        console.warn('[CourseDetail] Could not get file data, generating from topic only:', e);
      }

      // Generate each part sequentially to avoid overwhelming the API and ensure each is awaited
      const summary = await generateSummary(userId || '', course.title, language, course.studyLevel, fileData);
      const theory = await generateTheory(userId || '', course.title, language, course.studyLevel, fileData);
      const examples = await generateExamples(userId || '', course.title, language, course.studyLevel, fileData);
      const exam = await generateExam(userId || '', course.title, language, course.studyLevel, fileData);
      const podcastScript = await generatePodcastScript(userId || '', course.title, language, course.studyLevel, fileData);
      const exercises = await generateExercises(userId || '', course.title, language, course.studyLevel, fileData);
      const diagram = await generateDiagram(userId || '', course.title, language, course.studyLevel, fileData);

      const updates = {
        summary: summary || '',
        theory: theory || '',
        examples: examples || '',
        podcastScript: podcastScript || '',
        exams: exam || [],
        exercises: exercises || '',
        diagram: diagram || ''
      };

      // CRITICAL: Await the update to Firestore
      await updateCourse(course.id, updates);
      setCourseContent(updates);

      addActivity({
        title: `Contenido generado con éxito: ${course.title}`,
        description: 'Generando contenido inteligente con IA...',
        type: 'summary'
      });

      toast.success('¡Contenido generado con éxito!');
    } catch (error) {
      console.error("[CourseDetail] Error in handleGenerateAll:", error);
      toast.error('Error al generar contenido con IA. Algunos elementos podrían faltar.');
    } finally {
      setIsGeneratingSummary(false);
      setIsGeneratingTheory(false);
      setIsGeneratingExamples(false);
      setIsGeneratingExam(false);
      setIsGeneratingExercises(false);
      setIsGeneratingDiagram(false);
    }
  };

  useEffect(() => {
    // Intersection Observer for active section
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { threshold: 0.5, rootMargin: '-100px 0px -50% 0px' }
    );

    const sections = ['summary', 'theory', 'exams'];
    sections.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleComplete = async () => {
    if (courseId) {
      await updateCourse(courseId, { 
        completedSections: {
          theory: true,
          podcast: true,
          exam: true
        }
      });
    }
    setProgress(100);
    setIsCompleted(true);
    
    // Trigger confetti
    const duration = 3 * 1000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

    const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

    const interval: any = setInterval(function() {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        return clearInterval(interval);
      }

      const particleCount = 50 * (timeLeft / duration);
      confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
      confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
    }, 250);
  };

  const getFileData = async (courseFile?: CourseFile) => {
    if (!courseFile) return undefined;

    try {
      if (courseFile.url.startsWith('data:')) {
        const [header, base64Data] = courseFile.url.split(',');
        const mimeType = header.split(':')[1].split(';')[0];
        
        let text = undefined;
        if (mimeType.includes('text') || mimeType.includes('json') || mimeType.includes('markdown')) {
          text = atob(base64Data);
        }
        
        return { data: base64Data, mimeType, text };
      } else if (courseFile.url.startsWith('http')) {
        try {
          // Try SDK first
          const fileRef = ref(storage, courseFile.url);
          const blob = await getBlob(fileRef);
          const base64Data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          
          let text = undefined;
          if (blob.type.includes('text') || blob.type.includes('json') || blob.type.includes('markdown')) {
            text = await blob.text();
          }
          
          return { data: base64Data, mimeType: blob.type, text };
        } catch (sdkError) {
          console.warn("[CourseDetail] SDK getFileData failed, trying direct fetch:", sdkError);
          const response = await fetch(courseFile.url);
          if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
          const blob = await response.blob();
          const base64Data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          
          let text = undefined;
          if (blob.type.includes('text') || blob.type.includes('json') || blob.type.includes('markdown')) {
            text = await blob.text();
          }
          
          return { data: base64Data, mimeType: blob.type, text };
        }
      }
    } catch (e) {
      console.error('[CourseDetail] Error fetching file data:', e);
      return undefined;
    }
    return undefined;
  };

  const handleGenerateSummary = async (topic: string) => {
    if (!userId) {
      toast.error('Debes iniciar sesión');
      return;
    }
    setIsGeneratingSummary(true);
    toast.info(course?.files?.[0] ? 'Analizando tus apuntes...' : 'Generando guía de estudio...');
    try {
      const fileData = await getFileData(course?.files?.[0]);
      const result = await generateSummary(userId, topic, language, course?.studyLevel, fileData);
      if (courseId) {
        await updateCourse(courseId, { summary: result || '' });
      }
      toast.success('¡Listo!');
    } catch (error: any) {
      console.error(error);
      if (error?.message === 'INSUFFICIENT_CREDITS') {
        setIsLimitModalOpen(true);
      } else {
        toast.error('Error al generar el resumen');
      }
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const handleGenerateFlashcards = async (topic: string) => {
    if (!userId) {
      toast.error('Debes iniciar sesión');
      return;
    }
    setIsGeneratingFlashcards(true);
    toast.info(course?.files?.[0] ? 'Analizando tus apuntes...' : 'Generando guía de estudio...');
    try {
      const fileData = await getFileData(course?.files?.[0]);
      const result = await generateFlashcards(userId, topic, language, course?.studyLevel, fileData);
      setGeneratedFlashcards(result);
      setCurrentFlashcardIndex(0);
      setIsFlashcardFlipped(false);
      setShowFlashcardsModal(true);
      toast.success('¡Listo!');
    } catch (error: any) {
      console.error(error);
      if (error?.message === 'INSUFFICIENT_CREDITS') {
        setIsLimitModalOpen(true);
      } else {
        toast.error('Error al generar tarjetas');
      }
    } finally {
      setIsGeneratingFlashcards(false);
    }
  };

  const handleGenerateExam = async (topic: string) => {
    if (!userId) {
      toast.error('Debes iniciar sesión');
      return;
    }
    setIsGeneratingExam(true);
    toast.info(course?.files?.[0] ? 'Analizando tus apuntes...' : 'Generando guía de examen...');
    try {
      const fileData = await getFileData(course?.files?.[0]);
      const result = await generateExam(userId, topic, language, course?.studyLevel, fileData);
      if (courseId) {
        await updateCourse(courseId, { exams: result });
      }
      setShowExamModal(true);
      toast.success('¡Listo!');
    } catch (error: any) {
      console.error(error);
      if (error?.message === 'INSUFFICIENT_CREDITS') {
        setIsLimitModalOpen(true);
      } else {
        toast.error('Error al generar el examen');
      }
    } finally {
      setIsGeneratingExam(false);
    }
  };

  const handleGenerateTheory = async (topic: string) => {
    if (!userId) {
      toast.error('Debes iniciar sesión');
      return;
    }
    setIsGeneratingTheory(true);
    toast.info(course?.files?.[0] ? 'Analizando tus apuntes...' : 'Generando guía de estudio...');
    try {
      const fileData = await getFileData(course?.files?.[0]);
      const result = await generateTheory(userId, topic, language, course?.studyLevel, fileData);
      if (courseId) {
        await updateCourse(courseId, { 
          theory: result || '',
          completedSections: { ...course?.completedSections, theory: true }
        });
      }
      toast.success('¡Listo!');
    } catch (error: any) {
      console.error(error);
      if (error?.message === 'INSUFFICIENT_CREDITS') {
        setIsLimitModalOpen(true);
      } else {
        toast.error('Error al generar la teoría');
      }
    } finally {
      setIsGeneratingTheory(false);
    }
  };

  const handleGenerateExamples = async (topic: string) => {
    if (!userId) {
      toast.error('Debes iniciar sesión');
      return;
    }
    setIsGeneratingExamples(true);
    toast.info(course?.files?.[0] ? 'Analizando tus apuntes...' : 'Generando guía de estudio...');
    try {
      const fileData = await getFileData(course?.files?.[0]);
      const result = await generateExamples(userId, topic, language, course?.studyLevel, fileData);
      if (courseId) {
        await updateCourse(courseId, { examples: result || '' });
      }
      toast.success('¡Listo!');
    } catch (error: any) {
      console.error(error);
      if (error?.message === 'INSUFFICIENT_CREDITS') {
        setIsLimitModalOpen(true);
      } else {
        toast.error('Error al generar ejemplos');
      }
    } finally {
      setIsGeneratingExamples(false);
    }
  };

  const handleGenerateExercises = async (topic: string) => {
    if (!userId) {
      toast.error('Debes iniciar sesión');
      return;
    }
    setIsGeneratingExercises(true);
    toast.info(course?.files?.[0] ? 'Analizando tus apuntes...' : 'Generando guía de estudio...');
    try {
      const fileData = await getFileData(course?.files?.[0]);
      const result = await generateExercises(userId, topic, language, course?.studyLevel, fileData);
      if (courseId) {
        await updateCourse(courseId, { exercises: result || '' });
      }
      toast.success('¡Listo!');
    } catch (error: any) {
      console.error(error);
      if (error?.message === 'INSUFFICIENT_CREDITS') {
        setIsLimitModalOpen(true);
      } else {
        toast.error('Error al generar ejercicios');
      }
    } finally {
      setIsGeneratingExercises(false);
    }
  };

  const handleGenerateDiagram = async (topic: string) => {
    if (!userId) {
      toast.error('Debes iniciar sesión');
      return;
    }
    setIsGeneratingDiagram(true);
    toast.info(course?.files?.[0] ? 'Analizando tus apuntes...' : 'Generando guía de estudio...');
    try {
      const fileData = await getFileData(course?.files?.[0]);
      const result = await generateDiagram(userId, topic, language, course?.studyLevel, fileData);
      if (courseId) {
        await updateCourse(courseId, { diagram: result || '' });
      }
      toast.success('¡Listo!');
    } catch (error: any) {
      console.error(error);
      if (error?.message === 'INSUFFICIENT_CREDITS') {
        setIsLimitModalOpen(true);
      } else {
        toast.error('Error al generar el esquema');
      }
    } finally {
      setIsGeneratingDiagram(false);
    }
  };

  const handleGeneratePodcast = async (content: string) => {
    if (!content && !courseContent?.podcastScript) {
      toast.error('No hay contenido para generar el podcast');
      return;
    }
    if (!userId) {
      toast.error('Debes iniciar sesión');
      return;
    }
    setIsGeneratingPodcast(true);
    setPodcastAudioUrl(null);
    toast.info(course?.files?.[0] ? 'Analizando tus apuntes...' : 'Generando guía de estudio...');
    try {
      const script = courseContent?.podcastScript || await generatePodcastScript(userId, content, language, course?.studyLevel, undefined);
      const audioBase64 = await generatePodcastAudio(userId, script);
      if (audioBase64) {
        const binary = atob(audioBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'audio/mp3' });
        const url = URL.createObjectURL(blob);
        setPodcastAudioUrl(url);
        
        if (courseId) {
          await updateCourse(courseId, { 
            podcastScript: script,
            completedSections: { ...course?.completedSections, podcast: true }
          });
        }
        
        toast.success('¡Listo!');
      }
    } catch (error: any) {
      console.error("Error generating podcast:", error);
      if (error?.message === 'INSUFFICIENT_CREDITS') {
        setIsLimitModalOpen(true);
      } else {
        toast.error('Error al generar el podcast');
      }
    } finally {
      setIsGeneratingPodcast(false);
    }
  };

  const handleFilePodcast = async (file: CourseFile) => {
    if (!userId) {
      toast.error('Debes iniciar sesión');
      return;
    }
    setIsGeneratingPodcast(true);
    setPodcastAudioUrl(null);
    toast.info('Analizando tus apuntes...');
    try {
      const fileData = await getFileData(file);
      if (!fileData || (!fileData.text && !fileData.data)) {
        toast.error('No hay contenido para generar el podcast');
        return;
      }
      
      const content = fileData.text || `Contenido del archivo ${file.name}`;
      const script = await generatePodcastScript(userId, content, language, course?.studyLevel, fileData);
      const audioBase64 = await generatePodcastAudio(userId, script);
      if (audioBase64) {
        const binary = atob(audioBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'audio/mp3' });
        const url = URL.createObjectURL(blob);
        setPodcastAudioUrl(url);
        toast.success('¡Listo!');
      } else {
        toast.error('El servicio de audio está saturado. Intenta con un texto más corto.');
      }
    } catch (error: any) {
      console.error("Error generating file podcast:", error);
      if (error?.message === 'INSUFFICIENT_CREDITS') {
        setIsLimitModalOpen(true);
      } else {
        toast.error('Error al generar el podcast');
      }
    } finally {
      setIsGeneratingPodcast(false);
    }
  };

  const handlePodcastFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;

    setIsGeneratingPodcast(true);
    setPodcastAudioUrl(null);
    toast.info('Procesando archivo para el podcast...');

    try {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      let text = undefined;
      if (file.type.includes('text') || file.type.includes('json') || file.type.includes('markdown')) {
        text = await file.text();
      }

      const fileData = { data: base64Data, mimeType: file.type, text };
      
      const content = text || `Contenido del archivo ${file.name}`;
      const script = await generatePodcastScript(userId, content, language, course?.studyLevel, fileData);
      const audioBase64 = await generatePodcastAudio(userId, script);
      
      if (audioBase64) {
        const binary = atob(audioBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'audio/mp3' });
        const url = URL.createObjectURL(blob);
        setPodcastAudioUrl(url);
        toast.success('¡Podcast generado desde el archivo!');
      } else {
        toast.error('No se pudo generar el audio. El archivo podría ser demasiado complejo.');
      }
    } catch (error: any) {
      console.error("Error generating podcast from upload:", error);
      if (error?.message === 'INSUFFICIENT_CREDITS') {
        setIsLimitModalOpen(true);
      } else {
        toast.error('Error al generar el podcast desde el archivo');
      }
    } finally {
      setIsGeneratingPodcast(false);
      // Reset input
      e.target.value = '';
    }
  };

  const handleFeedback = (contentId: string, type: 'up' | 'down') => {
    const newFeedback = { ...feedback, [contentId]: type };
    setFeedback(newFeedback);
    
    // Store feedback in localStorage
    const storedFeedback = JSON.parse(localStorage.getItem('ai_study_feedback') || '[]');
    storedFeedback.push({
      id: contentId,
      type,
      timestamp: new Date().toISOString(),
      language
    });
    localStorage.setItem('ai_study_feedback', JSON.stringify(storedFeedback));
    
    toast.success('¡Gracias por tu feedback!');
  };

  const FeedbackButtons = ({ id }: { id: string }) => (
    <div className="flex flex-wrap items-center justify-center gap-3 mt-4 pt-4 border-t border-outline-variant/10">
      <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
        ¿Te resultó útil?
      </p>
      <div className="flex gap-2">
        <button 
          onClick={() => handleFeedback(id, 'up')}
          className={cn(
            "p-1.5 rounded-lg transition-all",
            feedback[id] === 'up' ? "bg-green-500 text-white" : "bg-surface-container-high text-on-surface-variant hover:text-green-500"
          )}
        >
          <ThumbsUp size={14} />
        </button>
        <button 
          onClick={() => handleFeedback(id, 'down')}
          className={cn(
            "p-1.5 rounded-lg transition-all",
            feedback[id] === 'down' ? "bg-error text-on-error" : "bg-surface-container-high text-on-surface-variant hover:text-error"
          )}
        >
          <ThumbsDown size={14} />
        </button>
      </div>
    </div>
  );

  return (
    <div className="responsive-container space-y-10 px-4 md:px-0">
      <UsageLimitModal isOpen={isLimitModalOpen} onClose={() => setIsLimitModalOpen(false)} />
      {/* Breadcrumbs */}
      <nav className="w-full flex flex-wrap items-center justify-center md:justify-start gap-2 text-on-surface-variant text-sm font-medium">
        <button className="hover:text-primary transition-colors">Inicio</button>
        <ChevronRight size={14} />
        <span className="text-on-surface text-center">{course?.title || 'Cursos'}</span>
      </nav>

      {/* Header Title */}
      <div className="w-full mb-10 relative">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-6 text-center md:text-left">
          <div className="space-y-2 flex flex-col items-center md:items-start">
            <h2 className="text-3xl md:text-4xl font-extrabold font-headline text-on-surface tracking-tight leading-tight">
              {course?.title || 'Cursos'}
            </h2>
            <p className="text-on-surface-variant max-w-md">{course?.subtitle}</p>
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 md:gap-6 text-on-surface-variant">
              <div className="flex items-center space-x-2">
                <Timer className="text-secondary" size={18} />
                <span className="text-xs md:text-sm font-medium">Estudio estimado: {course?.estimatedHours || 4.5} horas</span>
              </div>
              <div className="flex items-center space-x-2">
                <CheckCircle className="text-primary" size={18} />
                <span className="text-xs md:text-sm font-medium">Progreso: {progress}% ({course?.status || 'en progreso'})</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4">
            <div className="flex items-center gap-4 bg-card p-4 rounded-2xl shadow-sm border border-outline-variant/10">
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <Trophy size={20} className="md:w-6 md:h-6" />
              </div>
              <div className="text-left">
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest leading-none mb-1">Próximo Hito</p>
                <p className="text-xs md:text-sm font-bold text-on-surface">Examen de Unidad</p>
              </div>
            </div>

            <AnimatePresence mode="wait">
              {!isCompleted ? (
                <motion.button
                  key="complete-btn"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  onClick={handleComplete}
                  className="bg-primary text-on-primary px-4 md:px-6 py-3 md:py-4 rounded-2xl font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all flex items-center gap-2 text-sm md:text-base"
                >
                  <CheckCircle size={18} className="md:w-5 md:h-5" />
                  Marcar como completado
                </motion.button>
              ) : (
                <motion.div
                  key="completed-badge"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-green-500 text-white px-4 md:px-6 py-3 md:py-4 rounded-2xl font-bold shadow-lg shadow-green-500/20 flex items-center gap-2 text-sm md:text-base"
                >
                  <Check size={18} className="md:w-5 md:h-5" />
                  Módulo completado
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="w-full space-y-2">
          <div className="flex flex-wrap justify-between items-center gap-2">
            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.2em]">Progreso del Curso</span>
            <div className="flex items-center gap-3">
              <input 
                type="range" 
                min="0" 
                max="100" 
                value={progress} 
                onChange={async (e) => {
                  const val = parseInt(e.target.value);
                  setProgress(val);
                  if (courseId) await updateCourseProgress(courseId, val);
                  if (val === 100 && !isCompleted) {
                    await handleComplete();
                  } else if (val < 100) {
                    setIsCompleted(false);
                  }
                }}
                className="hidden md:block w-32 accent-primary h-1.5 bg-surface-container-highest rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex items-center gap-1">
                <input 
                  type="number"
                  min="0"
                  max="100"
                  value={progress}
                  onChange={(e) => {
                    const val = Math.min(100, Math.max(0, parseInt(e.target.value) || 0));
                    setProgress(val);
                    if (courseId) updateCourseProgress(courseId, val);
                    if (val === 100 && !isCompleted) {
                      handleComplete();
                    } else if (val < 100) {
                      setIsCompleted(false);
                    }
                  }}
                  className="w-12 bg-surface-container-low border border-outline-variant/30 rounded-md px-1 py-0.5 text-xs font-bold text-primary text-center outline-none focus:border-primary"
                />
                <span className="text-xs font-bold text-primary">%</span>
              </div>
            </div>
          </div>
          <div className="w-full h-3 bg-surface-container-highest rounded-full overflow-hidden shadow-inner">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ type: "spring", stiffness: 50, damping: 15 }}
              className="h-full bg-gradient-to-r from-primary via-primary-container to-secondary rounded-full relative"
            >
              <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.2)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.2)_50%,rgba(255,255,255,0.2)_75%,transparent_75%,transparent)] bg-[length:20px_20px] animate-[progress-stripe_1s_linear_infinite]"></div>
            </motion.div>
          </div>
        </div>
      </div>

      <div className="w-full flex flex-col lg:flex-row gap-8">
        {/* Main Content */}
        <div className="flex-1 w-full max-w-full overflow-x-hidden">
          <div className="flex flex-wrap justify-center md:justify-start gap-4 md:gap-8 mb-8 border-b border-outline-variant/10">
            <button 
              onClick={() => scrollToSection('summary')}
              className={cn(
                "pb-4 font-bold transition-all text-sm md:text-base",
                activeSection === 'summary' ? "text-primary border-b-2 border-primary" : "text-on-surface-variant hover:text-on-surface"
              )}
            >
              Resumen
            </button>
            <button 
              onClick={() => scrollToSection('theory')}
              className={cn(
                "pb-4 font-bold transition-all text-sm md:text-base",
                activeSection === 'theory' ? "text-primary border-b-2 border-primary" : "text-on-surface-variant hover:text-on-surface"
              )}
            >
              Teoría
            </button>
            <button 
              onClick={() => scrollToSection('exercises')}
              className={cn(
                "pb-4 font-bold transition-all text-sm md:text-base",
                activeSection === 'exercises' ? "text-primary border-b-2 border-primary" : "text-on-surface-variant hover:text-on-surface"
              )}
            >
              Ejercicios
            </button>
            <button 
              onClick={() => scrollToSection('exams')}
              className={cn(
                "pb-4 font-bold transition-all text-sm md:text-base",
                activeSection === 'exams' ? "text-primary border-b-2 border-primary" : "text-on-surface-variant hover:text-on-surface"
              )}
            >
              Exámenes de Práctica
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
            {/* AI Summary Card */}
            <div id="summary" className="responsive-card md:col-span-2 bg-card rounded-xl p-6 md:p-8 shadow-sm scroll-mt-24 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 blur-3xl"></div>
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div className="flex items-center space-x-2">
                  <Sparkles className="text-primary" size={20} />
                  <h3 className="font-headline font-bold text-xl">Resumen de IA</h3>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button 
                    onClick={() => handleGenerateSummary(course?.title || '')}
                    disabled={isGeneratingSummary}
                    className="flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary rounded-xl text-xs font-bold hover:bg-primary hover:text-on-primary transition-all disabled:opacity-50"
                  >
                    {isGeneratingSummary ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3" />
                    )}
                    Generar Resumen
                  </button>
                  {courseContent?.summary && (
                    <div className="flex flex-wrap gap-2">
                      <button 
                        onClick={() => handleGeneratePodcast(courseContent.summary!)}
                        disabled={isGeneratingPodcast}
                        className="flex items-center gap-2 px-4 py-2 bg-secondary/10 text-secondary rounded-xl text-xs font-bold hover:bg-secondary hover:text-on-secondary transition-all disabled:opacity-50"
                      >
                        {isGeneratingPodcast ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Headphones className="w-3 h-3" />
                        )}
                        Generar Podcast
                      </button>
                      
                      <label className={cn(
                        "flex items-center gap-2 px-4 py-2 bg-secondary/10 text-secondary rounded-xl text-xs font-bold hover:bg-secondary hover:text-on-secondary transition-all cursor-pointer disabled:opacity-50",
                        isGeneratingPodcast && "opacity-50 cursor-not-allowed"
                      )}>
                        <Upload className="w-3 h-3" />
                        Subir Archivo
                        <input 
                          type="file" 
                          className="hidden" 
                          onChange={handlePodcastFileUpload}
                          disabled={isGeneratingPodcast}
                          accept=".pdf,.doc,.docx,.txt,.md"
                        />
                      </label>
                    </div>
                  )}
                </div>
              </div>

              <div key={`podcast-container-${course.id}`} className="prose prose-sm max-w-none text-on-surface-variant leading-relaxed">
                {podcastAudioUrl && (
                  <div key={`podcast-audio-player-${course.id}`} className="mb-6 p-4 bg-secondary/5 rounded-2xl border border-secondary/20 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-secondary text-on-secondary flex items-center justify-center">
                      <Play size={20} />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-bold text-secondary uppercase tracking-widest mb-1">Podcast</p>
                      <audio src={podcastAudioUrl} controls className="w-full h-8" />
                    </div>
                    <button 
                      onClick={() => setPodcastAudioUrl(null)}
                      className="p-2 text-on-surface-variant hover:text-red-500 transition-colors"
                    >
                      <X size={16} />
                    </button>
                  </div>
                )}
                {courseContent?.summary ? (
                  <div key={`summary-content-wrapper-${course.id}`}>
                    <Markdown>{courseContent.summary}</Markdown>
                    <FeedbackButtons id={`summary_${course.id}`} />
                  </div>
                ) : (
                  <div key={`summary-loading-${course.id}`} className="flex flex-col items-center justify-center py-12 text-center">
                    <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
                    <p className="text-on-surface-variant italic">Generando resumen inteligente...</p>
                  </div>
                )}
              </div>

              <div className="mt-6 flex flex-wrap gap-2">
                <span className="px-3 py-1 bg-surface-container-low text-on-surface-variant text-xs rounded-full">Formalismo</span>
                <span className="px-3 py-1 bg-surface-container-low text-on-surface-variant text-xs rounded-full">Crítica Contextual</span>
                <span className="px-3 py-1 bg-surface-container-low text-on-surface-variant text-xs rounded-full">Identificación de Motivos</span>
              </div>
            </div>

            {/* Theory Cards */}
            <div id="theory" className="responsive-card bg-card rounded-xl p-6 shadow-sm group scroll-mt-24 flex flex-col">
              <div className="flex justify-between items-start mb-4">
                <h4 className="font-headline font-bold text-lg text-on-surface">Teoría del Curso</h4>
                <button 
                  onClick={() => handleGenerateFlashcards(courseContent?.theory || course?.title || '')}
                  disabled={isGeneratingFlashcards}
                  className="p-2 bg-secondary/10 text-secondary rounded-lg hover:bg-secondary hover:text-white transition-all disabled:opacity-50"
                  title="Generar Tarjetas de Estudio"
                >
                  {isGeneratingFlashcards ? <Loader2 size={16} className="animate-spin" /> : <BrainCircuit size={16} />}
                </button>
              </div>
              <p className="text-on-surface-variant text-sm leading-relaxed mb-4 flex-1 line-clamp-3">
                {courseContent?.theory ? courseContent.theory.substring(0, 150) + '...' : 'Descripción de la teoría...'}
              </p>
              <button 
                onClick={() => setShowTheoryModal(true)}
                className="text-primary font-semibold text-sm flex items-center group-hover:translate-x-1 transition-transform"
              >
                Explorar Teoría <ArrowRight className="ml-1" size={14} />
              </button>
            </div>

            <div className="responsive-card bg-card rounded-xl p-6 shadow-sm group flex flex-col">
              <div className="flex justify-between items-start mb-4">
                <h4 className="font-headline font-bold text-lg text-on-surface">Ejemplos Prácticos</h4>
                <button 
                  onClick={() => handleGenerateFlashcards(courseContent?.examples || course?.title || '')}
                  disabled={isGeneratingFlashcards}
                  className="p-2 bg-secondary/10 text-secondary rounded-lg hover:bg-secondary hover:text-white transition-all disabled:opacity-50"
                  title="Generar Tarjetas de Estudio"
                >
                  {isGeneratingFlashcards ? <Loader2 size={16} className="animate-spin" /> : <BrainCircuit size={16} />}
                </button>
              </div>
              <p className="text-on-surface-variant text-sm leading-relaxed mb-4 flex-1 line-clamp-3">
                {courseContent?.examples ? courseContent.examples.substring(0, 150) + '...' : 'Descripción de ejemplos...'}
              </p>
              <button 
                onClick={() => setShowExamplesModal(true)}
                className="text-primary font-semibold text-sm flex items-center group-hover:translate-x-1 transition-transform"
              >
                Ver Ejemplos <ArrowRight className="ml-1" size={14} />
              </button>
            </div>

            {/* Exercises & Diagrams */}
            <div id="exercises" className="responsive-card bg-card rounded-xl p-6 shadow-sm group scroll-mt-24 flex flex-col">
              <div className="flex justify-between items-start mb-4">
                <h4 className="font-headline font-bold text-lg text-on-surface">Ejercicios</h4>
                <button 
                  onClick={() => handleGenerateExercises(course?.title || '')}
                  disabled={isGeneratingExercises}
                  className="p-2 bg-primary/10 text-primary rounded-lg hover:bg-primary hover:text-white transition-all disabled:opacity-50"
                >
                  {isGeneratingExercises ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                </button>
              </div>
              <p className="text-on-surface-variant text-sm leading-relaxed mb-4 flex-1 line-clamp-3">
                {courseContent?.exercises ? courseContent.exercises.substring(0, 150) + '...' : 'Descripción de ejercicios...'}
              </p>
              <button 
                onClick={() => setShowExercisesModal(true)}
                className="text-primary font-semibold text-sm flex items-center group-hover:translate-x-1 transition-transform"
              >
                Ver Ejercicios <ArrowRight className="ml-1" size={14} />
              </button>
            </div>

            <div id="diagram" className="responsive-card bg-card rounded-xl p-6 shadow-sm group scroll-mt-24 flex flex-col">
              <div className="flex justify-between items-start mb-4">
                <h4 className="font-headline font-bold text-lg text-on-surface">Esquemas</h4>
                <button 
                  onClick={() => handleGenerateDiagram(course?.title || '')}
                  disabled={isGeneratingDiagram}
                  className="p-2 bg-primary/10 text-primary rounded-lg hover:bg-primary hover:text-white transition-all disabled:opacity-50"
                >
                  {isGeneratingDiagram ? <Loader2 size={16} className="animate-spin" /> : <Network size={16} />}
                </button>
              </div>
              <p className="text-on-surface-variant text-sm leading-relaxed mb-4 flex-1 line-clamp-3">
                {courseContent?.diagram ? courseContent.diagram.substring(0, 150) + '...' : 'Descripción del esquema...'}
              </p>
              <button 
                onClick={() => setShowDiagramModal(true)}
                className="text-primary font-semibold text-sm flex items-center group-hover:translate-x-1 transition-transform"
              >
                Ver Esquema <ArrowRight className="ml-1" size={14} />
              </button>
            </div>

            {/* Practice Exams */}
            <div id="exams" className="responsive-card md:col-span-2 bg-card rounded-xl p-6 md:p-8 shadow-sm scroll-mt-24 w-full">
              <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
                <h3 className="font-headline font-bold text-xl">Exámenes Disponibles</h3>
                <span className="text-[10px] font-semibold text-tertiary bg-tertiary-container/10 px-3 py-1 rounded-full uppercase tracking-wider">Prioridad Alta</span>
              </div>
              <div className="space-y-4">
                {courseContent?.exams && courseContent.exams.length > 0 ? (
                  courseContent.exams.map((exam, idx) => (
                    <div key={`exam-list-${idx}`} className="flex flex-col sm:flex-row items-center justify-between p-4 rounded-xl hover:bg-surface-container-low transition-colors group gap-4">
                      <div className="flex items-center space-x-4 w-full">
                        <div className="p-2 bg-secondary/10 rounded-lg text-secondary flex-shrink-0">
                          <CheckCircle size={20} />
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-on-surface truncate">Examen de Práctica {idx + 1}</p>
                          <p className="text-xs text-on-surface-variant truncate">{exam.question.substring(0, 50)}...</p>
                        </div>
                      </div>
                      <button 
                        onClick={async () => {
                          setShowExamModal(true);
                          if (courseId) {
                            await updateCourse(courseId, { 
                              completedSections: { ...course?.completedSections, exam: true }
                            });
                          }
                        }}
                        className="w-full sm:w-auto px-4 py-2 text-primary font-bold text-sm border border-primary/20 rounded-lg group-hover:bg-primary group-hover:text-on-primary transition-all"
                      >
                        Comenzar Intento
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center bg-surface-container-low rounded-xl border border-dashed border-outline-variant/30">
                    <Loader2 className="w-6 h-6 animate-spin text-primary mb-2" />
                    <p className="text-xs text-on-surface-variant italic">Generando exámenes personalizados...</p>
                  </div>
                )}

                <div className="p-6 bg-primary/5 rounded-2xl border border-primary/10 flex flex-col sm:flex-row items-center justify-between gap-6">
                  <div className="flex items-center gap-4 text-center sm:text-left">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary flex-shrink-0 mx-auto sm:mx-0">
                      <Sparkles size={24} />
                    </div>
                    <div>
                      <h4 className="font-bold text-on-surface">Regenerar Examen</h4>
                      <p className="text-xs text-on-surface-variant">Preguntas personalizadas basadas en tu progreso</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => handleGenerateExam(course?.summary || course?.title || '')}
                    disabled={isGeneratingExam}
                    className="w-full sm:w-auto px-6 py-3 bg-primary text-on-primary rounded-xl font-bold text-sm shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isGeneratingExam ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                    Generar Ahora
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* AI Assistant Sidebar */}
        <aside className="w-full lg:w-80 space-y-6 flex flex-col items-center">
          {/* Table of Contents */}
          <div className="responsive-card bg-card rounded-xl p-6 shadow-sm sticky top-6">
            <h3 className="font-headline font-bold text-lg mb-6 flex items-center gap-2">
              <div className="w-1.5 h-6 bg-primary rounded-full"></div>
              Tabla de Contenidos
            </h3>
            <nav className="space-y-1">
              {[
                { id: 'summary', label: 'Resumen' },
                { id: 'theory', label: 'Teoría' },
                { id: 'exercises', label: 'Ejercicios' },
                { id: 'exams', label: 'Exámenes de Práctica' }
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => scrollToSection(item.id)}
                  className={cn(
                    "w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-all flex items-center justify-between group",
                    activeSection === item.id
                      ? "bg-primary/10 text-primary"
                      : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
                  )}
                >
                  <span>{item.label}</span>
                  {activeSection === item.id && (
                    <motion.div layoutId="active-indicator" className="w-1.5 h-1.5 rounded-full bg-primary" />
                  )}
                </button>
              ))}
            </nav>
          </div>

          <div className="responsive-card bg-card rounded-xl p-6 shadow-sm">
            <h3 className="font-headline font-bold text-lg mb-4 flex items-center gap-2">
              <FileText size={18} className="text-primary" />
              Archivos del Curso
            </h3>
            <div className="space-y-3">
              {course?.files && course.files.length > 0 ? (
                course.files.map((file) => (
                  <div key={file.id} className="flex items-center justify-between p-3 bg-surface-container-low rounded-xl border border-outline-variant/10 group hover:border-primary/30 transition-all">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2 bg-primary/5 rounded-lg text-primary flex-shrink-0">
                        <FileText size={16} />
                      </div>
                      <span className="text-xs font-medium text-on-surface truncate">{file.name}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button 
                        onClick={() => handleFilePodcast(file)}
                        disabled={isGeneratingPodcast}
                        className="p-1.5 text-on-surface-variant hover:text-secondary transition-colors flex-shrink-0 disabled:opacity-50"
                        title="Generar Podcast"
                      >
                        <Headphones size={14} />
                      </button>
                      <a href={file.url} target="_blank" rel="noreferrer" className="p-1.5 text-on-surface-variant hover:text-primary transition-colors flex-shrink-0">
                        <ArrowRight size={14} />
                      </a>
                      <button 
                        onClick={() => courseId && removeFileFromCourse(courseId, file.id)}
                        className="p-1.5 text-on-surface-variant hover:text-error transition-colors flex-shrink-0"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-on-surface-variant opacity-60 italic">No hay archivos subidos</p>
              )}
              <label className="flex items-center justify-center w-full p-3 border-2 border-dashed border-outline-variant/30 rounded-xl cursor-pointer hover:bg-surface-container-high transition-all mt-4">
                <Plus size={16} className="text-on-surface-variant opacity-40 mr-2" />
                <span className="text-xs font-bold text-on-surface-variant">
                  {isUploading ? `Subiendo... ${uploadProgress}%` : 'Subir más'}
                </span>
                <input 
                  type="file" 
                  className="hidden" 
                  disabled={isUploading}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file && courseId) {
                      setIsUploading(true);
                      setUploadProgress(0);
                      try {
                        await addFileToCourse(courseId, file, (progress) => {
                          setUploadProgress(Math.round(progress));
                        });
                        toast.success(language === 'es' ? 'Archivo subido correctamente' : 'File uploaded successfully');
                      } catch (error) {
                        console.error('Upload error:', error);
                        toast.error(language === 'es' ? 'Error al subir archivo' : 'Error uploading file');
                      } finally {
                        setIsUploading(false);
                        setUploadProgress(0);
                      }
                    }
                  }} 
                />
              </label>
            </div>
          </div>

          <div className="responsive-card bg-card rounded-xl p-6 shadow-sm">
            <div className="flex items-center space-x-3 mb-6">
              <div className="w-8 h-8 rounded-lg bg-primary-container flex items-center justify-center text-on-primary">
                <BrainCircuit size={18} />
              </div>
              <h3 className="font-headline font-bold text-lg">Pregunta a la IA</h3>
            </div>
            <div className="bg-surface-container-low rounded-xl p-4 mb-4 text-sm text-on-surface-variant leading-relaxed">
              Hola, soy tu asistente de IA. ¿En qué puedo ayudarte hoy con el curso de {course?.title}?
            </div>
            <div className="space-y-3 mb-6">
              <button 
                onClick={() => {
                  setAiQuestion(`Explica conceptos clave de ${course?.title}`);
                  handleGenerateSummary(`Explica conceptos clave de ${course?.title}`);
                }}
                className="w-full text-left p-3 text-xs bg-surface-container-high hover:bg-surface-container-highest rounded-lg text-on-surface transition-colors flex justify-between items-center group"
              >
                <span className="truncate mr-2">Explica conceptos clave</span>
                <Send className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" size={12} />
              </button>
              <button 
                onClick={() => {
                  setAiQuestion(`Resume puntos importantes de ${course?.title}`);
                  handleGenerateSummary(`Resume puntos importantes de ${course?.title}`);
                }}
                className="w-full text-left p-3 text-xs bg-surface-container-high hover:bg-surface-container-highest rounded-lg text-on-surface transition-colors flex justify-between items-center group"
              >
                <span className="truncate mr-2">Resume puntos importantes</span>
                <Send className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" size={12} />
              </button>
            </div>
            <div className="relative">
              <input 
                className="w-full bg-surface-container-high border-none rounded-xl py-4 pl-4 pr-12 text-sm focus:ring-1 focus:ring-primary/20 transition-all outline-none" 
                placeholder="Haz una pregunta..."
                type="text"
                value={aiQuestion}
                onChange={(e) => setAiQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && aiQuestion.trim()) {
                    handleGenerateSummary(aiQuestion);
                    setAiQuestion('');
                  }
                }}
              />
              <button 
                onClick={() => {
                  if (aiQuestion.trim()) {
                    handleGenerateSummary(aiQuestion);
                    setAiQuestion('');
                  }
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-primary"
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        </aside>
      </div>

      {/* Flashcards Modal */}
      <AnimatePresence>
        {showFlashcardsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowFlashcardsModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-[95%] max-w-2xl bg-surface rounded-[2.5rem] shadow-2xl overflow-hidden border border-outline-variant/10"
            >
              <div className="p-8 flex items-center justify-between border-b border-outline-variant/10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center text-secondary">
                    <BrainCircuit size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold font-headline text-on-surface">Estudiar Tarjetas</h3>
                    <p className="text-xs text-on-surface-variant font-medium uppercase tracking-widest">
                      {currentFlashcardIndex + 1} de {generatedFlashcards.length}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowFlashcardsModal(false)}
                  className="p-2 hover:bg-surface-container-high rounded-full transition-colors text-on-surface-variant"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="p-8 sm:p-12">
                <div className="perspective-1000 h-80 w-full">
                  <motion.div
                    animate={{ rotateY: isFlashcardFlipped ? 180 : 0 }}
                    transition={{ type: "spring", stiffness: 260, damping: 20 }}
                    className="relative w-full h-full preserve-3d cursor-pointer"
                    onClick={() => setIsFlashcardFlipped(!isFlashcardFlipped)}
                  >
                    {/* Front */}
                    <div className="absolute inset-0 backface-hidden bg-surface-container-low rounded-[2rem] p-8 flex flex-col items-center justify-center text-center border-2 border-outline-variant/10 shadow-lg">
                      <span className="text-[10px] font-bold text-secondary uppercase tracking-[0.2em] mb-4">Pregunta</span>
                      <p className="text-xl sm:text-2xl font-bold text-on-surface leading-tight">
                        {generatedFlashcards[currentFlashcardIndex]?.front}
                      </p>
                      <div className="mt-8 flex items-center gap-2 text-on-surface-variant opacity-60 text-xs font-bold uppercase tracking-widest">
                        <RotateCcw size={14} />
                        Haz clic para voltear
                      </div>
                    </div>

                    {/* Back */}
                    <div 
                      className="absolute inset-0 backface-hidden bg-secondary text-on-secondary rounded-[2rem] p-8 flex flex-col items-center justify-center text-center border-2 border-secondary/20 shadow-lg"
                      style={{ transform: 'rotateY(180deg)' }}
                    >
                      <span className="text-[10px] font-bold text-on-secondary/60 uppercase tracking-[0.2em] mb-4">Respuesta</span>
                      <p className="text-lg sm:text-xl font-medium leading-relaxed">
                        {generatedFlashcards[currentFlashcardIndex]?.back}
                      </p>
                    </div>
                  </motion.div>
                </div>

                <div className="mt-10 flex items-center justify-between">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (currentFlashcardIndex > 0) {
                        setCurrentFlashcardIndex(prev => prev - 1);
                        setIsFlashcardFlipped(false);
                      }
                    }}
                    disabled={currentFlashcardIndex === 0}
                    className="p-4 rounded-2xl bg-surface-container-high text-on-surface disabled:opacity-30 hover:bg-surface-container-highest transition-all"
                  >
                    <ChevronLeft size={24} />
                  </button>
                  
                  <div className="flex gap-2">
                    {generatedFlashcards.map((_, idx) => (
                      <div 
                        key={`flashcard-dot-${idx}`}
                        className={cn(
                          "h-1.5 rounded-full transition-all duration-300",
                          idx === currentFlashcardIndex ? "w-8 bg-secondary" : "w-2 bg-outline-variant/30"
                        )}
                      />
                    ))}
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (currentFlashcardIndex < generatedFlashcards.length - 1) {
                        setCurrentFlashcardIndex(prev => prev + 1);
                        setIsFlashcardFlipped(false);
                      }
                    }}
                    disabled={currentFlashcardIndex === generatedFlashcards.length - 1}
                    className="p-4 rounded-2xl bg-surface-container-high text-on-surface disabled:opacity-30 hover:bg-surface-container-highest transition-all"
                  >
                    <ChevronRight size={24} />
                  </button>
                </div>

                <div className="mt-6 flex justify-center">
                  <FeedbackButtons id={`flashcards_${course?.id}`} />
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Exam Modal */}
      <AnimatePresence>
        {showExamModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowExamModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-[95%] max-w-3xl bg-surface rounded-[2.5rem] shadow-2xl overflow-hidden border border-outline-variant/10 max-h-[90vh] flex flex-col"
            >
              <div className="p-8 flex items-center justify-between border-b border-outline-variant/10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                    <Sparkles size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold font-headline text-on-surface">Examen de Práctica</h3>
                    <p className="text-xs text-on-surface-variant font-medium uppercase tracking-widest">
                      {courseContent?.exams?.length || 0} Preguntas
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowExamModal(false)}
                  className="p-2 hover:bg-surface-container-high rounded-full transition-colors text-on-surface-variant"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="p-8 overflow-y-auto flex-1">
                <div className="space-y-8">
                  {courseContent?.exams?.map((q, idx) => (
                    <div key={`exam-modal-q-${idx}`} className="space-y-4">
                      <p className="font-bold text-on-surface">
                        <span className="text-primary mr-2">{idx + 1}.</span>
                        {q.question}
                      </p>
                      <div className="grid grid-cols-1 gap-2">
                        {q.options.map((opt, optIdx) => (
                          <div 
                            key={`exam-modal-opt-${idx}-${optIdx}`}
                            className="p-4 rounded-xl border border-outline-variant/30 bg-surface-container-low text-sm"
                          >
                            {opt}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                
                <div className="mt-12 flex flex-col items-center gap-4">
                  <FeedbackButtons id={`exam_${course?.id}`} />
                  <button 
                    onClick={() => setShowExamModal(false)}
                    className="w-full py-4 bg-primary text-on-primary rounded-2xl font-bold"
                  >
                    Cerrar Examen
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Theory Modal */}
      <AnimatePresence>
        {showTheoryModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowTheoryModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-[95%] max-w-4xl max-h-[90vh] bg-surface rounded-[2.5rem] shadow-2xl overflow-hidden border border-outline-variant/10 flex flex-col"
            >
              <div className="p-8 flex items-center justify-between border-b border-outline-variant/10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                    <FileText size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold font-headline text-on-surface">Explorar Teoría</h3>
                    <p className="text-xs text-on-surface-variant font-medium uppercase tracking-widest">
                      Contenido detallado del curso
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowTheoryModal(false)}
                  className="p-2 hover:bg-surface-container-high rounded-full transition-colors text-on-surface-variant"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="p-8 overflow-y-auto flex-1">
                <div className="prose prose-sm sm:prose-base max-w-none text-on-surface-variant leading-relaxed">
                  {courseContent?.theory ? (
                    <div key={`theory-content-wrapper-${course.id}`}>
                      <Markdown>{courseContent.theory}</Markdown>
                    </div>
                  ) : (
                    <div key={`theory-loading-${course.id}`} className="flex flex-col items-center justify-center py-12 text-center">
                      <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
                      <p className="text-on-surface-variant italic">Generando teoría detallada...</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Examples Modal */}
      <AnimatePresence>
        {showExamplesModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowExamplesModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-[95%] max-w-4xl max-h-[90vh] bg-surface rounded-[2.5rem] shadow-2xl overflow-hidden border border-outline-variant/10 flex flex-col"
            >
              <div className="p-8 flex items-center justify-between border-b border-outline-variant/10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center text-secondary">
                    <Sparkles size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold font-headline text-on-surface">Ejemplos Prácticos</h3>
                    <p className="text-xs text-on-surface-variant font-medium uppercase tracking-widest">
                      Casos de estudio y aplicaciones
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowExamplesModal(false)}
                  className="p-2 hover:bg-surface-container-high rounded-full transition-colors text-on-surface-variant"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="p-8 overflow-y-auto flex-1">
                <div className="prose prose-sm sm:prose-base max-w-none text-on-surface-variant leading-relaxed">
                  {courseContent?.examples ? (
                    <div key={`examples-content-wrapper-${course.id}`}>
                      <Markdown>{courseContent.examples}</Markdown>
                    </div>
                  ) : (
                    <div key={`examples-loading-${course.id}`} className="flex flex-col items-center justify-center py-12 text-center">
                      <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
                      <p className="text-on-surface-variant italic">Generando ejemplos prácticos...</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Exercises Modal */}
      <AnimatePresence>
        {showExercisesModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowExercisesModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-[95%] max-w-4xl max-h-[90vh] bg-surface rounded-[2.5rem] shadow-2xl overflow-hidden border border-outline-variant/10 flex flex-col"
            >
              <div className="p-8 flex items-center justify-between border-b border-outline-variant/10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                    <Dumbbell size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold font-headline text-on-surface">Ejercicios</h3>
                    <p className="text-xs text-on-surface-variant font-medium uppercase tracking-widest">
                      Práctica y ejercicios
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowExercisesModal(false)}
                  className="p-2 hover:bg-surface-container-high rounded-full transition-colors text-on-surface-variant"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="p-8 overflow-y-auto flex-1">
                <div className="prose prose-sm sm:prose-base max-w-none text-on-surface-variant leading-relaxed">
                  {courseContent?.exercises ? (
                    <div key={`exercises-content-wrapper-${course.id}`}>
                      <Markdown>{courseContent.exercises}</Markdown>
                    </div>
                  ) : (
                    <div key={`exercises-loading-${course.id}`} className="flex flex-col items-center justify-center py-12 text-center">
                      <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
                      <p className="text-on-surface-variant italic">Generando ejercicios...</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Diagram Modal */}
      <AnimatePresence>
        {showDiagramModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDiagramModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-[95%] max-w-4xl max-h-[90vh] bg-surface rounded-[2.5rem] shadow-2xl overflow-hidden border border-outline-variant/10 flex flex-col"
            >
              <div className="p-8 flex items-center justify-between border-b border-outline-variant/10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                    <Network size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold font-headline text-on-surface">Esquemas</h3>
                    <p className="text-xs text-on-surface-variant font-medium uppercase tracking-widest">
                      Esquemas y mapas conceptuales
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowDiagramModal(false)}
                  className="p-2 hover:bg-surface-container-high rounded-full transition-colors text-on-surface-variant"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="p-8 overflow-y-auto flex-1">
                <div className="prose prose-sm sm:prose-base max-w-none text-on-surface-variant leading-relaxed">
                  {courseContent?.diagram ? (
                    <div key={`diagram-content-wrapper-${course.id}`}>
                      <Markdown>{courseContent.diagram}</Markdown>
                    </div>
                  ) : (
                    <div key={`diagram-loading-${course.id}`} className="flex flex-col items-center justify-center py-12 text-center">
                      <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
                      <p className="text-on-surface-variant italic">Generando esquemas...</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
