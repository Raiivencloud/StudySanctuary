import { requestGeneration, newAiAction, type AiBilling } from './aiClient';
import { toast } from 'sonner';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { clearAppCache } from '../lib/cacheUtils';

/**
 * CONFIGURACIÓN DE IA (Fase 4)
 * El navegador NO llama a Gemini ni tiene claves: todas las solicitudes pasan por
 * /api/ai/generate (server/ai/aiRouter.ts), que valida la identidad, los límites y los
 * créditos, y aplica los reintentos y modelos de respaldo.
 * El último parámetro opcional `billing` identifica la acción del usuario que se cobra
 * (ver src/shared/aiFeatures.ts). Sin él, la llamada es una herramienta incluida (sin costo).
 */

/**
 * INSTRUCCIONES MAESTRAS PARA STUDYSANCTUARY
 */
export const STUDY_SANCTUARY_PROMPT = `Eres el sistema de tutoría inteligente de StudySanctuary. Tu objetivo es generar apuntes de estudio profesionales, limpios y listos para leer.

REGLAS CRÍTICAS DE RESPUESTA:
1. PROCESAMIENTO DIRECTO: Está terminantemente PROHIBIDO saludar o usar frases de bienvenida como "Hola", "Soy tu asistente" o "Aquí tienes el resumen". Comienza la respuesta DIRECTAMENTE con el contenido solicitado.
2. DETECCIÓN DE LONGITUD: Si el texto a procesar es muy extenso (más de 10 páginas o muy denso), genera PRIMERO un "### Índice de Temas Clave" con viñetas y luego desarrolla cada punto en detalle.
3. ESTRUCTURA DE RESUMEN:
   - Usa títulos jerárquicos con ###.
   - Resalta conceptos, fechas y nombres importantes en **negrita**.
   - Utiliza tablas para comparar datos siempre que el contenido lo permita.
4. GLOSARIO Y AUTOEVALUACIÓN: Al final de cada intervención, incluye una sección fija llamada "### Conceptos para recordar" con los 5 términos más importantes y 2 preguntas de repaso tipo examen.
5. FORMATO LIMPIO: No menciones que eres una IA ni hables de tus limitaciones. Tu respuesta debe parecer un apunte de estudio profesional listo para imprimir o leer.
6. FÓRMULAS SIMPLES: Está TERMINANTEMENTE PROHIBIDO usar LaTeX o cualquier notación matemática compleja (no uses símbolos como $, \\, {}, ^, _, \frac, \sqrt). Escribí las fórmulas ÚNICAMENTE en texto plano amigable y legible para humanos (ejemplo: CO2 en lugar de subíndices, H2O, flechas simples ->, x para multiplicar, / para dividir). Esto aplica para RESÚMENES, TEORÍA y EXÁMENES. Asegúrate de que se lean bien en cualquier pantalla sin necesidad de renderizadores externos. Si detectas una fórmula compleja, simplifícala a texto descriptivo.`;

const JSON_SYSTEM_INSTRUCTION = "Eres un asistente experto en extracción de datos. Responde ÚNICAMENTE en formato JSON válido según el esquema solicitado. No incluyas texto adicional, saludos ni explicaciones.";

const isAudioConfig = (config: any) => Array.isArray(config?.responseModalities) && config.responseModalities.includes('AUDIO');

/**
 * Arma la solicitud (mismo prompt e instrucciones que antes) y la envía al servidor.
 * `history` permite conversaciones (tutor virtual).
 */
const runGeneration = async (prompt: string, config: any = {}, fileData?: any, billing?: AiBilling, history: any[] = []): Promise<any> => {
  const parts: any[] = [{ text: prompt }];

  if (fileData?.data && fileData?.mimeType) {
    parts.push({
      inlineData: {
        data: fileData.data,
        mimeType: fileData.mimeType
      }
    });
    // Modo Multimodal: Analiza texto e imágenes del binario
    parts[0].text = `Analiza este documento íntegramente (texto e imágenes) y realiza la tarea solicitada basándote solo en este contenido:\n\nTAREA: ${prompt}`;
  } else if (fileData?.text) {
    // Si tenemos texto extraído (Word/TXT), lo inyectamos directamente
    parts[0].text = `Analiza este documento íntegramente (texto) y realiza la tarea solicitada basándote solo en este contenido:\n\nCONTENIDO DEL DOCUMENTO:\n${fileData.text}\n\n---\n\nTAREA: ${prompt}`;
  }

  const { model, ...apiConfig } = config || {};

  // Determinar la instrucción del sistema (las solicitudes de voz no la llevan)
  if (!isAudioConfig(apiConfig)) {
    apiConfig.systemInstruction = apiConfig.systemInstruction || STUDY_SANCTUARY_PROMPT;
    // Si la respuesta es JSON, no forzamos el formato de apuntes que rompería el JSON
    if (apiConfig.responseMimeType === "application/json") {
      apiConfig.systemInstruction = JSON_SYSTEM_INSTRUCTION;
    }
  }

  const response = await requestGeneration({
    model,
    contents: [...history, { role: "user", parts }],
    config: apiConfig,
    billing,
  });

  // Si es una petición de audio (TTS), devolvemos el objeto completo para que el componente lo maneje
  if (isAudioConfig(apiConfig)) {
    return response;
  }

  if (!response.text) {
    throw new Error("Respuesta vacía de la IA.");
  }

  return response.text;
};

