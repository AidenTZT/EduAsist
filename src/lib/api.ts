import type {
  AnoEscolar,
  Seccion,
  Materia,
  DocenteMateria,
  Representante,
  Estudiante,
  Usuario,
  RegistroAsistencia,
  PortalRepresentanteData,
  EstadoAsistencia,
  RolUsuario,
  Horario,
  ConfiguracionInstitucional,
  RecesoInstitucional,
  SalidaInstitucional,
  ConflictoHorarioResult,
  AutoResolveResult,
  SlotSuggestion,
  AuditLog,
  AuthMeResponse,
  LoginResponse,
  PaginatedResponse,
  LapsoEscolar,
  InstitutionalConfigSummary,
  MilestonePushStatusResponse,
  DiaNoLaborable,
  VerificarDiaNoLaborableResult,
  PromocionMasivaPayload,
  PromocionMasivaResult,
  NotificacionRepresentante,
} from '../types.ts';

export type { InstitutionalConfigSummary, MilestonePushStatusResponse };

const AUTH_TOKEN_KEY = 'eduasist_auth_token';
const LEGACY_AUTH_TOKEN_KEY = 'educontrol_auth_token';

function getStoredToken(): string | null {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      return (
        window.sessionStorage.getItem(AUTH_TOKEN_KEY) ||
        window.sessionStorage.getItem(LEGACY_AUTH_TOKEN_KEY)
      );
    }
  } catch {
    // Ignorar en entornos con storage restringido
  }
  return null;
}

