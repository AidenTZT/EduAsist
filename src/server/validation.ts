import type { Request, Response, NextFunction } from 'express';
import { z, ZodError, type ZodSchema } from 'zod';

// Regex estricto para validar nombres y apellidos venezolanos sin números
export const NAME_REGEX = /^[A-Za-zÁÉÍÓÚáéíóúÑñÄËÏÖÜäëïöü\s'-]+$/;

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
  rol: z.enum(['director', 'coordinador', 'docente']),
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
  rol: z.enum(['director', 'coordinador', 'docente']).optional(),
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
  idAno: z.coerce.number().positive(),
  idSeccion: z.coerce.number().positive(),
  idMateria: z.coerce.number().positive(),
  diaSemana: z.enum(['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes']),
  horaInicio: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM requerido para horaInicio'),
  horaFin: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM requerido para horaFin'),
  aula: z.string().trim().max(50).optional(),
  forceIgnoreConflict: z.boolean().optional(),
});

export const recesoSchema = z.object({
  nombre: z.string().trim().min(2, 'El nombre del receso es obligatorio'),
  horaInicio: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM requerido'),
  horaFin: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM requerido'),
  activo: z.boolean().optional(),
  descripcion: z.string().trim().optional().nullable(),
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

export function isSafePushEndpointUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(String(rawUrl || '').trim());
    if (parsed.protocol !== 'https:') return false;
    if (parsed.username || parsed.password) return false;
    const host = parsed.hostname.toLowerCase();
    if (!host || !host.includes('.')) return false;
    if (
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      host.endsWith('.arpa') ||
      host === 'metadata.google.internal'
    ) {
      return false;
    }
    // Bloquear literales IPv4 / IPv6 (todos los proveedores Web Push legítimos usan dominios públicos HTTPS)
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) {
      return false;
    }
    return true;
  } catch {
    return false;
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

const emptyToUndefined = (val: unknown) =>
  typeof val === 'string' && val.trim() === '' ? undefined : val;

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
    seccionOrigenId: z.preprocess(
      (v) => (v === '' || v === null || v === undefined || Number(v) === 0 ? null : Number(v)),
      z.number().int().positive().nullable().optional()
    ),
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
      if (!data.seccionOrigenId) return true;
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
