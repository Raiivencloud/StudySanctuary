import { toast } from 'sonner';

/**
 * Clears all local storage, session storage, and reloads the page to force a cache refresh.
 */
export const clearAppCache = () => {
  try {
    // Clear all local storage except for essential auth tokens if needed
    // But for a full reset, we clear everything
    localStorage.clear();
    sessionStorage.clear();
    
    // Clear service workers if any
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          registration.unregister();
        }
      });
    }

    toast.success('Versión actualizada. Recargando...', {
      duration: 2000,
      onAutoClose: () => {
        window.location.reload();
      }
    });

    // Fallback reload if toast doesn't trigger
    setTimeout(() => {
      window.location.reload();
    }, 2500);
  } catch (error) {
    console.error('Error clearing cache:', error);
    window.location.reload();
  }
};
