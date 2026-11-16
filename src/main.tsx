import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { initGlobalPWAListeners } from './components/InstallPWAButton.tsx';
import './index.css';

// Inicializar captura temprana del evento beforeinstallprompt y registro del Service Worker
initGlobalPWAListeners();
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => {
      console.warn('[PWA] No se pudo registrar el Service Worker:', err);
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
