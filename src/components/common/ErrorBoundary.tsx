import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-white flex items-center justify-center p-6 text-center">
          <div className="max-w-md w-full p-8 rounded-xl bg-[#FFFFFF] border border-[#B9524C]/40 space-y-4 shadow-2xl">
            <div className="h-12 w-12 rounded-xl bg-[#FAF8F4] border border-[#B9524C]/50 flex items-center justify-center text-[#B9524C] mx-auto">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h2 className="text-lg font-bold text-[#2B2A27]">Interface Exception Caught</h2>
            <p className="text-xs text-[#78716A] leading-relaxed">
              {this.state.error?.message || 'An unexpected rendering error occurred in this module.'}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false });
                window.location.reload();
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#4F7F6D] hover:bg-[#3F6A5A] text-white font-semibold text-xs uppercase tracking-wide transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Reload View
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
