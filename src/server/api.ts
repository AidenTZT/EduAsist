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
  verifySameOriginForCookieMutations,
  isCoordinadorSeccional,
  getCoordinadorSeccionalAnos,
  assertCoordinadorSeccionalAno,
} from './auth.ts';
import {
  validateBody,
  validateQuery,
  validatePositiveIntParam,
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
  pushRotateSchema,
  pushUnsubscribeSchema,
  updateHorariosConfigSchema,
  triggerMilestonePushSchema,
  promoverEstudiantesSchema,
  createDiaNoLaborableSchema,
  verificarFechaQuerySchema,
  testPushLoadSchema,
  updateEstudianteSchema,
  cierreAnioEscolarSchema,
  limpiarAntiguosSchema,
  resumenesAsistenciaQuerySchema,
  restoreBackupSchema,
  resetDatabaseSchema,
  cierreBackupFilenameSchema,
  backupLogsQuerySchema,
  backupLogIdParamSchema,
  configuracionEntrySchema,
  updateRecesoSchema,
  createAnoSchema,
  updateAnoSchema,
  createSeccionSchema,
  updateSeccionSchema,
  createMateriaSchema,
  updateMateriaSchema,
  assignDocenteMateriaSchema,
  assignDocenteMateriasBatchSchema,
  replaceDocenteMateriasSchema,
  createEstudianteSchema,
  asistenciaQuerySchema,
  validateHorarioConflictSchema,
  suggestSlotsSchema,
  updateHorarioSchema,
  usersQuerySchema,
  soloActivosQuerySchema,
  lapsosQuerySchema,
  idAnoOptionalQuerySchema,
  docenteMateriasQuerySchema,
  estudiantesQuerySchema,
  horariosQuerySchema,
  notificacionesQuerySchema,
  createSuplenciaSchema,
  updateSuplenciaSchema,
  suplenciasQuerySchema,
} from './validation.ts';
import type { EstadoAsistencia, RolUsuario } from '../types.ts';
import {
  getVapidPublicKey,
  dispatchAttendancePushNotificationsDirect,
  buildAttendanceNotificationDetails,
  sendTestPushToSubscriptions,
  testPushLoad,
} from './pushService.ts';
import {
  getSchoolClockInTimezone,
  triggerMilestonePush,
  enqueueManualMilestonePush,
  startInstitutionalMilestoneScheduler,
  recordSalidaInboxNotifications,
  executeSalidaPushNotification,
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

const standardJsonParser = express.json({ limit: '1mb' });
const restoreJsonParser = express.json({ limit: '50mb' });

schoolApp.set('trust proxy', 1);
schoolApp.use(cookieParser());
schoolApp.use(verifySameOriginForCookieMutations);
schoolApp.use((req, res, next) => {
  if (req.path === '/backup/restore' && req.method === 'POST') {
    return restoreJsonParser(req, res, next);
  }
  return standardJsonParser(req, res, next);
});
schoolApp.use(express.urlencoded({ extended: true, limit: '1mb' }));
schoolApp.use((err: any, _req: Request, res: Response, next: express.NextFunction) => {
  if (err?.type === 'entity.too.large' || err?.status === 413) {
    res.status(413).json({
      error: 'La carga útil enviada excede el tamaño máximo permitido.',
      code: 'PAYLOAD_TOO_LARGE',
    });
    return;
  }
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({
      error: 'Cuerpo JSON malformado.',
      code: 'INVALID_JSON',
    });
    return;
  }
  next(err);
});
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

function getAllowedAnosScope(req: Request): number[] | undefined {
  return isCoordinadorSeccional(req.user) ? getCoordinadorSeccionalAnos(req.user) : undefined;
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

const pushRotateRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      error: 'Demasiadas solicitudes de rotación de suscripción push.',
      code: 'RATE_LIMITED',
    });
  },
});

const loadTestRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      error: 'Límite de pruebas de carga alcanzado. Espere unos minutos antes de reintentar.',
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
  validateBody(configuracionEntrySchema),
  async (req: Request, res: Response) => {
    try {
      const { clave, valor, descripcion } = req.body;
      const updated = await db.setConfiguracion(clave, valor, descripcion ?? undefined);
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

apiRouter.get(
  '/recesos',
  requireAuth,
  validateQuery(soloActivosQuerySchema),
  async (_req: Request, res: Response) => {
    try {
      const { soloActivos } = res.locals.validatedQuery as { soloActivos: boolean };
      res.json(await db.getRecesos(soloActivos));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }
);

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
  validatePositiveIntParam('id', 'receso'),
  validateBody(updateRecesoSchema),
  async (req: Request, res: Response) => {
    try {
      const idReceso = res.locals.validatedParams.id as number;
      const updated = await db.updateReceso(idReceso, req.body);
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
  validatePositiveIntParam('id', 'receso'),
  async (req: Request, res: Response) => {
    try {
      const idReceso = res.locals.validatedParams.id as number;
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
  validatePositiveIntParam('id', 'receso'),
  async (req: Request, res: Response) => {
    try {
      const idReceso = res.locals.validatedParams.id as number;
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
// (Planificador automático unificado en scheduleNotifier.ts)
// ---------------------------------------------------------------------------

apiRouter.get(
  '/salidas',
  requireAuth,
  validateQuery(soloActivosQuerySchema),
  async (_req: Request, res: Response) => {
    try {
      const { soloActivos } = res.locals.validatedQuery as { soloActivos: boolean };
      res.json(await db.getSalidas(soloActivos));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }
);

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
  validatePositiveIntParam('id', 'hora de salida'),
  validateBody(updateSalidaSchema),
  async (req: Request, res: Response) => {
    try {
      const idSalida = res.locals.validatedParams.id as number;
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
  validatePositiveIntParam('id', 'hora de salida'),
  async (req: Request, res: Response) => {
    try {
      const idSalida = res.locals.validatedParams.id as number;
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
  validatePositiveIntParam('id', 'hora de salida'),
  async (req: Request, res: Response) => {
    try {
      const idSalida = res.locals.validatedParams.id as number;
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
  requireRole('director', 'coordinador'),
  validatePositiveIntParam('id', 'hora de salida'),
  async (req: Request, res: Response) => {
    try {
      const idSalida = res.locals.validatedParams.id as number;

      const clock = getSchoolClockInTimezone();
      const author = getAuditAuthorFromReq(req);
      const payload = await db.getSalidasPushDispatchPayload(idSalida);

      await recordSalidaInboxNotifications(payload, clock);

      if (payload.subscriptions.length === 0 || payload.targets.length === 0) {
        await db.markSalidaNotified(payload.salida.idSalida, clock.dateYmd, clock.timeHHMM);
        return res.json({
          success: true,
          queued: false,
          salida: {
            ...payload.salida,
            ultimaNotificacionFecha: clock.dateYmd,
            ultimaNotificacionHora: clock.timeHHMM,
          },
          sent: 0,
          failed: 0,
          totalDispositivos: 0,
          totalRepresentantes: payload.targets.length,
          expiredRemoved: 0,
          mensaje: `Hora de salida (${payload.salida.horaSalida}) registrada en el portal de representantes. No hay dispositivos suscritos a push para este alcance.`,
        });
      }

      // Marcar fecha/hora de despacho y ejecutar el envío masivo por lotes de forma desacoplada
      await db.markSalidaNotified(payload.salida.idSalida, clock.dateYmd, clock.timeHHMM);
      enqueueDetachedPushJob(`salida_manual_${idSalida}`, async () => {
        const result = await executeSalidaPushNotification(
          idSalida,
          'manual',
          clock,
          author,
          payload,
          true
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
          ultimaNotificacionFecha: clock.dateYmd,
          ultimaNotificacionHora: clock.timeHHMM,
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
  requireRole('director', 'coordinador', 'coordinador_seccional'),
  validateQuery(lapsosQuerySchema),
  async (_req: Request, res: Response) => {
    try {
      const { anioEscolar, soloActivos } = res.locals.validatedQuery as {
        anioEscolar?: string;
        soloActivos: boolean;
      };
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
  validatePositiveIntParam('id', 'lapso escolar'),
  validateBody(updateLapsoSchema),
  async (req: Request, res: Response) => {
    try {
      const id = res.locals.validatedParams.id as number;
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
  validatePositiveIntParam('id', 'lapso escolar'),
  validateBody(activateLapsoSchema),
  async (req: Request, res: Response) => {
    try {
      const id = res.locals.validatedParams.id as number;
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
  validatePositiveIntParam('id', 'lapso escolar'),
  async (req: Request, res: Response) => {
    try {
      const id = res.locals.validatedParams.id as number;
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
apiRouter.get(
  '/users',
  requireAuth,
  validateQuery(usersQuerySchema),
  async (req: Request, res: Response) => {
    if (req.authType !== 'staff' || !req.user) {
      return res.status(403).json({ error: 'Acceso reservado para personal institucional.' });
    }
    try {
      const { rol } = res.locals.validatedQuery as { rol?: RolUsuario };
      res.json(await db.getUsers(rol, { id: req.user.id, rol: req.user.rol }));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }
);

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
  validatePositiveIntParam('id', 'usuario'),
  validateBody(updateStaffUserSchema),
  async (req: Request, res: Response) => {
    try {
      const id = res.locals.validatedParams.id as number;
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
  validatePositiveIntParam('id', 'usuario'),
  async (req: Request, res: Response) => {
    try {
      const id = res.locals.validatedParams.id as number;
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
apiRouter.get('/anos', requireAuth, async (req: Request, res: Response) => {
  try {
    res.json(await db.getAnosEscolares(getAllowedAnosScope(req)));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

apiRouter.post(
  '/anos',
  requireAuth,
  requireRole('director', 'coordinador'),
  validateBody(createAnoSchema),
  async (req: Request, res: Response) => {
    try {
      const { nombreNivel, activo = true } = req.body;
      const created = await db.createAnoEscolar(nombreNivel, activo);
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
  validatePositiveIntParam('id', 'año escolar'),
  validateBody(updateAnoSchema),
  async (req: Request, res: Response) => {
    try {
      const id = res.locals.validatedParams.id as number;
      const { nombreNivel, activo } = req.body;
      res.json(await db.updateAnoEscolar(id, nombreNivel, activo));
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

apiRouter.delete(
  '/anos/:id',
  requireAuth,
  requireRole('director', 'coordinador'),
  validatePositiveIntParam('id', 'año escolar'),
  async (_req: Request, res: Response) => {
    try {
      const id = res.locals.validatedParams.id as number;
      await db.deleteAnoEscolar(id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

apiRouter.get(
  '/secciones',
  requireAuth,
  validateQuery(idAnoOptionalQuerySchema),
  async (req: Request, res: Response) => {
    try {
      const { idAno } = res.locals.validatedQuery as { idAno?: number };
      if (idAno && !(await assertCoordinadorSeccionalAno(req, res, idAno, 'secciones'))) {
        return;
      }
      res.json(await db.getSecciones(idAno, getAllowedAnosScope(req)));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }
);

apiRouter.post(
  '/secciones',
  requireAuth,
  requireRole('director', 'coordinador', 'coordinador_seccional'),
  validateBody(createSeccionSchema),
  async (req: Request, res: Response) => {
    try {
      const { idAno, nombreSeccion } = req.body;
      if (!(await assertCoordinadorSeccionalAno(req, res, idAno, 'secciones'))) {
        return;
      }
      res.status(201).json(await db.createSeccion(idAno, nombreSeccion));
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

apiRouter.put(
  '/secciones/:id',
  requireAuth,
  requireRole('director', 'coordinador', 'coordinador_seccional'),
  validatePositiveIntParam('id', 'sección'),
  validateBody(updateSeccionSchema),
  async (req: Request, res: Response) => {
    try {
      const id = res.locals.validatedParams.id as number;
      if (isCoordinadorSeccional(req.user)) {
        const existing = await db.getSeccionById(id);
        if (!existing) {
          return res.status(404).json({ error: 'Sección no encontrada.' });
        }
        if (!(await assertCoordinadorSeccionalAno(req, res, existing.idAno, 'secciones'))) {
          return;
        }
        if (
          req.body.idAno !== undefined &&
          !(await assertCoordinadorSeccionalAno(req, res, req.body.idAno, 'secciones'))
        ) {
          return;
        }
      }
      const { nombreSeccion, idAno } = req.body;
      res.json(await db.updateSeccion(id, nombreSeccion, idAno));
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

apiRouter.delete(
  '/secciones/:id',
  requireAuth,
  requireRole('director', 'coordinador', 'coordinador_seccional'),
  validatePositiveIntParam('id', 'sección'),
  async (req: Request, res: Response) => {
    try {
      const id = res.locals.validatedParams.id as number;
      if (isCoordinadorSeccional(req.user)) {
        const existing = await db.getSeccionById(id);
        if (!existing) {
          return res.status(404).json({ error: 'Sección no encontrada.' });
        }
        if (!(await assertCoordinadorSeccionalAno(req, res, existing.idAno, 'secciones'))) {
          return;
        }
      }
      await db.deleteSeccion(id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

apiRouter.get(
  '/materias',
  requireAuth,
  validateQuery(idAnoOptionalQuerySchema),
  async (req: Request, res: Response) => {
    try {
      const { idAno } = res.locals.validatedQuery as { idAno?: number };
      if (idAno && !(await assertCoordinadorSeccionalAno(req, res, idAno, 'materias'))) {
        return;
      }
      const includeTeacherEmail =
        req.authType === 'staff' &&
        req.user?.rol !== 'docente' &&
        req.user?.rol !== 'docente_suplente';
      res.json(await db.getMaterias(idAno, includeTeacherEmail, getAllowedAnosScope(req)));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }
);

apiRouter.post(
  '/materias',
  requireAuth,
  requireRole('director', 'coordinador', 'coordinador_seccional'),
  validateBody(createMateriaSchema),
  async (req: Request, res: Response) => {
    try {
      const { idAno, nombreMateria } = req.body;
      if (!(await assertCoordinadorSeccionalAno(req, res, idAno, 'materias'))) {
        return;
      }
      res.status(201).json(await db.createMateria(idAno, nombreMateria));
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

apiRouter.put(
  '/materias/:id',
  requireAuth,
  requireRole('director', 'coordinador', 'coordinador_seccional'),
  validatePositiveIntParam('id', 'materia'),
  validateBody(updateMateriaSchema),
  async (req: Request, res: Response) => {
    try {
      const id = res.locals.validatedParams.id as number;
      if (isCoordinadorSeccional(req.user)) {
        const existing = await db.getMateriaById(id);
        if (!existing) {
          return res.status(404).json({ error: 'Materia no encontrada.' });
        }
        if (!(await assertCoordinadorSeccionalAno(req, res, existing.idAno, 'materias'))) {
          return;
        }
        if (
          req.body.idAno !== undefined &&
          !(await assertCoordinadorSeccionalAno(req, res, req.body.idAno, 'materias'))
        ) {
          return;
        }
      }
      const { nombreMateria, idAno } = req.body;
      res.json(await db.updateMateria(id, nombreMateria, idAno));
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

apiRouter.delete(
  '/materias/:id',
  requireAuth,
  requireRole('director', 'coordinador', 'coordinador_seccional'),
  validatePositiveIntParam('id', 'materia'),
  async (req: Request, res: Response) => {
    try {
      const id = res.locals.validatedParams.id as number;
      if (isCoordinadorSeccional(req.user)) {
        const existing = await db.getMateriaById(id);
        if (!existing) {
          return res.status(404).json({ error: 'Materia no encontrada.' });
        }
        if (!(await assertCoordinadorSeccionalAno(req, res, existing.idAno, 'materias'))) {
          return;
        }
      }
      await db.deleteMateria(id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

apiRouter.get(
  '/docente-materias',
  requireAuth,
  validateQuery(docenteMateriasQuerySchema),
  async (req: Request, res: Response) => {
    try {
      const { idUsuario, idMateria } = res.locals.validatedQuery as {
        idUsuario?: number;
        idMateria?: number;
      };
      res.json(await db.getDocenteMaterias(idUsuario, idMateria, getAllowedAnosScope(req)));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }
);

apiRouter.post(
  '/docente-materias',
  requireAuth,
  requireRole('director', 'coordinador', 'coordinador_seccional'),
  validateBody(assignDocenteMateriaSchema),
  async (req: Request, res: Response) => {
    try {
      const { idUsuario, idMateria } = req.body;
      if (isCoordinadorSeccional(req.user)) {
        const mat = await db.getMateriaById(idMateria);
        if (!mat) {
          return res.status(404).json({ error: 'Materia no encontrada.' });
        }
        if (!(await assertCoordinadorSeccionalAno(req, res, mat.idAno, 'docente_materias'))) {
          return;
        }
      }
      const created = await db.assignDocenteMateria(idUsuario, idMateria);
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
  requireRole('director', 'coordinador', 'coordinador_seccional'),
  validateBody(assignDocenteMateriasBatchSchema),
  async (req: Request, res: Response) => {
    try {
      const { idUsuario, idMaterias } = req.body;
      if (isCoordinadorSeccional(req.user)) {
        for (const idMat of idMaterias as number[]) {
          const mat = await db.getMateriaById(idMat);
          if (!mat) {
            return res.status(404).json({ error: `La materia ID ${idMat} no existe.` });
          }
          if (!(await assertCoordinadorSeccionalAno(req, res, mat.idAno, 'docente_materias'))) {
            return;
          }
        }
      }
      const result = await db.assignDocenteMateriasBatch(idUsuario, idMaterias);
      await db.logAuditEvent({
        ...getAuditAuthorFromReq(req),
        accion: 'ASIGNACION_DOCENTE_MATERIAS_BATCH',
        entidad: 'docente_materias',
        idEntidad: idUsuario,
        detalles: { idUsuario, totalMaterias: idMaterias.length },
      });
      res.json(result);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

apiRouter.put(
  '/docente-materias/docente/:idDocente',
  requireAuth,
  requireRole('director', 'coordinador', 'coordinador_seccional'),
  validatePositiveIntParam('idDocente', 'docente'),
  validateBody(replaceDocenteMateriasSchema),
  async (req: Request, res: Response) => {
    try {
      const idDocente = res.locals.validatedParams.idDocente as number;
      const { idMaterias } = req.body as { idMaterias: number[] };
      const allowedAnos = isCoordinadorSeccional(req.user)
        ? await getCoordinadorSeccionalAnos(req.user)
        : undefined;

      const result = await db.replaceDocenteMaterias(idDocente, idMaterias, allowedAnos);
      await db.logAuditEvent({
        ...getAuditAuthorFromReq(req),
        accion: 'ASIGNACION_DOCENTE_MATERIAS_REEMPLAZADA',
        entidad: 'docente_materias',
        idEntidad: idDocente,
        detalles: {
          idUsuario: idDocente,
          totalMaterias: result.count,
          agregadas: result.addedCount,
          removidas: result.removedCount,
        },
      });
      res.json(result);
    } catch (e: any) {
      const msg = String(e?.message || 'Error al reemplazar asignaciones del docente.');
      const status = msg.startsWith('Acceso denegado') ? 403 : msg.includes('no existe') ? 404 : 400;
      res.status(status).json({ error: msg });
    }
  }
);

apiRouter.delete(
  '/docente-materias/:id',
  requireAuth,
  requireRole('director', 'coordinador', 'coordinador_seccional'),
  validatePositiveIntParam('id', 'asignación docente-materia'),
  async (req: Request, res: Response) => {
    try {
      const id = res.locals.validatedParams.id as number;
      if (isCoordinadorSeccional(req.user)) {
        const allAssignments = await db.getDocenteMaterias();
        const existing = allAssignments.find((a) => a.idAsignacion === id);
        if (!existing) {
          return res.status(404).json({ error: 'Asignación docente-materia no encontrada.' });
        }
        if (!(await assertCoordinadorSeccionalAno(req, res, existing.idAno, 'docente_materias'))) {
          return;
        }
      }
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
// 3B. SUPLENCIAS DOCENTES
// ---------------------------------------------------------------------------
apiRouter.get(
  '/suplencias',
  requireAuth,
  validateQuery(suplenciasQuerySchema),
  async (req: Request, res: Response) => {
    if (req.authType !== 'staff' || !req.user) {
      return res.status(403).json({ error: 'Acceso reservado para personal institucional.' });
    }
    try {
      const q = res.locals.validatedQuery as {
        idSuplente?: number;
        idDocenteTitular?: number;
        idMateria?: number;
        idAno?: number;
        soloVigentes?: boolean;
        fecha?: string;
      };

      if (q.idAno && !(await assertCoordinadorSeccionalAno(req, res, q.idAno, 'suplencias_docentes'))) {
        return;
      }

      const includeEmails = req.user.rol !== 'docente' && req.user.rol !== 'docente_suplente';
      const effectiveFilters = {
        ...q,
        idSuplente: req.user.rol === 'docente_suplente' ? req.user.id : q.idSuplente,
        idDocenteTitular: req.user.rol === 'docente' ? req.user.id : q.idDocenteTitular,
        allowedAnos: getAllowedAnosScope(req),
        includeEmails,
      };

      res.json(await db.getSuplenciasDocentes(effectiveFilters));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }
);

function getSuplenciaCoveredAnoIds(sup: {
  idAno?: number | null;
  materiasTitularResumen?: Array<{ idAno: number }>;
}): number[] {
  const fromResumen = (sup.materiasTitularResumen || []).map((m) => m.idAno);
  if (fromResumen.length > 0) {
    return Array.from(new Set(fromResumen));
  }
  return sup.idAno != null ? [sup.idAno] : [];
}

apiRouter.post(
  '/suplencias',
  requireAuth,
  requireRole('director', 'coordinador', 'coordinador_seccional'),
  validateBody(createSuplenciaSchema),
  async (req: Request, res: Response) => {
    try {
      if (req.body.alcanceCompleto) {
        if (isCoordinadorSeccional(req.user)) {
          if (req.body.idSeccion) {
            const secs = await db.getSecciones();
            const sec = secs.find((s) => s.idSeccion === Number(req.body.idSeccion));
            if (sec && !(await assertCoordinadorSeccionalAno(req, res, sec.idAno, 'suplencias_docentes'))) {
              return;
            }
          } else {
            const titularMats = await db.getDocenteMaterias(req.body.idDocenteTitular);
            const titularAnos = Array.from(
              new Set(titularMats.map((dm) => dm.idAno).filter((id): id is number => id != null))
            );
            for (const anoId of titularAnos) {
              if (!(await assertCoordinadorSeccionalAno(req, res, anoId, 'suplencias_docentes'))) {
                return;
              }
            }
          }
        }
      } else {
        const materia = await db.getMateriaById(req.body.idMateria);
        if (!materia) {
          return res.status(404).json({ error: 'La materia seleccionada no existe.' });
        }
        if (!(await assertCoordinadorSeccionalAno(req, res, materia.idAno, 'suplencias_docentes'))) {
          return;
        }
      }

      const created = await db.createSuplenciaDocente(req.body);
      await db.logAuditEvent({
        ...getAuditAuthorFromReq(req),
        accion: 'SUPLENCIA_DOCENTE_CREADA',
        entidad: 'suplencias_docentes',
        idEntidad: created.idSuplencia,
        detalles: {
          idSuplencia: created.idSuplencia,
          idSuplente: created.idSuplente,
          idDocenteTitular: created.idDocenteTitular,
          alcanceCompleto: Boolean(created.alcanceCompleto),
          idMateria: created.idMateria ?? null,
          idAno: created.idAno ?? null,
          idSeccion: created.idSeccion ?? null,
          fechaInicio: created.fechaInicio ?? null,
          fechaFin: created.fechaFin ?? null,
          motivo: created.motivo ?? null,
        },
      });
      res.status(201).json(created);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

apiRouter.put(
  '/suplencias/:id',
  requireAuth,
  requireRole('director', 'coordinador', 'coordinador_seccional'),
  validatePositiveIntParam('id', 'suplencia docente'),
  validateBody(updateSuplenciaSchema),
  async (req: Request, res: Response) => {
    try {
      const id = res.locals.validatedParams.id as number;
      const existing = await db.getSuplenciaById(id);
      if (!existing) {
        return res.status(404).json({ error: 'Suplencia docente no encontrada.' });
      }
      if (isCoordinadorSeccional(req.user)) {
        const existingAnos = getSuplenciaCoveredAnoIds(existing);
        for (const anoId of existingAnos) {
          if (!(await assertCoordinadorSeccionalAno(req, res, anoId, 'suplencias_docentes'))) {
            return;
          }
        }
      }

      const nextAlcanceCompleto =
        req.body.alcanceCompleto !== undefined
          ? Boolean(req.body.alcanceCompleto)
          : Boolean(existing.alcanceCompleto);

      if (!nextAlcanceCompleto && req.body.idMateria !== undefined && req.body.idMateria !== null) {
        const mat = await db.getMateriaById(req.body.idMateria);
        if (!mat) {
          return res.status(404).json({ error: 'Materia no encontrada.' });
        }
        if (!(await assertCoordinadorSeccionalAno(req, res, mat.idAno, 'suplencias_docentes'))) {
          return;
        }
      } else if (nextAlcanceCompleto && isCoordinadorSeccional(req.user)) {
        const targetTitularId = req.body.idDocenteTitular ?? existing.idDocenteTitular;
        const targetSeccionId =
          req.body.idSeccion !== undefined ? req.body.idSeccion : existing.idSeccion;
        if (targetSeccionId) {
          const secs = await db.getSecciones();
          const sec = secs.find((s) => s.idSeccion === Number(targetSeccionId));
          if (sec && !(await assertCoordinadorSeccionalAno(req, res, sec.idAno, 'suplencias_docentes'))) {
            return;
          }
        } else {
          const titularMats = await db.getDocenteMaterias(targetTitularId);
          const titularAnos = Array.from(
            new Set(titularMats.map((dm) => dm.idAno).filter((ano): ano is number => ano != null))
          );
          for (const anoId of titularAnos) {
            if (!(await assertCoordinadorSeccionalAno(req, res, anoId, 'suplencias_docentes'))) {
              return;
            }
          }
        }
      }

      const updated = await db.updateSuplenciaDocente(id, req.body);
      await db.logAuditEvent({
        ...getAuditAuthorFromReq(req),
        accion: 'SUPLENCIA_DOCENTE_ACTUALIZADA',
        entidad: 'suplencias_docentes',
        idEntidad: id,
        detalles: {
          idSuplencia: id,
          alcanceCompleto: Boolean(updated.alcanceCompleto),
          idAno: updated.idAno ?? null,
          idMateria: updated.idMateria ?? null,
          idSeccion: updated.idSeccion ?? null,
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
  '/suplencias/:id/toggle',
  requireAuth,
  requireRole('director', 'coordinador', 'coordinador_seccional'),
  validatePositiveIntParam('id', 'suplencia docente'),
  async (req: Request, res: Response) => {
    try {
      const id = res.locals.validatedParams.id as number;
      const existing = await db.getSuplenciaById(id);
      if (!existing) {
        return res.status(404).json({ error: 'Suplencia docente no encontrada.' });
      }
      if (isCoordinadorSeccional(req.user)) {
        for (const anoId of getSuplenciaCoveredAnoIds(existing)) {
          if (!(await assertCoordinadorSeccionalAno(req, res, anoId, 'suplencias_docentes'))) {
            return;
          }
        }
      }
      const updated = await db.toggleSuplenciaDocente(id);
      await db.logAuditEvent({
        ...getAuditAuthorFromReq(req),
        accion: 'SUPLENCIA_DOCENTE_ESTADO_ALTERNADO',
        entidad: 'suplencias_docentes',
        idEntidad: id,
        detalles: {
          idSuplencia: id,
          alcanceCompleto: Boolean(updated.alcanceCompleto),
          idAno: updated.idAno ?? null,
          idMateria: updated.idMateria ?? null,
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
  '/suplencias/:id',
  requireAuth,
  requireRole('director', 'coordinador', 'coordinador_seccional'),
  validatePositiveIntParam('id', 'suplencia docente'),
  async (req: Request, res: Response) => {
    try {
      const id = res.locals.validatedParams.id as number;
      const existing = await db.getSuplenciaById(id);
      if (!existing) {
        return res.status(404).json({ error: 'Suplencia docente no encontrada.' });
      }
      if (isCoordinadorSeccional(req.user)) {
        for (const anoId of getSuplenciaCoveredAnoIds(existing)) {
          if (!(await assertCoordinadorSeccionalAno(req, res, anoId, 'suplencias_docentes'))) {
            return;
          }
        }
      }
      await db.deleteSuplenciaDocente(id);
      await db.logAuditEvent({
        ...getAuditAuthorFromReq(req),
        accion: 'SUPLENCIA_DOCENTE_ELIMINADA',
        entidad: 'suplencias_docentes',
        idEntidad: id,
        detalles: {
          alcanceCompleto: Boolean(existing.alcanceCompleto),
          idAno: existing.idAno ?? null,
          idMateria: existing.idMateria ?? null,
        },
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
    if (req.user?.rol === 'docente' || req.user?.rol === 'docente_suplente') {
      return res.json([]);
    }
    res.json(await db.getRepresentantes(getAllowedAnosScope(req)));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

apiRouter.post(
  '/representantes',
  requireAuth,
  requireRole('director', 'coordinador', 'coordinador_seccional'),
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
  validatePositiveIntParam('id', 'representante'),
  validateBody(updateRepresentanteSchema),
  async (req: Request, res: Response) => {
    try {
      const id = res.locals.validatedParams.id as number;
      const isSelfRep = req.authType === 'representante';

      if (isSelfRep) {
        if (!req.representante || req.representante.idRepresentante !== id) {
          return res.status(403).json({
            error: 'Acceso denegado: Solo puede modificar los datos de su propia cuenta.',
          });
        }
      } else if (
        !req.user ||
        !['director', 'coordinador', 'coordinador_seccional'].includes(req.user.rol)
      ) {
        return res.status(403).json({
          error: 'Acceso denegado: Solo Director o Coordinador pueden modificar representantes.',
        });
      } else if (isCoordinadorSeccional(req.user)) {
        const allowedAnos = getCoordinadorSeccionalAnos(req.user);
        const repStudents = await db.getEstudiantes({ idRepresentante: id }, false);
        if (
          repStudents.length > 0 &&
          !repStudents.some((e) => e.idAnoActual != null && allowedAnos.includes(e.idAnoActual))
        ) {
          return res.status(403).json({
            error:
              'Acceso denegado: Este representante no tiene estudiantes vinculados dentro de sus años asignados.',
            code: 'FORBIDDEN_YEAR_SCOPE',
          });
        }
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
  requireRole('director', 'coordinador', 'coordinador_seccional'),
  validatePositiveIntParam('id', 'representante'),
  validateBody(updateRepresentanteCredencialesSchema),
  async (req: Request, res: Response) => {
    try {
      const id = res.locals.validatedParams.id as number;
      if (isCoordinadorSeccional(req.user)) {
        const allowedAnos = getCoordinadorSeccionalAnos(req.user);
        const repStudents = await db.getEstudiantes({ idRepresentante: id }, false);
        if (
          repStudents.length > 0 &&
          !repStudents.some((e) => e.idAnoActual != null && allowedAnos.includes(e.idAnoActual))
        ) {
          return res.status(403).json({
            error:
              'Acceso denegado: Este representante no tiene estudiantes vinculados dentro de sus años asignados.',
            code: 'FORBIDDEN_YEAR_SCOPE',
          });
        }
      }
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
  validatePositiveIntParam('id', 'representante'),
  async (req: Request, res: Response) => {
    try {
      const id = res.locals.validatedParams.id as number;
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

apiRouter.get(
  '/estudiantes',
  requireAuth,
  validateQuery(estudiantesQuerySchema),
  async (req: Request, res: Response) => {
    try {
      const { idAno, idSeccion, idRepresentante: queryIdRep } = res.locals.validatedQuery as {
        idAno?: number;
        idSeccion?: number;
        idRepresentante?: number;
      };

      if (idAno && !(await assertCoordinadorSeccionalAno(req, res, idAno, 'estudiantes'))) {
        return;
      }

      const isRep = req.authType === 'representante' && Boolean(req.representante);
      const isDocenteTitular = req.authType === 'staff' && req.user?.rol === 'docente';
      const isDocenteSuplente = req.authType === 'staff' && req.user?.rol === 'docente_suplente';
      const isTeacherMasked = isDocenteTitular || isDocenteSuplente;

      const idRepresentante = isRep
        ? req.representante!.idRepresentante
        : isTeacherMasked
        ? undefined
        : queryIdRep;

      const idDocenteScope = isDocenteTitular ? req.user!.id : undefined;
      const idSuplenteScope = isDocenteSuplente ? req.user!.id : undefined;
      const canReadReps = req.authType === 'staff' && !isTeacherMasked;

      res.json(
        await db.getEstudiantes(
          {
            idAno,
            idSeccion,
            idRepresentante,
            idDocenteScope,
            idSuplenteScope,
            allowedAnos: getAllowedAnosScope(req),
          },
          canReadReps
        )
      );
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }
);

apiRouter.post(
  '/estudiantes',
  requireAuth,
  requireRole('director', 'coordinador', 'coordinador_seccional'),
  validateBody(createEstudianteSchema),
  async (req: Request, res: Response) => {
    try {
      if (!(await assertCoordinadorSeccionalAno(req, res, req.body.idAnoActual, 'estudiantes'))) {
        return;
      }
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
  requireRole('director', 'coordinador', 'coordinador_seccional'),
  validatePositiveIntParam('id', 'estudiante'),
  validateBody(updateEstudianteSchema),
  async (req: Request, res: Response) => {
    try {
      const id = res.locals.validatedParams.id as number;
      if (isCoordinadorSeccional(req.user)) {
        const existing = await db.getEstudianteById(id);
        if (!existing) {
          return res.status(404).json({ error: 'Estudiante no encontrado.' });
        }
        if (!(await assertCoordinadorSeccionalAno(req, res, existing.idAnoActual, 'estudiantes'))) {
          return;
        }
        if (
          req.body.idAnoActual !== undefined &&
          req.body.idAnoActual !== null &&
          !(await assertCoordinadorSeccionalAno(req, res, req.body.idAnoActual, 'estudiantes'))
        ) {
          return;
        }
      }
      const updated = await db.updateEstudiante(id, req.body);
      await db.logAuditEvent({
        ...getAuditAuthorFromReq(req),
        accion: 'ESTUDIANTE_ACTUALIZADO',
        entidad: 'estudiantes',
        idEntidad: id,
        detalles: { idAnoActual: updated.idAnoActual, idSeccion: updated.idSeccion },
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
  requireRole('director', 'coordinador', 'coordinador_seccional'),
  validatePositiveIntParam('id', 'estudiante'),
  async (req: Request, res: Response) => {
    try {
      const id = res.locals.validatedParams.id as number;
      if (isCoordinadorSeccional(req.user)) {
        const existing = await db.getEstudianteById(id);
        if (!existing) {
          return res.status(404).json({ error: 'Estudiante no encontrado.' });
        }
        if (!(await assertCoordinadorSeccionalAno(req, res, existing.idAnoActual, 'estudiantes'))) {
          return;
        }
      }
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

apiRouter.get(
  '/estudiantes/promover/estado',
  requireAuth,
  requireRole('director', 'coordinador'),
  async (_req: Request, res: Response) => {
    try {
      res.json(await db.getEstadoPromocionesCiclo());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
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
          cicloLectivo: result.cicloLectivo,
          fechaPromocion: new Date().toISOString(),
          anioOrigenId: req.body.anioOrigenId,
          anioOrigenNombre: result.anioOrigenNombre,
          seccionOrigenId: req.body.seccionOrigenId,
          seccionOrigenNombre: result.seccionOrigenNombre,
          anioDestinoId: req.body.anioDestinoId,
          seccionDestinoId: req.body.seccionDestinoId ?? null,
          promovidosCount: result.promovidosCount,
          estadoDestino: result.estadoDestino,
          destinoLabel: result.destinoLabel,
          confirmarDoble: Boolean(req.body.confirmarDoble),
          advertenciasAplicadas: result.advertenciasAplicadas || [],
          estudiantesIds: result.estudiantesPromovidos,
        },
      });
      res.json(result);
    } catch (e: any) {
      if (e?.code === 'PROMOTION_DOUBLE_CONFIRM_REQUIRED' || e?.statusCode === 409) {
        res.status(409).json({
          error: e.message,
          code: e.code || 'PROMOTION_DOUBLE_CONFIRM_REQUIRED',
          warnings: Array.isArray(e.warnings) ? e.warnings : [e.message],
        });
        return;
      }
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
  validatePositiveIntParam('id', 'día no laborable'),
  async (req: Request, res: Response) => {
    try {
      const id = res.locals.validatedParams.id as number;
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
apiRouter.get(
  '/asistencia',
  requireAuth,
  validateQuery(asistenciaQuerySchema),
  async (req: Request, res: Response) => {
    try {
      const q = res.locals.validatedQuery as {
        fecha?: string;
        mes?: string;
        startDate?: string;
        endDate?: string;
        estado?: EstadoAsistencia;
        idMateria?: number;
        idMaterias?: string;
        idEstudiante?: number;
        idRepresentante?: number;
        idSeccion?: number;
        idAno?: number;
        lapsoId?: number;
        lapso_id?: number;
      };

      if (q.idAno && !(await assertCoordinadorSeccionalAno(req, res, q.idAno, 'asistencia'))) {
        return;
      }

      let requestedIdMaterias = q.idMaterias
        ? q.idMaterias
            .split(',')
            .map((v) => Number(v))
            .filter((n) => Number.isInteger(n) && n > 0)
        : undefined;

      // Restringir automáticamente consultas de docentes a sus materias asignadas (ligero y seguro)
      if (req.authType === 'staff' && req.user?.rol === 'docente') {
        const assigned = await db.getDocenteMaterias(req.user.id);
        const assignedSet = new Set(assigned.map((a) => a.idMateria));
        if (q.idMateria && !assignedSet.has(q.idMateria)) {
          return res.json([]);
        }
        if (requestedIdMaterias) {
          requestedIdMaterias = requestedIdMaterias.filter((id) => assignedSet.has(id));
        } else if (!q.idMateria) {
          requestedIdMaterias = Array.from(assignedSet);
        }
      }

      let suplenciaRestrictions:
        | Array<{ idMateria: number; idAno: number; idSeccion?: number | null }>
        | undefined;
      if (req.authType === 'staff' && req.user?.rol === 'docente_suplente') {
        const activeSups = await db.getActiveSuplenciasForUser(req.user.id, q.fecha);
        if (activeSups.length === 0) {
          return res.json([]);
        }
        const restrictions: Array<{ idMateria: number; idAno: number; idSeccion?: number | null }> = [];
        const supMateriaSet = new Set<number>();

        for (const s of activeSups) {
          if (s.materiasTitularResumen && s.materiasTitularResumen.length > 0) {
            for (const m of s.materiasTitularResumen) {
              supMateriaSet.add(m.idMateria);
              restrictions.push({
                idMateria: m.idMateria,
                idAno: m.idAno,
                idSeccion: s.idSeccion ?? null,
              });
            }
          } else if (s.idMateria != null && s.idAno != null) {
            supMateriaSet.add(s.idMateria);
            restrictions.push({
              idMateria: s.idMateria,
              idAno: s.idAno,
              idSeccion: s.idSeccion ?? null,
            });
          }
        }

        if (restrictions.length === 0) {
          return res.json([]);
        }
        if (q.idMateria && !supMateriaSet.has(q.idMateria)) {
          return res.json([]);
        }
        if (requestedIdMaterias) {
          requestedIdMaterias = requestedIdMaterias.filter((id) => supMateriaSet.has(id));
        }
        suplenciaRestrictions = restrictions;
      }

      const isTeacherMasked =
        req.user?.rol === 'docente' || req.user?.rol === 'docente_suplente';

      const filters = {
        fecha: q.fecha,
        mes: q.mes,
        startDate: q.startDate,
        endDate: q.endDate,
        estado: q.estado,
        idMateria: q.idMateria,
        idMaterias: requestedIdMaterias,
        idEstudiante: q.idEstudiante,
        idRepresentante:
          req.authType === 'representante' && req.representante
            ? req.representante.idRepresentante
            : isTeacherMasked
            ? undefined
            : q.idRepresentante,
        idSeccion: q.idSeccion,
        idAno: q.idAno,
        lapsoId: q.lapsoId || q.lapso_id,
        allowedAnos: getAllowedAnosScope(req),
        suplenciaRestrictions,
      };
      res.json(await db.getAsistencia(filters));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }
);

const handleGetAttendanceHistoryPaginated = async (req: Request, res: Response) => {
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
    if (query.idAno && !(await assertCoordinadorSeccionalAno(req, res, query.idAno, 'asistencia'))) {
      return;
    }
    res.json(
      await db.getAsistenciaPaginated({
        ...query,
        allowedAnos: getAllowedAnosScope(req),
      })
    );
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

apiRouter.get(
  '/asistencia/general',
  requireAuth,
  requireRole('director', 'coordinador', 'coordinador_seccional'),
  validateQuery(attendanceHistoryQuerySchema),
  handleGetAttendanceHistoryPaginated
);

apiRouter.get(
  '/attendance/history',
  requireAuth,
  requireRole('director', 'coordinador', 'coordinador_seccional'),
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

    const studentIds = Array.isArray(records)
      ? records
          .map((r: any) => Number(r.idEstudiante))
          .filter((id: number) => Number.isInteger(id) && id > 0)
      : undefined;

    const ownership = await validateDocenteOwnership(req, Number(idMateria), {
      fecha,
      studentIds,
    });
    if (!ownership.allowed) {
      return res.status(403).json({ error: ownership.reason });
    }

    // Restricción RBAC: Solo Coordinación o Dirección pueden justificar inasistencias o registrar reposos médicos
    if (req.user?.rol === 'docente' || req.user?.rol === 'docente_suplente') {
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
    const author = getAuditAuthorFromReq(req);

    // Persistencia consolidada en una única transacción atómica: asistencia + auditLogs + notificacionesRepresentante
    const batchResult = await db.registrarAsistenciaBatch(Number(idMateria), fecha, records, {
      actorId: req.user?.id,
      actorNombre,
      actorRol: req.user?.rol,
      suplenciaInfo: ownership.suplenciaInfo ?? null,
      auditAuthor: author,
      buildNotification: buildAttendanceNotificationDetails,
    });

    // Lectura ligera en memoria para despacho Web Push desacoplado (solo registros modificados/creados)
    const pushPayload = await db.getPushDispatchPayloadForBatch(
      Number(idMateria),
      batchResult.changedRecords
    );

    enqueueDetachedPushJob(`asistencia_batch_${idMateria}`, async () => {
      if (pushPayload.subscriptions.length > 0 && pushPayload.records.length > 0) {
        await dispatchAttendancePushNotificationsDirect({
          idMateria: pushPayload.idMateria,
          nombreMateria: pushPayload.nombreMateria,
          fecha,
          records: pushPayload.records,
          subscriptions: pushPayload.subscriptions,
          author,
          context: 'asistencia_batch',
        });
      }
    });

    res.json({
      success: true,
      count: batchResult.updatedCount,
      updatedCount: batchResult.updatedCount,
      skippedCount: batchResult.skippedCount,
      skippedStudents: batchResult.skippedStudents,
    });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
};

apiRouter.post(
  '/asistencia/batch',
  requireAuth,
  requireRole('director', 'coordinador', 'coordinador_seccional', 'docente', 'docente_suplente'),
  validateBody(asistenciaBatchSchema),
  handleRegistrarAsistenciaBatch
);

apiRouter.post(
  '/attendance/batch',
  requireAuth,
  requireRole('director', 'coordinador', 'coordinador_seccional', 'docente', 'docente_suplente'),
  validateBody(asistenciaBatchSchema),
  handleRegistrarAsistenciaBatch
);

const handleUpdateAsistenciaJustificacion = async (req: Request, res: Response) => {
  try {
    const idAsistencia = res.locals.validatedParams.id as number;

    if (!req.user) {
      return res.status(401).json({ error: 'No autenticado.' });
    }

    if (isCoordinadorSeccional(req.user)) {
      const existing = await db.getAsistenciaById(idAsistencia);
      if (!existing) {
        return res.status(404).json({ error: 'Registro de asistencia no encontrado.' });
      }
      if (!(await assertCoordinadorSeccionalAno(req, res, existing.idAno, 'asistencia'))) {
        return;
      }
    }

    const { estado, motivoJustificacion, numeroJustificante, fechaRecepcionDocumento } = req.body;
    const actorNombre = `${req.user.nombre} ${req.user.apellidos || ''}`.trim();
    const author = getAuditAuthorFromReq(req);

    // Persistencia consolidada en una única transacción atómica: actualización + auditoría + bandeja representante
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
      },
      {
        auditAuthor: author,
        buildNotification: buildAttendanceNotificationDetails,
      }
    );

    if (!updated) {
      return res.status(404).json({ error: 'Registro de asistencia no encontrado.' });
    }

    // Lectura ligera en memoria para despacho Web Push desacoplado
    const pushPayload = await db.getPushDispatchPayloadForBatch(updated.registro.idMateria, [
      updated.registro,
    ]);

    enqueueDetachedPushJob(`asistencia_justificacion_${idAsistencia}`, async () => {
      if (pushPayload.subscriptions.length > 0 && pushPayload.records.length > 0) {
        await dispatchAttendancePushNotificationsDirect({
          idMateria: pushPayload.idMateria,
          nombreMateria: pushPayload.nombreMateria,
          fecha: updated.registro.fecha,
          records: pushPayload.records,
          subscriptions: pushPayload.subscriptions,
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
  requireRole('coordinador', 'coordinador_seccional', 'director'),
  validatePositiveIntParam('id', 'registro de asistencia'),
  validateBody(updateAsistenciaJustificacionSchema),
  handleUpdateAsistenciaJustificacion
);

apiRouter.patch(
  '/attendance/:id',
  requireAuth,
  requireRole('coordinador', 'coordinador_seccional', 'director'),
  validatePositiveIntParam('id', 'registro de asistencia'),
  validateBody(updateAsistenciaJustificacionSchema),
  handleUpdateAsistenciaJustificacion
);

apiRouter.get(
  '/portal/representante/:id',
  requireAuth,
  validatePositiveIntParam('id', 'representante'),
  async (req: Request, res: Response) => {
    try {
      const idRep = res.locals.validatedParams.id as number;
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
  }
);

apiRouter.get(
  '/portal/representante/:id/notificaciones',
  requireAuth,
  validatePositiveIntParam('id', 'representante'),
  validateQuery(notificacionesQuerySchema),
  async (req: Request, res: Response) => {
    try {
      const idRep = res.locals.validatedParams.id as number;
      if (req.authType === 'representante') {
        if (!req.representante || req.representante.idRepresentante !== idRep) {
          return res.status(403).json({ error: 'Acceso denegado a notificaciones de otro representante.' });
        }
      } else if (!req.user || !['director', 'coordinador'].includes(req.user.rol)) {
        return res.status(403).json({ error: 'Acceso denegado.' });
      }
      const { unread, limit } = res.locals.validatedQuery as {
        unread: boolean;
        limit: number;
      };
      res.json(await db.getNotificacionesRepresentante(idRep, { onlyUnread: unread, limit }));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }
);

apiRouter.patch(
  '/portal/representante/:id/notificaciones/leer-todas',
  requireAuth,
  validatePositiveIntParam('id', 'representante'),
  async (req: Request, res: Response) => {
    try {
      const idRep = res.locals.validatedParams.id as number;
      if (
        req.authType !== 'representante' ||
        !req.representante ||
        req.representante.idRepresentante !== idRep
      ) {
        return res.status(403).json({
          error: 'Solo el representante titular puede marcar sus notificaciones como leídas.',
        });
      }
      const result = await db.markTodasNotificacionesLeidas(idRep);
      res.json({ success: true, ...result });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }
);

apiRouter.patch(
  '/portal/representante/:id/notificaciones/:idNotif/leer',
  requireAuth,
  validatePositiveIntParam('id', 'representante'),
  validatePositiveIntParam('idNotif', 'notificación'),
  async (req: Request, res: Response) => {
    try {
      const idRep = res.locals.validatedParams.id as number;
      const idNotif = res.locals.validatedParams.idNotif as number;
      if (
        req.authType !== 'representante' ||
        !req.representante ||
        req.representante.idRepresentante !== idRep
      ) {
        return res.status(403).json({
          error: 'Solo el representante titular puede marcar su notificación como leída.',
        });
      }
      const updated = await db.markNotificacionLeida(idRep, idNotif);
      if (!updated) {
        return res.status(404).json({ error: 'Notificación no encontrada.' });
      }
      res.json({ success: true, notificacion: updated });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }
);

// ---------------------------------------------------------------------------
// 6. HORARIOS ESCOLARES & ANTICONFLICTOS
// ---------------------------------------------------------------------------
apiRouter.get(
  '/horarios',
  requireAuth,
  validateQuery(horariosQuerySchema),
  async (req: Request, res: Response) => {
    try {
      const filters = res.locals.validatedQuery as {
        idAno?: number;
        idSeccion?: number;
        diaSemana?: string;
        idMateria?: number;
        idDocente?: number;
      };
      if (filters.idAno && !(await assertCoordinadorSeccionalAno(req, res, filters.idAno, 'horarios'))) {
        return;
      }
      const isDocenteSuplente = req.authType === 'staff' && req.user?.rol === 'docente_suplente';
      res.json(
        await db.getHorarios({
          ...filters,
          allowedAnos: getAllowedAnosScope(req),
          idSuplenteScope: isDocenteSuplente ? req.user!.id : undefined,
        })
      );
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }
);

apiRouter.post(
  '/horarios/validate-conflict',
  requireAuth,
  requireRole('director', 'coordinador', 'coordinador_seccional'),
  validateBody(validateHorarioConflictSchema),
  async (req: Request, res: Response) => {
    try {
      if (!(await assertCoordinadorSeccionalAno(req, res, req.body.idAno, 'horarios'))) {
        return;
      }
      res.json(await db.detectHorarioConflict(req.body));
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

apiRouter.post(
  '/horarios/suggest-slots',
  requireAuth,
  requireRole('director', 'coordinador', 'coordinador_seccional'),
  validateBody(suggestSlotsSchema),
  async (req: Request, res: Response) => {
    try {
      if (!(await assertCoordinadorSeccionalAno(req, res, req.body.idAno, 'horarios'))) {
        return;
      }
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
  requireRole('director', 'coordinador', 'coordinador_seccional'),
  validateBody(createHorarioSchema),
  async (req: Request, res: Response) => {
    try {
      if (!(await assertCoordinadorSeccionalAno(req, res, req.body.idAno, 'horarios'))) {
        return;
      }
      if (isCoordinadorSeccional(req.user)) {
        const mat = await db.getMateriaById(req.body.idMateria);
        if (!mat || !(await assertCoordinadorSeccionalAno(req, res, mat.idAno, 'horarios'))) {
          return;
        }
      }
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
  requireRole('director', 'coordinador', 'coordinador_seccional'),
  validatePositiveIntParam('id', 'horario'),
  validateBody(updateHorarioSchema),
  async (req: Request, res: Response) => {
    try {
      const id = res.locals.validatedParams.id as number;
      if (isCoordinadorSeccional(req.user)) {
        const existing = await db.getHorarioById(id);
        if (!existing) {
          return res.status(404).json({ error: 'Bloque horario no encontrado.' });
        }
        if (!(await assertCoordinadorSeccionalAno(req, res, existing.idAno, 'horarios'))) {
          return;
        }
        if (
          req.body.idAno !== undefined &&
          !(await assertCoordinadorSeccionalAno(req, res, req.body.idAno, 'horarios'))
        ) {
          return;
        }
        if (req.body.idMateria !== undefined) {
          const mat = await db.getMateriaById(req.body.idMateria);
          if (!mat || !(await assertCoordinadorSeccionalAno(req, res, mat.idAno, 'horarios'))) {
            return;
          }
        }
      }
      const updated = await db.updateHorario(id, req.body);
      await db.logAuditEvent({
        ...getAuditAuthorFromReq(req),
        accion: 'HORARIO_BLOQUE_ACTUALIZADO',
        entidad: 'horarios',
        idEntidad: id,
        detalles: { ...req.body, idAno: updated.idAno },
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
  requireRole('director', 'coordinador', 'coordinador_seccional'),
  validatePositiveIntParam('id', 'horario'),
  async (req: Request, res: Response) => {
    try {
      const id = res.locals.validatedParams.id as number;
      let existingAno: number | undefined;
      if (isCoordinadorSeccional(req.user)) {
        const existing = await db.getHorarioById(id);
        if (!existing) {
          return res.status(404).json({ error: 'Bloque horario no encontrado.' });
        }
        if (!(await assertCoordinadorSeccionalAno(req, res, existing.idAno, 'horarios'))) {
          return;
        }
        existingAno = existing.idAno;
      }
      await db.deleteHorario(id);
      await db.logAuditEvent({
        ...getAuditAuthorFromReq(req),
        accion: 'HORARIO_BLOQUE_ELIMINADO',
        entidad: 'horarios',
        idEntidad: id,
        ...(existingAno !== undefined ? { detalles: { idAno: existingAno } } : {}),
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
const handleGetAuditLogsPaginated = async (req: Request, res: Response) => {
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
    res.json(
      await db.getAuditLogsPaginated({
        ...query,
        allowedAnos: getAllowedAnosScope(req),
        actorIdScope: isCoordinadorSeccional(req.user) ? req.user?.id : undefined,
      })
    );
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

apiRouter.get(
  '/auditoria',
  requireAuth,
  requireRole('director', 'coordinador', 'coordinador_seccional'),
  validateQuery(auditLogsQuerySchema),
  handleGetAuditLogsPaginated
);

apiRouter.get(
  '/audit-logs',
  requireAuth,
  requireRole('director', 'coordinador', 'coordinador_seccional'),
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
    const author = getAuditAuthorFromReq(req);
    const fullName = req.user ? `${req.user.nombre} ${req.user.apellidos}`.trim() : undefined;
    try {
      const backup = await db.createFullDatabaseBackup(
        req.user
          ? {
              id: req.user.id,
              email: req.user.email,
              nombre: fullName,
              rol: req.user.rol,
              ipOrigen: author.ipOrigen,
              userAgent: author.userAgent,
            }
          : undefined
      );
      res.json(backup);
    } catch (e: any) {
      await db.recordBackupLogOutcome({
        usuarioId: req.user?.id ?? null,
        usuarioNombre: fullName ?? null,
        usuarioEmail: req.user?.email ?? null,
        rol: req.user?.rol ?? 'director',
        ipOrigen: author.ipOrigen,
        userAgent: author.userAgent,
        tipo: 'completo',
        origen: 'manual',
        estado: 'fallido',
        tamanoBytes: 0,
        totalRegistros: 0,
        detalleError: e?.message || 'Error al generar copia de seguridad completa.',
      });
      res.status(500).json({ error: e.message });
    }
  }
);

apiRouter.get(
  '/backup/logs',
  requireAuth,
  requireRole('director'),
  validateQuery(backupLogsQuerySchema),
  async (_req: Request, res: Response) => {
    try {
      const query = res.locals.validatedQuery as {
        page: number;
        limit: number;
        tipo?: 'completo' | 'cierre_anio';
        origen?: 'manual' | 'previo_cierre';
        estado?: 'exitoso' | 'fallido';
        search?: string;
      };
      res.json(await db.getBackupLogsPaginated(query));
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Error al consultar historial de respaldos.' });
    }
  }
);

apiRouter.get(
  '/backup/logs/:id/download',
  requireAuth,
  requireRole('director'),
  async (req: Request, res: Response) => {
    try {
      const parsedId = backupLogIdParamSchema.safeParse(req.params.id);
      if (!parsedId.success) {
        res.status(400).json({
          error: parsedId.error.issues[0]?.message || 'ID de registro de respaldo inválido.',
        });
        return;
      }

      const { filename, content, log } = await db.readBackupFileByLogId(parsedId.data);
      await db.logAuditEvent({
        ...getAuditAuthorFromReq(req),
        accion: 'BACKUP_HISTORIAL_DESCARGADO',
        entidad: 'backup_logs',
        idEntidad: String(log.id),
        detalles: { filename, tipo: log.tipo, origen: log.origen },
      });

      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(content);
    } catch (e: any) {
      const status = e?.statusCode === 404 ? 404 : 400;
      res.status(status).json({ error: e.message || 'No se pudo descargar el respaldo solicitado.' });
    }
  }
);

apiRouter.post(
  '/backup/restore',
  requireAuth,
  requireRole('director'),
  validateBody(restoreBackupSchema),
  async (req: Request, res: Response) => {
    try {
      const author = getAuditAuthorFromReq(req);
      const result = await db.restoreFullDatabaseBackup(req.body, {
        id: req.user?.id,
        email: req.user?.email,
        rol: req.user?.rol,
        ipOrigen: author.ipOrigen,
        userAgent: author.userAgent,
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
  validateBody(resetDatabaseSchema),
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
// 7.1 MANTENIMIENTO, CIERRE DE AÑO LECTIVO & POLÍTICAS DE RETENCIÓN (DIRECTOR)
// ---------------------------------------------------------------------------
apiRouter.get(
  '/mantenimiento/resumenes-asistencia',
  requireAuth,
  requireRole('director', 'coordinador'),
  validateQuery(resumenesAsistenciaQuerySchema),
  async (_req: Request, res: Response) => {
    try {
      const query = res.locals.validatedQuery as {
        anioLectivo?: string;
        estudianteId?: number;
      };
      res.json(await db.getResumenesAsistencia(query));
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Error al consultar resúmenes consolidados.' });
    }
  }
);

apiRouter.get(
  '/mantenimiento/cierre-anio-escolar/respaldos',
  requireAuth,
  requireRole('director'),
  async (_req: Request, res: Response) => {
    try {
      res.json(await db.listCierreBackups());
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Error al listar respaldos de cierre.' });
    }
  }
);

apiRouter.get(
  '/mantenimiento/cierre-anio-escolar/respaldos/:filename',
  requireAuth,
  requireRole('director'),
  async (req: Request, res: Response) => {
    try {
      const parsed = cierreBackupFilenameSchema.safeParse(req.params.filename);
      if (!parsed.success) {
        res.status(400).json({
          error: parsed.error.issues[0]?.message || 'Nombre de archivo de respaldo inválido.',
        });
        return;
      }
      const snapshot = await db.readCierreBackupFile(parsed.data);
      await db.logAuditEvent({
        ...getAuditAuthorFromReq(req),
        accion: 'BACKUP_CIERRE_DESCARGADO',
        entidad: 'resumenes_asistencia',
        idEntidad: parsed.data,
        detalles: { filename: parsed.data },
      });
      res.setHeader('Content-Disposition', `attachment; filename="${parsed.data}"`);
      res.json(snapshot);
    } catch (e: any) {
      const status = e?.statusCode === 404 ? 404 : 400;
      res.status(status).json({ error: e.message || 'No se pudo descargar el respaldo.' });
    }
  }
);

apiRouter.post(
  '/mantenimiento/cierre-anio-escolar',
  requireAuth,
  requireRole('director'),
  validateBody(cierreAnioEscolarSchema),
  async (req: Request, res: Response) => {
    try {
      const author = getAuditAuthorFromReq(req);
      const authorInfo = req.user
        ? {
            id: req.user.id,
            email: req.user.email,
            nombre: `${req.user.nombre} ${req.user.apellidos}`.trim(),
            rol: req.user.rol,
            ipOrigen: author.ipOrigen,
            userAgent: author.userAgent,
          }
        : undefined;
      const result = await db.ejecutarCierreAnioEscolar(req.body, authorInfo);
      res.json(result);
    } catch (e: any) {
      res.status(400).json({
        error: e.message || 'Error al procesar el cierre de año escolar y compactación.',
      });
    }
  }
);

apiRouter.post(
  '/mantenimiento/limpiar-antiguos',
  requireAuth,
  requireRole('director'),
  validateBody(limpiarAntiguosSchema),
  async (req: Request, res: Response) => {
    try {
      const result = await db.limpiarDatosAntiguos(req.body, getAuditAuthorFromReq(req));
      res.json(result);
    } catch (e: any) {
      res.status(400).json({
        error: e.message || 'Error al ejecutar la limpieza de registros antiguos.',
      });
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
  '/push/rotate',
  pushRotateRateLimiter,
  validateBody(pushRotateSchema),
  async (req: Request, res: Response) => {
    try {
      // Si hay cookie/token vigente, restringir rotación al representante autenticado
      let expectedRepId: number | undefined;
      const token = extractToken(req);
      if (token) {
        const decoded = verifyToken(token);
        if (decoded?.type === 'representante') {
          expectedRepId = decoded.userId;
        }
      }

      const { oldEndpoint, oldKeys, newSubscription } = req.body;
      const result = await db.rotatePushSubscriptionByPreviousKeys({
        oldEndpoint,
        oldP256dh: oldKeys.p256dh,
        oldAuth: oldKeys.auth,
        newEndpoint: newSubscription.endpoint,
        newP256dh: newSubscription.keys.p256dh,
        newAuth: newSubscription.keys.auth,
        userAgent: req.headers['user-agent'] || null,
        expectedRepId,
      });

      if (!result.rotated) {
        return res.status(401).json({
          error: 'No se pudo validar la suscripción previa para rotación silenciosa.',
          code: 'ROTATION_UNAUTHORIZED',
        });
      }

      await db.logAuditEvent({
        idUsuario: result.idRepresentante ?? null,
        rol: 'representante',
        accion: 'PUSH_SUSCRIPCION_ROTADA',
        entidad: 'push_subscriptions',
        idEntidad: result.idSubscription,
        ipOrigen: req.ip || req.socket.remoteAddress || null,
        userAgent: req.headers['user-agent'] || null,
      });

      return res.json({ success: true, idSubscription: result.idSubscription });
    } catch (e: any) {
      return res.status(400).json({ error: e.message || 'Error rotando suscripción push.' });
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
  loadTestRateLimiter,
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
      const status = String(e?.message || '').includes('en ejecución') ? 409 : 500;
      res.status(status).json({ error: e.message || 'Error ejecutando prueba de carga simulada.' });
    }
  }
);

apiRouter.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Endpoint de API no encontrado.' });
});
