"use client";

import * as React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
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

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  override render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex min-h-[400px] items-center justify-center p-8">
          <div className="flex max-w-md flex-col items-center gap-4 text-center">
            <AlertTriangle className="size-12 text-destructive" />
            <div>
              <h2 className="font-semibold text-lg">Something went wrong</h2>
              <p className="mt-1 text-muted-foreground text-sm">
                {this.state.error?.message ?? "An unexpected error occurred"}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
            >
              <RefreshCw className="size-4" /> Reload page
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
