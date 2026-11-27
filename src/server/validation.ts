import net from 'node:net';
import dns from 'node:dns/promises';
import type { Request, Response, NextFunction } from 'express';
import { z, ZodError, type ZodSchema } from 'zod';

// Regex estricto para validar nombres y apellidos venezolanos sin números
export const NAME_REGEX = /^[A-Za-zÁÉÍÓÚáéíóúÑñÄËÏÖÜäëïöü\s'-]+$/;

const emptyToUndefined = (val: unknown) =>
  typeof val === 'string' && val.trim() === '' ? undefined : val;

export const loginCredentialsSchema = z
  .object({
    usuario: z.string().trim().optional(),
    identificador: z.string().trim().optional(),
    emailOrCedula: z.string().trim().optional(),
    cedulaOrEmail: z.string().trim().optional(),
    email: z.string().trim().optional(),
    cedula: z.string().trim().optional(),
    password: z.string().min(1, 'Debe ingresar su contraseña.'),
    preferredPortal: z.enum(['staff', 'representante']).optional(),
  })
  .refine(
    (data) => {
      const id =
        data.usuario ||
        data.identificador ||
        data.emailOrCedula ||
        data.cedulaOrEmail ||
        data.email ||
        data.cedula ||
        '';
      return id.trim().length >= 2;
    },
    { message: 'Debe ingresar su usuario, correo institucional o cédula.' }
  );

export const createStaffUserSchema = z.object({
  usuario: z
    .string()
    .trim()
    .min(3, 'El usuario debe tener al menos 3 caracteres')
    .max(50, 'El usuario no puede exceder 50 caracteres')
    .optional()
    .nullable(),
  email: z.string().trim().email('Formato de correo inválido'),
  nombre: z
    .string()
    .trim()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .regex(NAME_REGEX, 'El nombre no puede contener números ni caracteres especiales no permitidos'),
  apellidos: z
    .string()
    .trim()
    .min(2, 'Los apellidos deben tener al menos 2 caracteres')
    .regex(NAME_REGEX, 'Los apellidos no pueden contener números ni caracteres especiales no permitidos'),
  cedula: z.string().trim().optional().nullable(),
  telefono: z.string().trim().optional().nullable(),
  rol: z.enum(['director', 'coordinador', 'coordinador_seccional', 'docente', 'docente_suplente']),
  anosAsignados: z.array(z.coerce.number().int().positive('ID de año escolar inválido')).max(50).optional(),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres').optional().or(z.literal('')),
  activo: z.boolean().optional(),
});

export const updateStaffUserSchema = z.object({
  usuario: z
    .string()
    .trim()
    .min(3, 'El usuario debe tener al menos 3 caracteres')
    .max(50)
    .optional()
    .nullable()
    .or(z.literal('')),
  email: z.string().trim().email('Formato de correo inválido').optional(),
  nombre: z
    .string()
    .trim()
    .min(2)
    .regex(NAME_REGEX, 'El nombre no puede contener números')
    .optional(),
  apellidos: z
    .string()
    .trim()
    .min(2)
    .regex(NAME_REGEX, 'Los apellidos no pueden contener números')
    .optional(),
  cedula: z.string().trim().optional().nullable(),
  telefono: z.string().trim().optional().nullable(),
  rol: z.enum(['director', 'coordinador', 'coordinador_seccional', 'docente', 'docente_suplente']).optional(),
  anosAsignados: z.array(z.coerce.number().int().positive('ID de año escolar inválido')).max(50).optional(),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres').optional().or(z.literal('')),
  activo: z.boolean().optional(),
});

export const createRepresentanteSchema = z.object({
  usuario: z
    .string()
    .trim()
    .min(3, 'El usuario debe tener al menos 3 caracteres')
    .max(50)
    .optional()
    .nullable()
    .or(z.literal('')),
  cedula: z.string().trim().min(4, 'La cédula del representante es obligatoria'),
  nombres: z
    .string()
    .trim()
    .min(2, 'Los nombres son obligatorios')
    .regex(NAME_REGEX, 'Los nombres no pueden contener números'),
  apellidos: z
    .string()
    .trim()
    .min(2, 'Los apellidos son obligatorios')
    .regex(NAME_REGEX, 'Los apellidos no pueden contener números'),
  telefono: z.string().trim().optional().nullable(),
  email: z.string().trim().email('Formato de correo inválido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres').optional().or(z.literal('')),
  activo: z.boolean().optional(),
});

export const updateRepresentanteSchema = z.object({
  usuario: z
    .string()
    .trim()
    .min(3, 'El usuario debe tener al menos 3 caracteres')
    .max(50)
    .optional()
    .nullable()
    .or(z.literal('')),
  cedula: z.string().trim().min(4).optional(),
  nombres: z
    .string()
    .trim()
    .min(2)
    .regex(NAME_REGEX, 'Los nombres no pueden contener números')
    .optional(),
  apellidos: z
    .string()
    .trim()
    .min(2)
    .regex(NAME_REGEX, 'Los apellidos no pueden contener números')
    .optional(),
  telefono: z.string().trim().optional().nullable(),
  email: z.string().trim().email('Formato de correo inválido').optional(),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres').optional().or(z.literal('')),
  activo: z.boolean().optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(6, 'La nueva contraseña debe tener al menos 6 caracteres').optional().or(z.literal('')),
});

export const updateRepresentanteCredencialesSchema = z.object({
  email: z.string().trim().email('Formato de correo inválido').optional(),
  usuario: z
    .string()
    .trim()
    .min(3, 'El usuario debe tener al menos 3 caracteres')
    .max(50)
    .optional()
    .nullable()
    .or(z.literal('')),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres').optional().or(z.literal('')),
  activo: z.boolean().optional(),
});

export const asistenciaRecordItemSchema = z.object({
  idEstudiante: z.coerce.number().positive(),
  estado: z.enum(['Presente', 'Tarde', 'Ausente', 'Justificado', 'Reposo Médico']),
  horaEntrada: z.string().optional(),
});

export const asistenciaBatchSchema = z.object({
  idMateria: z.coerce.number().positive('ID de materia inválido'),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido. Utilice YYYY-MM-DD'),
  records: z.array(asistenciaRecordItemSchema).min(1, 'Debe enviar al menos un registro de estudiante'),
});

export const updateAsistenciaJustificacionSchema = z.object({
  estado: z.enum(['Presente', 'Tarde', 'Ausente', 'Justificado', 'Reposo Médico']),
  motivoJustificacion: z
    .string()
    .trim()
    .min(3, 'El motivo o detalle del justificante debe tener al menos 3 caracteres.')
    .max(500, 'El motivo de justificación no puede exceder los 500 caracteres.'),
  numeroJustificante: z
    .string()
    .trim()
    .max(80, 'El número de justificante o reposo no puede exceder los 80 caracteres.')
    .optional()
    .nullable()
    .or(z.literal('')),
  fechaRecepcionDocumento: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha de recepción inválido. Utilice YYYY-MM-DD')
    .optional()
    .nullable()
    .or(z.literal('')),
});

export const createHorarioSchema = z.object({
  idAno: z.coerce.number().int().positive(),
  idSeccion: z.coerce.number().int().positive(),
  idMateria: z.coerce.number().int().positive(),
  diaSemana: z.enum(['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes']),
  horaInicio: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM requerido para horaInicio'),
  horaFin: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM requerido para horaFin'),
  aula: z.string().trim().max(50).optional().nullable(),
  forceIgnoreConflict: z.boolean().optional(),
});

export const updateHorarioSchema = createHorarioSchema.partial();

export const validateHorarioConflictSchema = z.object({
  idHorario: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional()),
  idAno: z.coerce.number().int().positive(),
  idSeccion: z.coerce.number().int().positive(),
  idMateria: z.coerce.number().int().positive(),
  diaSemana: z.enum(['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes']),
  horaInicio: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM requerido para horaInicio'),
  horaFin: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM requerido para horaFin'),
  aula: z.string().trim().max(50).optional().nullable(),
});

