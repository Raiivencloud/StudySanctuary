import React, { useState, useEffect, useRef } from 'react';
import { 
  Trophy, 
  Heart, 
  Zap, 
  Flame, 
  ChevronRight, 
  RotateCcw, 
  Crown, 
  Medal, 
  Gamepad2, 
  Clock, 
  Star,
  X,
  CheckCircle2,
  AlertCircle,
  Share2,
  History,
  LayoutGrid,
  TrendingUp,
  Award,
  Menu,
  Settings,
  User,
  LogOut
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { 
  getArenaUserStats, 
  getQuestionsForArena, 
  updateArenaUserStats, 
  updateRanking, 
  getTopRankings, 
  getKings, 
  dropCollectible, 
  getUserCollectibles 
} from '../services/arenaService';
import { ArenaQuestion, ArenaUserStats, ArenaCollectible, ArenaRankingEntry, StudyLevel } from '../types';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { consumeCredit } from '../services/userService';

import { INITIAL_CARDS } from '../constants/arenaCards';

// --- CONSTANTS ---
const CATEGORIES = [
  { id: 'historia', name: 'Historia', icon: '📜', color: 'bg-amber-500', description: 'Viaja a través del tiempo y descubre los eventos que forjaron el mundo.' },
  { id: 'ciencia', name: 'Ciencia', icon: '🧪', color: 'bg-blue-500', description: 'Explora los misterios del universo, la física y la biología.' },
  { id: 'geografia', name: 'Geografía', icon: '🌍', color: 'bg-emerald-500', description: 'Domina el mapa mundial, capitales, relieves y culturas.' },
  { id: 'arte', name: 'Arte', icon: '🎨', color: 'bg-pink-500', description: 'Sumérgete en la creatividad, la pintura, la música y la literatura.' },
  { id: 'tecnologia', name: 'Tecnología', icon: '💻', color: 'bg-indigo-500', description: 'El futuro es ahora. Hardware, software y la era digital.' },
  { id: 'deportes', name: 'Deportes', icon: '⚽', color: 'bg-orange-500', description: 'Pasión y gloria. Atletas, récords y la historia del deporte.' },
];

const STUDY_LEVELS: StudyLevel[] = ['Inicial', 'Secundario', 'Universidad', 'Master'];

// --- COMPONENTS ---

const FloatingParticles = () => {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden touch-none z-0">
      {[...Array(20)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-1 h-1 bg-white/20 rounded-full"
          initial={{ 
            x: Math.random() * 100 + "%", 
            y: Math.random() * 100 + "%",
            opacity: Math.random() * 0.5
          }}
          animate={{ 
            y: [null, "-100%"],
            opacity: [0, 0.5, 0]
          }}
          transition={{ 
            duration: Math.random() * 10 + 10, 
            repeat: Infinity, 
            ease: "linear",
            delay: Math.random() * 10
          }}
        />
      ))}
    </div>
  );
};

const RunicPanel: React.FC<{ children: React.ReactNode; className?: string; glow?: 'cyan' | 'gold' | 'purple' }> = ({ children, className, glow = 'cyan' }) => (
  <div className={cn(
    "runic-border rounded-[2rem] p-6",
    glow === 'cyan' && "runic-glow-cyan",
    glow === 'gold' && "runic-glow-gold",
    glow === 'purple' && "runic-glow-purple",
    className
  )}>
    {children}
  </div>
);