function setStoredToken(token: string | null): void {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
      if (token) {
        window.sessionStorage.setItem(AUTH_TOKEN_KEY, token);
      } else {
        window.sessionStorage.removeItem(AUTH_TOKEN_KEY);
      }
    }
  } catch {
    // Ignorar en entornos con storage restringido
  }
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(`/api${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (res.status === 401 && path !== '/auth/login') {
    setStoredToken(null);
  }

  const text = await res.text();
  let data: any = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }

  if (!res.ok) {
    const err = new Error(data?.error || data?.mensaje || `Error HTTP ${res.status}`) as Error & {
      status?: number;
      code?: string;
    };
    err.status = res.status;
    err.code = data?.code;
    throw err;
  }

  return data as T;
}

function buildQuery(params: Record<string, string | number | boolean | undefined | null>): string {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') {
      sp.set(k, String(v));
    }
  });
  const qs = sp.toString();
  return qs ? `?${qs}` : '';
}

// -------------------------------------------------------------
// 0. AUTENTICACIÓN LOCAL POR CREDENCIALES & AUDITORÍA
// -------------------------------------------------------------
export async function loginWithCredentials(
  usuario: string,
  password: string,
  preferredPortal?: 'staff' | 'representante'
): Promise<LoginResponse> {
  const res = await apiFetch<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      usuario: usuario.trim(),
      password,
      ...(preferredPortal ? { preferredPortal } : {}),
    }),
  });

  if (preferredPortal && res.type !== preferredPortal) {
    setStoredToken(null);
    const err = new Error(
      preferredPortal === 'staff'
        ? 'Las cuentas de representantes deben ingresar exclusivamente a través del Portal de Representantes.'
        : 'Las cuentas del personal institucional deben ingresar exclusivamente a través del Panel Institucional.'
    ) as Error & { status?: number; code?: string };
    err.status = 403;
    err.code = 'PORTAL_MISMATCH';
    throw err;
  }

  if (res.token) {
    setStoredToken(res.token);
  }

  return res;
}

export async function fetchAuthMe(): Promise<AuthMeResponse> {
  try {
    const res = await apiFetch<AuthMeResponse>('/auth/me');
    if (!res.authenticated) {
      setStoredToken(null);
    }
    return res;
  } catch {
    return { authenticated: false };
  }
}

export async function logoutSession(): Promise<void> {
  try {
    await apiFetch('/auth/logout', { method: 'POST' });
  } catch {
    // Continuar con la limpieza local incluso si la red falla
  } finally {
    setStoredToken(null);
  }
}

export async function fetchAuditLogs(filters?: {
  page?: number;
  limit?: number;
  accion?: string;
  entidad?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
}): Promise<PaginatedResponse<AuditLog>> {
  return apiFetch<PaginatedResponse<AuditLog>>(
    `/auditoria${buildQuery({
      page: filters?.page,
      limit: filters?.limit,
      accion: filters?.accion,
      entidad: filters?.entidad,
      search: filters?.search,
      startDate: filters?.startDate,
      endDate: filters?.endDate,
    })}`
  );
}

// -------------------------------------------------------------
// 1. CONFIGURACIÓN INSTITUCIONAL GLOBAL & RECESOS
// -------------------------------------------------------------
export async function fetchConfiguracion(): Promise<
  InstitutionalConfigSummary & { raw: ConfiguracionInstitucional[] }
> {
  return apiFetch('/configuracion');
}

export async function updateConfiguracion(
  clave: string,
  valor: string,
  descripcion?: string
): Promise<ConfiguracionInstitucional> {
  return apiFetch('/configuracion', {
    method: 'PUT',
    body: JSON.stringify({ clave, valor, descripcion }),
  });
}

export async function updateHorariosConfiguracion(data: {
  horaRecesoInicio: string;
  horaRecesoFin: string;
  horaSalida: string;
  alertaRecesoActiva: boolean;
  alertaSalidaActiva: boolean;
}): Promise<InstitutionalConfigSummary> {
  return apiFetch('/configuracion/horarios', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function fetchRecesos(soloActivos: boolean = false): Promise<RecesoInstitucional[]> {
  return apiFetch(`/recesos${buildQuery({ soloActivos: soloActivos ? 'true' : undefined })}`);
}

export async function createReceso(data: {
  nombre: string;
  horaInicio: string;
  horaFin: string;
  activo?: boolean;
  descripcion?: string;
}): Promise<RecesoInstitucional> {
  return apiFetch('/recesos', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateReceso(
  idReceso: number,
  data: Partial<RecesoInstitucional>
): Promise<RecesoInstitucional> {
  return apiFetch(`/recesos/${idReceso}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function toggleReceso(idReceso: number): Promise<RecesoInstitucional> {
  return apiFetch(`/recesos/${idReceso}/toggle`, { method: 'PATCH' });
}

export async function deleteReceso(idReceso: number): Promise<void> {
  await apiFetch(`/recesos/${idReceso}`, { method: 'DELETE' });
}

export async function fetchSalidas(soloActivos: boolean = false): Promise<SalidaInstitucional[]> {
  return apiFetch(`/salidas${buildQuery({ soloActivos: soloActivos ? 'true' : undefined })}`);
}

export async function createSalida(data: {
  nombre: string;
  horaSalida: string;
  idAno?: number | null;
  activo?: boolean;
  notificarPush?: boolean;
  descripcion?: string;
}): Promise<SalidaInstitucional> {
  return apiFetch('/salidas', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateSalida(
  idSalida: number,
  data: Partial<SalidaInstitucional>
): Promise<SalidaInstitucional> {
  return apiFetch(`/salidas/${idSalida}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function toggleSalida(idSalida: number): Promise<SalidaInstitucional> {
  return apiFetch(`/salidas/${idSalida}/toggle`, { method: 'PATCH' });
}

export async function deleteSalida(idSalida: number): Promise<void> {
  await apiFetch(`/salidas/${idSalida}`, { method: 'DELETE' });
}

export async function notifySalidaPush(idSalida: number): Promise<{
  success: boolean;
  queued?: boolean;
  sent: number;
  failed: number;
  totalDispositivos: number;
  totalRepresentantes: number;
  expiredRemoved: number;
  salida: SalidaInstitucional;
  mensaje: string;
}> {
  return apiFetch(`/salidas/${idSalida}/notificar`, { method: 'POST' });
}

// -------------------------------------------------------------
// 1.1 LAPSOS ESCOLARES (PERÍODOS ACADÉMICOS OFICIALES)
// -------------------------------------------------------------
export async function fetchLapsos(filters?: {
  anioEscolar?: string;
  soloActivos?: boolean;
}): Promise<LapsoEscolar[]> {
  return apiFetch(
    `/lapsos${buildQuery({
      anioEscolar: filters?.anioEscolar,
      soloActivos: filters?.soloActivos ? 'true' : undefined,
    })}`
  );
}

export async function fetchLapsoActivo(): Promise<{
  lapsoActivo: LapsoEscolar | null;
  lapsos: LapsoEscolar[];
}> {
  return apiFetch('/lapsos/activo');
}

export async function createLapso(data: {
  nombre: string;
  numeroLapso: 1 | 2 | 3;
  fechaInicio: string;
  fechaFin: string;
  anioEscolar: string;
  activo?: boolean;
}): Promise<LapsoEscolar> {
  return apiFetch('/lapsos', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateLapso(
  id: number,
  data: Partial<{
    nombre: string;
    numeroLapso: 1 | 2 | 3;
    fechaInicio: string;
    fechaFin: string;
    anioEscolar: string;
    activo: boolean;
  }>
): Promise<LapsoEscolar> {
  return apiFetch(`/lapsos/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function activateLapso(id: number, activo: boolean = true): Promise<LapsoEscolar> {
  return apiFetch(`/lapsos/${id}/activar`, {
    method: 'PATCH',
    body: JSON.stringify({ activo }),
  });
}

export async function deleteLapso(id: number): Promise<void> {
  await apiFetch(`/lapsos/${id}`, { method: 'DELETE' });
}

// -------------------------------------------------------------
// 2. PERSONAL INSTITUCIONAL (USERS)
// -------------------------------------------------------------
export async function fetchUsers(rol?: RolUsuario): Promise<Usuario[]> {
  return apiFetch(`/users${buildQuery({ rol })}`);
}

export async function createUser(data: {
  usuario?: string;
  email: string;
  nombre: string;
  apellidos: string;
  cedula?: string;
  telefono?: string;
  rol: RolUsuario;
  password?: string;
  activo?: boolean;
}): Promise<Usuario> {
  return apiFetch('/users', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateUser(
  id: number,
  data: Partial<Usuario> & { password?: string }
): Promise<Usuario> {
  return apiFetch(`/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteUser(id: number): Promise<void> {
  await apiFetch(`/users/${id}`, { method: 'DELETE' });
}

// -------------------------------------------------------------
// 3. AÑOS ESCOLARES, SECCIONES & MATERIAS
// -------------------------------------------------------------
export async function fetchAnosEscolares(): Promise<AnoEscolar[]> {
  return apiFetch('/anos');
}

export async function createAnoEscolar(nombreNivel: string, activo: boolean = true): Promise<AnoEscolar> {
  return apiFetch('/anos', {
    method: 'POST',
    body: JSON.stringify({ nombreNivel, activo }),
  });
}

export async function updateAnoEscolar(
  id: number,
  nombreNivel: string,
  activo?: boolean
): Promise<AnoEscolar> {
  return apiFetch(`/anos/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ nombreNivel, activo }),
  });
}

export async function deleteAnoEscolar(id: number): Promise<void> {
  await apiFetch(`/anos/${id}`, { method: 'DELETE' });
}

export async function fetchSecciones(idAno?: number): Promise<Seccion[]> {
  return apiFetch(`/secciones${buildQuery({ idAno })}`);
}

export async function createSeccion(idAno: number, nombreSeccion: string): Promise<Seccion> {
  return apiFetch('/secciones', {
    method: 'POST',
    body: JSON.stringify({ idAno, nombreSeccion }),
  });
}

export async function updateSeccion(id: number, nombreSeccion: string, idAno?: number): Promise<Seccion> {
  return apiFetch(`/secciones/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ nombreSeccion, idAno }),
  });
}

export async function deleteSeccion(id: number): Promise<void> {
  await apiFetch(`/secciones/${id}`, { method: 'DELETE' });
}

export async function fetchMaterias(idAno?: number): Promise<Materia[]> {
  return apiFetch(`/materias${buildQuery({ idAno })}`);
}

export async function createMateria(idAno: number, nombreMateria: string): Promise<Materia> {
  return apiFetch('/materias', {
    method: 'POST',
    body: JSON.stringify({ idAno, nombreMateria }),
  });
}

export async function updateMateria(id: number, nombreMateria: string, idAno?: number): Promise<Materia> {
  return apiFetch(`/materias/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ nombreMateria, idAno }),
  });
}

export async function deleteMateria(id: number): Promise<void> {
  await apiFetch(`/materias/${id}`, { method: 'DELETE' });
}

export async function fetchDocenteMaterias(
  idUsuario?: number,
  idMateria?: number
): Promise<DocenteMateria[]> {
  return apiFetch(`/docente-materias${buildQuery({ idUsuario, idMateria })}`);
}

export async function assignDocenteMateria(
  idUsuario: number,
  idMateria: number
): Promise<DocenteMateria> {
  return apiFetch('/docente-materias', {
    method: 'POST',
    body: JSON.stringify({ idUsuario, idMateria }),
  });
}

export async function assignDocenteMateriasBatch(
  idUsuario: number,
  idMaterias: number[]
): Promise<{ success: boolean; count: number; assignments: DocenteMateria[] }> {
  return apiFetch('/docente-materias/batch', {
    method: 'POST',
    body: JSON.stringify({ idUsuario, idMaterias }),
  });
}

export async function removeDocenteMateria(id: number): Promise<void> {
  await apiFetch(`/docente-materias/${id}`, { method: 'DELETE' });
}

// -------------------------------------------------------------
// 4. REPRESENTANTES & ESTUDIANTES
// -------------------------------------------------------------
export async function fetchRepresentantes(): Promise<Representante[]> {
  return apiFetch('/representantes');
}

export async function createRepresentante(data: {
  usuario?: string;
  cedula: string;
  nombres: string;
  apellidos: string;
  telefono?: string;
  email: string;
  password?: string;
  activo?: boolean;
}): Promise<Representante> {
  return apiFetch('/representantes', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateRepresentante(
  id: number,
  data: Partial<Representante> & {
    password?: string;
    currentPassword?: string;
    newPassword?: string;
  }
): Promise<Representante> {
  return apiFetch(`/representantes/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function updateRepresentanteCredenciales(
  id: number,
  data: { email?: string; usuario?: string | null; password?: string; activo?: boolean }
): Promise<{ success: boolean; message: string; representante: Representante }> {
  return apiFetch(`/representantes/${id}/credenciales`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteRepresentante(id: number): Promise<void> {
  await apiFetch(`/representantes/${id}`, { method: 'DELETE' });
}

export async function fetchEstudiantes(filters?: {
  idAno?: number;
  idSeccion?: number;
  idRepresentante?: number;
}): Promise<Estudiante[]> {
  return apiFetch(
    `/estudiantes${buildQuery({
      idAno: filters?.idAno,
      idSeccion: filters?.idSeccion,
      idRepresentante: filters?.idRepresentante,
    })}`
  );
}

export async function createEstudiante(data: {
  cedula: string;
  nombres: string;
  apellidos: string;
  idAnoActual: number;
  idSeccion?: number;
  idRepresentante: number;
}): Promise<Estudiante> {
  return apiFetch('/estudiantes', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateEstudiante(
  idEstudiante: number,
  data: Partial<Estudiante>
): Promise<Estudiante> {
  return apiFetch(`/estudiantes/${idEstudiante}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteEstudiante(idEstudiante: number): Promise<void> {
  await apiFetch(`/estudiantes/${idEstudiante}`, { method: 'DELETE' });
}

// -------------------------------------------------------------
// 5. ASISTENCIA
// -------------------------------------------------------------
export async function fetchAsistencia(filters?: {
  fecha?: string;
  mes?: string;
  estado?: EstadoAsistencia;
  idMateria?: number;
  idEstudiante?: number;
  idRepresentante?: number;
  idSeccion?: number;
  idAno?: number;
  lapsoId?: number;
}): Promise<RegistroAsistencia[]> {
  return apiFetch(
    `/asistencia${buildQuery({
      fecha: filters?.fecha,
      mes: filters?.mes,
      estado: filters?.estado,
      idMateria: filters?.idMateria,
      idEstudiante: filters?.idEstudiante,
      idRepresentante: filters?.idRepresentante,
      idSeccion: filters?.idSeccion,
      idAno: filters?.idAno,
      lapsoId: filters?.lapsoId,
    })}`
  );
}

export async function fetchAsistenciaGeneral(filters?: {
  page?: number;
  limit?: number;
  idAno?: number;
  idSeccion?: number;
  idMateria?: number;
  lapsoId?: number;
  fecha?: string;
  mes?: string;
  startDate?: string;
  endDate?: string;
  estado?: EstadoAsistencia;
  idEstudiante?: number;
  search?: string;
}): Promise<PaginatedResponse<RegistroAsistencia>> {
  return apiFetch<PaginatedResponse<RegistroAsistencia>>(
    `/asistencia/general${buildQuery({
      page: filters?.page,
      limit: filters?.limit,
      idAno: filters?.idAno,
      idSeccion: filters?.idSeccion,
      idMateria: filters?.idMateria,
      lapsoId: filters?.lapsoId,
      fecha: filters?.fecha,
      mes: filters?.mes,
      startDate: filters?.startDate,
      endDate: filters?.endDate,
      estado: filters?.estado,
      idEstudiante: filters?.idEstudiante,
      search: filters?.search,
    })}`
  );
}

export async function submitAsistenciaBatch(
  idMateria: number,
  fecha: string,
  records: Array<{ idEstudiante: number; estado: EstadoAsistencia; horaEntrada?: string }>
): Promise<{ success: boolean; count: number }> {
  return apiFetch('/asistencia/batch', {
    method: 'POST',
    body: JSON.stringify({ idMateria, fecha, records }),
  });
}

export async function updateAsistenciaJustificacion(
  idAsistencia: number,
  data: {
    estado: EstadoAsistencia;
    motivoJustificacion: string;
    numeroJustificante?: string | null;
    fechaRecepcionDocumento?: string | null;
  }
): Promise<{ success: boolean; mensaje: string; registro: RegistroAsistencia }> {
  return apiFetch(`/asistencia/${idAsistencia}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function fetchPortalRepresentante(
  idRepresentante: number
): Promise<PortalRepresentanteData> {
  return apiFetch(`/portal/representante/${idRepresentante}`);
}

// -------------------------------------------------------------
// 6. HORARIOS ESCOLARES & SISTEMA ANTICONFLICTOS
// -------------------------------------------------------------
export async function fetchHorarios(filters?: {
  idAno?: number;
  idSeccion?: number;
  diaSemana?: string;
  idMateria?: number;
  idDocente?: number;
}): Promise<Horario[]> {
  return apiFetch(
    `/horarios${buildQuery({
      idAno: filters?.idAno,
      idSeccion: filters?.idSeccion,
      diaSemana: filters?.diaSemana,
      idMateria: filters?.idMateria,
      idDocente: filters?.idDocente,
    })}`
  );
}

export async function validateHorarioConflict(data: {
  idHorario?: number;
  idAno: number;
  idSeccion: number;
  idMateria: number;
  diaSemana: string;
  horaInicio: string;
  horaFin: string;
  aula?: string;
}): Promise<ConflictoHorarioResult> {
  return apiFetch('/horarios/validate-conflict', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function createHorario(data: {
  idAno: number;
  idSeccion: number;
  idMateria: number;
  diaSemana: string;
  horaInicio: string;
  horaFin: string;
  aula?: string;
  forceIgnoreConflict?: boolean;
}): Promise<Horario> {
  return apiFetch('/horarios', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateHorario(
  idHorario: number,
  data: Partial<Horario> & { forceIgnoreConflict?: boolean }
): Promise<Horario> {
  return apiFetch(`/horarios/${idHorario}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteHorario(idHorario: number): Promise<void> {
  await apiFetch(`/horarios/${idHorario}`, { method: 'DELETE' });
}

export async function autoResolveHorarios(): Promise<AutoResolveResult> {
  return apiFetch('/horarios/auto-resolve', { method: 'POST' });
}

export async function fetchSuggestedSlots(data: {
  idAno: number;
  idSeccion: number;
  idMateria: number;
  aula?: string;
  idHorarioExcluir?: number;
}): Promise<SlotSuggestion[]> {
  return apiFetch('/horarios/suggest-slots', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// -------------------------------------------------------------
// 7. RESPALDO Y RESTAURACIÓN (ROL EXCLUSIVO: DIRECTOR)
// -------------------------------------------------------------
export async function fetchBackupStats() {
  return apiFetch<{
    anosEscolares: number;
    secciones: number;
    materias: number;
    estudiantes: number;
    representantes: number;
    asistencias: number;
    horarios: number;
    lapsosEscolares?: number;
    usuariosPersonal: number;
    logsAuditoria: number;
  }>('/backup/stats');
}

export async function exportDatabaseBackup(): Promise<any> {
  return apiFetch('/backup/export');
}

export async function restoreDatabaseBackup(backupData: any): Promise<{
  success: boolean;
  mensaje: string;
  tablasRestauradas: number;
}> {
  return apiFetch('/backup/restore', {
    method: 'POST',
    body: JSON.stringify(backupData),
  });
}

export async function resetDatabaseToMaster(): Promise<{
  success: boolean;
  mensaje: string;
}> {
  return apiFetch('/backup/reset', { method: 'POST' });
}

// -------------------------------------------------------------
// 8. NOTIFICACIONES WEB PUSH EN TIEMPO REAL
// -------------------------------------------------------------
export async function fetchVapidPublicKey(): Promise<{ publicKey: string }> {
  return apiFetch('/push/vapid-public-key');
}

export async function fetchPushStatus(): Promise<{ activeDevices: number }> {
  return apiFetch('/push/status');
}

export async function subscribeToPushNotifications(subscription: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}): Promise<{ success: boolean; idSubscription: number }> {
  return apiFetch('/push/subscribe', {
    method: 'POST',
    body: JSON.stringify(subscription),
  });
}

export async function unsubscribeFromPushNotifications(endpoint: string): Promise<{
  success: boolean;
  removed: boolean;
}> {
  return apiFetch('/push/unsubscribe', {
    method: 'POST',
    body: JSON.stringify({ endpoint }),
  });
}

export async function sendTestPushNotification(): Promise<{
  success: boolean;
  sent: number;
  failed: number;
  totalDevices: number;
  expiredRemoved: number;
  message: string;
}> {
  return apiFetch('/push/test', {
    method: 'POST',
  });
}

export async function fetchMilestonePushStatus(): Promise<MilestonePushStatusResponse> {
  return apiFetch('/push/milestones/status');
}

export async function triggerMilestonePush(data: {
  tipo: 'receso' | 'salida';
  mensajePersonalizado?: string;
}): Promise<{
  success: boolean;
  queued?: boolean;
  tipo: 'receso' | 'salida';
  trigger: 'auto' | 'manual';
  date: string;
  sentAt: string;
  sent: number;
  failed: number;
  targetRepresentantes: number;
  targetDevices: number;
  expiredRemoved: number;
  message: string;
}> {
  return apiFetch('/push/milestones/trigger', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// -------------------------------------------------------------
// 9. PROMOCIÓN MASIVA DE ESTUDIANTES
// -------------------------------------------------------------
export async function promoverEstudiantes(
  payload: PromocionMasivaPayload
): Promise<PromocionMasivaResult> {
  return apiFetch('/estudiantes/promover', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// -------------------------------------------------------------
// 10. CALENDARIO DE DÍAS NO LABORABLES Y FERIADOS
// -------------------------------------------------------------
export async function fetchDiasNoLaborables(): Promise<DiaNoLaborable[]> {
  return apiFetch('/calendario/no-laborables');
}

export async function createDiaNoLaborable(data: {
  fechaInicio: string;
  fechaFin: string;
  motivo: string;
  lapsoId?: number | null;
}): Promise<DiaNoLaborable> {
  return apiFetch('/calendario/no-laborables', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteDiaNoLaborable(id: number): Promise<{ success: boolean }> {
  return apiFetch(`/calendario/no-laborables/${id}`, {
    method: 'DELETE',
  });
}

export async function verificarDiaNoLaborable(
  fecha: string
): Promise<VerificarDiaNoLaborableResult> {
  return apiFetch(`/calendario/verificar${buildQuery({ fecha })}`);
}

// -------------------------------------------------------------
// 11. BANDEJA DE NOTIFICACIONES DEL REPRESENTANTE
// -------------------------------------------------------------
export async function fetchRepresentanteNotificaciones(
  idRepresentante: number,
  options?: { unread?: boolean; limit?: number }
): Promise<{ notificaciones: NotificacionRepresentante[]; unreadCount: number }> {
  return apiFetch(
    `/portal/representante/${idRepresentante}/notificaciones${buildQuery({
      unread: options?.unread ? 'true' : undefined,
      limit: options?.limit,
    })}`
  );
}

export async function markNotificacionLeida(
  idRepresentante: number,
  idNotificacion: number
): Promise<{ success: boolean; notificacion: NotificacionRepresentante }> {
  return apiFetch(
    `/portal/representante/${idRepresentante}/notificaciones/${idNotificacion}/leer`,
    { method: 'PATCH' }
  );
}

export async function markTodasNotificacionesLeidas(
  idRepresentante: number
): Promise<{ success: boolean; updatedCount: number }> {
  return apiFetch(`/portal/representante/${idRepresentante}/notificaciones/leer-todas`, {
    method: 'PATCH',
  });
}
