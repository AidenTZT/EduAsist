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

export interface Estudiante {
  idEstudiante: number;
  cedula: string;
  nombres: string;
  apellidos: string;
  idAnoActual: number;
  idSeccion?: number | null;
  idRepresentante: number;
  nombreNivel?: string;
  nombreSeccion?: string | null;
  representanteNombres?: string;
  representanteApellidos?: string;
  representanteCedula?: string;
  representanteTelefono?: string | null;
  representanteEmail?: string;
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
  estudiantes: Array<{
    idEstudiante: number;
    cedula: string;
    nombres: string;
    apellidos: string;
    idAnoActual: number;
    idSeccion?: number | null;
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
