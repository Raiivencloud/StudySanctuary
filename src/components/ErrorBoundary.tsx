import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-surface text-on-surface">
          <div className="bg-error/10 p-6 rounded-2xl border border-error/20 max-w-md w-full text-center space-y-4">
            <div className="w-16 h-16 bg-error/20 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle className="text-error w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold">Algo salió mal</h2>
            <p className="text-on-surface-variant">
              {this.state.error?.message || "Hubo un error inesperado en la aplicación."}
            </p>
            <div className="flex gap-3 justify-center">
              <button 
                onClick={() => window.location.reload()} 
                className="px-4 py-2 bg-primary text-on-primary rounded-xl font-medium"
              >
                Recargar página
              </button>
              <button 
                onClick={() => this.setState({ hasError: false, error: null })} 
                className="px-4 py-2 bg-surface-container text-on-surface rounded-xl font-medium"
              >
                Intentar de nuevo
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
