import React from 'react';
import { BrainCircuit, Send, Loader2, User, RefreshCw, GraduationCap, Lightbulb, BookOpen, Plus, MessageSquare, Trash2, ChevronLeft, ChevronRight, Mic, MicOff, Volume2, VolumeX, AlertCircle } from 'lucide-react';
import { getAI, Modality, handleAIError, STUDY_SANCTUARY_PROMPT } from '../services/geminiService';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getUserCredits, consumeCredit } from '../services/userService';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  serverTimestamp,
  deleteDoc,
  getDocs,
  doc,
  updateDoc,
  limit
} from 'firebase/firestore';

interface ChatSession {
  id: string;
  title: string;
  type: 'tutor' | 'voice';
  lastMessage?: string;
  updatedAt: any;
  createdAt: any;
}

interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: number;
  audioUrl?: string;
}

export default function VirtualTutor() {
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const [sessions, setSessions] = React.useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [input, setInput] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(true);
  const [isAudioResponseEnabled, setIsAudioResponseEnabled] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const toggleListening = () => {
    toast.error("Reconocimiento de voz desactivado temporalmente");
  };

  const playAudio = async (text: string, force = false) => {
    console.log("Audio playback requested:", text);
  };

  // Load sessions
  React.useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'chats'),
      where('userId', '==', user.uid),
      where('type', '==', 'tutor'),
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
    }, (err) => console.error("Firestore Error (chats):", err));

    return () => unsubscribe();
  }, [user]);

  // Load messages for current session
  React.useEffect(() => {
    if (!user || !currentSessionId) {
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
      } as Message));

      if (loadedMessages.length === 0) {
        const welcome: Message = {
          id: 'welcome',
          role: 'model',
          content: language === 'es' 
            ? '¡Hola! Soy tu profesor virtual. Estoy aquí para explicarte cualquier concepto que no entiendas, resolver tus dudas académicas o ayudarte a profundizar en tus estudios. ¿En qué puedo ayudarte hoy?' 
            : 'Hello! I am your virtual tutor. I am here to explain any concept you don\'t understand, solve your academic doubts, or help you deepen your studies. How can I help you today?',
          timestamp: Date.now()
        };
        setMessages([welcome]);
      } else {
        setMessages(loadedMessages);
      }
    }, (err) => console.error("Firestore Error (messages):", err));

    return () => unsubscribe();
  }, [user, currentSessionId, language]);

  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleCreateNewSession = async () => {
    if (!user) return;
    try {
      const docRef = await addDoc(collection(db, 'chats'), {
        userId: user.uid,
        title: language === 'es' ? 'Nueva Tutoría' : 'New Tutoring',
        type: 'tutor',
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
    if (!user) return;
    try {
      const messagesSnapshot = await getDocs(collection(db, 'chats', sessionId, 'messages'));
      const deletePromises = messagesSnapshot.docs.map(d => deleteDoc(doc(db, 'chats', sessionId, 'messages', d.id)));
      await Promise.all(deletePromises);
      await deleteDoc(doc(db, 'chats', sessionId));
      if (currentSessionId === sessionId) setCurrentSessionId(null);
      toast.success(language === 'es' ? 'Conversación eliminada' : 'Conversation deleted');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `chats/${sessionId}`);
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading || !user) return;

    let sessionId = currentSessionId;
    if (!sessionId) {
      try {
        const docRef = await addDoc(collection(db, 'chats'), {
          userId: user.uid,
          title: input.substring(0, 30) + (input.length > 30 ? '...' : ''),
          type: 'tutor',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        sessionId = docRef.id;
        setCurrentSessionId(sessionId);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, 'chats');
        return;
      }
    }

    const userMessageContent = input;
    setInput('');
    setIsLoading(true);

    try {
      // Verificar créditos antes de proceder
      const { credits } = await getUserCredits(user.uid);
      if (credits <= 0) {
        toast.error(language === 'es' ? 'No tienes créditos suficientes. Espera a mañana o mejora tu plan.' : 'Not enough credits. Wait until tomorrow or upgrade your plan.');
        setIsLoading(false);
        return;
      }

      try {
        await addDoc(collection(db, 'chats', sessionId, 'messages'), {
          userId: user.uid,
          chatId: sessionId,
          role: 'user',
          content: userMessageContent,
          timestamp: Date.now(),
          createdAt: serverTimestamp()
        });

        if (messages.length <= 1) {
          await updateDoc(doc(db, 'chats', sessionId), {
            title: userMessageContent.substring(0, 30) + (userMessageContent.length > 30 ? '...' : ''),
            updatedAt: serverTimestamp()
          });
        } else {
          await updateDoc(doc(db, 'chats', sessionId), {
            updatedAt: serverTimestamp()
          });
        }
      } catch (fsError: any) {
        console.error("Firestore error in handleSendMessage:", fsError);
        const isPermissionError = fsError.message?.includes('permission-denied') || fsError.code === 'permission-denied';
        toast.error(isPermissionError 
          ? (language === 'es' ? 'Error de permisos al guardar el mensaje. Revisa las reglas de Firebase.' : 'Permission error saving message. Check Firebase rules.')
          : (language === 'es' ? 'Error al conectar con la base de datos.' : 'Error connecting to database.')
        );
        setIsLoading(false);
        return;
      }

      const ai = getAI();
      const history = messages.filter(m => m.id !== 'welcome').map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }]
      }));

      const chat = ai.chats.create({
        model: "gemini-3-flash-preview",
        config: {
          systemInstruction: `${STUDY_SANCTUARY_PROMPT}
          Además, eres un profesor virtual paciente y motivador. Explica conceptos complejos de forma sencilla, utilizando analogías y ejemplos prácticos. 
          Fomenta el pensamiento crítico haciendo preguntas de seguimiento. 
          El idioma de respuesta debe ser ${language === 'es' ? 'Español' : 'Inglés'}.`,
        },
        history: history
      });

      const result = await chat.sendMessage({ message: userMessageContent });
      const tutorResponse = result.text || 'Lo siento, tuve un problema al procesar tu respuesta.';

      // Consumir crédito tras respuesta exitosa
      await consumeCredit(user.uid);

      try {
        await addDoc(collection(db, 'chats', sessionId, 'messages'), {
          userId: user.uid,
          chatId: sessionId,
          role: 'model',
          content: tutorResponse,
          timestamp: Date.now(),
          createdAt: serverTimestamp()
        });
      } catch (fsError: any) {
        console.error("Firestore error saving tutor response:", fsError);
        toast.error(language === 'es' ? 'Error al guardar la respuesta del tutor.' : 'Error saving tutor response.');
      }

      if (isAudioResponseEnabled) {
        playAudio(tutorResponse);
      }

    } catch (error: any) {
      handleAIError(error, language === 'es' ? "Error del tutor" : "Tutor error");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="responsive-container h-[calc(100vh-12rem)] flex flex-col md:flex-row gap-4 md:gap-6">
      {/* Sidebar de Chats */}
      {isSidebarOpen && (
        <div 
          className={cn(
            "flex flex-col bg-surface-container-low/50 backdrop-blur-xl rounded-[2.5rem] border border-outline-variant/10 overflow-hidden shadow-2xl transition-all w-full md:w-[280px]",
            !isSidebarOpen && "md:hidden"
          )}
        >
          <div className="p-4 border-b border-outline-variant/5">
            <button 
              onClick={handleCreateNewSession}
              className="w-full flex items-center gap-2 p-3 bg-primary text-on-primary rounded-2xl font-bold text-sm hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-primary/20"
            >
              <Plus size={18} />
              {language === 'es' ? 'Nueva Tutoría' : 'New Tutoring'}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
            {sessions.map((session) => (
              <div
                key={session.id}
                onClick={() => {
                  setCurrentSessionId(session.id);
                  if (window.innerWidth < 768) setIsSidebarOpen(false);
                }}
                className={cn(
                  "w-full flex items-center justify-between p-3 rounded-xl text-left transition-all group cursor-pointer",
                  currentSessionId === session.id 
                    ? "bg-primary/20 text-primary border border-primary/20" 
                    : "text-on-surface-variant hover:bg-surface-container-high"
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <MessageSquare size={16} className="flex-shrink-0 opacity-60" />
                  <span className="text-xs font-medium truncate">{session.title}</span>
                </div>
                <button 
                  onClick={(e) => handleDeleteSession(session.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:text-error transition-all"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Chat Area */}
      <div className={cn(
        "flex-1 flex flex-col bg-surface-container-low/30 backdrop-blur-2xl rounded-[2.5rem] border border-outline-variant/10 shadow-2xl overflow-hidden relative transition-all",
        isSidebarOpen && window.innerWidth < 768 && "hidden"
      )}>
        {/* Header */}
        <div className="p-4 border-b border-outline-variant/5 flex items-center justify-between bg-surface-container-low/50">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 text-on-surface-variant hover:bg-surface-container-high rounded-xl transition-all"
            >
              {isSidebarOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
            </button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center text-primary shadow-lg shadow-primary/10">
                <GraduationCap size={24} />
              </div>
              <div>
                <h2 className="text-sm font-bold text-on-surface">
                  {currentSessionId ? sessions.find(s => s.id === currentSessionId)?.title : 'Profesor Virtual'}
                </h2>
                <p className="text-[10px] text-on-surface-variant uppercase tracking-widest font-black">Asistente de Aprendizaje</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsAudioResponseEnabled(!isAudioResponseEnabled)}
              className={cn(
                "p-2.5 rounded-xl transition-all border",
                isAudioResponseEnabled 
                  ? "bg-secondary/20 text-secondary border-secondary/30" 
                  : "bg-surface-container-low text-on-surface-variant border-outline-variant/10 hover:text-on-surface"
              )}
              title={isAudioResponseEnabled ? "Desactivar respuesta de voz" : "Activar respuesta de voz"}
            >
              {isAudioResponseEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>
            <button 
              onClick={handleCreateNewSession}
              className="md:hidden p-2 text-on-surface-variant hover:text-primary transition-all"
            >
              <Plus size={20} />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 scroll-smooth custom-scrollbar"
        >
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "flex w-full gap-3 md:gap-4",
                message.role === 'user' ? "flex-row-reverse" : "flex-row"
              )}
            >
              <div className={cn(
                "w-8 h-8 md:w-10 md:h-10 rounded-xl md:rounded-2xl flex items-center justify-center flex-shrink-0 shadow-xl",
                message.role === 'user' ? "bg-primary text-on-primary" : "bg-surface-container text-primary border border-outline-variant"
              )}>
                {message.role === 'user' ? <User size={18} /> : <BrainCircuit size={18} />}
              </div>
              <div className={cn(
                "max-w-[85%] p-4 md:p-5 rounded-2xl md:rounded-3xl shadow-2xl backdrop-blur-md",
                message.role === 'user' 
                  ? "bg-primary/90 text-on-primary rounded-tr-none border border-white/20" 
                  : "bg-surface-container-low text-on-surface border border-outline-variant rounded-tl-none"
              )}>
                <div key={`msg-content-wrapper-${message.id}`} className="whitespace-pre-wrap text-sm">
                  <span key={`content-${message.id}`}>{message.content}</span>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <p className={cn(
                    "text-[10px] opacity-40 font-black uppercase tracking-widest",
                    message.role === 'user' ? "text-on-primary" : "text-on-surface-variant"
                  )}>
                    {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  {message.role === 'model' && (
                    <button 
                      onClick={() => playAudio(message.content, true)}
                      className="p-1.5 text-on-surface-variant hover:text-primary transition-colors"
                    >
                      <Volume2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
          {isLoading && (
            <div key={`loading-indicator-${currentSessionId || 'new'}`} className="flex gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="w-10 h-10 rounded-2xl bg-surface-container-high text-primary flex items-center justify-center animate-pulse border border-outline-variant/10">
                <BrainCircuit size={20} />
              </div>
              <div className="bg-surface-container-low p-5 rounded-3xl rounded-tl-none border border-outline-variant/10 flex items-center gap-3 shadow-2xl backdrop-blur-md min-w-[200px]">
                <Loader2 className="w-4 h-4 animate-spin text-primary flex-shrink-0" />
                <span className="text-sm text-on-surface-variant font-bold">El profesor está pensando...</span>
              </div>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-4 md:p-6 bg-surface-container-low border-t border-outline-variant">
          <div className="relative group">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="Pregunta cualquier cosa..."
              className="w-full bg-surface-container border border-outline-variant rounded-3xl p-4 md:p-5 pr-24 md:pr-28 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary/40 focus:bg-surface-container-high transition-all resize-none shadow-inner h-24 md:h-28 custom-scrollbar"
            />
            <div className="absolute right-3 bottom-3 md:right-4 md:bottom-4 flex items-center gap-2">
              <button
                onClick={toggleListening}
                className={cn(
                  "p-2.5 md:p-3 rounded-xl md:rounded-2xl shadow-xl transition-all",
                  "bg-surface-container-high text-on-surface-variant hover:text-primary hover:bg-surface-container-highest border border-outline-variant"
                )}
              >
                <Mic size={18} />
              </button>
              <button
                onClick={handleSendMessage}
                disabled={!input.trim() || isLoading}
                className="p-2.5 md:p-3 bg-primary text-on-primary rounded-xl md:rounded-2xl shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 border border-outline-variant/20"
              >
                <Send size={18} />
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-4 overflow-x-auto pb-2 no-scrollbar">
            {[
              { icon: <Lightbulb size={12} />, text: language === 'es' ? "Explícame la fotosíntesis" : "Explain photosynthesis" },
              { icon: <BookOpen size={12} />, text: language === 'es' ? "¿Qué es la física cuántica?" : "What is quantum physics?" },
              { icon: <GraduationCap size={12} />, text: language === 'es' ? "Ayúdame con mi tesis" : "Help me with my thesis" }
            ].map((suggestion, i) => (
              <button
                key={i}
                onClick={() => setInput(suggestion.text)}
                className="px-4 py-2 rounded-xl bg-surface-container-low border border-outline-variant text-[10px] font-black text-on-surface-variant hover:text-primary hover:bg-primary/10 hover:border-primary/20 transition-all flex items-center gap-2 uppercase tracking-widest whitespace-nowrap"
              >
                {suggestion.icon}
                {suggestion.text}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