export const suggestSlotsSchema = z.object({
  idAno: z.coerce.number().int().positive(),
  idSeccion: z.coerce.number().int().positive(),
  idMateria: z.coerce.number().int().positive(),
  aula: z.string().trim().max(50).optional().nullable(),
  idHorarioExcluir: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional()),
});

export const configuracionEntrySchema = z.object({
  clave: z
    .string()
    .trim()
    .min(1, 'La clave de configuración es obligatoria')
    .max(100, 'La clave no puede exceder los 100 caracteres'),
  valor: z
    .union([z.string().max(1000), z.number(), z.boolean()])
    .transform((v) => String(v)),
  descripcion: z.string().trim().max(300).optional().nullable(),
});

export const recesoSchema = z.object({
  nombre: z.string().trim().min(2, 'El nombre del receso es obligatorio'),
  horaInicio: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM requerido'),
  horaFin: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM requerido'),
  activo: z.boolean().optional(),
  descripcion: z.string().trim().max(250).optional().nullable(),
});

export const updateRecesoSchema = recesoSchema.partial();

export const createAnoSchema = z.object({
  nombreNivel: z.string().trim().min(2, 'El nombre del nivel es obligatorio').max(80),
  activo: z.boolean().optional().default(true),
});

export const updateAnoSchema = z.object({
  nombreNivel: z.string().trim().min(2, 'El nombre del nivel es obligatorio').max(80),
  activo: z.boolean().optional(),
});

export const createSeccionSchema = z.object({
  idAno: z.coerce.number().int().positive('Año escolar inválido'),
  nombreSeccion: z.string().trim().min(1, 'El nombre de la sección es obligatorio').max(40),
});

export const updateSeccionSchema = z.object({
  nombreSeccion: z.string().trim().min(1, 'El nombre de la sección es obligatorio').max(40),
  idAno: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional()),
});

export const createMateriaSchema = z.object({
  idAno: z.coerce.number().int().positive('Año escolar inválido'),
  nombreMateria: z.string().trim().min(2, 'El nombre de la materia es obligatorio').max(100),
});

export const updateMateriaSchema = z.object({
  nombreMateria: z.string().trim().min(2, 'El nombre de la materia es obligatorio').max(100),
  idAno: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional()),
});

export const assignDocenteMateriaSchema = z.object({
  idUsuario: z.coerce.number().int().positive('Docente inválido'),
  idMateria: z.coerce.number().int().positive('Materia inválida'),
});

export const assignDocenteMateriasBatchSchema = z.object({
  idUsuario: z.coerce.number().int().positive('Docente inválido'),
  idMaterias: z.array(z.coerce.number().int().positive('ID de materia inválido')).max(200),
});

export const replaceDocenteMateriasSchema = z.object({
  idMaterias: z.array(z.coerce.number().int().positive('ID de materia inválido')).max(200),
});

export const createEstudianteSchema = z.object({
  cedula: z.string().trim().min(3, 'Cédula escolar obligatoria').max(25),
  nombres: z.string().trim().min(2, 'Nombres obligatorios').max(100),
  apellidos: z.string().trim().min(2, 'Apellidos obligatorios').max(100),
  idAnoActual: z.coerce.number().int().positive('Año escolar actual obligatorio'),
  idSeccion: z.preprocess(
    (v) => (v === '' || v === null || v === undefined || Number(v) === 0 ? null : Number(v)),
    z.number().int().positive().nullable().optional()
  ),
  idRepresentante: z.coerce.number().int().positive('Representante obligatorio'),
});

export const asistenciaQuerySchema = z.object({
  fecha: z.preprocess(
    emptyToUndefined,
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha YYYY-MM-DD').optional()
  ),
  mes: z.preprocess(
    emptyToUndefined,
    z.string().regex(/^\d{4}-\d{2}$/, 'Formato de mes YYYY-MM').optional()
  ),
  startDate: z.preprocess(
    emptyToUndefined,
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de startDate YYYY-MM-DD').optional()
  ),
  endDate: z.preprocess(
    emptyToUndefined,
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de endDate YYYY-MM-DD').optional()
  ),
  estado: z.preprocess(
    emptyToUndefined,
    z.enum(['Presente', 'Tarde', 'Ausente', 'Justificado', 'Reposo Médico']).optional()
  ),
  idMateria: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional()),
  idMaterias: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .regex(/^\d+(,\d+)*$/, 'idMaterias debe ser una lista de IDs separados por coma')
      .optional()
  ),
  idEstudiante: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional()),
  idRepresentante: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional()),
  idSeccion: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional()),
  idAno: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional()),
  lapsoId: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional()),
  lapso_id: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional()),
});

