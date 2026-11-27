import 'dotenv/config';
import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import {
  getUserById,
  getUserByEmailOrCedula,
  getRepresentanteById,
  getRepresentantes,
  isDocenteAssignedToMateria,
  getActiveSuplenciasForUser,
  getMateriaById,
  getEstudiantes,
  logAuditEvent,
} from './localDb.ts';
import type { RolUsuario, Usuario, Representante, AuthTokenPayload } from '../types.ts';

// -------------------------------------------------------------
// BLINDAJE DE SECRETOS CRIPTOGRÁFICOS Y TOLERANCIA A ENTORNO
// -------------------------------------------------------------
const rawJwtSecret = process.env.JWT_SECRET?.trim();
const isProdEnv = process.env.NODE_ENV === 'production';

if (!rawJwtSecret || rawJwtSecret.length < 32) {
  const levelMsg = isProdEnv
    ? '[SECURITY WARNING]: JWT_SECRET no está definida o tiene menos de 32 caracteres en producción. Se generó una clave aleatoria en memoria; defina JWT_SECRET en las variables de entorno para persistir sesiones entre reinicios.'
    : '[SECURITY NOTICE]: JWT_SECRET no está definida en el entorno o tiene menos de 32 caracteres. Usando clave aleatoria efímera en memoria para desarrollo.';
  console.warn(levelMsg);
}

export const JWT_SECRET =
  rawJwtSecret && rawJwtSecret.length >= 32
    ? rawJwtSecret
    : crypto.randomBytes(32).toString('hex');

export const AUTH_COOKIE_NAME = 'eduasist_token';
const LEGACY_AUTH_COOKIE_NAME = 'educontrol_token';

declare global {
  namespace Express {
    interface Request {
      user?: Usuario;
      representante?: Representante;
      authType?: 'staff' | 'representante';
      authToken?: string;
    }
  }
}

export function generateToken(payload: AuthTokenPayload): string {
  return jwt.sign(
    {
      userId: payload.userId,
      emailOrCedula: payload.emailOrCedula,
      rol: payload.rol,
      type: payload.type,
    },
    JWT_SECRET,
    { expiresIn: '8h' }
  );
}

export function verifyToken(token: string): AuthTokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
  } catch {
    return null;
  }
}

export function setAuthCookie(res: Response, token: string): void {
  const req = (res as any).req as Request | undefined;
  const isHttps = req ? req.secure || req.headers['x-forwarded-proto'] === 'https' : true;

  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isHttps,
    sameSite: isHttps ? 'none' : 'lax',
    path: '/',
    maxAge: 8 * 60 * 60 * 1000, // 8 Horas
  });
}

export function clearAuthCookie(res: Response): void {
  const req = (res as any).req as Request | undefined;
  const isHttps = req ? req.secure || req.headers['x-forwarded-proto'] === 'https' : true;

  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    secure: isHttps,
    sameSite: isHttps ? 'none' : 'lax',
    path: '/',
  });
  res.clearCookie(LEGACY_AUTH_COOKIE_NAME, {
    httpOnly: true,
    secure: isHttps,
    sameSite: isHttps ? 'none' : 'lax',
    path: '/',
  });
  res.cookie(AUTH_COOKIE_NAME, '', {
    httpOnly: true,
    secure: isHttps,
    sameSite: isHttps ? 'none' : 'lax',
    path: '/',
    expires: new Date(0),
    maxAge: 0,
  });
}

export function extractToken(req: Request): string | null {
  if (req.cookies && req.cookies[AUTH_COOKIE_NAME]) {
    return req.cookies[AUTH_COOKIE_NAME];
  }
  if (req.cookies && req.cookies[LEGACY_AUTH_COOKIE_NAME]) {
    return req.cookies[LEGACY_AUTH_COOKIE_NAME];
  }

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }

  return null;
}

const explicitAllowedOrigins = new Set<string>(
  [
    process.env.APP_URL,
    ...(process.env.CORS_ALLOWED_ORIGINS ? process.env.CORS_ALLOWED_ORIGINS.split(',') : []),
  ]
    .map((entry) => {
      if (!entry) return '';
      try {
        return new URL(entry.trim()).origin.toLowerCase();
      } catch {
        return '';
      }
    })
    .filter(Boolean)
);

