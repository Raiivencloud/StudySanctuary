import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useScroll, useTransform, useSpring } from 'framer-motion';
import { 
  GraduationCap, 
  BrainCircuit, 
  Users, 
  Sparkles, 
  Monitor, 
  Tablet, 
  Smartphone, 
  ChevronRight, 
  CheckCircle2, 
  MapPin,
  ArrowRight,
  Flame,
  Star,
  Quote,
  X,
  Shield,
  MessageCircle,
  Github,
  Twitter,
  ExternalLink,
  Layers,
  Zap
} from 'lucide-react';
import { auth, googleProvider } from '../firebase';
import { signInWithPopup } from 'firebase/auth';

interface LandingViewProps {
  onLogin: () => void;
}

interface Subject {
  id: string;
  title: string;
  desc: string;
  icon: string;
  color: string;
  details: {
    solve: string;
    master: string;
    practice: string;
  };
}

const subjects: Subject[] = [
  { 
    id: 'math', 
    title: 'Matemáticas', 
    desc: 'Resolución paso a paso y visualización geométrica.', 
    color: '#00FFFF', 
    icon: '📐',
    details: {
      solve: 'ecuaciones complejas, cálculo y derivadas',
      master: 'la resolución lógica desde los cimientos',
      practice: 'ejercicios reales de exámenes UBA y UTN'
    }
  },
  { 
    id: 'chem', 
    title: 'Química', 
    desc: 'Simulador de reacciones y tablas periódicas dinámicas.', 
    color: '#10b981', 
    icon: '🧪',
    details: {
      solve: 'balanceo estequiométrico y enlaces moleculares',
      master: 'la tabla periódica y química orgánica',
      practice: 'laboratorios virtuales asistidos por IA'
    }
  },
  { 
    id: 'phys', 
    title: 'Física', 
    desc: 'Cálculo de magnitudes y diagramas de cuerpo libre.', 
    color: '#FACC15', 
    icon: '⚡',
    details: {
      solve: 'problemas de cinemática, dinámica y termodinámica',
      master: 'las leyes fundamentales del universo físico',
      practice: 'simulaciones de vectores y fuerzas en tiempo real'
    }
  }
];

