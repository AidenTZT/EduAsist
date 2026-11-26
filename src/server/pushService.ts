import fs from 'fs';
import https from 'https';
import path from 'path';
import { performance } from 'perf_hooks';
import * as webPushModule from 'web-push';
import type { PushSubscription as WebPushSubscription } from 'web-push';
import * as db from './localDb.ts';
import { isSafePushEndpointUrl } from './validation.ts';

const webPush = ((webPushModule as any).default || webPushModule) as typeof webPushModule;

const PERSISTENT_VAPID_FILE = path.resolve(process.cwd(), 'data', 'vapid-keys.json');
const FALLBACK_TMP_VAPID_FILE = '/tmp/eduasist-vapid.json';

// Parámetros de control de concurrencia y protección contra colapso
const MIN_CHUNK_SIZE = 25;
const MAX_CHUNK_SIZE = 50;
const DEFAULT_CHUNK_SIZE = 35;

const MIN_CHUNK_DELAY_MS = 50;
const MAX_CHUNK_DELAY_MS = 100;
const DEFAULT_CHUNK_DELAY_MS = 75;

const DEFAULT_PUSH_TIMEOUT_MS = 5000;
const DEFAULT_RETRY_429_BACKOFF_MS = 250;

// Pool de sockets HTTPS reutilizables para evitar agotamiento de descriptores bajo alta concurrencia
const sharedPushHttpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 10_000,
  maxSockets: MAX_CHUNK_SIZE,
  maxFreeSockets: 15,
  timeout: DEFAULT_PUSH_TIMEOUT_MS + 1000,
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampChunkSize(size?: number): number {
  const numeric = Number(size ?? DEFAULT_CHUNK_SIZE);
  if (!Number.isFinite(numeric)) return DEFAULT_CHUNK_SIZE;
  return Math.min(MAX_CHUNK_SIZE, Math.max(MIN_CHUNK_SIZE, Math.floor(numeric)));
}

function clampChunkDelay(delayMs?: number): number {
  const numeric = Number(delayMs ?? DEFAULT_CHUNK_DELAY_MS);
  if (!Number.isFinite(numeric)) return DEFAULT_CHUNK_DELAY_MS;
  return Math.min(MAX_CHUNK_DELAY_MS, Math.max(MIN_CHUNK_DELAY_MS, Math.floor(numeric)));
}

function isHttpsEndpoint(endpoint: string): boolean {
  return String(endpoint || '').trim().toLowerCase().startsWith('https://');
}

interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

let cachedVapidConfig: VapidConfig | null = null;
let vapidInitPromise: Promise<VapidConfig> | null = null;

function normalizeVapidSubject(rawSubject?: string): string {
  const cleaned = rawSubject?.trim();
  if (cleaned && (cleaned.startsWith('mailto:') || cleaned.startsWith('https://'))) {
    return cleaned;
  }
  return 'mailto:notificaciones@eduasist.edu';
}

function isValidVapidKeyPair(publicKey?: string, privateKey?: string): boolean {
  if (!publicKey || !privateKey) return false;
  try {
    const pubBuf = Buffer.from(publicKey.trim(), 'base64url');
    const privBuf = Buffer.from(privateKey.trim(), 'base64url');
    // P-256 uncompressed public key is 65 bytes starting with 0x04; private key is 32 bytes
    if (pubBuf.length !== 65 || pubBuf[0] !== 0x04 || privBuf.length !== 32) {
      return false;
    }
    webPush.setVapidDetails('mailto:notificaciones@eduasist.edu', publicKey.trim(), privateKey.trim());
    return true;
  } catch {
    return false;
  }
}

function readPersistedVapidKeys(): { publicKey: string; privateKey: string } | null {
  for (const filePath of [PERSISTENT_VAPID_FILE, FALLBACK_TMP_VAPID_FILE]) {
    try {
      if (fs.existsSync(filePath)) {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        if (isValidVapidKeyPair(raw?.publicKey, raw?.privateKey)) {
          const keys = {
            publicKey: String(raw.publicKey).trim(),
            privateKey: String(raw.privateKey).trim(),
          };
          if (filePath === FALLBACK_TMP_VAPID_FILE && !fs.existsSync(PERSISTENT_VAPID_FILE)) {
            writePersistedVapidKeys(keys.publicKey, keys.privateKey);
          }
          return keys;
        }
      }
    } catch {
      // Ignorar archivo corrupto o ilegible
    }
  }
  return null;
}

function writePersistedVapidKeys(publicKey: string, privateKey: string): void {
  const payload = JSON.stringify({ publicKey, privateKey }, null, 2);
  try {
    fs.mkdirSync(path.dirname(PERSISTENT_VAPID_FILE), { recursive: true });
    fs.writeFileSync(PERSISTENT_VAPID_FILE, payload, 'utf-8');
  } catch {
    // Fallback a /tmp si data/ no es escribible
  }
  try {
    fs.writeFileSync(FALLBACK_TMP_VAPID_FILE, payload, 'utf-8');
  } catch {
    // Ignorar si /tmp no es escribible
  }
}

/**
 * Resuelve e inicializa las llaves VAPID para Web Push:
 * 1. Prioriza variables de entorno VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY y VAPID_SUBJECT si son válidas.
 * 2. Si faltan o tienen valores inválidos/placeholder, reutiliza o genera un par ECDSA P-256 válido
 *    y lo persiste en data/vapid-keys.json.
 */
