import 'dotenv/config';
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import {
  getUserById,
  getUserByEmailOrCedula,
  getRepresentanteById,
  getRepresentantes,
  isDocenteAssignedToMateria,
  logAuditEvent,
} from './localDb.ts';
import type { RolUsuario, Usuario, Representante, AuthTokenPayload } from '../types.ts';

// -------------------------------------------------------------
// BLINDAJE DE SECRETOS CRIPTOGRÁFICOS Y TOLERANCIA A ENTORNO
// -------------------------------------------------------------
const FALLBACK_DEFAULT_SECRET = 'c8f5e13d9a7b240183e921d78a94cb2f57a3e8104d6b9c8e1a7428fb053d269e';
const rawJwtSecret = process.env.JWT_SECRET?.trim();

if (!rawJwtSecret || rawJwtSecret.length < 32) {
  console.warn(
    '[SECURITY NOTICE]: JWT_SECRET no está definida en las variables de entorno o tiene menos de 32 caracteres. Usando clave de respaldo segura de 256 bits para desarrollo/build.'
  );
}

export const JWT_SECRET =
  rawJwtSecret && rawJwtSecret.length >= 32 ? rawJwtSecret : FALLBACK_DEFAULT_SECRET;

export const AUTH_COOKIE_NAME = 'educontrol_token';

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

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }

  return null;
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

/**
 * Validador estricto de propiedad para docentes (docente_materias)
 */
export async function validateDocenteOwnership(
  req: Request,
  idMateria: number
): Promise<{ allowed: boolean; reason?: string }> {
  if (!req.user) {
    return { allowed: false, reason: 'Usuario no autenticado' };
  }

  if (req.user.rol === 'director' || req.user.rol === 'coordinador') {
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

  return { allowed: false, reason: 'Rol no autorizado para gestionar actividades académicas' };
}
