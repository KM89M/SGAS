import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message || 'Unexpected application error' };
  }

  render() {
    if (this.state.hasError) {
      let friendly = this.state.message;
      try {
        const parsed = JSON.parse(this.state.message);
        if (parsed.error && parsed.operationType) {
          friendly = `${parsed.operationType.toUpperCase()} (${parsed.path || 'firestore'}): ${parsed.error}`;
        }
      } catch {
        // plain error string
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-[#F5F9FF] p-6">
          <div className="max-w-lg w-full bg-white border border-red-200 rounded-2xl p-6 shadow-sm">
            <h2 className="text-lg font-bold text-red-700 mb-2">
              حدث خطأ في النظام · System Error
            </h2>
            <p className="text-sm text-slate-600 break-words mb-4 font-mono-num bg-slate-50 p-3 rounded-lg border border-slate-200">
              {friendly}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-[#1565C0] text-white text-sm font-medium rounded-lg hover:bg-blue-800 transition-colors"
            >
              إعادة تحميل الصفحة · Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
