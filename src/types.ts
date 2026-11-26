export type EstadoAsistencia = 'Presente' | 'Tarde' | 'Ausente' | 'Justificado' | 'Reposo Médico';

export type RolUsuario = 'director' | 'coordinador' | 'docente';

export interface Usuario {
  id: number;
  uid: string;
  usuario?: string | null;
  email: string;
  nombre: string;
  apellidos: string;
  cedula?: string | null;
  telefono?: string | null;
  rol: RolUsuario;
  activo?: boolean;
  createdAt?: string | Date | null;
  materiasAsignadas?: Materia[];
}

export interface ConfiguracionInstitucional {
  idConfig: number;
  clave: string;
  valor: string;
  descripcion?: string | null;
  updatedAt?: string | Date | null;
}

export interface InstitutionalConfigSummary {
  anoLectivo: string;
  nombreInstitucion: string;
  horaRecesoInicio: string;
  horaRecesoFin: string;
  horaSalida: string;
  alertaRecesoActiva: boolean;
  alertaSalidaActiva: boolean;
  raw?: ConfiguracionInstitucional[];
}

export interface MilestoneDispatchRecord {
  date: string;
  tipo: 'receso' | 'salida';
  sentAt: string;
  sent: number;
  failed: number;
  targetReps: number;
  trigger: 'auto' | 'manual';
}

export interface MilestonePushStatusResponse {
  targetDevices: number;
  targetRepresentantes: number;
  serverSchoolTime: string;
  serverSchoolDate: string;
  timezone: string;
  recentHistory: MilestoneDispatchRecord[];
}

export interface RecesoInstitucional {
  idReceso: number;
  nombre: string;
  horaInicio: string;
  horaFin: string;
  activo: boolean;
  descripcion?: string | null;
}

export interface SalidaInstitucional {
  idSalida: number;
  nombre: string;
  horaSalida: string;
  idAno?: number | null;
  nombreNivel?: string | null;
  activo: boolean;
  notificarPush: boolean;
  descripcion?: string | null;
  ultimaNotificacionFecha?: string | null;
  ultimaNotificacionHora?: string | null;
}

export interface AnoEscolar {
  idAno: number;
  nombreNivel: string;
  activo: boolean;
  secciones?: Seccion[];
}