function getRequestHostNormalized(req?: Request): string | null {
  if (!req) return null;
  const rawForwarded = req.headers['x-forwarded-host'];
  const forwarded = Array.isArray(rawForwarded) ? rawForwarded[0] : rawForwarded;
  const rawHost = (forwarded || req.headers.host || '').split(',')[0].trim().toLowerCase();
  if (!rawHost) return null;
  // Normalizar puertos por defecto (:443 / :80) para comparar con URL.origin
  return rawHost.replace(/:(443|80)$/, '');
}

function getRequestProtoNormalized(req?: Request): 'http:' | 'https:' {
  if (!req) return isProdEnv ? 'https:' : 'http:';
  const rawProto = req.headers['x-forwarded-proto'];
  const protoHeader = (Array.isArray(rawProto) ? rawProto[0] : rawProto || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  if (protoHeader === 'https') return 'https:';
  if (protoHeader === 'http') return 'http:';
  return req.secure ? 'https:' : 'http:';
}

export function isOriginAllowedForRequest(origin: string, req?: Request): boolean {
  let parsed: URL;
  try {
    parsed = new URL(String(origin || '').trim());
  } catch {
    return false;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false;
  }

  const normalizedOrigin = parsed.origin.toLowerCase();
  if (explicitAllowedOrigins.has(normalizedOrigin)) {
    return true;
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!isProdEnv && (hostname === 'localhost' || hostname === '127.0.0.1')) {
    return true;
  }

  const reqHost = getRequestHostNormalized(req);
  if (reqHost) {
    const reqProto = getRequestProtoNormalized(req);
    const parsedHostNormalized = parsed.host.toLowerCase().replace(/:(443|80)$/, '');
    if (parsedHostNormalized === reqHost) {
      if (!isProdEnv || parsed.protocol === reqProto || parsed.protocol === 'https:') {
        return true;
      }
    }
  }

  return false;
}

const MUTABLE_HTTP_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Protección CSRF para peticiones mutables con sesión por cookies HttpOnly:
 * Valida Origin / Referer / Sec-Fetch-Site contra el mismo host y orígenes explícitamente configurados.
 * No interfiere con el flujo normal de login ni con clientes Bearer sin cookies cruzadas.
 */
export function verifySameOriginForCookieMutations(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!MUTABLE_HTTP_METHODS.has(req.method.toUpperCase())) {
    next();
    return;
  }

  const hasAuthCookie = Boolean(
    req.cookies?.[AUTH_COOKIE_NAME] || req.cookies?.[LEGACY_AUTH_COOKIE_NAME]
  );
  const authHeader = req.headers.authorization;
  const hasBearer = Boolean(authHeader && authHeader.startsWith('Bearer '));

  const rawOrigin = req.headers.origin;
  const originHeader = Array.isArray(rawOrigin) ? rawOrigin[0] : rawOrigin;

  if (originHeader) {
    if (!isOriginAllowedForRequest(originHeader, req)) {
      res.status(403).json({
        error: 'Solicitud bloqueada por validación de origen (CSRF).',
        code: 'CSRF_ORIGIN_MISMATCH',
      });
      return;
    }
    next();
    return;
  }

  const rawReferer = req.headers.referer;
  const refererHeader = Array.isArray(rawReferer) ? rawReferer[0] : rawReferer;

  if (refererHeader) {
    let refOrigin = '';
    try {
      refOrigin = new URL(refererHeader).origin;
    } catch {
      refOrigin = '';
    }
    if (!refOrigin || !isOriginAllowedForRequest(refOrigin, req)) {
      res.status(403).json({
        error: 'Solicitud bloqueada por validación de referencia de origen (CSRF).',
        code: 'CSRF_REFERER_MISMATCH',
      });
      return;
    }
    next();
    return;
  }

  const rawFetchSite = req.headers['sec-fetch-site'];
  const fetchSite = (Array.isArray(rawFetchSite) ? rawFetchSite[0] : rawFetchSite || '')
    .trim()
    .toLowerCase();

  if (hasAuthCookie && !hasBearer && fetchSite === 'cross-site') {
    res.status(403).json({
      error: 'Solicitud cross-site rechazada para sesiones basadas en cookies.',
      code: 'CSRF_CROSS_SITE_BLOCKED',
    });
    return;
  }

  next();
}

