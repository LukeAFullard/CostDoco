import React from 'react';

type Props = { children: React.ReactNode };
type State = { hasError: boolean };

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('CostDoco crashed:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-stone dark:bg-ink text-graphite dark:text-stone p-6">
          <div className="text-center">
            <p className="text-lg font-semibold mb-2">Something went wrong.</p>
            <p className="text-sm text-gray-600 dark:text-gray-300">Reload the page. Your data is stored locally and is not affected.</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
