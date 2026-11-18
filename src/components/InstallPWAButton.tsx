import React, { useEffect, useState } from 'react';
import {
  Download,
  Smartphone,
  Share,
  PlusSquare,
  Compass,
  X,
  CheckCircle2,
  MoreVertical,
  Monitor,
} from 'lucide-react';

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
    isDesktop: !isIOS && !isAndroid && !isMobileOrTablet,
    promptInstall,
  };
}

export const usePWAInstall = usePWAInstallPrompt;

interface PWAInstallGuideModalProps {
  open: boolean;
  onClose: () => void;
  isIOS: boolean;
  isAndroid: boolean;
  accent?: 'indigo' | 'emerald';
}

export const PWAInstallGuideModal: React.FC<PWAInstallGuideModalProps> = ({
  open,
  onClose,
  isIOS,
  isAndroid,
  accent = 'indigo',
}) => {
  const defaultTab: 'ios' | 'android' = isIOS ? 'ios' : 'android';
  const [selectedGuide, setSelectedGuide] = useState<'ios' | 'android'>(defaultTab);

  useEffect(() => {
    if (open) {
      setSelectedGuide(isIOS ? 'ios' : 'android');
    }
  }, [open, isIOS]);

  if (!open) return null;

  const isEmerald = accent === 'emerald';
  const badgeClasses = isEmerald
    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border-emerald-200/80 dark:border-emerald-800/80'
    : 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border-indigo-200/80 dark:border-indigo-800/80';

  const primaryButtonClasses = isEmerald
    ? 'bg-emerald-600 hover:bg-emerald-700'
    : 'bg-indigo-600 hover:bg-indigo-700';

  const iosSteps = [
    {
      step: 1,
      icon: Compass,
      title: 'Abre EduAsist en Safari',
      desc: 'Asegúrate de navegar desde el navegador Safari (iOS 16.4 o superior para recibir alertas push).',
    },
    {
      step: 2,
      icon: Share,
      title: 'Toca el botón "Compartir"',
      desc: 'Pulsa el ícono del cuadrado con flecha hacia arriba en la barra inferior o superior de Safari.',
    },
    {
      step: 3,
      icon: PlusSquare,
      title: 'Elige "Agregar a pantalla de inicio"',
      desc: 'Desliza hacia abajo en el menú de opciones y selecciona Agregar a pantalla de inicio (+).',
    },
    {
      step: 4,
      icon: CheckCircle2,
      title: 'Confirma y abre desde tu inicio',
      desc: 'Toca "Agregar" arriba a la derecha. Luego abre EduAsist desde el nuevo ícono en tu pantalla.',
    },
  ];

  const androidDesktopSteps = [
    {
      step: 1,
      icon: MoreVertical,
      title: isAndroid ? 'Abre el menú del navegador (⋮)' : 'Abre el menú o barra de direcciones',
      desc: isAndroid
        ? 'En Chrome, Edge o Samsung Internet, pulsa los tres puntos verticales en la esquina superior derecha.'
        : 'En Chrome o Edge de escritorio, busca el ícono de instalación en la barra de direcciones o abre el menú (⋮).',
    },
    {
      step: 2,
      icon: Download,
      title: 'Selecciona "Instalar aplicación"',
      desc: 'También puede aparecer como "Agregar a pantalla principal" o "Instalar EduAsist".',
    },
    {
      step: 3,
      icon: CheckCircle2,
      title: 'Confirma la instalación',
      desc: 'Pulsa "Instalar" en el cuadro de confirmación para tener acceso directo en pantalla completa.',
    },
  ];

  const activeSteps = selectedGuide === 'ios' ? iosSteps : androidDesktopSteps;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pwa-manual-install-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-3xl bg-white dark:bg-[#000000] border border-slate-200 dark:border-[#27272A] p-5 sm:p-6 shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${badgeClasses}`}
            >
              {selectedGuide === 'ios' ? (
                <Smartphone className="w-5 h-5" />
              ) : (
                <Download className="w-5 h-5" />
              )}
            </div>
            <div>
              <h3
                id="pwa-manual-install-title"
                className="text-sm sm:text-base font-black text-slate-900 dark:text-[#F4F4F5]"
              >
                {selectedGuide === 'ios'
                  ? 'Instalar EduAsist en iPhone / iPad'
                  : 'Instalar EduAsist en tu dispositivo'}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {selectedGuide === 'ios'
                  ? 'Guía paso a paso para Safari (iOS)'
                  : 'Android, Tablet y Escritorio (Chrome / Edge)'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#181818] cursor-pointer transition-colors"
            aria-label="Cerrar guía de instalación"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Selector de Plataforma */}
        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-[#121212] border border-slate-200 dark:border-[#27272A]">
          <button
            type="button"
            onClick={() => setSelectedGuide('ios')}
            className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              selectedGuide === 'ios'
                ? 'bg-white dark:bg-[#000000] text-slate-900 dark:text-[#F4F4F5] shadow-xs border border-slate-200/80 dark:border-[#27272A]'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>iPhone / iPad (iOS)</span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedGuide('android')}
            className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              selectedGuide === 'android'
                ? 'bg-white dark:bg-[#000000] text-slate-900 dark:text-[#F4F4F5] shadow-xs border border-slate-200/80 dark:border-[#27272A]'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>Android / PC</span>
          </button>
        </div>

        {/* Pasos visuales */}
        <div className="space-y-2.5">
          {activeSteps.map(({ step, icon: StepIcon, title, desc }) => (
            <div
              key={step}
              className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-[#0A0A0A] border border-slate-200/80 dark:border-[#27272A]"
            >
              <div
                className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 text-xs font-black ${badgeClasses}`}
              >
                {step}
              </div>
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="text-xs font-bold text-slate-900 dark:text-[#F4F4F5] flex items-center gap-1.5">
                  <StepIcon className="w-3.5 h-3.5 shrink-0 text-emerald-500 dark:text-emerald-400" />
                  <span>{title}</span>
                </p>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                  {desc}
                </p>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={onClose}
          className={`w-full py-2.5 rounded-xl text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${primaryButtonClasses}`}
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-200" />
          <span>Entendido</span>
        </button>
      </div>
    </div>
  );
};

interface InstallPWAButtonProps {
  /** Acento institucional sutil para integrarse con la tarjeta de login o menú */
  accent?: 'indigo' | 'emerald';
  /** Mostrar guía de instalación manual cuando el navegador aún no emite beforeinstallprompt */
  allowManualGuide?: boolean;
  /** Forzar visibilidad en cualquier tamaño de pantalla */
  alwaysShow?: boolean;
  className?: string;
}

export const InstallPWAButton: React.FC<InstallPWAButtonProps> = ({
  accent = 'indigo',
  allowManualGuide = true,
  className = '',
}) => {
  const { canNativeInstall, isInstalled, isIOS, isAndroid, promptInstall } =
    usePWAInstallPrompt();
  const [installing, setInstalling] = useState<boolean>(false);
  const [showManualGuide, setShowManualGuide] = useState<boolean>(false);
  const [justAccepted, setJustAccepted] = useState<boolean>(false);

  // Ocultar automáticamente si la aplicación ya se ejecuta instalada en modo standalone
  if (isInstalled || justAccepted) {
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
              {installing ? 'Preparando instalación...' : 'Descargar e Instalar Aplicación'}
            </p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
              {canNativeInstall
                ? 'Instalación directa en un toque y alertas'
                : isIOS
                ? 'Ver guía rápida para iPhone y iPad (Safari)'
                : 'Acceso directo en pantalla de inicio'}
            </p>
          </div>
        </div>

        <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-1 rounded-lg bg-white dark:bg-[#121212] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-[#27272A] shrink-0">
          {canNativeInstall ? 'Instalar' : 'App'}
        </span>
      </button>

      <PWAInstallGuideModal
        open={showManualGuide}
        onClose={() => setShowManualGuide(false)}
        isIOS={isIOS}
        isAndroid={isAndroid}
        accent={accent}
      />
    </>
  );
};