async function ensureVapidConfigured(): Promise<VapidConfig> {
  if (cachedVapidConfig) {
    return cachedVapidConfig;
  }

  if (vapidInitPromise) {
    return vapidInitPromise;
  }

  vapidInitPromise = (async () => {
    const envPublic = process.env.VAPID_PUBLIC_KEY?.trim();
    const envPrivate = process.env.VAPID_PRIVATE_KEY?.trim();
    const subject = normalizeVapidSubject(process.env.VAPID_SUBJECT);

    let publicKey = '';
    let privateKey = '';

    if (envPublic && envPrivate && isValidVapidKeyPair(envPublic, envPrivate)) {
      publicKey = envPublic;
      privateKey = envPrivate;
    } else {
      if (envPublic || envPrivate) {
        console.warn(
          '[WebPush] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY en entorno no son llaves ECDSA P-256 válidas. Usando llaves persistidas del sistema.'
        );
      }

      const persisted = readPersistedVapidKeys();
      if (persisted) {
        publicKey = persisted.publicKey;
        privateKey = persisted.privateKey;
      } else {
        const generated = webPush.generateVAPIDKeys();
        publicKey = generated.publicKey;
        privateKey = generated.privateKey;
        writePersistedVapidKeys(publicKey, privateKey);
        console.log('[WebPush] Par de llaves VAPID ECDSA P-256 generado y persistido.');
      }
    }

    webPush.setVapidDetails(subject, publicKey, privateKey);
    cachedVapidConfig = {
      publicKey,
      privateKey,
      subject,
    };

    return cachedVapidConfig;
  })().finally(() => {
    vapidInitPromise = null;
  });

  return vapidInitPromise;
}

export async function getVapidPublicKey(): Promise<string> {
  const cfg = await ensureVapidConfigured();
  return cfg.publicKey;
}

// ---------------------------------------------------------------------------
// Motor Blindado de Despacho por Lotes (Chunking + Aislamiento + Auto-Limpieza)
// ---------------------------------------------------------------------------
export interface ResilientPushTask {
  endpoint: string;
  subscription: WebPushSubscription;
  payload: string;
  TTL?: number;
  urgency?: 'very-low' | 'low' | 'normal' | 'high';
}

export interface PushAuditAuthor {
  idUsuario?: number | null;
  emailOCedula?: string | null;
  rol?: string | null;
  ipOrigen?: string | null;
  userAgent?: string | null;
}

export interface PushDispatchMetrics {
  totalObjetivos: number;
  enviadosExitosos: number;
  eliminados410: number;
  fallidosRed: number;
  reintentos429: number;
  reintentosExitosos429: number;
  duracionMs: number;
}

export interface ResilientPushDispatchResult {
  sent: number;
  failed: number;
  expiredEndpoints: string[];
  lastError?: string;
  metrics: PushDispatchMetrics;
}

export interface DispatchBatchOptions {
  context: string;
  chunkSize?: number;
  chunkDelayMs?: number;
  timeoutMs?: number;
  retry429BackoffMs?: number;
  dryRun?: boolean;
  autoCleanupExpired?: boolean;
  recordAudit?: boolean;
  auditMeta?: Record<string, unknown>;
  author?: PushAuditAuthor;
  customSender?: (task: ResilientPushTask, timeoutMs: number, attempt: number) => Promise<unknown>;
}

interface SingleSendOutcome {
  ok: boolean;
  statusCode?: number;
  errorMessage?: string;
  isTimeout?: boolean;
}

/**
 * Envuelve una llamada individual a `webPush.sendNotification` (con timeout de 5000ms)
 * garantizando aislamiento total de errores y liberación determinística de temporizadores.
 */
async function sendSingleTaskIsolated(
  task: ResilientPushTask,
  timeoutMs: number,
  attempt: number,
  customSender?: (task: ResilientPushTask, timeoutMs: number, attempt: number) => Promise<unknown>
): Promise<SingleSendOutcome> {
  if (!customSender && !isSafePushEndpointUrl(task.endpoint)) {
    return {
      ok: false,
      statusCode: 400,
      errorMessage: 'Endpoint Web Push bloqueado por política de seguridad HTTPS.',
    };
  }
  let guardTimer: NodeJS.Timeout | null = null;
  try {
    const sendPromise = customSender
      ? customSender(task, timeoutMs, attempt)
      : webPush.sendNotification(task.subscription, task.payload, {
          timeout: timeoutMs,
          TTL: task.TTL ?? 3600,
          urgency: task.urgency ?? 'normal',
          ...(isHttpsEndpoint(task.endpoint) ? { agent: sharedPushHttpsAgent } : {}),
        });

    const timeoutGuardPromise = new Promise<never>((_, reject) => {
      guardTimer = setTimeout(() => {
        const timeoutErr = new Error(`Push request timeout tras ${timeoutMs}ms`) as Error & {
          code?: string;
          isTimeout?: boolean;
        };
        timeoutErr.code = 'ETIMEDOUT';
        timeoutErr.isTimeout = true;
        reject(timeoutErr);
      }, timeoutMs + 500);
      if (typeof guardTimer.unref === 'function') {
        guardTimer.unref();
      }
    });

    await Promise.race([sendPromise, timeoutGuardPromise]);
    return { ok: true };
  } catch (err: any) {
    const rawStatus = Number(err?.statusCode ?? err?.status ?? 0);
    const statusCode = Number.isFinite(rawStatus) && rawStatus > 0 ? rawStatus : undefined;
    const isTimeout = Boolean(err?.isTimeout || err?.code === 'ETIMEDOUT' || err?.code === 'ESOCKETTIMEDOUT');
    const errorMessage =
      err?.body || err?.message || (statusCode ? `HTTP ${statusCode}` : 'Error de red Web Push');
    return {
      ok: false,
      statusCode,
      errorMessage: String(errorMessage),
      isTimeout,
    };
  } finally {
    if (guardTimer) {
      clearTimeout(guardTimer);
      guardTimer = null;
    }
  }
}

