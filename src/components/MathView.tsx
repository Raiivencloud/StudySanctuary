import React, { useState } from 'react';
import { Calculator, Sparkles, Loader2, ChevronRight, AlertCircle, Lightbulb, Layers } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Type, getAI, handleAIError, extractJSON } from '../services/geminiService';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { getUserCredits, consumeCredit } from '../services/userService';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import ReactMarkdown from 'react-markdown';

interface MathExercise {
  id: string;
  problem: string;
  solution: string;
  steps: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  category: string;
}

export const MathView: React.FC = () => {
  const { language } = useLanguage();
  const { user } = useAuth();
  
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard' | 'expert'>('medium');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exercises, setExercises] = useState<MathExercise[]>([]);
  const [showSolution, setShowSolution] = useState<string | null>(null);

  const handleGenerateMath = async () => {
    if (!topic.trim()) {
      toast.error('Por favor escribe un tema matemático');
      return;
    }

    setLoading(true);
    setError(null);
    setExercises([]);
    setShowSolution(null);

    try {
      // Verificar créditos antes de proceder
      if (user) {
        const { credits } = await getUserCredits(user.uid);
        if (credits <= 0) {
          toast.error(language === 'es' ? 'No tienes créditos suficientes. Espera a mañana o mejora tu plan.' : 'Not enough credits. Wait until tomorrow or upgrade your plan.');
          setLoading(false);
          return;
        }
      }

      const ai = getAI();
      
      const prompt = `Actúa como un experto matemático. Genera 3 ejercicios matemáticos desafiantes y educativos sobre el tema "${topic}" con nivel de dificultad "${difficulty}". 
      Los ejercicios deben ser variados y cubrir diferentes aspectos del tema.
      Para cada ejercicio, proporciona:
      1. El enunciado del problema claro y preciso.
      2. La solución final.
      3. Una lista de pasos lógicos y detallados para resolverlo.
      El idioma de respuesta debe ser ${language === 'es' ? 'Español' : 'Inglés'}.
      Asegúrate de que la dificultad "${difficulty}" se refleje realmente en la complejidad de los problemas.
      IMPORTANTE: Responde ÚNICAMENTE con el JSON solicitado, sin introducciones, explicaciones ni comentarios adicionales.`;

      const result = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ parts: [{ text: prompt }] }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                problem: { type: Type.STRING },
                solution: { type: Type.STRING },
                steps: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                },
                difficulty: { type: Type.STRING },
                category: { type: Type.STRING }
              },
              required: ["id", "problem", "solution", "steps", "difficulty", "category"]
            }
          }
        }
      });

      if (!result || !result.text) {
        throw new Error("No se recibieron datos de la IA");
      }

      const data = extractJSON(result.text) as MathExercise[];
      if (!Array.isArray(data)) {
        throw new Error("Formato de datos inválido");
      }
      
      setExercises(data);
      
      // Consumir crédito tras respuesta exitosa
      if (user) {
        await consumeCredit(user.uid);
      }
      
      toast.success('¡Ejercicios generados!');
    } catch (error: any) {
      handleAIError(error, "Error al generar ejercicios");
      setError(error.message || "Ocurrió un error inesperado");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="responsive-container space-y-8">
      <div className="text-center md:text-left">
        <h2 className="text-2xl md:text-3xl font-headline font-bold text-on-surface flex items-center justify-center md:justify-start gap-3">
          <Calculator className="text-primary" />
          Laboratorio de Matemáticas
        </h2>
        <p className="text-on-surface-variant opacity-70 mt-1">
          Resuelve problemas desde aritmética básica hasta cálculo avanzado con ayuda de IA.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <div className="responsive-card bg-card rounded-3xl p-6 border border-outline-variant/10 shadow-sm space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant opacity-60">
                Tema o Concepto
              </label>
              <textarea
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Ej: Ecuaciones cuadráticas, Integrales, Fracciones..."
                className="w-full h-32 bg-surface-container-low border border-outline-variant/20 rounded-2xl p-4 text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary/50 transition-all resize-none shadow-inner"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant opacity-60">
                Dificultad
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['easy', 'medium', 'hard', 'expert'] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => setDifficulty(d)}
                    className={cn(
                      "py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all border",
                      difficulty === d 
                        ? "bg-primary text-white border-primary shadow-lg shadow-primary/20" 
                        : "bg-surface text-on-surface-variant border-outline-variant/20 hover:bg-surface-variant/50"
                    )}
                  >
                    {d === 'easy' ? 'Fácil' : d === 'medium' ? 'Medio' : d === 'hard' ? 'Difícil' : 'Experto'}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleGenerateMath}
              disabled={loading || !topic.trim()}
              className="w-full py-4 bg-primary text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-primary/20"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
              Generar Ejercicios
            </button>
          </div>

          <div className="responsive-card bg-primary/5 rounded-3xl p-6 border border-primary/10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                <Lightbulb size={20} />
              </div>
              <h4 className="font-bold text-on-surface">Consejo Pro</h4>
            </div>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              Puedes pedir temas específicos como "Teorema de Pitágoras" o incluso "Problemas de lógica para olimpiadas". La IA te guiará paso a paso.
            </p>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <AnimatePresence mode="wait">
            {loading ? (
              <motion.div className="flex flex-col items-center justify-center py-20 space-y-4">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
                <p className="text-on-surface-variant font-medium animate-pulse">Calculando problemas desafiantes...</p>
              </motion.div>
            ) : error ? (
              <motion.div className="flex flex-col items-center justify-center py-20 space-y-4 text-red-500">
                <AlertCircle className="w-10 h-10" />
                <p className="text-sm font-medium">{error}</p>
              </motion.div>
            ) : exercises.length > 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                {exercises.map((ex, index) => (
                  <div key={ex.id} className="responsive-card bg-card rounded-[2rem] p-8 border border-outline-variant/10 shadow-sm space-y-6 group hover:border-primary/30 transition-all">
                    <div className="flex items-center justify-between">
                      <span className="px-4 py-1.5 bg-primary/10 text-primary rounded-full text-[10px] font-bold uppercase tracking-widest">
                        Problema {index + 1} • {ex.category}
                      </span>
                      <div className={cn(
                        "w-3 h-3 rounded-full",
                        ex.difficulty === 'easy' ? "bg-green-400" : ex.difficulty === 'medium' ? "bg-yellow-400" : "bg-red-400"
                      )} />
                    </div>
                    
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <div className="text-lg font-medium text-on-surface leading-relaxed">
                        <ReactMarkdown>{ex.problem}</ReactMarkdown>
                      </div>
                    </div>

                    <div className="pt-6 border-t border-outline-variant/10">
                      <button
                        onClick={() => setShowSolution(showSolution === ex.id ? null : ex.id)}
                        className="flex items-center gap-2 text-sm font-bold text-primary hover:gap-3 transition-all"
                      >
                        {showSolution === ex.id ? 'Ocultar Solución' : 'Ver Solución Paso a Paso'}
                        <ChevronRight size={16} />
                      </button>

                      <AnimatePresence>
                        {showSolution === ex.id && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="mt-6 p-6 bg-surface-container-low rounded-2xl border border-primary/10 space-y-6">
                              <div className="space-y-4">
                                <h5 className="text-xs font-bold uppercase tracking-widest text-primary flex items-center gap-2">
                                  <Layers size={14} />
                                  Pasos para resolver:
                                </h5>
                                <div className="space-y-3">
                                  {ex.steps.map((step, i) => (
                                    <div key={i} className="flex gap-4">
                                      <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                                        {i + 1}
                                      </span>
                                      <p className="text-sm text-on-surface-variant leading-relaxed">{step}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              
                              <div className="pt-4 border-t border-outline-variant/10">
                                <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant opacity-60 mb-2">Resultado Final:</p>
                                <div className="p-4 bg-primary text-white rounded-xl font-mono font-bold text-center text-xl shadow-inner">
                                  {ex.solution}
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                ))}
              </motion.div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-center opacity-40 space-y-4">
                <Calculator className="w-20 h-20" />
                <p className="max-w-xs">Escribe un tema a la izquierda para generar ejercicios matemáticos personalizados.</p>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default MathView;
