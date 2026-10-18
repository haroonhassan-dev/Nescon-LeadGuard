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
        <div className="min-h-screen bg-[#0D1112] flex items-center justify-center p-6 text-center">
          <div className="max-w-md w-full p-8 rounded-xl bg-[#171E1F] border border-[#FF5C5C]/40 space-y-4 shadow-2xl">
            <div className="h-12 w-12 rounded-xl bg-[#0D1112] border border-[#FF5C5C]/50 flex items-center justify-center text-[#FF5C5C] mx-auto">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h2 className="text-lg font-bold text-[#F5F7F2]">Interface Exception Caught</h2>
            <p className="text-xs text-[#8E9B9A] leading-relaxed">
              {this.state.error?.message || 'An unexpected rendering error occurred in this module.'}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false });
                window.location.reload();
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#B7F45B] hover:bg-[#A4E045] text-[#0D1112] font-semibold text-xs uppercase tracking-wide transition-colors"
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