/**
 * Despacha notificaciones en tandas controladas (25-50 por lote) con Promise.allSettled,
 * pausa entre lotes (50-100ms), reintento único no bloqueante para HTTP 429,
 * eliminación automática de tokens 410/404 y registro de métricas en auditLogs.
 */
export async function dispatchPushTasksResilient(
  tasks: ResilientPushTask[],
  options: DispatchBatchOptions
): Promise<ResilientPushDispatchResult> {
  const startedAt = performance.now();

  if (!tasks || tasks.length === 0) {
    return {
      sent: 0,
      failed: 0,
      expiredEndpoints: [],
      metrics: {
        totalObjetivos: 0,
        enviadosExitosos: 0,
        eliminados410: 0,
        fallidosRed: 0,
        reintentos429: 0,
        reintentosExitosos429: 0,
        duracionMs: 0,
      },
    };
  }

  const chunkSize = clampChunkSize(options.chunkSize);
  const chunkDelayMs = clampChunkDelay(options.chunkDelayMs);
  const timeoutMs = Math.max(1000, Number(options.timeoutMs ?? DEFAULT_PUSH_TIMEOUT_MS));
  const retry429BackoffMs = Math.max(50, Number(options.retry429BackoffMs ?? DEFAULT_RETRY_429_BACKOFF_MS));
  const dryRun = Boolean(options.dryRun);
  const autoCleanupExpired = options.autoCleanupExpired ?? !dryRun;
  const recordAudit = options.recordAudit ?? !dryRun;

  if (!options.customSender && !dryRun) {
    await ensureVapidConfigured();
  }

  let enviadosExitosos = 0;
  let eliminados410 = 0;
  let fallidosRed = 0;
  let otherInvalidCount = 0;
  let reintentos429 = 0;
  let reintentosExitosos429 = 0;
  let lastError: string | undefined;

  const expiredEndpointsSet = new Set<string>();
  const succeededEndpointsSet = new Set<string>();
  const retry429Queue: ResilientPushTask[] = [];

  const handleOutcome = (
    task: ResilientPushTask,
    outcome: SingleSendOutcome,
    allowRetry429: boolean
  ) => {
    if (outcome.ok) {
      enviadosExitosos += 1;
      succeededEndpointsSet.add(task.endpoint);
      if (!allowRetry429) {
        reintentosExitosos429 += 1;
      }
      return;
    }

    const status = outcome.statusCode;
    if (outcome.errorMessage) {
      lastError = outcome.errorMessage;
    }

    // 410 Gone o 404 Not Found -> suscripción muerta/caducada para auto-limpieza
    if (status === 410 || status === 404) {
      eliminados410 += 1;
      expiredEndpointsSet.add(task.endpoint);
      return;
    }

    // 401/403 VAPID mismatch -> suscripción irrecuperable con las llaves actuales
    if (status === 401 || status === 403) {
      otherInvalidCount += 1;
      expiredEndpointsSet.add(task.endpoint);
      return;
    }

    // 429 Too Many Requests -> encolar para máximo 1 reintento sin bloquear el lote actual
    if (status === 429 && allowRetry429) {
      retry429Queue.push(task);
      return;
    }

    // Errores de red, timeout o 429 en segundo intento
    fallidosRed += 1;
    if (!dryRun) {
      console.warn(
        `[WebPush:${options.context}] Fallo aislado (${status || (outcome.isTimeout ? 'TIMEOUT' : 'NET')}): ${outcome.errorMessage}`
      );
    }
  };

  // FASE 1: Procesamiento por lotes controlados (25-50 por tanda)
  for (let i = 0; i < tasks.length; i += chunkSize) {
    const chunk = tasks.slice(i, i + chunkSize);
    const settled = await Promise.allSettled(
      chunk.map((task) => sendSingleTaskIsolated(task, timeoutMs, 1, options.customSender))
    );

    settled.forEach((entry, idx) => {
      const task = chunk[idx];
      if (entry.status === 'fulfilled') {
        handleOutcome(task, entry.value, true);
      } else {
        fallidosRed += 1;
        lastError = String(entry.reason?.message || entry.reason || 'Error inesperado en lote push');
      }
    });

    if (i + chunkSize < tasks.length) {
      await sleep(chunkDelayMs);
    }
  }

  // FASE 2: Reintento único no bloqueante para respuestas 429 Too Many Requests
  if (retry429Queue.length > 0) {
    reintentos429 = retry429Queue.length;
    await sleep(retry429BackoffMs);

    for (let i = 0; i < retry429Queue.length; i += chunkSize) {
      const retryChunk = retry429Queue.slice(i, i + chunkSize);
      const settledRetry = await Promise.allSettled(
        retryChunk.map((task) => sendSingleTaskIsolated(task, timeoutMs, 2, options.customSender))
      );

      settledRetry.forEach((entry, idx) => {
        const task = retryChunk[idx];
        if (entry.status === 'fulfilled') {
          handleOutcome(task, entry.value, false);
        } else {
          fallidosRed += 1;
          lastError = String(entry.reason?.message || entry.reason || 'Error en reintento 429');
        }
      });

      if (i + chunkSize < retry429Queue.length) {
        await sleep(chunkDelayMs);
      }
    }
  }

  const expiredEndpoints = Array.from(expiredEndpointsSet);
  const succeededEndpoints = !dryRun ? Array.from(succeededEndpointsSet) : [];
  const duracionMs = Math.max(1, Math.round(performance.now() - startedAt));
  const metrics: PushDispatchMetrics = {
    totalObjetivos: tasks.length,
    enviadosExitosos,
    eliminados410,
    fallidosRed,
    reintentos429,
    reintentosExitosos429,
    duracionMs,
  };

  try {
    await db.finalizePushDispatchBatch({
      expiredEndpoints: autoCleanupExpired ? expiredEndpoints : [],
      succeededEndpoints,
      auditEntry: recordAudit
        ? {
            idUsuario: options.author?.idUsuario ?? null,
            emailOCedula: options.author?.emailOCedula ?? 'sistema@eduasist.edu',
            rol: options.author?.rol ?? 'sistema',
            ipOrigen: options.author?.ipOrigen ?? null,
            userAgent: options.author?.userAgent ?? null,
            accion: 'PUSH_LOTE_DESPACHADO',
            entidad: 'push_notifications',
            idEntidad: options.context,
            detalles: {
              contexto: options.context,
              chunkSize,
              chunkDelayMs,
              ...metrics,
              ...(options.auditMeta || {}),
            },
          }
        : null,
    });
  } catch (finalizeErr) {
    console.warn('[WebPush] Error consolidando cierre de lote push:', finalizeErr);
  }

  return {
    sent: enviadosExitosos,
    failed: eliminados410 + otherInvalidCount + fallidosRed,
    expiredEndpoints,
    lastError,
    metrics,
  };
}

