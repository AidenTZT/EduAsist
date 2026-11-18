import React, { useEffect, useState } from 'react';
import { Download, Smartphone, Share, X, CheckCircle2, MoreVertical } from 'lucide-react';

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

// Estado global compartido para no perder el evento `beforeinstallprompt` al navegar entre pantallas
let globalDeferredPrompt: BeforeInstallPromptEvent | null = null;
let globalIsInstalled = false;
const listeners = new Set<() => void>();
let listenersBound = false;

function notifySubscribers() {
  listeners.forEach((cb) => cb());
}

export function initGlobalPWAListeners() {
  if (typeof window === 'undefined' || listenersBound) return;
  listenersBound = true;

  const checkStandalone = () =>
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;

  globalIsInstalled = checkStandalone();

  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    globalDeferredPrompt = e as BeforeInstallPromptEvent;
    notifySubscribers();
  });

  window.addEventListener('appinstalled', () => {
    globalIsInstalled = true;
    globalDeferredPrompt = null;
    notifySubscribers();
  });

  const mediaQuery = window.matchMedia('(display-mode: standalone)');
  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', (evt) => {
      if (evt.matches) {
        globalIsInstalled = true;
        globalDeferredPrompt = null;
        notifySubscribers();
      }
    });
  }
}

function detectMobileOrTablet(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isMobileUA =
    /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|tablet|playbook|silk/i.test(ua);
  const isIPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  const isCoarseOrCompact =
    (window.matchMedia('(pointer: coarse)').matches && window.innerWidth <= 1280) ||
    window.innerWidth <= 1024;
  return isMobileUA || isIPadOS || isCoarseOrCompact;
}

function detectIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return (
    /iphone|ipad|ipod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function detectAndroid(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /android/i.test(navigator.userAgent || '');
}

export function usePWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(
    () => globalDeferredPrompt
  );
  const [isInstalled, setIsInstalled] = useState<boolean>(() => globalIsInstalled);
  const [isMobileOrTablet, setIsMobileOrTablet] = useState<boolean>(() => detectMobileOrTablet());
  const [isIOS] = useState<boolean>(() => detectIOS());
  const [isAndroid] = useState<boolean>(() => detectAndroid());

  useEffect(() => {
    initGlobalPWAListeners();

    const sync = () => {
      setDeferredPrompt(globalDeferredPrompt);
      setIsInstalled(globalIsInstalled);
      setIsMobileOrTablet(detectMobileOrTablet());
    };

    listeners.add(sync);
    window.addEventListener('resize', sync);
    sync();

    return () => {
      listeners.delete(sync);
      window.removeEventListener('resize', sync);
    };
  }, []);

  const promptInstall = async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!globalDeferredPrompt) return 'unavailable';
    await globalDeferredPrompt.prompt();
    const { outcome } = await globalDeferredPrompt.userChoice;
    if (outcome === 'accepted') {
      globalIsInstalled = true;
      globalDeferredPrompt = null;
      notifySubscribers();
    }
    return outcome;
  };

  return {
    canNativeInstall: !!deferredPrompt,
    isInstalled,
    isMobileOrTablet,
    isIOS,
    isAndroid,
    promptInstall,
  };
}

interface InstallPWAButtonProps {
  /** Acento institucional sutil para integrarse con la tarjeta de login o menú */
  accent?: 'indigo' | 'emerald';
  /** Mostrar guía de instalación manual cuando el navegador aún no emite beforeinstallprompt */
  allowManualGuide?: boolean;
  /** Forzar visibilidad en cualquier tamaño de pantalla (ej. dentro de menús) */
  alwaysShow?: boolean;
  className?: string;
}

