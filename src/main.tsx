import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ThemeProvider } from './context/ThemeContext.tsx';
import { AuthProvider } from './context/AuthContext.tsx';
import { NotificationProvider } from './context/NotificationContext.tsx';
import { OfflineSyncProvider } from './context/OfflineSyncContext.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <NotificationProvider>
          <OfflineSyncProvider>
            <App />
          </OfflineSyncProvider>
        </NotificationProvider>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
);