// ---------------------------------------------------------------------------
// Constructores y Despachadores Específicos de Dominio Escolar
// ---------------------------------------------------------------------------
export function buildAttendanceNotificationDetails(params: {
  estudianteNombreCompleto: string;
  nombreMateria: string;
  estado: string;
  fecha: string;
  horaEntrada: string;
  motivoJustificacion?: string | null;
}): { title: string; body: string } {
  const {
    estudianteNombreCompleto,
    nombreMateria,
    estado,
    fecha,
    horaEntrada,
    motivoJustificacion,
  } = params;

  const horaCorta = horaEntrada ? horaEntrada.slice(0, 5) : '';
  let title = `Asistencia Escolar • ${nombreMateria}`;
  let body = `${estudianteNombreCompleto} registró estado "${estado}" en ${nombreMateria}.`;

  switch (estado) {
    case 'Presente':
      title = `Ingreso a Clases • ${nombreMateria}`;
      body = `${estudianteNombreCompleto} ingresó a clases de ${nombreMateria}${horaCorta ? ` a las ${horaCorta}` : ''}.`;
      break;
    case 'Tarde':
      title = `Aviso de Retardo • ${nombreMateria}`;
      body = `${estudianteNombreCompleto} llegó tarde a ${nombreMateria}${horaCorta ? ` (${horaCorta})` : ''}.`;
      break;
    case 'Ausente':
      title = `Alerta de Inasistencia • ${nombreMateria}`;
      body = `${estudianteNombreCompleto} no asistió a clases de ${nombreMateria} (${fecha}).`;
      break;
    case 'Justificado':
      title = `Inasistencia Justificada • ${nombreMateria}`;
      body = `Se validó justificante para ${estudianteNombreCompleto} en ${nombreMateria} (${fecha})${
        motivoJustificacion ? `: ${motivoJustificacion}` : '.'
      }`;
      break;
    case 'Reposo Médico':
      title = `Reposo Médico Validado • ${nombreMateria}`;
      body = `Se registró reposo médico para ${estudianteNombreCompleto} en ${nombreMateria} (${fecha})${
        motivoJustificacion ? `: ${motivoJustificacion}` : '.'
      }`;
      break;
  }

  return { title, body };
}

function buildAttendanceNotificationPayload(params: {
  estudianteNombreCompleto: string;
  nombreMateria: string;
  estado: string;
  fecha: string;
  horaEntrada: string;
  idEstudiante: number;
  idMateria: number;
  motivoJustificacion?: string | null;
}) {
  const { title, body } = buildAttendanceNotificationDetails(params);

  return JSON.stringify({
    title,
    body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: `asistencia-${params.idEstudiante}-${params.idMateria}-${params.fecha}`,
    renotify: true,
    requireInteraction: params.estado === 'Ausente',
    data: {
      url: '/#portal-representante',
      idEstudiante: params.idEstudiante,
      idMateria: params.idMateria,
      fecha: params.fecha,
      estado: params.estado,
    },
  });
}