export const InstallPWAButton: React.FC<InstallPWAButtonProps> = ({
  accent = 'indigo',
  allowManualGuide = true,
  alwaysShow = false,
  className = '',
}) => {
  const { canNativeInstall, isInstalled, isMobileOrTablet, isIOS, isAndroid, promptInstall } =
    usePWAInstallPrompt();
  const [installing, setInstalling] = useState<boolean>(false);
  const [showManualGuide, setShowManualGuide] = useState<boolean>(false);
  const [justAccepted, setJustAccepted] = useState<boolean>(false);

  if (isInstalled || justAccepted) {
    return null;
  }

  if (!alwaysShow && !isMobileOrTablet && !canNativeInstall) {
    return null;
  }

  if (!canNativeInstall && !allowManualGuide) {
    return null;
  }

  const handleClick = async () => {
    if (canNativeInstall) {
      setInstalling(true);
      try {
        const outcome = await promptInstall();
        if (outcome === 'accepted') {
          setJustAccepted(true);
        } else if (outcome === 'unavailable' && allowManualGuide) {
          setShowManualGuide(true);
        }
      } catch (err) {
        console.warn('[PWA] Error al lanzar el prompt de instalación:', err);
        if (allowManualGuide) setShowManualGuide(true);
      } finally {
        setInstalling(false);
      }
      return;
    }

    if (allowManualGuide) {
      setShowManualGuide(true);
    }
  };

  const accentClasses =
    accent === 'emerald'
      ? 'hover:border-emerald-500/50 dark:hover:border-emerald-500/50 focus:ring-emerald-500'
      : 'hover:border-indigo-500/50 dark:hover:border-indigo-500/50 focus:ring-indigo-500';

  const iconAccentClasses =
    accent === 'emerald'
      ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border-emerald-200/80 dark:border-emerald-800/80'
      : 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border-indigo-200/80 dark:border-indigo-800/80';

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={installing}
        className={`w-full group flex items-center justify-between gap-3 px-3.5 py-2.5 min-h-[44px] rounded-2xl bg-slate-50/90 hover:bg-slate-100 dark:bg-[#000000] dark:hover:bg-[#0A0A0A] border border-slate-200/90 dark:border-[#27272A] text-slate-800 dark:text-[#F4F4F5] transition-all cursor-pointer focus:outline-none focus:ring-2 disabled:opacity-60 ${accentClasses} ${className}`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${iconAccentClasses}`}
          >
            {canNativeInstall ? (
              <Download className="w-4 h-4" />
            ) : (
              <Smartphone className="w-4 h-4" />
            )}
          </div>
          <div className="text-left min-w-0">
            <p className="text-xs font-bold tracking-tight truncate">
              {installing ? 'Preparando instalación...' : 'Descargar / Instalar App'}
            </p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
              {canNativeInstall
                ? 'Acceso directo y alertas en tu dispositivo'
                : 'Agregar EduAsist a tu pantalla de inicio'}
            </p>
          </div>
        </div>

        <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-1 rounded-lg bg-white dark:bg-[#121212] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-[#27272A] shrink-0">
          App
        </span>
      </button>

      {showManualGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-manual-install-title"
        >
          <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#27272A] p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${iconAccentClasses}`}
                >
                  <Download className="w-5 h-5" />
                </div>
                <div>
                  <h3
                    id="pwa-manual-install-title"
                    className="text-sm font-black text-slate-900 dark:text-[#F4F4F5]"
                  >
                    {isIOS
                      ? 'Instalar en iPhone / iPad'
                      : isAndroid
                      ? 'Instalar en Android / Tablet'
                      : 'Instalar EduAsist en tu dispositivo'}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Acceso directo y notificaciones push
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowManualGuide(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                aria-label="Cerrar guía de instalación"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isIOS ? (
              <ol className="list-decimal list-inside space-y-2 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                <li>
                  Abre esta página en <strong>Safari</strong> (iOS 16.4+ para recibir notificaciones).
                </li>
                <li>
                  Pulsa el botón{' '}
                  <Share className="w-3.5 h-3.5 inline mx-0.5 text-indigo-600 dark:text-indigo-400" />{' '}
                  <strong>Compartir</strong> en la barra del navegador.
                </li>
                <li>
                  Elige <strong>&ldquo;Agregar a pantalla de inicio&rdquo;</strong>.
                </li>
                <li>
                  Abre <strong>EduAsist</strong> desde el ícono creado en tu pantalla de inicio.
                </li>
              </ol>
            ) : (
              <ol className="list-decimal list-inside space-y-2 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                <li>
                  Abre el menú de tu navegador{' '}
                  <MoreVertical className="w-3.5 h-3.5 inline mx-0.5 text-indigo-600 dark:text-indigo-400" />{' '}
                  (Chrome, Edge o Samsung Internet).
                </li>
                <li>
                  Selecciona <strong>&ldquo;Instalar aplicación&rdquo;</strong> o{' '}
                  <strong>&ldquo;Agregar a pantalla principal&rdquo;</strong>.
                </li>
                <li>
                  Confirma tocando <strong>&ldquo;Instalar&rdquo;</strong> para acceder desde tu pantalla de inicio.
                </li>
              </ol>
            )}

            <button
              type="button"
              onClick={() => setShowManualGuide(false)}
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