export interface LapsoEscolar {
  id: number;
  nombre: string; // ej. "Primer Lapso", "Segundo Lapso", "Tercer Lapso"
  numeroLapso: 1 | 2 | 3;
  fechaInicio: string; // YYYY-MM-DD
  fechaFin: string; // YYYY-MM-DD
  anioEscolar: string; // ej. "2025 - 2026"
  activo: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface Seccion {
  idSeccion: number;
  idAno: number;
  nombreSeccion: string;
  nombreNivel?: string;
  totalEstudiantes?: number;
}

export interface Materia {
  idMateria: number;
  idAno: number;
  nombreMateria: string;
  nombreNivel?: string;
  docenteAsignado?: {
    idUsuario: number;
    nombre: string;
    apellidos: string;
    email: string;
  } | null;
}

export interface DocenteMateria {
  idAsignacion: number;
  idUsuario: number;
  idMateria: number;
  usuarioNombre?: string;
  usuarioApellidos?: string;
  usuarioRol?: RolUsuario;
  nombreMateria?: string;
  nombreNivel?: string;
  idAno?: number;
}

export interface Horario {
  idHorario: number;
  idAno: number;
  idSeccion: number;
  idMateria: number;
  diaSemana: string; // 'Lunes' | 'Martes' | 'Miércoles' | 'Jueves' | 'Viernes'
  horaInicio: string; // '07:00'
  horaFin: string; // '08:30'
  aula?: string | null;
  nombreNivel?: string;
  nombreSeccion?: string;
  nombreMateria?: string;
  idDocente?: number | null;
  docenteNombre?: string;
  docenteApellidos?: string;
  nombreDocente?: string;
}

export interface ConflictoHorarioItem {
  type: 'docente' | 'aula' | 'seccion' | 'receso' | 'salida';
  message: string;
  details?: {
    profesor?: string;
    aula?: string;
    seccion?: string;
    materia?: string;
    horarioExistente?: string;
  };
}

export interface ConflictoHorarioResult {
  hasConflict: boolean;
  conflicts: ConflictoHorarioItem[];
}

export interface Representante {
  idRepresentante: number;
  usuario?: string | null;
  cedula: string;
  nombres: string;
  apellidos: string;
  telefono?: string | null;
  email: string;
  activo?: boolean;
}

export type EstadoAcademicoEstudiante = 'ACTIVO' | 'EGRESADO' | 'RETIRADO';

export interface Estudiante {
  idEstudiante: number;
  cedula: string;
  nombres: string;
  apellidos: string;
  idAnoActual: number | null;
  idSeccion?: number | null;
  idRepresentante: number;
  estadoAcademico?: EstadoAcademicoEstudiante;
  nombreNivel?: string;
  nombreSeccion?: string | null;
  representanteNombres?: string;
  representanteApellidos?: string;
  representanteCedula?: string;
  representanteTelefono?: string | null;
  representanteEmail?: string;
}

export interface DiaNoLaborable {
  id: number;
  fechaInicio: string; // YYYY-MM-DD
  fechaFin: string; // YYYY-MM-DD
  motivo: string;
  lapsoId?: number | null;
  lapsoNombre?: string | null;
  createdAt?: string | null;
}

export interface VerificarDiaNoLaborableResult {
  fecha: string;
  esNoLaborable: boolean;
  esFinDeSemana: boolean;
  motivo: string | null;
  registro?: DiaNoLaborable | null;
}

export interface PromocionMasivaPayload {
  anioOrigenId: number;
  seccionOrigenId: number;
  anioDestinoId: number | 'EGRESADO';
  seccionDestinoId?: number | null;
  estudiantesIds: number[];
  confirmarDoble?: boolean;
}

export interface PromocionMasivaResult {
  success: boolean;
  promovidosCount: number;
  estadoDestino: EstadoAcademicoEstudiante;
  destinoLabel: string;
  estudiantesPromovidos: number[];
  cicloLectivo: string;
  anioOrigenNombre: string;
  seccionOrigenNombre: string;
  advertenciasAplicadas?: string[];
  message: string;
}

export interface PromocionCicloAuditItem {
  idLog: number;
  fecha: string;
  cicloLectivo: string;
  anioOrigenId: number;
  anioOrigenNombre: string;
  seccionOrigenId: number | null;
  seccionOrigenNombre: string | null;
  anioDestinoId: number | 'EGRESADO';
  seccionDestinoId: number | null;
  destinoLabel: string;
  promovidosCount: number;
  usuario: string;
  confirmarDoble?: boolean;
}

export interface EstadoPromocionesCicloResponse {
  cicloActual: string;
  promociones: PromocionCicloAuditItem[];
  origenesPromovidosKeys: string[];
  destinosConPromocionesAnos: number[];
  destinosConPromocionesKeys: string[];
}

export interface RegistroAsistencia {
  idAsistencia: number;
  idEstudiante: number;
  idMateria: number;
  lapsoId?: number | null;
  lapsoNombre?: string | null;
  numeroLapso?: number | null;
  fecha: string;
  horaEntrada: string;
  estado: EstadoAsistencia;
  motivoJustificacion?: string | null;
  numeroJustificante?: string | null;
  fechaRecepcionDocumento?: string | null;
  modificadoPorId?: number | null;
  modificadoPorNombre?: string | null;
  modificadoPorRol?: RolUsuario | null;
  fechaModificacion?: string | null;
  estudianteCedula?: string;
  estudianteNombres?: string;
  estudianteApellidos?: string;
  nombreMateria?: string;
  nombreNivel?: string;
  nombreSeccion?: string | null;
  idRepresentante?: number;
}

export type TipoNotificacionRepresentante = 'asistencia' | 'justificacion' | 'receso' | 'salida';

export interface NotificacionRepresentante {
  idNotificacion: number;
  idRepresentante: number;
  tipo: TipoNotificacionRepresentante;
  titulo: string;
  mensaje: string;
  fechaEvento: string;
  horaEvento: string;
  leida: boolean;
  leidaAt?: string | null;
  createdAt: string;
  metadata?: {
    idEstudiante?: number;
    estudianteNombre?: string;
    idMateria?: number;
    nombreMateria?: string;
    estado?: EstadoAsistencia;
    idSalida?: number;
    nombreSalida?: string;
    alcance?: string;
  };
}

export interface PortalRepresentanteData {
  representante: Representante;
  configuracion: {
    anoLectivo: string;
    nombreInstitucion: string;
  };
  lapsos?: LapsoEscolar[];
  lapsoActivo?: LapsoEscolar | null;
  recesos: RecesoInstitucional[];
  salidas?: SalidaInstitucional[];
  notificaciones?: NotificacionRepresentante[];
  notificacionesNoLeidas?: number;
  estudiantes: Array<{
    idEstudiante: number;
    cedula: string;
    nombres: string;
    apellidos: string;
    idAnoActual: number | null;
    idSeccion?: number | null;
    estadoAcademico?: EstadoAcademicoEstudiante;
    nombreNivel: string;
    nombreSeccion?: string | null;
    horarios?: Horario[];
  }>;
  asistencias: Array<{
    idAsistencia: number;
    idEstudiante: number;
    lapsoId?: number | null;
    lapsoNombre?: string | null;
    numeroLapso?: number | null;
    fecha: string;
    horaEntrada: string;
    estado: EstadoAsistencia;
    nombreMateria: string;
    motivoJustificacion?: string | null;
    numeroJustificante?: string | null;
    fechaRecepcionDocumento?: string | null;
    modificadoPorNombre?: string | null;
    fechaModificacion?: string | null;
  }>;
}

export interface AutoResolveResult {
  success: boolean;
  totalBlocks: number;
  initialConflicts: number;
  finalConflicts: number;
  message: string;
}

export interface SlotSuggestion {
  diaSemana: string;
  horaInicio: string;
  horaFin: string;
  aula: string;
  bloqueTexto: string;
}

export interface AuditLog {
  idLog: number;
  idUsuario?: number | null;
  emailOCedula?: string | null;
  rol?: string | null;
  accion: string;
  entidad: string;
  idEntidad?: string | null;
  ipOrigen?: string | null;
  userAgent?: string | null;
  detalles?: Record<string, any> | string | null;
  createdAt: string;
}

export interface AuthTokenPayload {
  userId: number;
  emailOrCedula: string;
  rol?: RolUsuario | 'representante';
  type: 'staff' | 'representante';
  iat?: number;
  exp?: number;
}

export interface AuthMeResponse {
  authenticated: boolean;
  type?: 'staff' | 'representante';
  redirectPortal?: 'staff' | 'representante';
  user?: Usuario;
  representante?: Representante;
}

export interface LoginResponse {
  authenticated: boolean;
  type: 'staff' | 'representante';
  redirectPortal: 'staff' | 'representante';
  token?: string;
  user?: Usuario;
  representante?: Representante;
  mensaje?: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface AttendanceSummaryStats {
  total: number;
  presentes: number;
  tardes: number;
  ausentes: number;
  justificadosYReposos: number;
  porcentajeAsistencia: number;
  diasHabiles?: number;
  diasNoLaborablesExcluidos?: number;
}

export interface LapsoBreakdownStats extends AttendanceSummaryStats {
  lapsoId: number | null;
  nombre: string;
  numeroLapso: number | null;
  fechaInicio?: string;
  fechaFin?: string;
  anioEscolar?: string;
  activo?: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
  summary?: AttendanceSummaryStats;
  lapsoBreakdown?: LapsoBreakdownStats[];
  lapsoFiltro?: LapsoEscolar | null;
}

export interface ResumenAsistenciaConsolidado {
  idResumen: number;
  estudianteId: number;
  estudianteCedula?: string;
  estudianteNombre?: string;
  estadoAcademico?: EstadoAcademicoEstudiante;
  anioEscolarId: number | null;
  nombreNivel?: string;
  anioLectivo: string;
  lapsoId: number | null;
  lapsoNombre?: string | null;
  totalRegistros: number;
  presentes: number;
  ausentes: number;
  tardes: number;
  justificados: number;
  reposoMedico: number;
  porcentajeAsistencia: number;
  fechaCompactacion: string;
}

export interface CierreAnioEscolarRequest {
  anioLectivo?: string;
  lapsoIds?: number[];
  incluirInactivosAniosAnteriores?: boolean;
  incluirLapsosCerrados?: boolean;
  nuevoAnoLectivo?: string;
  dryRun?: boolean;
  confirmado?: boolean;
}

export interface CierreAnioEscolarMetricas {
  anoLectivoActivoActual: string;
  anoLectivoActivoDespues: string;
  totalAsistenciasAntes: number;
  asistenciasACompactar: number;
  asistenciasADepurar: number;
  asistenciasConservadas: number;
  resumenesGeneradosCount: number;
  resumenesNuevosCount: number;
  resumenesActualizadosCount: number;
  estudiantesAfectadosCount: number;
  estudiantesInactivosAfectadosCount: number;
  lapsosAfectadosCount: number;
}

export interface CierreAnioEscolarSnapshot {
  metadata: {
    sistema: string;
    tipo: 'CIERRE_ANIO_LECTIVO_Y_COMPACTACION';
    fechaGeneracion: string;
    generadoPor: { id?: number; email?: string; rol?: string };
    parametros: {
      anioLectivoObjetivo?: string | null;
      lapsoIds?: number[];
      incluirInactivosAniosAnteriores: boolean;
      incluirLapsosCerrados: boolean;
      nuevoAnoLectivo?: string | null;
    };
    anoLectivoActivoAntes: string;
    anoLectivoActivoDespues: string;
    conteos: {
      estudiantesInvolucrados: number;
      lapsosInvolucrados: number;
      materiasInvolucradas?: number;
      seccionesInvolucradas?: number;
      resumenesGenerados: number;
      asistenciasRespaldadas: number;
    };
  };
  data: {
    estudiantesInvolucrados: Estudiante[];
    lapsosInvolucrados: LapsoEscolar[];
    anosEscolares?: AnoEscolar[];
    seccionesInvolucradas?: Seccion[];
    materiasInvolucradas?: Materia[];
    resumenesGenerados: ResumenAsistenciaConsolidado[];
    asistenciasRespaldadas: RegistroAsistencia[];
  };
}

export interface RespaldoCierreArchivoMeta {
  filename: string;
  sizeBytes: number;
  createdAt: string;
}

export interface CierreAnioEscolarResponse {
  success: boolean;
  dryRun: boolean;
  mensaje: string;
  metricas: CierreAnioEscolarMetricas;
  anosDisponibles: string[];
  lapsosDisponibles: LapsoEscolar[];
  resumenesGenerados: ResumenAsistenciaConsolidado[];
  respaldoSnapshot?: CierreAnioEscolarSnapshot | null;
  respaldoArchivoId?: string | null;
}

export interface LimpiezaAntiguosRequest {
  diasRetencionPush?: number;
  diasRetencionLogs?: number;
  limpiarPush?: boolean;
  limpiarLogs?: boolean;
  dryRun?: boolean;
  confirmado?: boolean;
}

export interface LimpiezaAntiguosResponse {
  success: boolean;
  dryRun: boolean;
  diasRetencionPush: number;
  diasRetencionLogs: number;
  pushTotalAntes: number;
  pushEliminadas: number;
  pushConservadas: number;
  logsTotalAntes: number;
  logsEliminados: number;
  logsConservados: number;
  desgloseLogsPorAccion: Record<string, number>;
  mensaje: string;
}

