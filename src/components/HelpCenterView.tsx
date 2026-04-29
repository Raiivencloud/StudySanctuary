import React, { useState } from 'react';
import { HelpCircle, ChevronRight, MessageCircle, Mail, Phone, Send, X, User } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';

export const HelpCenterView: React.FC = () => {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessage, setChatMessage] = useState('');
  const [messages, setMessages] = useState<{ text: string, sender: 'user' | 'support' }[]>([
    { text: '¡Hola! ¿En qué podemos ayudarte hoy?', sender: 'support' }
  ]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage.trim()) return;

    setMessages(prev => [...prev, { text: chatMessage, sender: 'user' }]);
    setChatMessage('');

    // Simulate support response
    setTimeout(() => {
      setMessages(prev => [...prev, { 
        text: 'Gracias por tu mensaje. Un agente se conectará pronto para ayudarte.', 
        sender: 'support' 
      }]);
    }, 1000);
  };

  const faqs = [
    { q: '¿Cómo puedo crear un curso?', a: 'Puedes crear un curso desde el Dashboard haciendo clic en el botón "Crear Curso".' },
    { q: '¿Cómo puedo subir mis archivos?', a: 'Puedes subir tus archivos desde la sección de Archivos o directamente al crear un curso.' },
    { q: '¿Cómo puedo contactar al soporte?', a: 'Puedes contactarnos a través del chat en vivo, email o WhatsApp.' },
  ];

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div className="text-center space-y-4">
        <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center text-primary mx-auto">
          <HelpCircle size={32} />
        </div>
        <h2 className="text-3xl font-headline font-bold text-on-surface">Centro de Ayuda</h2>
        <p className="text-on-surface-variant max-w-md mx-auto">
          Preguntas Frecuentes
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {faqs.map((faq, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="p-6 bg-surface-container-low rounded-2xl border border-outline-variant/10 hover:border-primary/20 transition-all group"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <h3 className="font-bold text-on-surface group-hover:text-primary transition-colors">{faq.q}</h3>
                <p className="text-sm text-on-surface-variant leading-relaxed">{faq.a}</p>
              </div>
              <ChevronRight size={20} className="text-on-surface-variant opacity-40 mt-1" />
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
        <button 
          onClick={() => setIsChatOpen(true)}
          className="p-6 bg-primary/5 rounded-2xl border border-primary/10 text-center space-y-3 hover:bg-primary/10 transition-all group"
        >
          <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary mx-auto group-hover:scale-110 transition-transform">
            <MessageCircle size={20} />
          </div>
          <h4 className="font-bold text-on-surface">Chat en Vivo</h4>
          <p className="text-xs text-on-surface-variant">Disponible 24/7 para usuarios Premium</p>
        </button>
        <div className="p-6 bg-secondary/5 rounded-2xl border border-secondary/10 text-center space-y-3">
          <div className="w-10 h-10 bg-secondary/10 rounded-xl flex items-center justify-center text-secondary mx-auto">
            <Mail size={20} />
          </div>
          <h4 className="font-bold text-on-surface">Email</h4>
          <p className="text-xs text-on-surface-variant">soportestudysanctuary@outlook.com</p>
        </div>
        <a 
          href="https://discord.gg/Y5yFKEYD9r"
          target="_blank"
          rel="noopener noreferrer"
          className="p-6 bg-[#5865F2]/5 rounded-2xl border border-[#5865F2]/10 text-center space-y-3 hover:bg-[#5865F2]/10 transition-all group"
        >
          <div className="w-10 h-10 bg-[#5865F2]/10 rounded-xl flex items-center justify-center text-[#5865F2] mx-auto group-hover:scale-110 transition-transform">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.062 14.062 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
            </svg>
          </div>
          <h4 className="font-bold text-on-surface">Discord</h4>
          <p className="text-xs text-on-surface-variant">¿Tenés dudas? Unite a nuestro Discord oficial para ayuda en tiempo real</p>
        </a>
      </div>

      {/* Live Chat Modal */}
      <AnimatePresence>
        {isChatOpen && (
          <div className="fixed inset-0 z-[110] flex items-end justify-end p-4 md:p-8 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, y: 100, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 100, scale: 0.9 }}
              className="bg-card w-[95%] max-w-md h-[600px] rounded-3xl shadow-2xl border border-outline-variant/10 flex flex-col pointer-events-auto overflow-hidden"
            >
              {/* Chat Header */}
              <div className="p-6 bg-primary text-on-primary flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                    <MessageCircle size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold">Soporte en Vivo</h3>
                    <p className="text-[10px] opacity-80 uppercase tracking-widest">En línea ahora</p>
                  </div>
                </div>
                <button onClick={() => setIsChatOpen(false)} className="hover:bg-white/10 p-2 rounded-lg transition-colors">
                  <X size={20} />
                </button>
              </div>

              {/* Chat Messages */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-surface-container-lowest">
                {messages.map((msg, i) => (
                  <div key={i} className={cn(
                    "flex gap-3",
                    msg.sender === 'user' ? "flex-row-reverse" : "flex-row"
                  )}>
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
                      msg.sender === 'user' ? "bg-primary text-on-primary" : "bg-secondary text-on-secondary"
                    )}>
                      {msg.sender === 'user' ? <User size={14} /> : <MessageCircle size={14} />}
                    </div>
                    <div className={cn(
                      "p-3 rounded-2xl text-sm max-w-[80%]",
                      msg.sender === 'user' ? "bg-primary/10 text-on-surface rounded-tr-none" : "bg-secondary/10 text-on-surface rounded-tl-none"
                    )}>
                      {msg.text}
                    </div>
                  </div>
                ))}
              </div>

              {/* Chat Input */}
              <form onSubmit={handleSendMessage} className="p-4 bg-surface border-t border-outline-variant/10 flex gap-2">
                <input 
                  type="text"
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  placeholder="Escribe tu mensaje..."
                  className="flex-1 bg-surface-container-low border border-outline-variant/30 rounded-xl px-4 py-2 text-sm outline-none focus:border-primary transition-all"
                />
                <button 
                  type="submit"
                  className="p-2 bg-primary text-on-primary rounded-xl hover:bg-primary/90 transition-all"
                >
                  <Send size={20} />
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