export const salidaSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(2, 'El nombre de la hora de salida es obligatorio')
    .max(80, 'El nombre no puede exceder los 80 caracteres'),
  horaSalida: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM requerido para la hora de salida'),
  idAno: z.preprocess(
    (v) => (v === '' || v === null || v === undefined || Number(v) === 0 ? null : Number(v)),
    z.number().int().positive().nullable().optional()
  ),
  activo: z.boolean().optional(),
  notificarPush: z.boolean().optional(),
  descripcion: z.string().trim().max(250).optional().nullable(),
});

export const updateSalidaSchema = salidaSchema.partial();

const normalizeLapsoInput = (raw: unknown): Record<string, unknown> => {
  if (!raw || typeof raw !== 'object') return {};
  const obj = raw as Record<string, unknown>;
  return {
    ...obj,
    numeroLapso: obj.numeroLapso ?? obj.numero_lapso,
    fechaInicio: obj.fechaInicio ?? obj.fecha_inicio,
    fechaFin: obj.fechaFin ?? obj.fecha_fin,
    anioEscolar: obj.anioEscolar ?? obj.anio_escolar,
  };
};

export const createLapsoSchema = z.preprocess(
  normalizeLapsoInput,
  z
    .object({
      nombre: z
        .string()
        .trim()
        .min(3, 'El nombre del lapso debe tener al menos 3 caracteres.')
        .max(80, 'El nombre del lapso no puede exceder los 80 caracteres.'),
      numeroLapso: z.coerce
        .number()
        .int('El número de lapso debe ser un número entero.')
        .min(1, 'El número de lapso debe ser 1, 2 o 3.')
        .max(3, 'El número de lapso debe ser 1, 2 o 3.'),
      fechaInicio: z
        .string()
        .trim()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha de inicio debe tener el formato YYYY-MM-DD.'),
      fechaFin: z
        .string()
        .trim()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha de cierre debe tener el formato YYYY-MM-DD.'),
      anioEscolar: z
        .string()
        .trim()
        .min(4, 'El año escolar asociado es obligatorio (ej. 2025 - 2026).')
        .max(40, 'El año escolar no puede exceder los 40 caracteres.'),
      activo: z.boolean().optional().default(false),
    })
    .refine((data) => data.fechaInicio <= data.fechaFin, {
      message: 'La fecha de inicio no puede ser posterior a la fecha de cierre del lapso.',
      path: ['fechaFin'],
    })
);

export const updateLapsoSchema = z.preprocess(
  normalizeLapsoInput,
  z
    .object({
      nombre: z
        .string()
        .trim()
        .min(3, 'El nombre del lapso debe tener al menos 3 caracteres.')
        .max(80, 'El nombre del lapso no puede exceder los 80 caracteres.')
        .optional(),
      numeroLapso: z.coerce
        .number()
        .int('El número de lapso debe ser un número entero.')
        .min(1, 'El número de lapso debe ser 1, 2 o 3.')
        .max(3, 'El número de lapso debe ser 1, 2 o 3.')
        .optional(),
      fechaInicio: z
        .string()
        .trim()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha de inicio debe tener el formato YYYY-MM-DD.')
        .optional(),
      fechaFin: z
        .string()
        .trim()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha de cierre debe tener el formato YYYY-MM-DD.')
        .optional(),
      anioEscolar: z
        .string()
        .trim()
        .min(4, 'El año escolar asociado debe tener al menos 4 caracteres.')
        .max(40, 'El año escolar no puede exceder los 40 caracteres.')
        .optional(),
      activo: z.boolean().optional(),
    })
    .refine(
      (data) => !data.fechaInicio || !data.fechaFin || data.fechaInicio <= data.fechaFin,
      {
        message: 'La fecha de inicio no puede ser posterior a la fecha de cierre del lapso.',
        path: ['fechaFin'],
      }
    )
);

export const activateLapsoSchema = z.object({
  activo: z.boolean().optional().default(true),
});

const BLOCKED_PUSH_HOST_SUFFIXES = [
  '.localhost',
  '.local',
  '.internal',
  '.arpa',
  '.home',
  '.lan',
];

const BLOCKED_PUSH_HOSTS = new Set([
  'localhost',
  'metadata',
  'metadata.google.internal',
  'instance-data',
]);

function unwrapIpv4MappedIpv6(ip: string): string | null {
  const lower = ip.toLowerCase();
  if (!lower.startsWith('::ffff:')) return null;
  const tail = lower.slice(7);
  if (net.isIPv4(tail)) return tail;
  const parts = tail.split(':');
  if (parts.length === 2 && /^[0-9a-f]{1,4}$/.test(parts[0]) && /^[0-9a-f]{1,4}$/.test(parts[1])) {
    const hi = parseInt(parts[0], 16);
    const lo = parseInt(parts[1], 16);
    return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
  }
  return null;
}

