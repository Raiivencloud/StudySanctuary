import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';

interface Track {
  id: string;
  title: string;
  artist: string;
  cover: string;
  url: string;
}

interface MusicContextType {
  isPlaying: boolean;
  currentTrack: Track | null;
  tracks: Track[];
  volume: number;
  currentTime: number;
  duration: number;
  isVisible: boolean;
  setIsVisible: (visible: boolean) => void;
  togglePlay: () => void;
  playTrack: (track: Track) => void;
  nextTrack: () => void;
  prevTrack: () => void;
  setVolume: (volume: number) => void;
}

const MusicContext = createContext<MusicContextType | undefined>(undefined);

const CHILL_OUT_PLAYLIST: Track[] = [
  { id: 'inst-1', title: 'Serene Morning', artist: 'Ambient Study', cover: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=300&h=300&fit=crop', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' },
  { id: 'inst-2', title: 'Deep Focus', artist: 'Concentration Lab', cover: 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=300&h=300&fit=crop', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3' },
  { id: 'inst-3', title: 'Gentle Rain', artist: 'Nature Sounds', cover: 'https://images.unsplash.com/photo-1515694346937-94d85e41e6f0?w=300&h=300&fit=crop', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3' },
  { id: 'inst-4', title: 'Quiet Library', artist: 'Study Session', cover: 'https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=300&h=300&fit=crop', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3' },
  { id: 'inst-5', title: 'Zen Garden', artist: 'Meditation Beats', cover: 'https://images.unsplash.com/photo-1528459801416-a9e53bbf4e17?w=300&h=300&fit=crop', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3' },
  { id: 'inst-6', title: 'Starlight Piano', artist: 'Midnight Melodies', cover: 'https://images.unsplash.com/photo-1520529277867-dbf8c5e0b340?w=300&h=300&fit=crop', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3' },
  { id: 'inst-7', title: 'Soft Breeze', artist: 'Acoustic Chill', cover: 'https://images.unsplash.com/photo-1470770841072-f978cf4d019e?w=300&h=300&fit=crop', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3' },
  { id: 'inst-8', title: 'Ethereal Echoes', artist: 'Space Ambient', cover: 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=300&h=300&fit=crop', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3' },
  { id: 'inst-9', title: 'Forest Path', artist: 'Nature Walk', cover: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=300&h=300&fit=crop', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3' },
  { id: 'inst-10', title: 'Calm Waters', artist: 'Oceanic Dreams', cover: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=300&h=300&fit=crop', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3' },
  { id: 'inst-11', title: 'Mountain Air', artist: 'Peak Relaxation', cover: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=300&h=300&fit=crop', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3' },
  { id: 'inst-12', title: 'Golden Hour', artist: 'Sunset Chill', cover: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&h=300&fit=crop', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3' },
  { id: 'inst-13', title: 'Misty Valleys', artist: 'Atmospheric', cover: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=300&h=300&fit=crop', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3' },
  { id: 'inst-14', title: 'Crystal Stream', artist: 'Water Melodies', cover: 'https://images.unsplash.com/photo-1433086566608-573bb0154575?w=300&h=300&fit=crop', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3' },
  { id: 'inst-15', title: 'Silent Snow', artist: 'Winter Chill', cover: 'https://images.unsplash.com/photo-1483921020237-2ff51e8e4b22?w=300&h=300&fit=crop', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3' },
  { id: 'inst-16', title: 'Urban Solitude', artist: 'City Ambient', cover: 'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=300&h=300&fit=crop', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3' },
  { id: 'inst-17', title: 'Hidden Temple', artist: 'Mystic Study', cover: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=300&h=300&fit=crop', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3' },
  { id: 'inst-18', title: 'Floating Clouds', artist: 'Airy Beats', cover: 'https://images.unsplash.com/photo-1534067783941-51c9c23ecefd?w=300&h=300&fit=crop', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3' },
  { id: 'inst-19', title: 'Moonlight Path', artist: 'Night Study', cover: 'https://images.unsplash.com/photo-1505506819641-4ad45cd8073f?w=300&h=300&fit=crop', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3' },
  { id: 'inst-20', title: 'Ancient Echoes', artist: 'History Study', cover: 'https://images.unsplash.com/photo-1461360370896-922624d12aa1?w=300&h=300&fit=crop', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-11.mp3' },
  { id: 'inst-21', title: 'Cosmic Dust', artist: 'Space Study', cover: 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=300&h=300&fit=crop', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-12.mp3' },
  { id: 'inst-22', title: 'Desert Wind', artist: 'Sand Melodies', cover: 'https://images.unsplash.com/photo-1473580044384-7ba9967e16a0?w=300&h=300&fit=crop', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-13.mp3' },
  { id: 'inst-23', title: 'Secret Garden', artist: 'Floral Beats', cover: 'https://images.unsplash.com/photo-1466721591356-11c7aa81e16a?w=300&h=300&fit=crop', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-14.mp3' },
  { id: 'inst-24', title: 'Infinite Horizon', artist: 'Vista Study', cover: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=300&h=300&fit=crop', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-15.mp3' },
  { id: 'inst-25', title: 'Quiet Reflection', artist: 'Mindful Study', cover: 'https://images.unsplash.com/photo-1499209974431-9dac3adaf471?w=300&h=300&fit=crop', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-16.mp3' },
  { id: 'inst-26', title: 'Morning Dew', artist: 'Dawn Beats', cover: 'https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?w=300&h=300&fit=crop', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-17.mp3' },
  { id: 'inst-27', title: 'Twilight Glow', artist: 'Evening Study', cover: 'https://images.unsplash.com/photo-1472120482482-d4465e4481b8?w=300&h=300&fit=crop', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-18.mp3' },
  { id: 'inst-28', title: 'Deep Sea', artist: 'Abyss Ambient', cover: 'https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=300&h=300&fit=crop', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-19.mp3' },
  { id: 'inst-29', title: 'Starry Night', artist: 'Galactic Study', cover: 'https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=300&h=300&fit=crop', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-20.mp3' },
  { id: 'inst-30', title: 'Final Focus', artist: 'Santuario Study', cover: 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?w=300&h=300&fit=crop', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-21.mp3' },
];

export const MusicProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [tracks, setTracks] = useState<Track[]>(CHILL_OUT_PLAYLIST);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(CHILL_OUT_PLAYLIST[0]);
  const [volume, setVolume] = useState(0.7);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isVisible, setIsVisible] = useState(true);
  const audioRef = useRef<HTMLAudioElement>(new Audio());

  useEffect(() => {
    const audio = audioRef.current;
    audio.volume = volume;
    audio.preload = "auto";
    
    const handleEnded = () => {
      if (tracks.length > 1) {
        nextTrack();
      } else {
        setIsPlaying(false);
      }
    };
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => setDuration(audio.duration);
    const handleError = (e: any) => {
      const error = audio.error;
      console.error("Audio element error:", error);
      
      if (isPlaying) {
        let errorMsg = "Error de reproducción.";
        if (error) {
          switch (error.code) {
            case 1: errorMsg = "Reproducción abortada."; break;
            case 2: errorMsg = "Error de red al cargar el audio."; break;
            case 3: errorMsg = "Error al decodificar el audio."; break;
            case 4: errorMsg = "El formato de audio no es compatible o el enlace ha caducado."; break;
          }
        }
        
        toast.error(errorMsg);
        setIsPlaying(false);

        if (tracks.length > 1) {
          const retryDelay = error?.code === 2 ? 5000 : 2000; // 5s for network errors (potential 429)
          setTimeout(() => {
            nextTrack();
          }, retryDelay);
        }
      }
    };

    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('error', handleError);
    
    return () => {
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('error', handleError);
      audio.pause();
    };
  }, [tracks]);

  // Consolidate playback logic to prevent "interrupted by new load request" or "interrupted by pause()"
  useEffect(() => {
    const audio = audioRef.current;
    if (!currentTrack) {
      audio.pause();
      return;
    }

    // Only update src if it's actually different to avoid interrupting playback
    if (!audio.src.includes(currentTrack.url)) {
      audio.src = currentTrack.url;
      audio.load();
    }

    if (isPlaying) {
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          // AbortError is expected when switching tracks or pausing quickly
          if (error.name === 'AbortError') {
            return;
          }
          console.error("Playback failed:", error);
          setIsPlaying(false);
        });
      }
    } else {
      audio.pause();
    }
  }, [currentTrack, isPlaying]);

  useEffect(() => {
    audioRef.current.volume = volume;
  }, [volume]);

  const togglePlay = () => setIsPlaying(!isPlaying);
  
  const playTrack = (track: Track) => {
    setCurrentTrack(track);
    setIsPlaying(true);
  };

  const nextTrack = () => {
    if (!currentTrack) return;
    const currentIndex = tracks.findIndex(t => t.id === currentTrack.id);
    const nextIndex = (currentIndex + 1) % tracks.length;
    setCurrentTrack(tracks[nextIndex]);
    setIsPlaying(true);
  };

  const prevTrack = () => {
    if (!currentTrack) return;
    const currentIndex = tracks.findIndex(t => t.id === currentTrack.id);
    const prevIndex = (currentIndex - 1 + tracks.length) % tracks.length;
    setCurrentTrack(tracks[prevIndex]);
    setIsPlaying(true);
  };

  return (
    <MusicContext.Provider value={{
      isPlaying,
      currentTrack,
      tracks,
      volume,
      currentTime,
      duration,
      isVisible,
      setIsVisible,
      togglePlay,
      playTrack,
      nextTrack,
      prevTrack,
      setVolume
    }}>
      {children}
    </MusicContext.Provider>
  );
};

export const useMusic = () => {
  const context = useContext(MusicContext);
  if (context === undefined) {
    throw new Error('useMusic must be used within a MusicProvider');
  }
  return context;
};
