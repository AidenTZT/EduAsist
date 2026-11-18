import React, { useState } from 'react';
import { Download, Smartphone } from 'lucide-react';
import { PWAInstallGuideModal, usePWAInstallPrompt } from './InstallPWAButton.tsx';

export const PWAInstallButton: React.FC = () => {
  const { canNativeInstall, isInstalled, isIOS, isAndroid, promptInstall } =
    usePWAInstallPrompt();
  const [installing, setInstalling] = useState<boolean>(false);
  const [showInstallGuide, setShowInstallGuide] = useState<boolean>(false);

  // Ocultar automáticamente si la aplicación ya se ejecuta instalada en modo standalone
  if (isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    if (canNativeInstall) {
      setInstalling(true);
      try {
        const outcome = await promptInstall();
        if (outcome === 'unavailable') {
          setShowInstallGuide(true);
        }
      } catch (err) {
        console.warn('[PWA] Error al ejecutar instalación nativa:', err);
        setShowInstallGuide(true);
      } finally {
        setInstalling(false);
      }
      return;
    }

    setShowInstallGuide(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleInstallClick}
        disabled={installing}
        className={`inline-flex items-center justify-center gap-1.5 px-2 sm:px-3 py-1.5 sm:py-2 min-h-[36px] sm:min-h-[38px] rounded-xl text-[11px] sm:text-xs font-bold transition-colors cursor-pointer shadow-2xs shrink-0 whitespace-nowrap disabled:opacity-60 ${
          canNativeInstall
            ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
            : 'text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800'
        }`}
        title="Descargar e Instalar Aplicación EduAsist"
        aria-label="Descargar e Instalar Aplicación EduAsist"
      >
        {isIOS && !canNativeInstall ? (
          <Smartphone className="w-3.5 h-3.5 shrink-0" />
        ) : (
          <Download className="w-3.5 h-3.5 shrink-0" />
        )}
        <span>{installing ? 'Instalando...' : 'Instalar App'}</span>
      </button>

      <PWAInstallGuideModal
        open={showInstallGuide}
        onClose={() => setShowInstallGuide(false)}
        isIOS={isIOS}
        isAndroid={isAndroid}
        accent="indigo"
      />
    </>
  );
};
