import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Volume2, VolumeX, X, Loader2, BrainCircuit, RotateCcw, Plus, MessageSquare, Trash2, ChevronLeft, ChevronRight, User } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Modality, getAI, handleAIError } from '../services/geminiService';
import { toast } from 'sonner';
import { getUserCredits, consumeCredit } from '../services/userService';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '../lib/utils';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  onSnapshot, 
  serverTimestamp, 
  where, 
  deleteDoc, 
  getDocs,
  doc,
  updateDoc
} from 'firebase/firestore';

interface VoiceAssistantProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ChatSession {
  id: string;
  title: string;
  type: 'tutor' | 'voice';
  lastMessage?: string;
  updatedAt: any;
  createdAt: any;
}

interface VoiceMessage {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: any;
}

export const VoiceAssistant: React.FC<VoiceAssistantProps> = ({ isOpen, onClose }) => {
  const [isListening, setIsListening] = useState(false);
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<VoiceMessage[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load sessions
  useEffect(() => {
    if (!auth.currentUser) return;

    const q = query(
      collection(db, 'chats'),
      where('userId', '==', auth.currentUser.uid),
      where('type', '==', 'voice'),
      orderBy('updatedAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loadedSessions = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as ChatSession));
      setSessions(loadedSessions);
      
      if (loadedSessions.length > 0 && !currentSessionId) {
        setCurrentSessionId(loadedSessions[0].id);
      }
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'chats'));

    return () => unsubscribe();
  }, [auth.currentUser]);

  // Load messages for current session
  useEffect(() => {
    if (!auth.currentUser || !currentSessionId) {
      setMessages([]);
      return;
    }

    const q = query(
      collection(db, 'chats', currentSessionId, 'messages'),
      orderBy('timestamp', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loadedMessages = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as VoiceMessage));
      setMessages(loadedMessages);
    }, (err) => handleFirestoreError(err, OperationType.LIST, `chats/${currentSessionId}/messages`));

    return () => unsubscribe();
  }, [auth.currentUser, currentSessionId]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setIsListening(false);
      setIsProcessing(false);
      setTranscript('');
      setResponse('');
      recognitionRef.current?.stop();
      if (sourceRef.current) {
        sourceRef.current.stop();
        sourceRef.current = null;
      }
    }
  }, [isOpen]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, transcript, response]);

  useEffect(() => {
    if (typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'es-ES';

      recognition.onresult = (event: any) => {
        const current = event.resultIndex;
        const transcriptText = event.results[current][0].transcript;
        setTranscript(transcriptText);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
        if (event.error === 'not-allowed') {
          toast.error('Permiso de micrófono denegado. Por favor, actívalo en tu navegador.');
        } else if (event.error !== 'no-speech') {
          toast.error('Error de reconocimiento de voz: ' + event.error);
        }
      };

      recognitionRef.current = recognition;
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const transcriptRef = useRef(transcript);
  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  useEffect(() => {
    if (!isListening && transcriptRef.current && !isProcessing) {
      handleProcessVoice(transcriptRef.current);
      setTranscript('');
    }
  }, [isListening]);

  const handleCreateNewSession = async () => {
    if (!auth.currentUser) return;
    try {
      const docRef = await addDoc(collection(db, 'chats'), {
        userId: auth.currentUser.uid,
        title: 'Nueva charla de voz',
        type: 'voice',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setCurrentSessionId(docRef.id);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'chats');
    }
  };

  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!auth.currentUser) return;
    try {
      const messagesSnapshot = await getDocs(collection(db, 'chats', sessionId, 'messages'));
      const deletePromises = messagesSnapshot.docs.map(d => deleteDoc(d.ref));
      await Promise.all(deletePromises);
      await deleteDoc(doc(db, 'chats', sessionId));
      if (currentSessionId === sessionId) setCurrentSessionId(null);
      toast.success('Charla eliminada');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `chats/${sessionId}`);
    }
  };

  const toggleListening = async () => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
    } catch (e) {
      console.error("Error initializing AudioContext:", e);
    }

    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      setTranscript('');
      setResponse('');
      recognitionRef.current?.start();
      setIsListening(true);
    }
  };

  const handleProcessVoice = async (text: string) => {
    if (!text.trim() || !auth.currentUser) return;
    setIsProcessing(true);
    
    let sessionId = currentSessionId;
    if (!sessionId) {
      try {
        const docRef = await addDoc(collection(db, 'chats'), {
          userId: auth.currentUser.uid,
          title: text.substring(0, 30) + (text.length > 30 ? '...' : ''),
          type: 'voice',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        sessionId = docRef.id;
        setCurrentSessionId(sessionId);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, 'chats');
        setIsProcessing(false);
        return;
      }
    }

    try {
      // Verificar créditos antes de proceder
      const { credits } = await getUserCredits(auth.currentUser.uid);
      if (credits <= 0) {
        toast.error(language === 'es' ? 'No tienes créditos suficientes. Espera a mañana o mejora tu plan.' : 'Not enough credits. Wait until tomorrow or upgrade your plan.');
        setIsProcessing(false);
        return;
      }

      // Save user message
      await addDoc(collection(db, 'chats', sessionId, 'messages'), {
        text,
        sender: 'user',
        userId: auth.currentUser.uid,
        timestamp: serverTimestamp()
      });

      // Update session title if it's the first message
      if (messages.length === 0) {
        await updateDoc(doc(db, 'chats', sessionId), {
          title: text.substring(0, 30) + (text.length > 30 ? '...' : ''),
          updatedAt: serverTimestamp()
        });
      } else {
        await updateDoc(doc(db, 'chats', sessionId), {
          updatedAt: serverTimestamp()
        });
      }

      const ai = getAI();
      const textResult = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ parts: [{ text: text }] }],
        config: {
          systemInstruction: "Eres un asistente de estudio experto y servicial. Responde de forma clara, informativa y breve en español. No repitas lo que el usuario dice. No utilices LaTeX ni símbolos complejos para fórmulas químicas o matemáticas. Escribí las fórmulas en texto plano (ejemplo: CO2 en lugar de subíndices) para asegurar que se lean bien en cualquier pantalla.",
        },
      });

      const responseText = textResult.text || 'No pude procesar tu solicitud.';
      setResponse(responseText);
      
      // Consumir crédito tras respuesta exitosa
      await consumeCredit(auth.currentUser.uid);
      
      // Save AI response
      await addDoc(collection(db, 'chats', sessionId, 'messages'), {
        text: responseText,
        sender: 'ai',
        userId: auth.currentUser.uid,
        timestamp: serverTimestamp()
      });

      if (!isMuted) {
        const audioResult = await ai.models.generateContent({
          model: "gemini-2.5-flash-preview-tts",
          contents: [{ parts: [{ text: responseText }] }],
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: 'Kore' },
              },
            },
          },
        });

        const audioData = audioResult.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (audioData) {
          await playAudio(audioData);
        }
      }
    } catch (error: any) {
      console.error("Voice processing error:", error);
      toast.error(`Error: ${error.message || 'No se pudo procesar la voz'}`);
    } finally {
      setIsProcessing(false);
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

      const binaryString = atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const dataView = new DataView(bytes.buffer);
      const numSamples = len / 2;
      const float32Data = new Float32Array(numSamples);
      
      for (let i = 0; i < numSamples; i++) {
        const sample = dataView.getInt16(i * 2, true);
        float32Data[i] = sample / 32768;
      }
      
      const audioBuffer = audioContextRef.current.createBuffer(1, numSamples, 24000);
      audioBuffer.getChannelData(0).set(float32Data);
      
      if (sourceRef.current) {
        sourceRef.current.stop();
      }
      
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);
      source.onended = () => {
        if (sourceRef.current === source) {
          sourceRef.current = null;
        }
      };
      sourceRef.current = source;
      source.start();
    } catch (error) {
      console.error('Audio playback error:', error);
      toast.error('Error al reproducir el audio de respuesta');
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="bg-surface-container-high w-[95%] max-w-4xl h-[80vh] rounded-[40px] shadow-2xl border border-outline-variant/10 relative overflow-hidden flex"
          >
            {/* Sidebar de Sesiones */}
            <motion.div 
              initial={false}
              animate={{ width: isSidebarOpen ? 260 : 0, opacity: isSidebarOpen ? 1 : 0 }}
              className="hidden md:flex flex-col bg-surface-container-low border-r border-outline-variant/10 overflow-hidden"
            >
              <div className="p-4">
                <button 
                  onClick={handleCreateNewSession}
                  className="w-full flex items-center gap-2 p-3 bg-primary text-white rounded-2xl font-bold text-xs hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-primary/20"
                >
                  <Plus size={16} />
                  Nueva Charla
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    onClick={() => setCurrentSessionId(session.id)}
                    className={cn(
                      "w-full flex items-center justify-between p-3 rounded-xl text-left transition-all group cursor-pointer",
                      currentSessionId === session.id 
                        ? "bg-primary/10 text-primary" 
                        : "text-on-surface-variant hover:bg-surface-container-high"
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <MessageSquare size={14} className="flex-shrink-0 opacity-60" />
                      <span className="text-[10px] font-bold truncate">{session.title}</span>
                    </div>
                    <button 
                      onClick={(e) => handleDeleteSession(session.id, e)}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:text-error transition-all"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col relative">
              {/* Background Glow */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-primary/20 blur-[100px] -z-10" />

              <div className="p-6 border-b border-outline-variant/10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                    className="p-2 text-on-surface-variant hover:bg-surface-container-highest rounded-xl transition-all"
                  >
                    {isSidebarOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
                  </button>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                      <BrainCircuit size={24} />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-on-surface">
                        {currentSessionId ? sessions.find(s => s.id === currentSessionId)?.title : 'Asistente de Voz'}
                      </h2>
                      <p className="text-[10px] text-on-surface-variant opacity-60 uppercase tracking-widest font-bold">Interacción Natural</p>
                    </div>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-surface-container-highest rounded-full transition-colors"
                >
                  <X size={24} className="text-on-surface-variant" />
                </button>
              </div>

              <div 
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-8 space-y-6 scroll-smooth"
              >
                {messages.length === 0 && !transcript && !response && (
                  <div className="h-full flex flex-col items-center justify-center text-center p-8">
                    <div className="w-20 h-20 bg-primary/5 rounded-full flex items-center justify-center text-primary/30 mb-6">
                      <Mic size={40} />
                    </div>
                    <h3 className="text-lg font-headline font-bold text-on-surface mb-2">¿En qué puedo ayudarte?</h3>
                    <p className="text-sm text-on-surface-variant opacity-60 max-w-xs">
                      Presiona el micrófono para empezar a hablar con tu asistente personal.
                    </p>
                  </div>
                )}
                
                {messages.map((msg) => (
                  <motion.div 
                    key={msg.id} 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      "flex flex-col",
                      msg.sender === 'user' ? "items-end" : "items-start"
                    )}
                  >
                    <div className={cn(
                      "max-w-[80%] p-4 rounded-2xl text-sm shadow-sm",
                      msg.sender === 'user' 
                        ? "bg-primary text-on-primary rounded-tr-none" 
                        : "bg-surface-container-low text-on-surface border border-outline-variant/10 rounded-tl-none"
                    )}>
                      <span key={`voice-content-${msg.id}`}>{msg.text}</span>
                    </div>
                  </motion.div>
                ))}

                {transcript && (
                  <div key={`transcript-bubble-${currentSessionId || 'new'}`} className="flex flex-col items-end">
                    <div className="max-w-[80%] p-4 rounded-2xl text-sm bg-primary/50 text-on-primary rounded-tr-none animate-pulse">
                      <span key={`transcript-text-${currentSessionId || 'new'}`}>{transcript}</span>
                    </div>
                  </div>
                )}

                {isProcessing && !response && (
                  <div key={`processing-bubble-${currentSessionId || 'new'}`} className="flex flex-col items-start">
                    <div className="max-w-[80%] p-4 rounded-2xl text-sm bg-surface-container-low text-on-surface border border-outline-variant/10 rounded-tl-none flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin text-primary flex-shrink-0" />
                      <span className="font-bold">Pensando...</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-8 bg-surface-container-low border-t border-outline-variant/10 flex flex-col items-center gap-6">
                <div className="flex items-center justify-center gap-4 h-12">
                  {isListening ? (
                    <div className="flex items-center gap-1">
                      {[...Array(8)].map((_, i) => (
                        <motion.div
                          key={i}
                          animate={{ height: [12, 32, 12] }}
                          transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.05 }}
                          className="w-1.5 bg-primary rounded-full"
                        />
                      ))}
                    </div>
                  ) : isProcessing ? (
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                  ) : (
                    <div className="text-[10px] font-bold text-on-surface-variant opacity-40 uppercase tracking-widest">
                      Listo para escuchar
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-6">
                  <button
                    onClick={() => setIsMuted(!isMuted)}
                    className={cn(
                      "p-4 rounded-2xl transition-all",
                      isMuted ? "bg-error/10 text-error" : "bg-surface-container-highest text-on-surface-variant"
                    )}
                  >
                    {isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}
                  </button>

                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={toggleListening}
                    className={cn(
                      "w-20 h-20 rounded-full flex items-center justify-center shadow-2xl transition-all",
                      isListening 
                        ? "bg-error text-on-error shadow-error/30 animate-pulse" 
                        : "bg-primary text-on-primary shadow-primary/30"
                    )}
                  >
                    {isListening ? <MicOff size={32} /> : <Mic size={32} />}
                  </motion.button>

                  <div className="w-14" />
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
