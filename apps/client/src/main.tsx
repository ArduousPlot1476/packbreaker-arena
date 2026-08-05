import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from './auth/AuthProvider';
import { ErrorBoundary } from './ErrorBoundary';
import { RunScreen } from './screens/RunScreen';
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
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <RunScreen />
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
);
