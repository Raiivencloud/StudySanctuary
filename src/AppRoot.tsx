import { StrictMode } from 'react';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import { LanguageProvider } from './contexts/LanguageContext.tsx';
import { CourseProvider } from './contexts/CourseContext.tsx';
import { ThemeProvider } from './contexts/ThemeContext.tsx';
import { AuthProvider } from './contexts/AuthContext.tsx';
import { MusicProvider } from './contexts/MusicContext.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';

export default function AppRoot() {
  return (
    <StrictMode>
      <ErrorBoundary>
        <AuthProvider>
          <ThemeProvider>
            <MusicProvider>
              <LanguageProvider>
                <CourseProvider>
                  <BrowserRouter>
                    <App />
                  </BrowserRouter>
                </CourseProvider>
              </LanguageProvider>
            </MusicProvider>
          </ThemeProvider>
        </AuthProvider>
      </ErrorBoundary>
    </StrictMode>
  );
}