/**
 * Middleware centralizado de Autenticación
 * Valida la existencia y autenticidad del JWT, comprueba activo !== false y carga la entidad en req
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = extractToken(req);

    if (!token) {
      return res.status(401).json({
        error: 'No autenticado: Se requiere una sesión activa válida.',
        code: 'UNAUTHENTICATED',
      });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      clearAuthCookie(res);
      return res.status(401).json({
        error: 'Sesión inválida o expirada. Por favor, vuelva a iniciar sesión.',
        code: 'TOKEN_EXPIRED_OR_INVALID',
      });
    }

    req.authToken = token;
    req.authType = decoded.type;

    if (decoded.type === 'staff') {
      let user = await getUserById(decoded.userId);
      if (!user && decoded.emailOrCedula) {
        user = await getUserByEmailOrCedula(decoded.emailOrCedula);
        if (user && user.activo !== false) {
          const refreshedToken = generateToken({
            userId: user.id,
            emailOrCedula: user.email,
            rol: user.rol,
            type: 'staff',
          });
          setAuthCookie(res, refreshedToken);
        }
      }

      if (!user) {
        clearAuthCookie(res);
        return res.status(401).json({
          error: 'Usuario no encontrado en la base de datos institucional.',
          code: 'USER_NOT_FOUND',
        });
      }

      if (user.activo === false) {
        clearAuthCookie(res);
        return res.status(403).json({
          error: 'Su cuenta institucional ha sido desactivada. Contacte a la Dirección del plantel.',
          code: 'USER_INACTIVE',
        });
      }

      req.user = user;
    } else if (decoded.type === 'representante') {
      let rep = await getRepresentanteById(decoded.userId);
      if (!rep && decoded.emailOrCedula) {
        const reps = await getRepresentantes();
        rep =
          reps.find(
            (r) =>
              r.cedula.trim().toLowerCase() === decoded.emailOrCedula.trim().toLowerCase() ||
              (r.email && r.email.trim().toLowerCase() === decoded.emailOrCedula.trim().toLowerCase()) ||
              (r.usuario && r.usuario.trim().toLowerCase() === decoded.emailOrCedula.trim().toLowerCase())
          ) || null;
        if (rep && rep.activo !== false) {
          const refreshedToken = generateToken({
            userId: rep.idRepresentante,
            emailOrCedula: rep.cedula,
            rol: 'representante',
            type: 'representante',
          });
          setAuthCookie(res, refreshedToken);
        }
      }

      if (!rep) {
        clearAuthCookie(res);
        return res.status(401).json({
          error: 'Representante no encontrado en el registro institucional.',
          code: 'REPRESENTANTE_NOT_FOUND',
        });
      }

      if (rep.activo === false) {
        clearAuthCookie(res);
        return res.status(403).json({
          error: 'Su cuenta de representante se encuentra inactiva. Contacte al plantel.',
          code: 'USER_INACTIVE',
        });
      }

      req.representante = rep;
    } else {
      clearAuthCookie(res);
      return res.status(401).json({
        error: 'Tipo de sesión no reconocido.',
        code: 'INVALID_SESSION_TYPE',
      });
    }

    next();
  } catch (error: any) {
    console.error('Error in requireAuth middleware:', error);
    return res.status(500).json({ error: 'Error interno de autenticación de seguridad.' });
  }
}

/**
 * Middleware de Control de Acceso Basado en Roles (RBAC estricto)
 */
export function requireRole(...allowedRoles: RolUsuario[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Acceso no autenticado o exclusivo para personal institucional.',
        code: 'UNAUTHENTICATED',
      });
    }

    if (!allowedRoles.includes(req.user.rol)) {
      await logAuditEvent({
        idUsuario: req.user.id,
        emailOCedula: req.user.email,
        rol: req.user.rol,
        accion: 'INTENTO_ACCESO_DENEGADO_RBAC',
        entidad: 'API_ENDPOINT',
        idEntidad: req.originalUrl,
        ipOrigen: req.ip || req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
        detalles: {
          metodo: req.method,
          endpoint: req.originalUrl,
          rolRequerido: allowedRoles,
          rolPresente: req.user.rol,
        },
      });

      return res.status(403).json({
        error: `Acceso denegado: Esta acción requiere permisos de ${allowedRoles.join(' o ')}. Su rol actual es '${req.user.rol}'.`,
        code: 'FORBIDDEN_ROLE',
      });
    }

    next();
  };
}

