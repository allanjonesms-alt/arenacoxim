import React, { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
          <div className="bg-[#1a1a1a] border border-red-500/50 p-8 rounded-3xl max-w-md w-full text-center space-y-4">
            <AlertTriangle className="w-12 h-12 text-red-500 mx-auto" />
            <h2 className="text-xl font-black uppercase italic">Algo deu errado</h2>
            <p className="text-gray-400 text-sm">
              Ocorreu um erro inesperado. Por favor, tente recarregar a página.
            </p>
            <div className="bg-black/20 p-4 rounded-xl text-left overflow-auto max-h-40">
              <code className="text-xs text-red-400 font-mono">
                {this.state.error?.message}
              </code>
            </div>
            <button 
              onClick={() => window.location.reload()}
              className="w-full bg-red-500 text-white py-3 rounded-xl font-bold uppercase tracking-widest hover:bg-red-600 transition-colors"
            >
              Recarregar
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
