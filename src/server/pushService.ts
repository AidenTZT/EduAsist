import fs from 'fs';
import * as webPushModule from 'web-push';
import type { PushSubscription as WebPushSubscription } from 'web-push';

const webPush = ((webPushModule as any).default || webPushModule) as typeof webPushModule;

const VAPID_CACHE_FILE = '/tmp/educontrol-vapid.json';

interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

let cachedVapidConfig: VapidConfig | null = null;
let vapidInitPromise: Promise<VapidConfig> | null = null;

/**
 * Resuelve e inicializa las llaves VAPID para Web Push:
 * 1. Prioriza variables de entorno VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY y VAPID_SUBJECT.
 * 2. Si no están definidas, reutiliza o genera un par VAPID en memoria y caché local (/tmp).
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
    const envSubject = process.env.VAPID_SUBJECT?.trim() || 'mailto:notificaciones@educontrol.edu';

    let publicKey = envPublic;
    let privateKey = envPrivate;

    if (!publicKey || !privateKey) {
      try {
        if (fs.existsSync(VAPID_CACHE_FILE)) {
          const raw = JSON.parse(fs.readFileSync(VAPID_CACHE_FILE, 'utf-8'));
          if (raw?.publicKey && raw?.privateKey) {
            publicKey = String(raw.publicKey).trim();
            privateKey = String(raw.privateKey).trim();
          }
        }
      } catch {
        // Ignorar caché ilegible y regenerar
      }
    }

    if (!publicKey || !privateKey) {
      const generated = webPush.generateVAPIDKeys();
      publicKey = generated.publicKey;
      privateKey = generated.privateKey;
      try {
        fs.writeFileSync(VAPID_CACHE_FILE, JSON.stringify({ publicKey, privateKey }), 'utf-8');
      } catch {
        // Ignorar si /tmp no es escribible
      }
      console.log('[WebPush] Par de llaves VAPID generado e inicializado en memoria.');
    }

    webPush.setVapidDetails(envSubject, publicKey, privateKey);
    cachedVapidConfig = {
      publicKey,
      privateKey,
      subject: envSubject,
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
}) {
  const {
    estudianteNombreCompleto,
    nombreMateria,
    estado,
    fecha,
    horaEntrada,
    idEstudiante,
    idMateria,
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
      body = `Se registró inasistencia justificada para ${estudianteNombreCompleto} en ${nombreMateria} (${fecha}).`;
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
): Promise<{ sent: number; expiredEndpoints: string[] }> {
  const relevantStatuses = new Set(['Presente', 'Tarde', 'Ausente']);
  const targetRecords = (params.records || []).filter((r) => relevantStatuses.has(r.estado));

  if (targetRecords.length === 0 || !params.subscriptions?.length) {
    return { sent: 0, expiredEndpoints: [] };
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
    return { sent: 0, expiredEndpoints: [] };
  }

  const CONCURRENCY_LIMIT = 10;
  let sent = 0;
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
        const err: any = result.reason;
        const statusCode = err?.statusCode;
        if (statusCode === 410 || statusCode === 404) {
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

  return { sent, expiredEndpoints };
}
