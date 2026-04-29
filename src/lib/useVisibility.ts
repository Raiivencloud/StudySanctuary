import { useState, useEffect } from 'react';

/**
 * Hook to track if the current tab/window is visible to the user.
 * Useful for pausing intervals, polling, or animations to save resources.
 */
export function useVisibility() {
  const [isVisible, setIsVisible] = useState(!document.hidden);

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsVisible(!document.hidden);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return isVisible;
}
