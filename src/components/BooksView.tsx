import React, { useState, useEffect } from 'react';
import { Book, Search, BookOpen, Star, Bookmark, ChevronRight, Filter, Sparkles, Heart, Clock, Layers, Headphones, Loader2, X, Settings, ChevronLeft, Download, Share2, FileText, ArrowRight, PlayCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getAI, handleAIError } from '../services/geminiService';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { getUserCredits, consumeCredit } from '../services/userService';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import ReactMarkdown from 'react-markdown';
import { db } from '../firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

interface BookItem {
  id: string;
  title: string;
  author: string;
  cover: string;
  rating: number;
  category: string;
  summary: string;
  pages: number;
  readTime: string;
}

const FAMOUS_BOOKS: BookItem[] = [
  {
    id: '1',
    title: 'Cien años de soledad',
    author: 'Gabriel García Márquez',
    cover: 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=800&q=80',
    rating: 4.9,
    category: 'Realismo Mágico',
    summary: 'La historia de la familia Buendía a lo largo de siete generaciones en el pueblo ficticio de Macondo.',
    pages: 471,
    readTime: '12h'
  },
  {
    id: '2',
    title: 'Don Quijote de la Mancha',
    author: 'Miguel de Cervantes',
    cover: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=800&q=80',
    rating: 4.8,
    category: 'Clásico',
    summary: 'Las aventuras de un hidalgo que pierde la razón por leer libros de caballería y decide convertirse en caballero andante.',
    pages: 1024,
    readTime: '25h'
  },
  {
    id: '3',
    title: '1984',
    author: 'George Orwell',
    cover: 'https://images.unsplash.com/photo-1541963463532-d68292c34b19?auto=format&fit=crop&w=800&q=80',
    rating: 4.7,
    category: 'Distopía',
    summary: 'Una visión aterradora de un futuro bajo un régimen totalitario que controla cada pensamiento y acción de sus ciudadanos.',
    pages: 328,
    readTime: '8h'
  },
  {
    id: '4',
    title: 'El Principito',
    author: 'Antoine de Saint-Exupéry',
    cover: 'https://images.unsplash.com/photo-1543004218-ee141104638e?auto=format&fit=crop&w=800&q=80',
    rating: 5.0,
    category: 'Infantil/Filosofía',
    summary: 'Un piloto perdido en el desierto encuentra a un pequeño príncipe de otro planeta que le enseña el verdadero sentido de la vida.',
    pages: 96,
    readTime: '2h'
  },
  {
    id: '5',
    title: 'Crónica de una muerte anunciada',
    author: 'Gabriel García Márquez',
    cover: 'https://images.unsplash.com/photo-1495446815901-a7297e633e8d?auto=format&fit=crop&w=800&q=80',
    rating: 4.6,
    category: 'Novela',
    summary: 'La reconstrucción de un asesinato en un pequeño pueblo donde todos sabían que iba a ocurrir pero nadie hizo nada para evitarlo.',
    pages: 158,
    readTime: '4h'
  },
  {
    id: '6',
    title: 'Rayuela',
    author: 'Julio Cortázar',
    cover: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=800&q=80',
    rating: 4.8,
    category: 'Antinovela',
    summary: 'Una obra maestra experimental que puede leerse de múltiples formas, siguiendo la vida de Horacio Oliveira en París y Buenos Aires.',
    pages: 600,
    readTime: '15h'
  },
  {
    id: '7',
    title: 'Orgullo y Prejuicio',
    author: 'Jane Austen',
    cover: 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=800&q=80',
    rating: 4.9,
    category: 'Romance',
    summary: 'La turbulenta relación entre Elizabeth Bennet y el rico Fitzwilliam Darcy en la Inglaterra rural del siglo XIX.',
    pages: 432,
    readTime: '10h'
  },
  {
    id: '8',
    title: 'El Alquimista',
    author: 'Paulo Coelho',
    cover: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=800&q=80',
    rating: 4.5,
    category: 'Ficción/Autoayuda',
    summary: 'El viaje de un joven pastor andaluz en busca de un tesoro que le enseñará a escuchar a su corazón y seguir sus sueños.',
    pages: 208,
    readTime: '5h'
  },
  {
    id: '9',
    title: 'Fahrenheit 451',
    author: 'Ray Bradbury',
    cover: 'https://images.unsplash.com/photo-1541963463532-d68292c34b19?auto=format&fit=crop&w=800&q=80',
    rating: 4.7,
    category: 'Distopía',
    summary: 'En una sociedad futura, los libros están prohibidos y los bomberos tienen la misión de quemarlos para evitar que la gente piense.',
    pages: 256,
    readTime: '6h'
  },
  {
    id: '10',
    title: 'El Túnel',
    author: 'Ernesto Sabato',
    cover: 'https://images.unsplash.com/photo-1495446815901-a7297e633e8d?auto=format&fit=crop&w=800&q=80',
    rating: 4.6,
    category: 'Psicológico',
    summary: 'La confesión de un pintor que asesina a la única mujer que fue capaz de comprenderlo, explorando la soledad y la obsesión.',
    pages: 160,
    readTime: '4h'
  }
];

