import React, { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useCourses } from '../contexts/CourseContext';
import { Sparkles, BookOpen, Target, Loader2, ChevronRight, AlertCircle, CheckCircle2, ThumbsUp, ThumbsDown, Play, Pause, RotateCcw, Timer, Layers, ChevronLeft, RefreshCw, Download, Upload, FileText, X, Copy, Check, Activity, Table as TableIcon } from 'lucide-react';
import { cn } from '../lib/utils';
import { generateSummary, generateAdaptivePlan, generateFlashcards, generateExam, generateExercises, generateDiagram, getAI, handleAIError as centralHandleAIError } from '../services/geminiService';
import { getUserCredits, consumeCredit } from '../services/userService';
import type { StudyPlan } from '../services/geminiService';
import { Flashcard, ExamQuestion, ExamResult, StudyLevel } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import * as XLSX from 'xlsx';
import autoTable from 'jspdf-autotable';
import * as mammoth from 'mammoth';
import confetti from 'canvas-confetti';
import { UsageLimitModal } from './UsageLimitModal';
import { auth } from '../firebase';

export const AIStudyView: React.FC<{ 
  onDriveClick?: () => void, 
  driveFile?: { name: string, data?: string, text?: string, mimeType: string } | null,
  initialTab?: 'summary' | 'plan' | 'flashcards' | 'exam' | 'exercises' | 'diagram'
}> = ({ onDriveClick, driveFile, initialTab }) => {
  const { language } = useLanguage();
  const { courses, addActivity } = useCourses();
  const [activeTab, setActiveTab] = useState<'summary' | 'plan' | 'flashcards' | 'exam' | 'exercises' | 'diagram' | 'spreadsheet'>(initialTab || 'summary');
  const [isLimitModalOpen, setIsLimitModalOpen] = useState(false);
  const userId = auth.currentUser?.uid;
  const [topic, setTopic] = useState('');
  const [selectedCourse, setSelectedCourse] = useState(courses[0]?.title || '');
  const [studyLevel, setStudyLevel] = useState<StudyLevel>('Universidad');
  const [loading, setLoading] = useState(false);
  const [summaryResult, setSummaryResult] = useState<string | null>(null);
  const [planResult, setPlanResult] = useState<StudyPlan | null>(null);
  const [flashcardsResult, setFlashcardsResult] = useState<Flashcard[]>([]);
  const [examResult, setExamResult] = useState<ExamQuestion[]>([]);
  const [exercisesResult, setExercisesResult] = useState<string | null>(null);
  const [diagramResult, setDiagramResult] = useState<string | null>(null);
  const [spreadsheetData, setSpreadsheetData] = useState<any[][]>([]);
  const [spreadsheetName, setSpreadsheetName] = useState('');
  const [userAnswers, setUserAnswers] = useState<Record<string, number>>({});
  const [examSubmitted, setExamSubmitted] = useState(false);
  const [examScore, setExamScore] = useState<number | null>(null);
  const [examHistory, setExamHistory] = useState<{ id: string, topic: string, score: number, total: number, date: string }[]>(() => {
    try {
      const saved = localStorage.getItem('examHistory');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('examHistory', JSON.stringify(examHistory));
  }, [examHistory]);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);
  const [selectedFile, setSelectedFile] = useState<{ name: string, data?: string, text?: string, mimeType: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const spreadsheetInputRef = useRef<HTMLInputElement>(null);
  const spreadsheetTableRef = useRef<HTMLDivElement>(null);

  const handleAIError = (error: any) => {
    centralHandleAIError(error);
  };

  useEffect(() => {
    if (driveFile) {
      setSelectedFile(driveFile);
    }
  }, [driveFile]);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const FocusTimer = () => {
    const [timeLeft, setTimeLeft] = useState(25 * 60);
    const [isActive, setIsActive] = useState(false);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
      if (isActive && timeLeft > 0) {
        timerRef.current = setInterval(() => {
          setTimeLeft((prev) => prev - 1);
        }, 1000);
      } else if (timeLeft === 0) {
        setIsActive(false);
        if (timerRef.current) clearInterval(timerRef.current);
      } else {
        if (timerRef.current) clearInterval(timerRef.current);
      }

      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }, [isActive, timeLeft]);

    const toggleTimer = () => setIsActive(!isActive);
    const resetTimer = () => {
      setIsActive(false);
      setTimeLeft(25 * 60);
    };

    const formatTime = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const progress = (timeLeft / (25 * 60)) * 100;

    return (
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-panel p-6 rounded-3xl space-y-4 border-l-4 border-primary"
      >
        <div className="flex flex-wrap items-center justify-center gap-4">
          <div className="flex items-center gap-2 text-primary">
            <Timer className="w-5 h-5" />
            <h3 className="font-bold uppercase text-xs tracking-widest">Temporizador de Enfoque</h3>
          </div>
          <span className="text-xs font-bold text-on-surface-variant bg-surface-container px-2 py-1 rounded-md">
            25 Minutos
          </span>
        </div>

        <div className="flex flex-col items-center py-4 space-y-6">
          <div className="relative w-32 h-32 flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90">
              <circle
                cx="64"
                cy="64"
                r="58"
                stroke="currentColor"
                strokeWidth="8"
                fill="transparent"
                className="text-surface-container-high"
              />
              <circle
                cx="64"
                cy="64"
                r="58"
                stroke="currentColor"
                strokeWidth="8"
                fill="transparent"
                strokeDasharray={364.4}
                strokeDashoffset={364.4 * (1 - progress / 100)}
                className="text-primary transition-all duration-1000"
              />
            </svg>
            <span className="absolute text-2xl font-mono font-bold text-on-surface">
              {formatTime(timeLeft)}
            </span>
          </div>

          <div className="flex gap-4">
            <button
              onClick={toggleTimer}
              className={`flex items-center gap-2 px-6 py-2 rounded-xl font-bold transition-all ${
                isActive 
                  ? 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high' 
                  : 'bg-primary text-on-primary hover:bg-primary/90 shadow-lg shadow-primary/20'
              }`}
            >
              {isActive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              {isActive ? 'Pausar' : 'Iniciar'}
            </button>
            <button
              onClick={resetTimer}
              className="p-2 rounded-xl text-on-surface-variant hover:bg-surface-container transition-all"
              title="Reiniciar"
            >
              <RotateCcw className="w-5 h-5" />
            </button>
          </div>
        </div>
      </motion.div>
    );
  };

  const handleGenerateSummary = async (overrideTopic?: string) => {
    const currentTopic = overrideTopic || topic;
    if (!currentTopic.trim() && !selectedFile) return;
    if (isProcessingFile) {
      toast.info('Espera a que termine de procesarse el archivo...');
      return;
    }
    if (selectedFile && !selectedFile.data && !selectedFile.text) {
      toast.error('Error: No pudimos extraer el texto del archivo. Por favor, asegúrate de que no esté protegido o dañado');
      return;
    }
    if (!userId) {
      toast.error('Debes iniciar sesión');
      return;
    }
    setLoading(true);
    setSummaryResult(null);
    setPlanResult(null);
    setFlashcardsResult([]);
    setFeedback(null);
    toast.info(selectedFile ? 'Analizando tus apuntes...' : 'Generando guía de estudio...');
    try {
      // Verificar créditos antes de proceder
      if (userId) {
        const { credits } = await getUserCredits(userId);
        if (credits <= 0) {
          toast.error(language === 'es' ? 'No tienes créditos suficientes. Espera a mañana o mejora tu plan.' : 'Not enough credits. Wait until tomorrow or upgrade your plan.');
          setLoading(false);
          return;
        }
      }

      const result = await generateSummary(
        userId,
        currentTopic, 
        language, 
        studyLevel,
        selectedFile ? { data: selectedFile.data, text: selectedFile.text, mimeType: selectedFile.mimeType } : undefined
      );
      setSummaryResult(result || '');
      
      // Consumir crédito tras respuesta exitosa
      if (userId) {
        await consumeCredit(userId);
      }
      
      toast.success('¡Listo!');
      addActivity({
        title: 'Resumen Generado',
        description: currentTopic || 'Subir Documento',
        type: 'summary'
      });
    } catch (error: any) {
      handleAIError(error);
    } finally {
      setLoading(false);
    }
  };

  const handleGeneratePlan = async () => {
    if (isProcessingFile) {
      toast.info('Espera a que termine de procesarse el archivo...');
      return;
    }
    if (selectedFile && !selectedFile.data && !selectedFile.text) {
      toast.error('Error: No pudimos extraer el texto del archivo. Por favor, asegúrate de que no esté protegido o dañado');
      return;
    }
    if (!userId) {
      toast.error('Debes iniciar sesión');
      return;
    }
    setLoading(true);
    setSummaryResult(null);
    setPlanResult(null);
    setFlashcardsResult([]);
    setFeedback(null);
    toast.info(selectedFile ? 'Analizando tus apuntes...' : 'Generando guía de estudio...');
    try {
      // Verificar créditos antes de proceder
      if (userId) {
        const { credits } = await getUserCredits(userId);
        if (credits <= 0) {
          toast.error(language === 'es' ? 'No tienes créditos suficientes. Espera a mañana o mejora tu plan.' : 'Not enough credits. Wait until tomorrow or upgrade your plan.');
          setLoading(false);
          return;
        }
      }

      const result = await generateAdaptivePlan(
        userId,
        selectedCourse, 
        45, 
        language,
        studyLevel,
        selectedFile ? { data: selectedFile.data, text: selectedFile.text, mimeType: selectedFile.mimeType } : undefined
      );
      setPlanResult(result);
      
      // Consumir crédito tras respuesta exitosa
      if (userId) {
        await consumeCredit(userId);
      }
      
      toast.success('¡Listo!');
      addActivity({
        title: 'Plan Adaptativo Creado',
        description: selectedCourse,
        type: 'summary'
      });
    } catch (error: any) {
      handleAIError(error);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateFlashcards = async (overrideTopic?: string) => {
    const currentTopic = overrideTopic || topic;
    if (!currentTopic.trim() && !selectedFile) return;
    if (isProcessingFile) {
      toast.info('Espera a que termine de procesarse el archivo...');
      return;
    }
    if (selectedFile && !selectedFile.data && !selectedFile.text) {
      toast.error('Error: No pudimos extraer el texto del archivo. Por favor, asegúrate de que no esté protegido o dañado');
      return;
    }
    if (!userId) {
      toast.error('Debes iniciar sesión');
      return;
    }
    setLoading(true);
    setSummaryResult(null);
    setPlanResult(null);
    setFlashcardsResult([]);
    setCurrentCardIndex(0);
    setIsFlipped(false);
    setFeedback(null);
    toast.info(selectedFile ? 'Analizando tus apuntes...' : 'Generando guía de estudio...');
    try {
      // Verificar créditos antes de proceder
      if (userId) {
        const { credits } = await getUserCredits(userId);
        if (credits <= 0) {
          toast.error(language === 'es' ? 'No tienes créditos suficientes. Espera a mañana o mejora tu plan.' : 'Not enough credits. Wait until tomorrow or upgrade your plan.');
          setLoading(false);
          return;
        }
      }

      const result = await generateFlashcards(
        userId,
        currentTopic, 
        language,
        studyLevel,
        selectedFile ? { data: selectedFile.data, text: selectedFile.text, mimeType: selectedFile.mimeType } : undefined
      );
      setFlashcardsResult(result);
      
      // Consumir crédito tras respuesta exitosa
      if (userId) {
        await consumeCredit(userId);
      }
      
      toast.success('¡Listo!');
      addActivity({
        title: 'Tarjetas Generadas',
        description: currentTopic || 'Subir Documento',
        type: 'flashcards'
      });
    } catch (error: any) {
      handleAIError(error);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateExam = async (overrideTopic?: string) => {
    const currentTopic = overrideTopic || topic;
    if (!currentTopic.trim() && !selectedFile) return;
    if (isProcessingFile) {
      toast.info('Espera a que termine de procesarse el archivo...');
      return;
    }
    if (selectedFile && !selectedFile.data && !selectedFile.text) {
      toast.error('Error: No pudimos extraer el texto del archivo. Por favor, asegúrate de que no esté protegido o dañado');
      return;
    }
    if (!userId) {
      toast.error('Debes iniciar sesión');
      return;
    }
    setLoading(true);
    setSummaryResult(null);
    setPlanResult(null);
    setFlashcardsResult([]);
    setExamResult([]);
    setUserAnswers({});
    setExamSubmitted(false);
    setExamScore(null);
    setFeedback(null);
    toast.info(selectedFile ? 'Analizando tus apuntes...' : 'Generando guía de examen...');
    try {
      // Verificar créditos antes de proceder
      if (userId) {
        const { credits } = await getUserCredits(userId);
        if (credits <= 0) {
          toast.error(language === 'es' ? 'No tienes créditos suficientes. Espera a mañana o mejora tu plan.' : 'Not enough credits. Wait until tomorrow or upgrade your plan.');
          setLoading(false);
          return;
        }
      }

      const result = await generateExam(
        userId,
        currentTopic, 
        language, 
        studyLevel,
        selectedFile ? { data: selectedFile.data, text: selectedFile.text, mimeType: selectedFile.mimeType } : undefined
      );
      
      // Asegurar que cada pregunta tenga un ID único (combinación de timestamp e índice)
      const timestamp = Date.now();
      const examWithIds = result.map((q: any, idx: number) => ({
        ...q,
        id: `q_${timestamp}_${idx}`
      }));
      
      setExamResult(examWithIds);
      
      // Consumir crédito tras respuesta exitosa
      if (userId) {
        await consumeCredit(userId);
      }
      
      toast.success('¡Listo!');
      addActivity({
        title: 'Examen Generado',
        description: currentTopic || 'Subir Documento',
        type: 'summary'
      });
    } catch (error: any) {
      handleAIError(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitExam = () => {
    if (Object.keys(userAnswers).length < examResult.length) {
      toast.error('Por favor responde todas las preguntas');
      return;
    }

    let correctCount = 0;
    examResult.forEach(q => {
      if (userAnswers[q.id] === q.correctAnswer) {
        correctCount++;
      }
    });

    setExamScore(correctCount);
    setExamSubmitted(true);
    
    const newResult = {
      id: Date.now().toString(),
      topic: topic || selectedCourse,
      score: correctCount,
      total: examResult.length,
      date: new Date().toLocaleString()
    };
    setExamHistory(prev => [newResult, ...prev]);
    
    if (correctCount / examResult.length >= 0.7) {
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#434ca5', '#818cf8', '#c7d2fe']
      });
    }

    toast.success(`Examen completado: ${correctCount}/${examResult.length}`);
  };

  const handleGenerateExercises = async (overrideTopic?: string) => {
    const currentTopic = overrideTopic || topic;
    if (!currentTopic.trim() && !selectedFile) return;
    if (isProcessingFile) {
      toast.info('Espera a que termine de procesarse el archivo...');
      return;
    }
    if (selectedFile && !selectedFile.data && !selectedFile.text) {
      toast.error('Error: No pudimos extraer el texto del archivo. Por favor, asegúrate de que no esté protegido o dañado');
      return;
    }
    if (!userId) {
      toast.error('Debes iniciar sesión');
      return;
    }
    setLoading(true);
    setExercisesResult(null);
    toast.info(selectedFile ? 'Analizando tus apuntes...' : 'Generando guía de estudio...');
    try {
      // Verificar créditos antes de proceder
      if (userId) {
        const { credits } = await getUserCredits(userId);
        if (credits <= 0) {
          toast.error(language === 'es' ? 'No tienes créditos suficientes. Espera a mañana o mejora tu plan.' : 'Not enough credits. Wait until tomorrow or upgrade your plan.');
          setLoading(false);
          return;
        }
      }

      const result = await generateExercises(
        userId,
        currentTopic,
        language,
        studyLevel,
        selectedFile ? { data: selectedFile.data, text: selectedFile.text, mimeType: selectedFile.mimeType } : undefined
      );
      setExercisesResult(result || '');
      
      // Consumir crédito tras respuesta exitosa
      if (userId) {
        await consumeCredit(userId);
      }
      
      toast.success('¡Listo!');
      addActivity({
        title: 'Ejercicios Generados',
        description: currentTopic || 'Subir Documento',
        type: 'summary'
      });
    } catch (error: any) {
      handleAIError(error);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateDiagram = async (overrideTopic?: string) => {
    const currentTopic = overrideTopic || topic;
    if (!currentTopic.trim() && !selectedFile) return;
    if (isProcessingFile) {
      toast.info('Espera a que termine de procesarse el archivo...');
      return;
    }
    if (selectedFile && !selectedFile.data && !selectedFile.text) {
      toast.error('Error: No pudimos extraer el texto del archivo. Por favor, asegúrate de que no esté protegido o dañado');
      return;
    }
    if (!userId) {
      toast.error('Debes iniciar sesión');
      return;
    }
    setLoading(true);
    setDiagramResult(null);
    toast.info(selectedFile ? 'Analizando tus apuntes...' : 'Generando guía de estudio...');
    try {
      // Verificar créditos antes de proceder
      if (userId) {
        const { credits } = await getUserCredits(userId);
        if (credits <= 0) {
          toast.error(language === 'es' ? 'No tienes créditos suficientes. Espera a mañana o mejora tu plan.' : 'Not enough credits. Wait until tomorrow or upgrade your plan.');
          setLoading(false);
          return;
        }
      }

      const result = await generateDiagram(
        userId,
        currentTopic,
        language,
        studyLevel,
        selectedFile ? { data: selectedFile.data, text: selectedFile.text, mimeType: selectedFile.mimeType } : undefined
      );
      setDiagramResult(result || '');
      
      // Consumir crédito tras respuesta exitosa
      if (userId) {
        await consumeCredit(userId);
      }
      
      toast.success('¡Listo!');
      addActivity({
        title: 'Esquema Generado',
        description: currentTopic || 'Subir Documento',
        type: 'map'
      });
    } catch (error: any) {
      handleAIError(error);
    } finally {
      setLoading(false);
    }
  };

  const handleResetExam = () => {
    setUserAnswers({});
    setExamSubmitted(false);
    setExamScore(null);
  };

  const handleGenerateExampleSummary = () => {
    const exampleTopic = 'La Revolución Industrial';
    setTopic(exampleTopic);
    handleGenerateSummary(exampleTopic);
  };

  const handleGenerateExamplePlan = () => {
    // Just use the first course as example
    if (courses.length > 0) {
      setSelectedCourse(courses[0].title);
      handleGeneratePlan();
    }
  };

  const handleGenerateExampleExercises = () => {
    const exampleTopic = 'Cálculo Diferencial';
    setTopic(exampleTopic);
    handleGenerateExercises(exampleTopic);
  };

  const handleGenerateExampleDiagram = () => {
    const exampleTopic = 'Ciclo del Agua';
    setTopic(exampleTopic);
    handleGenerateDiagram(exampleTopic);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement> | React.DragEvent) => {
    let file: File | undefined;
    
    if ('files' in e.target && e.target.files) {
      file = e.target.files[0];
    } else if ('dataTransfer' in e && e.dataTransfer.files) {
      file = e.dataTransfer.files[0];
    }

    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error('File too large (max 10MB)');
      return;
    }

    setIsProcessingFile(true);
    const isDocx = file.name.endsWith('.docx');
    const isDoc = file.name.endsWith('.doc');

    try {
      if (isDocx) {
        const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as ArrayBuffer);
          reader.onerror = reject;
          reader.readAsArrayBuffer(file!);
        });

        // Extraemos el texto de forma limpia ignorando imágenes para DOCX
        const result = await mammoth.extractRawText({ arrayBuffer });
        if (!result.value || result.value.trim().length === 0) {
          throw new Error('EMPTY_CONTENT');
        }

        setSelectedFile({
          name: file.name,
          text: result.value,
          mimeType: 'text/plain'
        });
        toast.success('Documento Word procesado correctamente');
      } else if (isDoc) {
        toast.error('.doc files are not supported yet, please use .docx or .pdf');
      } else {
        // Para PDF y otros, enviamos el binario (base64) directamente (Modo Multimodal)
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file!);
        });

        if (!base64 || base64.length === 0) {
          throw new Error('EMPTY_CONTENT');
        }

        const mimeType = file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'text/plain');
        
        setSelectedFile({
          name: file.name,
          data: base64,
          mimeType: mimeType
        });
        toast.success('Documento cargado en modo Multimodal');
      }
    } catch (err: any) {
      console.error('Error processing file:', err);
      if (err.message === 'EMPTY_CONTENT') {
        toast.error('Error: No pudimos extraer el texto del archivo. Por favor, asegúrate de que no esté protegido o dañado');
      } else {
        toast.error('Error processing document');
      }
      setSelectedFile(null);
    } finally {
      setIsProcessingFile(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileChange(e);
  };

  const removeFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleGenerateExampleFlashcards = () => {
    const exampleTopic = 'Mitosis y Meiosis';
    setTopic(exampleTopic);
    handleGenerateFlashcards(exampleTopic);
  };

  const handleNextCard = () => {
    if (currentCardIndex < flashcardsResult.length - 1) {
      setCurrentCardIndex(prev => prev + 1);
      setIsFlipped(false);
    }
  };

  const handlePrevCard = () => {
    if (currentCardIndex > 0) {
      setCurrentCardIndex(prev => prev - 1);
      setIsFlipped(false);
    }
  };

  const exportSummaryToPDF = () => {
    if (!summaryResult) return;
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text(`Resumen - ${topic || selectedCourse}`, 14, 22);
    doc.setFontSize(12);
    const splitText = doc.splitTextToSize(summaryResult, 180);
    doc.text(splitText, 14, 35);
    doc.save(`summary-${topic.replace(/\s+/g, '-').toLowerCase() || 'study'}.pdf`);
    toast.success('Summary exported successfully');
  };

  const exportPlanToPDF = () => {
    if (!planResult) return;
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text(`Plan - ${topic || selectedCourse}`, 14, 22);
    
    let yPos = 35;
    if (planResult.weakPoints) {
      doc.setFontSize(14);
      doc.text('Puntos Débiles', 14, yPos);
      yPos += 10;
      doc.setFontSize(12);
      planResult.weakPoints.forEach((point: string) => {
        doc.text(`• ${point}`, 20, yPos);
        yPos += 7;
      });
      yPos += 5;
    }

    if (planResult.recommendations) {
      doc.setFontSize(14);
      doc.text('Recomendaciones', 14, yPos);
      yPos += 10;
      doc.setFontSize(12);
      planResult.recommendations.forEach((rec: string) => {
        const splitRec = doc.splitTextToSize(`• ${rec}`, 170);
        doc.text(splitRec, 20, yPos);
        yPos += (splitRec.length * 7);
      });
    }

    doc.save(`plan-${topic.replace(/\s+/g, '-').toLowerCase() || 'study'}.pdf`);
    toast.success('Plan exported successfully');
  };

  const exportExercisesToPDF = () => {
    if (exercisesResult.length === 0) return;
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text(`Ejercicios - ${topic || selectedCourse}`, 14, 22);
    
    let yPos = 35;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    const splitText = doc.splitTextToSize(exercisesResult, 180);
    doc.text(splitText, 14, yPos);
    
    doc.save(`exercises-${topic.replace(/\s+/g, '-').toLowerCase() || 'study'}.pdf`);
    toast.success('Exercises exported successfully');
  };

  const exportDiagramToPDF = () => {
    if (!diagramResult) return;
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text(`Diagramas - ${topic || selectedCourse}`, 14, 22);
    doc.setFontSize(12);
    const splitText = doc.splitTextToSize(diagramResult, 180);
    doc.text(splitText, 14, 35);
    doc.save(`diagram-${topic.replace(/\s+/g, '-').toLowerCase() || 'study'}.pdf`);
    toast.success('Diagram exported successfully');
  };

  const handleSpreadsheetUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSpreadsheetName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
      setSpreadsheetData(data);
      toast.success('Spreadsheet loaded successfully');
    };
    reader.readAsBinaryString(file);
  };

  const exportSpreadsheetToImage = async () => {
    if (!spreadsheetTableRef.current) return;
    
    try {
      const canvas = await html2canvas(spreadsheetTableRef.current, {
        backgroundColor: '#ffffff',
        scale: 2
      });
      const image = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = image;
      link.download = `spreadsheet-${spreadsheetName.split('.')[0]}.png`;
      link.click();
      toast.success('Spreadsheet exported as image');
    } catch (error) {
      console.error('Error exporting spreadsheet:', error);
      toast.error('Error exporting spreadsheet as image');
    }
  };

  const exportFlashcardsToPDF = () => {
    if (flashcardsResult.length === 0) return;

    const doc = new jsPDF();
    const title = `Tarjetas - ${topic || selectedCourse}`;
    
    doc.setFontSize(20);
    doc.text(title, 14, 22);
    
    const tableData = flashcardsResult.map((card, index) => [
      index + 1,
      card.front,
      card.back
    ]);

    autoTable(doc, {
      startY: 30,
      head: [['#', 'Front', 'Back']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [67, 76, 165] }, // Primary color
      styles: { cellPadding: 5, fontSize: 10, overflow: 'linebreak' },
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 85 },
        2: { cellWidth: 85 }
      }
    });

    doc.save(`flashcards-${topic.replace(/\s+/g, '-').toLowerCase() || 'study'}.pdf`);
    toast.success('PDF exported successfully');
  };
  
  const exportExamToPDF = () => {
    if (examResult.length === 0) return;
    
    const doc = new jsPDF();
    const title = `Examen de Práctica - ${topic || selectedCourse}`;
    
    doc.setFontSize(20);
    doc.text(title, 14, 22);
    
    let yPos = 35;
    examResult.forEach((q, i) => {
      if (yPos > 270) {
        doc.addPage();
        yPos = 20;
      }
      
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      const questionLines = doc.splitTextToSize(`${i + 1}. ${q.question}`, 180);
      doc.text(questionLines, 14, yPos);
      yPos += (questionLines.length * 7);
      
      doc.setFont('helvetica', 'normal');
      q.options.forEach((opt, optIdx) => {
        const optLabel = `${String.fromCharCode(65 + optIdx)}) ${opt}`;
        doc.text(optLabel, 20, yPos);
        yPos += 7;
      });
      
      if (examSubmitted) {
        doc.setFontSize(10);
        doc.setTextColor(100);
        const explanationLines = doc.splitTextToSize(`Explicación: ${q.explanation}`, 170);
        doc.text(explanationLines, 20, yPos);
        yPos += (explanationLines.length * 5) + 5;
        doc.setTextColor(0);
      } else {
        yPos += 5;
      }
    });
    
    doc.save(`exam-${topic.replace(/\s+/g, '-').toLowerCase() || 'study'}.pdf`);
    toast.success('PDF exported successfully');
  };

  const FeedbackButtons = () => (
    <div className="flex flex-wrap items-center justify-center gap-4 mt-8 pt-6 border-t border-outline-variant/30">
      <AnimatePresence mode="wait">
        {feedback ? (
          <motion.div
            key="thanks"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 text-primary"
          >
            <CheckCircle2 className="w-4 h-4" />
            <p className="text-xs font-bold uppercase tracking-widest">
              ¡Gracias por tu feedback!
            </p>
          </motion.div>
        ) : (
          <motion.div
            key="ask"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-4"
          >
            <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">
              '¿Es útil?'
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setFeedback('up');
                  toast.success('¡Gracias por tu feedback!');
                }}
                className="p-2 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-all"
              >
                <ThumbsUp className="w-5 h-5" />
              </button>
              <button
                onClick={() => {
                  setFeedback('down');
                  toast.success('¡Gracias por tu feedback!');
                }}
                className="p-2 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-all"
              >
                <ThumbsDown className="w-5 h-5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  return (
    <div className="responsive-container space-y-8 pb-20">
      <UsageLimitModal isOpen={isLimitModalOpen} onClose={() => setIsLimitModalOpen(false)} />
      <header className="text-center">
        <h1 className="text-2xl md:text-3xl font-bold text-on-surface tracking-tight flex flex-wrap items-center justify-center gap-3">
          <Sparkles className="w-6 h-6 md:w-8 md:h-8 text-primary" />
          Estudio con IA
        </h1>
        <p className="text-xs md:text-sm text-on-surface-variant mt-2 max-w-2xl mx-auto">
          Potencia tu aprendizaje con herramientas inteligentes.
        </p>
      </header>

      <div className="flex-wrap-center gap-2 p-1 bg-surface-container-low/50 rounded-2xl w-full">
        <button
          onClick={() => setActiveTab('summary')}
          className={`px-4 md:px-6 py-2 md:py-2.5 rounded-xl text-xs md:text-sm font-medium transition-all flex items-center gap-2 ${
            activeTab === 'summary' 
              ? 'bg-card text-primary shadow-sm' 
              : 'text-on-surface-variant hover:bg-card/50'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span className="hidden sm:inline">Resumen Personalizado</span>
          <span className="sm:hidden">Resumen</span>
        </button>
        <button
          onClick={() => setActiveTab('plan')}
          className={`px-4 md:px-6 py-2 md:py-2.5 rounded-xl text-xs md:text-sm font-medium transition-all flex items-center gap-2 ${
            activeTab === 'plan' 
              ? 'bg-card text-primary shadow-sm' 
              : 'text-on-surface-variant hover:bg-card/50'
          }`}
        >
          <Target className="w-4 h-4" />
          <span className="hidden sm:inline">Plan Adaptativo</span>
          <span className="sm:hidden">Plan</span>
        </button>
        <button
          onClick={() => setActiveTab('flashcards')}
          className={`px-4 md:px-6 py-2 md:py-2.5 rounded-xl text-xs md:text-sm font-medium transition-all flex items-center gap-2 ${
            activeTab === 'flashcards' 
              ? 'bg-card text-primary shadow-sm' 
              : 'text-on-surface-variant hover:bg-card/50'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span className="hidden sm:inline">Tarjetas</span>
          <span className="sm:hidden">Tarjetas</span>
        </button>
        <button
          onClick={() => setActiveTab('exam')}
          className={`px-4 md:px-6 py-2 md:py-2.5 rounded-xl text-xs md:text-sm font-medium transition-all flex items-center gap-2 ${
            activeTab === 'exam' 
              ? 'bg-card text-primary shadow-sm' 
              : 'text-on-surface-variant hover:bg-card/50'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span className="hidden sm:inline">Examen</span>
          <span className="sm:hidden">Examen</span>
        </button>
        <button
          onClick={() => setActiveTab('exercises')}
          className={`px-4 md:px-6 py-2 md:py-2.5 rounded-xl text-xs md:text-sm font-medium transition-all flex items-center gap-2 ${
            activeTab === 'exercises' 
              ? 'bg-card text-primary shadow-sm' 
              : 'text-on-surface-variant hover:bg-card/50'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span className="hidden sm:inline">Ejercicios</span>
          <span className="sm:hidden">Ejercicios</span>
        </button>
        <button
          onClick={() => setActiveTab('diagram')}
          className={`px-4 md:px-6 py-2 md:py-2.5 rounded-xl text-xs md:text-sm font-medium transition-all flex items-center gap-2 ${
            activeTab === 'diagram' 
              ? 'bg-card text-primary shadow-sm' 
              : 'text-on-surface-variant hover:bg-card/50'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span className="hidden sm:inline">Esquemas</span>
          <span className="sm:hidden">Esquemas</span>
        </button>
        <button
          onClick={() => setActiveTab('spreadsheet')}
          className={`px-4 md:px-6 py-2 md:py-2.5 rounded-xl text-xs md:text-sm font-medium transition-all flex items-center gap-2 ${
            activeTab === 'spreadsheet' 
              ? 'bg-card text-primary shadow-sm' 
              : 'text-on-surface-variant hover:bg-card/50'
          }`}
        >
          <TableIcon className="w-4 h-4" />
          <span className="hidden sm:inline">Excel a Imagen</span>
          <span className="sm:hidden">Excel</span>
        </button>
      </div>

      <main className="grid grid-cols-1 lg:grid-cols-12 gap-8 w-full">
        <div className="lg:col-span-4 space-y-6 flex flex-col items-center w-full">
          <div className="responsive-card glass-panel p-4 md:p-6 rounded-3xl space-y-6">
            <div className="space-y-2">
                <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Nivel de Estudio</label>
                <select 
                  value={studyLevel}
                  onChange={(e) => setStudyLevel(e.target.value as StudyLevel)}
                  className="w-full bg-surface-container border border-outline-variant rounded-2xl px-5 py-4 text-on-surface focus:border-primary/50 outline-none transition-all font-bold appearance-none cursor-pointer"
                >
                  <option value="Inicial">Inicial</option>
                  <option value="Secundario">Secundario</option>
                  <option value="Universidad">Universidad</option>
                  <option value="Master">Master</option>
                </select>
              </div>

              <div className="space-y-3 w-full flex flex-col items-center">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".pdf,.doc,.docx,.xls,.xlsx,image/*"
                  className="hidden"
                />
              
              {!selectedFile ? (
                <div className="space-y-3 w-full flex flex-col items-center">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`w-full max-w-[350px] py-6 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-2 transition-all group ${
                      isDragging 
                        ? 'border-primary bg-primary/10 scale-[1.02]' 
                        : 'border-outline-variant hover:border-primary/50 hover:bg-primary/5'
                    }`}
                  >
                    <Upload className={`w-8 h-8 transition-colors ${isDragging ? 'text-primary' : 'text-on-surface-variant group-hover:text-primary'}`} />
                    <div className="text-center">
                      <span className="block text-xs font-bold uppercase tracking-wider text-on-surface">Subir Documento / Programa de Estudio</span>
                      <span className="text-[10px] text-on-surface-variant uppercase tracking-tighter opacity-60">PDF, TXT, DOCX (Max 10MB)</span>
                    </div>
                  </button>
                  
                  <button
                    onClick={onDriveClick}
                    className="w-full max-w-[350px] py-4 bg-surface-container-low border border-outline-variant/30 rounded-2xl flex items-center justify-center gap-3 hover:bg-surface-container-high transition-all group"
                  >
                    <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
                    <span className="text-sm font-bold text-on-surface">Google Drive</span>
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3 p-3 bg-primary/5 border border-primary/20 rounded-2xl">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-on-surface truncate">
                      {selectedFile.name}
                    </p>
                    <p className="text-[10px] text-primary font-medium uppercase tracking-tighter">
                      Archivo seleccionado
                    </p>
                  </div>
                  <button
                    onClick={removeFile}
                    className="p-2 hover:bg-primary/10 rounded-lg text-on-surface-variant hover:text-primary transition-all"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            <div className="h-px bg-outline-variant/20 w-full" />

            {activeTab === 'summary' ? (
              <div className="space-y-4">
                <label className="text-sm font-bold text-on-surface-variant uppercase tracking-wider">
                  Resumen Personalizado
                </label>
                <textarea
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="Escribe el tema o pega el texto aquí..."
                  className="w-full h-32 bg-surface p-4 rounded-2xl border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all resize-none text-on-surface"
                />

                <button
                  onClick={() => handleGenerateSummary()}
                  disabled={loading || (!topic.trim() && !selectedFile)}
                  className="w-full py-4 bg-primary text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-primary/20"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                  Generar Resumen
                </button>
                <button
                  onClick={handleGenerateExampleSummary}
                  disabled={loading}
                  className="w-full py-3 bg-surface-variant text-on-surface-variant rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-surface-variant/80 transition-all border border-outline-variant/30"
                >
                  <RefreshCw className="w-4 h-4" />
                  Generar Ejemplo
                </button>
              </div>
            ) : activeTab === 'plan' ? (
              <div className="space-y-4">
                <label className="text-sm font-bold text-on-surface-variant uppercase tracking-wider">
                  Plan Adaptativo
                </label>
                <select
                  value={selectedCourse}
                  onChange={(e) => setSelectedCourse(e.target.value)}
                  className="w-full bg-surface p-4 rounded-2xl border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-on-surface"
                >
                  {courses.map(course => (
                    <option key={course.id} value={course.title}>{course.title}</option>
                  ))}
                </select>
                <div className="p-4 bg-surface rounded-2xl border border-outline-variant space-y-2">
                  <p className="text-sm text-on-surface-variant">
                    Basado en tu progreso en ${selectedCourse}
                  </p>
                  <div className="h-2 bg-surface-variant rounded-full overflow-hidden">
                    <div className="h-full bg-primary w-[45%] rounded-full" />
                  </div>
                  <p className="text-xs font-bold text-primary text-right">45%</p>
                </div>
                <button
                  onClick={handleGeneratePlan}
                  disabled={loading}
                  className="w-full py-4 bg-primary text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-primary/20"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Target className="w-5 h-5" />}
                  Generar Plan
                </button>
                <button
                  onClick={handleGenerateExamplePlan}
                  disabled={loading}
                  className="w-full py-3 bg-surface-variant text-on-surface-variant rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-surface-variant/80 transition-all border border-outline-variant/30"
                >
                  <RefreshCw className="w-4 h-4" />
                  Generar Ejemplo
                </button>
              </div>
            ) : activeTab === 'flashcards' ? (
              <div className="space-y-4">
                <label className="text-sm font-bold text-on-surface-variant uppercase tracking-wider">
                  Tarjetas de Estudio
                </label>
                <textarea
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="Escribe el tema o pega el texto aquí..."
                  className="w-full h-32 bg-surface p-4 rounded-2xl border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all resize-none text-on-surface"
                />
                <button
                  onClick={() => handleGenerateFlashcards()}
                  disabled={loading || (!topic.trim() && !selectedFile)}
                  className="w-full py-4 bg-primary text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-primary/20"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Layers className="w-5 h-5" />}
                  Generar Tarjetas
                </button>
                <button
                  onClick={handleGenerateExampleFlashcards}
                  disabled={loading}
                  className="w-full py-3 bg-surface-variant text-on-surface-variant rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-surface-variant/80 transition-all border border-outline-variant/30"
                >
                  <RefreshCw className="w-4 h-4" />
                  Generar Ejemplo
                </button>
              </div>
            ) : activeTab === 'exam' ? (
              <div className="space-y-4">
                <label className="text-sm font-bold text-on-surface-variant uppercase tracking-wider">
                  Tema del Examen
                </label>
                <textarea
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="Escribe el tema o pega el texto aquí..."
                  className="w-full h-32 bg-surface p-4 rounded-2xl border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all resize-none text-on-surface"
                />
                <button
                  onClick={() => handleGenerateExam()}
                  disabled={loading || (!topic.trim() && !selectedFile)}
                  className="w-full py-4 bg-primary text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-primary/20"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                  Generar Examen
                </button>
                <button
                  onClick={() => {
                    const exampleTopic = language === 'es' ? 'Anatomía Humana' : 'Human Anatomy';
                    setTopic(exampleTopic);
                    handleGenerateExam(exampleTopic);
                  }}
                  disabled={loading}
                  className="w-full py-3 bg-surface-variant text-on-surface-variant rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-surface-variant/80 transition-all border border-outline-variant/30"
                >
                  <RefreshCw className="w-4 h-4" />
                  Generar Ejemplo
                </button>
                
                {examHistory.length > 0 && (
                  <div className="pt-4 space-y-3">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant opacity-60">Historial Reciente</h4>
                    <div className="space-y-2">
                      {examHistory.slice(0, 3).map(item => (
                        <div key={item.id} className="p-3 bg-surface rounded-xl border border-outline-variant/30 flex items-center justify-between">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-on-surface truncate">{item.topic}</p>
                            <p className="text-[10px] text-on-surface-variant">{item.date}</p>
                          </div>
                          <div className={cn(
                            "ml-3 px-2 py-1 rounded-lg text-[10px] font-bold",
                            item.score / item.total >= 0.6 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                          )}>
                            {item.score}/{item.total}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : activeTab === 'exercises' ? (
              <div className="space-y-4">
                <label className="text-sm font-bold text-on-surface-variant uppercase tracking-wider">
                  Ejercicios
                </label>
                <textarea
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="Escribe el tema o pega el texto aquí..."
                  className="w-full h-32 bg-surface p-4 rounded-2xl border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all resize-none text-on-surface"
                />
                <button
                  onClick={() => handleGenerateExercises()}
                  disabled={loading || (!topic.trim() && !selectedFile)}
                  className="w-full py-4 bg-primary text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-primary/20"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                  Generar Ejercicios
                </button>
                <button
                  onClick={handleGenerateExampleExercises}
                  disabled={loading}
                  className="w-full py-3 bg-surface-variant text-on-surface-variant rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-surface-variant/80 transition-all border border-outline-variant/30"
                >
                  <RefreshCw className="w-4 h-4" />
                  Generar Ejemplo
                </button>
              </div>
            ) : activeTab === 'diagram' ? (
              <div className="space-y-4">
                <label className="text-sm font-bold text-on-surface-variant uppercase tracking-wider">
                  Esquemas
                </label>
                <textarea
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="Escribe el tema o pega el texto aquí..."
                  className="w-full h-32 bg-surface p-4 rounded-2xl border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all resize-none text-on-surface"
                />
                <button
                  onClick={() => handleGenerateDiagram()}
                  disabled={loading || (!topic.trim() && !selectedFile)}
                  className="w-full py-4 bg-primary text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-primary/20"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Layers className="w-5 h-5" />}
                  Generar Esquema
                </button>
                <button
                  onClick={handleGenerateExampleDiagram}
                  disabled={loading}
                  className="w-full py-3 bg-surface-variant text-on-surface-variant rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-surface-variant/80 transition-all border border-outline-variant/30"
                >
                  <RefreshCw className="w-4 h-4" />
                  Generar Ejemplo
                </button>
              </div>
            ) : activeTab === 'spreadsheet' ? (
              <div className="space-y-4">
                <label className="text-sm font-bold text-on-surface-variant uppercase tracking-wider">
                  Excel a Imagen
                </label>
                <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-outline-variant/30 rounded-2xl bg-surface/50 gap-4">
                  <input
                    type="file"
                    ref={spreadsheetInputRef}
                    onChange={handleSpreadsheetUpload}
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                  />
                  <TableIcon className="w-10 h-10 text-primary opacity-50" />
                  <p className="text-xs text-center text-on-surface-variant">
                    Sube tu archivo Excel para previsualizarlo y descargarlo como imagen.
                  </p>
                  <button
                    onClick={() => spreadsheetInputRef.current?.click()}
                    className="w-full py-3 bg-primary text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-primary/90 transition-all"
                  >
                    <Upload className="w-4 h-4" />
                    Cargar Excel
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <AnimatePresence>
            {(summaryResult || planResult) && <FocusTimer />}
            {planResult && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                <div className="glass-panel p-6 rounded-3xl border-l-4 border-red-400">
                  <div className="flex items-center gap-2 text-red-500 mb-4">
                    <AlertCircle className="w-5 h-5" />
                    <h3 className="font-bold uppercase text-xs tracking-widest">Puntos Débiles</h3>
                  </div>
                  <ul className="space-y-3">
                    {planResult.weakPoints.map((point, i) => (
                      <li key={`weak-${i}-${point.substring(0, 10)}`} className="flex items-start gap-2 text-sm text-on-surface">
                        <ChevronRight className="w-4 h-4 mt-0.5 text-red-400 flex-shrink-0" />
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="glass-panel p-6 rounded-3xl border-l-4 border-green-400">
                  <div className="flex items-center gap-2 text-green-600 mb-4">
                    <CheckCircle2 className="w-5 h-5" />
                    <h3 className="font-bold uppercase text-xs tracking-widest">Recomendaciones</h3>
                  </div>
                  <ul className="space-y-3">
                    {planResult.recommendations.map((rec, i) => (
                      <li key={`rec-${i}-${rec.substring(0, 10)}`} className="flex items-start gap-2 text-sm text-on-surface">
                        <ChevronRight className="w-4 h-4 mt-0.5 text-green-400 flex-shrink-0" />
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="lg:col-span-8 flex flex-col items-center w-full">
          <AnimatePresence mode="wait">
            {loading ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full min-h-[300px] md:min-h-[400px] flex flex-col items-center justify-center text-on-surface-variant gap-4"
              >
                <Loader2 className="w-10 h-10 md:w-12 md:h-12 animate-spin text-primary" />
                <p className="text-sm font-medium animate-pulse">Generando contenido con IA...</p>
              </motion.div>
            ) : activeTab === 'summary' && summaryResult ? (
              <motion.div
                key="summary"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="responsive-card glass-panel p-6 md:p-10 rounded-[2rem] prose prose-slate max-w-none"
              >
                <div className="flex flex-wrap items-center justify-center gap-4 mb-6">
                  <h2 className="text-xl md:text-2xl font-bold text-on-surface flex items-center gap-2">
                    <BookOpen className="w-5 h-5 md:w-6 md:h-6 text-primary" />
                    Resumen Generado
                  </h2>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={exportSummaryToPDF}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-primary/10 text-on-surface-variant hover:text-primary transition-all text-[10px] md:text-xs font-bold uppercase tracking-widest"
                    >
                      <Download className="w-4 h-4" />
                      PDF
                    </button>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(summaryResult);
                        setIsCopied(true);
                        toast.success('Summary copied to clipboard');
                        setTimeout(() => setIsCopied(false), 2000);
                      }}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-primary/10 text-on-surface-variant hover:text-primary transition-all text-[10px] md:text-xs font-bold uppercase tracking-widest"
                    >
                      {isCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      {isCopied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
                <div key={`summary-result-${topic.substring(0, 10)}`} className="markdown-body text-sm md:text-base text-on-surface leading-relaxed">
                  <ReactMarkdown>{summaryResult}</ReactMarkdown>
                </div>
                <FeedbackButtons />
              </motion.div>
            ) : activeTab === 'exercises' && exercisesResult ? (
              <motion.div
                key="exercises"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="responsive-card glass-panel p-6 md:p-10 rounded-[2rem] prose prose-slate max-w-none"
              >
                <div className="flex flex-wrap items-center justify-center gap-4 mb-6">
                  <h2 className="text-xl md:text-2xl font-bold text-on-surface flex items-center gap-2">
                    <Activity className="w-5 h-5 md:w-6 md:h-6 text-primary" />
                    Ejercicios
                  </h2>
                  <button
                    onClick={() => {
                      const doc = new jsPDF();
                      doc.text('Ejercicios', 14, 20);
                      const splitText = doc.splitTextToSize(exercisesResult, 180);
                      doc.text(splitText, 14, 30);
                      doc.save('ejercicios-ia.pdf');
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-primary/10 text-on-surface-variant hover:text-primary transition-all text-[10px] md:text-xs font-bold uppercase tracking-widest"
                  >
                    <Download className="w-4 h-4" />
                    PDF
                  </button>
                </div>
                <div key={`exercises-result-${topic.substring(0, 10)}`} className="markdown-body text-sm md:text-base text-on-surface leading-relaxed">
                  <ReactMarkdown>{exercisesResult}</ReactMarkdown>
                </div>
                <FeedbackButtons />
              </motion.div>
            ) : activeTab === 'diagram' && diagramResult ? (
              <motion.div
                key="diagram"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="responsive-card glass-panel p-6 md:p-10 rounded-[2rem] prose prose-slate max-w-none"
              >
                <div className="flex flex-wrap items-center justify-center gap-4 mb-6">
                  <h2 className="text-xl md:text-2xl font-bold text-on-surface flex items-center gap-2">
                    <Layers className="w-5 h-5 md:w-6 md:h-6 text-primary" />
                    Esquemas
                  </h2>
                  <button
                    onClick={exportDiagramToPDF}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-primary/10 text-on-surface-variant hover:text-primary transition-all text-[10px] md:text-xs font-bold uppercase tracking-widest"
                  >
                    <Download className="w-4 h-4" />
                    PDF
                  </button>
                </div>
                <div className="markdown-body text-sm md:text-base text-on-surface leading-relaxed">
                  <ReactMarkdown>{diagramResult}</ReactMarkdown>
                </div>
                <FeedbackButtons />
              </motion.div>
            ) : activeTab === 'spreadsheet' && spreadsheetData.length > 0 ? (
              <motion.div
                key="spreadsheet-result"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="responsive-card glass-panel p-6 md:p-10 rounded-[2rem] w-full"
              >
                <div className="flex flex-wrap items-center justify-center gap-4 mb-6">
                  <h2 className="text-xl md:text-2xl font-bold text-on-surface flex items-center gap-2">
                    <TableIcon className="w-5 h-5 md:w-6 md:h-6 text-primary" />
                    Vista Previa Excel
                  </h2>
                  <button
                    onClick={exportSpreadsheetToImage}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-primary/10 text-on-surface-variant hover:text-primary transition-all text-[10px] md:text-xs font-bold uppercase tracking-widest"
                  >
                    <Download className="w-4 h-4" />
                    Imagen
                  </button>
                </div>
                <div className="overflow-x-auto rounded-xl border border-outline-variant/30 bg-white shadow-inner">
                  <div ref={spreadsheetTableRef} className="p-6 min-w-max">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr>
                          {spreadsheetData[0].map((cell, i) => (
                            <th key={i} className="border border-gray-200 bg-gray-50 px-4 py-2 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                              {cell}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {spreadsheetData.slice(1).map((row, i) => (
                          <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                            {row.map((cell, j) => (
                              <td key={j} className="border border-gray-100 px-4 py-2 text-sm text-gray-700">
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <FeedbackButtons />
              </motion.div>
            ) : activeTab === 'plan' && planResult ? (
              <motion.div
                key="plan"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-6 w-full flex flex-col items-center"
              >
                <div className="responsive-card glass-panel p-6 md:p-10 rounded-[2rem]">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                      <h2 className="text-xl md:text-2xl font-bold text-on-surface flex items-center gap-2">
                        <Target className="w-5 h-5 md:w-6 md:h-6 text-primary" />
                        {planResult.title}
                      </h2>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={exportPlanToPDF}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-primary/10 text-on-surface-variant hover:text-primary transition-all text-[10px] md:text-xs font-bold uppercase tracking-widest"
                        >
                          <Download className="w-4 h-4" />
                          PDF
                        </button>
                        <div className="flex items-center gap-3 bg-primary/10 text-primary px-4 md:px-5 py-2 md:py-3 rounded-2xl border border-primary/20 shadow-sm">
                          <div className="p-2 bg-primary/20 rounded-lg">
                            <Timer className="w-4 h-4 md:w-5 md:h-5" />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[8px] md:text-[10px] font-bold uppercase tracking-widest opacity-70">Tiempo Estimado</span>
                            <span className="text-base md:text-lg font-black leading-none">
                              {planResult.estimatedTotalHours} HORAS
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  <p className="text-xs md:text-sm text-on-surface-variant mb-8">{planResult.description}</p>
                  
                  <div className="space-y-4">
                    {planResult.steps.map((step, i) => (
                      <div key={`step-${i}-${step.title}`} className="flex flex-col sm:flex-row gap-4 md:gap-6 p-4 md:p-6 bg-surface/50 rounded-2xl border border-outline-variant hover:border-primary/30 transition-all group">
                        <div className="flex-shrink-0 w-10 h-10 md:w-12 md:h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-base md:text-lg">
                          {i + 1}
                        </div>
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2 md:gap-3">
                            <h4 className="font-bold text-on-surface text-sm md:text-base">{step.title}</h4>
                            <span className="text-[8px] md:text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 bg-surface-variant text-on-surface-variant rounded-md">
                              {step.duration}
                            </span>
                          </div>
                          <p className="text-xs md:text-sm text-on-surface-variant leading-relaxed">
                            {step.description}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <FeedbackButtons />
                </div>
              </motion.div>
            ) : activeTab === 'flashcards' && flashcardsResult.length > 0 ? (
              <motion.div
                key="flashcards"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-8 w-full flex flex-col items-center"
              >
                <div className="flex flex-wrap items-center justify-center gap-4">
                  <h2 className="text-xl md:text-2xl font-bold text-on-surface flex items-center gap-2">
                    <Layers className="w-5 h-5 md:w-6 md:h-6 text-primary" />
                    Tarjetas Generadas
                  </h2>
                  <div className="text-xs font-bold text-on-surface-variant bg-surface-variant px-3 md:px-4 py-1.5 rounded-full">
                    {currentCardIndex + 1} de {flashcardsResult.length}
                  </div>
                </div>

                <div className="flex justify-end w-full max-w-2xl px-4">
                  <button
                    onClick={exportFlashcardsToPDF}
                    className="flex items-center gap-2 px-3 md:px-4 py-2 bg-card border border-outline-variant rounded-xl text-xs md:text-sm font-bold text-on-surface-variant hover:text-primary hover:border-primary/30 transition-all shadow-sm"
                  >
                    <Download className="w-4 h-4" />
                    Exportar PDF
                  </button>
                </div>

                <div className="perspective-1000 h-[300px] md:h-[400px] w-[95%] max-w-2xl relative group">
                  <motion.div
                    animate={{ rotateY: isFlipped ? 180 : 0 }}
                    transition={{ type: "spring", stiffness: 260, damping: 20 }}
                    className="w-full h-full relative preserve-3d cursor-pointer"
                    onClick={() => setIsFlipped(!isFlipped)}
                  >
                    {/* Front */}
                    <div className="absolute inset-0 backface-hidden bg-card rounded-[2rem] md:rounded-[2.5rem] shadow-xl border-2 border-outline-variant/10 flex flex-col items-center justify-center p-6 md:p-12 text-center">
                      <span className="text-[8px] md:text-[10px] font-bold uppercase tracking-[0.2em] text-primary mb-4 md:mb-6">Tarjetas de Estudio</span>
                      <p className="text-xl md:text-3xl font-bold text-on-surface leading-tight">
                        {flashcardsResult[currentCardIndex].front}
                      </p>
                      <div className="mt-8 md:mt-12 flex items-center gap-2 text-on-surface-variant/40 text-[10px] md:text-xs font-bold uppercase tracking-widest">
                        <RefreshCw className="w-4 h-4" />
                        Toca para voltear
                      </div>
                    </div>

                    {/* Back */}
                    <div 
                      className="absolute inset-0 backface-hidden bg-primary rounded-[2rem] md:rounded-[2.5rem] shadow-xl flex flex-col items-center justify-center p-6 md:p-12 text-center"
                      style={{ transform: 'rotateY(180deg)' }}
                    >
                      <span className="text-[8px] md:text-[10px] font-bold uppercase tracking-[0.2em] text-white/60 mb-4 md:mb-6">Respuesta</span>
                      <p className="text-lg md:text-2xl font-medium text-white leading-relaxed">
                        {flashcardsResult[currentCardIndex].back}
                      </p>
                    </div>
                  </motion.div>
                </div>

                {/* Progress Indicator */}
                <div className="space-y-3 w-[95%] max-w-2xl">
                  <div className="flex justify-between items-center px-2">
                    <span className="text-[8px] md:text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.2em]">
                      Tarjetas de Estudio
                    </span>
                    <span className="text-[10px] md:text-xs font-bold text-primary">
                      {currentCardIndex + 1} de {flashcardsResult.length}
                    </span>
                  </div>
                  <div className="w-full h-1.5 md:h-2 bg-surface-variant/30 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${((currentCardIndex + 1) / flashcardsResult.length) * 100}%` }}
                      className="h-full bg-primary"
                      transition={{ type: "spring", stiffness: 100, damping: 20 }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 md:gap-4 w-[95%] max-w-2xl">
                  <button
                    onClick={handlePrevCard}
                    disabled={currentCardIndex === 0}
                    className="flex-1 py-3 md:py-4 bg-surface-variant text-on-surface-variant rounded-2xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-surface-variant/80 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  >
                    <ChevronLeft className="w-4 h-4 md:w-5 md:h-5" />
                    Anterior
                  </button>
                  <button
                    onClick={handleNextCard}
                    disabled={currentCardIndex === flashcardsResult.length - 1}
                    className="flex-1 py-3 md:py-4 bg-primary text-white rounded-2xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-lg shadow-primary/20"
                  >
                    Siguiente
                    <ChevronRight className="w-4 h-4 md:w-5 md:h-5" />
                  </button>
                </div>

                <div className="flex justify-center">
                  <button
                    onClick={() => setFlashcardsResult([])}
                    className="text-[10px] md:text-xs font-bold text-on-surface-variant uppercase tracking-widest hover:text-primary transition-colors"
                  >
                    Finalizar Estudio
                  </button>
                </div>
              </motion.div>
            ) : activeTab === 'exam' && examResult.length > 0 ? (
              <motion.div
                key="exam"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-8 w-full flex flex-col items-center"
              >
                <div className="flex flex-wrap items-center justify-center gap-4">
                  <h2 className="text-xl md:text-2xl font-bold text-on-surface flex items-center gap-2">
                    <FileText className="w-5 h-5 md:w-6 md:h-6 text-primary" />
                    Examen de Práctica
                  </h2>
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    {examResult.length > 0 && (
                      <button
                        onClick={exportExamToPDF}
                        className="flex items-center gap-2 px-3 md:px-4 py-2 bg-card border border-outline-variant rounded-xl text-xs md:text-sm font-bold text-on-surface-variant hover:text-primary hover:border-primary/30 transition-all shadow-sm"
                      >
                        <Download className="w-4 h-4" />
                        Exportar PDF
                      </button>
                    )}
                    {examSubmitted && (
                      <div className={cn(
                        "px-3 md:px-4 py-1.5 rounded-full text-xs md:text-sm font-bold",
                        (examScore || 0) / examResult.length >= 0.6 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                      )}>
                        Puntaje: {examScore}/{examResult.length}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-6 w-full flex flex-col items-center">
                  {examResult.map((q, idx) => (
                    <div key={q.id} className="responsive-card glass-panel p-4 md:p-6 rounded-3xl border border-outline-variant/30 space-y-4">
                      <div className="flex gap-3 md:gap-4">
                        <span className="flex-shrink-0 w-6 h-6 md:w-8 md:h-8 rounded-full bg-surface-variant flex items-center justify-center font-bold text-xs md:text-sm">
                          {idx + 1}
                        </span>
                        <p className="text-base md:text-lg font-medium text-on-surface">{q.question}</p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pl-0 md:pl-12">
                        {q.options.map((option, optIdx) => {
                          const isSelected = userAnswers[q.id] === optIdx;
                          const isCorrect = q.correctAnswer === optIdx;
                          const showResult = examSubmitted;

                          return (
                            <button
                              key={optIdx}
                              disabled={examSubmitted}
                              onClick={() => setUserAnswers(prev => ({ ...prev, [q.id]: optIdx }))}
                              className={cn(
                                "p-3 md:p-4 rounded-2xl text-left text-xs md:text-sm font-medium transition-all border-2",
                                !showResult && isSelected ? "border-primary bg-primary/5 text-primary" :
                                !showResult ? "border-outline-variant/30 hover:border-primary/30 text-on-surface-variant" :
                                isCorrect ? "border-green-500 bg-green-50 text-green-700" :
                                isSelected && !isCorrect ? "border-red-500 bg-red-50 text-red-700" :
                                "border-outline-variant/10 opacity-50 text-on-surface-variant"
                              )}
                            >
                              <div className="flex items-center gap-2 md:gap-3">
                                <span className={cn(
                                  "w-5 h-5 md:w-6 md:h-6 rounded-full border flex items-center justify-center text-[8px] md:text-[10px] font-bold",
                                  !showResult && isSelected ? "border-primary bg-primary text-white" :
                                  "border-outline-variant"
                                )}>
                                  {String.fromCharCode(65 + optIdx)}
                                </span>
                                {option}
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      {examSubmitted && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className={cn(
                            "pl-0 md:pl-12 pt-4 text-[10px] md:text-xs font-medium",
                            userAnswers[q.id] === q.correctAnswer ? "text-green-600" : "text-red-600"
                          )}
                        >
                          <p className="flex items-center gap-2">
                            {userAnswers[q.id] === q.correctAnswer ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                            {q.explanation}
                          </p>
                        </motion.div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap justify-center gap-3 md:gap-4 pt-4">
                  {!examSubmitted ? (
                    <button
                      onClick={handleSubmitExam}
                      className="px-6 md:px-8 py-3 md:py-4 bg-primary text-white rounded-2xl text-sm font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
                    >
                      Enviar Examen
                    </button>
                  ) : (
                    <button
                      onClick={handleResetExam}
                      className="px-6 md:px-8 py-3 md:py-4 bg-surface-variant text-on-surface-variant rounded-2xl text-sm font-bold hover:bg-surface-variant/80 transition-all"
                    >
                      Reintentar
                    </button>
                  )}
                  <button
                    onClick={() => setExamResult([])}
                    className="px-6 md:px-8 py-3 md:py-4 border border-outline-variant text-on-surface-variant rounded-2xl text-sm font-bold hover:bg-surface-variant/30 transition-all"
                  >
                    Finalizar
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="responsive-card h-full min-h-[400px] flex flex-col items-center justify-center text-center p-12 glass-panel rounded-[3rem] border-2 border-dashed border-outline-variant/30 group"
              >
                <div className="relative mb-8">
                  <div className="absolute inset-0 bg-primary/10 blur-3xl rounded-full scale-150 animate-pulse" />
                  <div className="relative w-24 h-24 bg-primary/10 rounded-3xl flex items-center justify-center text-primary group-hover:scale-110 group-hover:rotate-6 transition-all duration-500">
                    {activeTab === 'summary' && <BookOpen className="w-12 h-12" />}
                    {activeTab === 'plan' && <Target className="w-12 h-12" />}
                    {activeTab === 'flashcards' && <Layers className="w-12 h-12" />}
                    {activeTab === 'exam' && <FileText className="w-12 h-12" />}
                    {activeTab === 'exercises' && <Activity className="w-12 h-12" />}
                    {activeTab === 'diagram' && <Layers className="w-12 h-12" />}
                  </div>
                </div>
                
                <h3 className="text-2xl font-black text-on-surface mb-3 uppercase tracking-tight">
                  {activeTab === 'summary' && 'Resumen Personalizado'}
                  {activeTab === 'plan' && 'Plan Adaptativo'}
                  {activeTab === 'flashcards' && 'Tarjetas de Estudio'}
                  {activeTab === 'exam' && 'Examen'}
                  {activeTab === 'exercises' && 'Ejercicios'}
                  {activeTab === 'diagram' && 'Esquemas'}
                </h3>
                
                <p className="text-on-surface-variant max-w-md mb-10 leading-relaxed font-medium">
                  {`Genera ${activeTab === 'summary' ? 'un resumen' : activeTab === 'plan' ? 'un plan' : activeTab === 'flashcards' ? 'tarjetas' : activeTab === 'exam' ? 'un examen' : activeTab === 'exercises' ? 'ejercicios' : 'un esquema'} personalizado para potenciar tu aprendizaje.`}
                </p>

                <div className="flex flex-wrap items-center justify-center gap-4">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-8 py-4 bg-primary text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-primary/90 transition-all shadow-xl shadow-primary/20 flex items-center gap-3"
                  >
                    <Upload className="w-4 h-4" />
                    Subir Documento
                  </button>
                  <button
                    onClick={() => {
                      if (activeTab === 'summary') handleGenerateExampleSummary();
                      else if (activeTab === 'plan') handleGenerateExamplePlan();
                      else if (activeTab === 'flashcards') handleGenerateExampleFlashcards();
                      else if (activeTab === 'exam') {
                        const exampleTopic = 'Anatomía Humana';
                        setTopic(exampleTopic);
                        handleGenerateExam(exampleTopic);
                      }
                      else if (activeTab === 'exercises') handleGenerateExampleExercises();
                      else if (activeTab === 'diagram') handleGenerateExampleDiagram();
                    }}
                    className="px-8 py-4 bg-surface-variant text-on-surface-variant rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-surface-variant/80 transition-all border border-outline-variant/30 flex items-center gap-3"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Generar Ejemplo
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
};