export interface DirectPushDispatchParams {
  idMateria: number;
  nombreMateria: string;
  fecha: string;
  records: Array<{
    idEstudiante: number;
    estado: string;
    horaEntrada?: string;
    motivoJustificacion?: string | null;
    idRepresentante: number;
    estudianteNombre: string;
  }>;
  subscriptions: Array<{
    idRepresentante: number;
    endpoint: string;
    p256dh: string;
    auth: string;
  }>;
  author?: PushAuditAuthor;
  context?: string;
}

export async function dispatchAttendancePushNotificationsDirect(
  params: DirectPushDispatchParams
): Promise<ResilientPushDispatchResult> {
  const relevantStatuses = new Set([
    'Presente',
    'Tarde',
    'Ausente',
    'Justificado',
    'Reposo Médico',
  ]);
  const targetRecords = (params.records || []).filter((r) => relevantStatuses.has(r.estado));

  if (targetRecords.length === 0 || !params.subscriptions?.length) {
    return {
      sent: 0,
      failed: 0,
      expiredEndpoints: [],
      metrics: {
        totalObjetivos: 0,
        enviadosExitosos: 0,
        eliminados410: 0,
        fallidosRed: 0,
        reintentos429: 0,
        reintentosExitosos429: 0,
        duracionMs: 0,
      },
    };
  }

  // Indexar suscripciones por representante para búsqueda O(1) bajo miles de registros
  const subsByRep = new Map<number, typeof params.subscriptions>();
  for (const sub of params.subscriptions) {
    if (!sub.endpoint || !sub.p256dh || !sub.auth) continue;
    let bucket = subsByRep.get(sub.idRepresentante);
    if (!bucket) {
      bucket = [];
      subsByRep.set(sub.idRepresentante, bucket);
    }
    bucket.push(sub);
  }

  const tasks: ResilientPushTask[] = [];
  for (const record of targetRecords) {
    const matchingSubs = subsByRep.get(record.idRepresentante);
    if (!matchingSubs?.length) continue;

    const payload = buildAttendanceNotificationPayload({
      estudianteNombreCompleto: record.estudianteNombre || 'Estudiante',
      nombreMateria: params.nombreMateria || 'Asignatura',
      estado: record.estado,
      fecha: params.fecha,
      horaEntrada: record.horaEntrada || '',
      idEstudiante: record.idEstudiante,
      idMateria: params.idMateria,
      motivoJustificacion: record.motivoJustificacion,
    });

    for (const sub of matchingSubs) {
      tasks.push({
        endpoint: sub.endpoint,
        subscription: {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        },
        payload,
        TTL: 86400, // 24 horas para garantizar entrega en móviles apagados o en ahorro de batería
        urgency: record.estado === 'Ausente' || record.estado === 'Tarde' ? 'high' : 'normal',
      });
    }
  }

  return dispatchPushTasksResilient(tasks, {
    context: params.context || 'asistencia_batch',
    author: params.author,
    auditMeta: {
      idMateria: params.idMateria,
      nombreMateria: params.nombreMateria,
      fecha: params.fecha,
      registrosEvaluados: targetRecords.length,
    },
  });
}

export async function sendTestPushToSubscriptions(
  subscriptions: Array<{
    endpoint: string;
    p256dh: string;
    auth: string;
  }>,
  representanteNombre: string,
  author?: PushAuditAuthor
): Promise<ResilientPushDispatchResult> {
  const validSubs = (subscriptions || []).filter((s) => s.endpoint && s.p256dh && s.auth);
  if (!validSubs.length) {
    return {
      sent: 0,
      failed: 0,
      expiredEndpoints: [],
      metrics: {
        totalObjetivos: 0,
        enviadosExitosos: 0,
        eliminados410: 0,
        fallidosRed: 0,
        reintentos429: 0,
        reintentosExitosos429: 0,
        duracionMs: 0,
      },
    };
  }

  const payload = JSON.stringify({
    title: 'EduAsist • Alertas Push Activas',
    body: `Hola ${representanteNombre}, las notificaciones de asistencia en tiempo real funcionan correctamente en este dispositivo.`,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: `eduasist-test-${Date.now()}`,
    renotify: true,
    requireInteraction: false,
    data: {
      url: '/#portal-representante',
      test: true,
    },
  });

  const tasks: ResilientPushTask[] = validSubs.map((sub) => ({
    endpoint: sub.endpoint,
    subscription: {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth },
    },
    payload,
    TTL: 300,
    urgency: 'high',
  }));

  return dispatchPushTasksResilient(tasks, {
    context: 'test_dispositivo_representante',
    author,
    recordAudit: false,
  });
}

export interface DirectSalidaPushDispatchParams {
  idSalida: number;
  nombreSalida: string;
  horaSalida: string;
  alcanceNombre: string;
  nombreInstitucion?: string;
  fecha: string;
  motivo?: 'auto' | 'manual';
  targets: Array<{
    idRepresentante: number;
    estudiantes: Array<{ idEstudiante: number; nombre: string }>;
  }>;
  subscriptions: Array<{
    idRepresentante: number;
    endpoint: string;
    p256dh: string;
    auth: string;
  }>;
  author?: PushAuditAuthor;
}

function formatStudentListForNotification(nombres: string[]): string {
  if (nombres.length === 0) return 'su representado';
  if (nombres.length === 1) return nombres[0];
  if (nombres.length === 2) return `${nombres[0]} y ${nombres[1]}`;
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
}