/**
 * Función maestra para llamar a la IA. Los reintentos y modelos de respaldo ahora los
 * aplica el servidor.
 */
export const callGemini = async (prompt: string, config: any = {}, fileData?: any, billing?: AiBilling): Promise<any> => {
  console.log(`[AI] Solicitud${config?.model ? ` (${config.model})` : ''}${billing ? ` · ${billing.feature}` : ''}`);
  return runGeneration(prompt, config, fileData, billing);
};

// --- FUNCIONES DE GENERACIÓN ---

export const generateAdaptivePlan = async (userId: string, course: string, progress: number, language: string, studyLevel?: any, fileData?: any, billing?: AiBilling) => {
  const prompt = `Genera un plan de estudio para el curso "${course}" con progreso ${progress}%. Nivel: ${studyLevel}. Idioma: ${language}.`;
  const result = await callGemini(prompt, { responseMimeType: "application/json" }, fileData, billing);
  return typeof result === 'string' ? extractJSON(result) : result;
};

export const generateSummary = async (userId: string, topic: string, language: string = "es", studyLevel: string = "medio", fileData?: any, billing?: AiBilling) => {
  const prompt = `Resume de forma clara: ${topic}. Nivel: ${studyLevel}. Idioma: ${language}.`;
  return await callGemini(prompt, {}, fileData, billing);
};

export const generateFlashcards = async (userId: string, topic: string, language: string = "es", studyLevel: string = "medio", fileData?: any, billing?: AiBilling) => {
  const prompt = `Crea flashcards (pregunta y respuesta) sobre: ${topic}. Responde en JSON array con 'id', 'front', 'back'.`;
  const result = await callGemini(prompt, { responseMimeType: "application/json" }, fileData, billing);
  return typeof result === 'string' ? extractJSON(result) : result;
};

export const generateExam = async (userId: string, topic: string, language: string = "es", studyLevel: string = "medio", fileData?: any, billing?: AiBilling) => {
  const prompt = `Crea un examen de opción múltiple sobre: ${topic}. Responde en JSON array con 'id' (un identificador único para cada pregunta, ej: question_1, question_2, etc.), 'question', 'options', 'correctAnswer' (índice 0-3), 'explanation'.`;
  const result = await callGemini(prompt, { responseMimeType: "application/json" }, fileData, billing);
  return typeof result === 'string' ? extractJSON(result) : result;
};

export const generateDiagram = async (userId: string, topic: string, language: string = "es", studyLevel: string = "medio", fileData?: any, billing?: AiBilling) => {
  return await callGemini(`Genera un diagrama Mermaid sobre: ${topic}`, {}, fileData, billing);
};

export const generateExercises = async (userId: string, topic: string, language: string = "es", studyLevel: string = "medio", fileData?: any, billing?: AiBilling) => {
  return await callGemini(`Genera ejercicios prácticos sobre: ${topic}`, {}, fileData, billing);
};

export const generateArenaQuestions = async (category: string, level: string) => {
  const prompt = `Genera 15 preguntas únicas de trivia sobre "${category}" para nivel "${level}". 
  Devuelve un JSON array de objetos con: 
  - question: la pregunta
  - options: un array de 4 opciones de respuesta
  - correctAnswer: el índice (0-3) de la opción correcta
  - explanation: una explicación corta de por qué es la correcta.
  
  Asegúrate de que las preguntas sean desafiantes pero adecuadas para el nivel ${level}.`;
  
  const result = await callGemini(prompt, { responseMimeType: "application/json" }, undefined, newAiAction('arena_questions'));
  return typeof result === 'string' ? extractJSON(result) : result;
};