export function isPublicIpAddress(rawIp: string): boolean {
  const ip = String(rawIp || '').trim().split('%')[0];
  const ipVersion = net.isIP(ip);
  if (ipVersion === 0) return false;

  if (ipVersion === 4) {
    const octets = ip.split('.').map(Number);
    if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
      return false;
    }
    const [a, b, c] = octets;
    if (a === 0) return false; // 0.0.0.0/8 (This network)
    if (a === 10) return false; // 10.0.0.0/8 (RFC1918)
    if (a === 100 && b >= 64 && b <= 127) return false; // 100.64.0.0/10 (CGNAT)
    if (a === 127) return false; // 127.0.0.0/8 (Loopback)
    if (a === 169 && b === 254) return false; // 169.254.0.0/16 (Link-local / Cloud Metadata)
    if (a === 172 && b >= 16 && b <= 31) return false; // 172.16.0.0/12 (RFC1918)
    if (a === 192 && b === 0 && c === 0) return false; // 192.0.0.0/24 (IETF Protocol)
    if (a === 192 && b === 0 && c === 2) return false; // 192.0.2.0/24 (TEST-NET-1)
    if (a === 192 && b === 168) return false; // 192.168.0.0/16 (RFC1918)
    if (a === 198 && (b === 18 || b === 19)) return false; // 198.18.0.0/15 (Benchmarking)
    if (a === 198 && b === 51 && c === 100) return false; // 198.51.100.0/24 (TEST-NET-2)
    if (a === 203 && b === 0 && c === 113) return false; // 203.0.113.0/24 (TEST-NET-3)
    if (a >= 224) return false; // 224.0.0.0/4 Multicast & 240.0.0.0/4 Reserved
    return true;
  }

  // IPv6
  const unwrapped = unwrapIpv4MappedIpv6(ip);
  if (unwrapped) {
    return isPublicIpAddress(unwrapped);
  }

  const lower = ip.toLowerCase();
  if (lower === '::' || lower === '::1') return false;
  // Normalizar primer bloque hexadecimal
  const firstSegment = lower.split(':')[0];
  if (firstSegment) {
    const val = parseInt(firstSegment, 16);
    if (!Number.isNaN(val)) {
      if ((val & 0xfe00) === 0xfc00) return false; // fc00::/7 Unique Local Address (ULA)
      if ((val & 0xffc0) === 0xfe80) return false; // fe80::/10 Link-local
      if ((val & 0xffc0) === 0xfec0) return false; // fec0::/10 Deprecated Site-local
      if ((val & 0xff00) === 0xff00) return false; // ff00::/8 Multicast
    }
  }
  if (lower.startsWith('100::') || lower.startsWith('2001:db8:')) return false;
  return true;
}

export function isSafePushEndpointUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(String(rawUrl || '').trim());
    if (parsed.protocol !== 'https:') return false;
    if (parsed.username || parsed.password) return false;
    if (parsed.port && parsed.port !== '443') return false;

    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.+$/, '');
    if (!host || !host.includes('.')) return false;

    if (
      BLOCKED_PUSH_HOSTS.has(host) ||
      BLOCKED_PUSH_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))
    ) {
      return false;
    }

    // Bloquear literales IPv4 / IPv6 estándar y formas numéricas no estándar (hex, octal o entero único)
    if (net.isIP(host) !== 0 || host.includes(':')) {
      return false;
    }
    if (/^(?:\d+|0x[0-9a-f]+)$/i.test(host)) {
      return false;
    }
    const labels = host.split('.');
    if (
      labels.length <= 4 &&
      labels.every((part) => /^(?:\d+|0x[0-9a-f]+|0[0-7]+)$/i.test(part))
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

export async function assertSafePushEndpointAndResolve(rawUrl: string): Promise<void> {
  if (!isSafePushEndpointUrl(rawUrl)) {
    throw new Error('Endpoint Web Push bloqueado por política de seguridad HTTPS.');
  }
  const parsed = new URL(String(rawUrl).trim());
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.+$/, '');

  const resolved = await dns.lookup(host, { all: true, verbatim: true });
  if (!Array.isArray(resolved) || resolved.length === 0) {
    throw new Error('No se pudo resolver el dominio del endpoint Web Push.');
  }
  for (const record of resolved) {
    if (!isPublicIpAddress(record.address)) {
      throw new Error(
        'Endpoint Web Push bloqueado: el dominio resuelve a una dirección IP privada, local o reservada.'
      );
    }
  }
}

export const pushSubscriptionSchema = z.object({
  endpoint: z
    .string()
    .trim()
    .url('Endpoint de suscripción push inválido')
    .min(10)
    .max(2048, 'Endpoint de suscripción demasiado largo')
    .refine(isSafePushEndpointUrl, {
      message: 'El endpoint Web Push debe usar HTTPS hacia un dominio público válido.',
    }),
  keys: z.object({
    p256dh: z.string().trim().min(10, 'Clave pública p256dh requerida').max(512),
    auth: z.string().trim().min(6, 'Secreto auth requerido').max(256),
  }),
});

export const pushRotateSchema = z.object({
  oldEndpoint: z
    .string()
    .trim()
    .url('Endpoint anterior inválido')
    .min(10)
    .max(2048)
    .refine(isSafePushEndpointUrl, {
      message: 'El endpoint anterior debe usar HTTPS hacia un dominio público válido.',
    }),
  oldKeys: z.object({
    p256dh: z.string().trim().min(10, 'Clave pública anterior requerida').max(512),
    auth: z.string().trim().min(6, 'Secreto anterior requerido').max(256),
  }),
  newSubscription: pushSubscriptionSchema,
});

export const pushUnsubscribeSchema = z.object({
  endpoint: z.string().trim().url('Endpoint de suscripción push inválido').min(10).max(2048),
});

export const updateHorariosConfigSchema = z
  .object({
    horaRecesoInicio: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM requerido para inicio de receso'),
    horaRecesoFin: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM requerido para fin de receso'),
    horaSalida: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM requerido para hora de salida'),
    alertaRecesoActiva: z.boolean(),
    alertaSalidaActiva: z.boolean(),
  })
  .refine((d) => d.horaRecesoInicio < d.horaRecesoFin, {
    message: 'La hora de fin del receso debe ser posterior a la hora de inicio.',
    path: ['horaRecesoFin'],
  })
  .refine((d) => d.horaRecesoFin <= d.horaSalida, {
    message: 'La hora oficial de salida debe ser igual o posterior al fin del receso.',
    path: ['horaSalida'],
  });

export const triggerMilestonePushSchema = z.object({
  tipo: z.enum(['receso', 'salida']),
  mensajePersonalizado: z
    .string()
    .trim()
    .max(240, 'El mensaje personalizado no puede exceder 240 caracteres.')
    .optional(),
});

const optionalPositiveIntQuery = z.preprocess(
  emptyToUndefined,
  z.coerce.number().int('Debe ser un número entero').positive('Debe ser mayor a 0').optional()
);

