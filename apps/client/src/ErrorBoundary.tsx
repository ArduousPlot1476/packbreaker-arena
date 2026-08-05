// Top-level error boundary.
//
// Until now the client had NO boundary anywhere: a single throw during render
// unmounted the whole tree and left a blank page with no message, no telemetry,
// and no way out. That is survivable when the only player is the developer with
// a console open. It is not survivable for a public build, which is what Stage 1
// is for.
//
// This also gives `error_boundary_caught` its first emit site. The event has
// been typed in content-schemas.ts § 15 and validated server-side since
// 2026-04-27 and has never fired, because nothing ever caught anything (CF 50).
//
// RECOVERY IS THE POINT, not the message. The run persists to localStorage, so
// a save that crashes the render crashes it again on reload — a loop the player
// cannot escape by refreshing. The fallback therefore offers BOTH: reload (for
// a transient fault) and discard-the-saved-run (for a poisoned save). Without
// the second button a corrupt save is a permanently bricked game.

import { Component, type ErrorInfo, type ReactNode } from 'react';
import type { IsoTimestamp } from '@packbreaker/content';
import { clearLocal } from './persistence';
import { capture } from './telemetry/emit';

interface Props {
  readonly children: ReactNode;
}

interface State {
  readonly error: Error | null;
  readonly componentStack: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: '' };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const componentStack = info.componentStack ?? '';
    this.setState({ componentStack });

    // capture() is a no-op until the telemetry singleton is initialized, and it
    // re-stamps tsClient + sessionId itself — the placeholders below are
    // structural, not values anyone reads.
    try {
      capture({
        name: 'error_boundary_caught',
        errorMessage: `${error.name}: ${error.message}`,
        // Bounded: a deep tree can produce a very long stack, and this rides a
        // batched POST body.
        componentStack: componentStack.slice(0, 4000),
        tsClient: new Date().toISOString() as IsoTimestamp,
        sessionId: '',
      });
    } catch {
      // Telemetry must never be able to turn a caught error into an uncaught
      // one. The boundary's job is to keep the page alive.
    }

    // Keep the detail in the console for a developer; the UI below stays calm.
    console.error('[ErrorBoundary]', error, componentStack);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  private handleDiscardSave = (): void => {
    try {
      clearLocal();
    } catch {
      // If storage itself is the problem, still reload — a fresh page with no
      // readable save is better than the blank screen this replaces.
    }
    window.location.reload();
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error === null) return this.props.children;

    return (
      <div
        data-testid="error-boundary-fallback"
        style={{
          minHeight: '100vh',
          background: 'var(--bg-deep)',
          color: 'var(--text-primary)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          padding: 32,
          textAlign: 'center',
        }}
      >
        <div className="label-cap" style={{ fontSize: 11, color: 'var(--life-red)' }}>
          Something broke
        </div>
        <div className="heading-tight" style={{ fontSize: 28, maxWidth: 520 }}>
          The run hit an error and stopped.
        </div>
        <p style={{ color: 'var(--text-secondary)', maxWidth: 460, lineHeight: 1.5, margin: 0 }}>
          Reloading usually recovers it. If the same error comes back every time,
          the saved run is the problem — discard it and start fresh.
        </p>
        <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button
            type="button"
            data-testid="error-boundary-reload"
            onClick={this.handleReload}
            className="hover-lift focus-ring ease-snap"
            style={{
              font: 'inherit',
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              background: 'var(--accent)',
              color: 'var(--text-primary)',
              border: 'none',
              borderRadius: 8,
              padding: '12px 28px',
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
          <button
            type="button"
            data-testid="error-boundary-discard"
            onClick={this.handleDiscardSave}
            className="hover-lift focus-ring ease-snap"
            style={{
              font: 'inherit',
              fontWeight: 600,
              background: 'transparent',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-default)',
              borderRadius: 8,
              padding: '12px 20px',
              cursor: 'pointer',
            }}
          >
            Discard saved run
          </button>
        </div>
        {/* The message is shown, not hidden: a player reporting a bug can read
            it back, and it costs nothing. The component stack stays in the
            console. */}
        <code
          data-testid="error-boundary-message"
          style={{
            marginTop: 12,
            fontSize: 12,
            color: 'var(--text-muted)',
            maxWidth: 560,
            wordBreak: 'break-word',
          }}
        >
          {error.name}: {error.message}
        </code>
      </div>
    );
  }
}
