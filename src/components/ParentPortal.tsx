import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldCheck,
  User,
  GraduationCap,
  CalendarCheck,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  HelpCircle,
  LogOut,
  ChevronRight,
  Printer,
  Mail,
  Phone,
  ArrowRight,
  Calendar,
  Edit2,
  Save,
  X,
  BookOpen,
  Coffee,
  Building,
  FileDown,
  Bell,
  BellOff,
  BellRing,
  Smartphone,
  Share,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  CalendarRange,
} from 'lucide-react';
import type {
  Representante,
  PortalRepresentanteData,
  EstadoAsistencia,
  Horario,
  RecesoInstitucional,
  LoginResponse,
  LapsoEscolar,
  LapsoBreakdownStats,
} from '../types.ts';
import {
  loginWithCredentials,
  fetchPortalRepresentante,
  updateRepresentante,
  fetchVapidPublicKey,
  fetchPushStatus,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
  sendTestPushNotification,
} from '../lib/api.ts';
import { formatCedula, formatDateEs, formatTime } from '../lib/utils.ts';
import { generateStudentAttendancePDF } from '../lib/pdfGenerator.ts';
import { InstallPWAButton } from './InstallPWAButton.tsx';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function subscriptionKeyMatches(
  sub: PushSubscription | null,
  serverVapidPublicKey: string
): boolean {
  try {
    const existingBuf = sub?.options?.applicationServerKey;
    if (!existingBuf || !serverVapidPublicKey) return false;
    const existingBytes = new Uint8Array(existingBuf);
    const serverBytes = urlBase64ToUint8Array(serverVapidPublicKey);
    if (existingBytes.length !== serverBytes.length) return false;
    for (let i = 0; i < existingBytes.length; i++) {
      if (existingBytes[i] !== serverBytes[i]) return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function waitForActiveServiceWorker(
  registration: ServiceWorkerRegistration,
  timeoutMs: number = 6000
): Promise<ServiceWorkerRegistration> {
  if (registration.active) return registration;
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('El Service Worker tardó demasiado en activarse. Recargue la página e intente nuevamente.'));
      }
    }, timeoutMs);

    navigator.serviceWorker.ready
      .then((readyReg) => {
        if (!settled) {
          settled = true;
          window.clearTimeout(timer);
          resolve(readyReg);
        }
      })
      .catch((err) => {
        if (!settled) {
          settled = true;
          window.clearTimeout(timer);
          reject(err);
        }
      });
  });
}

interface ParentPortalProps {
  initialRepresentante?: Representante | null;
  onLogout: () => void;
  availableRepresentantes: Representante[];
  onSwitchToStaff?: () => void;
  onAuthSuccess?: (response: LoginResponse) => void;
  onLoginSuccess?: (rep: Representante) => void;
}

const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];

