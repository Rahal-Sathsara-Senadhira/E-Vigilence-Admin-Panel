// A page that fails to render shows a message and a way out, instead of a
// blank screen. The rest of the app (sidebar, top bar) keeps working.

import { Alert, Button } from "@ev/ui";
import { Component, type ErrorInfo, type ReactNode } from "react";

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Page failed to render", error, info.componentStack);
  }

  override componentDidUpdate(prev: { resetKey?: string }) {
    // Navigating to another page clears the error.
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto max-w-xl py-10">
        <Alert tone="danger" title="This page couldn't be shown">
          Something went wrong while displaying it. Try again; if it keeps happening, tell the
          developers what you were doing.
        </Alert>
        <div className="mt-4 flex gap-2">
          <Button variant="primary" onClick={() => this.setState({ error: null })}>
            Try again
          </Button>
          <Button onClick={() => (window.location.href = "/")}>Go to your dashboard</Button>
        </div>
      </div>
    );
  }
}
