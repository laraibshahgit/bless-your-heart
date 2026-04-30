import { Component, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { errorCopy } from '@/content/copy';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('ErrorBoundary caught:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-cream flex items-center justify-center p-6">
          <div className="text-center space-y-4">
            <p className="font-serif italic text-body text-ink-soft">
              {errorCopy.errorBoundary}
            </p>
            <Button
              variant="secondary"
              onClick={() => window.location.reload()}
            >
              Refresh
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