const optionalDateYmdQuery = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido. Utilice YYYY-MM-DD')
    .optional()
);

const optionalMonthYmQuery = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}$/, 'Formato de mes inválido. Utilice YYYY-MM')
    .optional()
);

export const attendanceHistoryQuerySchema = z.preprocess(
  (raw) => {
    if (!raw || typeof raw !== 'object') return raw;
    const obj = raw as Record<string, unknown>;
    return {
      ...obj,
      lapsoId: obj.lapsoId ?? obj.lapso_id,
    };
  },
  z
    .object({
      page: z.preprocess(
        emptyToUndefined,
        z.coerce
          .number()
          .int('El número de página debe ser un entero')
          .min(1, 'La página mínima es 1')
          .max(10000, 'Número de página fuera de rango')
          .default(1)
      ),
      limit: z.preprocess(
        emptyToUndefined,
        z.coerce
          .number()
          .int('El límite por página debe ser un entero')
          .min(1, 'El límite mínimo por página es 1')
          .max(500, 'El límite máximo por página es 500')
          .default(25)
      ),
      idAno: optionalPositiveIntQuery,
      idSeccion: optionalPositiveIntQuery,
      idMateria: optionalPositiveIntQuery,
      idEstudiante: optionalPositiveIntQuery,
      lapsoId: optionalPositiveIntQuery,
      fecha: optionalDateYmdQuery,
      mes: optionalMonthYmQuery,
      startDate: optionalDateYmdQuery,
      endDate: optionalDateYmdQuery,
      estado: z.preprocess(
        emptyToUndefined,
        z.enum(['Presente', 'Tarde', 'Ausente', 'Justificado', 'Reposo Médico']).optional()
      ),
      search: z.preprocess(
        emptyToUndefined,
        z.string().trim().max(100, 'El criterio de búsqueda es demasiado largo').optional()
      ),
    })
    .refine(
      (q) => !q.startDate || !q.endDate || q.startDate <= q.endDate,
      { message: 'La fecha inicial (startDate) no puede ser mayor que la fecha final (endDate).' }
    )
);

export const auditLogsQuerySchema = z
  .object({
    page: z.preprocess(
      emptyToUndefined,
      z.coerce
        .number()
        .int('El número de página debe ser un entero')
        .min(1, 'La página mínima es 1')
        .max(10000, 'Número de página fuera de rango')
        .default(1)
    ),
    limit: z.preprocess(
      emptyToUndefined,
      z.coerce
        .number()
        .int('El límite por página debe ser un entero')
        .min(1, 'El límite mínimo por página es 1')
        .max(500, 'El límite máximo por página es 500')
        .default(25)
    ),
    accion: z.preprocess(
      emptyToUndefined,
      z.string().trim().max(80, 'Filtro de acción demasiado largo').optional()
    ),
    entidad: z.preprocess(
      emptyToUndefined,
      z.string().trim().max(80, 'Filtro de entidad demasiado largo').optional()
    ),
    search: z.preprocess(
      emptyToUndefined,
      z.string().trim().max(100, 'Criterio de búsqueda demasiado largo').optional()
    ),
    startDate: optionalDateYmdQuery,
    endDate: optionalDateYmdQuery,
  })
  .refine(
    (q) => !q.startDate || !q.endDate || q.startDate <= q.endDate,
    { message: 'La fecha inicial (startDate) no puede ser mayor que la fecha final (endDate).' }
  );

export const promoverEstudiantesSchema = z
  .object({
    anioOrigenId: z.coerce.number().int().positive('Debe seleccionar el año escolar de origen.'),
    seccionOrigenId: z.coerce
      .number()
      .int()
      .positive('Debe seleccionar estrictamente una única sección de origen (no se permite promover múltiples secciones a la vez).'),
    anioDestinoId: z.union([
      z.literal('EGRESADO'),
      z.coerce.number().int().positive('Debe seleccionar un año destino válido o EGRESADO.'),
    ]),
    seccionDestinoId: z.preprocess(
      (v) => (v === '' || v === null || v === undefined || Number(v) === 0 ? null : Number(v)),
      z.number().int().positive().nullable().optional()
    ),
    estudiantesIds: z
      .array(z.coerce.number().int().positive('ID de estudiante inválido.'))
      .min(1, 'Debe seleccionar al menos un estudiante para ejecutar la promoción.'),
    confirmarDoble: z.boolean().optional(),
  })
  .refine(
    (data) => {
      if (data.anioDestinoId === 'EGRESADO') return true;
      return data.seccionDestinoId != null && data.seccionDestinoId > 0;
    },
    {
      message: 'Debe seleccionar una sección de destino cuando el año destino es regular.',
      path: ['seccionDestinoId'],
    }
  )
  .refine(
    (data) => {
      if (data.anioDestinoId === 'EGRESADO') return true;
      if (data.anioOrigenId !== data.anioDestinoId) return true;
      return data.seccionOrigenId !== data.seccionDestinoId;
    },
    {
      message: 'El año y sección de destino deben ser diferentes al origen.',
      path: ['seccionDestinoId'],
    }
  );

export const createDiaNoLaborableSchema = z.preprocess(
  (raw) => {
    if (!raw || typeof raw !== 'object') return {};
    const obj = raw as Record<string, unknown>;
    return {
      ...obj,
      fechaInicio: obj.fechaInicio ?? obj.fecha_inicio,
      fechaFin: obj.fechaFin ?? obj.fecha_fin ?? obj.fechaInicio ?? obj.fecha_inicio,
      lapsoId: obj.lapsoId ?? obj.lapso_id,
    };
  },
  z
    .object({
      fechaInicio: z
        .string()
        .trim()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha inicial debe tener el formato YYYY-MM-DD.'),
      fechaFin: z
        .string()
        .trim()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha final debe tener el formato YYYY-MM-DD.'),
      motivo: z
        .string()
        .trim()
        .min(3, 'El motivo debe tener al menos 3 caracteres.')
        .max(160, 'El motivo no puede exceder los 160 caracteres.'),
      lapsoId: z.preprocess(
        (v) => (v === '' || v === null || v === undefined || Number(v) === 0 ? null : Number(v)),
        z.number().int().positive().nullable().optional()
      ),
    })
    .refine((d) => d.fechaInicio <= d.fechaFin, {
      message: 'La fecha de inicio no puede ser posterior a la fecha final.',
      path: ['fechaFin'],
    })
);