export function isCoordinadorSeccional(user?: Usuario | null): boolean {
  return Boolean(user && user.rol === 'coordinador_seccional');
}

export function getCoordinadorSeccionalAnos(user?: Usuario | null): number[] {
  if (!user || user.rol !== 'coordinador_seccional' || !Array.isArray(user.anosAsignados)) {
    return [];
  }
  return Array.from(
    new Set(
      user.anosAsignados
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0)
    )
  );
}

export async function assertCoordinadorSeccionalAno(
  req: Request,
  res: Response,
  idAno: number | null | undefined,
  contextLabel: string
): Promise<boolean> {
  if (!req.user || req.user.rol !== 'coordinador_seccional') {
    return true;
  }
  const allowedAnos = getCoordinadorSeccionalAnos(req.user);
  const targetAno = idAno != null ? Number(idAno) : NaN;
  if (!Number.isInteger(targetAno) || !allowedAnos.includes(targetAno)) {
    await logAuditEvent({
      idUsuario: req.user.id,
      emailOCedula: req.user.email,
      rol: req.user.rol,
      accion: 'INTENTO_ACCESO_ANO_FUERA_ALCANCE',
      entidad: contextLabel,
      idEntidad: Number.isInteger(targetAno) ? targetAno : req.originalUrl,
      ipOrigen: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      detalles: {
        metodo: req.method,
        endpoint: req.originalUrl,
        idAnoSolicitado: idAno ?? null,
        anosAsignados: allowedAnos,
      },
    });
    res.status(403).json({
      error:
        'Acceso denegado: Su rol de Coordinador Seccional no tiene asignado el año escolar solicitado.',
      code: 'FORBIDDEN_YEAR_SCOPE',
    });
    return false;
  }
  return true;
}

export interface OwnershipValidationResult {
  allowed: boolean;
  reason?: string;
  suplenciaInfo?: {
    idSuplencia: number;
    idSuplente: number;
    suplenteNombre: string;
    idDocenteTitular: number;
    docenteTitularNombre: string;
    motivo?: string | null;
  };
}

/**
 * Validador estricto de propiedad para docentes titulares, docentes suplentes y coordinadores seccionales
 */