const Card3D: React.FC<{ 
  card?: ArenaCollectible;
  category?: typeof CATEGORIES[0]; 
  onSelect?: () => void;
  isRevealed?: boolean;
  isHighStreak?: boolean;
  className?: string;
  disabled?: boolean;
}> = ({ card, category, onSelect, isRevealed, isHighStreak, className, disabled }) => {
  const rarity = card?.rarity || (isHighStreak ? 'Fuego' : 'Bronce');
  
  const rarityClass = cn(
    rarity === 'Bronce' && "card-common",
    rarity === 'Plata' && "card-uncommon",
    rarity === 'Oro' && "card-rare",
    rarity === 'Fuego' && "card-mythic fire-active-border"
  );

  return (
    <motion.div
      className={cn(
        "relative w-full aspect-[2/3] cursor-pointer perspective-1000", 
        disabled && "pointer-events-none opacity-20 grayscale",
        className
      )}
      whileHover={!disabled ? { scale: 1.05, rotateY: 5 } : {}}
      whileTap={!disabled ? { scale: 0.95 } : {}}
      onClick={onSelect}
    >
      <motion.div
        className="w-full h-full relative preserve-3d transition-all duration-700"
        animate={{ rotateY: isRevealed ? 180 : 0 }}
      >
        {/* Front (Face Down) */}
        <div className="absolute inset-0 backface-hidden bg-slate-900 rounded-2xl border-4 border-slate-700 flex items-center justify-center shadow-2xl overflow-hidden">
          <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-purple-600/10" />
          <div className="relative z-10 flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center border-2 border-slate-600 shadow-inner">
              <Gamepad2 className="text-slate-500" size={32} />
            </div>
            <span className="text-slate-500 font-black tracking-[0.3em] uppercase text-[10px]">Sanctuary</span>
          </div>
          {/* Runic corners */}
          <div className="absolute top-2 left-2 text-slate-700 text-xs">ᚱ</div>
          <div className="absolute top-2 right-2 text-slate-700 text-xs">ᚦ</div>
          <div className="absolute bottom-2 left-2 text-slate-700 text-xs">ᚠ</div>
          <div className="absolute bottom-2 right-2 text-slate-700 text-xs">ᚢ</div>
        </div>

        {/* Back (Face Up) */}
        <div 
          className={cn(
            "absolute inset-0 backface-hidden rotate-y-180 rounded-2xl border-4 flex flex-col shadow-2xl overflow-hidden",
            rarityClass
          )}
        >
          {card ? (
            <>
              <img src={card.imageUrl} alt={card.name} className="w-full h-1/2 object-cover border-b-2 border-inherit" referrerPolicy="no-referrer" />
              <div className="flex-1 p-3 bg-slate-900/90 flex flex-col gap-1">
                <div className="flex justify-between items-start">
                  <h4 className="text-[10px] font-black uppercase text-white leading-tight">{card.name}</h4>
                  <span className="text-[8px] font-bold text-slate-400 uppercase">{card.rarity}</span>
                </div>
                <p className="text-[8px] text-slate-300 leading-tight mt-1 italic">"{card.description}"</p>
              </div>
            </>
          ) : category ? (
            <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-slate-900 relative">
              <div className={cn("absolute inset-0 opacity-20", category.color)} />
              <div className="relative z-10 flex flex-col items-center">
                <span className="text-6xl mb-6 drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]">{category.icon}</span>
                <h3 className="text-2xl font-black text-white uppercase tracking-tighter mb-2">{category.name}</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-tight px-2">
                  {category.description}
                </p>
                {isHighStreak && (
                  <div className="mt-4 flex items-center gap-2 px-3 py-1 bg-orange-500 rounded-full shadow-[0_0_15px_rgba(249,115,22,0.5)]">
                    <Flame size={12} className="text-white fill-white" />
                    <span className="text-[8px] font-black text-white uppercase">Racha de Fuego</span>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </motion.div>
    </motion.div>
  );
};

const ResponseButton: React.FC<{
  index: number;
  label: string;
  text: string;
  color: string;
  shadowColor: string;
  disabled: boolean;
  onClick: () => void;
  feedback: { correct: boolean; index: number } | null;
  correctIndex: number;
}> = ({ index, label, text, color, shadowColor, disabled, onClick, feedback, correctIndex }) => {
  const isSelected = feedback?.index === index;
  const isCorrect = correctIndex === index;
  
  let finalColor = color;
  let finalShadow = shadowColor;

  if (feedback) {
    if (isCorrect) {
      finalColor = 'bg-emerald-500';
      finalShadow = '#065f46';
    } else if (isSelected) {
      finalColor = 'bg-red-500';
      finalShadow = '#991b1b';
    } else {
      finalColor = 'bg-slate-800 opacity-50';
      finalShadow = '#1e293b';
    }
  }

  return (
    <button
      disabled={disabled}
      onClick={onClick}
      style={{ '--shadow-color': finalShadow } as any}
      className={cn(
        "btn-3d btn-fire-flash w-full min-h-[65px] flex items-center gap-4 px-6 rounded-2xl text-white font-bold text-lg transition-all",
        finalColor
      )}
    >
      <span className="w-10 h-10 rounded-xl bg-black/20 flex items-center justify-center text-xl font-black">
        {label}
      </span>
      <span className="flex-1 text-left leading-tight">{text}</span>
      {feedback && isCorrect && <CheckCircle2 className="text-white" />}
      {feedback && isSelected && !isCorrect && <X className="text-white" />}
    </button>
  );
};

const SkeletonQuestion = () => (
  <div className="space-y-8 animate-vibrate">
    <div className="h-32 bg-slate-800/50 rounded-3xl border-2 border-slate-700/50 flex items-center justify-center p-8">
      <div className="w-full space-y-3">
        <div className="h-4 bg-slate-700/50 rounded-full w-3/4 mx-auto" />
        <div className="h-4 bg-slate-700/50 rounded-full w-1/2 mx-auto" />
      </div>
    </div>
    <div className="grid grid-cols-1 gap-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-20 bg-slate-800/50 rounded-2xl border-2 border-slate-700/50 flex items-center px-6 gap-4">
          <div className="w-10 h-10 bg-slate-700/50 rounded-xl" />
          <div className="flex-1 h-3 bg-slate-700/50 rounded-full" />
        </div>
      ))}
    </div>
  </div>
);

interface ArenaViewProps {
  onExit?: () => void;
}

export const ArenaView: React.FC<ArenaViewProps> = ({ onExit }) => {
  const { user, userProfile, logout } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [gameState, setGameState] = useState<'lobby' | 'selecting' | 'playing' | 'gameover' | 'cooldown'>('lobby');
  const [stats, setStats] = useState<ArenaUserStats | null>(null);
  const [questions, setQuestions] = useState<ArenaQuestion[]>([]);
  const [nextQuestionBuffer, setNextQuestionBuffer] = useState<ArenaQuestion[]>([]);
  const [bufferCategory, setBufferCategory] = useState<string | null>(null);
  const [isPrefetching, setIsPrefetching] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<typeof CATEGORIES[0] | null>(null);
  const [selectedLevel, setSelectedLevel] = useState<StudyLevel>('Secundario');
  const [rankings, setRankings] = useState<Record<StudyLevel, ArenaRankingEntry[]>>({
    'Inicial': [],
    'Secundario': [],
    'Universidad': [],
    'Master': []
  });
  const [kings, setKings] = useState<Record<StudyLevel, ArenaRankingEntry | null>>({
    'Inicial': null,
    'Secundario': null,
    'Universidad': null,
    'Master': null
  });
  const [collectibles, setCollectibles] = useState<ArenaCollectible[]>([]);
  const [randomCategories, setRandomCategories] = useState<typeof CATEGORIES>([]);
  const [revealedCardIndex, setRevealedCardIndex] = useState<number | null>(null);
  const [timer, setTimer] = useState(30);
  const [isAnswering, setIsAnswering] = useState(false);
  const [answerFeedback, setAnswerFeedback] = useState<{ correct: boolean; index: number } | null>(null);
  const [cooldownTime, setCooldownTime] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'arena' | 'ranking' | 'collection' | 'kings'>('arena');

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (user) {
      loadData();
      preloadNextQuestion(selectedLevel);
    }
  }, [user]);

  const preloadNextQuestion = async (level: StudyLevel, categoryId?: string) => {
    if (isPrefetching) return;
    setIsPrefetching(true);
    try {
      const catId = categoryId || CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)].id;
      const q = await getQuestionsForArena(catId, level);
      setNextQuestionBuffer(q);
      setBufferCategory(catId);
    } catch (error) {
      console.error("Error prefetching questions:", error);
    } finally {
      setIsPrefetching(false);
    }
  };

  useEffect(() => {
    if (gameState === 'playing' && !isAnswering) {
      startTimer();
    } else {
      stopTimer();
    }
    return () => stopTimer();
  }, [gameState, currentQuestionIndex, isAnswering]);

  useEffect(() => {
    if (stats?.lives === 0 && stats?.cooldownUntil) {
      const interval = setInterval(() => {
        const now = new Date();
        const until = stats.cooldownUntil.toDate ? stats.cooldownUntil.toDate() : new Date(stats.cooldownUntil);
        const diff = until.getTime() - now.getTime();
        
        if (diff <= 0) {
          clearInterval(interval);
          loadData(); // Refresh to restore lives
        } else {
          const hours = Math.floor(diff / (1000 * 60 * 60));
          const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
          const seconds = Math.floor((diff % (1000 * 60)) / 1000);
          setCooldownTime(`${hours}h ${minutes}m ${seconds}s`);
        }
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [stats]);

  const loadData = async () => {
    if (!user) return;
    const [userStats, topKings, userCollectibles] = await Promise.all([
      getArenaUserStats(user.uid),
      getKings(),
      getUserCollectibles(user.uid)
    ]);
    setStats(userStats);
    setKings(topKings);
    setCollectibles(userCollectibles.length > 0 ? userCollectibles : INITIAL_CARDS);

    // Load rankings for current level
    const topRankings = await getTopRankings(selectedLevel);
    setRankings(prev => ({ ...prev, [selectedLevel]: topRankings }));

    if (userStats.lives === 0) {
      setGameState('cooldown');
    }
  };

  const startTimer = () => {
    setTimer(30);
    timerRef.current = setInterval(() => {
      setTimer(prev => {
        if (prev <= 1) {
          handleAnswer(-1); // Time's up
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const handleStartGame = () => {
    if (stats?.lives === 0) {
      setGameState('cooldown');
      return;
    }
    // Pick 3 random categories
    const shuffled = [...CATEGORIES].sort(() => Math.random() - 0.5);
    setRandomCategories(shuffled.slice(0, 3));
    setGameState('selecting');
    setRevealedCardIndex(null);
  };

  const handleSelectCategory = async (index: number) => {
    if (revealedCardIndex !== null) return;
    
    setRevealedCardIndex(index);
    const category = randomCategories[index];
    setSelectedCategory(category);

    setTimeout(async () => {
      if (nextQuestionBuffer.length > 0 && bufferCategory === category.id) {
        setQuestions(nextQuestionBuffer);
        setNextQuestionBuffer([]);
        setBufferCategory(null);
        setCurrentQuestionIndex(0);
        setGameState('playing');
        // Prefetch for the next batch immediately
        preloadNextQuestion(selectedLevel, category.id);
      } else {
        setQuestions([]); // Trigger skeleton
        setGameState('playing');
        const q = await getQuestionsForArena(category.id, selectedLevel);
        setQuestions(q);
        setCurrentQuestionIndex(0);
        // Prefetch for the next batch
        preloadNextQuestion(selectedLevel, category.id);
      }
    }, 1500);
  };

  const handleAnswer = async (index: number) => {
    if (isAnswering || !stats) return;
    setIsAnswering(true);
    stopTimer();

    const currentQuestion = questions[currentQuestionIndex];
    const isCorrect = index === currentQuestion.correctAnswer;
    setAnswerFeedback({ correct: isCorrect, index });

    if (isCorrect) {
      const newStreak = stats.streak + 1;
      const pointsEarned = 10 + (newStreak * 2);
      
      const newLevelPoints = { ...stats.levelPoints };
      newLevelPoints[selectedLevel] = (newLevelPoints[selectedLevel] || 0) + pointsEarned;

      const updates: Partial<ArenaUserStats> = {
        streak: newStreak,
        maxStreak: Math.max(stats.maxStreak, newStreak),
        totalPoints: stats.totalPoints + pointsEarned,
        levelPoints: newLevelPoints
      };

      await updateArenaUserStats(user!.uid, updates);
      setStats(prev => prev ? { ...prev, ...updates } : null);

      // Update ranking
      await updateRanking(
        user!.uid, 
        userProfile?.displayName || user!.displayName || 'Estudiante',
        userProfile?.photoURL || user!.photoURL || '',
        newLevelPoints[selectedLevel],
        selectedLevel
      );

      // Check for collectible
      if (newStreak === 15 || newStreak === 25 || newStreak === 35 || newStreak === 50) {
        const collectible = await dropCollectible(user!.uid, newStreak);
        if (collectible) {
          toast.success(`¡Has ganado una carta coleccionable: ${collectible.rarity}!`, {
            description: "Revisa tu álbum para verla.",
            icon: <Award className="text-yellow-500" />
          });
        }
      }

      setTimeout(() => {
        setIsAnswering(false);
        setAnswerFeedback(null);
        
        // Return to selection after EACH correct answer to choose a new topic
        const shuffled = [...CATEGORIES].sort(() => Math.random() - 0.5);
        setRandomCategories(shuffled.slice(0, 3));
        setGameState('selecting');
        setRevealedCardIndex(null);
        setQuestions([]); // Clear old question to avoid overlap
        setCurrentQuestionIndex(0);
      }, 1500);

    } else {
      // Wrong answer
      const newLives = Math.max(0, stats.lives - 1);
      const updates: Partial<ArenaUserStats> = {
        lives: newLives,
        streak: 0,
        lastLifeLostAt: new Date().toISOString()
      };

      if (newLives === 0) {
        // 3 hour cooldown
        const cooldownDate = new Date();
        cooldownDate.setHours(cooldownDate.getHours() + 3);
        updates.cooldownUntil = cooldownDate.toISOString();
      }

      await updateArenaUserStats(user!.uid, updates);
      setStats(prev => prev ? { ...prev, ...updates } : null);

      setTimeout(() => {
        setIsAnswering(false);
        setAnswerFeedback(null);
        if (newLives === 0) {
          setGameState('gameover');
        } else {
          // Continue to next question if lives > 0
          if (currentQuestionIndex < questions.length - 1) {
            setCurrentQuestionIndex(prev => prev + 1);
          } else {
            handleStartGame();
          }
        }
      }, 2000);
    }
  };

  const handleBypassCooldown = async () => {
    if (!user || !stats) return;
    
    try {
      // Check if user is VIP or has credits
      // For now, let's assume they need 1 credit
      await consumeCredit(user.uid);
      
      const updates: Partial<ArenaUserStats> = {
        lives: 3,
        cooldownUntil: null
      };
      await updateArenaUserStats(user.uid, updates);
      setStats(prev => prev ? { ...prev, ...updates } : null);
      setGameState('lobby');
      toast.success("¡Vidas restauradas!");
    } catch (error) {
      toast.error("No tienes suficientes créditos para saltar el tiempo de espera.");
    }
  };

  const currentQuestion = questions[currentQuestionIndex];

  return (
    <div className="arena-section lg:relative lg:inset-auto fixed inset-0 h-screen w-screen lg:w-full lg:h-full arena-bg-gradient text-white overflow-hidden flex flex-col max-w-[100vw] overflow-x-hidden lg:touch-auto lg:select-auto touch-none select-none z-20 lg:mt-0">
      <FloatingParticles />

      {/* Immersive Mobile Menu Button */}
      <div className="lg:hidden fixed top-4 right-4 z-[90]">
        <button 
          onClick={() => setIsMenuOpen(true)}
          className="w-10 h-10 bg-slate-900/80 backdrop-blur-xl border-2 border-white/10 rounded-xl flex items-center justify-center shadow-2xl text-white active:scale-90 transition-transform"
        >
          <Menu size={20} />
        </button>
      </div>

      {/* Menu Overlay */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-2xl flex flex-col items-center justify-center p-8"
          >
            <button 
              onClick={() => setIsMenuOpen(false)}
              className="absolute top-6 right-6 w-12 h-12 bg-white/5 rounded-full flex items-center justify-center text-white hover:bg-white/10 transition-colors"
            >
              <X size={24} />
            </button>

            <div className="w-full lg:max-w-xs space-y-6">
              <div className="text-center mb-12">
                <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-cyan-500 to-purple-600 mx-auto mb-4 flex items-center justify-center shadow-2xl border-4 border-white/10">
                  <Gamepad2 size={48} className="text-white" />
                </div>
                <h2 className="text-2xl font-black uppercase italic tracking-tighter">Arena Menu</h2>
              </div>

              <button 
                onClick={() => {
                  onExit?.();
                  setIsMenuOpen(false);
                }}
                className="w-full py-4 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/10 flex items-center gap-4 px-6 transition-all group"
              >
                <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center text-cyan-400 group-hover:scale-110 transition-transform">
                  <User size={20} />
                </div>
                <span className="font-black uppercase tracking-widest text-sm">Mi Perfil</span>
              </button>

              <button 
                onClick={() => {
                  onExit?.();
                  setIsMenuOpen(false);
                }}
                className="w-full py-4 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/10 flex items-center gap-4 px-6 transition-all group"
              >
                <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center text-purple-400 group-hover:scale-110 transition-transform">
                  <Settings size={20} />
                </div>
                <span className="font-black uppercase tracking-widest text-sm">Ajustes</span>
              </button>

              <div className="h-px bg-white/5 my-2" />

              <button 
                onClick={() => {
                  onExit?.();
                  setIsMenuOpen(false);
                }}
                className="w-full py-4 bg-red-500/10 hover:bg-red-500/20 rounded-2xl border border-red-500/20 flex items-center gap-4 px-6 transition-all group"
              >
                <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center text-red-400 group-hover:scale-110 transition-transform">
                  <LogOut size={20} />
                </div>
                <span className="font-black uppercase tracking-widest text-sm text-red-400">Salir de Arena</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header / Stats Bar */}
      <header className="flex-none z-50 bg-slate-950/80 backdrop-blur-xl border-b-4 border-slate-800 p-4 lg:block hidden">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 md:gap-6">
            <div className="relative group hidden md:block">
              <div className="absolute -inset-2 bg-yellow-500/20 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
              <img src="https://picsum.photos/seed/griffin/100/100" className="w-12 h-12 rounded-xl border-2 border-yellow-500/50 shadow-lg" alt="Griffin" />
            </div>
            
            <div className="flex flex-col">
              <h1 className="text-xl md:text-3xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-yellow-400 to-orange-600 uppercase">
                Arena Sanctuary
              </h1>
              <div className="flex items-center gap-3 text-[8px] md:text-[10px] font-black uppercase text-white/40">
                <span><span className="hidden sm:inline">Usuario: </span><span className="text-white">{userProfile?.displayName?.split(' ')[0] || 'Agustín'}</span></span>
                <span className="w-1 h-1 bg-white/20 rounded-full" />
                <span><span className="hidden sm:inline">Nivel: </span><span className="text-cyan-400">{selectedLevel}</span></span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 md:gap-8">
            <div className="flex items-center gap-1 md:gap-2">
              <p className="text-[8px] md:text-[10px] font-black uppercase text-white/40 mr-1 hidden sm:block">VIDAS:</p>
              <div className="flex gap-0.5 md:gap-1">
                {[...Array(3)].map((_, i) => (
                  <motion.span 
                    key={i}
                    animate={i < (stats?.lives || 0) ? { scale: [1, 1.2, 1] } : { opacity: 0.2, scale: 0.8 }}
                    className="text-lg md:text-2xl"
                  >
                    ❤️
                  </motion.span>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 md:gap-4 bg-slate-900/80 px-2 md:px-4 py-1 md:py-2 rounded-xl md:rounded-2xl border-2 border-white/10 shadow-inner">
              <div className="flex items-center gap-1 md:gap-2">
                <Zap className="text-yellow-400 fill-yellow-400 w-3 h-3 md:w-4 md:h-4" />
                <span className="font-black text-xs md:text-sm">{stats?.totalPoints || 0}</span>
              </div>
              <div className="w-px h-3 md:h-4 bg-white/10" />
              <div className={cn("flex items-center gap-1 md:gap-2", stats && stats.streak >= 5 && "fire-active-border px-1 md:px-2 py-0.5 md:py-1 rounded-lg")}>
                <Flame className={cn("w-3 h-3 md:w-4 md:h-4", stats?.streak === 0 ? "text-orange-500 opacity-20" : "text-orange-500 fill-orange-500")} />
                <span className="font-black text-xs md:text-sm">{stats?.streak || 0}</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Immersive Mobile Stats (Top of screen) */}
      <div className="lg:hidden flex items-center justify-between px-4 pt-4 pb-2 z-40">
        <div className="flex items-center gap-1">
          {[...Array(3)].map((_, i) => (
            <motion.span 
              key={i}
              animate={i < (stats?.lives || 0) ? { scale: [1, 1.2, 1] } : { opacity: 0.2, scale: 0.8 }}
              className="text-xl"
            >
              ❤️
            </motion.span>
          ))}
        </div>

        <div className="flex items-center gap-3 bg-slate-900/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
          <div className="flex items-center gap-1.5">
            <Zap className="text-yellow-400 fill-yellow-400 w-3.5 h-3.5" />
            <span className="font-black text-xs">{stats?.totalPoints || 0}</span>
          </div>
          <div className="w-px h-3 bg-white/10" />
          <div className="flex items-center gap-1.5">
            <Flame className={cn("w-3.5 h-3.5", stats?.streak === 0 ? "text-orange-500 opacity-20" : "text-orange-500 fill-orange-500")} />
            <span className="font-black text-xs">{stats?.streak || 0}</span>
          </div>
        </div>
      </div>

      <main className="flex-1 w-full p-2 md:p-4 lg:p-5 relative flex flex-col pt-4 lg:pt-[20px] h-auto lg:h-auto lg:flex lg:justify-start lg:items-start lg:w-full overflow-y-auto lg:overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-8 h-full items-start w-full max-w-[1600px] mx-auto">
          
          {/* Mobile View Logic: Only show active tab */}
          {/* Desktop View Logic: Show all columns */}

          {/* Left Column: User Profile & Album (Collection Tab on Mobile) */}
          <div className={cn(
            "lg:col-span-3 flex flex-col gap-6 h-full items-center lg:items-stretch",
            activeTab === 'collection' ? "flex" : "hidden lg:flex"
          )}>
            <RunicPanel glow="purple" className="flex-none flex flex-col items-center text-center w-full lg:max-w-md mx-auto lg:mx-0">
              <div className="relative mb-4">
                <img 
                  src={userProfile?.photoURL || user?.photoURL || "https://lh3.googleusercontent.com/a/default-user"} 
                  alt="Profile" 
                  className="w-16 h-16 md:w-20 md:h-20 rounded-full border-4 border-purple-500 object-cover shadow-2xl"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute -bottom-1 -right-1 bg-purple-600 p-1.5 rounded-lg shadow-lg border border-white/20">
                  <Trophy size={14} />
                </div>
              </div>
              <h2 className="text-base md:text-lg font-black mb-1 text-white">{userProfile?.displayName || user?.displayName || 'Estudiante'}</h2>
              <p className="text-purple-400 text-[10px] uppercase tracking-widest font-black mb-4 md:mb-6">{selectedLevel}</p>
              
              <div className="w-full space-y-3">
                <div className="flex justify-between text-[10px] font-black">
                  <span className="text-white/40 uppercase">Mejor Racha</span>
                  <span className="text-orange-500">{stats?.maxStreak || 0} 🔥</span>
                </div>
                <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden border border-white/5">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, (stats?.maxStreak || 0) * 2)}%` }}
                    className="h-full bg-gradient-to-r from-orange-600 to-yellow-500" 
                  />
                </div>
              </div>
            </RunicPanel>

            <RunicPanel glow="cyan" className="flex-1 flex flex-col overflow-hidden w-full lg:max-w-md mx-auto lg:mx-0 lg:max-h-[75vh]">
              <div className="flex items-center justify-between mb-4 flex-none">
                <h3 className="text-xs font-black uppercase tracking-widest flex items-center gap-2 text-cyan-400">
                  <LayoutGrid size={14} />
                  Mi Álbum
                </h3>
                <span className="text-[10px] font-black text-white/40">{collectibles.length} / 50</span>
              </div>
              
              <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-3 pb-4">
                  {collectibles.length > 0 ? collectibles.map(card => (
                    <Card3D 
                      key={card.id}
                      card={card}
                      className="aspect-[2/3]"
                    />
                  )) : (
                    <div className="col-span-full flex flex-col items-center justify-center py-12 text-center opacity-20">
                      <History size={40} className="mb-4" />
                      <p className="text-[10px] font-black uppercase tracking-widest">Aún no tienes cartas</p>
                    </div>
                  )}
                </div>
              </div>
            </RunicPanel>
          </div>

          {/* Center Column: Game Area (Arena Tab on Mobile) */}
          <div className={cn(
            "lg:col-span-6 flex flex-col h-full justify-center lg:justify-start items-center lg:items-start lg:self-start lg:mt-5",
            activeTab === 'arena' ? "flex" : "hidden lg:flex"
          )}>
            <AnimatePresence mode="wait">
              {gameState === 'lobby' && (
                <motion.div 
                  key="lobby"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.1 }}
                  className="flex-1 flex flex-col items-center lg:items-start justify-center text-center lg:text-left p-4 md:p-6 w-full"
                >
                  <div className="relative mb-6 md:mb-12 mx-auto lg:mx-0">
                    <motion.div 
                      animate={{ rotate: 360 }}
                      transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
                      className="absolute -inset-6 md:-inset-12 border-4 border-dashed border-cyan-500/10 rounded-full"
                    />
                    <div className="w-24 h-24 md:w-40 md:h-40 bg-gradient-to-br from-cyan-600 to-purple-700 rounded-[1.5rem] md:rounded-[2.5rem] flex items-center justify-center shadow-2xl shadow-cyan-500/20 relative z-10 border-4 border-white/10">
                      <Gamepad2 size={40} className="text-white md:hidden" />
                      <Gamepad2 size={64} className="text-white hidden md:block" />
                    </div>
                  </div>
                  
                  <h1 className="text-3xl md:text-7xl font-black mb-1 md:mb-4 tracking-tighter uppercase italic text-transparent bg-clip-text bg-gradient-to-b from-white to-slate-500 text-center lg:text-left mx-auto lg:mx-0">
                    Arena Sanctuary
                  </h1>
                  <p className="text-slate-400 max-w-md mb-4 md:mb-8 text-xs md:text-lg font-medium text-center lg:text-left mx-auto lg:mx-0">
                    El campo de batalla del conocimiento. Forja tu leyenda, colecciona rarezas y domina el ranking.
                  </p>

                  {/* Level Selector in Lobby */}
                  <div className="flex flex-wrap justify-center lg:justify-start gap-1.5 md:gap-3 mb-4 md:mb-8 w-full">
                    {STUDY_LEVELS.map(level => (
                      <button
                        key={level}
                        onClick={() => setSelectedLevel(level)}
                        className={cn(
                          "px-3 md:px-6 py-1.5 md:py-3 rounded-lg md:rounded-2xl text-[9px] md:text-xs font-black uppercase tracking-widest transition-all border-2",
                          selectedLevel === level 
                            ? "bg-cyan-500 border-cyan-400 text-white shadow-[0_0_20px_rgba(34,211,238,0.4)]" 
                            : "bg-slate-900/50 border-white/10 text-white/40 hover:border-white/20"
                        )}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                  
                  <button 
                    onClick={handleStartGame}
                    style={{ '--shadow-color': '#0e7490' } as any}
                    className="btn-3d px-8 md:px-16 py-3 md:py-6 bg-cyan-500 rounded-xl md:rounded-[2rem] font-black text-lg md:text-2xl uppercase tracking-tighter mx-auto lg:mx-0"
                  >
                    <span className="flex items-center gap-3">
                      ¡Entrar!
                      <ChevronRight size={20} className="md:w-7 md:h-7" />
                    </span>
                  </button>
                </motion.div>
              )}

              {gameState === 'selecting' && (
                <motion.div 
                  key="selecting"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex-1 flex flex-col lg:items-center items-center lg:justify-start justify-center p-4 md:p-6 w-full"
                >
                  <h2 className="text-2xl md:text-3xl font-black mb-8 md:mb-12 uppercase tracking-tight text-center text-cyan-400">Elige tu Desafío</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-12 w-full max-w-5xl justify-center items-start">
                    {randomCategories.map((cat, i) => (
                      <Card3D 
                        key={i} 
                        category={cat} 
                        onSelect={() => handleSelectCategory(i)}
                        isRevealed={revealedCardIndex === i}
                        disabled={revealedCardIndex !== null && revealedCardIndex !== i}
                        isHighStreak={stats ? stats.streak >= 10 : false}
                        className={cn(
                          "max-w-[240px] md:max-w-[280px] mx-auto",
                          revealedCardIndex !== null && revealedCardIndex !== i && "scale-90"
                        )}
                      />
                    ))}
                  </div>
                  <p className="mt-8 md:mt-12 text-white/40 font-black uppercase tracking-[0.5em] text-[10px] animate-pulse">Revela tu destino</p>
                </motion.div>
              )}

              {gameState === 'playing' && (
                <motion.div 
                  key="playing"
                  initial={{ opacity: 0, x: 50 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -50 }}
                  className="flex-1 flex flex-col h-full overflow-hidden lg:justify-start justify-center lg:max-w-2xl lg:mx-0 mx-auto w-full"
                >
                  {questions.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center">
                      <SkeletonQuestion />
                      <p className="mt-8 text-cyan-500/40 font-black uppercase tracking-[0.3em] text-xs animate-pulse">Invocando preguntas...</p>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col h-full overflow-y-auto custom-scrollbar pb-2 md:pb-4 justify-center">
                      {/* Progress & Timer */}
                      <div className="flex items-center gap-4 md:gap-6 mb-4 md:mb-6 flex-none">
                        <div className="flex-1 h-4 md:h-6 bg-slate-950 rounded-full overflow-hidden border-2 md:border-4 border-slate-800 shadow-inner relative">
                          <motion.div 
                            initial={{ width: '100%' }}
                            animate={{ width: `${(timer / 30) * 100}%` }}
                            className={cn(
                              "h-full transition-colors duration-500 relative",
                              timer < 10 ? "bg-red-500" : "bg-cyan-500"
                            )}
                          >
                            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20" />
                          </motion.div>
                        </div>
                        <div className="relative flex-none">
                          <div className="w-14 h-14 md:w-20 md:h-20 rounded-full bg-slate-900 border-4 border-slate-800 flex items-center justify-center shadow-2xl relative z-10">
                            <span className={cn("text-xl md:text-3xl font-black font-mono", timer < 10 ? "text-red-500 animate-pulse" : "text-cyan-400")}>
                              {timer}
                            </span>
                          </div>
                          <motion.div 
                            animate={{ rotate: 360 }}
                            transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                            className="absolute -inset-1.5 md:-inset-2 border-2 border-dashed border-cyan-500/30 rounded-full"
                          />
                        </div>
                      </div>

                      {/* Question Panel */}
                      <RunicPanel glow="cyan" className="flex-none flex flex-col items-center justify-center text-center mb-4 md:mb-6 relative overflow-hidden min-h-[120px] md:min-h-[180px] bg-gradient-to-b from-slate-900 to-slate-950">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-500 to-transparent opacity-50" />
                        <span className="text-cyan-500 font-black uppercase tracking-[0.4em] text-[8px] md:text-[10px] mb-4 animate-energy-pulse">Desafío {currentQuestionIndex + 1}</span>
                        <h2 className="text-xl md:text-4xl font-black leading-tight lg:max-w-2xl text-white animate-vibrate">
                          {questions[currentQuestionIndex]?.question}
                        </h2>
                      </RunicPanel>

                      {/* Answers Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-4 flex-none">
                        {[
                          { label: 'A', color: 'bg-blue-600', shadow: '#1e40af' },
                          { label: 'B', color: 'bg-purple-600', shadow: '#6b21a8' },
                          { label: 'C', color: 'bg-emerald-600', shadow: '#065f46' },
                          { label: 'D', color: 'bg-orange-600', shadow: '#9a3412' }
                        ].map((btn, i) => (
                          <ResponseButton
                            key={i}
                            index={i}
                            label={btn.label}
                            text={questions[currentQuestionIndex]?.options[i]}
                            color={btn.color}
                            shadowColor={btn.shadow}
                            disabled={isAnswering}
                            onClick={() => handleAnswer(i)}
                            feedback={answerFeedback}
                            correctIndex={questions[currentQuestionIndex]?.correctAnswer}
                          />
                        ))}
                      </div>

                      {/* Explanation */}
                      <AnimatePresence>
                        {answerFeedback && (
                          <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="p-4 md:p-6 bg-[#E0FFC1] rounded-2xl md:rounded-3xl border-4 border-emerald-500/30 text-center shadow-2xl relative overflow-hidden flex-none"
                          >
                            <div className="absolute top-2 right-4 text-emerald-600">
                              <CheckCircle2 size={20} className="md:w-6 md:h-6" />
                            </div>
                            <p className="text-xs md:text-sm text-black font-black uppercase tracking-tight mb-2">¡Correcto!</p>
                            <p className="text-xs md:text-sm text-slate-800 font-bold italic leading-relaxed">
                              {questions[currentQuestionIndex]?.explanation}
                            </p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                </motion.div>
              )}

              {gameState === 'gameover' && (
                <motion.div 
                  key="gameover"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex-1 flex flex-col lg:items-start items-center lg:justify-start justify-center text-center lg:text-left p-4 md:p-6 h-full w-full"
                >
                  <div className="w-20 h-20 md:w-24 md:h-24 bg-red-500/20 rounded-full flex items-center justify-center mb-6 md:mb-8 border-4 border-red-500/50 shadow-[0_0_30px_rgba(239,68,68,0.3)]">
                    <X size={40} className="text-red-500 md:w-12 md:h-12" />
                  </div>
                  <h2 className="text-4xl md:text-5xl font-black mb-4 uppercase italic text-red-500">¡FIN DEL JUEGO!</h2>
                  <p className="text-slate-400 mb-8 md:mb-12 text-base md:text-lg font-medium">Puntuación final: <span className="text-cyan-400 font-black">{stats?.totalPoints || 0}</span></p>
                  
                  <RunicPanel glow="purple" className="w-full max-w-md mb-8 md:mb-12">
                    <div className="flex items-center justify-center gap-4 mb-4">
                      <Clock size={28} className="text-purple-500 md:w-8 md:h-8" />
                      <span className="text-3xl md:text-4xl font-black font-mono text-white">{cooldownTime}</span>
                    </div>
                    <p className="text-[10px] text-purple-400 font-black uppercase tracking-widest">Tiempo de Regeneración</p>
                  </RunicPanel>

                  <div className="flex flex-col gap-4 w-full lg:max-w-xs">
                    <button 
                      onClick={handleBypassCooldown}
                      style={{ '--shadow-color': '#065f46' } as any}
                      className="btn-3d px-6 md:px-8 py-3 md:py-4 bg-emerald-600 rounded-xl md:rounded-2xl font-black text-base md:text-lg uppercase flex items-center justify-center gap-2"
                    >
                      <Zap size={18} className="fill-white md:w-5 md:h-5" />
                      Reintentar (1 Crédito)
                    </button>
                    <button 
                      onClick={() => setGameState('lobby')}
                      className="px-6 md:px-8 py-3 md:py-4 bg-slate-800 rounded-xl md:rounded-2xl font-black text-base md:text-lg uppercase hover:bg-slate-700 transition-all text-slate-400"
                    >
                      Ir al Inicio
                    </button>
                  </div>
                </motion.div>
              )}

              {gameState === 'cooldown' && (
                <motion.div 
                  key="cooldown"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex-1 flex flex-col lg:items-start items-center lg:justify-start justify-center text-center lg:text-left p-4 md:p-6"
                >
                  <div className="w-20 h-20 md:w-24 md:h-24 bg-cyan-500/20 rounded-full flex items-center justify-center mb-6 md:mb-8 border-4 border-cyan-500/50 shadow-[0_0_30px_rgba(34,211,238,0.3)]">
                    <Clock size={40} className="text-cyan-500 md:w-12 md:h-12" />
                  </div>
                  <h2 className="text-3xl md:text-4xl font-black mb-4 uppercase tracking-tight text-white">Santuario en Reposo</h2>
                  <p className="text-slate-400 mb-8 md:mb-12 text-base md:text-lg font-medium">Tus energías deben recargarse para el próximo combate.</p>
                  
                  <RunicPanel glow="cyan" className="w-full max-w-md mb-8 md:mb-12">
                    <div className="text-4xl md:text-5xl font-black font-mono mb-6 text-white">{cooldownTime}</div>
                    <div className="w-full h-2 md:h-3 bg-slate-800 rounded-full overflow-hidden border border-white/5">
                      <motion.div 
                        initial={{ width: '100%' }}
                        animate={{ width: '0%' }}
                        transition={{ duration: 10800 }} 
                        className="h-full bg-gradient-to-r from-cyan-600 to-blue-500" 
                      />
                    </div>
                  </RunicPanel>

                  <button 
                    onClick={handleBypassCooldown}
                    style={{ '--shadow-color': '#065f46' } as any}
                    className="btn-3d px-6 md:px-8 py-3 md:py-4 bg-emerald-600 rounded-xl md:rounded-2xl font-black text-base md:text-lg uppercase flex items-center justify-center gap-2"
                  >
                    <Zap size={18} className="fill-white md:w-5 md:h-5" />
                    Saltar Cooldown (1 Crédito)
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Right Column: Rankings & Kings (Ranking/Kings Tab on Mobile) */}
          <div className={cn(
            "lg:col-span-3 flex flex-col gap-6 h-full items-center lg:items-stretch",
            (activeTab === 'ranking' || activeTab === 'kings') ? "flex" : "hidden lg:flex"
          )}>
            <RunicPanel glow="gold" className={cn(
              "flex flex-col flex-none w-full lg:max-w-md mx-auto lg:mx-0",
              activeTab === 'kings' ? "flex" : "hidden lg:flex"
            )}>
              <h3 className="text-xs font-black uppercase tracking-widest flex items-center gap-2 mb-6 text-yellow-500">
                <Crown size={14} />
                Muro de los Reyes
              </h3>
              
              <div className="space-y-4">
                {STUDY_LEVELS.map(level => {
                  const king = kings[level];
                  return (
                    <div key={level} className="flex items-center gap-3 p-3 bg-slate-900/50 rounded-2xl border border-white/5 relative group">
                      {king ? (
                        <>
                          <div className="relative">
                            <img src={king.photoURL} alt={king.displayName} className="w-10 h-10 rounded-full border-2 border-yellow-500 object-cover shadow-lg" referrerPolicy="no-referrer" />
                            <motion.div 
                              animate={{ scale: [1, 1.2, 1] }}
                              transition={{ duration: 2, repeat: Infinity }}
                              className="absolute -top-2 -right-2 text-yellow-500"
                            >
                              <Crown size={14} className="fill-yellow-500" />
                            </motion.div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[8px] font-black uppercase text-white/40 leading-none mb-1">{level}</p>
                            <p className="text-xs font-black text-white truncate">{king.displayName}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] font-black text-yellow-500">{king.points} <span className="text-[8px]">PTS</span></p>
                          </div>
                        </>
                      ) : (
                        <div className="flex items-center gap-3 opacity-20">
                          <div className="w-10 h-10 rounded-full bg-slate-800" />
                          <div className="flex-1">
                            <p className="text-[8px] font-black uppercase leading-none mb-1">{level}</p>
                            <p className="text-xs font-bold">Vacante</p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </RunicPanel>

            <RunicPanel glow="cyan" className={cn(
              "flex-1 flex flex-col overflow-hidden w-full lg:max-w-md mx-auto lg:mx-0 lg:max-h-[60vh]",
              activeTab === 'ranking' ? "flex" : "hidden lg:flex"
            )}>
              <div className="flex items-center justify-between mb-4 flex-none">
                <h3 className="text-xs font-black uppercase tracking-widest flex items-center gap-2 text-cyan-400">
                  <TrendingUp size={14} />
                  Top 100
                </h3>
                <span className="text-[10px] font-black text-white/40 uppercase">{selectedLevel}</span>
              </div>
              
              <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-3">
                {rankings[selectedLevel].length > 0 ? rankings[selectedLevel].map((entry, i) => (
                  <div 
                    key={entry.userId}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-2xl border transition-all",
                      entry.userId === user?.uid ? "bg-cyan-600/20 border-cyan-500/50" : "bg-slate-900/50 border-white/5"
                    )}
                  >
                    <span className={cn(
                      "w-6 text-center font-black text-sm",
                      i === 0 ? "text-yellow-500" : i === 1 ? "text-slate-400" : i === 2 ? "text-orange-500" : "text-white/20"
                    )}>
                      {i + 1}
                    </span>
                    <img src={entry.photoURL} alt={entry.displayName} className="w-8 h-8 rounded-full object-cover shadow-md" referrerPolicy="no-referrer" />
                    <span className="flex-1 text-xs font-bold truncate text-slate-200">{entry.displayName}</span>
                    <span className="text-[10px] font-black text-cyan-500/60">{entry.points}</span>
                  </div>
                )) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center opacity-20">
                    <Medal size={40} className="mb-4" />
                    <p className="text-[10px] font-black uppercase tracking-widest">Sin datos</p>
                  </div>
                )}
              </div>
            </RunicPanel>
          </div>

        </div>
      </main>

      {/* Bottom Navigation (Mobile Only) */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-slate-950/95 backdrop-blur-2xl border-t-4 border-slate-800 px-6 py-3 flex items-center justify-between z-[9999] shadow-[0_-10px_30px_rgba(0,0,0,0.5)]">
        {[
          { id: 'arena', icon: Gamepad2, label: 'Arena', color: 'text-cyan-400', glow: 'shadow-[0_0_15px_rgba(34,211,238,0.5)]' },
          { id: 'ranking', icon: TrendingUp, label: 'Ranking', color: 'text-yellow-500', glow: 'shadow-[0_0_15px_rgba(234,179,8,0.5)]' },
          { id: 'collection', icon: LayoutGrid, label: 'Álbum', color: 'text-purple-400', glow: 'shadow-[0_0_15px_rgba(168,85,247,0.5)]' },
          { id: 'kings', icon: Crown, label: 'Reyes', color: 'text-orange-500', glow: 'shadow-[0_0_15px_rgba(249,115,22,0.5)]' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={cn(
              "flex flex-col items-center gap-1 transition-all relative group",
              activeTab === tab.id ? tab.color : "text-white/30 hover:text-white/50"
            )}
          >
            {activeTab === tab.id && (
              <motion.div 
                layoutId="activeTabGlow"
                className={cn("absolute -inset-2 rounded-xl opacity-20 blur-md", tab.glow)}
              />
            )}
            <tab.icon size={22} className={cn(
              "relative z-10 transition-transform",
              activeTab === tab.id ? "scale-110" : "scale-100"
            )} />
            <span className="text-[9px] font-black uppercase tracking-tighter relative z-10">{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
};
