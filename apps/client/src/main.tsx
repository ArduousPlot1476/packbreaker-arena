import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RunScreen } from './screens/RunScreen';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RunScreen />
  </StrictMode>,
);
