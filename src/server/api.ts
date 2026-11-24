import express, { type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import * as db from './localDb.ts';
import {
  generateToken,
  verifyToken,
  setAuthCookie,
  clearAuthCookie,
  extractToken,
  requireAuth,
  requireRole,
  validateDocenteOwnership,
} from './auth.ts';
import {
  validateBody,
  validateQuery,
  loginCredentialsSchema,
  createStaffUserSchema,
  updateStaffUserSchema,
  createRepresentanteSchema,
  updateRepresentanteSchema,
  updateRepresentanteCredencialesSchema,
  asistenciaBatchSchema,
  updateAsistenciaJustificacionSchema,
  attendanceHistoryQuerySchema,
  auditLogsQuerySchema,
  createHorarioSchema,
  recesoSchema,
  salidaSchema,
  updateSalidaSchema,
  createLapsoSchema,
  updateLapsoSchema,
  activateLapsoSchema,
  pushSubscriptionSchema,
  pushUnsubscribeSchema,
  updateHorariosConfigSchema,
  triggerMilestonePushSchema,
  promoverEstudiantesSchema,
  createDiaNoLaborableSchema,
  verificarFechaQuerySchema,
  testPushLoadSchema,
} from './validation.ts';
import type { EstadoAsistencia } from '../types.ts';
import {
  getVapidPublicKey,
  dispatchAttendancePushNotificationsDirect,
  dispatchDeparturePushNotificationsDirect,
  sendTestPushToSubscriptions,
  testPushLoad,
  type PushAuditAuthor,
} from './pushService.ts';
import {
  getSchoolClockInTimezone,
  triggerMilestonePush,
  enqueueManualMilestonePush,
  startInstitutionalMilestoneScheduler,
} from './scheduleNotifier.ts';

export { startInstitutionalMilestoneScheduler };

function enqueueDetachedPushJob(label: string, job: () => Promise<void>): void {
  setImmediate(() => {
    void job().catch((err) => {
      console.warn(`[WebPush] Error aislado en tarea asíncrona (${label}):`, err);
    });
  });
}

export const apiRouter = express.Router();
export const schoolApp = express();

schoolApp.set('trust proxy', 1);
schoolApp.use(cookieParser());
schoolApp.use(express.json({ limit: '50mb' }));
schoolApp.use(express.urlencoded({ extended: true, limit: '50mb' }));
schoolApp.use(apiRouter);

function getAuditAuthorFromReq(req: Request) {
  if (req.authType === 'staff' && req.user) {
    return {
      idUsuario: req.user.id,
      emailOCedula: req.user.email,
      rol: req.user.rol,
      ipOrigen: req.ip || req.socket.remoteAddress || null,
      userAgent: req.headers['user-agent'] || null,
    };
  }
  if (req.authType === 'representante' && req.representante) {
    return {
      idUsuario: req.representante.idRepresentante,
      emailOCedula: req.representante.email || req.representante.cedula,
      rol: 'representante',
      ipOrigen: req.ip || req.socket.remoteAddress || null,
      userAgent: req.headers['user-agent'] || null,
    };
  }
  return {
    idUsuario: null,
    emailOCedula: null,
    rol: null,
    ipOrigen: req.ip || req.socket.remoteAddress || null,
    userAgent: req.headers['user-agent'] || null,
  };
}

// Rate limiter estricto contra fuerza bruta en login
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      error: 'Demasiados intentos de inicio de sesión. Por seguridad, espere unos minutos antes de reintentar.',
      code: 'RATE_LIMITED',
    });
  },
});

// ---------------------------------------------------------------------------
// 0. HEALTH & AUTENTICACIÓN LOCAL POR BASE DE DATOS
// ---------------------------------------------------------------------------
apiRouter.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'EduAsist - Autenticación Local BD (Bcrypt + JWT) & Web Push',
    security: {
      localDatabaseAuth: true,
      bcryptPasswordHashing: true,
      httpOnlyJwtCookie: true,
      rbacEnforced: true,
      webPushActive: true,
    },
  });
});

apiRouter.post(
  '/auth/login',
  loginRateLimiter,
  validateBody(loginCredentialsSchema),
  async (req: Request, res: Response) => {
    try {
      const body = req.body as Record<string, any>;
      const identifier = String(
        body.usuario ||
          body.identificador ||
          body.emailOrCedula ||
          body.cedulaOrEmail ||
          body.email ||
          body.cedula ||
          ''
      ).trim();
      const password = String(body.password || '');
      const preferredPortal = body.preferredPortal as 'staff' | 'representante' | undefined;

      const attempt = await db.authenticateCredentials(identifier, password, preferredPortal);

      if (!attempt.ok) {
        const accion =
          attempt.code === 'PORTAL_MISMATCH'
            ? 'LOGIN_RECHAZADO_PORTAL_INCORRECTO'
            : attempt.code === 'USER_INACTIVE'
            ? 'LOGIN_RECHAZADO_INACTIVO'
            : 'LOGIN_FALLIDO';

        await db.logAuditEvent({
          emailOCedula: identifier,
          accion,
          entidad: 'auth',
          ipOrigen: req.ip || req.socket.remoteAddress || null,
          userAgent: req.headers['user-agent'] || null,
          detalles: { motivo: attempt.code, preferredPortal },
        });
        const status =
          attempt.code === 'USER_INACTIVE' || attempt.code === 'PORTAL_MISMATCH' ? 403 : 401;
        return res.status(status).json({
          error: attempt.error,
          code: attempt.code,
        });
      }

      // Doble verificación de separación de portales en el controlador HTTP
      if (preferredPortal && attempt.type !== preferredPortal) {
        await db.logAuditEvent({
          emailOCedula: identifier,
          accion: 'LOGIN_RECHAZADO_PORTAL_INCORRECTO',
          entidad: 'auth',
          ipOrigen: req.ip || req.socket.remoteAddress || null,
          userAgent: req.headers['user-agent'] || null,
          detalles: { motivo: 'PORTAL_MISMATCH', preferredPortal, resolvedType: attempt.type },
        });
        return res.status(403).json({
          error:
            preferredPortal === 'staff'
              ? 'Las cuentas de representantes deben ingresar exclusivamente a través del Portal de Representantes.'
              : 'Las cuentas del personal institucional deben ingresar exclusivamente a través del Panel Institucional.',
          code: 'PORTAL_MISMATCH',
        });
      }

      if (attempt.type === 'staff') {
        const token = generateToken({
          userId: attempt.user.id,
          emailOrCedula: attempt.user.email,
          rol: attempt.user.rol,
          type: 'staff',
        });
        setAuthCookie(res, token);

        await db.logAuditEvent({
          idUsuario: attempt.user.id,
          emailOCedula: attempt.user.email,
          rol: attempt.user.rol,
          accion: 'LOGIN_EXITOSO_PERSONAL',
          entidad: 'users',
          idEntidad: attempt.user.id,
          ipOrigen: req.ip || req.socket.remoteAddress || null,
          userAgent: req.headers['user-agent'] || null,
          detalles: {
            rol: attempt.user.rol,
            nombreCompleto: `${attempt.user.nombre} ${attempt.user.apellidos}`,
            metodo: 'Credenciales Locales BD (Bcrypt + JWT)',
          },
        });

        return res.json({
          authenticated: true,
          type: 'staff',
          redirectPortal: 'staff',
          token,
          user: attempt.user,
        });
      }

      // Representante
      const token = generateToken({
        userId: attempt.representante.idRepresentante,
        emailOrCedula: attempt.representante.cedula,
        rol: 'representante',
        type: 'representante',
      });
      setAuthCookie(res, token);

      await db.logAuditEvent({
        idUsuario: attempt.representante.idRepresentante,
        emailOCedula: attempt.representante.email || attempt.representante.cedula,
        rol: 'representante',
        accion: 'LOGIN_EXITOSO_REPRESENTANTE',
        entidad: 'representantes',
        idEntidad: attempt.representante.idRepresentante,
        ipOrigen: req.ip || req.socket.remoteAddress || null,
        userAgent: req.headers['user-agent'] || null,
        detalles: {
          nombre: `${attempt.representante.nombres} ${attempt.representante.apellidos}`,
          metodo: 'Credenciales Locales BD (Bcrypt + JWT)',
        },
      });

      return res.json({
        authenticated: true,
        type: 'representante',
        redirectPortal: 'representante',
        token,
        representante: attempt.representante,
      });
    } catch (error: any) {
      console.error('Error in POST /api/auth/login:', error);
      return res.status(500).json({ error: 'Error interno al procesar el inicio de sesión.' });
    }
  }
);

