import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { X, ShieldCheck, FileText, AlertTriangle } from 'lucide-react';
import privacyMarkdown from '../legal/privacy.md?raw';
import termsMarkdown from '../legal/terms.md?raw';
import { fillLegalText, legalValuesFromEnv, isLegalTextFinal } from '../legal/legalTexts';

export type LegalDocument = 'privacy' | 'terms';

const env = ((import.meta as any).env || {}) as Record<string, string | undefined>;
const values = legalValuesFromEnv(env);
const DOCUMENTS: Record<LegalDocument, { label: string; icon: typeof ShieldCheck; text: string }> = {
  privacy: { label: 'Privacidad', icon: ShieldCheck, text: fillLegalText(privacyMarkdown, values) },
  terms: { label: 'Términos', icon: FileText, text: fillLegalText(termsMarkdown, values) },
};

/** Privacy policy and terms of use (preliminary until VITE_LEGAL_TEXTS_APPROVED=true and complete). */
export const LegalModal: React.FC<{ initial?: LegalDocument; onClose: () => void }> = ({ initial = 'privacy', onClose }) => {
  const [active, setActive] = useState<LegalDocument>(initial);
  const document = DOCUMENTS[active];
  const isFinal = isLegalTextFinal(document.text, env.VITE_LEGAL_TEXTS_APPROVED);

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={document.label}>
      <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col bg-[#080808] border border-white/10 rounded-3xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between gap-4 p-4 md:p-6 border-b border-white/10">
          <div className="flex gap-2">
            {(Object.keys(DOCUMENTS) as LegalDocument[]).map((key) => {
              const Icon = DOCUMENTS[key].icon;
              return (
                <button
                  key={key}
                  onClick={() => setActive(key)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors ${active === key ? 'bg-white text-black' : 'text-white/50 hover:text-white'}`}
                >
                  <Icon size={14} /> {DOCUMENTS[key].label}
                </button>
              );
            })}
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="text-white/40 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>
        {!isFinal && (
          <div className="flex items-start gap-3 mx-4 md:mx-6 mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <span>Versión preliminar, pendiente de revisión legal profesional. Los puntos marcados como pendientes todavía no están definidos.</span>
          </div>
        )}
        <div className="overflow-y-auto p-4 md:p-6 text-sm leading-relaxed text-white/70 space-y-3 [&_h1]:text-2xl [&_h1]:font-black [&_h1]:text-white [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-white [&_h2]:mt-6 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mt-1 [&_strong]:text-white">
          <ReactMarkdown>{document.text}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
};
