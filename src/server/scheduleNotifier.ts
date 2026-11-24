import * as db from './localDb.ts';
import { dispatchMilestonePushNotifications } from './pushService.ts';

const DEFAULT_SCHOOL_TIMEZONE = process.env.SCHOOL_TIMEZONE || 'America/Caracas';

export interface SchoolClock {
  timezone: string;
  dateYmd: string;
  timeHHMM: string;
  minutesOfDay: number;
  dayName: string;
  isWeekend: boolean;
}

export function getSchoolClockInTimezone(date: Date = new Date()): SchoolClock {
  const timezone = DEFAULT_SCHOOL_TIMEZONE;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hour12: false,
    }).formatToParts(date);

    const getPart = (type: string) => parts.find((p) => p.type === type)?.value || '';
    const year = getPart('year');
    const month = getPart('month');
    const day = getPart('day');
    let hour = getPart('hour');
    if (hour === '24') hour = '00';
    const minute = getPart('minute');
    const weekdayShort = getPart('weekday').toLowerCase();

    const dayMap: Record<string, string> = {
      mon: 'Lunes',
      tue: 'Martes',
      wed: 'Miércoles',
      thu: 'Jueves',
      fri: 'Viernes',
      sat: 'Sábado',
      sun: 'Domingo',
    };
    const dayName = dayMap[weekdayShort.slice(0, 3)] || 'Lunes';
    const isWeekend = dayName === 'Sábado' || dayName === 'Domingo';
    const timeHHMM = `${hour}:${minute}`;
    const minutesOfDay = Number(hour) * 60 + Number(minute);

    return {
      timezone,
      dateYmd: `${year}-${month}-${day}`,
      timeHHMM,
      minutesOfDay,
      dayName,
      isWeekend,
    };
  } catch {
    // Fallback si Intl no soporta la zona horaria especificada
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    const dow = date.getDay();
    const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    return {
      timezone: 'local',
      dateYmd: `${year}-${month}-${day}`,
      timeHHMM: `${hour}:${minute}`,
      minutesOfDay: date.getHours() * 60 + date.getMinutes(),
      dayName: dayNames[dow] || 'Lunes',
      isWeekend: dow === 0 || dow === 6,
    };
  }
}

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = String(hhmm || '00:00').slice(0, 5).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export async function triggerMilestonePush(
  tipo: 'receso' | 'salida',
  options: {
    trigger: 'auto' | 'manual';
    mensajePersonalizado?: string;
    author?: {
      idUsuario?: number | null;
      emailOCedula?: string | null;
      rol?: string | null;
      ipOrigen?: string | null;
      userAgent?: string | null;
    };
  }
): Promise<{
  success: boolean;
  tipo: 'receso' | 'salida';
  trigger: 'auto' | 'manual';
  date: string;
  sentAt: string;
  sent: number;
  failed: number;
  targetRepresentantes: number;
  targetDevices: number;
  expiredRemoved: number;
  duracionMs: number;
  message: string;
}> {
  const clock = getSchoolClockInTimezone();
  const [config, targets] = await Promise.all([
    db.getConfiguracion(),
    db.getMilestonePushTargets(),
  ]);

  let sent = 0;
  let failed = 0;
  let expiredRemoved = 0;
  let fallidosRed = 0;
  let duracionMs = 0;

  if (targets.subscriptions.length > 0) {
    const dispatchRes = await dispatchMilestonePushNotifications({
      tipo,
      nombreInstitucion: config.nombreInstitucion,
      horaRecesoInicio: config.horaRecesoInicio,
      horaRecesoFin: config.horaRecesoFin,
      horaSalida: config.horaSalida,
      mensajePersonalizado: options.mensajePersonalizado,
      trigger: options.trigger,
      subscriptions: targets.subscriptions,
      author: options.author,
    });
    sent = dispatchRes.sent;
    failed = dispatchRes.failed;
    expiredRemoved = dispatchRes.metrics.eliminados410;
    fallidosRed = dispatchRes.metrics.fallidosRed;
    duracionMs = dispatchRes.metrics.duracionMs;
  }

  const sentAt = new Date().toISOString();
  await db.recordMilestoneDispatch({
    date: clock.dateYmd,
    tipo,
    sentAt,
    sent,
    failed,
    targetReps: targets.targetRepresentantes,
    trigger: options.trigger,
  });

  await db.logAuditEvent({
    idUsuario: options.author?.idUsuario ?? null,
    emailOCedula: options.author?.emailOCedula ?? 'sistema@eduasist.edu',
    rol: options.author?.rol ?? 'sistema',
    accion:
      tipo === 'receso'
        ? options.trigger === 'auto'
          ? 'PUSH_AUTO_RECESO_ENVIADO'
          : 'PUSH_MANUAL_RECESO_ENVIADO'
        : options.trigger === 'auto'
        ? 'PUSH_AUTO_SALIDA_ENVIADO'
        : 'PUSH_MANUAL_SALIDA_ENVIADO',
    entidad: 'push_notifications',
    idEntidad: `${tipo}:${clock.dateYmd}`,
    ipOrigen: options.author?.ipOrigen ?? null,
    userAgent: options.author?.userAgent ?? null,
    detalles: {
      tipo,
      trigger: options.trigger,
      horaConfigurada: tipo === 'receso' ? config.horaRecesoInicio : config.horaSalida,
      targetRepresentantes: targets.targetRepresentantes,
      totalObjetivos: targets.targetDevices,
      enviadosExitosos: sent,
      eliminados410: expiredRemoved,
      fallidosRed,
      duracionMs,
    },
  });

  const label = tipo === 'receso' ? 'Aviso de Receso' : 'Aviso de Salida';
  const message =
    targets.targetDevices === 0
      ? `${label} registrado. Actualmente no hay dispositivos de representantes suscritos en secciones activas.`
      : sent > 0
      ? `${label} enviado a ${sent} dispositivo(s) de ${targets.targetRepresentantes} representante(s).`
      : `Se intentó enviar ${label} a ${targets.targetDevices} dispositivo(s), pero falló la entrega.`;

  return {
    success: targets.targetDevices === 0 || sent > 0,
    tipo,
    trigger: options.trigger,
    date: clock.dateYmd,
    sentAt,
    sent,
    failed,
    targetRepresentantes: targets.targetRepresentantes,
    targetDevices: targets.targetDevices,
    expiredRemoved,
    duracionMs,
    message,
  };
}