export function buildDepartureNotificationDetails(params: {
  nombreSalida: string;
  horaSalida: string;
  alcanceNombre: string;
  nombreInstitucion?: string;
  studentNames: string[];
}): { title: string; body: string } {
  const horaCorta = params.horaSalida ? params.horaSalida.slice(0, 5) : '';
  const studentNamesText = formatStudentListForNotification(params.studentNames);
  const scopeSuffix =
    params.alcanceNombre && params.alcanceNombre !== 'Toda la institución'
      ? ` (${params.alcanceNombre})`
      : '';
  return {
    title: `Hora de Salida Escolar • ${params.nombreSalida}${scopeSuffix}`,
    body: `La jornada escolar de ${studentNamesText} ha finalizado (${horaCorta}). Hora oficial de salida en ${
      params.nombreInstitucion || 'la institución'
    }.`,
  };
}

export async function dispatchDeparturePushNotificationsDirect(
  params: DirectSalidaPushDispatchParams
): Promise<ResilientPushDispatchResult> {
  if (!params.targets?.length || !params.subscriptions?.length) {
    return {
      sent: 0,
      failed: 0,
      expiredEndpoints: [],
      metrics: {
        totalObjetivos: 0,
        enviadosExitosos: 0,
        eliminados410: 0,
        fallidosRed: 0,
        reintentos429: 0,
        reintentosExitosos429: 0,
        duracionMs: 0,
      },
    };
  }

  const subsByRep = new Map<number, typeof params.subscriptions>();
  for (const sub of params.subscriptions) {
    if (!sub.endpoint || !sub.p256dh || !sub.auth) continue;
    let bucket = subsByRep.get(sub.idRepresentante);
    if (!bucket) {
      bucket = [];
      subsByRep.set(sub.idRepresentante, bucket);
    }
    bucket.push(sub);
  }

  const horaCorta = params.horaSalida ? params.horaSalida.slice(0, 5) : '';
  const tasks: ResilientPushTask[] = [];

  for (const target of params.targets) {
    const matchingSubs = subsByRep.get(target.idRepresentante);
    if (!matchingSubs?.length) continue;

    const { title, body } = buildDepartureNotificationDetails({
      nombreSalida: params.nombreSalida,
      horaSalida: params.horaSalida,
      alcanceNombre: params.alcanceNombre,
      nombreInstitucion: params.nombreInstitucion,
      studentNames: target.estudiantes.map((e) => e.nombre),
    });

    const payload = JSON.stringify({
      title,
      body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: `salida-${params.idSalida}-${target.idRepresentante}-${params.fecha}`,
      renotify: true,
      requireInteraction: false,
      data: {
        url: '/#portal-representante',
        tipo: 'salida',
        idSalida: params.idSalida,
        horaSalida: horaCorta,
        fecha: params.fecha,
        motivo: params.motivo || 'auto',
      },
    });

    for (const sub of matchingSubs) {
      tasks.push({
        endpoint: sub.endpoint,
        subscription: {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        },
        payload,
        TTL: 43200, // 12 horas para avisos de salida
        urgency: 'high',
      });
    }
  }

  return dispatchPushTasksResilient(tasks, {
    context: `salida_horaria_${params.motivo || 'auto'}`,
    author: params.author,
    auditMeta: {
      idSalida: params.idSalida,
      nombreSalida: params.nombreSalida,
      horaSalida: params.horaSalida,
      alcance: params.alcanceNombre,
      fecha: params.fecha,
      motivo: params.motivo || 'auto',
    },
  });
}

export interface MilestonePushDispatchParams {
  tipo: 'receso' | 'salida';
  nombreInstitucion?: string;
  horaRecesoInicio: string;
  horaRecesoFin: string;
  horaSalida: string;
  mensajePersonalizado?: string;
  trigger?: 'auto' | 'manual';
  subscriptions: Array<{
    idRepresentante: number;
    endpoint: string;
    p256dh: string;
    auth: string;
  }>;
  author?: PushAuditAuthor;
}

export function buildMilestoneNotificationDetails(params: {
  tipo: 'receso' | 'salida';
  nombreInstitucion?: string;
  horaRecesoInicio: string;
  horaRecesoFin: string;
  horaSalida: string;
  mensajePersonalizado?: string;
}): { title: string; body: string; recInicio: string; recFin: string; salidaHora: string } {
  const institucion = params.nombreInstitucion?.trim() || 'la institución';
  const recInicio = (params.horaRecesoInicio || '09:15').slice(0, 5);
  const recFin = (params.horaRecesoFin || '09:45').slice(0, 5);
  const salidaHora = (params.horaSalida || '13:00').slice(0, 5);
  const customMsg = params.mensajePersonalizado?.trim();

  const isReceso = params.tipo === 'receso';
  const title = isReceso
    ? `Receso Escolar • ${institucion}`
    : `Hora de Salida Escolar • ${institucion}`;
  const defaultBody = isReceso
    ? `Inicia el receso escolar (${recInicio} - ${recFin}) en ${institucion}.`
    : `Ha culminado la jornada escolar (${salidaHora}) en ${institucion}. Los estudiantes se encuentran en hora de salida.`;

  return {
    title,
    body: customMsg || defaultBody,
    recInicio,
    recFin,
    salidaHora,
  };
}

