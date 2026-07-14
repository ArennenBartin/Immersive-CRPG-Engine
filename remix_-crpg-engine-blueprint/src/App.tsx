/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AppShell } from "./components/AppShell";

class AppErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null; info: ErrorInfo | null }
> {
  state = { error: null, info: null };

  static getDerivedStateFromError(error: Error) {
    return { error, info: null };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("App render failed", error, info);
    this.setState({ error, info });
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="min-h-screen bg-neutral-950 p-6 text-neutral-100">
        <section className="mx-auto max-w-3xl rounded-sm border border-red-500/60 bg-red-950/35 p-4 shadow-xl">
          <h1 className="text-lg font-bold text-red-100">Engine view crashed</h1>
          <p className="mt-2 text-sm text-red-100/80">
            {this.state.error.message || String(this.state.error)}
          </p>
          {this.state.info?.componentStack ? (
            <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap rounded-sm bg-black/45 p-3 text-xs text-red-50/80">
              {this.state.info.componentStack}
            </pre>
          ) : null}
          <button
            className="mt-4 rounded-sm border border-red-300/60 px-3 py-2 text-sm font-semibold text-red-50 hover:bg-red-500/15"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </section>
      </main>
    );
  }
}

export default function App() {
  return (
    <AppErrorBoundary>
      <AppShell />
    </AppErrorBoundary>
  );
}
