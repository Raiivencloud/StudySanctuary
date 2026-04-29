import React, { useState, useEffect } from 'react';
import { auth, googleProvider } from '../firebase';
import { signInWithPopup } from 'firebase/auth';
import { GraduationCap, Users, BrainCircuit, Calendar as CalendarIcon } from 'lucide-react';

export const LoginView: React.FC = () => {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      // App.tsx gestionará la entrada si detecta al usuario
    });
    return () => unsubscribe();
  }, []);

  const handleGoogleLogin = async () => {
    try {
      setError(null);
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      console.error("Error en login:", err);
      setError("Error al conectar con Google.");
    }
  };

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4 sm:p-6">
      <div className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
        
        {/* Lado Izquierdo: Branding y Características que faltaban */}
        <div className="space-y-6 lg:space-y-8 hidden lg:block text-on-surface">
          <div className="space-y-4">
            <h1 className="text-5xl font-bold tracking-tight">Study Sanctuary</h1>
            <p className="text-xl text-on-surface-variant leading-relaxed">
              Tu refugio academico impulsado por IA. Organiza, colabora y domina tus estudios.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="flex items-start gap-4">
              <div className="p-2 bg-surface-container rounded-xl text-primary">
                <BrainCircuit size={20} />
              </div>
              <div>
                <h3 className="font-bold">IA de Estudio</h3>
                <p className="text-xs text-on-surface-variant">Resumenes y flashcards automaticos.</p>
              </div>
            </div>
            
            <div className="flex items-start gap-4">
              <div className="p-2 bg-surface-container rounded-xl text-secondary">
                <Users size={20} />
              </div>
              <div>
                <h3 className="font-bold">Grupos Colaborativos</h3>
                <p className="text-xs text-on-surface-variant">Estudia con compañeros en tiempo real.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Lado Derecho: Tarjeta de Login */}
        <div className="bg-card p-8 sm:p-10 rounded-[2.5rem] border border-outline-variant space-y-6 shadow-2xl">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold text-on-surface">Bienvenido de nuevo</h2>
            <p className="text-on-surface-variant">Inicia sesion para entrar a tu santuario</p>
          </div>

          {error && <p className="text-error bg-error/10 p-3 rounded-xl text-sm text-center">{error}</p>}

          <button 
            onClick={handleGoogleLogin} 
            className="w-full py-4 bg-primary text-on-primary rounded-xl font-bold flex items-center justify-center gap-3 hover:bg-primary/90 transition-all active:scale-95 shadow-lg shadow-primary/20"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="G" className="w-5 h-5" />
            Continuar con Google
          </button>

          <div className="pt-6 border-t border-outline-variant text-center space-y-4">
            <p className="text-[10px] text-on-surface-variant uppercase tracking-widest">
              Study Sanctuary • Intelligent Academy 2026
            </p>
            <div className="flex justify-center">
              <a 
                href="https://discord.gg/Y5yFKEYD9r" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-[#5865F2] hover:opacity-80 transition-all font-bold text-xs"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.062 14.062 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                </svg>
                Comunidad de Discord
              </a>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default LoginView;