export async function enqueueManualMilestonePush(
  tipo: 'receso' | 'salida',
  options: {
    mensajePersonalizado?: string;
    author?: {
      idUsuario?: number | null;
      emailOCedula?: string | null;
      rol?: string | null;
      ipOrigen?: string | null;
      userAgent?: string | null;
    };
  }
): Promise<{
  success: boolean;
  queued: boolean;
  tipo: 'receso' | 'salida';
  trigger: 'manual';
  date: string;
  sentAt: string;
  sent: number;
  failed: number;
  targetRepresentantes: number;
  targetDevices: number;
  expiredRemoved: number;
  message: string;
}> {
  const clock = getSchoolClockInTimezone();
  const targets = await db.getMilestonePushTargets();

  if (targets.targetDevices === 0) {
    const syncRes = await triggerMilestonePush(tipo, {
      trigger: 'manual',
      mensajePersonalizado: options.mensajePersonalizado,
      author: options.author,
    });
    return {
      ...syncRes,
      trigger: 'manual',
      queued: false,
    };
  }

  setImmediate(() => {
    void triggerMilestonePush(tipo, {
      trigger: 'manual',
      mensajePersonalizado: options.mensajePersonalizado,
      author: options.author,
    }).catch((err) => {
      console.error(`[ScheduleNotifier] Error en despacho asíncrono de hito ${tipo}:`, err);
    });
  });

  const label = tipo === 'receso' ? 'Aviso de Receso' : 'Aviso de Salida';
  return {
    success: true,
    queued: true,
    tipo,
    trigger: 'manual',
    date: clock.dateYmd,
    sentAt: new Date().toISOString(),
    sent: 0,
    failed: 0,
    targetRepresentantes: targets.targetRepresentantes,
    targetDevices: targets.targetDevices,
    expiredRemoved: 0,
    message: `${label} encolado en segundo plano para ${targets.targetDevices} dispositivo(s) de ${targets.targetRepresentantes} representante(s).`,
  };
}

let isCheckingMilestones = false;
let schedulerStarted = false;

export async function checkAndDispatchDailyMilestones(): Promise<void> {
  if (isCheckingMilestones) return;
  isCheckingMilestones = true;

  try {
    const clock = getSchoolClockInTimezone();
    if (clock.isWeekend) return;

    const nonWorkingCheck = await db.verificarDiaNoLaborable(clock.dateYmd);
    if (nonWorkingCheck.esNoLaborable) return;

    const config = await db.getConfiguracion();
    const WINDOW_MINUTES = 2;

    if (config.alertaRecesoActiva) {
      const recesoMin = hhmmToMinutes(config.horaRecesoInicio);
      if (
        recesoMin > 0 &&
        clock.minutesOfDay >= recesoMin &&
        clock.minutesOfDay <= recesoMin + WINDOW_MINUTES
      ) {
        const alreadySent = await db.hasMilestoneDispatchedToday(clock.dateYmd, 'receso', 'auto');
        if (!alreadySent) {
          const res = await triggerMilestonePush('receso', { trigger: 'auto' });
          console.log(
            `[ScheduleNotifier] Auto Receso (${clock.dateYmd} ${clock.timeHHMM}): sent=${res.sent}, targets=${res.targetDevices}`
          );
        }
      }
    }

    if (config.alertaSalidaActiva) {
      const salidaMin = hhmmToMinutes(config.horaSalida);
      if (
        salidaMin > 0 &&
        clock.minutesOfDay >= salidaMin &&
        clock.minutesOfDay <= salidaMin + WINDOW_MINUTES
      ) {
        const alreadySent = await db.hasMilestoneDispatchedToday(clock.dateYmd, 'salida', 'auto');
        if (!alreadySent) {
          const res = await triggerMilestonePush('salida', { trigger: 'auto' });
          console.log(
            `[ScheduleNotifier] Auto Salida (${clock.dateYmd} ${clock.timeHHMM}): sent=${res.sent}, targets=${res.targetDevices}`
          );
        }
      }
    }
  } catch (err) {
    console.error('[ScheduleNotifier] Error verificando hitos horarios diarios:', err);
  } finally {
    isCheckingMilestones = false;
  }
}

export function startInstitutionalMilestoneScheduler(): void {
  if (schedulerStarted) return;
  schedulerStarted = true;

  const timer = setInterval(() => {
    void checkAndDispatchDailyMilestones();
  }, 30_000);
  if (typeof timer.unref === 'function') {
    timer.unref();
  }

  // Verificación inicial diferida (5s después de arrancar el servidor)
  const bootTimer = setTimeout(() => {
    void checkAndDispatchDailyMilestones();
  }, 5_000);
  if (typeof bootTimer.unref === 'function') {
    bootTimer.unref();
  }
}
