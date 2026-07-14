import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from './auth/AuthProvider';
import { RunScreen } from './screens/RunScreen';
import { ensureAnonIdPersisted } from './telemetry/ensureAnonId';
import './index.css';

// Ensure the device anonId exists in storage before anything reads it, so
// telemetry (useRun) and account-link (AccountLinkOnSignIn) converge on the
// same persisted value even for a first-time user who signs in pre-run.
ensureAnonIdPersisted();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <RunScreen />
    </AuthProvider>
  </StrictMode>,
);
