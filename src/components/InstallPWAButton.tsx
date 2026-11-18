import React, { useEffect, useState } from 'react';
import { Download, Smartphone, Share, X, CheckCircle2 } from 'lucide-react';

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
  const isCoarseSmallScreen =
    (window.matchMedia('(pointer: coarse)').matches && window.innerWidth <= 1280) ||
    window.innerWidth <= 1024;
  return isMobileUA || isIPadOS || isCoarseSmallScreen;
}

function detectIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return (
    /iphone|ipad|ipod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

export function usePWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(
    () => globalDeferredPrompt
  );
  const [isInstalled, setIsInstalled] = useState<boolean>(() => globalIsInstalled);
  const [isMobileOrTablet, setIsMobileOrTablet] = useState<boolean>(() => detectMobileOrTablet());
  const [isIOS] = useState<boolean>(() => detectIOS());

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
    promptInstall,
  };
}

interface InstallPWAButtonProps {
  /** Acento institucional sutil para integrarse con la tarjeta de login */
  accent?: 'indigo' | 'emerald';
  /** Mostrar guía breve en iOS Safari (donde Apple no soporta beforeinstallprompt) */
  allowIOSGuide?: boolean;
  className?: string;
}

export const InstallPWAButton: React.FC<InstallPWAButtonProps> = ({
  accent = 'indigo',
  allowIOSGuide = true,
  className = '',
}) => {
  const { canNativeInstall, isInstalled, isMobileOrTablet, isIOS, promptInstall } =
    usePWAInstallPrompt();
  const [installing, setInstalling] = useState<boolean>(false);
  const [showIOSGuide, setShowIOSGuide] = useState<boolean>(false);
  const [justAccepted, setJustAccepted] = useState<boolean>(false);

  // Ocultar en escritorio, si ya está instalada o si no hay soporte nativo ni guía iOS habilitada
  if (isInstalled || justAccepted || !isMobileOrTablet) {
    return null;
  }

  const canShowIOSGuide = isIOS && allowIOSGuide && !canNativeInstall;
  if (!canNativeInstall && !canShowIOSGuide) {
    return null;
  }

  const handleClick = async () => {
    if (canNativeInstall) {
      setInstalling(true);
      try {
        const outcome = await promptInstall();
        if (outcome === 'accepted') {
          setJustAccepted(true);
        }
      } catch (err) {
        console.warn('[PWA] Error al lanzar el prompt de instalación:', err);
      } finally {
        setInstalling(false);
      }
      return;
    }

    if (canShowIOSGuide) {
      setShowIOSGuide(true);
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
        className={`w-full group flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-2xl bg-slate-50/90 hover:bg-slate-100 dark:bg-[#000000] dark:hover:bg-[#0A0A0A] border border-slate-200/90 dark:border-[#27272A] text-slate-800 dark:text-[#F4F4F5] transition-all cursor-pointer focus:outline-none focus:ring-2 disabled:opacity-60 ${accentClasses} ${className}`}
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
              {installing ? 'Preparando instalación...' : 'Instalar App en el Dispositivo'}
            </p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
              {canNativeInstall
                ? 'Acceso directo y notificaciones en tu teléfono'
                : 'Agregar EduAsist a tu pantalla de inicio'}
            </p>
          </div>
        </div>

        <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-1 rounded-lg bg-white dark:bg-[#121212] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-[#27272A] shrink-0">
          PWA
        </span>
      </button>

      {showIOSGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ios-pwa-install-title"
        >
          <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-[#000000] border border-slate-200 dark:border-[#27272A] p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${iconAccentClasses}`}
                >
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h3
                    id="ios-pwa-install-title"
                    className="text-sm font-black text-slate-900 dark:text-[#F4F4F5]"
                  >
                    Instalar App en iPhone / iPad
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Instalación rápida desde Safari
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                aria-label="Cerrar guía de instalación"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

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
            </ol>

            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-[#181818] dark:hover:bg-[#27272A] text-white text-xs font-bold border border-transparent dark:border-[#27272A] flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Entendido</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
};
