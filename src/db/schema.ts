import { relations } from 'drizzle-orm';
import { boolean, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

// 0. Tabla de Auditoría Institucional y Trazabilidad (Audit Logs)
export const auditLogs = pgTable(
  'audit_logs',
  {
    idLog: serial('id_log').primaryKey(),
    idUsuario: integer('id_usuario'),
    emailOCedula: text('email_o_cedula'),
    rol: text('rol'),
    accion: text('accion').notNull(),
    entidad: text('entidad').notNull(),
    idEntidad: text('id_entidad'),
    ipOrigen: text('ip_origen'),
    userAgent: text('user_agent'),
    detalles: jsonb('detalles'),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => [
    index('audit_logs_created_at_idx').on(table.createdAt),
    index('audit_logs_accion_created_idx').on(table.accion, table.createdAt),
    index('audit_logs_entidad_created_idx').on(table.entidad, table.createdAt),
  ]
);

// 0. Tabla de usuarios autenticados del sistema con roles jerárquicos (Director, Coordinador, Docente)
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Identificador único de usuario local
  email: text('email').notNull(),
  nombre: text('nombre').notNull(),
  apellidos: text('apellidos').default('').notNull(),
  cedula: text('cedula'),
  telefono: text('telefono'),
  passwordHash: text('password_hash').default('docente123').notNull(),
  rol: text('rol').default('docente').notNull(), // 'director' | 'coordinador' | 'docente'
  createdAt: timestamp('created_at').defaultNow(),
});

