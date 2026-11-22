import { initSentry, SentryErrorBoundary } from './utils/sentry';

// Initialize Sentry first before rendering the application
initSentry();

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { OfflineSyncProvider } from './context/OfflineSyncContext';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SentryErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <NotificationProvider>
            <OfflineSyncProvider>
              <App />
            </OfflineSyncProvider>
          </NotificationProvider>
        </AuthProvider>
      </ThemeProvider>
    </SentryErrorBoundary>
  </StrictMode>,
);