export const BooksView: React.FC = () => {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [selectedBook, setSelectedBook] = useState<BookItem | null>(null);
  const [activeCategory, setActiveCategory] = useState('Todos');
  const [studyGuide, setStudyGuide] = useState<string | null>(null);
  const [loadingGuide, setLoadingGuide] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [currentBook, setCurrentBook] = useState<BookItem | null>(null);
  const [readingContent, setReadingContent] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [isLoadingContent, setIsLoadingContent] = useState(false);

  // Load reading progress from Firestore
  useEffect(() => {
    if (!user || !isReading || !currentBook) return;

    const loadProgress = async () => {
      try {
        const progressDoc = await getDoc(doc(db, 'bookProgress', `${user.uid}_${currentBook.id}`));
        if (progressDoc.exists()) {
          const data = progressDoc.data();
          setReadingContent(data.content || []);
          setCurrentPage(data.currentPage || 0);
        }
      } catch (error) {
        console.error("Error loading book progress:", error);
      }
    };

    loadProgress();
  }, [user, isReading, currentBook]);

  // Save reading progress to Firestore
  const saveProgress = async (content: string[], page: number) => {
    if (!user || !currentBook) return;
    try {
      await setDoc(doc(db, 'bookProgress', `${user.uid}_${currentBook.id}`), {
        userId: user.uid,
        bookId: currentBook.id,
        content,
        currentPage: page,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error("Error saving book progress:", error);
    }
  };

  const fetchChapter = async (book: BookItem, chapterIndex: number) => {
    if (readingContent[chapterIndex]) {
      setCurrentPage(chapterIndex);
      saveProgress(readingContent, chapterIndex);
      return;
    }

    setIsLoadingContent(true);
    try {
      // Verificar créditos antes de proceder
      if (user) {
        const { credits } = await getUserCredits(user.uid);
        if (credits <= 0) {
          toast.error(language === 'es' ? 'No tienes créditos suficientes. Espera a mañana o mejora tu plan.' : 'Not enough credits. Wait until tomorrow or upgrade your plan.');
          setIsLoadingContent(false);
          return;
        }
      }

      const ai = getAI();
      const result = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ parts: [{ text: `Proporciona el texto ÍNTEGRO, EXTENSO y COMPLETO del capítulo ${chapterIndex + 1} del libro "${book.title}" de ${book.author}. 
        Es fundamental que el texto sea extremadamente detallado, cubriendo absolutamente todo el contenido del capítulo original, sin omitir diálogos ni descripciones. 
        Si el libro no tiene capítulos numerados, proporciona una sección muy extensa de aproximadamente 3000 a 4000 palabras que continúe la historia de forma coherente.
        Idioma: ${language === 'es' ? 'Español' : 'Inglés'}.
        IMPORTANTE: Devuelve ÚNICAMENTE el texto del libro en formato Markdown, sin introducciones, resúmenes ni comentarios del asistente. No resumas, proporciona el texto completo.` }] }],
        config: {
          systemInstruction: "Eres un transcriptor de libros. Tu única tarea es devolver el texto íntegro del libro solicitado. No añadas saludos, resúmenes, glosarios ni ningún tipo de comentario adicional. Solo el texto del libro."
        }
      });

      const newContent = result.text || 'No se pudo cargar el contenido.';
      const updatedContent = [...readingContent];
      updatedContent[chapterIndex] = newContent;
      
      // Consumir crédito tras respuesta exitosa
      if (user) {
        await consumeCredit(user.uid);
      }
      
      setReadingContent(updatedContent);
      setCurrentPage(chapterIndex);
      saveProgress(updatedContent, chapterIndex);
    } catch (error) {
      console.error("Fetch chapter error:", error);
      toast.error("Error al cargar el capítulo.");
    } finally {
      setIsLoadingContent(false);
    }
  };

  const startReading = async (book: BookItem) => {
    setCurrentBook(book);
    setIsReading(true);
    // Progress will be loaded via useEffect
    if (readingContent.length === 0) {
      await fetchChapter(book, 0);
    }
  };

  const generateStudyGuide = async (book: BookItem) => {
    setLoadingGuide(true);
    setStudyGuide(null);
    try {
      // Verificar créditos antes de proceder
      if (user) {
        const { credits } = await getUserCredits(user.uid);
        if (credits <= 0) {
          toast.error(language === 'es' ? 'No tienes créditos suficientes. Espera a mañana o mejora tu plan.' : 'Not enough credits. Wait until tomorrow or upgrade your plan.');
          setLoadingGuide(false);
          return;
        }
      }

      const ai = getAI();
      const result = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ parts: [{ text: `Genera una guía de estudio completa para el libro "${book.title}" de ${book.author}. 
        Incluye: 
        1. Resumen detallado por capítulos o partes.
        2. Análisis de personajes principales.
        3. Temas centrales y simbología.
        4. Contexto histórico y biografía breve del autor.
        5. Preguntas de reflexión para el lector.
        Idioma: ${language === 'es' ? 'Español' : 'Inglés'}.
        Usa formato Markdown.` }] }],
      });

      setStudyGuide(result.text || 'No se pudo generar la guía.');
      
      // Consumir crédito tras respuesta exitosa
      if (user) {
        await consumeCredit(user.uid);
      }
    } catch (error) {
      console.error("Guide error:", error);
      toast.error("Error al generar la guía de estudio.");
    } finally {
      setLoadingGuide(false);
    }
  };

  const categories = ['Todos', ...Array.from(new Set(FAMOUS_BOOKS.map(b => b.category)))];
  
  const filteredBooks = FAMOUS_BOOKS.filter(book => {
    const matchesSearch = book.title.toLowerCase().includes(search.toLowerCase()) || 
                         book.author.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = activeCategory === 'Todos' || book.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="responsive-container space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="text-center md:text-left">
          <h2 className="text-2xl md:text-3xl font-headline font-bold text-on-surface flex items-center justify-center md:justify-start gap-3">
            <Book className="text-primary" />
            Biblioteca de Clásicos
          </h2>
          <p className="text-on-surface-variant opacity-70 mt-1">
            Explora las obras más influyentes de la literatura universal.
          </p>
        </div>

        <div className="relative w-full md:w-80 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant opacity-40 group-focus-within:text-primary transition-all" size={20} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar libros o autores..."
            className="w-full bg-surface border border-outline-variant/20 rounded-2xl py-3 pl-12 pr-4 text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary/50 transition-all shadow-sm"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 pb-2 overflow-x-auto no-scrollbar">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={cn(
              "px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest transition-all border whitespace-nowrap",
              activeCategory === cat 
                ? "bg-primary text-white border-primary shadow-lg shadow-primary/20" 
                : "bg-surface text-on-surface-variant border-outline-variant/20 hover:bg-surface-variant/50"
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
        <AnimatePresence mode="popLayout">
          {filteredBooks.map((book) => (
            <motion.div
              layout
              key={book.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              whileHover={{ y: -10 }}
              className="responsive-card bg-card rounded-[2rem] overflow-hidden border border-outline-variant/10 shadow-sm hover:shadow-xl hover:border-primary/20 transition-all cursor-pointer group"
              onClick={() => setSelectedBook(book)}
            >
              <div className="aspect-[3/4] relative overflow-hidden">
                <img 
                  src={book.cover} 
                  alt={book.title} 
                  className="w-full h-full object-cover group-hover:scale-110 transition-all duration-700"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500 flex flex-col justify-end p-6">
                  <div className="flex items-center gap-2 text-white mb-2">
                    <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                    <span className="text-sm font-bold">{book.rating}</span>
                  </div>
                  <button className="w-full py-3 bg-white text-black rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-primary hover:text-white transition-all">
                    Leer Resumen
                  </button>
                </div>
                <div className="absolute top-4 right-4 p-2 bg-white/20 backdrop-blur-md rounded-xl text-white opacity-0 group-hover:opacity-100 transition-all">
                  <Bookmark size={18} />
                </div>
              </div>
              
              <div className="p-6 space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-primary">{book.category}</p>
                <h3 className="text-lg font-bold text-on-surface truncate">{book.title}</h3>
                <p className="text-sm text-on-surface-variant opacity-60">{book.author}</p>
                <div className="flex items-center gap-4 pt-4 text-[10px] font-bold text-on-surface-variant opacity-40 uppercase tracking-widest">
                  <div className="flex items-center gap-1">
                    <Clock size={12} />
                    <span>{book.readTime}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Layers size={12} />
                    <span>{book.pages} págs</span>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {selectedBook && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedBook(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-4xl bg-card rounded-[3rem] overflow-hidden shadow-2xl border border-outline-variant/10 flex flex-col md:flex-row max-h-[90vh]"
            >
              <div className="w-full md:w-2/5 h-64 md:h-auto relative">
                <img 
                  src={selectedBook.cover} 
                  alt={selectedBook.title} 
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent md:hidden" />
              </div>

              <div className="flex-1 p-8 md:p-12 overflow-y-auto space-y-8">
                <div className="flex justify-between items-start">
                  <div className="space-y-2">
                    <span className="px-4 py-1.5 bg-primary/10 text-primary rounded-full text-[10px] font-bold uppercase tracking-widest">
                      {selectedBook.category}
                    </span>
                    <h2 className="text-3xl font-headline font-bold text-on-surface">{selectedBook.title}</h2>
                    <p className="text-lg text-on-surface-variant opacity-70">{selectedBook.author}</p>
                  </div>
                  <button 
                    onClick={() => {
                      setSelectedBook(null);
                      setStudyGuide(null);
                    }}
                    className="p-2 hover:bg-surface-variant rounded-full transition-all"
                  >
                    <X size={24} className="text-on-surface-variant opacity-40" />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="p-4 bg-surface-container-low rounded-2xl text-center space-y-1">
                    <Star className="w-5 h-5 text-yellow-400 fill-yellow-400 mx-auto" />
                    <p className="text-sm font-bold text-on-surface">{selectedBook.rating}</p>
                    <p className="text-[10px] uppercase tracking-widest opacity-40">Rating</p>
                  </div>
                  <div className="p-4 bg-surface-container-low rounded-2xl text-center space-y-1">
                    <Clock className="w-5 h-5 text-primary mx-auto" />
                    <p className="text-sm font-bold text-on-surface">{selectedBook.readTime}</p>
                    <p className="text-[10px] uppercase tracking-widest opacity-40">Lectura</p>
                  </div>
                  <div className="p-4 bg-surface-container-low rounded-2xl text-center space-y-1">
                    <Layers className="w-5 h-5 text-primary mx-auto" />
                    <p className="text-sm font-bold text-on-surface">{selectedBook.pages}</p>
                    <p className="text-[10px] uppercase tracking-widest opacity-40">Páginas</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant opacity-60 flex items-center gap-2">
                    <BookOpen size={14} />
                    Sinopsis
                  </h4>
                  <p className="text-on-surface-variant leading-relaxed italic">
                    "{selectedBook.summary}"
                  </p>
                </div>

                <div className="pt-6 border-t border-outline-variant/10">
                  {!studyGuide && !loadingGuide ? (
                    <button 
                      onClick={() => generateStudyGuide(selectedBook)}
                      className="w-full py-4 bg-primary text-white rounded-2xl font-bold flex items-center justify-center gap-3 shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                    >
                      <Sparkles size={20} />
                      Generar Guía de Estudio IA
                    </button>
                  ) : loadingGuide ? (
                    <div className="flex flex-col items-center justify-center py-12 space-y-4">
                      <Loader2 className="w-10 h-10 text-primary animate-spin" />
                      <p className="text-sm text-on-surface-variant font-medium animate-pulse">Analizando obra literaria...</p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-primary uppercase tracking-widest text-xs">Guía de Estudio IA</h4>
                        <button 
                          onClick={() => setStudyGuide(null)}
                          className="text-xs text-on-surface-variant hover:text-primary transition-all underline underline-offset-4"
                        >
                          Cerrar guía
                        </button>
                      </div>
                      <div className="prose prose-sm dark:prose-invert max-w-none bg-surface-container-low p-6 rounded-3xl border border-outline-variant/10">
                        <ReactMarkdown>{studyGuide!}</ReactMarkdown>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-4 pt-6">
                  <button 
                    onClick={() => startReading(selectedBook)}
                    className="flex-1 py-4 bg-primary text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
                  >
                    <BookOpen size={20} />
                    Leer Libro
                  </button>
                  <button className="p-4 bg-surface-container-high text-on-surface rounded-2xl hover:bg-surface-variant transition-all">
                    <Heart size={20} />
                  </button>
                  <button className="p-4 bg-surface-container-high text-on-surface rounded-2xl hover:bg-surface-variant transition-all">
                    <Headphones size={20} />
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Reading View Modal */}
      <AnimatePresence>
        {isReading && selectedBook && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-surface p-0 sm:p-4 md:p-8">
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className="w-full h-full max-w-5xl bg-card rounded-none sm:rounded-[3rem] shadow-2xl border border-outline-variant/10 flex flex-col overflow-hidden"
            >
              <div className="p-6 border-b border-outline-variant/10 flex items-center justify-between bg-surface/50 backdrop-blur-md sticky top-0 z-10">
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => setIsReading(false)}
                    className="p-2 hover:bg-surface-variant rounded-full transition-all"
                  >
                    <ChevronRight className="rotate-180" size={24} />
                  </button>
                  <div>
                    <h3 className="font-bold text-on-surface truncate max-w-[200px] sm:max-w-md">{selectedBook.title}</h3>
                    <p className="text-xs text-on-surface-variant opacity-60">{selectedBook.author}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button className="p-2 hover:bg-surface-variant rounded-full transition-all">
                    <Bookmark size={20} />
                  </button>
                  <button className="p-2 hover:bg-surface-variant rounded-full transition-all">
                    <Settings size={20} />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-8 sm:p-12 md:p-20 font-serif leading-relaxed text-lg sm:text-xl text-on-surface max-w-3xl mx-auto space-y-8">
                {isLoadingContent ? (
                  <div className="flex flex-col items-center justify-center py-40 space-y-4">
                    <Loader2 className="w-12 h-12 text-primary animate-spin" />
                    <p className="text-sm text-on-surface-variant font-medium animate-pulse">Cargando capítulo...</p>
                  </div>
                ) : (
                  <>
                    <h1 className="text-4xl sm:text-5xl font-bold font-headline mb-12 text-center">Capítulo {currentPage + 1}</h1>
                    <div className="prose prose-lg dark:prose-invert max-w-none">
                      <ReactMarkdown>{readingContent[currentPage]}</ReactMarkdown>
                    </div>
                    <div className="py-12 flex justify-center gap-4">
                      <button 
                        onClick={() => fetchChapter(selectedBook, currentPage - 1)}
                        disabled={currentPage === 0 || isLoadingContent}
                        className="px-6 py-3 bg-surface-container-high rounded-xl font-bold text-sm disabled:opacity-30"
                      >
                        Anterior
                      </button>
                      <button 
                        onClick={() => fetchChapter(selectedBook, currentPage + 1)}
                        disabled={isLoadingContent}
                        className="px-6 py-3 bg-primary text-white rounded-xl font-bold text-sm"
                      >
                        Siguiente Capítulo
                      </button>
                    </div>
                  </>
                )}
                <div className="h-40" />
              </div>

              <div className="p-4 border-t border-outline-variant/10 bg-surface/50 backdrop-blur-md flex items-center justify-center gap-8">
                <div className="text-xs font-bold uppercase tracking-widest opacity-40">Capítulo {currentPage + 1}</div>
                <div className="w-48 h-1 bg-outline-variant/20 rounded-full overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${((currentPage + 1) / 20) * 100}%` }} />
                </div>
                <div className="text-xs font-bold text-primary uppercase tracking-widest">{Math.round(((currentPage + 1) / 20) * 100)}% estimado</div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
