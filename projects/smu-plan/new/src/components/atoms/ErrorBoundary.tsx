"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional custom fallback UI. Receives the error and a reset callback. */
  fallback?: (props: { error: Error; reset: () => void }) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Reusable React Error Boundary for wrapping specific UI sections.
 *
 * Usage:
 * ```tsx
 * <ErrorBoundary>
 *   <SomeComponent />
 * </ErrorBoundary>
 * ```
 *
 * With custom fallback:
 * ```tsx
 * <ErrorBoundary fallback={({ error, reset }) => (
 *   <div>
 *     <p>Failed: {error.message}</p>
 *     <button onClick={reset}>Retry</button>
 *   </div>
 * )}>
 *   <SomeComponent />
 * </ErrorBoundary>
 * ```
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  private handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (error) {
      if (this.props.fallback) {
        return this.props.fallback({ error, reset: this.handleReset });
      }

      return (
        <div
          style={{
            padding: "24px",
            textAlign: "center",
            color: "var(--text-muted, #666)",
          }}
        >
          <p style={{ marginBottom: "12px", fontSize: "0.875rem" }}>
            该模块加载出错，请重试。
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            style={{
              padding: "6px 16px",
              background: "var(--color-brand, #333)",
              color: "var(--text-inverse, #fff)",
              border: "var(--neo-border, 1px solid #333)",
              borderRadius: "var(--neo-radius, 6px)",
              fontWeight: 600,
              cursor: "pointer",
              fontSize: "0.8125rem",
            }}
          >
            重试
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