// Alias para compatibilidad
export const generateExercise = generateExercises;
export const generateExamples = generateExercises;

// Funciones adicionales requeridas por la App
export const generateTheory = async (userId: string, topic: string, language: string, studyLevel?: any, fileData?: any, billing?: AiBilling) => {
  return await callGemini(`Genera una explicación teórica profunda sobre: ${topic}. Nivel: ${studyLevel}. Idioma: ${language}.`, {}, fileData, billing);
};

export const generatePodcastScript = async (userId: string, topic: string, language: string, studyLevel?: any, fileData?: any, billing?: AiBilling) => {
  const teacherPrompt = `Genera un guión de podcast educativo extenso sobre: ${topic}. 
  TONO: Actúa como una profesora apasionada, cercana y experta que le habla directamente a su alumno. Usa una estructura clara, con pausas naturales, ejemplos cotidianos y frases como "Escuchá bien esto...", "Esto suele entrar en examen, así que prestá atención", "Como si estuviéramos en clase...". 
  OBJETIVO: Explicar conceptos complejos de forma sencilla y amena.
  Nivel: ${studyLevel}. Idioma: ${language}. 
  Responde únicamente con el guión narrado, sin incluir nombres de locutores, metadatos ni marcas de tiempo. 
  El texto debe ser fluido y extenso.`;
  return await callGemini(teacherPrompt, {}, fileData, billing);
};