// 0.1 Configuración Institucional Global (Año Lectivo, Nombre de la Institución)
export const configuracionInstitucional = pgTable('configuracion_institucional', {
  idConfig: serial('id_config').primaryKey(),
  clave: text('clave').notNull().unique(), // 'ano_lectivo', 'nombre_institucion'
  valor: text('valor').notNull(), // '2025 - 2026', 'Liceo Nacional Bolivariano Gran Mariscal de Ayacucho'
  descripcion: text('descripcion'),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 0.2 Recesos Institucionales (Bloques de descanso para toda la institución)
export const recesosInstitucionales = pgTable('recesos_institucionales', {
  idReceso: serial('id_receso').primaryKey(),
  nombre: text('nombre').notNull(), // 'Receso de la Mañana', 'Receso del Mediodía'
  horaInicio: text('hora_inicio').notNull(), // '09:15'
  horaFin: text('hora_fin').notNull(), // '09:45'
  activo: boolean('activo').default(true).notNull(),
  descripcion: text('descripcion'),
});

// 1. Anos_Escolares: id_ano (PK), nombre_nivel, activo
export const anosEscolares = pgTable('anos_escolares', {
  idAno: serial('id_ano').primaryKey(),
  nombreNivel: text('nombre_nivel').notNull(),
  activo: boolean('activo').default(true).notNull(),
});

// 1.1 Secciones: id_seccion (PK), id_ano (FK), nombre_seccion (ej: 'A', 'B')
export const secciones = pgTable('secciones', {
  idSeccion: serial('id_seccion').primaryKey(),
  idAno: integer('id_ano')
    .references(() => anosEscolares.idAno, { onDelete: 'cascade' })
    .notNull(),
  nombreSeccion: text('nombre_seccion').notNull(), // 'A', 'B', 'C', 'U'
});

// 2. Materias: id_materia (PK), id_ano (FK), nombre_materia
export const materias = pgTable('materias', {
  idMateria: serial('id_materia').primaryKey(),
  idAno: integer('id_ano')
    .references(() => anosEscolares.idAno, { onDelete: 'cascade' })
    .notNull(),
  nombreMateria: text('nombre_materia').notNull(),
});

// 2.1 Asignación Docente: docente_materias (id_asignacion [PK], id_usuario [FK], id_materia [FK])
export const docenteMaterias = pgTable(
  'docente_materias',
  {
    idAsignacion: serial('id_asignacion').primaryKey(),
    idUsuario: integer('id_usuario')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    idMateria: integer('id_materia')
      .references(() => materias.idMateria, { onDelete: 'cascade' })
      .notNull(),
  },
  (table) => [
    uniqueIndex('docente_materia_unique_idx').on(table.idUsuario, table.idMateria),
  ]
);

// 3. Representantes: id_representante (PK), cedula (UNIQUE), nombres, apellidos, telefono, email, password_hash
export const representantes = pgTable('representantes', {
  idRepresentante: serial('id_representante').primaryKey(),
  cedula: text('cedula').notNull().unique(),
  nombres: text('nombres').notNull(),
  apellidos: text('apellidos').notNull(),
  telefono: text('telefono'),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
});

// 4. Estudiantes: id_estudiante (PK), cedula (UNIQUE), nombres, apellidos, id_ano_actual (FK), id_seccion (FK), id_representante (FK)
export const estudiantes = pgTable('estudiantes', {
  idEstudiante: serial('id_estudiante').primaryKey(),
  cedula: text('cedula').notNull().unique(),
  nombres: text('nombres').notNull(),
  apellidos: text('apellidos').notNull(),
  idAnoActual: integer('id_ano_actual')
    .references(() => anosEscolares.idAno, { onDelete: 'cascade' })
    .notNull(),
  idSeccion: integer('id_seccion')
    .references(() => secciones.idSeccion, { onDelete: 'set null' }),
  idRepresentante: integer('id_representante')
    .references(() => representantes.idRepresentante, { onDelete: 'cascade' })
    .notNull(),
});

// 5. Asistencia: id_asistencia (PK), id_estudiante (FK), id_materia (FK), fecha, hora_entrada, estado ('Presente', 'Tarde', 'Ausente', 'Justificado', 'Reposo Médico') + campos de justificación/auditoría
export const asistencia = pgTable(
  'asistencia',
  {
    idAsistencia: serial('id_asistencia').primaryKey(),
    idEstudiante: integer('id_estudiante')
      .references(() => estudiantes.idEstudiante, { onDelete: 'cascade' })
      .notNull(),
    idMateria: integer('id_materia')
      .references(() => materias.idMateria, { onDelete: 'cascade' })
      .notNull(),
    fecha: text('fecha').notNull(), // Formato YYYY-MM-DD
    horaEntrada: text('hora_entrada').notNull(), // Formato HH:MM:SS
    estado: text('estado').notNull(), // 'Presente', 'Tarde', 'Ausente', 'Justificado', 'Reposo Médico'
    motivoJustificacion: text('motivo_justificacion'),
    numeroJustificante: text('numero_justificante'),
    fechaRecepcionDocumento: text('fecha_recepcion_documento'), // Formato YYYY-MM-DD
    modificadoPorId: integer('modificado_por_id'),
    modificadoPorNombre: text('modificado_por_nombre'),
    modificadoPorRol: text('modificado_por_rol'),
    fechaModificacion: timestamp('fecha_modificacion'),
  },
  (table) => [
    uniqueIndex('asistencia_estudiante_materia_fecha_idx').on(
      table.idEstudiante,
      table.idMateria,
      table.fecha
    ),
    index('asistencia_fecha_idx').on(table.fecha),
    index('asistencia_fecha_modificacion_idx').on(table.fechaModificacion),
    index('asistencia_estado_fecha_idx').on(table.estado, table.fecha),
  ]
);

// 6. Horarios Escolares: id_horario (PK), id_ano (FK), id_seccion (FK), id_materia (FK), dia_semana, hora_inicio, hora_fin, aula
export const horarios = pgTable(
  'horarios',
  {
    idHorario: serial('id_horario').primaryKey(),
    idAno: integer('id_ano')
      .references(() => anosEscolares.idAno, { onDelete: 'cascade' })
      .notNull(),
    idSeccion: integer('id_seccion')
      .references(() => secciones.idSeccion, { onDelete: 'cascade' })
      .notNull(),
    idMateria: integer('id_materia')
      .references(() => materias.idMateria, { onDelete: 'cascade' })
      .notNull(),
    diaSemana: text('dia_semana').notNull(), // 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'
    horaInicio: text('hora_inicio').notNull(), // '07:00'
    horaFin: text('hora_fin').notNull(), // '07:45'
    aula: text('aula'), // 'Aula 101', 'Lab de Ciencias'
  },
  (table) => [
    uniqueIndex('horario_seccion_bloque_unique_idx').on(
      table.idAno,
      table.idSeccion,
      table.diaSemana,
      table.horaInicio
    ),
  ]
);

// 8. Suscripciones Web Push de Representantes: push_subscriptions
export const pushSubscriptions = pgTable('push_subscriptions', {
  idSubscription: serial('id_subscription').primaryKey(),
  idRepresentante: integer('id_representante')
    .references(() => representantes.idRepresentante, { onDelete: 'cascade' })
    .notNull(),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  userAgent: text('user_agent'),
  activa: boolean('activa').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  lastUsed: timestamp('last_used'),
});

// Relaciones Drizzle
export const anosEscolaresRelations = relations(anosEscolares, ({ many }) => ({
  materias: many(materias),
  secciones: many(secciones),
  estudiantes: many(estudiantes),
  horarios: many(horarios),
}));

export const seccionesRelations = relations(secciones, ({ one, many }) => ({
  ano: one(anosEscolares, {
    fields: [secciones.idAno],
    references: [anosEscolares.idAno],
  }),
  estudiantes: many(estudiantes),
  horarios: many(horarios),
}));

export const materiasRelations = relations(materias, ({ one, many }) => ({
  ano: one(anosEscolares, {
    fields: [materias.idAno],
    references: [anosEscolares.idAno],
  }),
  asistencias: many(asistencia),
  docenteMaterias: many(docenteMaterias),
  horarios: many(horarios),
}));

export const usersRelations = relations(users, ({ many }) => ({
  docenteMaterias: many(docenteMaterias),
}));

export const docenteMateriasRelations = relations(docenteMaterias, ({ one }) => ({
  usuario: one(users, {
    fields: [docenteMaterias.idUsuario],
    references: [users.id],
  }),
  materia: one(materias, {
    fields: [docenteMaterias.idMateria],
    references: [materias.idMateria],
  }),
}));

export const representantesRelations = relations(representantes, ({ many }) => ({
  estudiantes: many(estudiantes),
  pushSubscriptions: many(pushSubscriptions),
}));

export const pushSubscriptionsRelations = relations(pushSubscriptions, ({ one }) => ({
  representante: one(representantes, {
    fields: [pushSubscriptions.idRepresentante],
    references: [representantes.idRepresentante],
  }),
}));

export const estudiantesRelations = relations(estudiantes, ({ one, many }) => ({
  anoActual: one(anosEscolares, {
    fields: [estudiantes.idAnoActual],
    references: [anosEscolares.idAno],
  }),
  seccion: one(secciones, {
    fields: [estudiantes.idSeccion],
    references: [secciones.idSeccion],
  }),
  representante: one(representantes, {
    fields: [estudiantes.idRepresentante],
    references: [representantes.idRepresentante],
  }),
  asistencias: many(asistencia),
}));

export const asistenciaRelations = relations(asistencia, ({ one }) => ({
  estudiante: one(estudiantes, {
    fields: [asistencia.idEstudiante],
    references: [estudiantes.idEstudiante],
  }),
  materia: one(materias, {
    fields: [asistencia.idMateria],
    references: [materias.idMateria],
  }),
}));

export const horariosRelations = relations(horarios, ({ one }) => ({
  ano: one(anosEscolares, {
    fields: [horarios.idAno],
    references: [anosEscolares.idAno],
  }),
  seccion: one(secciones, {
    fields: [horarios.idSeccion],
    references: [secciones.idSeccion],
  }),
  materia: one(materias, {
    fields: [horarios.idMateria],
    references: [materias.idMateria],
  }),
}));