apiRouter.get('/auth/me', async (req: Request, res: Response) => {
  try {
    const token = extractToken(req);
    if (!token) {
      return res.json({ authenticated: false });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      clearAuthCookie(res);
      return res.json({ authenticated: false });
    }

    if (decoded.type === 'staff') {
      const user =
        (await db.getUserById(decoded.userId)) ||
        (decoded.emailOrCedula ? await db.getUserByEmailOrCedula(decoded.emailOrCedula) : null);
      if (!user || user.activo === false) {
        clearAuthCookie(res);
        return res.json({ authenticated: false });
      }
      return res.json({
        authenticated: true,
        type: 'staff',
        redirectPortal: 'staff',
        user,
      });
    }

    if (decoded.type === 'representante') {
      const rep = await db.getRepresentanteById(decoded.userId);
      if (!rep || rep.activo === false) {
        clearAuthCookie(res);
        return res.json({ authenticated: false });
      }
      return res.json({
        authenticated: true,
        type: 'representante',
        redirectPortal: 'representante',
        representante: rep,
      });
    }

    clearAuthCookie(res);
    return res.json({ authenticated: false });
  } catch (error) {
    console.error('Error in GET /api/auth/me:', error);
    return res.json({ authenticated: false });
  }
});

apiRouter.post('/auth/logout', async (req: Request, res: Response) => {
  try {
    const token = extractToken(req);
    if (token) {
      const decoded = verifyToken(token);
      if (decoded) {
        await db.logAuditEvent({
          idUsuario: decoded.userId,
          emailOCedula: decoded.emailOrCedula,
          rol: decoded.rol || decoded.type,
          accion: 'LOGOUT_SESION',
          entidad: 'session',
          ipOrigen: req.ip || req.socket.remoteAddress || null,
          userAgent: req.headers['user-agent'] || null,
        });
      }
    }
    clearAuthCookie(res);
    return res.json({ success: true });
  } catch {
    clearAuthCookie(res);
    return res.json({ success: true });
  }
});