export const LandingView: React.FC<LandingViewProps> = ({ onLogin }) => {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  
  // Testimonials Auto-Slider
  const [testimonialIndex, setTestimonialIndex] = useState(0);
  const testimonials = [
    { name: 'Mateo G.', role: 'Ingeniería UBA', quote: 'El podcast de estudio automático me salvó los finales de este cuatrimestre.' },
    { name: 'Sofía R.', role: 'Maestra Primaria', quote: 'Crear resúmenes aptos para niños me tomó segundos. Increíble.' },
    { name: 'Lucas P.', role: 'Secundaria Técnica', quote: 'La IA entiende mis apuntes a mano y los pasa a limpio perfectamente.' },
    { name: 'Elena M.', role: 'Derecho UNLP', quote: 'La organización por cursos es brutal. Ya no pierdo archivos cada vez que rindo.' }
  ];

  useEffect(() => {
    if (!showOnboarding) {
      const interval = setInterval(() => {
        setTestimonialIndex(prev => (prev + 1) % testimonials.length);
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [showOnboarding, testimonials.length]);

  const [onboardingStep, setOnboardingStep] = useState(1);
  const [onboardingData, setOnboardingData] = useState({
    role: '',
    country: 'Argentina',
  });

  const containerRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"]
  });

  // Smooth springs for high-end Parallax (60 FPS)
  const smoothProgress = useSpring(scrollYProgress, { stiffness: 100, damping: 30, restDelta: 0.001 });

  const galaxyY = useTransform(smoothProgress, [0, 1], ["0%", "-15%"]);
  const starsY = useTransform(smoothProgress, [0, 1], ["0%", "-30%"]);
  const galaxyOpacity = useTransform(smoothProgress, [0, 0.1, 0.9, 1], [0.7, 1, 1, 0.5]);
  
  const tabletY = useTransform(smoothProgress, [0.15, 0.5], [400, -300]);
  const laptopY = useTransform(smoothProgress, [0.15, 0.5], [200, -150]);
  const mobileY = useTransform(smoothProgress, [0.15, 0.5], [600, -450]);
  
  const devicesOpacity = useTransform(smoothProgress, [0.15, 0.25, 0.45, 0.5], [0, 1, 1, 0]);

  const handleStartOnboarding = () => {
    setShowOnboarding(true);
  };

  const handleNextStep = () => {
    if (onboardingStep < 4) {
      setOnboardingStep(prev => prev + 1);
    } else {
      handleGoogleLogin();
    }
  };

  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      if (err.code === 'auth/popup-closed-by-user') {
        console.log("Login cancelado por el usuario.");
        return;
      }
      console.error("Error en login:", err);
    }
  };

  // Onboarding Steps Redefined
  const StepRoles = () => (
    <div className="space-y-12 text-center max-w-5xl mx-auto px-4">
      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
        <span className="px-5 py-2 rounded-full bg-primary/10 border border-primary/30 text-primary text-xs font-black tracking-[0.3em] uppercase">Iniciar Secuencia</span>
        <h2 className="text-5xl md:text-7xl font-black text-white tracking-tighter">¿Cuál es tu dimensión?</h2>
      </motion.div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {[
          { id: 'alumno', title: 'SOY ALUMNO', desc: 'Maximiza tu IQ con asistencia IA de última generación.', icon: GraduationCap, color: 'primary' },
          { id: 'maestro', title: 'SOY MAESTRO', desc: 'Automatización total de contenidos y correcciones.', icon: Users, color: 'secondary' }
        ].map((role) => (
          <motion.button
            key={role.id}
            whileHover={{ scale: 1.05, rotateZ: role.id === 'alumno' ? -1 : 1 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              setOnboardingData(prev => ({ ...prev, role: role.id }));
              handleNextStep();
            }}
            className="p-12 rounded-[3rem] border border-white/5 bg-white/5 text-left transition-all relative overflow-hidden group hover:border-primary/50 hover:bg-white/10"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-8 bg-white/5 group-hover:bg-primary group-hover:text-black transition-all">
              <role.icon size={32} />
            </div>
            <h3 className="text-3xl font-black text-white mb-4 italic tracking-tight">{role.title}</h3>
            <p className="text-white/40 text-lg leading-relaxed">{role.desc}</p>
          </motion.button>
        ))}
      </div>
    </div>
  );

  const StepContrast = () => (
    <div className="space-y-12 max-w-7xl mx-auto w-full px-6">
      <div className="text-center space-y-4">
        <span className="px-5 py-2 rounded-full bg-primary/10 border border-primary/30 text-primary text-xs font-black tracking-[0.3em] uppercase">Visualización de Datos</span>
        <h2 className="text-5xl md:text-7xl font-black text-white tracking-tighter">Tu evolución definitiva</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 h-[550px]">
        <div className="rounded-[3rem] bg-black/80 border border-white/5 p-12 flex flex-col justify-center gap-6 grayscale opacity-30 relative overflow-hidden group">
           <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20" />
           <h3 className="text-3xl font-black uppercase tracking-widest text-red-500/50 italic">Estudio Analógico</h3>
           <div className="space-y-4">
             <div className="h-3 w-3/4 bg-white/5 rounded-full" />
             <div className="h-3 w-1/2 bg-white/5 rounded-full" />
             <div className="h-40 w-full border border-dashed border-white/10 rounded-3xl" />
           </div>
           <p className="text-white/20 font-bold italic">Caos, olvido y estrés acumulado.</p>
        </div>
        <div className="rounded-[3rem] bg-primary/5 border-2 border-primary/20 p-12 flex flex-col justify-center gap-6 relative overflow-hidden group animate-neon-cyan">
           <div className="absolute inset-0 bg-primary/5 blur-3xl" />
           <h3 className="text-3xl font-black uppercase tracking-widest text-primary relative z-10 italic">StudySanctuary v4</h3>
           <motion.div 
             initial={{ x: -20, opacity: 0 }} 
             animate={{ x: 0, opacity: 1 }} 
             className="p-6 rounded-3xl bg-white/5 border border-white/10 relative z-10 space-y-4"
           >
             <div className="flex items-center gap-3">
               <Zap className="text-yellow-400 fill-yellow-400" size={24} />
               <div className="h-3 w-1/2 bg-primary/40 rounded-full" />
             </div>
             <div className="flex items-center gap-3">
               <Sparkles className="text-primary" size={24} />
               <div className="h-3 w-2/3 bg-white/10 rounded-full" />
             </div>
           </motion.div>
           <p className="text-primary font-bold italic relative z-10">Paz mental, flujo cuántico y éxito total.</p>
           <button onClick={handleNextStep} className="mt-8 px-10 py-5 bg-primary text-black font-black rounded-2xl relative z-10 hover:scale-105 transition-transform active:scale-95 uppercase tracking-widest">INGRESAR AL FLUJO</button>
        </div>
      </div>
    </div>
  );

  const StepCountry = () => (
    <div className="text-center space-y-12 max-w-4xl mx-auto px-4">
      <div className="space-y-4">
        <span className="px-5 py-2 rounded-full bg-primary/10 border border-primary/30 text-primary text-xs font-black tracking-[0.3em] uppercase">Contextualización</span>
        <h2 className="text-5xl md:text-7xl font-black text-white tracking-tighter">Contenido Nivel Nación</h2>
      </div>
      <div className="flex flex-col items-center gap-8 py-10">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="absolute w-64 h-64 border border-primary/10 rounded-full"
        />
        <div className="text-9xl p-12 bg-white/5 rounded-full border-2 border-primary/20 shadow-[0_0_100px_rgba(34,211,238,0.1)] relative z-10">🇦🇷</div>
        <div className="space-y-2">
          <h3 className="text-4xl font-black text-white italic tracking-tight">Argentina</h3>
          <p className="text-primary font-bold uppercase tracking-[0.3em] text-xs">UBA • UTN • UNLP • Secundaria</p>
        </div>
        <p className="text-white/40 max-w-md text-lg italic leading-relaxed">
          Algoritmos adaptados específicamente a los sistemas de ingreso y exámenes de las universidades argentinas más exigentes.
        </p>
        <button onClick={handleNextStep} className="px-14 py-6 bg-white text-black font-black rounded-[2rem] hover:bg-primary transition-all uppercase tracking-widest text-lg shadow-xl">Confirmar Región</button>
      </div>
    </div>
  );

  const StepPortal = () => (
    <div className="text-center space-y-16 relative">
      <motion.div 
        animate={{ 
          scale: [1, 1.5, 1], 
          opacity: [0.3, 0.6, 0.3],
          rotate: [0, 180, 360]
        }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        className="w-[600px] h-[600px] bg-primary/20 rounded-full blur-[120px] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
      />
      <div className="relative z-10 space-y-10">
        <div className="space-y-2">
          <span className="text-primary font-black uppercase tracking-[0.5em] text-xs">Protocolo de Acceso</span>
          <h2 className="text-7xl md:text-[9rem] font-black text-white leading-none tracking-tighter italic">SANTUARIO</h2>
        </div>
        <p className="text-white/40 text-2xl font-medium max-w-xl mx-auto italic">
          Tu portal al conocimiento infinito ha sido calibrado. Prepárate para el despegue.
        </p>
        <div className="pt-10">
          <button 
            onClick={handleGoogleLogin} 
            className="px-20 py-10 bg-primary text-black font-black text-3xl rounded-[3rem] shadow-[0_0_100px_rgba(0,255,255,0.5)] hover:scale-105 transition-all animate-neon-cyan uppercase tracking-tighter group flex items-center gap-4 mx-auto"
          >
            DESPEGAR AHORA <ChevronRight size={40} className="group-hover:translate-x-2 transition-transform" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div 
      ref={containerRef} 
      className="min-h-screen w-full bg-[#000000] text-[#E5E7EB] font-headline selection:bg-primary selection:text-black relative"
    >
      
      {/* Immersive Galaxy Background Multi-Layer Parallax */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <motion.div 
          style={{ y: galaxyY, opacity: galaxyOpacity }}
          className="absolute inset-0"
        >
          <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1462331940025-496dfbfc7564?q=80&w=2022&auto=format&fit=crop')] bg-cover bg-center mix-blend-screen opacity-40 grayscale-[0.2]" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#000000] via-transparent to-[#000000]" />
        </motion.div>
        
        {/* Secondary Cosmic Layer (Stars) */}
        <motion.div 
          style={{ y: starsY }}
          className="absolute inset-0 opacity-60"
        >
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-40" />
        </motion.div>
      </div>

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-[100] px-8 py-8 flex items-center justify-between backdrop-blur-3xl bg-black/40 border-b border-white/5">
        <div className="flex items-center gap-4 group cursor-pointer">
          <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center text-black font-black text-2xl shadow-[0_0_30px_rgba(0,255,255,0.4)] group-hover:rotate-12 transition-transform">S</div>
          <span className="text-2xl font-black tracking-tighter text-white group-hover:text-primary transition-colors">StudySanctuary</span>
        </div>
        <div className="flex items-center gap-10">
          <button onClick={handleGoogleLogin} className="text-sm font-black text-white/40 hover:text-white transition-colors uppercase tracking-[0.2em] hidden md:block">Log In</button>
          <button 
            onClick={handleStartOnboarding}
            className="px-8 py-3 bg-white text-black font-black text-sm rounded-2xl hover:bg-primary transition-all active:scale-95 uppercase tracking-widest shadow-xl"
          >
            Empezar Gratis
          </button>
        </div>
      </nav>

      {showOnboarding ? (
        <div className="min-h-screen flex items-center justify-center p-6 relative z-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={onboardingStep}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              transition={{ type: "spring", stiffness: 100, damping: 20 }}
              className="w-full flex items-center justify-center pt-24"
            >
              {onboardingStep === 1 && <StepRoles />}
              {onboardingStep === 2 && <StepContrast />}
              {onboardingStep === 3 && <StepCountry />}
              {onboardingStep === 4 && <StepPortal />}
            </motion.div>
          </AnimatePresence>
        </div>
      ) : (
        <>
          {/* Section Hero: Spatial Gradient and Neon Pulse */}
          <section className="relative pt-60 pb-40 min-h-screen flex flex-col items-center justify-center px-6 text-center">
             
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
              className="max-w-6xl space-y-16 relative z-10"
            >
              <div className="inline-flex items-center gap-3 px-6 py-2.5 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-black tracking-[0.4em] uppercase animate-neon-cyan">
                Experiencia Multiverso • v4.0.2
              </div>
              
              <h1 className="text-7xl md:text-9xl lg:text-[10rem] font-black tracking-tighter text-white leading-[0.85] italic">
                Domina tus <br />
                <span className="bg-gradient-to-r from-primary via-yellow-400 to-primary bg-clip-text text-transparent bg-shimmer underline decoration-white/5">estudios 2x</span> 
                más rápido
              </h1>

              <p className="max-w-3xl mx-auto text-2xl md:text-3xl text-white/40 font-medium leading-relaxed italic">
                Sumerge tu mente en el conocimiento infinito. <span className="text-primary font-bold">Tutor IA cuántico</span> para alumnos y corrección automatizada para maestros.
              </p>

              <div className="pt-8">
                <button 
                  onClick={handleStartOnboarding}
                  className="px-16 py-8 bg-primary text-black font-black text-2xl rounded-[3rem] hover:scale-105 transition-all shadow-[0_0_80px_rgba(0,255,255,0.4)] active:scale-95 uppercase tracking-tighter animate-neon-cyan group flex items-center gap-4 mx-auto"
                >
                  EMPEZAR GRATIS NOW <ArrowRight size={32} className="group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </motion.div>

            {/* Glowing background orb */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/10 rounded-full blur-[150px] pointer-events-none" />
          </section>

          {/* Section: Tu Santuario, donde quieras (The Device Triad) */}
          <section className="py-80 px-6 relative overflow-visible z-10 flex flex-col items-center">
             <div className="text-center mb-60 relative z-20">
                <h2 className="text-8xl md:text-[14rem] font-black text-white/5 uppercase tracking-tighter absolute -top-40 left-1/2 -translate-x-1/2 w-full select-none italic">
                  OMNIPRESENTE
                </h2>
                <h2 className="text-6xl md:text-8xl font-black text-white italic tracking-tighter relative z-10">Tu Santuario, donde quieras</h2>
                <p className="text-white/30 text-2xl mt-10 font-medium max-w-2xl mx-auto uppercase tracking-widest">Laptop, Tablet o Móvil. Tus datos orbitan contigo.</p>
              </div>

              <div className="max-w-7xl w-full grid grid-cols-1 md:grid-cols-3 gap-12 items-center justify-items-center">
                
                {/* Tablet (Left) */}
                <motion.div 
                  style={{ y: tabletY, opacity: devicesOpacity }} 
                  className="relative drop-shadow-[0_0_80px_rgba(168,85,247,0.1)] order-2 md:order-1"
                >
                  <div className="border-[14px] border-gray-900 rounded-[3rem] bg-black h-[500px] w-[350px] overflow-hidden shadow-2xl relative">
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/40 to-black pointer-events-none" />
                    <img src="https://images.unsplash.com/photo-1544383835-bda2bc66a55d?q=80&w=2121&auto=format&fit=crop" alt="Tablet UI" className="w-full h-full object-cover opacity-50" />
                    <div className="absolute bottom-10 left-0 right-0 p-6 text-center">
                        <div className="h-2 w-1/2 bg-primary/40 rounded-full mx-auto mb-2" />
                        <div className="h-1 w-1/3 bg-white/10 rounded-full mx-auto" />
                    </div>
                  </div>
                </motion.div>

                {/* Laptop (Center) */}
                <motion.div 
                  style={{ y: laptopY, opacity: devicesOpacity }} 
                  className="relative z-10 drop-shadow-[0_0_150px_rgba(0,255,255,0.25)] order-1 md:order-2 scale-110"
                >
                  <div className="border-[10px] border-gray-900 rounded-t-2xl bg-black h-[400px] w-full md:w-[700px] overflow-hidden shadow-2xl relative">
                     <div className="absolute inset-0 bg-gradient-to-tr from-primary/10 via-transparent to-primary/5 pointer-events-none" />
                     <img src="https://images.unsplash.com/photo-1517694712202-14dd9538aa97?q=80&w=2070&auto=format&fit=crop" alt="Laptop UI" className="w-full h-full object-cover opacity-60" />
                     <div className="absolute top-10 left-10 space-y-2">
                        <div className="w-32 h-6 bg-white/10 rounded-lg backdrop-blur-md" />
                        <div className="w-20 h-4 bg-white/5 rounded-lg backdrop-blur-md" />
                     </div>
                  </div>
                  <div className="h-8 w-[112%] -ml-[6%] bg-gray-950 border-t border-white/5 rounded-b-2xl shadow-2xl relative">
                     <div className="w-20 h-1.5 bg-white/5 rounded-full absolute top-2 left-1/2 -translate-x-1/2" />
                  </div>
                </motion.div>

                {/* Mobile (Right) */}
                <motion.div 
                  style={{ y: mobileY, opacity: devicesOpacity }} 
                  className="relative drop-shadow-[0_0_80px_rgba(250,204,21,0.1)] order-3"
                >
                  <div className="border-[14px] border-gray-900 rounded-[3rem] bg-black h-[550px] w-[260px] overflow-hidden shadow-2xl relative">
                    <div className="absolute inset-x-0 bottom-0 top-1/2 bg-gradient-to-t from-black via-black/20 to-transparent pointer-events-none" />
                    <img src="https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?q=80&w=2070&auto=format&fit=crop" alt="Mobile UI" className="w-full h-full object-cover opacity-50" />
                    <div className="absolute inset-0 flex flex-col items-center justify-end p-8 gap-4">
                       <div className="w-full h-12 rounded-xl bg-white/5 border border-white/10" />
                       <div className="w-full h-12 rounded-xl bg-primary/20 border border-primary/20" />
                    </div>
                  </div>
                </motion.div>

              </div>
          </section>

          {/* Section: Universo de Materias (Grid con Explicación) */}
          <section className="py-40 px-6 bg-black/80 backdrop-blur-3xl relative z-10 border-y border-white/5">
            <div className="max-w-7xl mx-auto">
              <div className="text-center mb-32 space-y-6">
                <div className="text-primary font-black uppercase tracking-[0.5em] text-sm">Biblioteca Cósmica</div>
                <h2 className="text-6xl md:text-[6rem] font-black text-white italic tracking-tighter">Materias Inteligentes</h2>
                <p className="text-white/30 text-2xl max-w-2xl mx-auto italic">Haz clic para descubrir cómo StudySanctuary rompe los límites de cada disciplina.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
                {subjects.map((sub) => (
                  <motion.div
                    key={sub.id}
                    whileHover={{ scale: 1.05, y: -15 }}
                    onClick={() => setSelectedSubject(sub)}
                    className="group cursor-pointer p-12 rounded-[4rem] bg-white/[0.02] border border-white/5 relative overflow-hidden transition-all hover:bg-white/[0.06] hover:border-primary/30"
                  >
                    <div 
                      className="absolute inset-0 opacity-0 group-hover:opacity-20 transition-opacity"
                      style={{ background: `radial-gradient(circle at center, ${sub.color} 0%, transparent 80%)` }}
                    />
                    <div className="relative z-10 text-center space-y-8">
                      <span className="text-8xl mb-8 block grayscale group-hover:grayscale-0 group-hover:scale-110 transition-all">{sub.icon}</span>
                      <h3 className="text-4xl font-black text-white italic tracking-tight">{sub.title}</h3>
                      <p className="text-white/30 text-lg leading-relaxed">{sub.desc}</p>
                      <button className="flex items-center gap-3 text-sm font-black text-white tracking-[0.2em] uppercase py-4 px-8 rounded-full border border-white/10 group-hover:bg-primary group-hover:text-black transition-all mx-auto">
                        DESCUBRIR <Zap size={18} />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>

          {/* Testimonials */}
          <section className="py-60 px-6 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/[0.02] to-transparent pointer-events-none" />
            <div className="max-w-6xl mx-auto h-[450px] relative">
              <AnimatePresence mode="wait">
                <motion.div 
                  key={testimonialIndex}
                  initial={{ opacity: 0, x: -50, scale: 0.9 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 50, scale: 1.1 }}
                  transition={{ type: "spring", stiffness: 100, damping: 20 }}
                  className="absolute inset-0 flex flex-col items-center justify-center text-center p-12"
                >
                  <Quote size={100} className="text-primary/10 mb-16" />
                  <p className="text-4xl md:text-6xl font-medium italic text-white leading-tight mb-16 tracking-tight">
                    "{testimonials[testimonialIndex].quote}"
                  </p>
                  <div className="flex items-center gap-8 translate-y-4">
                    <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary to-yellow-400 p-[3px] shadow-[0_0_30px_rgba(0,255,255,0.2)]">
                      <div className="w-full h-full rounded-full bg-black flex items-center justify-center text-3xl font-black italic">
                        {testimonials[testimonialIndex].name[0]}
                      </div>
                    </div>
                    <div className="text-left space-y-1">
                      <h4 className="text-2xl font-black text-white italic tracking-tight">{testimonials[testimonialIndex].name}</h4>
                      <p className="text-primary text-xs uppercase tracking-[0.4em] font-black">{testimonials[testimonialIndex].role}</p>
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          </section>

          {/* Footer & Discord */}
          <footer className="py-32 px-10 border-t border-white/5 relative z-20 bg-black/90 backdrop-blur-3xl overflow-hidden">
            <div className="max-w-7xl mx-auto">
              <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-20 border-b border-white/5 pb-24 mb-16">
                <div className="space-y-10 max-w-xl">
                  <div className="flex items-center gap-5">
                    <div className="w-16 h-16 rounded-3xl bg-primary flex items-center justify-center text-black font-black text-3xl shadow-[0_0_40px_rgba(0,255,255,0.3)]">S</div>
                    <div className="flex flex-col">
                      <span className="text-3xl font-black text-white italic tracking-tighter">StudySanctuary</span>
                      <span className="text-primary text-[10px] font-black uppercase tracking-[0.4em]">Multiverse Experience</span>
                    </div>
                  </div>
                  <p className="text-white/30 text-xl leading-relaxed font-medium italic">Uniendo inteligencia artificial de frontera y pedagogía avanzada para crear la plataforma de estudio más inmersiva del planeta.</p>
                </div>
                <div className="flex flex-wrap gap-12 lg:gap-20">
                  <div className="space-y-6">
                    <span className="text-white font-black text-xs uppercase tracking-[0.4em] block border-b border-primary/20 pb-2">Legal</span>
                    <button onClick={() => setIsPrivacyOpen(true)} className="group relative flex items-center gap-2 text-white/40 hover:text-white transition-all font-bold uppercase text-[10px] tracking-widest">
                      Política de Privacidad
                      <div className="absolute -bottom-1 left-0 w-0 h-[2px] bg-primary group-hover:w-full transition-all duration-300" />
                    </button>
                    <button className="group relative flex items-center gap-2 text-white/40 hover:text-white transition-all font-bold uppercase text-[10px] tracking-widest block opacity-50 cursor-not-allowed">
                      Términos de Uso
                    </button>
                  </div>
                  <div className="space-y-6">
                    <span className="text-white font-black text-xs uppercase tracking-[0.4em] block border-b border-secondary/20 pb-2">Comunidad</span>
                    <a 
                      href="https://discord.gg/Y5yFKEYD9r" 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="group relative flex items-center gap-3 text-white/40 hover:text-[#5865F2] hover:shadow-[0_0_20px_rgba(88,101,242,0.3)] transition-all font-black uppercase text-[10px] tracking-[0.3em] bg-white/5 py-4 px-8 rounded-2xl border border-white/5"
                    >
                      <MessageCircle size={20} className="group-hover:rotate-12 transition-transform" /> DISCORD OFICIAL
                    </a>
                    <div className="flex gap-4">
                       <button className="p-4 border border-white/5 rounded-xl text-white/20 hover:text-primary transition-all hover:border-primary/30 hover:bg-white/5"><Twitter size={20}/></button>
                       <button className="p-4 border border-white/5 rounded-xl text-white/20 hover:text-white transition-all hover:border-white/30 hover:bg-white/5"><Github size={20}/></button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex flex-col md:flex-row items-center justify-between gap-10">
                <div className="flex items-center gap-6 text-[10px] font-black uppercase tracking-[0.5em] text-white/10">
                  <span>© 2026 SANCTUARY LABS</span>
                  <span className="h-4 w-[1px] bg-white/5" />
                  <span>CRAFTED WITH PRECISION</span>
                </div>
                <div className="flex items-center gap-2 text-white/20 hover:text-primary transition-colors cursor-help">
                   <Monitor size={14} />
                   <span className="text-[10px] font-black uppercase tracking-widest">Estado del Sistema: <span className="text-emerald-500">Operativo</span></span>
                </div>
              </div>
            </div>
          </footer>
        </>
      )}

      {/* Subject Detail Modal: The explanation pop-up */}
      <AnimatePresence>
        {selectedSubject && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedSubject(null)}
              className="absolute inset-0 bg-black/90 backdrop-blur-3xl"
            />
            <motion.div
              layoutId={selectedSubject.id}
              initial={{ opacity: 0, scale: 0.9, y: 50 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 50 }}
              className="w-full max-w-3xl bg-black border border-white/10 rounded-[4rem] p-12 md:p-20 relative overflow-hidden animate-neon-cyan shadow-2xl"
            >
              {/* Internal glow orb */}
              <div 
                className="absolute top-0 right-0 w-64 h-64 blur-[100px] opacity-20 pointer-events-none"
                style={{ background: selectedSubject.color }}
              />
              
              <button 
                onClick={() => setSelectedSubject(null)}
                className="absolute top-10 right-10 text-white/20 hover:text-white hover:rotate-90 transition-all p-2 rounded-full border border-white/5"
              >
                <X size={32} />
              </button>

              <div className="space-y-12 relative z-10">
                <div className="flex items-center gap-10">
                   <span className="text-8xl md:text-9xl drop-shadow-[0_0_30px_rgba(255,255,255,0.2)]">{selectedSubject.icon}</span>
                   <div>
                     <h3 className="text-6xl md:text-7xl font-black text-white italic tracking-tighter">{selectedSubject.title}</h3>
                     <div className="mt-4 flex items-center gap-3">
                       <span className="px-5 py-2 bg-primary/10 text-[10px] font-black uppercase text-primary tracking-[0.3em] rounded-full border border-primary/20">DIMENSIÓN ACTIVA</span>
                       <div className="flex gap-1">
                         {[1,2,3,4,5].map(i => <Star key={i} size={12} className="text-yellow-400 fill-yellow-400" />)}
                       </div>
                     </div>
                   </div>
                </div>

                <div className="space-y-10">
                   <p className="text-2xl md:text-3xl text-white/50 leading-relaxed italic font-medium">
                     En esta materia, StudySanctuary te enseña a resolver <span className="text-white font-black underline decoration-primary/40 underline-offset-8">{selectedSubject.details.solve}</span>, 
                     dominar <span className="text-white font-black">{selectedSubject.details.master}</span> y practicar con 
                     <span className="text-primary font-black"> {selectedSubject.details.practice}</span> basados en el diseño curricular de tu país.
                   </p>

                   <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="p-8 rounded-[2.5rem] bg-white/[0.03] border border-white/10 space-y-6 hover:bg-white/[0.06] transition-colors group">
                        <div className="w-12 h-12 rounded-2xl bg-secondary/20 flex items-center justify-center text-secondary group-hover:scale-110 transition-transform">
                          <Flame size={28} />
                        </div>
                        <div className="space-y-2">
                          <h4 className="font-black text-white text-xl italic tracking-tight uppercase">Entrenamiento Pro</h4>
                          <p className="text-white/30 text-sm font-medium">Optimización de redes neuronales de aprendizaje para exámenes de alta presión.</p>
                        </div>
                      </div>
                      <div className="p-8 rounded-[2.5rem] bg-white/[0.03] border border-white/10 space-y-6 hover:bg-white/[0.06] transition-colors group">
                        <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                          <BrainCircuit size={28} />
                        </div>
                        <div className="space-y-2">
                          <h4 className="font-black text-white text-xl italic tracking-tight uppercase">Matriz de Tutoría</h4>
                          <p className="text-white/30 text-sm font-medium">IA con capacidad de razonamiento deductivo adaptada a tu perfil cognitivo único.</p>
                        </div>
                      </div>
                   </div>
                </div>

                <button 
                  onClick={() => setSelectedSubject(null)}
                  className="w-full py-8 bg-white text-black font-black text-xl rounded-3xl hover:bg-primary transition-all active:scale-95 flex items-center justify-center gap-4 uppercase tracking-[0.2em] shadow-2xl"
                >
                  VOLVER AL UNIVERSO <Sparkles size={24} />
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Privacy Modal: Terms internally */}
      <AnimatePresence>
        {isPrivacyOpen && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsPrivacyOpen(false)}
              className="absolute inset-0 bg-black/95 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 30 }}
              className="w-full max-w-4xl bg-[#080808] border border-white/10 rounded-[3rem] p-12 md:p-20 relative overflow-hidden shadow-[0_0_100px_rgba(0,0,0,1)]"
            >
              <button 
                onClick={() => setIsPrivacyOpen(false)}
                className="absolute top-10 right-10 text-white/20 hover:text-white transition-colors"
              >
                <X size={32} />
              </button>
              <div className="space-y-16">
                <div className="flex items-center gap-8">
                  <div className="w-20 h-20 rounded-[2rem] bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                    <Shield size={40} />
                  </div>
                  <div>
                    <h3 className="text-5xl font-black text-white italic tracking-tighter">Protocolo de Privacidad</h3>
                    <p className="text-emerald-400 font-black uppercase text-xs tracking-[0.4em] mt-2">Seguridad Encriptada v4.0</p>
                  </div>
                </div>
                
                <div className="space-y-10 max-h-[45vh] overflow-y-auto custom-scrollbar pr-6 text-white/40 text-xl font-medium leading-relaxed italic">
                  <div className="space-y-4">
                    <h4 className="text-white font-black uppercase tracking-widest text-sm border-b border-white/5 pb-2">1. Inmunidad de Datos</h4>
                    <p>En StudySanctuary, tu información es un templo. Utilizamos protocolos de encriptación end-to-end para asegurar que tus apuntes y datos personales permanezcan aislados del universo exterior.</p>
                  </div>
                  <div className="space-y-4">
                    <h4 className="text-white font-black uppercase tracking-widest text-sm border-b border-white/5 pb-2">2. Procesamiento de IA Crítico</h4>
                    <p>Nuestra inteligencia artificial opera bajo principios de privacidad estricta. Ningún fragmento de tu conocimiento es utilizado para entrenar modelos públicos o comerciales fuera de tu Santuario personal.</p>
                  </div>
                  <div className="space-y-4">
                    <h4 className="text-white font-black uppercase tracking-widest text-sm border-b border-white/5 pb-2">3. Soberanía del Usuario</h4>
                    <p>Eres el único dueño de tu multiverso de estudio. Tienes el derecho absoluto a la transmigración de datos o la erradicación total de tu presencia digital en nuestra plataforma.</p>
                  </div>
                </div>

                <div className="flex flex-col md:flex-row gap-6 pt-10 border-t border-white/5">
                  <button 
                    onClick={() => setIsPrivacyOpen(false)}
                    className="flex-1 py-7 bg-white text-black font-black text-xl rounded-2xl hover:bg-emerald-400 transition-all uppercase tracking-widest active:scale-95"
                  >
                    ACEPTO TERMINOS
                  </button>
                  <a 
                    href="#" 
                    onClick={(e) => e.preventDefault()}
                    className="flex items-center justify-center gap-3 px-10 py-7 border border-white/10 rounded-2xl text-white/20 font-black hover:text-white transition-all uppercase tracking-widest"
                  >
                    DESCARGAR LEGALES <ExternalLink size={20} />
                  </a>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};

export default LandingView;
