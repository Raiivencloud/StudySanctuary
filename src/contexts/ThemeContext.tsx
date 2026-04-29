import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  wallpaper: string | null;
  setWallpaper: (url: string | null) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('theme') as Theme;
      if (savedTheme) return savedTheme;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  });

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const [wallpaper, setWallpaperState] = useState<string | null>(() => localStorage.getItem('app_wallpaper'));
  const { userProfile, updateProfile } = useAuth();
  const isInitialLoad = React.useRef(true);

  // Sync wallpaper from user profile ONLY on initial load or when remote changes
  useEffect(() => {
    if (isInitialLoad.current) {
      isInitialLoad.current = false;
      if (userProfile?.preferences?.wallpaperUrl !== undefined) {
        const remoteUrl = userProfile.preferences.wallpaperUrl;
        const localUrl = localStorage.getItem('app_wallpaper');
        
        if (remoteUrl !== localUrl) {
          setWallpaperState(remoteUrl);
          if (remoteUrl) {
            localStorage.setItem('app_wallpaper', remoteUrl);
          } else {
            localStorage.removeItem('app_wallpaper');
          }
        }
      }
    }
  }, [userProfile?.preferences?.wallpaperUrl]);

  const setWallpaper = async (url: string | null) => {
    setWallpaperState(url);
    if (url) {
      localStorage.setItem('app_wallpaper', url);
    } else {
      localStorage.removeItem('app_wallpaper');
    }
    
    // Update remote profile
    try {
      await updateProfile({
        preferences: {
          ...userProfile?.preferences,
          wallpaperUrl: url || undefined
        }
      });
    } catch (error) {
      console.error("Error updating wallpaper in profile:", error);
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, wallpaper, setWallpaper }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
