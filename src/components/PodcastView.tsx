import React, { useState, useEffect, useRef } from 'react';
import { Headphones, Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, List, Music, Loader2, Sparkles, FileText, X, Upload } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { generatePodcastScript, generatePodcastAudio } from '../services/geminiService';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useCourses } from '../contexts/CourseContext';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { db } from '../firebase';
import { getUserCredits, consumeCredit } from '../services/userService';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { UsageLimitModal } from './UsageLimitModal';

interface PodcastViewProps {
  driveFile?: { name: string, data?: string, text?: string, mimeType: string } | null;
}

export const PodcastView: React.FC<PodcastViewProps> = ({ driveFile }) => {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const { courses, activities } = useCourses();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLimitModalOpen, setIsLimitModalOpen] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<any>(null);
  const [isMuted, setIsMuted] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);

  const tracks = [
    ...courses.map(c => ({ 
      id: c.id, 
      title: c.title, 
      description: c.summary || '', 
      type: 'course', 
      timestamp: typeof c.createdAt === 'object' && c.createdAt?.toMillis ? c.createdAt.toMillis() : Date.now(),
      fullContent: `Curso: ${c.title}\nDescripción: ${c.summary || ''}\nTeoría:\n${c.theory || ''}\n\nEjemplos:\n${c.examples || ''}`
    })),
    ...activities.filter(a => a.type === 'summary').map(a => ({
      id: a.id,
      title: a.title,
      description: a.description,
      type: 'summary',
      timestamp: a.timestamp || Date.now(),
      fullContent: a.description
    }))
  ];

  const handleGeneratePodcast = async (content: string, title: string) => {
    if (!content.trim()) {
      toast.error('No hay contenido para generar el podcast');
      return;
    }
    if (!user) {
      toast.error('Debes iniciar sesión');
      return;
    }
    setIsGenerating(true);
    toast.info('Generando podcast...');
    try {
      // Check credits before calling AI
      const { credits: currentCredits } = await getUserCredits(user.uid);
      if (currentCredits <= 0) {
        setIsLimitModalOpen(true);
        setIsGenerating(false);
        return;
      }

      const script = await generatePodcastScript(user.uid, content, language, undefined);
      const audioBase64 = await generatePodcastAudio(user.uid, script);
      
      if (audioBase64) {
        // Consume credit after successful generation
        await consumeCredit(user.uid);
        
        playAudio(audioBase64);
        setCurrentTrack({ title, text: script });
        toast.success('¡Podcast generado con éxito!');
      } else {
        toast.error('El servicio de audio no está disponible en este momento. Intenta con un texto más breve.');
      }
    } catch (error: any) {
      console.error("Podcast error:", error);
      if (error?.message === 'INSUFFICIENT_CREDITS') {
        setIsLimitModalOpen(true);
      } else {
        toast.error(`Error al generar el podcast: ${error.message}`);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setIsGenerating(true);
    toast.info('Procesando archivo para el podcast...');

    try {
      const { credits: currentCredits } = await getUserCredits(user.uid);
      if (currentCredits <= 0) {
        setIsLimitModalOpen(true);
        setIsGenerating(false);
        return;
      }

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
      
      const script = await generatePodcastScript(user.uid, content, language, undefined, fileData);
      const audioBase64 = await generatePodcastAudio(user.uid, script);
      
      if (audioBase64) {
        await consumeCredit(user.uid);
        playAudio(audioBase64);
        setCurrentTrack({ title: file.name, text: script });
        toast.success('¡Podcast generado desde el archivo!');
      } else {
        toast.error('No se pudo generar el audio del archivo. Intenta con un documento más simple.');
      }
    } catch (error: any) {
      console.error("Error generating podcast from upload:", error);
      if (error?.message === 'INSUFFICIENT_CREDITS') {
        setIsLimitModalOpen(true);
      } else {
        toast.error('Error al generar el podcast desde el archivo');
      }
    } finally {
      setIsGenerating(false);
      e.target.value = '';
    }
  };

  const playAudio = async (base64Data: string) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      if (sourceRef.current) {
        sourceRef.current.stop();
      }

      const binaryString = atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // The TTS model returns raw PCM 16-bit little-endian data at 24kHz
      const dataView = new DataView(bytes.buffer);
      const numSamples = len / 2;
      const float32Data = new Float32Array(numSamples);
      
      for (let i = 0; i < numSamples; i++) {
        const sample = dataView.getInt16(i * 2, true);
        float32Data[i] = sample / 32768;
      }

      const audioBuffer = audioContextRef.current.createBuffer(1, numSamples, 24000);
      audioBuffer.getChannelData(0).set(float32Data);

      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);
      source.onended = () => setIsPlaying(false);
      source.start();
      sourceRef.current = source;
      setIsPlaying(true);
    } catch (error) {
      console.error("Error playing audio:", error);
      toast.error("Error al reproducir el audio.");
    }
  };

  const togglePlay = () => {
    if (isPlaying) {
      audioContextRef.current?.suspend();
      setIsPlaying(false);
    } else {
      audioContextRef.current?.resume();
      setIsPlaying(true);
    }
  };

  return (
    <div className="responsive-container space-y-8">
      <UsageLimitModal isOpen={isLimitModalOpen} onClose={() => setIsLimitModalOpen(false)} />
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="text-center md:text-left">
          <h2 className="text-2xl md:text-3xl font-headline font-bold text-on-surface flex items-center justify-center md:justify-start gap-3">
            <Headphones className="text-primary" />
            Podcast de Estudio
          </h2>
          <p className="text-on-surface-variant opacity-70 mt-1">
            Escucha tus resúmenes y apuntes como si fuera un podcast profesional.
          </p>
        </div>
        
        <label className={cn(
          "flex items-center justify-center gap-2 px-6 py-3 bg-primary text-white rounded-2xl font-bold text-sm hover:bg-primary/90 transition-all cursor-pointer shadow-lg shadow-primary/20",
          isGenerating && "opacity-50 cursor-not-allowed"
        )}>
          {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload size={18} />}
          Subir Archivo para Podcast
          <input 
            type="file" 
            className="hidden" 
            onChange={handleFileUpload}
            disabled={isGenerating}
            accept=".pdf,.doc,.docx,.txt,.md"
          />
        </label>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          {/* Player Card */}
          <div className="responsive-card bg-card rounded-[2.5rem] p-8 border border-outline-variant/10 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-tertiary to-primary opacity-30" />
            
            <div className="flex flex-col items-center text-center space-y-6">
              <div className="w-48 h-48 bg-surface-container-high rounded-3xl shadow-inner flex items-center justify-center relative group">
                <div className="absolute inset-0 bg-primary/5 rounded-3xl group-hover:bg-primary/10 transition-all" />
                <Music className="w-20 h-20 text-primary/40" />
                {isPlaying && (
                  <div className="absolute bottom-4 flex gap-1">
                    {[1, 2, 3, 4].map(i => (
                      <motion.div
                        key={i}
                        animate={{ height: [8, 20, 8] }}
                        transition={{ repeat: Infinity, duration: 0.5, delay: i * 0.1 }}
                        className="w-1 bg-primary rounded-full"
                      />
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <h3 className="text-xl font-bold text-on-surface">
                  {currentTrack?.title || "Selecciona un contenido"}
                </h3>
                <p className="text-sm text-on-surface-variant opacity-60">
                  {isGenerating ? "Generando audio..." : isPlaying ? "Reproduciendo ahora" : "Listo para reproducir"}
                </p>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-8">
                <button className="p-3 text-on-surface-variant hover:text-primary transition-all">
                  <SkipBack size={24} />
                </button>
                <button
                  onClick={togglePlay}
                  disabled={!currentTrack || isGenerating}
                  className="w-16 h-16 bg-primary text-white rounded-full flex items-center justify-center shadow-lg shadow-primary/30 hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
                >
                  {isGenerating ? (
                    <Loader2 className="w-8 h-8 animate-spin" />
                  ) : isPlaying ? (
                    <Pause size={32} />
                  ) : (
                    <Play size={32} className="ml-1" />
                  )}
                </button>
                <button className="p-3 text-on-surface-variant hover:text-primary transition-all">
                  <SkipForward size={24} />
                </button>
              </div>

              <div className="w-full space-y-2">
                <div className="h-1.5 bg-surface-container-high rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-primary"
                    animate={{ width: isPlaying ? "100%" : "0%" }}
                    transition={{ duration: 300, ease: "linear" }}
                  />
                </div>
                <div className="flex justify-between text-[10px] font-bold text-on-surface-variant opacity-40 uppercase tracking-widest">
                  <span>0:00</span>
                  <span>5:00</span>
                </div>
              </div>
            </div>
          </div>

          {/* Context Card */}
          {driveFile && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="responsive-card bg-primary/5 rounded-3xl p-6 border border-primary/10 flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
                  <FileText size={24} />
                </div>
                <div>
                  <h4 className="font-bold text-on-surface">{driveFile.name}</h4>
                  <p className="text-xs text-on-surface-variant">Documento cargado recientemente</p>
                </div>
              </div>
              <button
                onClick={() => handleGeneratePodcast(driveFile.text || driveFile.data || "", driveFile.name)}
                disabled={isGenerating}
                className="px-6 py-3 bg-primary text-white rounded-xl font-bold text-sm hover:bg-primary/90 transition-all flex items-center gap-2"
              >
                {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles size={16} />}
                Convertir a Podcast
              </button>
            </motion.div>
          )}
        </div>

        <div className="lg:col-span-1 space-y-6">
          <div className="responsive-card bg-card rounded-3xl p-6 border border-outline-variant/10 shadow-sm">
            <div className="flex items-center gap-2 mb-6">
              <List className="text-primary w-5 h-5" />
              <h3 className="font-bold text-sm uppercase tracking-widest text-on-surface">Tu Biblioteca</h3>
            </div>
            
            <div className="space-y-3">
              {tracks.length > 0 ? (
                tracks.map((track) => (
                  <button
                    key={track.id}
                    onClick={() => handleGeneratePodcast(track.fullContent || track.description, track.title)}
                    className="w-full p-4 rounded-2xl bg-surface-container-low hover:bg-primary/5 border border-outline-variant/10 transition-all text-left group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-surface-container-high rounded-xl flex items-center justify-center text-on-surface-variant group-hover:text-primary transition-all">
                        <Play size={16} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-on-surface truncate">{track.title}</p>
                        <p className="text-[10px] text-on-surface-variant opacity-60">
                          {track.type === 'course' ? 'Curso' : 'Resumen'} • {new Date(track.timestamp).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </button>
                ))
              ) : (
                <div className="text-center py-8 opacity-40">
                  <p className="text-xs">No hay contenidos guardados aún.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