export async function dispatchMilestonePushNotifications(
  params: MilestonePushDispatchParams
): Promise<ResilientPushDispatchResult> {
  const validSubs = (params.subscriptions || []).filter(
    (s) => s.endpoint && s.p256dh && s.auth
  );
  if (validSubs.length === 0) {
    return {
      sent: 0,
      failed: 0,
      expiredEndpoints: [],
      metrics: {
        totalObjetivos: 0,
        enviadosExitosos: 0,
        eliminados410: 0,
        fallidosRed: 0,
        reintentos429: 0,
        reintentosExitosos429: 0,
        duracionMs: 0,
      },
    };
  }

  // Deduplicar por endpoint para evitar envíos duplicados al mismo dispositivo
  const uniqueSubs = Array.from(new Map(validSubs.map((s) => [s.endpoint, s])).values());

  const { title, body, recInicio, recFin, salidaHora } =
    buildMilestoneNotificationDetails(params);

  const payload = JSON.stringify({
    title,
    body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: `milestone-${params.tipo}-${Date.now()}`,
    renotify: true,
    requireInteraction: false,
    data: {
      url: '/#portal-representante',
      tipo: params.tipo,
      horaRecesoInicio: recInicio,
      horaRecesoFin: recFin,
      horaSalida: salidaHora,
    },
  });

  const ttlSeconds = params.tipo === 'salida' ? 43200 : 1800;

  const tasks: ResilientPushTask[] = uniqueSubs.map((sub) => ({
    endpoint: sub.endpoint,
    subscription: {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth },
    },
    payload,
    TTL: ttlSeconds,
    urgency: 'high',
  }));

  return dispatchPushTasksResilient(tasks, {
    context: `hito_${params.tipo}_${params.trigger || 'manual'}`,
    author: params.author,
    auditMeta: {
      tipoHito: params.tipo,
      trigger: params.trigger || 'manual',
    },
  });
}

// ---------------------------------------------------------------------------
// Prueba de Carga Simulada (Dry-Run Test: 3.000 notificaciones)
// ---------------------------------------------------------------------------
export interface PushLoadTestOptions {
  totalObjetivos?: number;
  chunkSize?: number;
  chunkDelayMs?: number;
  simulatedLatencyMs?: number;
  retry429BackoffMs?: number;
}

export interface PushLoadTestReport {
  success: boolean;
  dryRun: boolean;
  configuracion: {
    totalObjetivos: number;
    chunkSize: number;
    chunkDelayMs: number;
    timeoutMs: number;
    distribucionSimulada: {
      exito201: number;
      caducadas410: number;
      rateLimit429: number;
      errorRedTimeout: number;
    };
  };
  metricasDespacho: PushDispatchMetrics;
  memoriaRAM: {
    heapUsedAntesBytes: number;
    heapUsedDespuesBytes: number;
    heapDeltaBytes: number;
    heapUsedAntesMB: number;
    heapUsedDespuesMB: number;
    heapDeltaMB: number;
    rssDespuesMB: number;
  };
  estabilidad: {
    tareasProcesadas: number;
    porcentajeFinalizado: number;
    excepcionesNoCapturadas: number;
    todasTareasFinalizadasSinExcepciones: boolean;
    endpointsCaducadosDetectados: number;
  };
}

let isLoadTestRunning = false;