export const verificarFechaQuerySchema = z.object({
  fecha: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha a verificar debe tener el formato YYYY-MM-DD.'),
});

export const testPushLoadSchema = z
  .object({
    totalObjetivos: z.coerce
      .number()
      .int('El total de objetivos debe ser entero.')
      .min(100, 'El mínimo para prueba de carga es 100.')
      .max(10000, 'El máximo permitido es 10000.')
      .optional(),
    chunkSize: z.coerce
      .number()
      .int('El tamaño de lote debe ser entero.')
      .min(25, 'El tamaño de lote mínimo es 25.')
      .max(50, 'El tamaño de lote máximo es 50.')
      .optional(),
    chunkDelayMs: z.coerce
      .number()
      .int('La pausa entre lotes debe ser entera.')
      .min(50, 'La pausa mínima entre lotes es 50ms.')
      .max(100, 'La pausa máxima entre lotes es 100ms.')
      .optional(),
  })
  .optional()
  .default({});

export const updateEstudianteSchema = z.object({
  cedula: z.string().trim().min(4, 'La cédula debe tener al menos 4 caracteres.').optional(),
  nombres: z
    .string()
    .trim()
    .min(2, 'Los nombres deben tener al menos 2 caracteres.')
    .regex(NAME_REGEX, 'Los nombres no pueden contener números ni caracteres especiales.')
    .optional(),
  apellidos: z
    .string()
    .trim()
    .min(2, 'Los apellidos deben tener al menos 2 caracteres.')
    .regex(NAME_REGEX, 'Los apellidos no pueden contener números ni caracteres especiales.')
    .optional(),
  idAnoActual: z.preprocess(
    (v) =>
      v === undefined
        ? undefined
        : v === '' || v === null || Number(v) === 0
        ? null
        : Number(v),
    z.number().int().positive().nullable().optional()
  ),
  idSeccion: z.preprocess(
    (v) =>
      v === undefined
        ? undefined
        : v === '' || v === null || Number(v) === 0
        ? null
        : Number(v),
    z.number().int().positive().nullable().optional()
  ),
  idRepresentante: z.coerce.number().int().positive().optional(),
  estadoAcademico: z.enum(['ACTIVO', 'EGRESADO', 'RETIRADO']).optional(),
});

export const cierreAnioEscolarSchema = z
  .object({
    anioLectivo: z.preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
      z.string().trim().min(4, 'El año lectivo debe tener al menos 4 caracteres.').max(40).optional()
    ),
    lapsoIds: z
      .array(z.coerce.number().int().positive('ID de lapso inválido.'))
      .max(50, 'Demasiados lapsos seleccionados.')
      .optional(),
    incluirInactivosAniosAnteriores: z.boolean().optional().default(true),
    incluirLapsosCerrados: z.boolean().optional().default(true),
    nuevoAnoLectivo: z.preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
      z
        .string()
        .trim()
        .min(4, 'El nuevo año lectivo debe tener al menos 4 caracteres (ej. 2026 - 2027).')
        .max(40)
        .optional()
    ),
    dryRun: z.boolean().optional().default(false),
    confirmado: z.boolean().optional().default(false),
  })
  .refine((data) => data.dryRun || data.confirmado === true, {
    message:
      'Debe confirmar explícitamente el cierre/compactación (confirmado: true) antes de ejecutar.',
    path: ['confirmado'],
  });

export const limpiarAntiguosSchema = z
  .object({
    diasRetencionPush: z.coerce
      .number()
      .int('Los días de retención push deben ser un número entero.')
      .min(7, 'El umbral mínimo para suscripciones push es de 7 días.')
      .max(3650, 'El umbral máximo permitido es de 3650 días.')
      .optional()
      .default(90),
    diasRetencionLogs: z.coerce
      .number()
      .int('Los días de retención de logs deben ser un número entero.')
      .min(30, 'El umbral mínimo para logs de rutina es de 30 días.')
      .max(3650, 'El umbral máximo permitido es de 3650 días.')
      .optional()
      .default(180),
    diasRetencionNotificaciones: z.coerce
      .number()
      .int('Los días de retención de notificaciones deben ser un número entero.')
      .min(7, 'El umbral mínimo para notificaciones leídas es de 7 días.')
      .max(3650, 'El umbral máximo permitido es de 3650 días.')
      .optional()
      .default(90),
    diasRetencionHitos: z.coerce
      .number()
      .int('Los días de retención de hitos deben ser un número entero.')
      .min(7, 'El umbral mínimo para despachos de hitos es de 7 días.')
      .max(3650, 'El umbral máximo permitido es de 3650 días.')
      .optional()
      .default(90),
    limpiarPush: z.boolean().optional().default(true),
    limpiarLogs: z.boolean().optional().default(true),
    limpiarNotificaciones: z.boolean().optional().default(true),
    limpiarHitos: z.boolean().optional().default(true),
    dryRun: z.boolean().optional().default(false),
    confirmado: z.boolean().optional().default(false),
  })
  .refine((data) => data.dryRun || data.confirmado === true, {
    message:
      'Debe confirmar explícitamente la limpieza de datos antiguos (confirmado: true) antes de ejecutar.',
    path: ['confirmado'],
  });

const backupArrayField = z.array(z.record(z.string(), z.unknown()));