export const generatePodcastAudio = async (userId: string, script: string, billing?: AiBilling) => {
  try {
    // Limpiar el script de caracteres especiales y limitar longitud para evitar errores 500
    // El modelo TTS es muy sensible a la longitud y caracteres especiales en su fase preview
    const cleanScript = script
      .replace(/[*_#`~]/g, '') // Quitar markdown
      .replace(/\[.*?\]/g, '') // Quitar corchetes (posibles marcas de locutor)
      .replace(/[()]/g, ', ') // Cambiar paréntesis por comas para mejor entonación
      .replace(/[<>]/g, '') // Quitar tags HTML si los hay
      .replace(/\s+/g, ' ') // Normalizar espacios
      .trim()
      .substring(0, 4000); // Límite ampliado para permitir podcasts de 3-5 minutos

    if (cleanScript.length < 10) {
      console.warn("[AI] Script demasiado corto para generar audio.");
      return null;
    }

    const result = await requestGeneration({
      model: "gemini-3-flash-preview-tts",
      contents: [{ parts: [{ text: cleanScript }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
      billing,
    });

    return result.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
  } catch (error) {
    console.error("[AI] Error generating podcast audio:", error);
    return null;
  }
};

export const identifyLocation = async (userId: string, lat: number, lon: number, language: string, billing?: AiBilling) => {
  return await callGemini(`Identifica la ubicación: Lat: ${lat}, Lon: ${lon}. Idioma: ${language}.`, {}, undefined, billing);
};

export const searchLocation = async (userId: string, query: string, language: string, billing?: AiBilling) => {
  return await callGemini(`Busca información sobre: ${query}. Idioma: ${language}.`, {}, undefined, billing);
};

export const generateImage = async (prompt: string) => {
  return null;
};

export const Modality = { TEXT: 'TEXT', IMAGE: 'IMAGE', AUDIO: 'AUDIO' };
export const Type = { 
  STRING: 'STRING', 
  NUMBER: 'NUMBER', 
  INTEGER: 'INTEGER', 
  BOOLEAN: 'BOOLEAN', 
  ARRAY: 'ARRAY', 
  OBJECT: 'OBJECT' 
};

// --- TIPOS E INTERFACES ---

export interface StudyPlan {
  title: string;
  description: string;
  estimatedTotalHours: number;
  steps: {
    title: string;
    description: string;
    duration: string;
  }[];
  weakPoints: string[];
  recommendations: string[];
}

/**
 * Manejador centralizado de errores de IA
 */
export const handleAIError = (error: any, customMessage?: string) => {
  console.error("AI Error:", error);
  
  let errorMessage = error.message || "Ocurrió un error inesperado con la IA.";
  let isRetryable = false;

  // Intentar parsear si el mensaje es un JSON (común en errores de API)
  try {
    if (typeof errorMessage === 'string' && errorMessage.trim().startsWith('{')) {
      const parsed = JSON.parse(errorMessage);
      if (parsed.error) {
        errorMessage = parsed.error.message || errorMessage;
        if (parsed.error.code === 503 || parsed.error.status === 'UNAVAILABLE' || parsed.error.code === 429) {
          isRetryable = true;
        }
      }
    }
  } catch (e) {
    // No es JSON, ignorar
  }

  if (errorMessage === 'AI_SUSPENDED_FREE') {
    toast.error('Estamos realizando tareas de mantenimiento en el motor de IA. Regresaremos pronto.', {
      duration: 5000
    });
  } else if (errorMessage === 'INSUFFICIENT_CREDITS') {
    toast.error('Créditos insuficientes para esta operación.');
  } else if (isRetryable || errorMessage.includes('high demand') || errorMessage.includes('temporary')) {
    toast.error('El servicio de IA está bajo alta demanda en este momento. Por favor, intenta de nuevo en unos segundos.', {
      duration: 4000
    });
  } else if (errorMessage.includes('format') || errorMessage.includes('json') || errorMessage.includes('parse')) {
    toast.error('Error de formato en la respuesta de la IA.', {
      action: {
        label: 'Actualizar Versión',
        onClick: () => clearAppCache()
      },
      duration: 8000
    });
  } else if (errorMessage.includes('api key not valid') || errorMessage.includes('invalid api key')) {
    toast.error('La configuración de IA del servidor no es válida. Contactá al administrador.', {
      duration: 10000
    });
  } else if (errorMessage.includes('API key not valid')) {
  } else {
    toast.error(customMessage || `Error: ${errorMessage}`);
  }
};

/**
 * Utilidad para extraer JSON de una cadena que puede contener texto adicional
 */
export const extractJSON = (text: string): any => {
  if (!text) return null;
  
  try {
    // Intento 1: Parseo directo (limpiando posibles espacios en blanco)
    return JSON.parse(text.trim());
  } catch (e) {
    // Intento 2: Buscar bloques de código JSON (```json ... ```)
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch && jsonMatch[1]) {
      try {
        return JSON.parse(jsonMatch[1].trim());
      } catch (e2) {}
    }

    // Intento 3: Buscar el primer '[' o '{' y el último ']' o '}'
    const firstBracket = text.indexOf('[');
    const firstBrace = text.indexOf('{');
    
    // Determinar cuál empieza primero
    let start = -1;
    if (firstBracket !== -1 && firstBrace !== -1) {
      start = Math.min(firstBracket, firstBrace);
    } else if (firstBracket !== -1) {
      start = firstBracket;
    } else if (firstBrace !== -1) {
      start = firstBrace;
    }
    
    if (start !== -1) {
      const lastBracket = text.lastIndexOf(']');
      const lastBrace = text.lastIndexOf('}');
      const end = Math.max(lastBracket, lastBrace);
      
      if (end !== -1 && end > start) {
        const potentialJSON = text.substring(start, end + 1);
        try {
          return JSON.parse(potentialJSON.trim());
        } catch (e3) {
          console.error("[AI] Failed to parse extracted JSON:", e3);
        }
      }
    }
    
    console.error("[AI] Could not find valid JSON in text:", text);
    throw new Error("No se pudo encontrar un formato JSON válido en la respuesta de la IA.");
  }
};

const toResponse = (result: any) => {
  // Si el resultado ya es un objeto (como en el caso de TTS), lo devolvemos tal cual
  if (typeof result === 'object' && result !== null) {
    return result;
  }
  return {
    text: result,
    candidates: [{ content: { parts: [{ text: result, inlineData: null }] } }]
  };
};

/**
 * Interfaz compatible con el SDK que usan los componentes. `billing` es la acción del
 * usuario: todas las llamadas hechas con esta instancia se cobran una sola vez.
 */
export const getAI = (billing?: AiBilling) => ({
  models: {
    generateContent: async (c: any) => {
      // Pasamos el modelo si viene en el objeto de configuración
      const config = { ...c.config, model: c.model };
      return toResponse(await runGeneration(c.contents[0].parts[0].text, config, undefined, billing));
    }
  },
  chats: {
    // { model, config: { systemInstruction }, history } como en el SDK: la instrucción y el
    // historial ahora se envían al modelo (antes se descartaban).
    create: (chat?: any) => ({
      sendMessage: async (msg: any) => {
        const prompt = typeof msg === 'string' ? msg : msg.message;
        const config = { ...(chat?.config || {}), model: chat?.model };
        const history = Array.isArray(chat?.history) ? chat.history : [];
        return toResponse(await runGeneration(prompt, config, undefined, billing, history));
      }
    })
  }
});

