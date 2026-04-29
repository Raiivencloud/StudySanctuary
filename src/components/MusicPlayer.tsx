import React, { useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, Music, Music2, Volume2, ExternalLink, ListMusic, ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useMusic } from '../contexts/MusicContext';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';
import { toast } from 'sonner';

export const MusicPlayer: React.FC = () => {
  const { isPlaying, currentTrack, tracks, togglePlay, playTrack, nextTrack, prevTrack, currentTime, duration, volume, setVolume, isVisible, setIsVisible } = useMusic();
  const [showPlaylist, setShowPlaylist] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [showVolume, setShowVolume] = useState(false);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (!currentTrack || !isVisible) return null;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ 
        opacity: 1, 
        y: 0,
        width: isMinimized ? 'auto' : '100%'
      }}
      exit={{ opacity: 0, y: 20 }}
      className={cn(
        "bg-card/90 backdrop-blur-2xl rounded-[2.5rem] border border-outline-variant/10 shadow-2xl overflow-hidden relative group transition-all duration-500",
        isMinimized ? "p-2 px-4" : "p-3 md:p-4"
      )}
    >
      {/* Background Glow */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-secondary/10 opacity-0 group-hover:opacity-100 transition-opacity" />
      
      {/* Close Button */}
      <button 
        onClick={() => setIsVisible(false)}
        className="absolute top-2 right-2 p-1.5 hover:bg-error/10 rounded-full transition-colors text-error z-50 opacity-0 group-hover:opacity-100"
        title="Ocultar reproductor"
      >
        <X size={14} />
      </button>
      <div className="relative flex items-center gap-4">
        {/* Album Art / Icon */}
        <div 
          onClick={() => isMinimized && setIsMinimized(false)}
          className={cn(
            "relative rounded-2xl overflow-hidden shadow-lg transition-all duration-500 cursor-pointer flex-shrink-0",
            isMinimized ? "w-10 h-10" : "w-16 h-16"
          )}
        >
          <img src={currentTrack.cover} alt="Cover" className={cn("w-full h-full object-cover transition-transform duration-700", isPlaying && "scale-110")} />
          {isPlaying && (
            <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
              <div className="flex gap-0.5 items-end h-4">
                {[1, 2, 3, 4].map(i => (
                  <motion.div
                    key={i}
                    animate={{ height: [4, 12, 6, 16, 4] }}
                    transition={{ repeat: Infinity, duration: 0.5 + i * 0.1, ease: "easeInOut" }}
                    className="w-1 bg-white rounded-full"
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Info & Controls */}
        <div className={cn("flex-1 min-w-0 transition-all duration-500", isMinimized ? "hidden sm:block" : "block")}>
          <div className="flex items-center gap-2 mb-0.5">
            <div className="w-3 h-3 bg-primary rounded-full flex items-center justify-center">
              <Music2 size={8} className="text-white" />
            </div>
            <span className="text-[8px] font-bold uppercase tracking-widest text-on-surface-variant opacity-60">En vivo</span>
          </div>
          <h4 className="text-sm font-bold text-on-surface truncate leading-tight">{currentTrack.title}</h4>
          <p className="text-[10px] text-on-surface-variant truncate">{currentTrack.artist}</p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1">
          {!isMinimized && (
            <>
              <div className="relative flex items-center">
                <AnimatePresence>
                  {showVolume && (
                    <motion.div
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: 'auto' }}
                      exit={{ opacity: 0, width: 0 }}
                      className="absolute right-full mr-2 bg-surface-container-high p-2 rounded-xl border border-outline-variant/10 shadow-xl flex items-center gap-2"
                    >
                      <Volume2 size={14} className="text-primary" />
                      <input 
                        type="range" 
                        min="0" 
                        max="1" 
                        step="0.01" 
                        value={volume}
                        onChange={(e) => setVolume(parseFloat(e.target.value))}
                        className="w-20 h-1 bg-primary/20 rounded-full appearance-none cursor-pointer accent-primary"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
                <button 
                  onClick={() => setShowVolume(!showVolume)}
                  className={cn(
                    "p-2 transition-colors rounded-lg",
                    showVolume ? "bg-primary/10 text-primary" : "text-on-surface-variant hover:text-primary"
                  )}
                >
                  <Volume2 size={18} />
                </button>
              </div>
              <button 
                onClick={() => setShowPlaylist(!showPlaylist)}
                className={cn(
                  "p-2 transition-colors rounded-lg",
                  showPlaylist ? "bg-primary/10 text-primary" : "text-on-surface-variant hover:text-primary"
                )}
              >
                <ListMusic size={18} />
              </button>
              <button 
                onClick={prevTrack}
                className="p-2 text-on-surface-variant hover:text-primary transition-colors hidden sm:block"
              >
                <SkipBack size={18} />
              </button>
            </>
          )}

          <button 
            onClick={togglePlay}
            className={cn(
              "bg-primary text-on-primary rounded-full flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-all",
              isMinimized ? "w-8 h-8" : "w-12 h-12"
            )}
          >
            {isPlaying ? <Pause size={isMinimized ? 14 : 24} fill="currentColor" /> : <Play size={isMinimized ? 14 : 24} fill="currentColor" className={isMinimized ? "ml-0.5" : "ml-1"} />}
          </button>

          {!isMinimized && (
            <button 
              onClick={nextTrack}
              className="p-2 text-on-surface-variant hover:text-primary transition-colors hidden sm:block"
            >
              <SkipForward size={18} />
            </button>
          )}

          <button 
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-2 text-on-surface-variant hover:text-primary transition-colors"
          >
            {isMinimized ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* Progress Bar */}
          <div className="mt-4 h-1.5 bg-surface-container-highest rounded-full overflow-hidden cursor-pointer relative group/progress">
            <motion.div 
              initial={{ width: "0%" }}
              animate={{ width: `${progress}%` }}
              transition={{ type: "spring", bounce: 0, duration: 0.2 }}
              className="h-full bg-primary relative"
            >
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-md opacity-0 group-hover/progress:opacity-100 transition-opacity" />
            </motion.div>
          </div>

          {/* Playlist View */}
          <AnimatePresence>
            {showPlaylist && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-4 pt-4 border-t border-outline-variant/10 space-y-4 overflow-hidden"
              >
                <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                  {tracks.map((track) => (
                    <button
                      key={track.id}
                      onClick={() => playTrack(track)}
                      className={cn(
                        "w-full flex items-center gap-3 p-2.5 rounded-2xl transition-all text-left group/item",
                        currentTrack.id === track.id 
                          ? "bg-primary/10 text-primary" 
                          : "hover:bg-surface-container-low text-on-surface-variant"
                      )}
                    >
                      <div className="relative w-10 h-10 rounded-xl overflow-hidden flex-shrink-0">
                        <img src={track.cover} alt="" className="w-full h-full object-cover" />
                        {currentTrack.id === track.id && isPlaying && (
                          <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                            <div className="flex gap-0.5 items-end h-3">
                              {[1, 2, 3].map(i => (
                                <motion.div
                                  key={i}
                                  animate={{ height: [3, 10, 5, 12, 3] }}
                                  transition={{ repeat: Infinity, duration: 0.5 + i * 0.1 }}
                                  className="w-0.5 bg-white rounded-full"
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          "text-xs font-bold truncate",
                          currentTrack.id === track.id ? "text-primary" : "text-on-surface"
                        )}>
                          {track.title}
                        </p>
                        <p className="text-[10px] opacity-60 truncate">{track.artist}</p>
                      </div>
                      {currentTrack.id === track.id && (
                        <div className="text-primary">
                          <Volume2 size={14} />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </motion.div>
  );
};