export const restoreBackupSchema = z.object({
  metadata: z
    .object({
      sistema: z.string().max(200).optional(),
      version: z.string().max(50).optional(),
      fechaGeneracion: z.string().max(100).optional(),
      checksumSha256: z
        .string()
        .trim()
        .regex(/^[a-f0-9]{64}$/i, 'Formato de checksum SHA-256 inválido.')
        .optional(),
    })
    .passthrough()
    .optional(),
  data: z
    .object({
      configuracionInstitucional: backupArrayField,
      recesosInstitucionales: backupArrayField.optional(),
      salidasInstitucionales: backupArrayField.optional(),
      lapsosEscolares: backupArrayField.optional(),
      diasNoLaborables: backupArrayField.optional(),
      anosEscolares: backupArrayField,
      secciones: backupArrayField,
      materias: backupArrayField,
      docenteMaterias: backupArrayField.optional(),
      suplenciasDocentes: backupArrayField.optional(),
      representantes: backupArrayField,
      estudiantes: backupArrayField,
      asistencia: backupArrayField,
      resumenesAsistencia: backupArrayField.optional(),
      horarios: backupArrayField.optional(),
      users: backupArrayField,
      notificacionesRepresentante: backupArrayField.optional(),
      auditLogs: backupArrayField.optional(),
      backupLogs: backupArrayField.optional(),
      pushSubscriptions: backupArrayField.optional(),
      milestoneDispatches: backupArrayField.optional(),
    })
    .passthrough(),
});

export const resetDatabaseSchema = z.object({
  confirmacion: z.literal('CONFIRMAR', {
    message: 'Debe enviar confirmacion exactamente igual a "CONFIRMAR" para reiniciar la base de datos.',
  }),
});

export const cierreBackupFilenameSchema = z
  .string()
  .trim()
  .refine((val) => !val.includes('..') && !val.includes('/') && !val.includes('\\'), {
    message: 'Nombre de archivo de respaldo inválido.',
  })
  .regex(/^cierre-[a-zA-Z0-9._-]+\.json$/, 'Nombre de archivo de respaldo inválido.');

export const backupLogsQuerySchema = z.object({
  page: z.preprocess(
    emptyToUndefined,
    z.coerce
      .number()
      .int('El número de página debe ser un entero')
      .min(1, 'La página mínima es 1')
      .max(10000, 'Número de página fuera de rango')
      .default(1)
  ),
  limit: z.preprocess(
    emptyToUndefined,
    z.coerce
      .number()
      .int('El límite por página debe ser un entero')
      .min(1, 'El límite mínimo por página es 1')
      .max(100, 'El límite máximo por página es 100')
      .default(15)
  ),
  tipo: z.preprocess(
    emptyToUndefined,
    z.enum(['completo', 'cierre_anio']).optional()
  ),
  origen: z.preprocess(
    emptyToUndefined,
    z.enum(['manual', 'previo_cierre']).optional()
  ),
  estado: z.preprocess(
    emptyToUndefined,
    z.enum(['exitoso', 'fallido']).optional()
  ),
  search: z.preprocess(
    emptyToUndefined,
    z.string().trim().max(100, 'El criterio de búsqueda es demasiado largo').optional()
  ),
});

export const backupLogIdParamSchema = z.coerce
  .number()
  .int('ID de log de backup inválido.')
  .positive('ID de log de backup inválido.');

export const resumenesAsistenciaQuerySchema = z.object({
  anioLectivo: z.preprocess(emptyToUndefined, z.string().trim().max(40).optional()),
  estudianteId: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().positive('ID de estudiante inválido.').optional()
  ),
});

export const positiveIntParamSchema = z
  .string()
  .trim()
  .regex(/^[1-9]\d{0,11}$/, 'El identificador debe ser un número entero positivo.')
  .transform((val) => Number(val));

export function validatePositiveIntParam(paramName: string = 'id', entityLabel: string = 'registro') {
  return (req: Request, res: Response, next: NextFunction) => {
    const parsed = positiveIntParamSchema.safeParse(req.params?.[paramName]);
    if (!parsed.success) {
      res.status(400).json({
        error: `ID de ${entityLabel} inválido.`,
        code: 'INVALID_ROUTE_PARAM',
      });
      return;
    }
    if (!res.locals.validatedParams) {
      res.locals.validatedParams = {};
    }
    res.locals.validatedParams[paramName] = parsed.data;
    next();
  };
}

export const usersQuerySchema = z.object({
  rol: z.preprocess(
    emptyToUndefined,
    z.enum(['director', 'coordinador', 'coordinador_seccional', 'docente', 'docente_suplente']).optional()
  ),
});

export const createSuplenciaSchema = z
  .object({
    idSuplente: z.coerce.number().int().positive('Debe seleccionar un docente suplente válido.'),
    idDocenteTitular: z.coerce.number().int().positive('Debe seleccionar un docente titular válido.'),
    alcanceCompleto: z.boolean().optional().default(false),
    idDocenteMateria: z.preprocess(
      (v) => (v === '' || v === null || v === undefined || Number(v) === 0 ? null : Number(v)),
      z.number().int().positive().nullable().optional()
    ),
    idMateria: z.preprocess(
      (v) => (v === '' || v === null || v === undefined || Number(v) === 0 ? null : Number(v)),
      z.number().int().positive('Debe seleccionar una materia válida.').nullable().optional()
    ),
    idSeccion: z.preprocess(
      (v) => (v === '' || v === null || v === undefined || Number(v) === 0 ? null : Number(v)),
      z.number().int().positive().nullable().optional()
    ),
    activo: z.boolean().optional().default(true),
    fechaInicio: z.preprocess(
      (v) => (v === '' || v === null || v === undefined ? null : String(v).trim()),
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato inválido para fechaInicio. Utilice YYYY-MM-DD')
        .nullable()
        .optional()
    ),
    fechaFin: z.preprocess(
      (v) => (v === '' || v === null || v === undefined ? null : String(v).trim()),
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato inválido para fechaFin. Utilice YYYY-MM-DD')
        .nullable()
        .optional()
    ),
    motivo: z.preprocess(
      (v) => (v === '' || v === null || v === undefined ? null : String(v).trim()),
      z.string().max(300, 'El motivo de la suplencia no puede exceder 300 caracteres.').nullable().optional()
    ),
  })
  .refine((data) => data.idSuplente !== data.idDocenteTitular, {
    message: 'El docente suplente no puede ser el mismo usuario que el docente titular.',
    path: ['idSuplente'],
  })
  .refine((data) => data.alcanceCompleto || (data.idMateria != null && data.idMateria > 0), {
    message: 'Debe seleccionar una materia específica o cubrir todas las materias del docente titular.',
    path: ['idMateria'],
  })
  .refine(
    (data) => !data.fechaInicio || !data.fechaFin || data.fechaInicio <= data.fechaFin,
    {
      message: 'La fecha de inicio de la suplencia no puede ser posterior a la fecha de fin.',
      path: ['fechaFin'],
    }
  );