export async function testPushLoad(
  options: PushLoadTestOptions = {}
): Promise<PushLoadTestReport> {
  if (isLoadTestRunning) {
    throw new Error('Ya hay una prueba de carga simulada en ejecución. Espere unos segundos.');
  }
  isLoadTestRunning = true;
  try {
    const totalObjetivos = Math.min(10_000, Math.max(100, Math.floor(options.totalObjetivos ?? 3000)));
  const chunkSize = clampChunkSize(options.chunkSize ?? DEFAULT_CHUNK_SIZE);
  const chunkDelayMs = clampChunkDelay(options.chunkDelayMs ?? DEFAULT_CHUNK_DELAY_MS);
  const simulatedLatencyMs = Math.max(0, Math.min(20, Number(options.simulatedLatencyMs ?? 2)));
  const retry429BackoffMs = Math.max(50, Math.min(500, Number(options.retry429BackoffMs ?? 120)));

  // Distribución exacta requerida: 85% 201, 10% 410 Gone, 3% 429 Too Many Requests, 2% error red/timeout
  const count410 = Math.round(totalObjetivos * 0.1);
  const count429 = Math.round(totalObjetivos * 0.03);
  const countNetErr = Math.round(totalObjetivos * 0.02);
  const count201 = totalObjetivos - count410 - count429 - countNetErr;

  type SimulatedOutcomeKind = '201' | '410' | '429' | 'NET_TIMEOUT';
  const scenarioPlan: SimulatedOutcomeKind[] = [
    ...Array<SimulatedOutcomeKind>(count201).fill('201'),
    ...Array<SimulatedOutcomeKind>(count410).fill('410'),
    ...Array<SimulatedOutcomeKind>(count429).fill('429'),
    ...Array<SimulatedOutcomeKind>(countNetErr).fill('NET_TIMEOUT'),
  ];

  // Barajado determinístico (Fisher-Yates con semilla fija) para mezclar respuestas en cada chunk
  let seed = 20261124;
  const nextRand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  for (let i = scenarioPlan.length - 1; i > 0; i--) {
    const j = Math.floor(nextRand() * (i + 1));
    const tmp = scenarioPlan[i];
    scenarioPlan[i] = scenarioPlan[j];
    scenarioPlan[j] = tmp;
  }

  const sharedPayload = JSON.stringify({
    title: 'EduAsist • Prueba de Carga Simulada',
    body: 'Simulación de despacho masivo controlado por lotes (dry-run).',
    icon: '/pwa-192x192.png',
    tag: 'eduasist-load-test',
  });

  const scenarioByEndpoint = new Map<string, SimulatedOutcomeKind>();
  const tasks: ResilientPushTask[] = new Array(totalObjetivos);

  for (let idx = 0; idx < totalObjetivos; idx++) {
    const endpoint = `https://push-dryrun.eduasist.local/sub/${idx + 1}`;
    scenarioByEndpoint.set(endpoint, scenarioPlan[idx]);
    tasks[idx] = {
      endpoint,
      subscription: {
        endpoint,
        keys: {
          p256dh: 'BSimulatedPublicKeyP256DryRunTest00000000000000000000000000000000000000000000000000000',
          auth: 'SimAuthDryRun1234',
        },
      },
      payload: sharedPayload,
      TTL: 3600,
      urgency: 'normal',
    };
  }

  let uncaughtDuringTest = 0;
  const onUncaught = () => {
    uncaughtDuringTest += 1;
  };
  const onUnhandled = () => {
    uncaughtDuringTest += 1;
  };
  process.on('uncaughtException', onUncaught);
  process.on('unhandledRejection', onUnhandled);

  const memBefore = process.memoryUsage();
  let dispatchResult: ResilientPushDispatchResult;

  try {
    dispatchResult = await dispatchPushTasksResilient(tasks, {
      context: 'load_test_dry_run',
      chunkSize,
      chunkDelayMs,
      timeoutMs: DEFAULT_PUSH_TIMEOUT_MS,
      retry429BackoffMs,
      dryRun: true,
      autoCleanupExpired: false,
      recordAudit: false,
      customSender: async (task, _timeoutMs, attempt) => {
        if (simulatedLatencyMs > 0) {
          await sleep(simulatedLatencyMs);
        }
        const kind = scenarioByEndpoint.get(task.endpoint) || '201';
        if (kind === '201') {
          return { statusCode: 201, body: '', headers: {} };
        }
        if (kind === '410') {
          const err: any = new Error('410 Gone (simulado)');
          err.statusCode = 410;
          throw err;
        }
        if (kind === '429') {
          if (attempt === 1) {
            const err: any = new Error('429 Too Many Requests (simulado)');
            err.statusCode = 429;
            throw err;
          }
          // El segundo intento (reintento único tras backoff) responde 201 OK
          return { statusCode: 201, body: '', headers: {} };
        }
        const netErr: any = new Error('Simulated socket timeout / network failure');
        netErr.code = 'ETIMEDOUT';
        netErr.isTimeout = true;
        throw netErr;
      },
    });
  } finally {
    process.off('uncaughtException', onUncaught);
    process.off('unhandledRejection', onUnhandled);
  }

  const memAfter = process.memoryUsage();
  const toMB = (bytes: number) => Number((bytes / (1024 * 1024)).toFixed(2));
  const heapDeltaBytes = memAfter.heapUsed - memBefore.heapUsed;

  const tareasProcesadas =
    dispatchResult.metrics.enviadosExitosos +
    dispatchResult.metrics.eliminados410 +
    dispatchResult.metrics.fallidosRed;
  const porcentajeFinalizado = Number(((tareasProcesadas / totalObjetivos) * 100).toFixed(2));
  const todasTareasFinalizadasSinExcepciones =
    tareasProcesadas === totalObjetivos && uncaughtDuringTest === 0;

  const report: PushLoadTestReport = {
    success: todasTareasFinalizadasSinExcepciones,
    dryRun: true,
    configuracion: {
      totalObjetivos,
      chunkSize,
      chunkDelayMs,
      timeoutMs: DEFAULT_PUSH_TIMEOUT_MS,
      distribucionSimulada: {
        exito201: count201,
        caducadas410: count410,
        rateLimit429: count429,
        errorRedTimeout: countNetErr,
      },
    },
    metricasDespacho: dispatchResult.metrics,
    memoriaRAM: {
      heapUsedAntesBytes: memBefore.heapUsed,
      heapUsedDespuesBytes: memAfter.heapUsed,
      heapDeltaBytes,
      heapUsedAntesMB: toMB(memBefore.heapUsed),
      heapUsedDespuesMB: toMB(memAfter.heapUsed),
      heapDeltaMB: toMB(heapDeltaBytes),
      rssDespuesMB: toMB(memAfter.rss),
    },
    estabilidad: {
      tareasProcesadas,
      porcentajeFinalizado,
      excepcionesNoCapturadas: uncaughtDuringTest,
      todasTareasFinalizadasSinExcepciones,
      endpointsCaducadosDetectados: dispatchResult.expiredEndpoints.length,
    },
  };

  console.log('[WebPush:testPushLoad] Reporte de prueba de carga simulada:', JSON.stringify(report, null, 2));
  return report;
  } finally {
    isLoadTestRunning = false;
  }
}
