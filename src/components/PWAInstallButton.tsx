import React, { useState } from 'react';
import { Download, Smartphone, Share, X, MoreVertical, CheckCircle2 } from 'lucide-react';
import { usePWAInstallPrompt } from './InstallPWAButton.tsx';

export const PWAInstallButton: React.FC = () => {
  const { canNativeInstall, isInstalled, isIOS, isAndroid, promptInstall } =
    usePWAInstallPrompt();
  const [installing, setInstalling] = useState<boolean>(false);
  const [showInstallGuide, setShowInstallGuide] = useState<boolean>(false);

  // Solo ocultar si la app ya está instalada en modo standalone
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
        className={`inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 min-h-[36px] sm:min-h-[38px] rounded-xl text-[11px] sm:text-xs font-bold transition-colors cursor-pointer shadow-2xs shrink-0 whitespace-nowrap disabled:opacity-60 ${
          canNativeInstall
            ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
            : 'text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800'
        }`}
        title="Descargar e instalar EduAsist en este dispositivo"
        aria-label="Descargar o instalar aplicación EduAsist"
      >
        {isIOS && !canNativeInstall ? (
          <Smartphone className="w-3.5 h-3.5 shrink-0" />
        ) : (
          <Download className="w-3.5 h-3.5 shrink-0" />
        )}
        <span>{installing ? 'Instalando...' : 'Instalar'}</span>
        <span className="hidden md:inline">App</span>
      </button>

      {showInstallGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4 animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          aria-labelledby="navbar-pwa-install-title"
        >
          <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#27272A] p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-100 dark:border-indigo-800 shrink-0">
                  {isIOS ? <Smartphone className="w-5 h-5" /> : <Download className="w-5 h-5" />}
                </div>
                <div>
                  <h3
                    id="navbar-pwa-install-title"
                    className="text-sm font-black text-slate-900 dark:text-[#F4F4F5]"
                  >
                    {isIOS
                      ? 'Instalar en iPhone / iPad'
                      : isAndroid
                      ? 'Instalar en Android / Tablet'
                      : 'Descargar / Instalar EduAsist'}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {isIOS
                      ? 'Requerido por Apple para alertas push'
                      : 'Acceso directo como aplicación nativa'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowInstallGuide(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isIOS ? (
              <ol className="list-decimal list-inside space-y-2 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                <li>
                  Abre este enlace en <strong>Safari</strong> (iOS 16.4 o superior).
                </li>
                <li>
                  Toca el ícono{' '}
                  <Share className="w-3.5 h-3.5 inline mx-0.5 text-indigo-600 dark:text-indigo-400" />{' '}
                  <strong>Compartir</strong> en la barra de Safari.
                </li>
                <li>
                  Selecciona <strong>&ldquo;Agregar a pantalla de inicio&rdquo;</strong>.
                </li>
                <li>
                  Abre <strong>EduAsist</strong> desde el ícono creado en tu pantalla de inicio.
                </li>
              </ol>
            ) : (
              <ol className="list-decimal list-inside space-y-2 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                <li>
                  Abre el menú de opciones del navegador{' '}
                  <MoreVertical className="w-3.5 h-3.5 inline mx-0.5 text-indigo-600 dark:text-indigo-400" />{' '}
                  (Chrome, Edge o navegador móvil).
                </li>
                <li>
                  Toca <strong>&ldquo;Instalar aplicación&rdquo;</strong> o{' '}
                  <strong>&ldquo;Agregar a pantalla principal&rdquo;</strong>.
                </li>
                <li>
                  Confirma la instalación para abrir <strong>EduAsist</strong> directamente desde tu pantalla de inicio.
                </li>
              </ol>
            )}

            <button
              type="button"
              onClick={() => setShowInstallGuide(false)}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-300" />
              <span>Entendido</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
};