export const updateSuplenciaSchema = z
  .object({
    idDocenteTitular: z.coerce.number().int().positive().optional(),
    alcanceCompleto: z.boolean().optional(),
    idDocenteMateria: z.preprocess(
      (v) => (v === '' || v === null || v === undefined || Number(v) === 0 ? null : Number(v)),
      z.number().int().positive().nullable().optional()
    ),
    idMateria: z.preprocess(
      (v) => (v === '' || v === null || v === undefined || Number(v) === 0 ? null : Number(v)),
      z.number().int().positive().nullable().optional()
    ),
    idSeccion: z.preprocess(
      (v) => (v === '' || v === null || v === undefined || Number(v) === 0 ? null : Number(v)),
      z.number().int().positive().nullable().optional()
    ),
    activo: z.boolean().optional(),
    fechaInicio: z.preprocess(
      (v) => (v === '' || v === null || v === undefined ? null : String(v).trim()),
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato inválido para fechaInicio. Utilice YYYY-MM-DD')
        .nullable()
        .optional()
    ),
    fechaFin: z.preprocess(
      (v) => (v === '' || v === null || v === undefined ? null : String(v).trim()),
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato inválido para fechaFin. Utilice YYYY-MM-DD')
        .nullable()
        .optional()
    ),
    motivo: z.preprocess(
      (v) => (v === '' || v === null || v === undefined ? null : String(v).trim()),
      z.string().max(300, 'El motivo de la suplencia no puede exceder 300 caracteres.').nullable().optional()
    ),
  })
  .refine(
    (data) => !(data.alcanceCompleto === false && data.idMateria === null),
    {
      message: 'Debe seleccionar una materia específica cuando desactiva la cobertura total del titular.',
      path: ['idMateria'],
    }
  )
  .refine(
    (data) => !data.fechaInicio || !data.fechaFin || data.fechaInicio <= data.fechaFin,
    {
      message: 'La fecha de inicio de la suplencia no puede ser posterior a la fecha de fin.',
      path: ['fechaFin'],
    }
  );

export const suplenciasQuerySchema = z.object({
  idSuplente: optionalPositiveIntQuery,
  idDocenteTitular: optionalPositiveIntQuery,
  idMateria: optionalPositiveIntQuery,
  idAno: optionalPositiveIntQuery,
  soloVigentes: z
    .preprocess(emptyToUndefined, z.enum(['true', 'false']).optional())
    .transform((v) => v === 'true'),
  fecha: optionalDateYmdQuery,
});

export const soloActivosQuerySchema = z.object({
  soloActivos: z
    .preprocess(emptyToUndefined, z.enum(['true', 'false']).optional())
    .transform((v) => v === 'true'),
});

export const lapsosQuerySchema = z.preprocess(
  (raw) => {
    if (!raw || typeof raw !== 'object') return {};
    const obj = raw as Record<string, unknown>;
    return {
      ...obj,
      anioEscolar: obj.anioEscolar ?? obj.anio_escolar,
    };
  },
  z.object({
    anioEscolar: z.preprocess(
      emptyToUndefined,
      z.string().trim().max(40, 'Año escolar demasiado largo').optional()
    ),
    soloActivos: z
      .preprocess(emptyToUndefined, z.enum(['true', 'false']).optional())
      .transform((v) => v === 'true'),
  })
);

export const idAnoOptionalQuerySchema = z.object({
  idAno: optionalPositiveIntQuery,
});

export const docenteMateriasQuerySchema = z.object({
  idUsuario: optionalPositiveIntQuery,
  idMateria: optionalPositiveIntQuery,
});

export const estudiantesQuerySchema = z.object({
  idAno: optionalPositiveIntQuery,
  idSeccion: optionalPositiveIntQuery,
  idRepresentante: optionalPositiveIntQuery,
});

export const horariosQuerySchema = z.object({
  idAno: optionalPositiveIntQuery,
  idSeccion: optionalPositiveIntQuery,
  diaSemana: z.preprocess(
    emptyToUndefined,
    z.enum(['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes']).optional()
  ),
  idMateria: optionalPositiveIntQuery,
  idDocente: optionalPositiveIntQuery,
});

export const notificacionesQuerySchema = z.object({
  unread: z
    .preprocess(emptyToUndefined, z.enum(['true', 'false']).optional())
    .transform((v) => v === 'true'),
  limit: z.preprocess(
    emptyToUndefined,
    z.coerce
      .number()
      .int('El límite de notificaciones debe ser entero')
      .min(1, 'El límite mínimo es 1')
      .max(100, 'El límite máximo permitido es 100')
      .default(60)
  ),
});

/**
 * Middleware de validación con Zod para req.body
 * Si el cuerpo no cumple con el esquema, devuelve 400 Bad Request estructurado
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err: any) {
      if (err instanceof ZodError) {
        const issues = err.issues.map((i) => ({
          field: i.path.join('.'),
          message: i.message,
        }));
        return res.status(400).json({
          error: issues[0]?.message || 'Validación de datos fallida',
          detalles: issues,
          mensaje: issues[0]?.message || 'Entrada inválida',
        });
      }
      return res.status(400).json({ error: 'Entrada con formato no permitido' });
    }
  };
}

/**
 * Middleware de validación con Zod para req.query
 * Previene valores negativos, límites excesivos e inyecciones de tipo en query params
 */
export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      res.locals.validatedQuery = schema.parse(req.query);
      next();
    } catch (err: any) {
      if (err instanceof ZodError) {
        const issues = err.issues.map((i) => ({
          field: i.path.join('.'),
          message: i.message,
        }));
        return res.status(400).json({
          error: issues[0]?.message || 'Parámetros de consulta inválidos',
          detalles: issues,
          mensaje: issues[0]?.message || 'Parámetros de consulta inválidos',
        });
      }
      return res.status(400).json({ error: 'Parámetros de consulta con formato no permitido' });
    }
  };
}