export async function validateDocenteOwnership(
  req: Request,
  idMateria: number,
  options?: { fecha?: string; studentIds?: number[] }
): Promise<OwnershipValidationResult> {
  if (!req.user) {
    return { allowed: false, reason: 'Usuario no autenticado' };
  }

  if (req.user.rol === 'director' || req.user.rol === 'coordinador') {
    return { allowed: true };
  }

  if (req.user.rol === 'coordinador_seccional') {
    const allowedAnos = getCoordinadorSeccionalAnos(req.user);
    const materia = await getMateriaById(idMateria);
    if (!materia || !allowedAnos.includes(materia.idAno)) {
      await logAuditEvent({
        idUsuario: req.user.id,
        emailOCedula: req.user.email,
        rol: req.user.rol,
        accion: 'INTENTO_ACCESO_ANO_FUERA_ALCANCE',
        entidad: 'materias',
        idEntidad: idMateria,
        ipOrigen: req.ip || req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
        detalles: {
          idMateria,
          idAnoMateria: materia?.idAno ?? null,
          anosAsignados: allowedAnos,
        },
      });
      return {
        allowed: false,
        reason: 'Acceso denegado: La materia seleccionada pertenece a un año escolar fuera de su coordinación seccional.',
      };
    }

    if (options?.studentIds && options.studentIds.length > 0) {
      const estudiantes = await getEstudiantes({}, false);
      const estMap = new Map(estudiantes.map((e) => [e.idEstudiante, e]));
      const outOfScope = options.studentIds.some((idEst) => {
        const est = estMap.get(Number(idEst));
        return !est || est.idAnoActual == null || !allowedAnos.includes(est.idAnoActual);
      });
      if (outOfScope) {
        return {
          allowed: false,
          reason:
            'Acceso denegado: Uno o más estudiantes seleccionados no pertenecen a sus años escolares asignados.',
        };
      }
    }

    return { allowed: true };
  }

  if (req.user.rol === 'docente') {
    const isAssigned = await isDocenteAssignedToMateria(req.user.id, idMateria);
    if (!isAssigned) {
      await logAuditEvent({
        idUsuario: req.user.id,
        emailOCedula: req.user.email,
        rol: req.user.rol,
        accion: 'INTENTO_MODIFICACION_MATERIA_NO_ASIGNADA',
        entidad: 'docente_materias',
        idEntidad: idMateria,
        ipOrigen: req.ip || req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
        detalles: {
          idDocente: req.user.id,
          idMateria,
          alerta: 'El docente intentó registrar o alterar asistencia de una asignatura no asignada.',
        },
      });
      return {
        allowed: false,
        reason: `Acceso denegado: El docente no tiene asignada la materia ID ${idMateria} en el sistema institucional.`,
      };
    }
    return { allowed: true };
  }

  if (req.user.rol === 'docente_suplente') {
    const activeSups = await getActiveSuplenciasForUser(
      req.user.id,
      options?.fecha,
      Number(idMateria)
    );
    if (activeSups.length === 0) {
      await logAuditEvent({
        idUsuario: req.user.id,
        emailOCedula: req.user.email,
        rol: req.user.rol,
        accion: 'INTENTO_MODIFICACION_SUPLENCIA_NO_AUTORIZADA',
        entidad: 'suplencias_docentes',
        idEntidad: idMateria,
        ipOrigen: req.ip || req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
        detalles: {
          idSuplente: req.user.id,
          idMateria,
          fecha: options?.fecha ?? null,
          alerta: 'El docente suplente intentó registrar asistencia sin suplencia activa o vigente.',
        },
      });
      return {
        allowed: false,
        reason:
          'Acceso denegado: No posee una suplencia activa y vigente asignada para esta materia en la fecha indicada.',
      };
    }

    let matchedSup = activeSups[0];
    if (options?.studentIds && options.studentIds.length > 0) {
      const estudiantes = await getEstudiantes({}, false);
      const estMap = new Map(estudiantes.map((e) => [e.idEstudiante, e]));
      for (const rawEstId of options.studentIds) {
        const est = estMap.get(Number(rawEstId));
        const coveringSup =
          est && est.estadoAcademico === 'ACTIVO'
            ? activeSups.find((s) => {
                const secOk = s.idSeccion == null || s.idSeccion === est.idSeccion;
                if (!secOk) return false;
                if (s.materiasTitularResumen && s.materiasTitularResumen.length > 0) {
                  return s.materiasTitularResumen.some(
                    (m) => m.idMateria === Number(idMateria) && m.idAno === est.idAnoActual
                  );
                }
                return s.idAno === est.idAnoActual;
              })
            : undefined;
        if (!coveringSup) {
          await logAuditEvent({
            idUsuario: req.user.id,
            emailOCedula: req.user.email,
            rol: req.user.rol,
            accion: 'INTENTO_MODIFICACION_SUPLENCIA_NO_AUTORIZADA',
            entidad: 'suplencias_docentes',
            idEntidad: idMateria,
            ipOrigen: req.ip || req.socket.remoteAddress,
            userAgent: req.headers['user-agent'],
            detalles: {
              idSuplente: req.user.id,
              idMateria,
              idEstudianteFueraAlcance: rawEstId,
              fecha: options?.fecha ?? null,
            },
          });
          return {
            allowed: false,
            reason:
              'Acceso denegado: Uno o más estudiantes no pertenecen al año escolar y sección asignados a su suplencia.',
          };
        }
        matchedSup = coveringSup;
      }
    }

    const suplenteNombre = `${req.user.nombre} ${req.user.apellidos || ''}`.trim();
    const docenteTitularNombre =
      `${matchedSup.titularNombre || ''} ${matchedSup.titularApellidos || ''}`.trim() ||
      `Docente #${matchedSup.idDocenteTitular}`;

    return {
      allowed: true,
      suplenciaInfo: {
        idSuplencia: matchedSup.idSuplencia,
        idSuplente: req.user.id,
        suplenteNombre,
        idDocenteTitular: matchedSup.idDocenteTitular,
        docenteTitularNombre,
        motivo: matchedSup.motivo ?? null,
      },
    };
  }

  return { allowed: false, reason: 'Rol no autorizado para gestionar actividades académicas' };
}