// ---------------------------------------------------------------------------
// 1. CONFIGURACIÓN INSTITUCIONAL & RECESOS
// ---------------------------------------------------------------------------
apiRouter.get('/configuracion', requireAuth, async (_req: Request, res: Response) => {
  try {
    res.json(await db.getConfiguracion());
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

apiRouter.put(
  '/configuracion',
  requireAuth,
  requireRole('director', 'coordinador'),
  async (req: Request, res: Response) => {
    try {
      const { clave, valor, descripcion } = req.body || {};
      if (!clave || valor === undefined) {
        return res.status(400).json({ error: 'Clave y valor son obligatorios.' });
      }
      const updated = await db.setConfiguracion(String(clave), String(valor), descripcion);
      await db.logAuditEvent({
        ...getAuditAuthorFromReq(req),
        accion: 'CONFIGURACION_INSTITUCIONAL_MODIFICADA',
        entidad: 'configuracion_institucional',
        idEntidad: clave,
        detalles: { clave, valor, descripcion },
      });
      res.json(updated);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

apiRouter.put(
  '/configuracion/horarios',
  requireAuth,
  requireRole('director', 'coordinador'),
  validateBody(updateHorariosConfigSchema),
  async (req: Request, res: Response) => {
    try {
      const updated = await db.updateHorariosConfiguracion(req.body);
      await db.logAuditEvent({
        ...getAuditAuthorFromReq(req),
        accion: 'CONFIGURACION_HORARIOS_MODIFICADA',
        entidad: 'configuracion_institucional',
        idEntidad: 'horarios',
        detalles: req.body,
      });
      res.json(updated);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

apiRouter.get('/recesos', requireAuth, async (req: Request, res: Response) => {
  try {
    const soloActivos = req.query.soloActivos === 'true';
    res.json(await db.getRecesos(soloActivos));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

apiRouter.post(
  '/recesos',
  requireAuth,
  requireRole('director', 'coordinador'),
  validateBody(recesoSchema),
  async (req: Request, res: Response) => {
    try {
      const created = await db.createReceso(req.body);
      await db.logAuditEvent({
        ...getAuditAuthorFromReq(req),
        accion: 'RECESO_CREADO',
        entidad: 'recesos_institucionales',
        idEntidad: created.idReceso,
        detalles: req.body,
      });
      res.status(201).json(created);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

apiRouter.put(
  '/recesos/:id',
  requireAuth,
  requireRole('director', 'coordinador'),
  async (req: Request, res: Response) => {
    try {
      const idReceso = Number(req.params.id);
      const updated = await db.updateReceso(idReceso, req.body || {});
      await db.logAuditEvent({
        ...getAuditAuthorFromReq(req),
        accion: 'RECESO_ACTUALIZADO',
        entidad: 'recesos_institucionales',
        idEntidad: idReceso,
        detalles: req.body,
      });
      res.json(updated);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

apiRouter.patch(
  '/recesos/:id/toggle',
  requireAuth,
  requireRole('director', 'coordinador'),
  async (req: Request, res: Response) => {
    try {
      const idReceso = Number(req.params.id);
      const updated = await db.toggleReceso(idReceso);
      await db.logAuditEvent({
        ...getAuditAuthorFromReq(req),
        accion: 'RECESO_ESTADO_ALTERNADO',
        entidad: 'recesos_institucionales',
        idEntidad: idReceso,
        detalles: { idReceso, nuevoEstado: updated.activo },
      });
      res.json(updated);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

apiRouter.delete(
  '/recesos/:id',
  requireAuth,
  requireRole('director', 'coordinador'),
  async (req: Request, res: Response) => {
    try {
      const idReceso = Number(req.params.id);
      await db.deleteReceso(idReceso);
      await db.logAuditEvent({
        ...getAuditAuthorFromReq(req),
        accion: 'RECESO_ELIMINADO',
        entidad: 'recesos_institucionales',
        idEntidad: idReceso,
      });
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

// ---------------------------------------------------------------------------
// 1.1 HORA DE SALIDA INSTITUCIONAL & DESPACHO PUSH
// ---------------------------------------------------------------------------
function getSchoolZonedClock(timeZone: string = process.env.SCHOOL_TIMEZONE || 'America/Caracas') {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }

  const weekday = map.weekday || '';
  const isWeekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(weekday);
  const rawHour = Number(map.hour === '24' ? '0' : map.hour || '0');
  const rawMinute = Number(map.minute || '0');
  const hh = String(rawHour).padStart(2, '0');
  const mm = String(rawMinute).padStart(2, '0');

  return {
    isWeekday,
    todayYmd: `${map.year}-${map.month}-${map.day}`,
    currentHhmm: `${hh}:${mm}`,
    currentMins: rawHour * 60 + rawMinute,
  };
}

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = String(hhmm || '00:00').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

async function executeSalidaPushNotification(
  idSalida: number,
  motivo: 'auto' | 'manual',
  clockOverride?: { todayYmd: string; currentHhmm: string },
  author?: PushAuditAuthor,
  preloadedPayload?: Awaited<ReturnType<typeof db.getSalidasPushDispatchPayload>>
) {
  const clock = clockOverride || getSchoolZonedClock();
  const payload = preloadedPayload || (await db.getSalidasPushDispatchPayload(idSalida));

  let sent = 0;
  let failed = 0;
  let expiredRemoved = 0;
  let fallidosRed = 0;
  let duracionMs = 0;
  let lastError: string | undefined;

  if (payload.subscriptions.length > 0 && payload.targets.length > 0) {
    const pushRes = await dispatchDeparturePushNotificationsDirect({
      idSalida: payload.salida.idSalida,
      nombreSalida: payload.salida.nombre,
      horaSalida: payload.salida.horaSalida,
      alcanceNombre: payload.salida.nombreNivel || 'Toda la institución',
      nombreInstitucion: payload.nombreInstitucion,
      fecha: clock.todayYmd,
      motivo,
      targets: payload.targets,
      subscriptions: payload.subscriptions,
      author,
    });
    sent = pushRes.sent;
    failed = pushRes.failed;
    expiredRemoved = pushRes.metrics.eliminados410;
    fallidosRed = pushRes.metrics.fallidosRed;
    duracionMs = pushRes.metrics.duracionMs;
    lastError = pushRes.lastError;
  }

  await db.markSalidaNotified(payload.salida.idSalida, clock.todayYmd, clock.currentHhmm);

  return {
    salida: {
      ...payload.salida,
      ultimaNotificacionFecha: clock.todayYmd,
      ultimaNotificacionHora: clock.currentHhmm,
    },
    sent,
    failed,
    totalDispositivos: payload.subscriptions.length,
    totalRepresentantes: payload.targets.length,
    expiredRemoved,
    fallidosRed,
    duracionMs,
    lastError,
  };
}

let salidaSchedulerTimer: NodeJS.Timeout | null = null;
let salidaSchedulerRunning = false;

export function startSalidaNotificationScheduler(): void {
  if (salidaSchedulerTimer) return;

  const tick = async () => {
    if (salidaSchedulerRunning) return;
    salidaSchedulerRunning = true;
    try {
      const clock = getSchoolZonedClock();
      if (!clock.isWeekday) return;

      const nonWorkingCheck = await db.verificarDiaNoLaborable(clock.todayYmd);
      if (nonWorkingCheck.esNoLaborable) return;

      const activeSalidas = await db.getSalidas(true);
      for (const s of activeSalidas) {
        if (!s.notificarPush) continue;
        if (s.ultimaNotificacionFecha === clock.todayYmd) continue;

        const salidaMins = hhmmToMinutes(s.horaSalida);
        // Ventana de 15 minutos tras la hora configurada para emitir la alerta automática una sola vez al día
        if (clock.currentMins >= salidaMins && clock.currentMins <= salidaMins + 15) {
          const result = await executeSalidaPushNotification(s.idSalida, 'auto', clock, {
            emailOCedula: 'sistema@eduasist.edu',
            rol: 'sistema',
          });
          await db.logAuditEvent({
            emailOCedula: 'sistema@eduasist.edu',
            rol: 'sistema',
            accion: 'SALIDA_PUSH_AUTOMATICA_ENVIADA',
            entidad: 'salidas_institucionales',
            idEntidad: s.idSalida,
            detalles: {
              nombre: s.nombre,
              horaSalida: s.horaSalida,
              fecha: clock.todayYmd,
              totalObjetivos: result.totalDispositivos,
              enviadosExitosos: result.sent,
              eliminados410: result.expiredRemoved,
              fallidosRed: result.fallidosRed,
              duracionMs: result.duracionMs,
            },
          });
        }
      }
    } catch (err) {
      console.warn('[WebPush] Error en planificador automático de hora de salida:', err);
    } finally {
      salidaSchedulerRunning = false;
    }
  };

  // Ejecutar primera verificación corta al iniciar y luego cada 30 segundos
  setTimeout(() => {
    void tick();
  }, 5000);
  salidaSchedulerTimer = setInterval(() => {
    void tick();
  }, 30_000);
}

apiRouter.get('/salidas', requireAuth, async (req: Request, res: Response) => {
  try {
    const soloActivos = req.query.soloActivos === 'true';
    res.json(await db.getSalidas(soloActivos));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

apiRouter.post(
  '/salidas',
  requireAuth,
  requireRole('director', 'coordinador'),
  validateBody(salidaSchema),
  async (req: Request, res: Response) => {
    try {
      const created = await db.createSalida(req.body);
      await db.logAuditEvent({
        ...getAuditAuthorFromReq(req),
        accion: 'SALIDA_CREADA',
        entidad: 'salidas_institucionales',
        idEntidad: created.idSalida,
        detalles: req.body,
      });
      res.status(201).json(created);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

apiRouter.put(
  '/salidas/:id',
  requireAuth,
  requireRole('director', 'coordinador'),
  validateBody(updateSalidaSchema),
  async (req: Request, res: Response) => {
    try {
      const idSalida = Number(req.params.id);
      if (!Number.isInteger(idSalida) || idSalida <= 0) {
        return res.status(400).json({ error: 'ID de hora de salida inválido.' });
      }
      const updated = await db.updateSalida(idSalida, req.body || {});
      await db.logAuditEvent({
        ...getAuditAuthorFromReq(req),
        accion: 'SALIDA_ACTUALIZADA',
        entidad: 'salidas_institucionales',
        idEntidad: idSalida,
        detalles: req.body,
      });
      res.json(updated);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

apiRouter.patch(
  '/salidas/:id/toggle',
  requireAuth,
  requireRole('director', 'coordinador'),
  async (req: Request, res: Response) => {
    try {
      const idSalida = Number(req.params.id);
      if (!Number.isInteger(idSalida) || idSalida <= 0) {
        return res.status(400).json({ error: 'ID de hora de salida inválido.' });
      }
      const updated = await db.toggleSalida(idSalida);
      await db.logAuditEvent({
        ...getAuditAuthorFromReq(req),
        accion: 'SALIDA_ESTADO_ALTERNADO',
        entidad: 'salidas_institucionales',
        idEntidad: idSalida,
        detalles: { idSalida, nuevoEstado: updated.activo },
      });
      res.json(updated);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

apiRouter.delete(
  '/salidas/:id',
  requireAuth,
  requireRole('director', 'coordinador'),
  async (req: Request, res: Response) => {
    try {
      const idSalida = Number(req.params.id);
      if (!Number.isInteger(idSalida) || idSalida <= 0) {
        return res.status(400).json({ error: 'ID de hora de salida inválido.' });
      }
      await db.deleteSalida(idSalida);
      await db.logAuditEvent({
        ...getAuditAuthorFromReq(req),
        accion: 'SALIDA_ELIMINADA',
        entidad: 'salidas_institucionales',
        idEntidad: idSalida,
      });
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

apiRouter.post(
  '/salidas/:id/notificar',
  requireAuth,
  requireRole('director', 'coordinador', 'docente'),
  async (req: Request, res: Response) => {
    try {
      const idSalida = Number(req.params.id);
      if (!Number.isInteger(idSalida) || idSalida <= 0) {
        return res.status(400).json({ error: 'ID de hora de salida inválido.' });
      }

      const clock = getSchoolZonedClock();
      const author = getAuditAuthorFromReq(req);
      const payload = await db.getSalidasPushDispatchPayload(idSalida);

      if (payload.subscriptions.length === 0 || payload.targets.length === 0) {
        await db.markSalidaNotified(payload.salida.idSalida, clock.todayYmd, clock.currentHhmm);
        return res.json({
          success: true,
          queued: false,
          salida: {
            ...payload.salida,
            ultimaNotificacionFecha: clock.todayYmd,
            ultimaNotificacionHora: clock.currentHhmm,
          },
          sent: 0,
          failed: 0,
          totalDispositivos: 0,
          totalRepresentantes: payload.targets.length,
          expiredRemoved: 0,
          mensaje: `Hora de salida (${payload.salida.horaSalida}) registrada. No hay dispositivos de representantes suscritos a alertas push para este alcance.`,
        });
      }

      // Marcar fecha/hora de despacho y ejecutar el envío masivo por lotes de forma desacoplada
      await db.markSalidaNotified(payload.salida.idSalida, clock.todayYmd, clock.currentHhmm);
      enqueueDetachedPushJob(`salida_manual_${idSalida}`, async () => {
        const result = await executeSalidaPushNotification(
          idSalida,
          'manual',
          clock,
          author,
          payload
        );
        await db.logAuditEvent({
          ...author,
          accion: 'SALIDA_PUSH_MANUAL_ENVIADA',
          entidad: 'salidas_institucionales',
          idEntidad: idSalida,
          detalles: {
            nombre: result.salida.nombre,
            horaSalida: result.salida.horaSalida,
            alcance: result.salida.nombreNivel,
            totalObjetivos: result.totalDispositivos,
            enviadosExitosos: result.sent,
            eliminados410: result.expiredRemoved,
            fallidosRed: result.fallidosRed,
            duracionMs: result.duracionMs,
            totalRepresentantes: result.totalRepresentantes,
          },
        });
      });

      res.status(202).json({
        success: true,
        queued: true,
        salida: {
          ...payload.salida,
          ultimaNotificacionFecha: clock.todayYmd,
          ultimaNotificacionHora: clock.currentHhmm,
        },
        sent: 0,
        failed: 0,
        totalDispositivos: payload.subscriptions.length,
        totalRepresentantes: payload.targets.length,
        expiredRemoved: 0,
        mensaje: `Alerta de salida encolada en segundo plano para ${payload.subscriptions.length} dispositivo(s) de ${payload.targets.length} representante(s).`,
      });
    } catch (e: any) {
      res.status(400).json({ error: e.message || 'Error al enviar notificación de hora de salida.' });
    }
  }
);

// ---------------------------------------------------------------------------
// 2.1 LAPSOS ESCOLARES (PERÍODOS ACADÉMICOS OFICIALES)
// ---------------------------------------------------------------------------
apiRouter.get('/lapsos/activo', requireAuth, async (_req: Request, res: Response) => {
  try {
    const [lapsoActivo, lapsos] = await Promise.all([db.getActiveLapso(), db.getLapsos()]);
    res.json({ lapsoActivo, lapsos });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

apiRouter.get(
  '/lapsos',
  requireAuth,
  requireRole('director', 'coordinador'),
  async (req: Request, res: Response) => {
    try {
      const anioEscolar = req.query.anioEscolar
        ? String(req.query.anioEscolar)
        : req.query.anio_escolar
        ? String(req.query.anio_escolar)
        : undefined;
      const soloActivos = req.query.soloActivos === 'true';
      res.json(await db.getLapsos({ anioEscolar, soloActivos }));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }
);

apiRouter.post(
  '/lapsos',
  requireAuth,
  requireRole('director', 'coordinador'),
  validateBody(createLapsoSchema),
  async (req: Request, res: Response) => {
    try {
      const created = await db.createLapso(req.body);
      await db.logAuditEvent({
        ...getAuditAuthorFromReq(req),
        accion: 'LAPSO_ESCOLAR_CREADO',
        entidad: 'lapsos_escolares',
        idEntidad: created.id,
        detalles: {
          id: created.id,
          nombre: created.nombre,
          numeroLapso: created.numeroLapso,
          fechaInicio: created.fechaInicio,
          fechaFin: created.fechaFin,
          anioEscolar: created.anioEscolar,
          activo: created.activo,
        },
      });
      res.status(201).json(created);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

apiRouter.put(
  '/lapsos/:id',
  requireAuth,
  requireRole('director', 'coordinador'),
  validateBody(updateLapsoSchema),
  async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const updated = await db.updateLapso(id, req.body);
      await db.logAuditEvent({
        ...getAuditAuthorFromReq(req),
        accion: 'LAPSO_ESCOLAR_ACTUALIZADO',
        entidad: 'lapsos_escolares',
        idEntidad: id,
        detalles: {
          id,
          nombre: updated.nombre,
          numeroLapso: updated.numeroLapso,
          fechaInicio: updated.fechaInicio,
          fechaFin: updated.fechaFin,
          anioEscolar: updated.anioEscolar,
          activo: updated.activo,
        },
      });
      res.json(updated);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

apiRouter.patch(
  '/lapsos/:id/activar',
  requireAuth,
  requireRole('director', 'coordinador'),
  validateBody(activateLapsoSchema),
  async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const activo = req.body?.activo !== undefined ? Boolean(req.body.activo) : true;
      const updated = await db.activateLapso(id, activo);
      await db.logAuditEvent({
        ...getAuditAuthorFromReq(req),
        accion: 'LAPSO_ESCOLAR_ACTIVADO',
        entidad: 'lapsos_escolares',
        idEntidad: id,
        detalles: {
          id,
          nombre: updated.nombre,
          numeroLapso: updated.numeroLapso,
          activo: updated.activo,
        },
      });
      res.json(updated);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

apiRouter.delete(
  '/lapsos/:id',
  requireAuth,
  requireRole('director', 'coordinador'),
  async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      await db.deleteLapso(id);
      await db.logAuditEvent({
        ...getAuditAuthorFromReq(req),
        accion: 'LAPSO_ESCOLAR_ELIMINADO',
        entidad: 'lapsos_escolares',
        idEntidad: id,
      });
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

// ---------------------------------------------------------------------------
// 2. PERSONAL INSTITUCIONAL (USERS)
// ---------------------------------------------------------------------------
apiRouter.get('/users', requireAuth, async (req: Request, res: Response) => {
  if (req.authType !== 'staff' || !req.user) {
    return res.status(403).json({ error: 'Acceso reservado para personal institucional.' });
  }
  try {
    const rol = req.query.rol as any;
    res.json(await db.getUsers(rol));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

apiRouter.post(
  '/users',
  requireAuth,
  requireRole('director'),
  validateBody(createStaffUserSchema),
  async (req: Request, res: Response) => {
    try {
      const created = await db.createUser(req.body);
      await db.logAuditEvent({
        ...getAuditAuthorFromReq(req),
        accion: 'USUARIO_PERSONAL_CREADO',
        entidad: 'users',
        idEntidad: created.id,
        detalles: { id: created.id, email: created.email, usuario: created.usuario, rol: created.rol },
      });
      res.status(201).json(created);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

apiRouter.put(
  '/users/:id',
  requireAuth,
  requireRole('director'),
  validateBody(updateStaffUserSchema),
  async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const updated = await db.updateUser(id, req.body);
      await db.logAuditEvent({
        ...getAuditAuthorFromReq(req),
        accion: 'USUARIO_PERSONAL_ACTUALIZADO',
        entidad: 'users',
        idEntidad: id,
        detalles: {
          idActualizado: id,
          camposModificados: Object.keys(req.body || {}).filter((k) => k !== 'password'),
        },
      });
      res.json(updated);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

apiRouter.delete(
  '/users/:id',
  requireAuth,
  requireRole('director'),
  async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (req.user?.id === id) {
        return res.status(400).json({
          error: 'Operación denegada: No puede eliminar su propia cuenta activa.',
        });
      }
      await db.deleteUser(id);
      await db.logAuditEvent({
        ...getAuditAuthorFromReq(req),
        accion: 'USUARIO_PERSONAL_ELIMINADO',
        entidad: 'users',
        idEntidad: id,
      });
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

// ---------------------------------------------------------------------------
// 3. AÑOS ESCOLARES, SECCIONES, MATERIAS & ASIGNACIONES
// ---------------------------------------------------------------------------
apiRouter.get('/anos', requireAuth, async (_req: Request, res: Response) => {
  try {
    res.json(await db.getAnosEscolares());
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

apiRouter.post(
  '/anos',
  requireAuth,
  requireRole('director', 'coordinador'),
  async (req: Request, res: Response) => {
    try {
      const { nombreNivel, activo = true } = req.body || {};
      if (!nombreNivel || !String(nombreNivel).trim()) {
        return res.status(400).json({ error: 'El nombre del nivel es obligatorio.' });
      }
      const created = await db.createAnoEscolar(String(nombreNivel), Boolean(activo));
      await db.logAuditEvent({
        ...getAuditAuthorFromReq(req),
        accion: 'ANO_ESCOLAR_CREADO',
        entidad: 'anos_escolares',
        idEntidad: created.idAno,
        detalles: { nombreNivel },
      });
      res.status(201).json(created);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

apiRouter.put(
  '/anos/:id',
  requireAuth,
  requireRole('director', 'coordinador'),
  async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const { nombreNivel, activo } = req.body || {};
      res.json(await db.updateAnoEscolar(id, String(nombreNivel), activo));
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

apiRouter.delete(
  '/anos/:id',
  requireAuth,
  requireRole('director', 'coordinador'),
  async (req: Request, res: Response) => {
    try {
      await db.deleteAnoEscolar(Number(req.params.id));
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

apiRouter.get('/secciones', requireAuth, async (req: Request, res: Response) => {
  try {
    const idAno = req.query.idAno ? Number(req.query.idAno) : undefined;
    res.json(await db.getSecciones(idAno));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

apiRouter.post(
  '/secciones',
  requireAuth,
  requireRole('director', 'coordinador'),
  async (req: Request, res: Response) => {
    try {
      const { idAno, nombreSeccion } = req.body || {};
      res.status(201).json(await db.createSeccion(Number(idAno), String(nombreSeccion)));
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

apiRouter.put(
  '/secciones/:id',
  requireAuth,
  requireRole('director', 'coordinador'),
  async (req: Request, res: Response) => {
    try {
      const { nombreSeccion, idAno } = req.body || {};
      res.json(await db.updateSeccion(Number(req.params.id), String(nombreSeccion), idAno ? Number(idAno) : undefined));
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

apiRouter.delete(
  '/secciones/:id',
  requireAuth,
  requireRole('director', 'coordinador'),
  async (req: Request, res: Response) => {
    try {
      await db.deleteSeccion(Number(req.params.id));
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

apiRouter.get('/materias', requireAuth, async (req: Request, res: Response) => {
  try {
    const idAno = req.query.idAno ? Number(req.query.idAno) : undefined;
    res.json(await db.getMaterias(idAno));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

apiRouter.post(
  '/materias',
  requireAuth,
  requireRole('director', 'coordinador'),
  async (req: Request, res: Response) => {
    try {
      const { idAno, nombreMateria } = req.body || {};
      res.status(201).json(await db.createMateria(Number(idAno), String(nombreMateria)));
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

apiRouter.put(
  '/materias/:id',
  requireAuth,
  requireRole('director', 'coordinador'),
  async (req: Request, res: Response) => {
    try {
      const { nombreMateria, idAno } = req.body || {};
      res.json(await db.updateMateria(Number(req.params.id), String(nombreMateria), idAno ? Number(idAno) : undefined));
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

apiRouter.delete(
  '/materias/:id',
  requireAuth,
  requireRole('director', 'coordinador'),
  async (req: Request, res: Response) => {
    try {
      await db.deleteMateria(Number(req.params.id));
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

apiRouter.get('/docente-materias', requireAuth, async (req: Request, res: Response) => {
  try {
    const idUsuario = req.query.idUsuario ? Number(req.query.idUsuario) : undefined;
    const idMateria = req.query.idMateria ? Number(req.query.idMateria) : undefined;
    res.json(await db.getDocenteMaterias(idUsuario, idMateria));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

apiRouter.post(
  '/docente-materias',
  requireAuth,
  requireRole('director', 'coordinador'),
  async (req: Request, res: Response) => {
    try {
      const { idUsuario, idMateria } = req.body || {};
      const created = await db.assignDocenteMateria(Number(idUsuario), Number(idMateria));
      await db.logAuditEvent({
        ...getAuditAuthorFromReq(req),
        accion: 'ASIGNACION_DOCENTE_MATERIA',
        entidad: 'docente_materias',
        idEntidad: created.idAsignacion,
        detalles: { idUsuario, idMateria },
      });
      res.status(201).json(created);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

apiRouter.post(
  '/docente-materias/batch',
  requireAuth,
  requireRole('director', 'coordinador'),
  async (req: Request, res: Response) => {
    try {
      const { idUsuario, idMaterias } = req.body || {};
      const result = await db.assignDocenteMateriasBatch(Number(idUsuario), idMaterias || []);
      await db.logAuditEvent({
        ...getAuditAuthorFromReq(req),
        accion: 'ASIGNACION_DOCENTE_MATERIAS_BATCH',
        entidad: 'docente_materias',
        idEntidad: idUsuario,
        detalles: { idUsuario, totalMaterias: (idMaterias || []).length },
      });
      res.json(result);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

apiRouter.delete(
  '/docente-materias/:id',
  requireAuth,
  requireRole('director', 'coordinador'),
  async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      await db.removeDocenteMateria(id);
      await db.logAuditEvent({
        ...getAuditAuthorFromReq(req),
        accion: 'DESASIGNACION_DOCENTE_MATERIA',
        entidad: 'docente_materias',
        idEntidad: id,
      });
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

// ---------------------------------------------------------------------------
// 4. REPRESENTANTES & ESTUDIANTES
// ---------------------------------------------------------------------------
apiRouter.get('/representantes', requireAuth, async (req: Request, res: Response) => {
  try {
    if (req.authType === 'representante' && req.representante) {
      return res.json([req.representante]);
    }
    if (req.user?.rol === 'docente') {
      return res.json([]);
    }
    res.json(await db.getRepresentantes());
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

apiRouter.post(
  '/representantes',
  requireAuth,
  requireRole('director', 'coordinador'),
  validateBody(createRepresentanteSchema),
  async (req: Request, res: Response) => {
    try {
      const rep = await db.createRepresentante(req.body);
      await db.logAuditEvent({
        ...getAuditAuthorFromReq(req),
        accion: 'REPRESENTANTE_CREADO',
        entidad: 'representantes',
        idEntidad: rep.idRepresentante,
        detalles: { cedula: rep.cedula, email: rep.email, usuario: rep.usuario },
      });
      res.status(201).json(rep);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

apiRouter.put(
  '/representantes/:id',
  requireAuth,
  validateBody(updateRepresentanteSchema),
  async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const isSelfRep = req.authType === 'representante';

      if (isSelfRep) {
        if (!req.representante || req.representante.idRepresentante !== id) {
          return res.status(403).json({
            error: 'Acceso denegado: Solo puede modificar los datos de su propia cuenta.',
          });
        }
      } else if (!req.user || !['director', 'coordinador'].includes(req.user.rol)) {
        return res.status(403).json({
          error: 'Acceso denegado: Solo Director o Coordinador pueden modificar representantes.',
        });
      }

      const updated = await db.updateRepresentante(id, req.body, isSelfRep);
      await db.logAuditEvent({
        ...getAuditAuthorFromReq(req),
        accion: 'REPRESENTANTE_ACTUALIZADO',
        entidad: 'representantes',
        idEntidad: id,
        detalles: {
          camposModificados: Object.keys(req.body || {}).filter(
            (k) => k !== 'password' && k !== 'currentPassword' && k !== 'newPassword'
          ),
        },
      });
      res.json(updated);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

apiRouter.put(
  '/representantes/:id/credenciales',
  requireAuth,
  requireRole('director', 'coordinador'),
  validateBody(updateRepresentanteCredencialesSchema),
  async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const result = await db.updateRepresentanteCredenciales(id, req.body);
      await db.logAuditEvent({
        ...getAuditAuthorFromReq(req),
        accion: 'REPRESENTANTE_CREDENCIALES_ACTUALIZADAS',
        entidad: 'representantes',
        idEntidad: id,
        detalles: {
          email: req.body.email,
          usuario: req.body.usuario,
          activo: req.body.activo,
          passwordActualizada: Boolean(req.body.password),
        },
      });
      res.json(result);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

apiRouter.delete(
  '/representantes/:id',
  requireAuth,
  requireRole('director', 'coordinador'),
  async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      await db.deleteRepresentante(id);
      await db.logAuditEvent({
        ...getAuditAuthorFromReq(req),
        accion: 'REPRESENTANTE_ELIMINADO',
        entidad: 'representantes',
        idEntidad: id,
      });
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

apiRouter.get('/estudiantes', requireAuth, async (req: Request, res: Response) => {
  try {
    const idAno = req.query.idAno ? Number(req.query.idAno) : undefined;
    const idSeccion = req.query.idSeccion ? Number(req.query.idSeccion) : undefined;
    let idRepresentante = req.query.idRepresentante ? Number(req.query.idRepresentante) : undefined;

    if (req.authType === 'representante' && req.representante) {
      idRepresentante = req.representante.idRepresentante;
    }

    const canReadReps =
      req.authType === 'staff' && req.user?.rol !== 'docente';

    res.json(await db.getEstudiantes({ idAno, idSeccion, idRepresentante }, canReadReps));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

apiRouter.post(
  '/estudiantes',
  requireAuth,
  requireRole('director', 'coordinador'),
  async (req: Request, res: Response) => {
    try {
      const est = await db.createEstudiante(req.body);
      await db.logAuditEvent({
        ...getAuditAuthorFromReq(req),
        accion: 'ESTUDIANTE_INSCRITO',
        entidad: 'estudiantes',
        idEntidad: est.idEstudiante,
        detalles: { cedula: est.cedula, idAnoActual: est.idAnoActual },
      });
      res.status(201).json(est);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

apiRouter.put(
  '/estudiantes/:id',
  requireAuth,
  requireRole('director', 'coordinador'),
  async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const updated = await db.updateEstudiante(id, req.body);
      await db.logAuditEvent({
        ...getAuditAuthorFromReq(req),
        accion: 'ESTUDIANTE_ACTUALIZADO',
        entidad: 'estudiantes',
        idEntidad: id,
      });
      res.json(updated);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

apiRouter.delete(
  '/estudiantes/:id',
  requireAuth,
  requireRole('director', 'coordinador'),
  async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      await db.deleteEstudiante(id);
      await db.logAuditEvent({
        ...getAuditAuthorFromReq(req),
        accion: 'ESTUDIANTE_ELIMINADO',
        entidad: 'estudiantes',
        idEntidad: id,
      });
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

apiRouter.post(
  '/estudiantes/promover',
  requireAuth,
  requireRole('director', 'coordinador'),
  validateBody(promoverEstudiantesSchema),
  async (req: Request, res: Response) => {
    try {
      const result = await db.promoverEstudiantesMasivo(req.body);
      await db.logAuditEvent({
        ...getAuditAuthorFromReq(req),
        accion: 'PROMOCION_MASIVA_ESTUDIANTES',
        entidad: 'estudiantes',
        idEntidad: String(req.body.anioDestinoId),
        detalles: {
          anioOrigenId: req.body.anioOrigenId,
          seccionOrigenId: req.body.seccionOrigenId ?? null,
          anioDestinoId: req.body.anioDestinoId,
          seccionDestinoId: req.body.seccionDestinoId ?? null,
          promovidosCount: result.promovidosCount,
          estadoDestino: result.estadoDestino,
          destinoLabel: result.destinoLabel,
          estudiantesIds: result.estudiantesPromovidos,
        },
      });
      res.json(result);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

// ---------------------------------------------------------------------------
// 4.1 CALENDARIO DE DÍAS NO LABORABLES Y FERIADOS
// ---------------------------------------------------------------------------
apiRouter.get('/calendario/no-laborables', requireAuth, async (_req: Request, res: Response) => {
  try {
    res.json(await db.getDiasNoLaborables());
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

apiRouter.post(
  '/calendario/no-laborables',
  requireAuth,
  requireRole('director', 'coordinador'),
  validateBody(createDiaNoLaborableSchema),
  async (req: Request, res: Response) => {
    try {
      const created = await db.createDiaNoLaborable(req.body);
      await db.logAuditEvent({
        ...getAuditAuthorFromReq(req),
        accion: 'DIA_NO_LABORABLE_CREADO',
        entidad: 'dias_no_laborables',
        idEntidad: created.id,
        detalles: {
          fechaInicio: created.fechaInicio,
          fechaFin: created.fechaFin,
          motivo: created.motivo,
          lapsoId: created.lapsoId ?? null,
        },
      });
      res.status(201).json(created);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

apiRouter.delete(
  '/calendario/no-laborables/:id',
  requireAuth,
  requireRole('director', 'coordinador'),
  async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'ID de registro inválido.' });
      }
      const removed = await db.deleteDiaNoLaborable(id);
      await db.logAuditEvent({
        ...getAuditAuthorFromReq(req),
        accion: 'DIA_NO_LABORABLE_ELIMINADO',
        entidad: 'dias_no_laborables',
        idEntidad: id,
        detalles: {
          fechaInicio: removed.fechaInicio,
          fechaFin: removed.fechaFin,
          motivo: removed.motivo,
        },
      });
      res.json({ success: true, removed });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

apiRouter.get(
  '/calendario/verificar',
  requireAuth,
  validateQuery(verificarFechaQuerySchema),
  async (_req: Request, res: Response) => {
    try {
      const { fecha } = res.locals.validatedQuery as { fecha: string };
      res.json(await db.verificarDiaNoLaborable(fecha));
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

// ---------------------------------------------------------------------------
// 5. ASISTENCIA & PORTAL REPRESENTANTE
// ---------------------------------------------------------------------------
apiRouter.get('/asistencia', requireAuth, async (req: Request, res: Response) => {
  try {
    const filters = {
      fecha: req.query.fecha ? String(req.query.fecha) : undefined,
      mes: req.query.mes ? String(req.query.mes) : undefined,
      estado: req.query.estado ? (String(req.query.estado) as EstadoAsistencia) : undefined,
      idMateria: req.query.idMateria ? Number(req.query.idMateria) : undefined,
      idEstudiante: req.query.idEstudiante ? Number(req.query.idEstudiante) : undefined,
      idRepresentante:
        req.authType === 'representante' && req.representante
          ? req.representante.idRepresentante
          : req.query.idRepresentante
          ? Number(req.query.idRepresentante)
          : undefined,
      idSeccion: req.query.idSeccion ? Number(req.query.idSeccion) : undefined,
      idAno: req.query.idAno ? Number(req.query.idAno) : undefined,
      lapsoId:
        req.query.lapsoId || req.query.lapso_id
          ? Number(req.query.lapsoId || req.query.lapso_id)
          : undefined,
    };
    res.json(await db.getAsistencia(filters));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

const handleGetAttendanceHistoryPaginated = async (_req: Request, res: Response) => {
  try {
    const query = res.locals.validatedQuery as {
      page: number;
      limit: number;
      idAno?: number;
      idSeccion?: number;
      idMateria?: number;
      idEstudiante?: number;
      lapsoId?: number;
      fecha?: string;
      mes?: string;
      startDate?: string;
      endDate?: string;
      estado?: EstadoAsistencia;
      search?: string;
    };
    res.json(await db.getAsistenciaPaginated(query));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

apiRouter.get(
  '/asistencia/general',
  requireAuth,
  requireRole('director', 'coordinador'),
  validateQuery(attendanceHistoryQuerySchema),
  handleGetAttendanceHistoryPaginated
);

apiRouter.get(
  '/attendance/history',
  requireAuth,
  requireRole('director', 'coordinador'),
  validateQuery(attendanceHistoryQuerySchema),
  handleGetAttendanceHistoryPaginated
);

const handleRegistrarAsistenciaBatch = async (req: Request, res: Response) => {
  try {
    const { idMateria, fecha, records } = req.body;
    const nonWorkingCheck = await db.verificarDiaNoLaborable(fecha);
    if (nonWorkingCheck.esNoLaborable) {
      return res.status(400).json({
        error: `Sin actividades escolares: ${nonWorkingCheck.motivo}`,
        code: 'NON_WORKING_DAY',
        check: nonWorkingCheck,
      });
    }

    const ownership = await validateDocenteOwnership(req, Number(idMateria));
    if (!ownership.allowed) {
      return res.status(403).json({ error: ownership.reason });
    }

    // Restricción RBAC: Solo Coordinación o Dirección pueden justificar inasistencias o registrar reposos médicos
    if (req.user?.rol === 'docente') {
      const existingDayRecords = await db.getAsistencia({
        idMateria: Number(idMateria),
        fecha,
      });
      const existingByStudent = new Map(existingDayRecords.map((r) => [r.idEstudiante, r]));
      const unauthorizedJustifications = (
        records as Array<{ idEstudiante: number; estado: EstadoAsistencia }>
      ).filter((r) => {
        if (r.estado !== 'Justificado' && r.estado !== 'Reposo Médico') return false;
        const existing = existingByStudent.get(Number(r.idEstudiante));
        // Permitir únicamente reenviar el mismo estado si ya fue bloqueado/validado previamente por Coordinación
        return !existing || existing.estado !== r.estado;
      });

      if (unauthorizedJustifications.length > 0) {
        await db.logAuditEvent({
          ...getAuditAuthorFromReq(req),
          accion: 'INTENTO_JUSTIFICACION_ASISTENCIA_DENEGADO',
          entidad: 'asistencia',
          idEntidad: idMateria,
          detalles: {
            idMateria,
            fecha,
            rolPresente: req.user.rol,
            motivo:
              'Un docente intentó registrar estados Justificado o Reposo Médico sin permisos de Coordinación.',
          },
        });
        return res.status(403).json({
          error:
            'Acceso denegado: Solo los roles de Coordinador o Director pueden emitir justificaciones o registrar reposos médicos.',
          code: 'FORBIDDEN_JUSTIFICATION_ROLE',
        });
      }
    }

    const actorNombre = req.user
      ? `${req.user.nombre} ${req.user.apellidos || ''}`.trim()
      : 'Sistema';

    const saved = await db.registrarAsistenciaBatch(Number(idMateria), fecha, records, {
      actorId: req.user?.id,
      actorNombre,
      actorRol: req.user?.rol,
    });

    const resumenEstados = (
      records as Array<{ idEstudiante: number; estado: EstadoAsistencia }>
    ).reduce<Record<string, number>>((acc, item) => {
      acc[item.estado] = (acc[item.estado] || 0) + 1;
      return acc;
    }, {});

    await db.logAuditEvent({
      ...getAuditAuthorFromReq(req),
      accion: 'ASISTENCIA_REGISTRADA_BATCH',
      entidad: 'asistencia',
      idEntidad: idMateria,
      detalles: {
        idMateria,
        fecha,
        totalEstudiantes: records.length,
        resumenEstados,
        responsableId: req.user?.id || null,
        responsableNombre: actorNombre,
        responsableRol: req.user?.rol || null,
      },
    });

    // Despacho asíncrono desacoplado de notificaciones Web Push en lotes controlados
    const author = getAuditAuthorFromReq(req);
    enqueueDetachedPushJob(`asistencia_batch_${idMateria}`, async () => {
      const payload = await db.getPushDispatchPayloadForBatch(Number(idMateria), saved);
      if (payload.subscriptions.length > 0 && payload.records.length > 0) {
        await dispatchAttendancePushNotificationsDirect({
          idMateria: payload.idMateria,
          nombreMateria: payload.nombreMateria,
          fecha,
          records: payload.records,
          subscriptions: payload.subscriptions,
          author,
          context: 'asistencia_batch',
        });
      }
    });

    res.json({ success: true, count: saved.length });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
};

apiRouter.post(
  '/asistencia/batch',
  requireAuth,
  requireRole('director', 'coordinador', 'docente'),
  validateBody(asistenciaBatchSchema),
  handleRegistrarAsistenciaBatch
);

apiRouter.post(
  '/attendance/batch',
  requireAuth,
  requireRole('director', 'coordinador', 'docente'),
  validateBody(asistenciaBatchSchema),
  handleRegistrarAsistenciaBatch
);

const handleUpdateAsistenciaJustificacion = async (req: Request, res: Response) => {
  try {
    const idAsistencia = Number(req.params.id);
    if (!Number.isInteger(idAsistencia) || idAsistencia <= 0) {
      return res.status(400).json({ error: 'ID de registro de asistencia inválido.' });
    }

    if (!req.user) {
      return res.status(401).json({ error: 'No autenticado.' });
    }

    const { estado, motivoJustificacion, numeroJustificante, fechaRecepcionDocumento } = req.body;
    const actorNombre = `${req.user.nombre} ${req.user.apellidos || ''}`.trim();

    const updated = await db.updateAsistenciaJustificacion(
      idAsistencia,
      {
        estado,
        motivoJustificacion,
        numeroJustificante: numeroJustificante || null,
        fechaRecepcionDocumento: fechaRecepcionDocumento || null,
      },
      {
        id: req.user.id,
        nombre: actorNombre,
        rol: req.user.rol,
      }
    );

    if (!updated) {
      return res.status(404).json({ error: 'Registro de asistencia no encontrado.' });
    }

    await db.logAuditEvent({
      ...getAuditAuthorFromReq(req),
      accion: 'ASISTENCIA_JUSTIFICACION_MODIFICADA',
      entidad: 'asistencia',
      idEntidad: idAsistencia,
      detalles: {
        idAsistencia,
        idEstudiante: updated.registro.idEstudiante,
        estudiante: `${updated.registro.estudianteApellidos || ''}, ${updated.registro.estudianteNombres || ''}`.trim(),
        fechaClase: updated.registro.fecha,
        materia: updated.registro.nombreMateria,
        estadoAnterior: updated.previousEstado,
        estadoNuevo: updated.registro.estado,
        motivoJustificacion: updated.registro.motivoJustificacion,
        numeroJustificante: updated.registro.numeroJustificante,
        fechaRecepcionDocumento: updated.registro.fechaRecepcionDocumento,
        coordinadorResponsable: actorNombre,
        rolResponsable: req.user.rol,
      },
    });

    // Notificar al representante de forma asíncrona desacoplada
    const author = getAuditAuthorFromReq(req);
    enqueueDetachedPushJob(`asistencia_justificacion_${idAsistencia}`, async () => {
      const payload = await db.getPushDispatchPayloadForBatch(updated.registro.idMateria, [
        updated.registro,
      ]);
      if (payload.subscriptions.length > 0 && payload.records.length > 0) {
        await dispatchAttendancePushNotificationsDirect({
          idMateria: payload.idMateria,
          nombreMateria: payload.nombreMateria,
          fecha: updated.registro.fecha,
          records: payload.records,
          subscriptions: payload.subscriptions,
          author,
          context: 'asistencia_justificacion',
        });
      }
    });

    res.json({
      success: true,
      mensaje: 'Registro de asistencia actualizado y auditado correctamente.',
      registro: updated.registro,
    });
  } catch (e: any) {
    res.status(400).json({ error: e.message || 'Error al actualizar el registro de asistencia.' });
  }
};

apiRouter.patch(
  '/asistencia/:id',
  requireAuth,
  requireRole('coordinador', 'director'),
  validateBody(updateAsistenciaJustificacionSchema),
  handleUpdateAsistenciaJustificacion
);

apiRouter.patch(
  '/attendance/:id',
  requireAuth,
  requireRole('coordinador', 'director'),
  validateBody(updateAsistenciaJustificacionSchema),
  handleUpdateAsistenciaJustificacion
);

apiRouter.get('/portal/representante/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const idRep = Number(req.params.id);
    if (req.authType === 'representante') {
      if (!req.representante || req.representante.idRepresentante !== idRep) {
        return res.status(403).json({
          error: 'Acceso denegado: Solo puede consultar su propio portal de representante.',
        });
      }
    } else if (!req.user || !['director', 'coordinador'].includes(req.user.rol)) {
      return res.status(403).json({ error: 'Acceso denegado al portal de representante.' });
    }

    const data = await db.getPortalRepresentanteData(idRep);
    if (!data) {
      return res.status(404).json({ error: 'Representante no encontrado.' });
    }
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ---------------------------------------------------------------------------
// 6. HORARIOS ESCOLARES & ANTICONFLICTOS
// ---------------------------------------------------------------------------
apiRouter.get('/horarios', requireAuth, async (req: Request, res: Response) => {
  try {
    const filters = {
      idAno: req.query.idAno ? Number(req.query.idAno) : undefined,
      idSeccion: req.query.idSeccion ? Number(req.query.idSeccion) : undefined,
      diaSemana: req.query.diaSemana ? String(req.query.diaSemana) : undefined,
      idMateria: req.query.idMateria ? Number(req.query.idMateria) : undefined,
      idDocente: req.query.idDocente ? Number(req.query.idDocente) : undefined,
    };
    res.json(await db.getHorarios(filters));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

apiRouter.post(
  '/horarios/validate-conflict',
  requireAuth,
  requireRole('director', 'coordinador'),
  async (req: Request, res: Response) => {
    try {
      res.json(await db.detectHorarioConflict(req.body));
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

apiRouter.post(
  '/horarios/suggest-slots',
  requireAuth,
  requireRole('director', 'coordinador'),
  async (req: Request, res: Response) => {
    try {
      res.json(await db.suggestConflictFreeSlots(req.body));
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

apiRouter.post(
  '/horarios/auto-resolve',
  requireAuth,
  requireRole('director', 'coordinador'),
  async (req: Request, res: Response) => {
    try {
      const result = await db.autoResolveHorarioConflicts();
      await db.logAuditEvent({
        ...getAuditAuthorFromReq(req),
        accion: 'HORARIOS_AUTORESULETOS',
        entidad: 'horarios',
        detalles: result,
      });
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }
);

apiRouter.post(
  '/horarios',
  requireAuth,
  requireRole('director', 'coordinador'),
  validateBody(createHorarioSchema),
  async (req: Request, res: Response) => {
    try {
      const created = await db.createHorario(req.body);
      await db.logAuditEvent({
        ...getAuditAuthorFromReq(req),
        accion: 'HORARIO_BLOQUE_CREADO',
        entidad: 'horarios',
        idEntidad: created.idHorario,
        detalles: req.body,
      });
      res.status(201).json(created);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

apiRouter.put(
  '/horarios/:id',
  requireAuth,
  requireRole('director', 'coordinador'),
  async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const updated = await db.updateHorario(id, req.body);
      await db.logAuditEvent({
        ...getAuditAuthorFromReq(req),
        accion: 'HORARIO_BLOQUE_ACTUALIZADO',
        entidad: 'horarios',
        idEntidad: id,
        detalles: req.body,
      });
      res.json(updated);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

apiRouter.delete(
  '/horarios/:id',
  requireAuth,
  requireRole('director', 'coordinador'),
  async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      await db.deleteHorario(id);
      await db.logAuditEvent({
        ...getAuditAuthorFromReq(req),
        accion: 'HORARIO_BLOQUE_ELIMINADO',
        entidad: 'horarios',
        idEntidad: id,
      });
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

// ---------------------------------------------------------------------------
// 7. AUDITORÍA, RESPALDO & RESTAURACIÓN
// ---------------------------------------------------------------------------
const handleGetAuditLogsPaginated = async (_req: Request, res: Response) => {
  try {
    const query = res.locals.validatedQuery as {
      page: number;
      limit: number;
      accion?: string;
      entidad?: string;
      search?: string;
      startDate?: string;
      endDate?: string;
    };
    res.json(await db.getAuditLogsPaginated(query));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

apiRouter.get(
  '/auditoria',
  requireAuth,
  requireRole('director', 'coordinador'),
  validateQuery(auditLogsQuerySchema),
  handleGetAuditLogsPaginated
);

apiRouter.get(
  '/audit-logs',
  requireAuth,
  requireRole('director', 'coordinador'),
  validateQuery(auditLogsQuerySchema),
  handleGetAuditLogsPaginated
);

apiRouter.get(
  '/backup/stats',
  requireAuth,
  requireRole('director'),
  async (_req: Request, res: Response) => {
    try {
      res.json(await db.getDatabaseStats());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }
);

apiRouter.get(
  '/backup/export',
  requireAuth,
  requireRole('director'),
  async (req: Request, res: Response) => {
    try {
      const backup = await db.createFullDatabaseBackup(
        req.user ? { id: req.user.id, email: req.user.email, rol: req.user.rol } : undefined
      );
      await db.logAuditEvent({
        ...getAuditAuthorFromReq(req),
        accion: 'BACKUP_BASE_DATOS_EXPORTADO',
        entidad: 'DATABASE',
        idEntidad: 'full_backup',
        detalles: { conteos: backup.metadata.resumenConteos },
      });
      res.json(backup);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }
);

apiRouter.post(
  '/backup/restore',
  requireAuth,
  requireRole('director'),
  async (req: Request, res: Response) => {
    try {
      const result = await db.restoreFullDatabaseBackup(req.body);
      await db.logAuditEvent({
        ...getAuditAuthorFromReq(req),
        accion: 'RESTAURACION_BASE_DATOS_EJECUTADA',
        entidad: 'DATABASE',
        idEntidad: 'full_restore',
        detalles: { tablasRestauradas: result.tablasRestauradas },
      });
      res.json(result);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

apiRouter.post(
  '/backup/reset',
  requireAuth,
  requireRole('director'),
  async (req: Request, res: Response) => {
    try {
      const result = await db.resetDatabaseToMasterSeed();
      await db.logAuditEvent({
        ...getAuditAuthorFromReq(req),
        accion: 'REINICIO_SEMILLA_MAESTRA_EJECUTADO',
        entidad: 'DATABASE',
        idEntidad: 'seed_reset',
        detalles: { resultado: result.mensaje },
      });
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }
);

// ---------------------------------------------------------------------------
// 8. NOTIFICACIONES WEB PUSH
// ---------------------------------------------------------------------------
apiRouter.get('/push/vapid-public-key', async (_req: Request, res: Response) => {
  try {
    const publicKey = await getVapidPublicKey();
    res.json({ publicKey });
  } catch (error: any) {
    console.error('Error getting VAPID public key:', error);
    res.status(500).json({ error: 'No se pudo obtener la clave pública VAPID.' });
  }
});

apiRouter.get('/push/status', requireAuth, async (req: Request, res: Response) => {
  if (req.authType !== 'representante' || !req.representante) {
    return res.json({ activeDevices: 0 });
  }
  const activeDevices = await db.getPushSubscriptionsCountForRep(
    req.representante.idRepresentante
  );
  res.json({ activeDevices });
});

apiRouter.post(
  '/push/subscribe',
  requireAuth,
  validateBody(pushSubscriptionSchema),
  async (req: Request, res: Response) => {
    if (req.authType !== 'representante' || !req.representante) {
      return res.status(403).json({
        error: 'Solo representantes autenticados pueden activar alertas push.',
      });
    }
    try {
      const sub = await db.upsertPushSubscription({
        idRepresentante: req.representante.idRepresentante,
        endpoint: req.body.endpoint,
        p256dh: req.body.keys.p256dh,
        auth: req.body.keys.auth,
        userAgent: req.headers['user-agent'] || null,
      });
      await db.logAuditEvent({
        ...getAuditAuthorFromReq(req),
        accion: 'PUSH_SUSCRIPCION_REGISTRADA',
        entidad: 'push_subscriptions',
        idEntidad: sub.idSubscription,
      });
      res.json({ success: true, idSubscription: sub.idSubscription });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

apiRouter.post(
  '/push/unsubscribe',
  requireAuth,
  validateBody(pushUnsubscribeSchema),
  async (req: Request, res: Response) => {
    if (req.authType !== 'representante' || !req.representante) {
      return res.json({ success: false, removed: false });
    }
    const removed = await db.deactivatePushSubscriptionForRep(
      req.body.endpoint,
      req.representante.idRepresentante
    );
    res.json({ success: true, removed });
  }
);

apiRouter.post('/push/test', requireAuth, async (req: Request, res: Response) => {
  if (req.authType !== 'representante' || !req.representante) {
    return res.status(403).json({
      error: 'Solo representantes autenticados pueden probar alertas push.',
    });
  }
  try {
    const subs = await db.getPushSubscriptionsForRep(req.representante.idRepresentante);
    if (subs.length === 0) {
      return res.status(400).json({
        error: 'No hay dispositivos suscritos para este representante. Active las alertas push primero.',
      });
    }

    const repNombre = `${req.representante.nombres} ${req.representante.apellidos}`.trim();
    const result = await sendTestPushToSubscriptions(subs, repNombre, getAuditAuthorFromReq(req));

    res.json({
      success: result.sent > 0,
      sent: result.sent,
      failed: result.failed,
      totalDevices: subs.length,
      expiredRemoved: result.metrics.eliminados410,
      message:
        result.sent > 0
          ? `Notificación de prueba enviada a ${result.sent} dispositivo(s).`
          : `No se pudo entregar la notificación de prueba${result.lastError ? `: ${result.lastError}` : '.'}`,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Error al enviar notificación de prueba.' });
  }
});

apiRouter.get(
  '/push/milestones/status',
  requireAuth,
  requireRole('director', 'coordinador'),
  async (_req: Request, res: Response) => {
    try {
      const clock = getSchoolClockInTimezone();
      const [targets, recentHistory] = await Promise.all([
        db.getMilestonePushTargets(),
        db.getMilestoneDispatches(20),
      ]);
      res.json({
        targetDevices: targets.targetDevices,
        targetRepresentantes: targets.targetRepresentantes,
        serverSchoolTime: clock.timeHHMM,
        serverSchoolDate: clock.dateYmd,
        timezone: clock.timezone,
        recentHistory,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Error al consultar estado de hitos push.' });
    }
  }
);

apiRouter.post(
  '/push/milestones/trigger',
  requireAuth,
  requireRole('director', 'coordinador'),
  validateBody(triggerMilestonePushSchema),
  async (req: Request, res: Response) => {
    try {
      const { tipo, mensajePersonalizado } = req.body as {
        tipo: 'receso' | 'salida';
        mensajePersonalizado?: string;
      };
      const result = await enqueueManualMilestonePush(tipo, {
        mensajePersonalizado,
        author: getAuditAuthorFromReq(req),
      });
      res.status(result.queued ? 202 : 200).json(result);
    } catch (e: any) {
      res.status(400).json({ error: e.message || 'Error al disparar notificación de hito.' });
    }
  }
);

apiRouter.post(
  '/push/test-load',
  requireAuth,
  requireRole('director'),
  validateBody(testPushLoadSchema),
  async (req: Request, res: Response) => {
    try {
      const { totalObjetivos, chunkSize, chunkDelayMs } = (req.body || {}) as {
        totalObjetivos?: number;
        chunkSize?: number;
        chunkDelayMs?: number;
      };
      const report = await testPushLoad({
        totalObjetivos: totalObjetivos ?? 3000,
        chunkSize: chunkSize ?? 35,
        chunkDelayMs: chunkDelayMs ?? 75,
      });

      await db.logAuditEvent({
        ...getAuditAuthorFromReq(req),
        accion: 'PUSH_TEST_CARGA_SIMULADA',
        entidad: 'push_notifications',
        idEntidad: 'testPushLoad',
        detalles: {
          ...report.metricasDespacho,
          heapUsedAntesMB: report.memoriaRAM.heapUsedAntesMB,
          heapUsedDespuesMB: report.memoriaRAM.heapUsedDespuesMB,
          excepcionesNoCapturadas: report.estabilidad.excepcionesNoCapturadas,
        },
      });

      res.json(report);
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Error ejecutando prueba de carga simulada.' });
    }
  }
);

apiRouter.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Endpoint de API no encontrado.' });
});
