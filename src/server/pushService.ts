import fs from 'fs';
import path from 'path';
import * as webPushModule from 'web-push';
import type { PushSubscription as WebPushSubscription } from 'web-push';

const webPush = ((webPushModule as any).default || webPushModule) as typeof webPushModule;

const PERSISTENT_VAPID_FILE = path.resolve(process.cwd(), 'data', 'vapid-keys.json');
const FALLBACK_TMP_VAPID_FILE = '/tmp/eduasist-vapid.json';

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
    // Verify with web-push library itself
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
  const {
    estudianteNombreCompleto,
    nombreMateria,
    estado,
    fecha,
    horaEntrada,
    idEstudiante,
    idMateria,
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

  return JSON.stringify({
    title,
    body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: `asistencia-${idEstudiante}-${idMateria}-${fecha}`,
    renotify: true,
    requireInteraction: estado === 'Ausente',
    data: {
      url: '/#portal-representante',
      idEstudiante,
      idMateria,
      fecha,
      estado,
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
}

export async function dispatchAttendancePushNotificationsDirect(
  params: DirectPushDispatchParams
): Promise<{ sent: number; failed: number; expiredEndpoints: string[] }> {
  const relevantStatuses = new Set([
    'Presente',
    'Tarde',
    'Ausente',
    'Justificado',
    'Reposo Médico',
  ]);
  const targetRecords = (params.records || []).filter((r) => relevantStatuses.has(r.estado));

  if (targetRecords.length === 0 || !params.subscriptions?.length) {
    return { sent: 0, failed: 0, expiredEndpoints: [] };
  }

  await ensureVapidConfigured();

  interface DispatchTask {
    endpoint: string;
    subscription: WebPushSubscription;
    payload: string;
    urgency: 'high' | 'normal';
  }

  const tasks: DispatchTask[] = [];

  for (const record of targetRecords) {
    const matchingSubs = params.subscriptions.filter(
      (s) => s.idRepresentante === record.idRepresentante && s.endpoint && s.p256dh && s.auth
    );
    for (const sub of matchingSubs) {
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
        urgency: record.estado === 'Ausente' ? 'high' : 'normal',
      });
    }
  }

  if (tasks.length === 0) {
    return { sent: 0, failed: 0, expiredEndpoints: [] };
  }

  const CONCURRENCY_LIMIT = 10;
  let sent = 0;
  let failed = 0;
  const expiredEndpoints: string[] = [];

  for (let i = 0; i < tasks.length; i += CONCURRENCY_LIMIT) {
    const chunk = tasks.slice(i, i + CONCURRENCY_LIMIT);
    const settled = await Promise.allSettled(
      chunk.map((task) =>
        webPush.sendNotification(task.subscription, task.payload, {
          TTL: 3600,
          urgency: task.urgency,
        })
      )
    );

    settled.forEach((result, idx) => {
      const endpoint = chunk[idx].endpoint;
      if (result.status === 'fulfilled') {
        sent += 1;
      } else {
        failed += 1;
        const err: any = result.reason;
        const statusCode = err?.statusCode;
        // 410 Gone, 404 Not Found, 401/403 VAPID key mismatch -> limpiar endpoint obsoleto
        if (
          statusCode === 410 ||
          statusCode === 404 ||
          statusCode === 401 ||
          statusCode === 403
        ) {
          expiredEndpoints.push(endpoint);
        } else {
          console.warn(
            `[WebPush] Error al enviar notificación a endpoint (${statusCode || 'unknown'}):`,
            err?.body || err?.message || err
          );
        }
      }
    });
  }

  return { sent, failed, expiredEndpoints };
}

export async function sendTestPushToSubscriptions(
  subscriptions: Array<{
    endpoint: string;
    p256dh: string;
    auth: string;
  }>,
  representanteNombre: string
): Promise<{
  sent: number;
  failed: number;
  expiredEndpoints: string[];
  lastError?: string;
}> {
  if (!subscriptions.length) {
    return { sent: 0, failed: 0, expiredEndpoints: [] };
  }

  await ensureVapidConfigured();

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

  let sent = 0;
  let failed = 0;
  let lastError: string | undefined;
  const expiredEndpoints: string[] = [];

  const settled = await Promise.allSettled(
    subscriptions.map((sub) =>
      webPush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        payload,
        { TTL: 300, urgency: 'high' }
      )
    )
  );

  settled.forEach((result, idx) => {
    const endpoint = subscriptions[idx].endpoint;
    if (result.status === 'fulfilled') {
      sent += 1;
    } else {
      failed += 1;
      const err: any = result.reason;
      const statusCode = err?.statusCode;
      lastError = err?.body || err?.message || `HTTP ${statusCode || 'error'}`;
      if (
        statusCode === 410 ||
        statusCode === 404 ||
        statusCode === 401 ||
        statusCode === 403
      ) {
        expiredEndpoints.push(endpoint);
      }
    }
  });

  return { sent, failed, expiredEndpoints, lastError };
}