export const ParentPortal: React.FC<ParentPortalProps> = ({
  initialRepresentante,
  onLogout,
  onSwitchToStaff,
  onAuthSuccess,
  onLoginSuccess,
}) => {
  // Authentication & session state
  const [authedRep, setAuthedRep] = useState<Representante | null>(initialRepresentante || null);
  const [loginUsuario, setLoginUsuario] = useState<string>('');
  const [loginPassword, setLoginPassword] = useState<string>('');
  const [showLoginPassword, setShowLoginPassword] = useState<boolean>(false);
  const [loginLoading, setLoginLoading] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginPortalMismatch, setLoginPortalMismatch] = useState<boolean>(false);

  // Portal Master Data for authenticated representative
  const [portalData, setPortalData] = useState<PortalRepresentanteData | null>(null);
  const [loadingPortal, setLoadingPortal] = useState<boolean>(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  // Active student tab
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);

  // Sub-tabs: 'asistencias' | 'horario' & Lapso filter
  const [activeTab, setActiveTab] = useState<'asistencias' | 'horario'>('asistencias');
  const [selectedLapsoId, setSelectedLapsoId] = useState<number>(0);

  // Edit Profile Modal
  const [profileModalOpen, setProfileModalOpen] = useState<boolean>(false);
  const [profileForm, setProfileForm] = useState<{
    telefono: string;
    email: string;
    usuario: string;
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }>({
    telefono: '',
    email: '',
    usuario: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [savingProfile, setSavingProfile] = useState<boolean>(false);
  const [profileMessage, setProfileMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Web Push & iOS Standalone PWA State (hooks always declared unconditionally at top level)
  const [isIOS] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    const isAppleTouch =
      /iphone|ipad|ipod/i.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    return isAppleTouch;
  });
  const [isStandalone, setIsStandalone] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    );
  });
  const [pushSupported, setPushSupported] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  });
  const [pushSubscribed, setPushSubscribed] = useState<boolean>(false);
  const [pushLoading, setPushLoading] = useState<boolean>(false);
  const [pushTesting, setPushTesting] = useState<boolean>(false);
  const [pushFeedback, setPushFeedback] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [showIOSPushGuide, setShowIOSPushGuide] = useState<boolean>(false);
  const [prefetchedVapidKey, setPrefetchedVapidKey] = useState<string | null>(null);
  const [isEmbeddedIframe] = useState<boolean>(() => {
    try {
      return typeof window !== 'undefined' && window.self !== window.top;
    } catch {
      return true;
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(display-mode: standalone)');
    const updateMode = () => {
      const standaloneNow =
        mq.matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true;
      setIsStandalone(standaloneNow);
      setPushSupported(
        'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
      );
    };
    updateMode();
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', updateMode);
      return () => mq.removeEventListener('change', updateMode);
    }
  }, []);

  useEffect(() => {
    if (initialRepresentante) {
      setAuthedRep(initialRepresentante);
      if (
        !portalData ||
        portalData.representante.idRepresentante !== initialRepresentante.idRepresentante
      ) {
        loadPortal(initialRepresentante.idRepresentante);
      }
    } else {
      setAuthedRep(null);
      setPortalData(null);
    }
  }, [initialRepresentante]);

  useEffect(() => {
    let active = true;
    async function syncExistingPushSubscription() {
      if (!authedRep) {
        if (active) setPushSubscribed(false);
        return;
      }
      if (!('serviceWorker' in navigator)) {
        if (active) setPushSubscribed(false);
        return;
      }
      try {
        // Pre-registrar Service Worker y precargar VAPID key para conservar el gesto de usuario en iOS Safari
        let registration = await navigator.serviceWorker.getRegistration('/');
        if (!registration) {
          registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        }

        let currentVapidKey = prefetchedVapidKey;
        if (pushSupported && !currentVapidKey) {
          try {
            const { publicKey } = await fetchVapidPublicKey();
            if (active && publicKey) {
              currentVapidKey = publicKey;
              setPrefetchedVapidKey(publicKey);
            }
          } catch {
            // Ignorar si falla temporalmente
          }
        }

        if (!pushSupported || !registration?.pushManager) {
          if (active) setPushSubscribed(false);
          return;
        }

        const existingSub = await registration.pushManager.getSubscription();
        if (!existingSub || Notification.permission !== 'granted') {
          if (active) setPushSubscribed(false);
          return;
        }

        // Verificar si la llave VAPID cambió o si el servidor no tiene registrada esta suscripción
        if (currentVapidKey && !subscriptionKeyMatches(existingSub, currentVapidKey)) {
          try {
            await existingSub.unsubscribe();
            const renewed = await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(
                currentVapidKey
              ) as unknown as BufferSource,
            });
            const subJson = renewed.toJSON();
            if (subJson.endpoint && subJson.keys?.p256dh && subJson.keys?.auth) {
              await subscribeToPushNotifications({
                endpoint: subJson.endpoint,
                keys: { p256dh: subJson.keys.p256dh, auth: subJson.keys.auth },
              });
              if (active) setPushSubscribed(true);
              return;
            }
          } catch {
            if (active) setPushSubscribed(false);
            return;
          }
        }

        // Si el navegador tiene suscripción válida pero el servidor tiene 0 dispositivos activos, re-sincronizar
        try {
          const status = await fetchPushStatus();
          if (status.activeDevices === 0) {
            const subJson = existingSub.toJSON();
            if (subJson.endpoint && subJson.keys?.p256dh && subJson.keys?.auth) {
              await subscribeToPushNotifications({
                endpoint: subJson.endpoint,
                keys: { p256dh: subJson.keys.p256dh, auth: subJson.keys.auth },
              });
            }
          }
        } catch {
          // Continuar con estado local si falla status
        }

        if (active) {
          setPushSubscribed(true);
        }
      } catch {
        if (active) setPushSubscribed(false);
      }
    }
    syncExistingPushSubscription();
    return () => {
      active = false;
    };
  }, [authedRep, pushSupported]);

  const handleTogglePushNotifications = async () => {
    if (!pushSupported) {
      if (isIOS && !isStandalone) {
        setShowIOSPushGuide(true);
        return;
      }
      setPushFeedback({
        type: 'error',
        text: isIOS
          ? 'Tu versión de iOS requiere iOS 16.4 o superior y abrir la app desde la pantalla de inicio para recibir notificaciones push.'
          : 'Este navegador no soporta notificaciones Web Push.',
      });
      return;
    }

    if (typeof window !== 'undefined' && !window.isSecureContext) {
      setPushFeedback({
        type: 'error',
        text: 'Las notificaciones Web Push requieren una conexión segura (HTTPS).',
      });
      return;
    }

    setPushLoading(true);
    setPushFeedback(null);

    try {
      // Desactivar si ya está suscrito
      if (pushSubscribed) {
        const reg =
          (await navigator.serviceWorker.getRegistration('/')) ||
          (await navigator.serviceWorker.getRegistration());
        const sub = reg?.pushManager ? await reg.pushManager.getSubscription() : null;
        if (sub) {
          await unsubscribeFromPushNotifications(sub.endpoint);
          await sub.unsubscribe();
        }
        setPushSubscribed(false);
        setPushFeedback({
          type: 'info',
          text: 'Alertas push desactivadas en este dispositivo.',
        });
        return;
      }

      // En iOS Safari y Chrome, Notification.requestPermission() debe invocarse inmediatamente tras el toque del usuario
      const permission = await Promise.resolve(Notification.requestPermission());
      if (permission !== 'granted') {
        setPushFeedback({
          type: 'error',
          text:
            permission === 'denied'
              ? isEmbeddedIframe
                ? 'El navegador bloqueó los permisos dentro de la vista previa integrada. Abra EduAsist en una pestaña independiente para activar las alertas push.'
                : 'Permiso de notificaciones bloqueado. Habilite las notificaciones para este sitio en la configuración de su navegador.'
              : 'No se concedió permiso para mostrar notificaciones.',
        });
        return;
      }

      // Obtener/registrar Service Worker y clave pública VAPID (usando la precargada si existe)
      let registration = await navigator.serviceWorker.getRegistration('/');
      if (!registration) {
        registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      }
      registration = await waitForActiveServiceWorker(registration);

      const publicKey = prefetchedVapidKey || (await fetchVapidPublicKey()).publicKey;
      if (!publicKey) {
        throw new Error('No se recibió una clave pública VAPID válida desde el servidor.');
      }
      if (!prefetchedVapidKey) {
        setPrefetchedVapidKey(publicKey);
      }
      const applicationServerKey = urlBase64ToUint8Array(publicKey);

      let subscription = await registration.pushManager.getSubscription();
      if (subscription && !subscriptionKeyMatches(subscription, publicKey)) {
        // Evitar InvalidStateError si la clave VAPID cambió
        await subscription.unsubscribe();
        subscription = null;
      }

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey as unknown as BufferSource,
        });
      }

      const subJson = subscription.toJSON();
      if (!subJson.endpoint || !subJson.keys?.p256dh || !subJson.keys?.auth) {
        throw new Error('La suscripción generada por el navegador está incompleta.');
      }

      await subscribeToPushNotifications({
        endpoint: subJson.endpoint,
        keys: {
          p256dh: subJson.keys.p256dh,
          auth: subJson.keys.auth,
        },
      });

      setPushSubscribed(true);
      setPushFeedback({
        type: 'success',
        text: '¡Alertas activadas! Recibirá una notificación en tiempo real cada vez que se registre o actualice la asistencia.',
      });
    } catch (err: any) {
      console.error('Error toggling Web Push subscription:', err);
      const rawMsg = String(err?.message || '');
      const friendlyMsg =
        err?.name === 'NotAllowedError' || rawMsg.toLowerCase().includes('permission')
          ? isEmbeddedIframe
            ? 'Las notificaciones están bloqueadas dentro de la vista integrada. Abra EduAsist directamente en una pestaña nueva del navegador para activarlas.'
            : 'Permiso denegado por el navegador. Revise los permisos de notificaciones del sitio.'
          : rawMsg || 'No se pudieron configurar las notificaciones push en este dispositivo.';
      setPushFeedback({
        type: 'error',
        text: friendlyMsg,
      });
    } finally {
      setPushLoading(false);
    }
  };

  const handleTestPushNotification = async () => {
    setPushTesting(true);
    setPushFeedback(null);
    try {
      const res = await sendTestPushNotification();
      setPushFeedback({
        type: res.success ? 'success' : 'error',
        text: res.message,
      });
      if (!res.success && res.expiredRemoved > 0) {
        setPushSubscribed(false);
      }
    } catch (err: any) {
      setPushFeedback({
        type: 'error',
        text: err?.message || 'No se pudo enviar la notificación de prueba.',
      });
    } finally {
      setPushTesting(false);
    }
  };

  const loadPortal = async (idRep: number) => {
    setLoadingPortal(true);
    setPortalError(null);
    try {
      const data = await fetchPortalRepresentante(idRep);
      setPortalData(data);
      if (data.estudiantes && data.estudiantes.length > 0) {
        setSelectedStudentId(data.estudiantes[0].idEstudiante);
      }
    } catch (err: any) {
      console.error('Error fetching portal data:', err);
      setPortalError(err.message || 'No se pudieron cargar los datos escolares de sus representados.');
    } finally {
      setLoadingPortal(false);
    }
  };

  const handleCredentialLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);

    const cleanUser = loginUsuario.trim();
    if (!cleanUser) {
      setLoginError('Debe ingresar su usuario, correo electrónico o cédula registrada.');
      return;
    }
    if (!loginPassword) {
      setLoginError('Debe ingresar su contraseña.');
      return;
    }

    setLoginLoading(true);
    setLoginPortalMismatch(false);
    try {
      const response = await loginWithCredentials(cleanUser, loginPassword, 'representante');
      if (response.type !== 'representante' || !response.representante) {
        setLoginPortalMismatch(true);
        setLoginError(
          'Las cuentas del personal institucional deben ingresar exclusivamente a través del Panel Institucional.'
        );
        return;
      }
      if (onAuthSuccess) {
        await onAuthSuccess(response);
      } else {
        setAuthedRep(response.representante);
        await loadPortal(response.representante.idRepresentante);
        onLoginSuccess?.(response.representante);
      }
    } catch (err: any) {
      if (err?.code === 'PORTAL_MISMATCH') {
        setLoginPortalMismatch(true);
      }
      setLoginError(
        err?.message ||
          'No se pudo iniciar sesión. Verifique su usuario y contraseña e intente nuevamente.'
      );
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLocalLogout = async () => {
    setAuthedRep(null);
    setPortalData(null);
    await onLogout();
  };

  const openProfileModal = () => {
    if (!authedRep) return;
    setProfileForm({
      telefono: authedRep.telefono || '',
      email: authedRep.email || '',
      usuario: authedRep.usuario || '',
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    });
    setProfileMessage(null);
    setProfileModalOpen(true);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authedRep) return;

    const wantsPasswordChange =
      profileForm.currentPassword.length > 0 ||
      profileForm.newPassword.length > 0 ||
      profileForm.confirmPassword.length > 0;

    if (wantsPasswordChange) {
      if (!profileForm.currentPassword) {
        setProfileMessage({
          type: 'error',
          text: 'Debe ingresar su contraseña actual para confirmar el cambio.',
        });
        return;
      }
      if (profileForm.newPassword.length < 6) {
        setProfileMessage({
          type: 'error',
          text: 'La nueva contraseña debe tener al menos 6 caracteres.',
        });
        return;
      }
      if (profileForm.newPassword !== profileForm.confirmPassword) {
        setProfileMessage({
          type: 'error',
          text: 'La nueva contraseña y su confirmación no coinciden.',
        });
        return;
      }
    }

    setSavingProfile(true);
    setProfileMessage(null);

    try {
      const updated = await updateRepresentante(authedRep.idRepresentante, {
        telefono: profileForm.telefono.trim() || undefined,
        ...(wantsPasswordChange
          ? {
              currentPassword: profileForm.currentPassword,
              newPassword: profileForm.newPassword,
            }
          : {}),
      });

      setAuthedRep(updated);
      setProfileMessage({
        type: 'success',
        text: wantsPasswordChange
          ? 'Datos de contacto y contraseña actualizados correctamente.'
          : 'Teléfono de contacto actualizado correctamente.',
      });
      setTimeout(() => {
        setProfileModalOpen(false);
        loadPortal(authedRep.idRepresentante);
      }, 1200);
    } catch (err: any) {
      setProfileMessage({ type: 'error', text: err.message || 'Error al actualizar perfil' });
    } finally {
      setSavingProfile(false);
    }
  };

  // If NOT authenticated, show the clean Representative Login Screen
  if (!authedRep) {
    return (
      <div className="max-w-md mx-auto py-8 sm:py-12 px-3 animate-in fade-in duration-200">
        <div className="bg-white dark:bg-[#121212] p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-[#27272A] shadow-xl">
          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center border border-emerald-100 dark:border-emerald-800 mb-3 shadow-sm">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-extrabold uppercase bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
              Portal del Representante
            </span>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-[#F4F4F5] mt-2.5">
              Acceso a Padres & Tutores
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Consulta en tiempo real de asistencias, puntualidad y horarios escolares
            </p>
          </div>

          {loginError && (
            <div
              role="alert"
              className="mb-5 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300 text-xs font-semibold space-y-2.5"
            >
              <div className="flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
                <span>{loginError}</span>
              </div>
              {loginPortalMismatch && onSwitchToStaff && (
                <button
                  type="button"
                  onClick={onSwitchToStaff}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold transition-colors cursor-pointer"
                >
                  <span>Ir al Panel Institucional</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          <form onSubmit={handleCredentialLogin} className="space-y-4" noValidate>
            <div>
              <label
                htmlFor="rep-login-usuario"
                className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Usuario, Correo Electrónico o Cédula
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="rep-login-usuario"
                  type="text"
                  autoComplete="username"
                  placeholder="Ej: correo@email.com o V-14589230"
                  value={loginUsuario}
                  onChange={(e) => {
                    setLoginUsuario(e.target.value);
                    if (loginError) setLoginError(null);
                  }}
                  disabled={loginLoading}
                  className="w-full bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-[#F4F4F5] rounded-xl pl-10 pr-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors disabled:opacity-60"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="rep-login-password"
                className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Contraseña
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="rep-login-password"
                  type={showLoginPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Ingrese su contraseña"
                  value={loginPassword}
                  onChange={(e) => {
                    setLoginPassword(e.target.value);
                    if (loginError) setLoginError(null);
                  }}
                  disabled={loginLoading}
                  className="w-full bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] text-slate-900 dark:text-[#F4F4F5] rounded-xl pl-10 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
                  aria-label={showLoginPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                >
                  {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full py-3.5 px-4 rounded-xl font-bold text-xs sm:text-sm bg-emerald-600 hover:bg-emerald-700 text-white transition-all shadow-md shadow-emerald-100 dark:shadow-none flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer"
            >
              {loginLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Verificando credenciales...</span>
                </>
              ) : (
                <>
                  <span>Ingresar al Portal</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <p className="text-[11px] text-center text-slate-500 dark:text-slate-400 leading-relaxed">
              Ingrese con las credenciales registradas por el plantel en su ficha de representante. Si no recuerda su clave, solicite su restablecimiento en Coordinación.
            </p>
          </form>

          {/* Enlace directo al Panel Institucional */}
          <div className="mt-6 pt-5 border-t border-slate-100 dark:border-[#27272A] space-y-3">
            {onSwitchToStaff && (
              <div className="p-3.5 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/80 dark:border-indigo-900 flex items-center justify-between gap-3">
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 flex items-center justify-center shrink-0">
                    <Building className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-indigo-950 dark:text-indigo-200">
                      ¿Eres Personal Institucional?
                    </p>
                    <p className="text-[11px] text-indigo-800 dark:text-indigo-300/80">
                      Accede como Director, Coordinador o Docente
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onSwitchToStaff}
                  className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center space-x-1 shrink-0 cursor-pointer shadow-xs transition-colors"
                >
                  <span>Ir al Panel</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <InstallPWAButton accent="emerald" />

            <div className="flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500 pt-1">
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                Autenticación Local Bcrypt + JWT
              </span>
              <span>Acceso Privado</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Current active student
  const currentStudent = portalData?.estudiantes.find(
    (s) => s.idEstudiante === selectedStudentId
  ) || portalData?.estudiantes[0];

  const portalLapsos: LapsoEscolar[] = portalData?.lapsos || [];
  const activeLapso: LapsoEscolar | null =
    portalData?.lapsoActivo || portalLapsos.find((l) => l.activo) || null;
  const selectedLapsoObj: LapsoEscolar | null =
    portalLapsos.find((l) => l.id === selectedLapsoId) || null;

  // Student specific attendances (all & filtered by selected lapso)
  const allStudentAttendances = (portalData?.asistencias || []).filter(
    (a) => a.idEstudiante === currentStudent?.idEstudiante
  );

  const studentAttendances = selectedLapsoObj
    ? allStudentAttendances.filter(
        (a) =>
          a.lapsoId === selectedLapsoObj.id ||
          (a.fecha >= selectedLapsoObj.fechaInicio && a.fecha <= selectedLapsoObj.fechaFin)
      )
    : allStudentAttendances;

  const childLapsoBreakdown: LapsoBreakdownStats[] = portalLapsos.map((lapso) => {
    const items = allStudentAttendances.filter(
      (a) =>
        a.lapsoId === lapso.id ||
        (a.fecha >= lapso.fechaInicio && a.fecha <= lapso.fechaFin)
    );
    const total = items.length;
    const presentes = items.filter((a) => a.estado === 'Presente').length;
    const tardes = items.filter((a) => a.estado === 'Tarde').length;
    const ausentes = items.filter((a) => a.estado === 'Ausente').length;
    const justificadosYReposos = items.filter(
      (a) => a.estado === 'Justificado' || a.estado === 'Reposo Médico'
    ).length;
    const porcentajeAsistencia =
      total > 0 ? Math.round(((presentes + tardes + justificadosYReposos) / total) * 100) : 0;

    return {
      lapsoId: lapso.id,
      numeroLapso: lapso.numeroLapso,
      nombre: lapso.nombre,
      fechaInicio: lapso.fechaInicio,
      fechaFin: lapso.fechaFin,
      anioEscolar: lapso.anioEscolar,
      activo: lapso.activo,
      total,
      presentes,
      tardes,
      ausentes,
      justificadosYReposos,
      porcentajeAsistencia,
    };
  });

  // Attendance metrics for this child
  const totalClasses = studentAttendances.length;
  const countPresente = studentAttendances.filter((a) => a.estado === 'Presente').length;
  const countTarde = studentAttendances.filter((a) => a.estado === 'Tarde').length;
  const countAusente = studentAttendances.filter((a) => a.estado === 'Ausente').length;
  const countJustificado = studentAttendances.filter(
    (a) => a.estado === 'Justificado' || a.estado === 'Reposo Médico'
  ).length;

  const attendanceRate =
    totalClasses > 0
      ? Math.round(((countPresente + countTarde * 0.75 + countJustificado) / totalClasses) * 100)
      : 100;

  // Student schedules
  const studentHorarios: Horario[] = currentStudent?.horarios || [];

  const handleExportAttendancePDF = () => {
    if (!currentStudent || !authedRep) return;
    try {
      generateStudentAttendancePDF({
        estudiante: {
          ...currentStudent,
          idRepresentante: authedRep.idRepresentante,
        },
        representante: authedRep,
        nombreAno: currentStudent.nombreNivel || 'Año Escolar',
        nombreSeccion: currentStudent.nombreSeccion || 'A',
        lapsoLabel: selectedLapsoObj
          ? `${selectedLapsoObj.nombre} (${formatDateEs(selectedLapsoObj.fechaInicio)} al ${formatDateEs(selectedLapsoObj.fechaFin)})`
          : 'Todos los Lapsos',
        lapsoBreakdown: childLapsoBreakdown,
        registros: studentAttendances.map((a) => ({
          ...a,
          idMateria: 0,
        })),
        config: {
          nombrePlantel: portalData?.configuracion.nombreInstitucion,
          anoLectivo: portalData?.configuracion.anoLectivo,
        },
      });
    } catch (err) {
      console.error('Error al exportar PDF de asistencia del representado:', err);
    }
  };

  const recesos: RecesoInstitucional[] = portalData?.recesos || [];

  return (
    <div className="space-y-6">
      {/* Institutional Academic Year & Attendance Banner */}
      <div className="bg-linear-to-r from-emerald-600 via-teal-600 to-indigo-700 text-white p-4 sm:p-5 rounded-3xl shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0">
            <CalendarCheck className="w-5 h-5 text-amber-300" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded-full">
                Período Académico Vigente
              </span>
              <span className="text-xs font-semibold text-emerald-100">
                Año Lectivo {portalData?.configuracion.anoLectivo || '2025 - 2026'}
              </span>
              {activeLapso && (
                <span className="text-[11px] font-bold bg-amber-400/25 text-amber-100 px-2 py-0.5 rounded-full border border-amber-200/30">
                  {activeLapso.nombre}
                </span>
              )}
            </div>
            <h1 className="text-base sm:text-lg font-black tracking-tight mt-0.5">
              Control de Asistencia &amp; Puntualidad Escolar
            </h1>
          </div>
        </div>

        <div className="text-left sm:text-right">
          <p className="text-[11px] text-emerald-100 font-medium">Plantel Oficial</p>
          <p className="text-xs font-bold truncate max-w-xs sm:max-w-md">
            {portalData?.configuracion.nombreInstitucion || 'Liceo Nacional Bolivariano'}
          </p>
        </div>
      </div>

      {/* Representative Profile Header */}
      <div className="bg-white dark:bg-[#121212] p-5 sm:p-6 rounded-3xl border border-slate-200 dark:border-[#27272A] shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-100 dark:border-emerald-800 shrink-0">
              <User className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-[#F4F4F5]">
                  {portalData?.representante.nombres} {portalData?.representante.apellidos}
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-slate-100 dark:bg-[#27272A] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#3F3F46]">
                  {formatCedula(portalData?.representante.cedula || '')}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mt-1">
                {portalData?.representante.telefono ? (
                  <span className="flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    {portalData.representante.telefono}
                  </span>
                ) : (
                  <span className="text-amber-600 dark:text-amber-400 font-medium text-[11px]">
                    (Sin teléfono registrado)
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  {portalData?.representante.email}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
            {(pushSupported || (isIOS && !isStandalone)) && (
              <>
                <button
                  type="button"
                  onClick={handleTogglePushNotifications}
                  disabled={pushLoading}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors flex items-center space-x-1.5 cursor-pointer shadow-2xs border disabled:opacity-50 ${
                    pushSubscribed
                      ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border-emerald-200 dark:border-emerald-800'
                      : 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/60 border-amber-200 dark:border-amber-800'
                  }`}
                  title={
                    !pushSupported && isIOS && !isStandalone
                      ? 'En iPhone/iPad debes agregar la app a la pantalla de inicio para activar alertas push'
                      : pushSubscribed
                      ? 'Notificaciones push activas en este dispositivo (clic para desactivar)'
                      : 'Activar notificaciones push de asistencia en tiempo real'
                  }
                >
                  {!pushSupported && isIOS && !isStandalone ? (
                    <Smartphone className="w-3.5 h-3.5" />
                  ) : pushSubscribed ? (
                    <BellRing className="w-3.5 h-3.5" />
                  ) : (
                    <Bell className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {!pushSupported && isIOS && !isStandalone
                      ? 'Activar Alertas en iOS'
                      : pushLoading
                      ? 'Configurando...'
                      : pushSubscribed
                      ? 'Alertas Push Activas'
                      : 'Activar Alertas Push'}
                  </span>
                </button>

                {pushSubscribed && (
                  <button
                    type="button"
                    onClick={handleTestPushNotification}
                    disabled={pushTesting}
                    className="px-3 py-2 rounded-xl text-xs font-bold text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/40 hover:bg-teal-100 dark:hover:bg-teal-900/60 border border-teal-200 dark:border-teal-800 transition-colors flex items-center space-x-1.5 cursor-pointer shadow-2xs disabled:opacity-50"
                    title="Enviar una notificación de prueba a este dispositivo"
                  >
                    {pushTesting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <BellRing className="w-3.5 h-3.5" />
                    )}
                    <span>{pushTesting ? 'Enviando...' : 'Probar Alerta'}</span>
                  </button>
                )}
              </>
            )}

            <button
              onClick={openProfileModal}
              className="px-3.5 py-2 rounded-xl text-xs font-bold text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800 transition-colors flex items-center space-x-1.5 cursor-pointer shadow-2xs"
              title="Actualizar teléfono de contacto"
            >
              <Edit2 className="w-3.5 h-3.5" />
              <span>Editar Mis Datos</span>
            </button>

            <button
              onClick={handleLocalLogout}
              className="px-3.5 py-2 rounded-xl text-xs font-bold text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-900 transition-colors flex items-center space-x-1.5 cursor-pointer shadow-2xs"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Cerrar Sesión</span>
            </button>
          </div>
        </div>

        {showIOSPushGuide && (
          <div className="mt-4 p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-xs text-indigo-950 dark:text-indigo-200 space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 font-bold text-sm">
                <Smartphone className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <span>Cómo activar Notificaciones Push en iPhone / iPad (iOS 16.4+)</span>
              </div>
              <button
                type="button"
                onClick={() => setShowIOSPushGuide(false)}
                className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
                aria-label="Cerrar guía iOS"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[11px] text-indigo-800 dark:text-indigo-300 leading-relaxed">
              Apple solo permite notificaciones Web Push cuando la aplicación está agregada a la pantalla de inicio:
            </p>
            <ol className="list-decimal list-inside space-y-1 text-[11px] font-medium">
              <li>
                Abre esta página directamente en <strong>Safari</strong> (no desde un navegador interno).
              </li>
              <li>
                Toca el botón <Share className="w-3.5 h-3.5 inline mx-0.5 text-indigo-600 dark:text-indigo-400" />{' '}
                <strong>Compartir</strong> en la barra de Safari.
              </li>
              <li>
                Desliza hacia abajo y selecciona <strong>&ldquo;Agregar a pantalla de inicio&rdquo;</strong>.
              </li>
              <li>
                Abre <strong>EduAsist</strong> desde el nuevo ícono en tu pantalla de inicio, inicia sesión y pulsa{' '}
                <strong>&ldquo;Activar Alertas Push&rdquo;</strong>.
              </li>
            </ol>
          </div>
        )}

        {pushFeedback && (
          <div
            className={`mt-4 p-3 rounded-2xl text-xs font-semibold flex items-center justify-between gap-2 border ${
              pushFeedback.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                : pushFeedback.type === 'error'
                ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300'
                : 'bg-slate-50 dark:bg-[#181818] border-slate-200 dark:border-[#27272A] text-slate-700 dark:text-slate-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {pushFeedback.type === 'success' ? (
                <BellRing className="w-4 h-4 shrink-0" />
              ) : pushFeedback.type === 'error' ? (
                <BellOff className="w-4 h-4 shrink-0" />
              ) : (
                <Bell className="w-4 h-4 shrink-0" />
              )}
              <span>{pushFeedback.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setPushFeedback(null)}
              className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
              aria-label="Cerrar aviso"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Children Selector Tabs */}
        <div className="mt-6 pt-5 border-t border-slate-100 dark:border-[#27272A]">
          <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
            Hijos / Representados Vinculados ({portalData?.estudiantes.length || 0})
          </label>
          <div className="flex flex-wrap gap-2">
            {(portalData?.estudiantes || []).map((student) => {
              const isSelected = student.idEstudiante === currentStudent?.idEstudiante;
              return (
                <button
                  key={student.idEstudiante}
                  onClick={() => setSelectedStudentId(student.idEstudiante)}
                  className={`flex items-center space-x-2.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                    isSelected
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm shadow-emerald-100 dark:shadow-none'
                      : 'bg-slate-50 dark:bg-[#181818] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-[#27272A] hover:bg-slate-100 dark:hover:bg-[#202024]'
                  }`}
                >
                  <GraduationCap className="w-4 h-4" />
                  <div className="text-left">
                    <div>
                      {student.nombres} {student.apellidos}
                    </div>
                    <div
                      className={`font-mono text-[10px] ${
                        isSelected ? 'text-emerald-100' : 'text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      {formatCedula(student.cedula)} • {student.nombreNivel}{' '}
                      {student.nombreSeccion ? `(Sec. ${student.nombreSeccion})` : ''}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Child Specific Navigation & Content */}
      {currentStudent ? (
        <div className="space-y-6">
          {/* Sub Navigation: Asistencias | Horario de Clases */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white dark:bg-[#121212] p-2 rounded-2xl border border-slate-200 dark:border-[#27272A] shadow-2xs">
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => setActiveTab('asistencias')}
                className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'asistencias'
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-[#F4F4F5] hover:bg-slate-100 dark:hover:bg-[#181818]'
                }`}
              >
                <CalendarCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Asistencias & Hora Exacta</span>
              </button>

              <button
                onClick={() => setActiveTab('horario')}
                className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'horario'
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-[#F4F4F5] hover:bg-slate-100 dark:hover:bg-[#181818]'
                }`}
              >
                <Clock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Horario Escolar Semanal</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handleExportAttendancePDF}
              disabled={!currentStudent}
              className="w-full sm:w-auto flex items-center justify-center space-x-1.5 text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800 px-3.5 py-2 rounded-xl transition-all cursor-pointer shadow-2xs disabled:opacity-50 shrink-0 whitespace-nowrap"
              title="Descargar Reporte Oficial de Asistencias en PDF"
            >
              <FileDown className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <span>Descargar Asistencias (PDF)</span>
            </button>
          </div>

          {/* Quick Metrics for Active Child */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white dark:bg-[#121212] p-4 rounded-2xl border border-slate-200 dark:border-[#27272A] shadow-2xs">
              <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Índice de Asistencia
              </p>
              <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                {attendanceRate}%
              </p>
            </div>

            <div className="bg-white dark:bg-[#121212] p-4 rounded-2xl border border-slate-200 dark:border-[#27272A] shadow-2xs">
              <p className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                Asistencias (Presente)
              </p>
              <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-1">
                {countPresente}
              </p>
            </div>

            <div className="bg-white dark:bg-[#121212] p-4 rounded-2xl border border-slate-200 dark:border-[#27272A] shadow-2xs">
              <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                Llegadas Tarde
              </p>
              <p className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">{countTarde}</p>
            </div>

            <div className="bg-white dark:bg-[#121212] p-4 rounded-2xl border border-slate-200 dark:border-[#27272A] shadow-2xs">
              <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 uppercase tracking-wider">
                Inasistencias
              </p>
              <p className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1">{countAusente}</p>
            </div>
          </div>

          {/* Tab 1: Attendance with Exact Server Arrival Time (Table-to-Card on Mobile) */}
          {activeTab === 'asistencias' && (
            <div className="bg-white dark:bg-[#121212] rounded-3xl border border-slate-200 dark:border-[#27272A] shadow-xs overflow-hidden">
              <div className="p-4 bg-slate-50/80 dark:bg-[#181818] border-b border-slate-200 dark:border-[#27272A] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-[#F4F4F5]">
                    Registro Cronológico de Asistencias
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Detalle de cada clase con la hora exacta registrada en el servidor
                  </p>
                </div>
                <div className="w-full sm:w-auto flex flex-wrap items-center gap-2">
                  {portalLapsos.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-1 sm:flex-initial min-w-[160px]">
                      <CalendarRange className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <select
                        value={selectedLapsoId}
                        onChange={(e) => setSelectedLapsoId(Number(e.target.value))}
                        className="w-full sm:w-auto bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#27272A] rounded-xl px-2.5 py-2 text-xs font-bold text-slate-800 dark:text-[#F4F4F5] focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                        aria-label="Filtrar por Lapso Escolar"
                      >
                        <option value={0}>Todos los Lapsos</option>
                        {portalLapsos.map((lapso) => (
                          <option key={lapso.id} value={lapso.id}>
                            {lapso.nombre}
                            {lapso.activo ? ' (Actual)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={handleExportAttendancePDF}
                    disabled={studentAttendances.length === 0}
                    className="flex-1 sm:flex-initial px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-50 transition-colors whitespace-nowrap"
                    title="Exportar reporte de asistencia del estudiante en PDF"
                  >
                    <FileDown className="w-3.5 h-3.5 shrink-0" />
                    <span>Exportar Reporte PDF</span>
                  </button>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 whitespace-nowrap">
                    {studentAttendances.length} clases
                  </span>
                </div>
              </div>

              {studentAttendances.length === 0 ? (
                <div className="p-10 text-center text-slate-500 dark:text-slate-400">
                  <Clock className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Sin asistencias registradas</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Aún no se han asentado asistencias para este estudiante en el ciclo actual.
                  </p>
                </div>
              ) : (
                <>
                  {/* MOBILE VIEW: Tactile Cards for Attendance (< md) */}
                  <div className="block md:hidden p-3 space-y-3">
                    {studentAttendances.map((rec) => {
                      let badgeClass = '';
                      let IconComponent = CheckCircle2;

                      switch (rec.estado) {
                        case 'Presente':
                          badgeClass = 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
                          IconComponent = CheckCircle2;
                          break;
                        case 'Tarde':
                          badgeClass = 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800';
                          IconComponent = Clock;
                          break;
                        case 'Ausente':
                          badgeClass = 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800';
                          IconComponent = XCircle;
                          break;
                        case 'Justificado':
                          badgeClass = 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800';
                          IconComponent = HelpCircle;
                          break;
                        case 'Reposo Médico':
                          badgeClass = 'bg-violet-50 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800';
                          IconComponent = HelpCircle;
                          break;
                      }

                      return (
                        <div
                          key={rec.idAsistencia}
                          className="bg-white dark:bg-[#181818] p-4 rounded-2xl border border-slate-200 dark:border-[#27272A] shadow-2xs space-y-2.5"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h4 className="font-bold text-sm text-slate-900 dark:text-[#F4F4F5]">
                                {rec.nombreMateria}
                              </h4>
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                {formatDateEs(rec.fecha)}
                              </p>
                            </div>
                            <span
                              className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-bold border ${badgeClass} shrink-0`}
                            >
                              <IconComponent className="w-3.5 h-3.5" />
                              <span>{rec.estado}</span>
                            </span>
                          </div>

                          {rec.motivoJustificacion && (
                            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#121212] border border-slate-200/70 dark:border-[#27272A] text-[11px] text-slate-700 dark:text-slate-300 space-y-0.5">
                              <p className="font-medium">
                                {rec.numeroJustificante && (
                                  <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400 mr-1.5">
                                    [{rec.numeroJustificante}]
                                  </span>
                                )}
                                {rec.motivoJustificacion}
                              </p>
                              {(rec.fechaRecepcionDocumento || rec.modificadoPorNombre) && (
                                <p className="text-[10px] text-slate-400 dark:text-slate-500">
                                  {rec.modificadoPorNombre ? `Validado por ${rec.modificadoPorNombre}` : ''}
                                  {rec.fechaRecepcionDocumento ? ` • Recibido: ${formatDateEs(rec.fechaRecepcionDocumento)}` : ''}
                                </p>
                              )}
                            </div>
                          )}

                          <div className="pt-2 border-t border-slate-100 dark:border-[#27272A] flex items-center justify-between text-xs">
                            <span className="text-slate-500 dark:text-slate-400">Hora de Registro:</span>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 dark:bg-[#27272A] font-mono font-bold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#3F3F46]">
                              <Clock className="w-3 h-3 mr-1 text-slate-500 dark:text-slate-400" />
                              {formatTime(rec.horaEntrada)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* DESKTOP VIEW: Full Attendance Table (>= md) */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 dark:bg-[#181818] text-slate-600 dark:text-slate-400 text-xs uppercase font-semibold border-b border-slate-200 dark:border-[#27272A]">
                        <tr>
                          <th className="px-4 py-3">Fecha</th>
                          <th className="px-4 py-3">Hora de Entrada</th>
                          <th className="px-4 py-3">Materia</th>
                          <th className="px-4 py-3">Estado y Justificante</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-[#27272A]">
                        {studentAttendances.map((rec) => {
                          let badgeClass = '';
                          let IconComponent = CheckCircle2;

                          switch (rec.estado) {
                            case 'Presente':
                              badgeClass = 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
                              IconComponent = CheckCircle2;
                              break;
                            case 'Tarde':
                              badgeClass = 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800';
                              IconComponent = Clock;
                              break;
                            case 'Ausente':
                              badgeClass = 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800';
                              IconComponent = XCircle;
                              break;
                            case 'Justificado':
                              badgeClass = 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800';
                              IconComponent = HelpCircle;
                              break;
                            case 'Reposo Médico':
                              badgeClass = 'bg-violet-50 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800';
                              IconComponent = HelpCircle;
                              break;
                          }

                          return (
                            <tr key={rec.idAsistencia} className="hover:bg-slate-50/70 dark:hover:bg-[#181818]/70 transition-colors">
                              <td className="px-4 py-3.5 font-medium text-slate-900 dark:text-[#F4F4F5]">
                                {formatDateEs(rec.fecha)}
                              </td>
                              <td className="px-4 py-3.5 font-mono text-xs font-bold text-slate-700 dark:text-slate-300">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 dark:bg-[#27272A] border border-slate-200 dark:border-[#3F3F46]">
                                  <Clock className="w-3 h-3 mr-1 text-slate-500 dark:text-slate-400" />
                                  {formatTime(rec.horaEntrada)}
                                </span>
                              </td>
                              <td className="px-4 py-3.5 text-slate-800 dark:text-slate-200 font-semibold">
                                {rec.nombreMateria}
                              </td>
                              <td className="px-4 py-3.5">
                                <div className="space-y-1">
                                  <span
                                    className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-bold border ${badgeClass}`}
                                  >
                                    <IconComponent className="w-3.5 h-3.5" />
                                    <span>{rec.estado}</span>
                                  </span>
                                  {rec.motivoJustificacion && (
                                    <p className="text-[11px] text-slate-600 dark:text-slate-300">
                                      {rec.numeroJustificante && (
                                        <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400 mr-1">
                                          [{rec.numeroJustificante}]
                                        </span>
                                      )}
                                      {rec.motivoJustificacion}
                                    </p>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Tab 2: Detailed Weekly Class Schedule */}
          {activeTab === 'horario' && (
            <div className="bg-white dark:bg-[#121212] rounded-3xl border border-slate-200 dark:border-[#27272A] shadow-xs overflow-hidden">
              <div className="p-4 bg-slate-50/80 dark:bg-[#181818] border-b border-slate-200 dark:border-[#27272A] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm text-slate-900 dark:text-[#F4F4F5]">
                      Horario Escolar Semanal de Clases
                    </h3>
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                      {currentStudent.nombreNivel}{' '}
                      {currentStudent.nombreSeccion ? `- Sección ${currentStudent.nombreSeccion}` : ''}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Distribución de asignaturas, aulas asignadas, docentes y bloques de receso institucional
                  </p>
                </div>

                {/* Recess indicator */}
                <div className="flex flex-wrap items-center gap-2">
                  {recesos
                    .filter((r) => r.activo !== false)
                    .map((rec) => (
                      <span
                        key={rec.idReceso}
                        className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 shadow-2xs"
                        title={rec.descripcion || rec.nombre}
                      >
                        <Coffee className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                        <span>{rec.nombre}:</span>
                        <span className="font-mono text-amber-700 dark:text-amber-400">
                          {rec.horaInicio.slice(0, 5)} - {rec.horaFin.slice(0, 5)}
                        </span>
                      </span>
                    ))}
                </div>
              </div>

              {studentHorarios.length === 0 ? (
                <div className="p-10 text-center text-slate-500 dark:text-slate-400">
                  <Clock className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Sin horario asignado</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    La coordinación aún no ha publicado el cronograma de clases para esta sección.
                  </p>
                </div>
              ) : (
                <div className="p-4">
                  {/* Grid of days Lunes a Viernes */}
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                    {DIAS_SEMANA.map((dia) => {
                      const dayClasses = studentHorarios
                        .filter((h) => h.diaSemana === dia)
                        .sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));
                      const activeRecesos = recesos
                        .filter((r) => r.activo !== false)
                        .sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));

                      return (
                        <div
                          key={dia}
                          className="bg-slate-50/70 dark:bg-[#181818] rounded-2xl border border-slate-200 dark:border-[#27272A] overflow-hidden flex flex-col"
                        >
                          <div className="bg-slate-200/80 dark:bg-[#202024] px-3 py-2 text-center border-b border-slate-200 dark:border-[#27272A]">
                            <span className="font-extrabold text-xs uppercase tracking-wider text-slate-800 dark:text-[#F4F4F5]">
                              {dia}
                            </span>
                          </div>

                          <div className="p-2 space-y-2 flex-1">
                            {dayClasses.length === 0 ? (
                              <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center py-6">
                                Sin clases programadas
                              </p>
                            ) : (
                              dayClasses.map((clase, idx) => {
                                const nextClass = dayClasses[idx + 1];
                                const cEnd = clase.horaFin.slice(0, 5);
                                const nextStart = nextClass ? nextClass.horaInicio.slice(0, 5) : null;

                                const recesosAfter = activeRecesos.filter((r) => {
                                  const rStart = r.horaInicio.slice(0, 5);
                                  const rEnd = r.horaFin.slice(0, 5);
                                  return cEnd <= rStart && (!nextStart || nextStart >= rEnd);
                                });

                                return (
                                  <React.Fragment key={clase.idHorario}>
                                    <div className="bg-white dark:bg-[#121212] p-2.5 rounded-xl border border-slate-200 dark:border-[#27272A] shadow-2xs">
                                      <div className="flex items-center justify-between text-[10px] font-mono font-bold text-indigo-700 dark:text-indigo-400 mb-1">
                                        <span className="flex items-center gap-1">
                                          <Clock className="w-3 h-3 text-indigo-500 dark:text-indigo-400" />
                                          {clase.horaInicio.slice(0, 5)} - {clase.horaFin.slice(0, 5)}
                                        </span>
                                        {clase.aula && (
                                          <span className="bg-indigo-50 dark:bg-indigo-950/50 px-1.5 py-0.5 rounded border border-indigo-200 dark:border-indigo-800">
                                            {clase.aula}
                                          </span>
                                        )}
                                      </div>
                                      <p className="font-bold text-xs text-slate-900 dark:text-[#F4F4F5] leading-tight">
                                        {clase.nombreMateria}
                                      </p>
                                      {clase.nombreDocente && (
                                        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1">
                                          <User className="w-3 h-3 text-slate-400" />
                                          <span className="truncate">{clase.nombreDocente}</span>
                                        </p>
                                      )}
                                    </div>

                                    {recesosAfter.map((rec) => (
                                      <div
                                        key={`rec-${clase.idHorario}-${rec.idReceso}`}
                                        className="py-1.5 px-2 rounded-xl bg-amber-50 dark:bg-amber-950/35 text-amber-900 dark:text-amber-200 border border-dashed border-amber-300 dark:border-amber-800/70 text-[10px] font-bold text-center flex flex-col items-center justify-center gap-0.5"
                                        title={rec.descripcion || rec.nombre}
                                      >
                                        <div className="flex items-center gap-1">
                                          <Coffee className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
                                          <span>{rec.nombre}</span>
                                        </div>
                                        <span className="font-mono text-[10px] text-amber-700 dark:text-amber-400">
                                          {rec.horaInicio.slice(0, 5)} - {rec.horaFin.slice(0, 5)}
                                        </span>
                                      </div>
                                    ))}
                                  </React.Fragment>
                                );
                              })
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="p-8 text-center text-slate-500 dark:text-slate-400 bg-white dark:bg-[#121212] rounded-3xl border border-slate-200 dark:border-[#27272A]">
          <GraduationCap className="w-10 h-10 text-slate-400 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No tiene estudiantes asociados a su cuenta</p>
        </div>
      )}

      {/* Edit Profile Modal */}
      {profileModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#121212] rounded-3xl max-w-md w-full max-h-[90vh] overflow-y-auto border border-slate-200 dark:border-[#27272A] shadow-2xl animate-in fade-in duration-200">
            <div className="p-5 border-b border-slate-200 dark:border-[#27272A] flex items-center justify-between bg-slate-50/80 dark:bg-[#181818]">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <Edit2 className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-base text-slate-900 dark:text-[#F4F4F5]">Editar Perfil y Seguridad</h3>
              </div>
              <button
                onClick={() => setProfileModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="p-5 space-y-4">
              {profileMessage && (
                <div
                  className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                    profileMessage.type === 'success'
                      ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                      : 'bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-900'
                  }`}
                >
                  {profileMessage.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
                  )}
                  <span>{profileMessage.text}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Teléfono de Contacto (WhatsApp / Móvil)
                </label>
                <input
                  type="text"
                  placeholder="Ej: 0414-1234567"
                  value={profileForm.telefono}
                  onChange={(e) => setProfileForm({ ...profileForm, telefono: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-[#F4F4F5] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Correo Registrado
                  </label>
                  <input
                    type="email"
                    disabled
                    value={profileForm.email}
                    className="w-full bg-slate-100 dark:bg-[#181818]/70 border border-slate-200 dark:border-[#27272A] rounded-xl px-3 py-2 text-xs text-slate-500 dark:text-slate-400 cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Usuario de Acceso
                  </label>
                  <input
                    type="text"
                    disabled
                    value={profileForm.usuario || 'Cédula o Correo'}
                    className="w-full bg-slate-100 dark:bg-[#181818]/70 border border-slate-200 dark:border-[#27272A] rounded-xl px-3 py-2 text-xs font-mono text-slate-500 dark:text-slate-400 cursor-not-allowed"
                  />
                </div>
              </div>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 -mt-2">
                Para modificar su usuario o correo principal, solicítelo al Coordinador o Director del plantel.
              </p>

              <div className="pt-3 border-t border-slate-100 dark:border-[#27272A] space-y-3">
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Cambiar Contraseña (Opcional)</span>
                </p>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Contraseña Actual
                  </label>
                  <input
                    type="password"
                    autoComplete="current-password"
                    placeholder="Solo si desea cambiar su clave"
                    value={profileForm.currentPassword}
                    onChange={(e) => setProfileForm({ ...profileForm, currentPassword: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-[#F4F4F5] focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Nueva Contraseña
                    </label>
                    <input
                      type="password"
                      autoComplete="new-password"
                      placeholder="Mín. 6 caracteres"
                      value={profileForm.newPassword}
                      onChange={(e) => setProfileForm({ ...profileForm, newPassword: e.target.value })}
                      className="w-full bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-[#F4F4F5] focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Confirmar Nueva
                    </label>
                    <input
                      type="password"
                      autoComplete="new-password"
                      placeholder="Repita la contraseña"
                      value={profileForm.confirmPassword}
                      onChange={(e) => setProfileForm({ ...profileForm, confirmPassword: e.target.value })}
                      className="w-full bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#27272A] rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-[#F4F4F5] focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setProfileModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#181818] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                >
                  <Save className="w-4 h-4" />
                  <span>{savingProfile ? 'Guardando...' : 'Guardar Cambios'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
