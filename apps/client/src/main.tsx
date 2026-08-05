import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppShell } from './AppShell';
import { AuthProvider } from './auth/AuthProvider';
import { ErrorBoundary } from './ErrorBoundary';
import { SettingsProvider } from './settings/SettingsContext';
import { ensureAnonIdPersisted } from './telemetry/ensureAnonId';
import './index.css';

// Ensure the device anonId exists in storage before anything reads it, so
// telemetry (useRun) and account-link (AccountLinkOnSignIn) converge on the
// same persisted value even for a first-time user who signs in pre-run.
ensureAnonIdPersisted();

// ErrorBoundary wraps AuthProvider, not the other way round: a throw inside
// Clerk's provider (a bad publishable key, a network-time failure during init)
// would otherwise take the page down with nothing rendered. The boundary must
// be the outermost thing that can still paint.
// SettingsProvider sits above AuthProvider: settings are device-scoped and must
// resolve regardless of auth state, and the reduced-motion attribute it applies
// to <html> should be live before the first screen paints.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <SettingsProvider>
        <AuthProvider>
          <AppShell />
        </AuthProvider>
      </SettingsProvider>
    </ErrorBoundary>
  </StrictMode>,
);
