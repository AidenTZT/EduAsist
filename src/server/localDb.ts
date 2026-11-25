import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { assertNoNumbersInName } from '../lib/validation.ts';
import { getLocalTodayDateString } from '../lib/utils.ts';
import type {
  AnoEscolar,
  LapsoEscolar,
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
  ConflictoHorarioItem,
  AutoResolveResult,
  SlotSuggestion,
  AuditLog,
  PaginatedResponse,
  LapsoBreakdownStats,
  InstitutionalConfigSummary,
  MilestoneDispatchRecord,
  DiaNoLaborable,
  VerificarDiaNoLaborableResult,
  PromocionMasivaPayload,
  PromocionMasivaResult,
  NotificacionRepresentante,
  TipoNotificacionRepresentante,
} from '../types.ts';

// ---------------------------------------------------------------------------
// Persistencia Atómica en Archivo JSON Local (Server-Side Repository)
// ---------------------------------------------------------------------------
const DB_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DB_DIR, 'eduasist-db.json');
const LEGACY_DB_FILE = path.join(DB_DIR, 'educontrol-db.json');
const SEED_BACKUP_FILE = path.resolve(
  process.cwd(),
  'public/assets/aistudio/backup_educontrol_2026-11-07_1794081780485_32e75f23.json'
);

export interface StoredUser extends Usuario {
  passwordHash: string;
}

export interface StoredRepresentante extends Representante {
  passwordHash: string;
}

export interface PushSubscriptionRecord {
  idSubscription: number;
  idRepresentante: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
  activa: boolean;
  createdAt: string;
  lastUsed?: string | null;
}

export interface DatabaseState {
  configuracionInstitucional: ConfiguracionInstitucional[];
  recesosInstitucionales: RecesoInstitucional[];
  salidasInstitucionales: SalidaInstitucional[];
  lapsosEscolares: LapsoEscolar[];
  anosEscolares: AnoEscolar[];
  secciones: Seccion[];
  materias: Materia[];
  docenteMaterias: DocenteMateria[];
  representantes: StoredRepresentante[];
  estudiantes: Estudiante[];
  asistencia: RegistroAsistencia[];
  horarios: Horario[];
  users: StoredUser[];
  auditLogs: AuditLog[];
  pushSubscriptions: PushSubscriptionRecord[];
  milestoneDispatches: MilestoneDispatchRecord[];
  diasNoLaborables: DiaNoLaborable[];
  notificacionesRepresentante: NotificacionRepresentante[];
}

let cachedDb: DatabaseState | null = null;
let initPromise: Promise<DatabaseState> | null = null;
let writeQueue: Promise<unknown> = Promise.resolve();

function isBcryptHash(val: unknown): val is string {
  return (
    typeof val === 'string' &&
    (val.startsWith('$2a$') || val.startsWith('$2b$') || val.startsWith('$2y$')) &&
    val.length >= 50
  );
}

function normalizeEmail(email: string): string {
  return String(email || '').trim().toLowerCase();
}

function numericCedulaValue(cedula: string): number {
  const digits = String(cedula || '').replace(/\D/g, '');
  return digits ? Number(digits) : Number.MAX_SAFE_INTEGER;
}

function timeToMinutes(hhmm: string): number {
  const [h, m] = String(hhmm || '00:00').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function timeOverlaps(s1: string, e1: string, s2: string, e2: string): boolean {
  return timeToMinutes(s1) < timeToMinutes(e2) && timeToMinutes(s2) < timeToMinutes(e1);
}

function nextNumericId<T>(items: T[], getId: (item: T) => number): number {
  let maxId = 0;
  for (const item of items) {
    const val = Number(getId(item) || 0);
    if (val > maxId) maxId = val;
  }
  return maxId + 1;
}

export function sanitizeUser(u: StoredUser): Usuario {
  const { passwordHash: _ignored, ...safe } = u;
  return {
    ...safe,
    usuario: safe.usuario ?? null,
    activo: typeof safe.activo === 'boolean' ? safe.activo : true,
  };
}

export function sanitizeRepresentante(r: StoredRepresentante): Representante {
  const { passwordHash: _ignored, ...safe } = r;
  return {
    ...safe,
    usuario: safe.usuario ?? null,
    activo: typeof safe.activo === 'boolean' ? safe.activo : true,
  };
}

function isMasterAdminUser(u: Pick<Usuario, 'nombre' | 'email' | 'cedula' | 'usuario'>): boolean {
  const nombreLower = (u.nombre || '').trim().toLowerCase();
  const emailLower = (u.email || '').trim().toLowerCase();
  const cedulaLower = (u.cedula || '').trim().toLowerCase();
  const usuarioLower = (u.usuario || '').trim().toLowerCase();
  return (
    nombreLower === 'admin' ||
    usuarioLower === 'admin' ||
    emailLower === 'admin@eduasist.edu' ||
    emailLower === 'admin@educontrol.edu' ||
    emailLower === 'adrian0424344@gmail.com' ||
    cedulaLower === 'admin'
  );
}

async function normalizeAndEnsureIntegrity(raw: Partial<DatabaseState>): Promise<DatabaseState> {
  const state: DatabaseState = {
    configuracionInstitucional: Array.isArray(raw.configuracionInstitucional)
      ? raw.configuracionInstitucional.filter((c) => c.clave !== 'lapso_activo')
      : [],
    recesosInstitucionales: Array.isArray(raw.recesosInstitucionales) ? raw.recesosInstitucionales : [],
    salidasInstitucionales: Array.isArray(raw.salidasInstitucionales)
      ? raw.salidasInstitucionales.map((s, idx) => ({
          idSalida: Number(s.idSalida) || idx + 1,
          nombre: String(s.nombre || 'Hora de Salida Oficial').trim(),
          horaSalida: String(s.horaSalida || '12:00').trim().slice(0, 5),
          idAno: s.idAno != null && Number(s.idAno) > 0 ? Number(s.idAno) : null,
          activo: typeof s.activo === 'boolean' ? s.activo : true,
          notificarPush: typeof s.notificarPush === 'boolean' ? s.notificarPush : true,
          descripcion: s.descripcion ? String(s.descripcion).trim() : null,
          ultimaNotificacionFecha: s.ultimaNotificacionFecha ? String(s.ultimaNotificacionFecha).trim() : null,
          ultimaNotificacionHora: s.ultimaNotificacionHora ? String(s.ultimaNotificacionHora).trim() : null,
        }))
      : [],
    lapsosEscolares: Array.isArray(raw.lapsosEscolares) ? raw.lapsosEscolares : [],
    anosEscolares: Array.isArray(raw.anosEscolares) ? raw.anosEscolares : [],
    secciones: Array.isArray(raw.secciones) ? raw.secciones : [],
    materias: Array.isArray(raw.materias) ? raw.materias : [],
    docenteMaterias: Array.isArray(raw.docenteMaterias) ? raw.docenteMaterias : [],
    representantes: Array.isArray(raw.representantes) ? (raw.representantes as StoredRepresentante[]) : [],
    estudiantes: Array.isArray(raw.estudiantes)
      ? raw.estudiantes.map((e) => ({
          ...e,
          idAnoActual: e.idAnoActual != null ? Number(e.idAnoActual) : null,
          idSeccion: e.idSeccion != null ? Number(e.idSeccion) : null,
          estadoAcademico: e.estadoAcademico === 'EGRESADO' ? 'EGRESADO' : 'ACTIVO',
        }))
      : [],
    asistencia: Array.isArray(raw.asistencia) ? raw.asistencia : [],
    horarios: Array.isArray(raw.horarios) ? raw.horarios : [],
    users: Array.isArray(raw.users) ? (raw.users as StoredUser[]) : [],
    auditLogs: Array.isArray(raw.auditLogs) ? raw.auditLogs : [],
    pushSubscriptions: Array.isArray(raw.pushSubscriptions) ? raw.pushSubscriptions : [],
    milestoneDispatches: Array.isArray(raw.milestoneDispatches) ? raw.milestoneDispatches : [],
    diasNoLaborables: Array.isArray(raw.diasNoLaborables)
      ? raw.diasNoLaborables.map((d, idx) => ({
          id: Number(d.id) || idx + 1,
          fechaInicio: String(d.fechaInicio || '').trim(),
          fechaFin: String(d.fechaFin || d.fechaInicio || '').trim(),
          motivo: String(d.motivo || 'Día No Laborable').trim(),
          lapsoId: d.lapsoId != null && Number(d.lapsoId) > 0 ? Number(d.lapsoId) : null,
          createdAt: d.createdAt || new Date().toISOString(),
        }))
      : [],
    notificacionesRepresentante: Array.isArray(raw.notificacionesRepresentante)
      ? raw.notificacionesRepresentante.map((n, idx) => ({
          idNotificacion: Number(n.idNotificacion) || idx + 1,
          idRepresentante: Number(n.idRepresentante),
          tipo: (['asistencia', 'justificacion', 'receso', 'salida'].includes(String(n.tipo))
            ? n.tipo
            : 'asistencia') as TipoNotificacionRepresentante,
          titulo: String(n.titulo || 'Notificación Escolar'),
          mensaje: String(n.mensaje || ''),
          fechaEvento: String(n.fechaEvento || ''),
          horaEvento: String(n.horaEvento || ''),
          leida: Boolean(n.leida),
          leidaAt: n.leidaAt ?? null,
          createdAt: n.createdAt || new Date().toISOString(),
          metadata: n.metadata,
        }))
      : [],
  };

  // Garantizar hashes bcrypt y campos usuario/activo en personal institucional
  for (let i = 0; i < state.users.length; i++) {
    const u = state.users[i];
    const rawHash: unknown = u.passwordHash;
    let hash: string;
    if (isBcryptHash(rawHash)) {
      hash = rawHash;
    } else {
      const plain =
        typeof rawHash === 'string' && rawHash.trim().length > 0
          ? rawHash.trim()
          : u.rol === 'director' || u.rol === 'coordinador'
          ? 'admin1234'
          : 'docente123';
      hash = await bcrypt.hash(plain, 10);
    }
    let normalizedUserEmail = normalizeEmail(u.email);
    if (normalizedUserEmail.endsWith('@educontrol.edu')) {
      const migratedEmail = normalizedUserEmail.replace(/@educontrol\.edu$/, '@eduasist.edu');
      const alreadyExists = state.users.some(
        (other, idx) => idx !== i && normalizeEmail(other.email) === migratedEmail
      );
      if (!alreadyExists) {
        normalizedUserEmail = migratedEmail;
      }
    }
    const defaultUsuario =
      u.usuario && String(u.usuario).trim()
        ? String(u.usuario).trim()
        : normalizedUserEmail === 'admin@eduasist.edu' || normalizedUserEmail === 'admin@educontrol.edu'
        ? 'admin'
        : null;
    state.users[i] = {
      ...u,
      email: normalizedUserEmail,
      usuario: defaultUsuario,
      activo: typeof u.activo === 'boolean' ? u.activo : true,
      passwordHash: hash,
    };
  }

  // Garantizar usuario maestro admin@eduasist.edu si faltase
  const hasAdmin = state.users.some(
    (u) => u.email === 'admin@eduasist.edu' || u.email === 'admin@educontrol.edu' || u.usuario?.toLowerCase() === 'admin'
  );
  if (!hasAdmin) {
    const adminHash = await bcrypt.hash('admin1234', 10);
    state.users.push({
      id: nextNumericId(state.users, (u) => u.id),
      uid: 'usr_admin_master',
      usuario: 'admin',
      email: 'admin@eduasist.edu',
      nombre: 'Admin',
      apellidos: 'Principal',
      cedula: 'admin',
      telefono: '0414-0000000',
      rol: 'director',
      activo: true,
      passwordHash: adminHash,
      createdAt: new Date().toISOString(),
    });
  }

  // Garantizar hashes bcrypt y campos usuario/activo en representantes
  let cachedDefaultRepHash: string | null = null;
  for (let i = 0; i < state.representantes.length; i++) {
    const r = state.representantes[i];
    const rawHash: unknown = r.passwordHash;
    let hash: string;
    if (isBcryptHash(rawHash)) {
      hash = rawHash;
    } else if (typeof rawHash === 'string' && rawHash.trim().length > 0) {
      hash = await bcrypt.hash(rawHash.trim(), 10);
    } else {
      if (!cachedDefaultRepHash) {
        cachedDefaultRepHash = await bcrypt.hash('rep123', 10);
      }
      hash = cachedDefaultRepHash;
    }
    state.representantes[i] = {
      ...r,
      email: normalizeEmail(r.email),
      usuario: r.usuario && String(r.usuario).trim() ? String(r.usuario).trim() : null,
      activo: typeof r.activo === 'boolean' ? r.activo : true,
      passwordHash: hash,
    };
  }

  // Garantizar configuración institucional básica si está vacía
  if (state.configuracionInstitucional.length === 0) {
    const nowIso = new Date().toISOString();
    state.configuracionInstitucional = [
      { idConfig: 1, clave: 'ano_lectivo', valor: '2025 - 2026', descripcion: 'Año lectivo escolar', updatedAt: nowIso },
      { idConfig: 2, clave: 'nombre_institucion', valor: 'Liceo Nacional Bolivariano Gran Mariscal de Ayacucho', descripcion: 'Nombre oficial del plantel', updatedAt: nowIso },
      { idConfig: 3, clave: 'codigo_plantel', valor: 'S0424D0101', descripcion: 'Código DEA oficial', updatedAt: nowIso },
    ];
  }

  // Garantizar configuración inicial de los 3 lapsos escolares oficiales si está vacía
  const anoLectivoConfig =
    state.configuracionInstitucional.find((c) => c.clave === 'ano_lectivo')?.valor || '2025 - 2026';

  if (state.lapsosEscolares.length === 0) {
    const nowIso = new Date().toISOString();
    const today = getLocalTodayDateString();
    // Determinar año base a partir de las asistencias existentes o fecha actual (ciclo Septiembre - Julio)
    const latestAsistDate = state.asistencia.reduce(
      (max, a) => (a.fecha > max ? a.fecha : max),
      ''
    );
    const refDate = latestAsistDate || today;
    const refYear = Number(refDate.slice(0, 4)) || 2026;
    const refMonth = Number(refDate.slice(5, 7)) || 9;
    const startYear = refMonth >= 8 ? refYear : refYear - 1;
    const endYear = startYear + 1;

    const defaults: LapsoEscolar[] = [
      {
        id: 1,
        nombre: 'Primer Lapso',
        numeroLapso: 1,
        fechaInicio: `${startYear}-09-14`,
        fechaFin: `${startYear}-12-18`,
        anioEscolar: anoLectivoConfig,
        activo: false,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        id: 2,
        nombre: 'Segundo Lapso',
        numeroLapso: 2,
        fechaInicio: `${endYear}-01-07`,
        fechaFin: `${endYear}-03-27`,
        anioEscolar: anoLectivoConfig,
        activo: false,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        id: 3,
        nombre: 'Tercer Lapso',
        numeroLapso: 3,
        fechaInicio: `${endYear}-04-06`,
        fechaFin: `${endYear}-07-17`,
        anioEscolar: anoLectivoConfig,
        activo: false,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
    ];

    const matchingToday = defaults.find((l) => l.fechaInicio <= today && today <= l.fechaFin);
    if (matchingToday) {
      matchingToday.activo = true;
    } else {
      defaults[0].activo = true;
    }
    state.lapsosEscolares = defaults;
  } else {
    state.lapsosEscolares = state.lapsosEscolares.map((l, index) => ({
      id: Number(l.id) || index + 1,
      nombre: String(l.nombre || `Lapso ${l.numeroLapso || index + 1}`).trim(),
      numeroLapso: ([1, 2, 3].includes(Number(l.numeroLapso)) ? Number(l.numeroLapso) : 1) as 1 | 2 | 3,
      fechaInicio: String(l.fechaInicio).trim(),
      fechaFin: String(l.fechaFin).trim(),
      anioEscolar: String(l.anioEscolar || anoLectivoConfig).trim(),
      activo: Boolean(l.activo),
      createdAt: l.createdAt || new Date().toISOString(),
      updatedAt: l.updatedAt || new Date().toISOString(),
    }));
  }

  // Vincular cada registro de asistencia con su lapso_id correspondiente según su fecha
  syncAsistenciaLapsoIds(state);

  return state;
}

function findLapsoByDate(lapsos: LapsoEscolar[], fecha: string): LapsoEscolar | null {
  if (!fecha || lapsos.length === 0) return null;
  const activeMatches = lapsos.filter((l) => l.activo && l.fechaInicio <= fecha && fecha <= l.fechaFin);
  if (activeMatches.length > 0) return activeMatches[0];
  const anyMatches = lapsos
    .filter((l) => l.fechaInicio <= fecha && fecha <= l.fechaFin)
    .sort((a, b) => a.numeroLapso - b.numeroLapso);
  return anyMatches[0] || null;
}

function syncAsistenciaLapsoIds(state: DatabaseState): void {
  const validLapsoIds = new Set(state.lapsosEscolares.map((l) => l.id));
  for (let i = 0; i < state.asistencia.length; i++) {
    const rec = state.asistencia[i];
    const matched = findLapsoByDate(state.lapsosEscolares, rec.fecha);
    if (matched) {
      rec.lapsoId = matched.id;
    } else if (rec.lapsoId != null && !validLapsoIds.has(rec.lapsoId)) {
      rec.lapsoId = null;
    } else if (rec.lapsoId === undefined) {
      rec.lapsoId = null;
    }
  }
}

async function persistDbAtomic(state: DatabaseState): Promise<void> {
  await fs.promises.mkdir(DB_DIR, { recursive: true });
  const tmpFile = path.join(DB_DIR, `eduasist-db.${process.pid}.${Date.now()}.tmp`);
  await fs.promises.writeFile(tmpFile, JSON.stringify(state, null, 2), 'utf-8');
  await fs.promises.rename(tmpFile, DB_FILE);
}

async function loadOrInitializeDb(): Promise<DatabaseState> {
  if (cachedDb) return cachedDb;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      if (fs.existsSync(DB_FILE)) {
        const rawText = await fs.promises.readFile(DB_FILE, 'utf-8');
        const parsed = JSON.parse(rawText) as Partial<DatabaseState>;
        cachedDb = await normalizeAndEnsureIntegrity(parsed);
        return cachedDb;
      }
      if (fs.existsSync(LEGACY_DB_FILE)) {
        const legacyText = await fs.promises.readFile(LEGACY_DB_FILE, 'utf-8');
        const parsed = JSON.parse(legacyText) as Partial<DatabaseState>;
        cachedDb = await normalizeAndEnsureIntegrity(parsed);
        await persistDbAtomic(cachedDb);
        return cachedDb;
      }
    } catch (err) {
      console.warn('[LocalDB] Archivo de base de datos ilegible, reconstruyendo desde semilla:', err);
    }

    let seedData: Partial<DatabaseState> = {};
    try {
      if (fs.existsSync(SEED_BACKUP_FILE)) {
        const seedText = await fs.promises.readFile(SEED_BACKUP_FILE, 'utf-8');
        const seedJson = JSON.parse(seedText);
        if (seedJson?.data) {
          seedData = seedJson.data;
        }
      }
    } catch (err) {
      console.error('[LocalDB] No se pudo leer el archivo semilla JSON:', err);
    }

    cachedDb = await normalizeAndEnsureIntegrity(seedData);
    await persistDbAtomic(cachedDb);
    console.log(
      `[LocalDB] Base de datos inicializada en ${DB_FILE} (${cachedDb.users.length} personal, ${cachedDb.representantes.length} representantes, ${cachedDb.estudiantes.length} estudiantes).`
    );
    return cachedDb;
  })().finally(() => {
    initPromise = null;
  });

  return initPromise;
}

async function withWriteLock<T>(fn: (db: DatabaseState) => Promise<T> | T): Promise<T> {
  const run = async () => {
    const db = await loadOrInitializeDb();
    const result = await fn(db);
    await persistDbAtomic(db);
    return result;
  };
  const next = writeQueue.then(run, run);
  writeQueue = next.catch(() => {});
  return next;
}

async function readDb(): Promise<DatabaseState> {
  return loadOrInitializeDb();
}

// ---------------------------------------------------------------------------
// 0. AUTENTICACIÓN LOCAL POR CREDENCIALES (BCRYPT + ROLES + ACTIVO)
// ---------------------------------------------------------------------------
export type AuthAttemptResult =
  | {
      ok: true;
      type: 'staff';
      redirectPortal: 'staff';
      user: Usuario;
    }
  | {
      ok: true;
      type: 'representante';
      redirectPortal: 'representante';
      representante: Representante;
    }
  | {
      ok: false;
      code: 'INVALID_CREDENTIALS' | 'USER_INACTIVE' | 'PORTAL_MISMATCH';
      error: string;
    };

function matchesUserIdentifier(u: StoredUser, identLower: string, identDigits: string): boolean {
  const emailMatch = (u.email || '').trim().toLowerCase() === identLower;
  const usuarioMatch = !!u.usuario && u.usuario.trim().toLowerCase() === identLower;
  const cedulaClean = (u.cedula || '').trim().toLowerCase();
  const cedulaMatch = !!cedulaClean && cedulaClean === identLower;
  const cedulaDigits = (u.cedula || '').replace(/\D/g, '');
  const digitsMatch = !!identDigits && !!cedulaDigits && cedulaDigits === identDigits;
  return emailMatch || usuarioMatch || cedulaMatch || digitsMatch;
}

function matchesRepIdentifier(r: StoredRepresentante, identLower: string, identDigits: string): boolean {
  const emailMatch = (r.email || '').trim().toLowerCase() === identLower;
  const usuarioMatch = !!r.usuario && r.usuario.trim().toLowerCase() === identLower;
  const cedulaClean = (r.cedula || '').trim().toLowerCase();
  const cedulaMatch = !!cedulaClean && cedulaClean === identLower;
  const cedulaDigits = (r.cedula || '').replace(/\D/g, '');
  const digitsMatch = !!identDigits && !!cedulaDigits && cedulaDigits === identDigits;
  return emailMatch || usuarioMatch || cedulaMatch || digitsMatch;
}

export async function authenticateCredentials(
  identifier: string,
  passwordPlain: string,
  preferredPortal?: 'staff' | 'representante'
): Promise<AuthAttemptResult> {
  const db = await readDb();
  const identLower = String(identifier || '').trim().toLowerCase();
  const identDigits = String(identifier || '').replace(/\D/g, '');

  if (!identLower || !passwordPlain) {
    return {
      ok: false,
      code: 'INVALID_CREDENTIALS',
      error: 'Debe ingresar su usuario/correo y contraseña.',
    };
  }

  const checkStaff = async (): Promise<AuthAttemptResult | null> => {
    const candidates = db.users.filter((u) => matchesUserIdentifier(u, identLower, identDigits));
    for (const candidate of candidates) {
      if (!isBcryptHash(candidate.passwordHash)) continue;
      const validPassword = await bcrypt.compare(passwordPlain, candidate.passwordHash);
      if (validPassword) {
        if (candidate.activo === false) {
          return {
            ok: false,
            code: 'USER_INACTIVE',
            error: 'Esta cuenta institucional se encuentra inactiva. Contacte a la Dirección del plantel.',
          };
        }
        return {
          ok: true,
          type: 'staff',
          redirectPortal: 'staff',
          user: sanitizeUser(candidate),
        };
      }
    }
    return null;
  };

  const checkRep = async (): Promise<AuthAttemptResult | null> => {
    const candidates = db.representantes.filter((r) => matchesRepIdentifier(r, identLower, identDigits));
    for (const candidate of candidates) {
      if (!isBcryptHash(candidate.passwordHash)) continue;
      const validPassword = await bcrypt.compare(passwordPlain, candidate.passwordHash);
      if (validPassword) {
        if (candidate.activo === false) {
          return {
            ok: false,
            code: 'USER_INACTIVE',
            error: 'Esta cuenta de representante se encuentra inactiva. Contacte al Coordinador o Director.',
          };
        }
        return {
          ok: true,
          type: 'representante',
          redirectPortal: 'representante',
          representante: sanitizeRepresentante(candidate),
        };
      }
    }
    return null;
  };

  // Separación estricta de portales:
  // - Panel Institucional ('staff'): solo permite usuarios de la tabla `users` (Director, Coordinador, Docente).
  // - Portal de Representantes ('representante'): solo permite usuarios de la tabla `representantes`.
  if (preferredPortal === 'staff') {
    const staffRes = await checkStaff();
    if (staffRes) {
      return staffRes;
    }

    const repRes = await checkRep();
    if (repRes) {
      return {
        ok: false,
        code: 'PORTAL_MISMATCH',
        error: 'Las cuentas de representantes deben ingresar exclusivamente a través del Portal de Representantes.',
      };
    }

    return {
      ok: false,
      code: 'INVALID_CREDENTIALS',
      error: 'Usuario o contraseña incorrectos. Verifique sus credenciales e intente nuevamente.',
    };
  }

  if (preferredPortal === 'representante') {
    const repRes = await checkRep();
    if (repRes) {
      return repRes;
    }

    const staffRes = await checkStaff();
    if (staffRes) {
      return {
        ok: false,
        code: 'PORTAL_MISMATCH',
        error: 'Las cuentas del personal institucional deben ingresar exclusivamente a través del Panel Institucional.',
      };
    }

    return {
      ok: false,
      code: 'INVALID_CREDENTIALS',
      error: 'Usuario o contraseña incorrectos. Verifique sus credenciales e intente nuevamente.',
    };
  }

  // Sin portal especificado: mantener compatibilidad ordenada
  let inactiveHit: AuthAttemptResult | null = null;
  for (const fn of [checkStaff, checkRep]) {
    const res = await fn();
    if (res) {
      if (res.ok) return res;
      if (res.code === 'USER_INACTIVE' && !inactiveHit) {
        inactiveHit = res;
      }
    }
  }

  if (inactiveHit) {
    return inactiveHit;
  }

  return {
    ok: false,
    code: 'INVALID_CREDENTIALS',
    error: 'Usuario o contraseña incorrectos. Verifique sus credenciales e intente nuevamente.',
  };
}

// ---------------------------------------------------------------------------
// 1. USUARIOS DEL PERSONAL (USERS)
// ---------------------------------------------------------------------------
export async function getUserById(id: number): Promise<Usuario | null> {
  const db = await readDb();
  const found = db.users.find((u) => u.id === Number(id));
  return found ? sanitizeUser(found) : null;
}

export async function getUserByEmailOrCedula(emailOrCedula: string): Promise<Usuario | null> {
  const db = await readDb();
  const identLower = String(emailOrCedula || '').trim().toLowerCase();
  const identDigits = String(emailOrCedula || '').replace(/\D/g, '');
  const altIdent = identLower.endsWith('@educontrol.edu')
    ? identLower.replace(/@educontrol\.edu$/, '@eduasist.edu')
    : identLower;
  const found = db.users.find(
    (u) => matchesUserIdentifier(u, identLower, identDigits) || (altIdent !== identLower && matchesUserIdentifier(u, altIdent, identDigits))
  );
  return found ? sanitizeUser(found) : null;
}

export async function getUsers(rol?: RolUsuario): Promise<Usuario[]> {
  const db = await readDb();
  let list = db.users.map(sanitizeUser);
  if (rol) {
    list = list.filter((u) => u.rol === rol);
  }
  return list.sort((a, b) => a.id - b.id);
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
  assertNoNumbersInName(data.nombre, 'Nombre');
  assertNoNumbersInName(data.apellidos, 'Apellidos');

  return withWriteLock(async (db) => {
    const emailNorm = normalizeEmail(data.email);
    const usuarioClean = data.usuario?.trim() || null;

    if (db.users.some((u) => u.email.toLowerCase() === emailNorm)) {
      throw new Error(`Ya existe un miembro del personal registrado con el correo ${emailNorm}.`);
    }
    if (
      usuarioClean &&
      db.users.some((u) => u.usuario && u.usuario.toLowerCase() === usuarioClean.toLowerCase())
    ) {
      throw new Error(`El nombre de usuario "${usuarioClean}" ya está en uso.`);
    }

    const plainPass =
      data.password && data.password.trim().length > 0
        ? data.password.trim()
        : data.rol === 'director' || data.rol === 'coordinador'
        ? 'admin1234'
        : 'docente123';
    const passwordHash = await bcrypt.hash(plainPass, 10);

    const newUser: StoredUser = {
      id: nextNumericId(db.users, (u) => u.id),
      uid: `usr_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      usuario: usuarioClean,
      email: emailNorm,
      nombre: data.nombre.trim(),
      apellidos: data.apellidos.trim(),
      cedula: data.cedula?.trim() || null,
      telefono: data.telefono?.trim() || null,
      rol: data.rol,
      activo: typeof data.activo === 'boolean' ? data.activo : true,
      passwordHash,
      createdAt: new Date().toISOString(),
    };

    db.users.push(newUser);
    return sanitizeUser(newUser);
  });
}

export async function updateUser(
  id: number,
  data: {
    usuario?: string | null;
    email?: string;
    nombre?: string;
    apellidos?: string;
    cedula?: string | null;
    telefono?: string | null;
    rol?: RolUsuario;
    password?: string;
    activo?: boolean;
  }
): Promise<Usuario> {
  if (data.nombre) assertNoNumbersInName(data.nombre, 'Nombre');
  if (data.apellidos) assertNoNumbersInName(data.apellidos, 'Apellidos');

  return withWriteLock(async (db) => {
    const idx = db.users.findIndex((u) => u.id === Number(id));
    if (idx === -1) throw new Error('Usuario no encontrado.');

    const target = db.users[idx];
    const activeOtherDirectors = db.users.filter(
      (u) => u.rol === 'director' && u.activo !== false && u.id !== target.id
    ).length;

    if (isMasterAdminUser(target) && activeOtherDirectors === 0) {
      throw new Error(
        'Operación denegada: El usuario maestro Admin solo puede ser editado si existe al menos otro Director activo en la institución.'
      );
    }

    if (
      target.rol === 'director' &&
      activeOtherDirectors === 0 &&
      ((data.rol && data.rol !== 'director') || data.activo === false)
    ) {
      throw new Error(
        'Operación denegada: No puede degradar ni desactivar al único Director activo en la institución.'
      );
    }

    const nextEmail = data.email ? normalizeEmail(data.email) : target.email;
    if (nextEmail !== target.email && db.users.some((u) => u.id !== target.id && u.email.toLowerCase() === nextEmail)) {
      throw new Error(`El correo ${nextEmail} ya pertenece a otro usuario del personal.`);
    }

    const nextUsuario =
      data.usuario !== undefined
        ? (data.usuario && data.usuario.trim() ? data.usuario.trim() : null)
        : target.usuario ?? null;

    if (
      nextUsuario &&
      db.users.some(
        (u) => u.id !== target.id && u.usuario && u.usuario.toLowerCase() === nextUsuario.toLowerCase()
      )
    ) {
      throw new Error(`El nombre de usuario "${nextUsuario}" ya está en uso.`);
    }

    let nextHash = target.passwordHash;
    if (data.password && data.password.trim().length > 0) {
      nextHash = await bcrypt.hash(data.password.trim(), 10);
    }

    const updated: StoredUser = {
      ...target,
      usuario: nextUsuario,
      email: nextEmail,
      nombre: data.nombre ? data.nombre.trim() : target.nombre,
      apellidos: data.apellidos ? data.apellidos.trim() : target.apellidos,
      cedula: data.cedula !== undefined ? (data.cedula?.trim() || null) : target.cedula,
      telefono: data.telefono !== undefined ? (data.telefono?.trim() || null) : target.telefono,
      rol: data.rol || target.rol,
      activo: data.activo !== undefined ? Boolean(data.activo) : target.activo,
      passwordHash: nextHash,
    };

    db.users[idx] = updated;
    return sanitizeUser(updated);
  });
}

export async function deleteUser(id: number): Promise<void> {
  return withWriteLock((db) => {
    const idx = db.users.findIndex((u) => u.id === Number(id));
    if (idx === -1) throw new Error('Usuario no encontrado.');

    const target = db.users[idx];
    const activeOtherDirectors = db.users.filter(
      (u) => u.rol === 'director' && u.activo !== false && u.id !== target.id
    ).length;

    if (isMasterAdminUser(target) && activeOtherDirectors === 0) {
      throw new Error(
        'Operación denegada: El usuario maestro Admin solo puede ser eliminado si existe al menos otro Director activo en la institución.'
      );
    }
    if (target.rol === 'director' && activeOtherDirectors === 0) {
      throw new Error(
        'Operación denegada: No se puede eliminar al único Director activo en la institución.'
      );
    }

    db.users.splice(idx, 1);
    db.docenteMaterias = db.docenteMaterias.filter((dm) => dm.idUsuario !== Number(id));
  });
}

// ---------------------------------------------------------------------------
// 2. CONFIGURACIÓN & RECESOS
// ---------------------------------------------------------------------------
function buildConfiguracionSummary(
  db: DatabaseState
): InstitutionalConfigSummary & { raw: ConfiguracionInstitucional[] } {
  const raw = [...db.configuracionInstitucional]
    .filter((c) => c.clave !== 'lapso_activo')
    .sort((a, b) => a.idConfig - b.idConfig);
  const findVal = (clave: string, fallback: string) =>
    raw.find((c) => c.clave === clave)?.valor || fallback;
  const findBool = (clave: string, fallback: boolean) => {
    const entry = raw.find((c) => c.clave === clave);
    if (!entry) return fallback;
    return entry.valor !== 'false' && entry.valor !== '0';
  };
  return {
    anoLectivo: findVal('ano_lectivo', '2025 - 2026'),
    nombreInstitucion: findVal(
      'nombre_institucion',
      'Liceo Nacional Bolivariano Gran Mariscal de Ayacucho'
    ),
    horaRecesoInicio: findVal('hora_receso_inicio', '09:15').slice(0, 5),
    horaRecesoFin: findVal('hora_receso_fin', '09:45').slice(0, 5),
    horaSalida: findVal('hora_salida', '13:00').slice(0, 5),
    alertaRecesoActiva: findBool('alerta_receso_activa', true),
    alertaSalidaActiva: findBool('alerta_salida_activa', true),
    raw,
  };
}

export async function getConfiguracion(): Promise<
  InstitutionalConfigSummary & { raw: ConfiguracionInstitucional[] }
> {
  const db = await readDb();
  return buildConfiguracionSummary(db);
}

function upsertConfigEntry(
  db: DatabaseState,
  clave: string,
  valor: string,
  descripcion?: string
): ConfiguracionInstitucional {
  const cleanKey = clave.trim();
  const nowIso = new Date().toISOString();
  const idx = db.configuracionInstitucional.findIndex((c) => c.clave === cleanKey);
  if (idx !== -1) {
    db.configuracionInstitucional[idx] = {
      ...db.configuracionInstitucional[idx],
      valor: String(valor).trim(),
      ...(descripcion !== undefined ? { descripcion } : {}),
      updatedAt: nowIso,
    };
    return db.configuracionInstitucional[idx];
  }
  const created: ConfiguracionInstitucional = {
    idConfig: nextNumericId(db.configuracionInstitucional, (c) => c.idConfig),
    clave: cleanKey,
    valor: String(valor).trim(),
    descripcion: descripcion || null,
    updatedAt: nowIso,
  };
  db.configuracionInstitucional.push(created);
  return created;
}

export async function setConfiguracion(
  clave: string,
  valor: string,
  descripcion?: string
): Promise<ConfiguracionInstitucional> {
  return withWriteLock((db) => upsertConfigEntry(db, clave, valor, descripcion));
}

export async function updateHorariosConfiguracion(data: {
  horaRecesoInicio: string;
  horaRecesoFin: string;
  horaSalida: string;
  alertaRecesoActiva: boolean;
  alertaSalidaActiva: boolean;
}): Promise<InstitutionalConfigSummary> {
  return withWriteLock((db) => {
    upsertConfigEntry(
      db,
      'hora_receso_inicio',
      data.horaRecesoInicio.slice(0, 5),
      'Hora de inicio del receso escolar institucional'
    );
    upsertConfigEntry(
      db,
      'hora_receso_fin',
      data.horaRecesoFin.slice(0, 5),
      'Hora de finalización del receso escolar institucional'
    );
    upsertConfigEntry(
      db,
      'hora_salida',
      data.horaSalida.slice(0, 5),
      'Hora oficial de salida institucional'
    );
    upsertConfigEntry(
      db,
      'alerta_receso_activa',
      String(Boolean(data.alertaRecesoActiva)),
      'Activar notificación push automática de receso'
    );
    upsertConfigEntry(
      db,
      'alerta_salida_activa',
      String(Boolean(data.alertaSalidaActiva)),
      'Activar notificación push automática de salida'
    );
    return buildConfiguracionSummary(db);
  });
}

export async function getRecesos(soloActivos: boolean = false): Promise<RecesoInstitucional[]> {
  const db = await readDb();
  let list = [...db.recesosInstitucionales];
  if (soloActivos) {
    list = list.filter((r) => r.activo);
  }
  return list.sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));
}

export async function createReceso(data: {
  nombre: string;
  horaInicio: string;
  horaFin: string;
  activo?: boolean;
  descripcion?: string | null;
}): Promise<RecesoInstitucional> {
  return withWriteLock((db) => {
    const nuevo: RecesoInstitucional = {
      idReceso: nextNumericId(db.recesosInstitucionales, (r) => r.idReceso),
      nombre: data.nombre.trim(),
      horaInicio: data.horaInicio.trim(),
      horaFin: data.horaFin.trim(),
      activo: data.activo !== undefined ? Boolean(data.activo) : true,
      descripcion: data.descripcion?.trim() || null,
    };
    db.recesosInstitucionales.push(nuevo);
    return nuevo;
  });
}

export async function updateReceso(
  idReceso: number,
  data: Partial<RecesoInstitucional>
): Promise<RecesoInstitucional> {
  return withWriteLock((db) => {
    const idx = db.recesosInstitucionales.findIndex((r) => r.idReceso === Number(idReceso));
    if (idx === -1) throw new Error('Receso no encontrado.');
    const updated: RecesoInstitucional = {
      ...db.recesosInstitucionales[idx],
      ...(data.nombre !== undefined ? { nombre: data.nombre.trim() } : {}),
      ...(data.horaInicio !== undefined ? { horaInicio: data.horaInicio.trim() } : {}),
      ...(data.horaFin !== undefined ? { horaFin: data.horaFin.trim() } : {}),
      ...(data.activo !== undefined ? { activo: Boolean(data.activo) } : {}),
      ...(data.descripcion !== undefined ? { descripcion: data.descripcion } : {}),
    };
    db.recesosInstitucionales[idx] = updated;
    return updated;
  });
}

export async function toggleReceso(idReceso: number): Promise<RecesoInstitucional> {
  return withWriteLock((db) => {
    const idx = db.recesosInstitucionales.findIndex((r) => r.idReceso === Number(idReceso));
    if (idx === -1) throw new Error('Receso no encontrado.');
    db.recesosInstitucionales[idx] = {
      ...db.recesosInstitucionales[idx],
      activo: !db.recesosInstitucionales[idx].activo,
    };
    return db.recesosInstitucionales[idx];
  });
}

export async function deleteReceso(idReceso: number): Promise<void> {
  return withWriteLock((db) => {
    db.recesosInstitucionales = db.recesosInstitucionales.filter((r) => r.idReceso !== Number(idReceso));
  });
}

// ---------------------------------------------------------------------------
// 2.0.1 HORA DE SALIDA INSTITUCIONAL
// ---------------------------------------------------------------------------
export async function getSalidas(soloActivos: boolean = false): Promise<SalidaInstitucional[]> {
  const db = await readDb();
  const anoMap = new Map(db.anosEscolares.map((a) => [a.idAno, a.nombreNivel]));
  let list = db.salidasInstitucionales.map((s) => ({
    ...s,
    idAno: s.idAno != null && Number(s.idAno) > 0 ? Number(s.idAno) : null,
    nombreNivel: s.idAno ? anoMap.get(Number(s.idAno)) || 'Año Escolar' : 'Toda la institución',
  }));
  if (soloActivos) {
    list = list.filter((s) => s.activo);
  }
  return list.sort((a, b) => a.horaSalida.localeCompare(b.horaSalida));
}

export async function createSalida(data: {
  nombre: string;
  horaSalida: string;
  idAno?: number | null;
  activo?: boolean;
  notificarPush?: boolean;
  descripcion?: string | null;
}): Promise<SalidaInstitucional> {
  return withWriteLock((db) => {
    const cleanIdAno = data.idAno && Number(data.idAno) > 0 ? Number(data.idAno) : null;
    if (cleanIdAno && !db.anosEscolares.some((a) => a.idAno === cleanIdAno)) {
      throw new Error('El Año Escolar seleccionado no existe.');
    }
    const nueva: SalidaInstitucional = {
      idSalida: nextNumericId(db.salidasInstitucionales, (s) => s.idSalida),
      nombre: data.nombre.trim(),
      horaSalida: data.horaSalida.trim().slice(0, 5),
      idAno: cleanIdAno,
      activo: data.activo !== undefined ? Boolean(data.activo) : true,
      notificarPush: data.notificarPush !== undefined ? Boolean(data.notificarPush) : true,
      descripcion: data.descripcion?.trim() || null,
      ultimaNotificacionFecha: null,
      ultimaNotificacionHora: null,
    };
    db.salidasInstitucionales.push(nueva);
    const anoName = cleanIdAno
      ? db.anosEscolares.find((a) => a.idAno === cleanIdAno)?.nombreNivel || 'Año Escolar'
      : 'Toda la institución';
    return { ...nueva, nombreNivel: anoName };
  });
}

export async function updateSalida(
  idSalida: number,
  data: Partial<SalidaInstitucional>
): Promise<SalidaInstitucional> {
  return withWriteLock((db) => {
    const idx = db.salidasInstitucionales.findIndex((s) => s.idSalida === Number(idSalida));
    if (idx === -1) throw new Error('Configuración de hora de salida no encontrada.');
    const curr = db.salidasInstitucionales[idx];
    let nextIdAno = curr.idAno ?? null;
    if (data.idAno !== undefined) {
      nextIdAno = data.idAno && Number(data.idAno) > 0 ? Number(data.idAno) : null;
      if (nextIdAno && !db.anosEscolares.some((a) => a.idAno === nextIdAno)) {
        throw new Error('El Año Escolar seleccionado no existe.');
      }
    }
    const updated: SalidaInstitucional = {
      ...curr,
      ...(data.nombre !== undefined ? { nombre: data.nombre.trim() } : {}),
      ...(data.horaSalida !== undefined ? { horaSalida: data.horaSalida.trim().slice(0, 5) } : {}),
      idAno: nextIdAno,
      ...(data.activo !== undefined ? { activo: Boolean(data.activo) } : {}),
      ...(data.notificarPush !== undefined ? { notificarPush: Boolean(data.notificarPush) } : {}),
      ...(data.descripcion !== undefined ? { descripcion: data.descripcion?.trim() || null } : {}),
    };
    db.salidasInstitucionales[idx] = updated;
    const anoName = nextIdAno
      ? db.anosEscolares.find((a) => a.idAno === nextIdAno)?.nombreNivel || 'Año Escolar'
      : 'Toda la institución';
    return { ...updated, nombreNivel: anoName };
  });
}

export async function toggleSalida(idSalida: number): Promise<SalidaInstitucional> {
  return withWriteLock((db) => {
    const idx = db.salidasInstitucionales.findIndex((s) => s.idSalida === Number(idSalida));
    if (idx === -1) throw new Error('Configuración de hora de salida no encontrada.');
    db.salidasInstitucionales[idx] = {
      ...db.salidasInstitucionales[idx],
      activo: !db.salidasInstitucionales[idx].activo,
    };
    const item = db.salidasInstitucionales[idx];
    const anoName = item.idAno
      ? db.anosEscolares.find((a) => a.idAno === item.idAno)?.nombreNivel || 'Año Escolar'
      : 'Toda la institución';
    return { ...item, nombreNivel: anoName };
  });
}

export async function deleteSalida(idSalida: number): Promise<void> {
  return withWriteLock((db) => {
    db.salidasInstitucionales = db.salidasInstitucionales.filter(
      (s) => s.idSalida !== Number(idSalida)
    );
  });
}

export async function markSalidaNotified(
  idSalida: number,
  fechaYmd: string,
  horaHhmm: string
): Promise<void> {
  await withWriteLock((db) => {
    const idx = db.salidasInstitucionales.findIndex((s) => s.idSalida === Number(idSalida));
    if (idx !== -1) {
      db.salidasInstitucionales[idx] = {
        ...db.salidasInstitucionales[idx],
        ultimaNotificacionFecha: fechaYmd,
        ultimaNotificacionHora: horaHhmm,
      };
    }
  });
}

// ---------------------------------------------------------------------------
// 2.1 LAPSOS ESCOLARES (PERÍODOS ACADÉMICOS OFICIALES)
// ---------------------------------------------------------------------------
function validateLapsoConsistency(
  existingLapsos: LapsoEscolar[],
  candidate: {
    id?: number;
    nombre: string;
    numeroLapso: 1 | 2 | 3;
    fechaInicio: string;
    fechaFin: string;
    anioEscolar: string;
  }
): void {
  if (candidate.fechaInicio > candidate.fechaFin) {
    throw new Error('La fecha de inicio no puede ser posterior a la fecha de cierre del lapso.');
  }

  const sameAnio = candidate.anioEscolar.trim().toLowerCase();
  const others = existingLapsos.filter((l) => l.id !== candidate.id);

  for (const other of others) {
    const otherSameAnio = other.anioEscolar.trim().toLowerCase() === sameAnio;

    // 1. Verificar duplicado de número de lapso dentro del mismo año escolar
    if (otherSameAnio && other.numeroLapso === candidate.numeroLapso) {
      throw new Error(
        `Ya existe el Lapso ${candidate.numeroLapso} ("${other.nombre}") configurado para el año escolar ${candidate.anioEscolar}.`
      );
    }

    // 2. Verificar solapamiento de rangos de fechas (aInicio <= bFin && bInicio <= aFin)
    const overlaps =
      candidate.fechaInicio <= other.fechaFin && other.fechaInicio <= candidate.fechaFin;
    if (overlaps) {
      throw new Error(
        `El rango de fechas (${candidate.fechaInicio} al ${candidate.fechaFin}) se solapa con "${other.nombre}" (${other.fechaInicio} al ${other.fechaFin}).`
      );
    }

    // 3. Verificar coherencia cronológica dentro del mismo año escolar
    if (otherSameAnio) {
      if (candidate.numeroLapso < other.numeroLapso && candidate.fechaInicio > other.fechaInicio) {
        throw new Error(
          `El ${candidate.nombre} (Lapso ${candidate.numeroLapso}) debe iniciar antes que el "${other.nombre}" (${other.fechaInicio}).`
        );
      }
      if (candidate.numeroLapso > other.numeroLapso && candidate.fechaInicio < other.fechaInicio) {
        throw new Error(
          `El ${candidate.nombre} (Lapso ${candidate.numeroLapso}) no puede iniciar antes que el "${other.nombre}" (${other.fechaInicio}).`
        );
      }
    }
  }
}

export async function getLapsos(filters?: {
  anioEscolar?: string;
  soloActivos?: boolean;
}): Promise<LapsoEscolar[]> {
  const db = await readDb();
  let list = [...db.lapsosEscolares];
  if (filters?.anioEscolar) {
    const target = filters.anioEscolar.trim().toLowerCase();
    list = list.filter((l) => l.anioEscolar.trim().toLowerCase() === target);
  }
  if (filters?.soloActivos) {
    list = list.filter((l) => l.activo);
  }
  return list.sort((a, b) => {
    const anioCmp = a.anioEscolar.localeCompare(b.anioEscolar);
    if (anioCmp !== 0) return anioCmp;
    if (a.numeroLapso !== b.numeroLapso) return a.numeroLapso - b.numeroLapso;
    return a.fechaInicio.localeCompare(b.fechaInicio);
  });
}

export async function getLapsoById(id: number): Promise<LapsoEscolar | null> {
  const db = await readDb();
  return db.lapsosEscolares.find((l) => l.id === Number(id)) || null;
}

export async function getActiveLapso(): Promise<LapsoEscolar | null> {
  const db = await readDb();
  return db.lapsosEscolares.find((l) => l.activo) || null;
}

export async function createLapso(data: {
  nombre: string;
  numeroLapso: 1 | 2 | 3;
  fechaInicio: string;
  fechaFin: string;
  anioEscolar: string;
  activo?: boolean;
}): Promise<LapsoEscolar> {
  return withWriteLock((db) => {
    const cleanData = {
      nombre: data.nombre.trim(),
      numeroLapso: data.numeroLapso,
      fechaInicio: data.fechaInicio.trim(),
      fechaFin: data.fechaFin.trim(),
      anioEscolar: data.anioEscolar.trim(),
    };

    validateLapsoConsistency(db.lapsosEscolares, cleanData);

    const nowIso = new Date().toISOString();
    const shouldActivate = Boolean(data.activo);

    if (shouldActivate) {
      db.lapsosEscolares = db.lapsosEscolares.map((l) => ({
        ...l,
        activo: false,
      }));
    }

    const created: LapsoEscolar = {
      id: nextNumericId(db.lapsosEscolares, (l) => l.id),
      ...cleanData,
      activo: shouldActivate,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    db.lapsosEscolares.push(created);
    syncAsistenciaLapsoIds(db);
    return created;
  });
}

export async function updateLapso(
  id: number,
  data: {
    nombre?: string;
    numeroLapso?: 1 | 2 | 3;
    fechaInicio?: string;
    fechaFin?: string;
    anioEscolar?: string;
    activo?: boolean;
  }
): Promise<LapsoEscolar> {
  return withWriteLock((db) => {
    const idx = db.lapsosEscolares.findIndex((l) => l.id === Number(id));
    if (idx === -1) throw new Error('Lapso escolar no encontrado.');

    const current = db.lapsosEscolares[idx];
    const nextCandidate = {
      id: current.id,
      nombre: data.nombre !== undefined ? data.nombre.trim() : current.nombre,
      numeroLapso: (data.numeroLapso !== undefined ? data.numeroLapso : current.numeroLapso) as 1 | 2 | 3,
      fechaInicio: data.fechaInicio !== undefined ? data.fechaInicio.trim() : current.fechaInicio,
      fechaFin: data.fechaFin !== undefined ? data.fechaFin.trim() : current.fechaFin,
      anioEscolar: data.anioEscolar !== undefined ? data.anioEscolar.trim() : current.anioEscolar,
    };

    validateLapsoConsistency(db.lapsosEscolares, nextCandidate);

    const nextActivo = data.activo !== undefined ? Boolean(data.activo) : current.activo;
    const nowIso = new Date().toISOString();

    if (nextActivo) {
      db.lapsosEscolares = db.lapsosEscolares.map((l) =>
        l.id === current.id ? l : { ...l, activo: false }
      );
    }

    const updated: LapsoEscolar = {
      ...current,
      ...nextCandidate,
      activo: nextActivo,
      updatedAt: nowIso,
    };

    db.lapsosEscolares[idx] = updated;
    syncAsistenciaLapsoIds(db);
    return updated;
  });
}

export async function activateLapso(id: number, activo: boolean = true): Promise<LapsoEscolar> {
  return updateLapso(id, { activo });
}

export async function deleteLapso(id: number): Promise<void> {
  return withWriteLock((db) => {
    const idx = db.lapsosEscolares.findIndex((l) => l.id === Number(id));
    if (idx === -1) throw new Error('Lapso escolar no encontrado.');
    db.lapsosEscolares.splice(idx, 1);
    syncAsistenciaLapsoIds(db);
  });
}

// ---------------------------------------------------------------------------
// 2.2 CALENDARIO DE DÍAS NO LABORABLES Y FERIADOS
// ---------------------------------------------------------------------------
function getWeekendDayLabel(fechaYmd: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaYmd)) return null;
  const parsed = new Date(`${fechaYmd}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  const dow = parsed.getUTCDay();
  if (dow === 6) return 'Sábado';
  if (dow === 0) return 'Domingo';
  return null;
}

export function evaluateDiaNoLaborable(
  dias: DiaNoLaborable[],
  fechaYmd: string,
  lapsoMap?: Map<number, LapsoEscolar>
): VerificarDiaNoLaborableResult {
  const weekendDay = getWeekendDayLabel(fechaYmd);
  const matched = dias.find((d) => d.fechaInicio <= fechaYmd && fechaYmd <= d.fechaFin) || null;
  if (matched) {
    return {
      fecha: fechaYmd,
      esNoLaborable: true,
      esFinDeSemana: Boolean(weekendDay),
      motivo: matched.motivo,
      registro: {
        ...matched,
        lapsoNombre:
          matched.lapsoId && lapsoMap ? lapsoMap.get(matched.lapsoId)?.nombre ?? null : null,
      },
    };
  }
  if (weekendDay) {
    return {
      fecha: fechaYmd,
      esNoLaborable: true,
      esFinDeSemana: true,
      motivo: `Fin de semana (${weekendDay} sin actividad escolar)`,
      registro: null,
    };
  }
  return {
    fecha: fechaYmd,
    esNoLaborable: false,
    esFinDeSemana: false,
    motivo: null,
    registro: null,
  };
}

export function countBusinessDaysInRange(
  startYmd: string,
  endYmd: string,
  diasNoLaborables: DiaNoLaborable[]
): { diasHabiles: number; diasNoLaborablesExcluidos: number } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startYmd) || !/^\d{4}-\d{2}-\d{2}$/.test(endYmd) || startYmd > endYmd) {
    return { diasHabiles: 0, diasNoLaborablesExcluidos: 0 };
  }
  const start = new Date(`${startYmd}T12:00:00Z`);
  const end = new Date(`${endYmd}T12:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { diasHabiles: 0, diasNoLaborablesExcluidos: 0 };
  }

  let diasHabiles = 0;
  let diasNoLaborablesExcluidos = 0;
  const cursor = new Date(start.getTime());
  let guard = 0;
  while (cursor <= end && guard < 1500) {
    guard++;
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      const ymd = cursor.toISOString().slice(0, 10);
      const isHoliday = diasNoLaborables.some(
        (d) => d.fechaInicio <= ymd && ymd <= d.fechaFin
      );
      if (isHoliday) {
        diasNoLaborablesExcluidos++;
      } else {
        diasHabiles++;
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return { diasHabiles, diasNoLaborablesExcluidos };
}

export async function verificarDiaNoLaborable(fecha: string): Promise<VerificarDiaNoLaborableResult> {
  const db = await readDb();
  const lapsoMap = new Map(db.lapsosEscolares.map((l) => [l.id, l]));
  return evaluateDiaNoLaborable(db.diasNoLaborables, fecha, lapsoMap);
}

export async function getDiasNoLaborables(): Promise<DiaNoLaborable[]> {
  const db = await readDb();
  const lapsoMap = new Map(db.lapsosEscolares.map((l) => [l.id, l]));
  return [...db.diasNoLaborables]
    .sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio) || a.id - b.id)
    .map((d) => ({
      ...d,
      lapsoNombre: d.lapsoId ? lapsoMap.get(d.lapsoId)?.nombre ?? null : null,
    }));
}

export async function createDiaNoLaborable(data: {
  fechaInicio: string;
  fechaFin: string;
  motivo: string;
  lapsoId?: number | null;
}): Promise<DiaNoLaborable> {
  return withWriteLock((db) => {
    const fechaInicio = data.fechaInicio.trim();
    const fechaFin = data.fechaFin.trim();
    if (fechaInicio > fechaFin) {
      throw new Error('La fecha de inicio no puede ser posterior a la fecha final.');
    }

    const lapsoMap = new Map(db.lapsosEscolares.map((l) => [l.id, l]));
    let resolvedLapsoId: number | null =
      data.lapsoId != null && Number(data.lapsoId) > 0 ? Number(data.lapsoId) : null;

    if (resolvedLapsoId && !lapsoMap.has(resolvedLapsoId)) {
      throw new Error('El lapso escolar seleccionado no existe.');
    }
    if (!resolvedLapsoId) {
      const autoLapso = findLapsoByDate(db.lapsosEscolares, fechaInicio);
      resolvedLapsoId = autoLapso ? autoLapso.id : null;
    }

    const overlap = db.diasNoLaborables.find(
      (d) => fechaInicio <= d.fechaFin && d.fechaInicio <= fechaFin
    );
    if (overlap) {
      throw new Error(
        `El rango seleccionado se solapa con el registro "${overlap.motivo}" (${overlap.fechaInicio} al ${overlap.fechaFin}).`
      );
    }

    const created: DiaNoLaborable = {
      id: nextNumericId(db.diasNoLaborables, (d) => d.id),
      fechaInicio,
      fechaFin,
      motivo: data.motivo.trim(),
      lapsoId: resolvedLapsoId,
      createdAt: new Date().toISOString(),
    };
    db.diasNoLaborables.push(created);

    return {
      ...created,
      lapsoNombre: created.lapsoId ? lapsoMap.get(created.lapsoId)?.nombre ?? null : null,
    };
  });
}

export async function deleteDiaNoLaborable(id: number): Promise<DiaNoLaborable> {
  return withWriteLock((db) => {
    const idx = db.diasNoLaborables.findIndex((d) => d.id === Number(id));
    if (idx === -1) {
      throw new Error('Registro de día no laborable no encontrado.');
    }
    const [removed] = db.diasNoLaborables.splice(idx, 1);
    return removed;
  });
}

// ---------------------------------------------------------------------------
// 3. AÑOS ESCOLARES, SECCIONES, MATERIAS & ASIGNACIONES
// ---------------------------------------------------------------------------
export async function getAnosEscolares(): Promise<AnoEscolar[]> {
  const db = await readDb();
  return [...db.anosEscolares].sort((a, b) => a.idAno - b.idAno);
}

export async function createAnoEscolar(nombreNivel: string, activo: boolean = true): Promise<AnoEscolar> {
  return withWriteLock((db) => {
    const nuevo: AnoEscolar = {
      idAno: nextNumericId(db.anosEscolares, (a) => a.idAno),
      nombreNivel: nombreNivel.trim(),
      activo: Boolean(activo),
    };
    db.anosEscolares.push(nuevo);
    return nuevo;
  });
}

export async function updateAnoEscolar(
  idAno: number,
  nombreNivel: string,
  activo?: boolean
): Promise<AnoEscolar> {
  return withWriteLock((db) => {
    const idx = db.anosEscolares.findIndex((a) => a.idAno === Number(idAno));
    if (idx === -1) throw new Error('Año escolar no encontrado.');
    db.anosEscolares[idx] = {
      ...db.anosEscolares[idx],
      nombreNivel: nombreNivel.trim(),
      ...(activo !== undefined ? { activo: Boolean(activo) } : {}),
    };
    return db.anosEscolares[idx];
  });
}

export async function deleteAnoEscolar(idAno: number): Promise<void> {
  return withWriteLock((db) => {
    db.anosEscolares = db.anosEscolares.filter((a) => a.idAno !== Number(idAno));
    db.secciones = db.secciones.filter((s) => s.idAno !== Number(idAno));
    db.materias = db.materias.filter((m) => m.idAno !== Number(idAno));
  });
}

export async function getSecciones(idAno?: number): Promise<Seccion[]> {
  const db = await readDb();
  const anoMap = new Map(db.anosEscolares.map((a) => [a.idAno, a.nombreNivel]));
  let list = db.secciones.map((s) => ({
    ...s,
    nombreNivel: anoMap.get(s.idAno),
    totalEstudiantes: db.estudiantes.filter((e) => e.idSeccion === s.idSeccion).length,
  }));
  if (idAno) list = list.filter((s) => s.idAno === Number(idAno));
  return list.sort((a, b) => a.idAno - b.idAno || a.nombreSeccion.localeCompare(b.nombreSeccion));
}

export async function createSeccion(idAno: number, nombreSeccion: string): Promise<Seccion> {
  return withWriteLock((db) => {
    const nuevo: Seccion = {
      idSeccion: nextNumericId(db.secciones, (s) => s.idSeccion),
      idAno: Number(idAno),
      nombreSeccion: nombreSeccion.trim(),
    };
    db.secciones.push(nuevo);
    return nuevo;
  });
}

export async function updateSeccion(
  idSeccion: number,
  nombreSeccion: string,
  idAno?: number
): Promise<Seccion> {
  return withWriteLock((db) => {
    const idx = db.secciones.findIndex((s) => s.idSeccion === Number(idSeccion));
    if (idx === -1) throw new Error('Sección no encontrada.');
    db.secciones[idx] = {
      ...db.secciones[idx],
      nombreSeccion: nombreSeccion.trim(),
      ...(idAno !== undefined ? { idAno: Number(idAno) } : {}),
    };
    return db.secciones[idx];
  });
}

export async function deleteSeccion(idSeccion: number): Promise<void> {
  return withWriteLock((db) => {
    db.secciones = db.secciones.filter((s) => s.idSeccion !== Number(idSeccion));
  });
}

export async function getMaterias(idAno?: number): Promise<Materia[]> {
  const db = await readDb();
  const anoMap = new Map(db.anosEscolares.map((a) => [a.idAno, a.nombreNivel]));
  const userMap = new Map(db.users.map((u) => [u.id, u]));

  let list = db.materias.map((m) => {
    const assign = db.docenteMaterias.find((dm) => dm.idMateria === m.idMateria);
    const teacher = assign ? userMap.get(assign.idUsuario) : undefined;
    return {
      ...m,
      nombreNivel: anoMap.get(m.idAno),
      docenteAsignado: teacher
        ? {
            idUsuario: teacher.id,
            nombre: teacher.nombre,
            apellidos: teacher.apellidos,
            email: teacher.email,
          }
        : null,
    };
  });

  if (idAno) list = list.filter((m) => m.idAno === Number(idAno));
  return list.sort((a, b) => a.idAno - b.idAno || a.nombreMateria.localeCompare(b.nombreMateria));
}

export async function createMateria(idAno: number, nombreMateria: string): Promise<Materia> {
  return withWriteLock((db) => {
    const nuevo: Materia = {
      idMateria: nextNumericId(db.materias, (m) => m.idMateria),
      idAno: Number(idAno),
      nombreMateria: nombreMateria.trim(),
    };
    db.materias.push(nuevo);
    return nuevo;
  });
}

export async function updateMateria(
  idMateria: number,
  nombreMateria: string,
  idAno?: number
): Promise<Materia> {
  return withWriteLock((db) => {
    const idx = db.materias.findIndex((m) => m.idMateria === Number(idMateria));
    if (idx === -1) throw new Error('Materia no encontrada.');
    db.materias[idx] = {
      ...db.materias[idx],
      nombreMateria: nombreMateria.trim(),
      ...(idAno !== undefined ? { idAno: Number(idAno) } : {}),
    };
    return db.materias[idx];
  });
}

export async function deleteMateria(idMateria: number): Promise<void> {
  return withWriteLock((db) => {
    db.materias = db.materias.filter((m) => m.idMateria !== Number(idMateria));
    db.docenteMaterias = db.docenteMaterias.filter((dm) => dm.idMateria !== Number(idMateria));
    db.horarios = db.horarios.filter((h) => h.idMateria !== Number(idMateria));
  });
}

export async function getDocenteMaterias(
  idUsuario?: number,
  idMateria?: number
): Promise<DocenteMateria[]> {
  const db = await readDb();
  const userMap = new Map(db.users.map((u) => [u.id, u]));
  const matMap = new Map(db.materias.map((m) => [m.idMateria, m]));
  const anoMap = new Map(db.anosEscolares.map((a) => [a.idAno, a.nombreNivel]));

  let list = db.docenteMaterias.map((dm) => {
    const u = userMap.get(dm.idUsuario);
    const m = matMap.get(dm.idMateria);
    return {
      ...dm,
      usuarioNombre: u?.nombre,
      usuarioApellidos: u?.apellidos,
      usuarioRol: u?.rol,
      nombreMateria: m?.nombreMateria,
      idAno: m?.idAno,
      nombreNivel: m ? anoMap.get(m.idAno) : undefined,
    };
  });

  if (idUsuario) list = list.filter((dm) => dm.idUsuario === Number(idUsuario));
  if (idMateria) list = list.filter((dm) => dm.idMateria === Number(idMateria));
  return list;
}

export async function isDocenteAssignedToMateria(
  idUsuario: number,
  idMateria: number
): Promise<boolean> {
  const db = await readDb();
  return db.docenteMaterias.some(
    (dm) => dm.idUsuario === Number(idUsuario) && dm.idMateria === Number(idMateria)
  );
}

export async function assignDocenteMateria(
  idUsuario: number,
  idMateria: number
): Promise<DocenteMateria> {
  return withWriteLock((db) => {
    const existing = db.docenteMaterias.find(
      (dm) => dm.idUsuario === Number(idUsuario) && dm.idMateria === Number(idMateria)
    );
    if (existing) return existing;
    const created: DocenteMateria = {
      idAsignacion: nextNumericId(db.docenteMaterias, (d) => d.idAsignacion),
      idUsuario: Number(idUsuario),
      idMateria: Number(idMateria),
    };
    db.docenteMaterias.push(created);
    return created;
  });
}

export async function assignDocenteMateriasBatch(
  idUsuario: number,
  idMaterias: number[]
): Promise<{ success: boolean; count: number; assignments: DocenteMateria[] }> {
  return withWriteLock((db) => {
    const created: DocenteMateria[] = [];
    for (const idMat of idMaterias) {
      const exists = db.docenteMaterias.find(
        (dm) => dm.idUsuario === Number(idUsuario) && dm.idMateria === Number(idMat)
      );
      if (exists) {
        created.push(exists);
      } else {
        const entry: DocenteMateria = {
          idAsignacion: nextNumericId(db.docenteMaterias, (d) => d.idAsignacion),
          idUsuario: Number(idUsuario),
          idMateria: Number(idMat),
        };
        db.docenteMaterias.push(entry);
        created.push(entry);
      }
    }
    return { success: true, count: created.length, assignments: created };
  });
}

export async function removeDocenteMateria(idAsignacion: number): Promise<void> {
  return withWriteLock((db) => {
    db.docenteMaterias = db.docenteMaterias.filter((dm) => dm.idAsignacion !== Number(idAsignacion));
  });
}

// ---------------------------------------------------------------------------
// 4. REPRESENTANTES & ESTUDIANTES
// ---------------------------------------------------------------------------
export async function getRepresentantes(): Promise<Representante[]> {
  const db = await readDb();
  return db.representantes
    .map(sanitizeRepresentante)
    .sort((a, b) => a.apellidos.localeCompare(b.apellidos));
}

export async function getRepresentanteById(id: number): Promise<Representante | null> {
  const db = await readDb();
  const found = db.representantes.find((r) => r.idRepresentante === Number(id));
  return found ? sanitizeRepresentante(found) : null;
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
  assertNoNumbersInName(data.nombres, 'Nombres del representante');
  assertNoNumbersInName(data.apellidos, 'Apellidos del representante');

  return withWriteLock(async (db) => {
    const cedulaClean = data.cedula.trim();
    const emailNorm = normalizeEmail(data.email);
    const usuarioClean = data.usuario?.trim() || null;

    if (db.representantes.some((r) => r.cedula.trim().toLowerCase() === cedulaClean.toLowerCase())) {
      throw new Error(`Ya existe un representante registrado con la cédula ${cedulaClean}.`);
    }
    if (
      usuarioClean &&
      db.representantes.some(
        (r) => r.usuario && r.usuario.toLowerCase() === usuarioClean.toLowerCase()
      )
    ) {
      throw new Error(`El nombre de usuario "${usuarioClean}" ya está en uso.`);
    }

    const plainPass = data.password && data.password.trim().length > 0 ? data.password.trim() : 'rep123';
    const passwordHash = await bcrypt.hash(plainPass, 10);

    const nuevo: StoredRepresentante = {
      idRepresentante: nextNumericId(db.representantes, (r) => r.idRepresentante),
      usuario: usuarioClean,
      cedula: cedulaClean,
      nombres: data.nombres.trim(),
      apellidos: data.apellidos.trim(),
      telefono: data.telefono?.trim() || null,
      email: emailNorm,
      activo: typeof data.activo === 'boolean' ? data.activo : true,
      passwordHash,
    };

    db.representantes.push(nuevo);
    return sanitizeRepresentante(nuevo);
  });
}

export async function updateRepresentante(
  id: number,
  data: {
    usuario?: string | null;
    cedula?: string;
    nombres?: string;
    apellidos?: string;
    telefono?: string | null;
    email?: string;
    activo?: boolean;
    password?: string;
    currentPassword?: string;
    newPassword?: string;
  },
  isSelfService: boolean = false
): Promise<Representante> {
  if (!isSelfService) {
    if (data.nombres) assertNoNumbersInName(data.nombres, 'Nombres del representante');
    if (data.apellidos) assertNoNumbersInName(data.apellidos, 'Apellidos del representante');
  }

  return withWriteLock(async (db) => {
    const idx = db.representantes.findIndex((r) => r.idRepresentante === Number(id));
    if (idx === -1) throw new Error('Representante no encontrado.');

    const target = db.representantes[idx];
    let nextHash = target.passwordHash;

    if (isSelfService) {
      if (data.newPassword && data.newPassword.trim().length > 0) {
        if (!data.currentPassword || !(await bcrypt.compare(data.currentPassword, target.passwordHash))) {
          throw new Error('La contraseña actual ingresada es incorrecta.');
        }
        nextHash = await bcrypt.hash(data.newPassword.trim(), 10);
      }

      const updatedSelf: StoredRepresentante = {
        ...target,
        telefono: data.telefono !== undefined ? (data.telefono?.trim() || null) : target.telefono,
        passwordHash: nextHash,
      };
      db.representantes[idx] = updatedSelf;
      return sanitizeRepresentante(updatedSelf);
    }

    const nextUsuario =
      data.usuario !== undefined
        ? (data.usuario && data.usuario.trim() ? data.usuario.trim() : null)
        : target.usuario ?? null;

    if (
      nextUsuario &&
      db.representantes.some(
        (r) =>
          r.idRepresentante !== target.idRepresentante &&
          r.usuario &&
          r.usuario.toLowerCase() === nextUsuario.toLowerCase()
      )
    ) {
      throw new Error(`El nombre de usuario "${nextUsuario}" ya está en uso.`);
    }

    if (data.password && data.password.trim().length > 0) {
      nextHash = await bcrypt.hash(data.password.trim(), 10);
    }

    const updated: StoredRepresentante = {
      ...target,
      usuario: nextUsuario,
      cedula: data.cedula ? data.cedula.trim() : target.cedula,
      nombres: data.nombres ? data.nombres.trim() : target.nombres,
      apellidos: data.apellidos ? data.apellidos.trim() : target.apellidos,
      telefono: data.telefono !== undefined ? (data.telefono?.trim() || null) : target.telefono,
      email: data.email ? normalizeEmail(data.email) : target.email,
      activo: data.activo !== undefined ? Boolean(data.activo) : target.activo,
      passwordHash: nextHash,
    };

    db.representantes[idx] = updated;
    return sanitizeRepresentante(updated);
  });
}

export async function updateRepresentanteCredenciales(
  id: number,
  data: { email?: string; usuario?: string | null; password?: string; activo?: boolean }
): Promise<{ success: boolean; message: string; representante: Representante }> {
  const updated = await updateRepresentante(id, data, false);
  return {
    success: true,
    message: `Credenciales de acceso actualizadas para ${updated.nombres} ${updated.apellidos}.`,
    representante: updated,
  };
}

export async function deleteRepresentante(id: number): Promise<void> {
  return withWriteLock((db) => {
    const linked = db.estudiantes.filter((e) => e.idRepresentante === Number(id));
    if (linked.length > 0) {
      throw new Error(
        `No se puede eliminar este representante porque tiene ${linked.length} estudiante(s) vinculado(s).`
      );
    }
    db.representantes = db.representantes.filter((r) => r.idRepresentante !== Number(id));
    db.pushSubscriptions = db.pushSubscriptions.filter((p) => p.idRepresentante !== Number(id));
    db.notificacionesRepresentante = db.notificacionesRepresentante.filter(
      (n) => n.idRepresentante !== Number(id)
    );
  });
}

export async function getEstudiantes(
  filters?: { idAno?: number; idSeccion?: number; idRepresentante?: number },
  includeRepContact: boolean = true
): Promise<Estudiante[]> {
  const db = await readDb();
  const anoMap = new Map(db.anosEscolares.map((a) => [a.idAno, a.nombreNivel]));
  const secMap = new Map(db.secciones.map((s) => [s.idSeccion, s.nombreSeccion]));
  const repMap = new Map(db.representantes.map((r) => [r.idRepresentante, r]));

  let list = db.estudiantes.map((e) => {
    const rep = repMap.get(e.idRepresentante);
    const isEgresado = e.estadoAcademico === 'EGRESADO';
    return {
      ...e,
      estadoAcademico: isEgresado ? ('EGRESADO' as const) : ('ACTIVO' as const),
      nombreNivel: isEgresado
        ? 'Egresado'
        : e.idAnoActual != null
        ? anoMap.get(e.idAnoActual) || 'Año Escolar'
        : 'Sin Asignar',
      nombreSeccion: isEgresado
        ? null
        : e.idSeccion
        ? secMap.get(e.idSeccion) || null
        : null,
      ...(includeRepContact && rep
        ? {
            representanteNombres: rep.nombres,
            representanteApellidos: rep.apellidos,
            representanteCedula: rep.cedula,
            representanteTelefono: rep.telefono,
            representanteEmail: rep.email,
          }
        : {}),
    };
  });

  if (filters?.idAno) list = list.filter((e) => e.idAnoActual === Number(filters.idAno));
  if (filters?.idSeccion) list = list.filter((e) => e.idSeccion === Number(filters.idSeccion));
  if (filters?.idRepresentante) list = list.filter((e) => e.idRepresentante === Number(filters.idRepresentante));

  return list.sort(
    (a, b) =>
      (a.idAnoActual ?? 9999) - (b.idAnoActual ?? 9999) ||
      numericCedulaValue(a.cedula) - numericCedulaValue(b.cedula)
  );
}

export async function getEstudianteById(idEstudiante: number): Promise<Estudiante | null> {
  const db = await readDb();
  return db.estudiantes.find((e) => e.idEstudiante === Number(idEstudiante)) || null;
}

export async function createEstudiante(data: {
  cedula: string;
  nombres: string;
  apellidos: string;
  idAnoActual: number;
  idSeccion?: number | null;
  idRepresentante: number;
}): Promise<Estudiante> {
  assertNoNumbersInName(data.nombres, 'Nombres del estudiante');
  assertNoNumbersInName(data.apellidos, 'Apellidos del estudiante');

  return withWriteLock((db) => {
    const nuevo: Estudiante = {
      idEstudiante: nextNumericId(db.estudiantes, (e) => e.idEstudiante),
      cedula: data.cedula.trim(),
      nombres: data.nombres.trim(),
      apellidos: data.apellidos.trim(),
      idAnoActual: Number(data.idAnoActual),
      idSeccion: data.idSeccion ? Number(data.idSeccion) : null,
      idRepresentante: Number(data.idRepresentante),
      estadoAcademico: 'ACTIVO',
    };
    db.estudiantes.push(nuevo);
    return nuevo;
  });
}

export async function updateEstudiante(
  idEstudiante: number,
  data: Partial<Estudiante>
): Promise<Estudiante> {
  if (data.nombres) assertNoNumbersInName(data.nombres, 'Nombres del estudiante');
  if (data.apellidos) assertNoNumbersInName(data.apellidos, 'Apellidos del estudiante');

  return withWriteLock((db) => {
    const idx = db.estudiantes.findIndex((e) => e.idEstudiante === Number(idEstudiante));
    if (idx === -1) throw new Error('Estudiante no encontrado.');
    const nextAnoActual =
      data.idAnoActual !== undefined
        ? data.idAnoActual === null
          ? null
          : Number(data.idAnoActual)
        : db.estudiantes[idx].idAnoActual;
    const nextEstado =
      data.estadoAcademico !== undefined
        ? data.estadoAcademico
        : nextAnoActual === null
        ? 'EGRESADO'
        : 'ACTIVO';

    const updated: Estudiante = {
      ...db.estudiantes[idx],
      ...(data.cedula ? { cedula: data.cedula.trim() } : {}),
      ...(data.nombres ? { nombres: data.nombres.trim() } : {}),
      ...(data.apellidos ? { apellidos: data.apellidos.trim() } : {}),
      idAnoActual: nextEstado === 'EGRESADO' ? null : nextAnoActual,
      ...(data.idSeccion !== undefined
        ? { idSeccion: nextEstado === 'EGRESADO' ? null : data.idSeccion ? Number(data.idSeccion) : null }
        : nextEstado === 'EGRESADO'
        ? { idSeccion: null }
        : {}),
      ...(data.idRepresentante !== undefined ? { idRepresentante: Number(data.idRepresentante) } : {}),
      estadoAcademico: nextEstado,
    };
    db.estudiantes[idx] = updated;
    return updated;
  });
}

export async function deleteEstudiante(idEstudiante: number): Promise<void> {
  return withWriteLock((db) => {
    db.estudiantes = db.estudiantes.filter((e) => e.idEstudiante !== Number(idEstudiante));
    db.asistencia = db.asistencia.filter((a) => a.idEstudiante !== Number(idEstudiante));
  });
}

export async function promoverEstudiantesMasivo(
  payload: PromocionMasivaPayload
): Promise<PromocionMasivaResult> {
  return withWriteLock((db) => {
    const origenAno = db.anosEscolares.find((a) => a.idAno === Number(payload.anioOrigenId));
    if (!origenAno) {
      throw new Error('El año escolar de origen especificado no existe.');
    }

    const origenSeccion = payload.seccionOrigenId
      ? db.secciones.find(
          (s) => s.idSeccion === Number(payload.seccionOrigenId) && s.idAno === origenAno.idAno
        )
      : null;
    if (payload.seccionOrigenId && !origenSeccion) {
      throw new Error('La sección de origen no pertenece al año escolar seleccionado.');
    }

    const isEgreso = payload.anioDestinoId === 'EGRESADO';
    let destinoAno: AnoEscolar | null = null;
    let destinoSeccion: Seccion | null = null;

    if (!isEgreso) {
      destinoAno = db.anosEscolares.find((a) => a.idAno === Number(payload.anioDestinoId)) || null;
      if (!destinoAno) {
        throw new Error('El año escolar de destino especificado no existe.');
      }
      destinoSeccion = payload.seccionDestinoId
        ? db.secciones.find(
            (s) => s.idSeccion === Number(payload.seccionDestinoId) && s.idAno === destinoAno!.idAno
          ) || null
        : null;
      if (!destinoSeccion) {
        throw new Error('Debe seleccionar una sección válida dentro del año escolar destino.');
      }
      if (
        origenAno.idAno === destinoAno.idAno &&
        origenSeccion &&
        origenSeccion.idSeccion === destinoSeccion.idSeccion
      ) {
        throw new Error('El año y sección de destino deben ser diferentes al origen.');
      }
    }

    const uniqueIds = Array.from(new Set(payload.estudiantesIds.map((id) => Number(id))));
    const idSet = new Set(uniqueIds);

    // Validación atómica previa: todos los estudiantes seleccionados deben pertenecer al origen y estar activos
    const indicesToUpdate: number[] = [];
    for (let i = 0; i < db.estudiantes.length; i++) {
      const est = db.estudiantes[i];
      if (!idSet.has(est.idEstudiante)) continue;
      if (est.estadoAcademico === 'EGRESADO' || est.idAnoActual !== origenAno.idAno) {
        throw new Error(
          `El estudiante ${est.apellidos}, ${est.nombres} no pertenece al año escolar de origen seleccionado.`
        );
      }
      if (origenSeccion && est.idSeccion !== origenSeccion.idSeccion) {
        throw new Error(
          `El estudiante ${est.apellidos}, ${est.nombres} no pertenece a la sección de origen "${origenSeccion.nombreSeccion}".`
        );
      }
      indicesToUpdate.push(i);
    }

    if (indicesToUpdate.length !== uniqueIds.length) {
      throw new Error('Uno o más estudiantes seleccionados no existen en el sistema.');
    }
    if (indicesToUpdate.length === 0) {
      throw new Error('No hay estudiantes válidos para promover.');
    }

    const promotedIds: number[] = [];
    for (const idx of indicesToUpdate) {
      const current = db.estudiantes[idx];
      if (isEgreso) {
        db.estudiantes[idx] = {
          ...current,
          idAnoActual: null,
          idSeccion: null,
          estadoAcademico: 'EGRESADO',
        };
      } else {
        db.estudiantes[idx] = {
          ...current,
          idAnoActual: destinoAno!.idAno,
          idSeccion: destinoSeccion!.idSeccion,
          estadoAcademico: 'ACTIVO',
        };
      }
      promotedIds.push(current.idEstudiante);
    }

    const destinoLabel = isEgreso
      ? 'EGRESADO (Culminación de Estudios)'
      : `${destinoAno!.nombreNivel} — Sección "${destinoSeccion!.nombreSeccion}"`;

    return {
      success: true,
      promovidosCount: promotedIds.length,
      estadoDestino: isEgreso ? 'EGRESADO' : 'ACTIVO',
      destinoLabel,
      estudiantesPromovidos: promotedIds,
      message: isEgreso
        ? `${promotedIds.length} estudiante(s) promovido(s) a estado EGRESADO preservando su historial académico.`
        : `${promotedIds.length} estudiante(s) promovido(s) exitosamente a ${destinoLabel}.`,
    };
  });
}

// ---------------------------------------------------------------------------
// 5. ASISTENCIA
// ---------------------------------------------------------------------------
function resolveAttendanceLapso(
  record: RegistroAsistencia,
  lapsoById: Map<number, LapsoEscolar>,
  lapsos: LapsoEscolar[]
): LapsoEscolar | null {
  if (record.lapsoId != null && lapsoById.has(record.lapsoId)) {
    return lapsoById.get(record.lapsoId)!;
  }
  return findLapsoByDate(lapsos, record.fecha);
}

export async function getAsistencia(filter: {
  fecha?: string;
  mes?: string;
  startDate?: string;
  endDate?: string;
  estado?: EstadoAsistencia;
  idMateria?: number;
  idEstudiante?: number;
  idRepresentante?: number;
  idSeccion?: number;
  idAno?: number;
  lapsoId?: number;
}): Promise<RegistroAsistencia[]> {
  const db = await readDb();
  const estMap = new Map(db.estudiantes.map((e) => [e.idEstudiante, e]));
  const matMap = new Map(db.materias.map((m) => [m.idMateria, m]));
  const anoMap = new Map(db.anosEscolares.map((a) => [a.idAno, a.nombreNivel]));
  const secMap = new Map(db.secciones.map((s) => [s.idSeccion, s.nombreSeccion]));
  const lapsoMap = new Map(db.lapsosEscolares.map((l) => [l.id, l]));
  const targetLapso = filter.lapsoId ? lapsoMap.get(Number(filter.lapsoId)) || null : null;

  let list = db.asistencia
    .map((a) => {
      const est = estMap.get(a.idEstudiante);
      const mat = matMap.get(a.idMateria);
      if (!est || !mat) return null;
      const resolvedLapso = resolveAttendanceLapso(a, lapsoMap, db.lapsosEscolares);
      return {
        ...a,
        lapsoId: resolvedLapso?.id ?? a.lapsoId ?? null,
        lapsoNombre: resolvedLapso?.nombre ?? null,
        numeroLapso: resolvedLapso?.numeroLapso ?? null,
        estudianteCedula: est.cedula,
        estudianteNombres: est.nombres,
        estudianteApellidos: est.apellidos,
        nombreMateria: mat.nombreMateria,
        nombreNivel: anoMap.get(mat.idAno),
        nombreSeccion: est.idSeccion ? secMap.get(est.idSeccion) || null : null,
        idRepresentante: est.idRepresentante,
        _estIdAno: mat.idAno,
        _estIdSeccion: est.idSeccion,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  if (filter.lapsoId) {
    if (!targetLapso) {
      return [];
    }
    list = list.filter(
      (a) =>
        a.lapsoId === targetLapso.id ||
        (a.fecha >= targetLapso.fechaInicio && a.fecha <= targetLapso.fechaFin)
    );
  }

  if (filter.fecha) {
    list = list.filter((a) => a.fecha === filter.fecha);
  } else if (filter.mes) {
    list = list.filter((a) => a.fecha.startsWith(filter.mes!));
  } else {
    if (filter.startDate) list = list.filter((a) => a.fecha >= filter.startDate!);
    if (filter.endDate) list = list.filter((a) => a.fecha <= filter.endDate!);
  }
  if (filter.estado) list = list.filter((a) => a.estado === filter.estado);
  if (filter.idMateria) list = list.filter((a) => a.idMateria === Number(filter.idMateria));
  if (filter.idEstudiante) list = list.filter((a) => a.idEstudiante === Number(filter.idEstudiante));
  if (filter.idRepresentante) list = list.filter((a) => a.idRepresentante === Number(filter.idRepresentante));
  if (filter.idSeccion) list = list.filter((a) => a._estIdSeccion === Number(filter.idSeccion));
  if (filter.idAno) list = list.filter((a) => a._estIdAno === Number(filter.idAno));

  return list
    .sort((a, b) => {
      if (!filter.fecha && a.fecha !== b.fecha) {
        return b.fecha.localeCompare(a.fecha);
      }
      return numericCedulaValue(a.estudianteCedula || '') - numericCedulaValue(b.estudianteCedula || '');
    })
    .map(({ _estIdAno: _1, _estIdSeccion: _2, ...rest }) => rest);
}

/**
 * Consulta paginada en servidor con soporte de índices en memoria por fecha/fechaModificacion,
 * filtros granulares (fecha, mes, startDate/endDate, lapsoId, estado, búsqueda) y desglose por lapsos.
 */
export async function getAsistenciaPaginated(filter: {
  page?: number;
  limit?: number;
  fecha?: string;
  mes?: string;
  startDate?: string;
  endDate?: string;
  estado?: EstadoAsistencia;
  idMateria?: number;
  idEstudiante?: number;
  idSeccion?: number;
  idAno?: number;
  lapsoId?: number;
  search?: string;
}): Promise<PaginatedResponse<RegistroAsistencia>> {
  const db = await readDb();
  const page = Math.max(1, Number(filter.page) || 1);
  const limit = Math.min(Math.max(1, Number(filter.limit) || 25), 500);
  const offset = (page - 1) * limit;

  const estMap = new Map(db.estudiantes.map((e) => [e.idEstudiante, e]));
  const matMap = new Map(db.materias.map((m) => [m.idMateria, m]));
  const anoMap = new Map(db.anosEscolares.map((a) => [a.idAno, a.nombreNivel]));
  const secMap = new Map(db.secciones.map((s) => [s.idSeccion, s.nombreSeccion]));
  const lapsoMap = new Map(db.lapsosEscolares.map((l) => [l.id, l]));
  const targetLapso = filter.lapsoId ? lapsoMap.get(Number(filter.lapsoId)) || null : null;

  const searchLower = filter.search ? filter.search.trim().toLowerCase() : '';

  const sortedLapsos = [...db.lapsosEscolares].sort((a, b) => a.numeroLapso - b.numeroLapso);
  const breakdownAcc = new Map<
    number,
    {
      lapso: LapsoEscolar;
      total: number;
      presentes: number;
      tardes: number;
      ausentes: number;
      justificadosYReposos: number;
    }
  >();
  for (const lapso of sortedLapsos) {
    breakdownAcc.set(lapso.id, {
      lapso,
      total: 0,
      presentes: 0,
      tardes: 0,
      ausentes: 0,
      justificadosYReposos: 0,
    });
  }

  // Filtrado en un solo recorrido calculando desglose por lapsos y totales filtrados
  const matchedRaw: RegistroAsistencia[] = [];
  let presentes = 0;
  let tardes = 0;
  let ausentes = 0;
  let justificadosYReposos = 0;

  for (const a of db.asistencia) {
    if (filter.estado && a.estado !== filter.estado) continue;
    if (filter.idMateria && a.idMateria !== Number(filter.idMateria)) continue;
    if (filter.idEstudiante && a.idEstudiante !== Number(filter.idEstudiante)) continue;

    const est = estMap.get(a.idEstudiante);
    const mat = matMap.get(a.idMateria);
    if (!est || !mat) continue;

    if (filter.idSeccion && est.idSeccion !== Number(filter.idSeccion)) continue;
    if (filter.idAno && mat.idAno !== Number(filter.idAno)) continue;

    if (searchLower) {
      const fullName = `${est.nombres} ${est.apellidos}`.toLowerCase();
      const reverseName = `${est.apellidos}, ${est.nombres}`.toLowerCase();
      const cedula = est.cedula.toLowerCase();
      const motivo = (a.motivoJustificacion || '').toLowerCase();
      const numJust = (a.numeroJustificante || '').toLowerCase();
      if (
        !fullName.includes(searchLower) &&
        !reverseName.includes(searchLower) &&
        !cedula.includes(searchLower) &&
        !motivo.includes(searchLower) &&
        !numJust.includes(searchLower)
      ) {
        continue;
      }
    }

    const resolvedLapso = resolveAttendanceLapso(a, lapsoMap, db.lapsosEscolares);
    if (resolvedLapso && breakdownAcc.has(resolvedLapso.id)) {
      const b = breakdownAcc.get(resolvedLapso.id)!;
      b.total++;
      if (a.estado === 'Presente') b.presentes++;
      else if (a.estado === 'Tarde') b.tardes++;
      else if (a.estado === 'Ausente') b.ausentes++;
      else if (a.estado === 'Justificado' || a.estado === 'Reposo Médico') b.justificadosYReposos++;
    }

    // Aplicar filtro de lapso y/o fecha sobre matchedRaw
    if (filter.lapsoId) {
      if (!targetLapso) continue;
      const inLapso =
        resolvedLapso?.id === targetLapso.id ||
        (a.fecha >= targetLapso.fechaInicio && a.fecha <= targetLapso.fechaFin);
      if (!inLapso) continue;
    }

    if (filter.fecha) {
      if (a.fecha !== filter.fecha) continue;
    } else if (filter.mes) {
      if (!a.fecha.startsWith(filter.mes)) continue;
    } else {
      if (filter.startDate && a.fecha < filter.startDate) continue;
      if (filter.endDate && a.fecha > filter.endDate) continue;
    }

    if (a.estado === 'Presente') presentes++;
    else if (a.estado === 'Tarde') tardes++;
    else if (a.estado === 'Ausente') ausentes++;
    else if (a.estado === 'Justificado' || a.estado === 'Reposo Médico') justificadosYReposos++;

    matchedRaw.push(a);
  }

  // Ordenar por fecha / fechaModificacion descendente (más reciente primero)
  matchedRaw.sort((a, b) => {
    if (a.fecha !== b.fecha) return b.fecha.localeCompare(a.fecha);
    const modA = a.fechaModificacion || '';
    const modB = b.fechaModificacion || '';
    if (modA !== modB) return modB.localeCompare(modA);
    return b.idAsistencia - a.idAsistencia;
  });

  const totalCount = matchedRaw.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));

  // LIMIT & OFFSET únicamente sobre el bloque solicitado
  const pageSlice = matchedRaw.slice(offset, offset + limit).map((a) => {
    const est = estMap.get(a.idEstudiante)!;
    const mat = matMap.get(a.idMateria)!;
    const resolvedLapso = resolveAttendanceLapso(a, lapsoMap, db.lapsosEscolares);
    return {
      ...a,
      lapsoId: resolvedLapso?.id ?? a.lapsoId ?? null,
      lapsoNombre: resolvedLapso?.nombre ?? null,
      numeroLapso: resolvedLapso?.numeroLapso ?? null,
      estudianteCedula: est.cedula,
      estudianteNombres: est.nombres,
      estudianteApellidos: est.apellidos,
      nombreMateria: mat.nombreMateria,
      nombreNivel: anoMap.get(mat.idAno),
      nombreSeccion: est.idSeccion ? secMap.get(est.idSeccion) || null : null,
      idRepresentante: est.idRepresentante,
    };
  });

  const lapsoBreakdown: LapsoBreakdownStats[] = Array.from(breakdownAcc.values()).map(
    ({ lapso, total, presentes: p, tardes: t, ausentes: au, justificadosYReposos: jr }) => {
      const bizDays = countBusinessDaysInRange(
        lapso.fechaInicio,
        lapso.fechaFin,
        db.diasNoLaborables
      );
      return {
        lapsoId: lapso.id,
        nombre: lapso.nombre,
        numeroLapso: lapso.numeroLapso,
        fechaInicio: lapso.fechaInicio,
        fechaFin: lapso.fechaFin,
        anioEscolar: lapso.anioEscolar,
        activo: lapso.activo,
        total,
        presentes: p,
        tardes: t,
        ausentes: au,
        justificadosYReposos: jr,
        porcentajeAsistencia: total > 0 ? Math.round(((p + t + jr) / total) * 100) : 0,
        diasHabiles: bizDays.diasHabiles,
        diasNoLaborablesExcluidos: bizDays.diasNoLaborablesExcluidos,
      };
    }
  );

  // Calcular días hábiles del periodo filtrado excluyendo fines de semana y días no laborables
  let summaryRangeStart: string | null = null;
  let summaryRangeEnd: string | null = null;
  if (filter.fecha) {
    summaryRangeStart = filter.fecha;
    summaryRangeEnd = filter.fecha;
  } else if (filter.mes) {
    const [y, m] = filter.mes.split('-').map(Number);
    if (y && m) {
      const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
      summaryRangeStart = `${filter.mes}-01`;
      summaryRangeEnd = `${filter.mes}-${String(lastDay).padStart(2, '0')}`;
    }
  } else if (filter.startDate && filter.endDate) {
    summaryRangeStart = filter.startDate;
    summaryRangeEnd = filter.endDate;
  } else if (targetLapso) {
    summaryRangeStart = targetLapso.fechaInicio;
    summaryRangeEnd = targetLapso.fechaFin;
  }

  let summaryBizDays: { diasHabiles: number; diasNoLaborablesExcluidos: number };
  if (summaryRangeStart && summaryRangeEnd) {
    summaryBizDays = countBusinessDaysInRange(
      summaryRangeStart,
      summaryRangeEnd,
      db.diasNoLaborables
    );
  } else {
    summaryBizDays = lapsoBreakdown.reduce(
      (acc, item) => ({
        diasHabiles: acc.diasHabiles + (item.diasHabiles || 0),
        diasNoLaborablesExcluidos:
          acc.diasNoLaborablesExcluidos + (item.diasNoLaborablesExcluidos || 0),
      }),
      { diasHabiles: 0, diasNoLaborablesExcluidos: 0 }
    );
  }

  return {
    data: pageSlice,
    pagination: {
      page,
      limit,
      totalCount,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
    summary: {
      total: totalCount,
      presentes,
      tardes,
      ausentes,
      justificadosYReposos,
      porcentajeAsistencia:
        totalCount > 0
          ? Math.round(((presentes + tardes + justificadosYReposos) / totalCount) * 100)
          : 0,
      diasHabiles: summaryBizDays.diasHabiles,
      diasNoLaborablesExcluidos: summaryBizDays.diasNoLaborablesExcluidos,
    },
    lapsoBreakdown,
    lapsoFiltro: targetLapso,
  };
}

export async function registrarAsistenciaBatch(
  idMateria: number,
  fecha: string,
  records: Array<{ idEstudiante: number; estado: EstadoAsistencia; horaEntrada?: string }>,
  options?: { actorId?: number; actorNombre?: string; actorRol?: RolUsuario }
): Promise<RegistroAsistencia[]> {
  return withWriteLock((db) => {
    const holidayCheck = evaluateDiaNoLaborable(db.diasNoLaborables, fecha);
    if (holidayCheck.esNoLaborable) {
      throw new Error(`Sin actividades escolares: ${holidayCheck.motivo}`);
    }

    const now = new Date();
    const serverTime = now.toTimeString().split(' ')[0];
    const nowIso = now.toISOString();
    const results: RegistroAsistencia[] = [];
    const canJustify = options?.actorRol === 'director' || options?.actorRol === 'coordinador';
    const matchedLapso = findLapsoByDate(db.lapsosEscolares, fecha);
    const lapsoId = matchedLapso ? matchedLapso.id : null;

    for (const r of records) {
      const hora = r.horaEntrada || serverTime;
      const existingIdx = db.asistencia.findIndex(
        (a) =>
          a.idEstudiante === Number(r.idEstudiante) &&
          a.idMateria === Number(idMateria) &&
          a.fecha === fecha
      );

      const isSpecialStatus = r.estado === 'Justificado' || r.estado === 'Reposo Médico';

      if (existingIdx !== -1) {
        const existing = db.asistencia[existingIdx];
        const isLockedByCoordination =
          existing.estado === 'Justificado' || existing.estado === 'Reposo Médico';

        // Un docente no puede sobrescribir un registro ya validado/justificado por Coordinación
        if (options?.actorRol === 'docente' && isLockedByCoordination) {
          results.push(existing);
          continue;
        }

        const shouldStampModifier =
          canJustify && isSpecialStatus && existing.estado !== r.estado;

        db.asistencia[existingIdx] = {
          ...existing,
          lapsoId,
          estado: r.estado,
          horaEntrada: hora,
          ...(shouldStampModifier
            ? {
                modificadoPorId: options?.actorId ?? null,
                modificadoPorNombre: options?.actorNombre ?? null,
                modificadoPorRol: options?.actorRol ?? null,
                fechaModificacion: nowIso,
              }
            : {}),
        };
        results.push(db.asistencia[existingIdx]);
      } else {
        const shouldStampModifier = canJustify && isSpecialStatus;
        const created: RegistroAsistencia = {
          idAsistencia: nextNumericId(db.asistencia, (a) => a.idAsistencia),
          idEstudiante: Number(r.idEstudiante),
          idMateria: Number(idMateria),
          lapsoId,
          fecha,
          horaEntrada: hora,
          estado: r.estado,
          ...(shouldStampModifier
            ? {
                modificadoPorId: options?.actorId ?? null,
                modificadoPorNombre: options?.actorNombre ?? null,
                modificadoPorRol: options?.actorRol ?? null,
                fechaModificacion: nowIso,
              }
            : {}),
        };
        db.asistencia.push(created);
        results.push(created);
      }
    }

    return results;
  });
}

export async function updateAsistenciaJustificacion(
  idAsistencia: number,
  data: {
    estado: EstadoAsistencia;
    motivoJustificacion: string;
    numeroJustificante?: string | null;
    fechaRecepcionDocumento?: string | null;
  },
  actor: {
    id: number;
    nombre: string;
    rol: RolUsuario;
  }
): Promise<{ registro: RegistroAsistencia; previousEstado: EstadoAsistencia } | null> {
  return withWriteLock((db) => {
    const idx = db.asistencia.findIndex((a) => a.idAsistencia === Number(idAsistencia));
    if (idx === -1) return null;

    const current = db.asistencia[idx];
    const previousEstado = current.estado;
    const matchedLapso = findLapsoByDate(db.lapsosEscolares, current.fecha);

    const updatedRecord: RegistroAsistencia = {
      ...current,
      lapsoId: matchedLapso ? matchedLapso.id : current.lapsoId ?? null,
      estado: data.estado,
      motivoJustificacion: data.motivoJustificacion.trim(),
      numeroJustificante: data.numeroJustificante?.trim() ? data.numeroJustificante.trim() : null,
      fechaRecepcionDocumento: data.fechaRecepcionDocumento?.trim()
        ? data.fechaRecepcionDocumento.trim()
        : getLocalTodayDateString(),
      modificadoPorId: actor.id,
      modificadoPorNombre: actor.nombre,
      modificadoPorRol: actor.rol,
      fechaModificacion: new Date().toISOString(),
    };

    db.asistencia[idx] = updatedRecord;

    const est = db.estudiantes.find((e) => e.idEstudiante === updatedRecord.idEstudiante);
    const mat = db.materias.find((m) => m.idMateria === updatedRecord.idMateria);
    const ano = mat ? db.anosEscolares.find((a) => a.idAno === mat.idAno) : undefined;
    const sec = est?.idSeccion ? db.secciones.find((s) => s.idSeccion === est.idSeccion) : undefined;

    return {
      previousEstado,
      registro: {
        ...updatedRecord,
        lapsoNombre: matchedLapso?.nombre ?? null,
        numeroLapso: matchedLapso?.numeroLapso ?? null,
        estudianteCedula: est?.cedula,
        estudianteNombres: est?.nombres,
        estudianteApellidos: est?.apellidos,
        nombreMateria: mat?.nombreMateria,
        nombreNivel: ano?.nombreNivel,
        nombreSeccion: sec?.nombreSeccion || null,
        idRepresentante: est?.idRepresentante,
      },
    };
  });
}

// ---------------------------------------------------------------------------
// 6. HORARIOS ESCOLARES & SISTEMA ANTICONFLICTOS
// ---------------------------------------------------------------------------
export async function getHorarios(filter?: {
  idAno?: number;
  idSeccion?: number;
  diaSemana?: string;
  idMateria?: number;
  idDocente?: number;
}): Promise<Horario[]> {
  const db = await readDb();
  const anoMap = new Map(db.anosEscolares.map((a) => [a.idAno, a.nombreNivel]));
  const secMap = new Map(db.secciones.map((s) => [s.idSeccion, s.nombreSeccion]));
  const matMap = new Map(db.materias.map((m) => [m.idMateria, m.nombreMateria]));
  const assignments = await getDocenteMaterias();

  let list = db.horarios.map((h) => {
    const assign = assignments.find((a) => a.idMateria === h.idMateria);
    return {
      ...h,
      nombreNivel: anoMap.get(h.idAno),
      nombreSeccion: secMap.get(h.idSeccion),
      nombreMateria: matMap.get(h.idMateria),
      idDocente: assign?.idUsuario || null,
      docenteNombre: assign?.usuarioNombre || 'Sin asignar',
      docenteApellidos: assign?.usuarioApellidos || '',
      nombreDocente: assign
        ? `${assign.usuarioNombre} ${assign.usuarioApellidos}`
        : 'Sin asignar',
    };
  });

  if (filter?.idAno) list = list.filter((h) => h.idAno === Number(filter.idAno));
  if (filter?.idSeccion) list = list.filter((h) => h.idSeccion === Number(filter.idSeccion));
  if (filter?.diaSemana) list = list.filter((h) => h.diaSemana === filter.diaSemana);
  if (filter?.idMateria) list = list.filter((h) => h.idMateria === Number(filter.idMateria));
  if (filter?.idDocente) list = list.filter((h) => h.idDocente === Number(filter.idDocente));

  return list.sort((a, b) => a.idAno - b.idAno || a.idSeccion - b.idSeccion || a.horaInicio.localeCompare(b.horaInicio));
}

export async function detectHorarioConflict(data: {
  idHorario?: number;
  idAno: number;
  idSeccion: number;
  idMateria: number;
  diaSemana: string;
  horaInicio: string;
  horaFin: string;
  aula?: string | null;
}): Promise<ConflictoHorarioResult> {
  const conflicts: ConflictoHorarioItem[] = [];
  const { idHorario, idAno, idSeccion, idMateria, diaSemana, horaInicio, horaFin, aula } = data;

  const activeRecesos = await getRecesos(true);
  for (const receso of activeRecesos) {
    if (timeOverlaps(horaInicio, horaFin, receso.horaInicio, receso.horaFin)) {
      conflicts.push({
        type: 'receso',
        message: `El bloque (${horaInicio} - ${horaFin}) coincide con el ${receso.nombre} institucional (${receso.horaInicio} - ${receso.horaFin}).`,
        details: { horarioExistente: `${receso.horaInicio} - ${receso.horaFin}` },
      });
    }
  }

  const activeSalidas = await getSalidas(true);
  for (const salida of activeSalidas) {
    if (salida.idAno && salida.idAno !== Number(idAno)) continue;
    if (timeToMinutes(horaFin) > timeToMinutes(salida.horaSalida)) {
      conflicts.push({
        type: 'salida',
        message: `El bloque (${horaInicio} - ${horaFin}) supera la ${salida.nombre} (${salida.horaSalida}).`,
        details: { horarioExistente: `Salida: ${salida.horaSalida}` },
      });
    }
  }

  const allHorariosDay = await getHorarios({ diaSemana });
  const otherSchedules = idHorario
    ? allHorariosDay.filter((h) => h.idHorario !== Number(idHorario))
    : allHorariosDay;

  for (const s of otherSchedules) {
    if (s.idAno === Number(idAno) && s.idSeccion === Number(idSeccion)) {
      if (timeOverlaps(horaInicio, horaFin, s.horaInicio, s.horaFin)) {
        conflicts.push({
          type: 'seccion',
          message: `Conflicto de Sección: ${s.nombreNivel} - Sección ${s.nombreSeccion} ya tiene programada la materia "${s.nombreMateria}" de ${s.horaInicio} a ${s.horaFin}.`,
          details: {
            seccion: `${s.nombreNivel} (${s.nombreSeccion})`,
            materia: s.nombreMateria,
            horarioExistente: `${s.horaInicio} - ${s.horaFin}`,
          },
        });
      }
    }
  }

  if (aula && aula.trim()) {
    const cleanAula = aula.trim().toLowerCase();
    for (const s of otherSchedules) {
      if (s.aula && s.aula.trim().toLowerCase() === cleanAula) {
        if (timeOverlaps(horaInicio, horaFin, s.horaInicio, s.horaFin)) {
          conflicts.push({
            type: 'aula',
            message: `Conflicto de Aula: El "${aula}" ya está ocupada por ${s.nombreNivel} (Sección ${s.nombreSeccion}) para "${s.nombreMateria}" de ${s.horaInicio} a ${s.horaFin}.`,
            details: {
              aula,
              seccion: `${s.nombreNivel} (${s.nombreSeccion})`,
              materia: s.nombreMateria,
              horarioExistente: `${s.horaInicio} - ${s.horaFin}`,
            },
          });
        }
      }
    }
  }

  const assignments = await getDocenteMaterias();
  const currentMateriaAssignment = assignments.find((a) => a.idMateria === Number(idMateria));
  if (currentMateriaAssignment && currentMateriaAssignment.idUsuario) {
    const teacherId = currentMateriaAssignment.idUsuario;
    const teacherName = `${currentMateriaAssignment.usuarioNombre} ${currentMateriaAssignment.usuarioApellidos}`;
    const teacherMateriaIds = assignments
      .filter((a) => a.idUsuario === teacherId)
      .map((a) => a.idMateria);

    for (const s of otherSchedules) {
      if (teacherMateriaIds.includes(s.idMateria)) {
        if (timeOverlaps(horaInicio, horaFin, s.horaInicio, s.horaFin)) {
          conflicts.push({
            type: 'docente',
            message: `Conflicto de Docente: El/La profesor(a) ${teacherName} ya imparte clase en ${s.nombreNivel} (Sección ${s.nombreSeccion}) para "${s.nombreMateria}" de ${s.horaInicio} a ${s.horaFin}.`,
            details: {
              profesor: teacherName,
              seccion: `${s.nombreNivel} (${s.nombreSeccion})`,
              materia: s.nombreMateria,
              horarioExistente: `${s.horaInicio} - ${s.horaFin}`,
            },
          });
        }
      }
    }
  }

  return { hasConflict: conflicts.length > 0, conflicts };
}

export async function suggestConflictFreeSlots(data: {
  idAno: number;
  idSeccion: number;
  idMateria: number;
  aula?: string | null;
  idHorarioExcluir?: number;
}): Promise<SlotSuggestion[]> {
  const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
  const BLOQUES = [
    { inicio: '07:00', fin: '07:45', texto: '07:00 - 07:45' },
    { inicio: '07:45', fin: '08:30', texto: '07:45 - 08:30' },
    { inicio: '08:30', fin: '09:15', texto: '08:30 - 09:15' },
    { inicio: '09:45', fin: '10:30', texto: '09:45 - 10:30' },
    { inicio: '10:30', fin: '11:15', texto: '10:30 - 11:15' },
    { inicio: '11:15', fin: '12:00', texto: '11:15 - 12:00' },
  ];

  const suggestions: SlotSuggestion[] = [];
  const targetAula = data.aula || 'Aula';

  for (const dia of DIAS) {
    for (const bloque of BLOQUES) {
      const check = await detectHorarioConflict({
        idHorario: data.idHorarioExcluir,
        idAno: data.idAno,
        idSeccion: data.idSeccion,
        idMateria: data.idMateria,
        diaSemana: dia,
        horaInicio: bloque.inicio,
        horaFin: bloque.fin,
        aula: targetAula,
      });

      if (!check.hasConflict) {
        suggestions.push({
          diaSemana: dia,
          horaInicio: bloque.inicio,
          horaFin: bloque.fin,
          aula: targetAula,
          bloqueTexto: `${dia} ${bloque.texto}`,
        });
        if (suggestions.length >= 6) return suggestions;
      }
    }
  }
  return suggestions;
}

export async function autoResolveHorarioConflicts(): Promise<AutoResolveResult> {
  return withWriteLock((db) => {
    const allHorarios = db.horarios;
    if (allHorarios.length === 0) {
      return {
        success: true,
        totalBlocks: 0,
        initialConflicts: 0,
        finalConflicts: 0,
        message: 'No hay horarios registrados en el sistema.',
      };
    }

    const materiaTeacherMap = new Map<number, number>();
    for (const a of db.docenteMaterias) {
      materiaTeacherMap.set(a.idMateria, a.idUsuario);
    }

    const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
    const BLOQUES = [
      { inicio: '07:00', fin: '07:45' },
      { inicio: '07:45', fin: '08:30' },
      { inicio: '08:30', fin: '09:15' },
      { inicio: '09:45', fin: '10:30' },
      { inicio: '10:30', fin: '11:15' },
      { inicio: '11:15', fin: '12:00' },
    ];

    function getSlotIdx(dia: string, inicio: string): number {
      const dIdx = DIAS.indexOf(dia);
      const bIdx = BLOQUES.findIndex((b) => b.inicio === inicio);
      return Math.max(0, dIdx * 6 + (bIdx >= 0 ? bIdx : 0));
    }

    interface Block {
      idHorario: number;
      idAno: number;
      idSeccion: number;
      idMateria: number;
      teacherId: number;
      room: string;
      slotIdx: number;
    }

    const blocks: Block[] = allHorarios.map((h) => ({
      idHorario: h.idHorario,
      idAno: h.idAno,
      idSeccion: h.idSeccion,
      idMateria: h.idMateria,
      teacherId: materiaTeacherMap.get(h.idMateria) || 0,
      room: (h.aula || '').trim().toLowerCase(),
      slotIdx: getSlotIdx(h.diaSemana, h.horaInicio),
    }));

    const slotTeacherCounts: Map<number, number>[] = Array.from({ length: 30 }, () => new Map());
    const slotRoomCounts: Map<string, number>[] = Array.from({ length: 30 }, () => new Map());

    for (const b of blocks) {
      if (b.teacherId > 0) {
        const tc = slotTeacherCounts[b.slotIdx];
        tc.set(b.teacherId, (tc.get(b.teacherId) || 0) + 1);
      }
      if (b.room) {
        const rc = slotRoomCounts[b.slotIdx];
        rc.set(b.room, (rc.get(b.room) || 0) + 1);
      }
    }

    function slotScore(s: number): number {
      let score = 0;
      for (const count of slotTeacherCounts[s].values()) {
        if (count > 1) score += (count - 1) * 10;
      }
      for (const count of slotRoomCounts[s].values()) {
        if (count > 1) score += (count - 1) * 20;
      }
      return score;
    }

    let totalScore = 0;
    for (let s = 0; s < 30; s++) totalScore += slotScore(s);
    const initialConflicts = totalScore;

    if (totalScore === 0) {
      return {
        success: true,
        totalBlocks: blocks.length,
        initialConflicts: 0,
        finalConflicts: 0,
        message: 'La malla horaria escolar ya se encuentra 100% libre de conflictos.',
      };
    }

    const sectionMap = new Map<number, Block[]>();
    for (const b of blocks) {
      if (!sectionMap.has(b.idSeccion)) sectionMap.set(b.idSeccion, []);
      sectionMap.get(b.idSeccion)!.push(b);
    }

    const sectionIds = Array.from(sectionMap.keys());
    let iters = 0;
    const maxIters = 60000;
    let temp = 1.0;

    while (totalScore > 0 && iters < maxIters) {
      iters++;
      if (iters % 2000 === 0) temp = Math.max(0.001, temp * 0.95);

      const secId = sectionIds[Math.floor(Math.random() * sectionIds.length)];
      const secBlocks = sectionMap.get(secId)!;

      const idxA = Math.floor(Math.random() * secBlocks.length);
      const idxB = Math.floor(Math.random() * secBlocks.length);
      if (idxA === idxB) continue;

      const bA = secBlocks[idxA];
      const bB = secBlocks[idxB];
      const sA = bA.slotIdx;
      const sB = bB.slotIdx;
      if (sA === sB) continue;

      const pre = slotScore(sA) + slotScore(sB);

      if (bA.teacherId > 0) slotTeacherCounts[sA].set(bA.teacherId, slotTeacherCounts[sA].get(bA.teacherId)! - 1);
      if (bA.room) slotRoomCounts[sA].set(bA.room, slotRoomCounts[sA].get(bA.room)! - 1);
      if (bB.teacherId > 0) slotTeacherCounts[sB].set(bB.teacherId, slotTeacherCounts[sB].get(bB.teacherId)! - 1);
      if (bB.room) slotRoomCounts[sB].set(bB.room, slotRoomCounts[sB].get(bB.room)! - 1);

      if (bA.teacherId > 0) slotTeacherCounts[sB].set(bA.teacherId, (slotTeacherCounts[sB].get(bA.teacherId) || 0) + 1);
      if (bA.room) slotRoomCounts[sB].set(bA.room, (slotRoomCounts[sB].get(bA.room) || 0) + 1);
      if (bB.teacherId > 0) slotTeacherCounts[sA].set(bB.teacherId, (slotTeacherCounts[sA].get(bB.teacherId) || 0) + 1);
      if (bB.room) slotRoomCounts[sA].set(bB.room, (slotRoomCounts[sA].get(bB.room) || 0) + 1);

      const post = slotScore(sA) + slotScore(sB);
      const delta = post - pre;

      if (delta <= 0 || Math.random() < Math.exp(-delta / temp)) {
        bA.slotIdx = sB;
        bB.slotIdx = sA;
        totalScore += delta;
      } else {
        if (bA.teacherId > 0) slotTeacherCounts[sB].set(bA.teacherId, slotTeacherCounts[sB].get(bA.teacherId)! - 1);
        if (bA.room) slotRoomCounts[sB].set(bA.room, slotRoomCounts[sB].get(bA.room)! - 1);
        if (bB.teacherId > 0) slotTeacherCounts[sA].set(bB.teacherId, slotTeacherCounts[sA].get(bB.teacherId)! - 1);
        if (bB.room) slotRoomCounts[sA].set(bB.room, slotRoomCounts[sA].get(bB.room)! - 1);

        if (bA.teacherId > 0) slotTeacherCounts[sA].set(bA.teacherId, slotTeacherCounts[sA].get(bA.teacherId)! + 1);
        if (bA.room) slotRoomCounts[sA].set(bA.room, slotRoomCounts[sA].get(bA.room)! + 1);
        if (bB.teacherId > 0) slotTeacherCounts[sB].set(bB.teacherId, slotTeacherCounts[sB].get(bB.teacherId)! + 1);
        if (bB.room) slotRoomCounts[sB].set(bB.room, slotRoomCounts[sB].get(bB.room)! + 1);
      }
    }

    if (totalScore < initialConflicts) {
      db.horarios = blocks.map((b, i) => {
        const dIdx = Math.floor(b.slotIdx / 6);
        const bIdx = b.slotIdx % 6;
        return {
          idHorario: b.idHorario || i + 1,
          idAno: b.idAno,
          idSeccion: b.idSeccion,
          idMateria: b.idMateria,
          diaSemana: DIAS[dIdx],
          horaInicio: BLOQUES[bIdx].inicio,
          horaFin: BLOQUES[bIdx].fin,
          aula: b.room || 'Aula',
        };
      });
    }

    return {
      success: true,
      totalBlocks: blocks.length,
      initialConflicts,
      finalConflicts: totalScore,
      message:
        totalScore === 0
          ? 'Todos los choques y conflictos de horarios, aulas y docentes fueron resueltos con éxito (0 conflictos).'
          : `Se optimizó la malla horaria reduciendo los conflictos de ${initialConflicts} a ${totalScore}.`,
    };
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
  if (!data.forceIgnoreConflict) {
    const check = await detectHorarioConflict({
      idAno: data.idAno,
      idSeccion: data.idSeccion,
      idMateria: data.idMateria,
      diaSemana: data.diaSemana,
      horaInicio: data.horaInicio,
      horaFin: data.horaFin,
      aula: data.aula,
    });
    if (check.hasConflict) {
      const errorMsg = check.conflicts.map((c) => c.message).join(' | ');
      throw new Error(`Conflicto de Horario Detectado: ${errorMsg}`);
    }
  }

  return withWriteLock((db) => {
    const created: Horario = {
      idHorario: nextNumericId(db.horarios, (h) => h.idHorario),
      idAno: Number(data.idAno),
      idSeccion: Number(data.idSeccion),
      idMateria: Number(data.idMateria),
      diaSemana: data.diaSemana,
      horaInicio: data.horaInicio,
      horaFin: data.horaFin,
      aula: data.aula ? data.aula.trim() : null,
    };
    db.horarios.push(created);
    return created;
  });
}

export async function updateHorario(
  idHorario: number,
  data: Partial<Horario> & { forceIgnoreConflict?: boolean }
): Promise<Horario> {
  const dbRead = await readDb();
  const curr = dbRead.horarios.find((h) => h.idHorario === Number(idHorario));
  if (!curr) throw new Error('Horario no encontrado');

  const targetAno = data.idAno ?? curr.idAno;
  const targetSeccion = data.idSeccion ?? curr.idSeccion;
  const targetMateria = data.idMateria ?? curr.idMateria;
  const targetDia = data.diaSemana ?? curr.diaSemana;
  const targetInicio = data.horaInicio ?? curr.horaInicio;
  const targetFin = data.horaFin ?? curr.horaFin;
  const targetAula = data.aula !== undefined ? data.aula : curr.aula;

  if (!data.forceIgnoreConflict) {
    const check = await detectHorarioConflict({
      idHorario: Number(idHorario),
      idAno: targetAno,
      idSeccion: targetSeccion,
      idMateria: targetMateria,
      diaSemana: targetDia,
      horaInicio: targetInicio,
      horaFin: targetFin,
      aula: targetAula,
    });
    if (check.hasConflict) {
      const errorMsg = check.conflicts.map((c) => c.message).join(' | ');
      throw new Error(`Conflicto de Horario Detectado: ${errorMsg}`);
    }
  }

  return withWriteLock((db) => {
    const idx = db.horarios.findIndex((h) => h.idHorario === Number(idHorario));
    if (idx === -1) throw new Error('Horario no encontrado');
    db.horarios[idx] = {
      ...db.horarios[idx],
      idAno: Number(targetAno),
      idSeccion: Number(targetSeccion),
      idMateria: Number(targetMateria),
      diaSemana: targetDia,
      horaInicio: targetInicio,
      horaFin: targetFin,
      aula: targetAula ? targetAula.trim() : null,
    };
    return db.horarios[idx];
  });
}

export async function deleteHorario(idHorario: number): Promise<void> {
  return withWriteLock((db) => {
    db.horarios = db.horarios.filter((h) => h.idHorario !== Number(idHorario));
  });
}

// ---------------------------------------------------------------------------
// 7. PORTAL DEL REPRESENTANTE
// ---------------------------------------------------------------------------
export async function getPortalRepresentanteData(
  idRepresentante: number
): Promise<PortalRepresentanteData | null> {
  const rep = await getRepresentanteById(idRepresentante);
  if (!rep) return null;

  const [config, recesos, salidasAll, lapsos, misEstudiantes, allHorarios] = await Promise.all([
    getConfiguracion(),
    getRecesos(true),
    getSalidas(true),
    getLapsos(),
    getEstudiantes({ idRepresentante }, false),
    getHorarios(),
  ]);

  const studentAnoIds = new Set(
    misEstudiantes
      .filter((e) => e.estadoAcademico !== 'EGRESADO')
      .map((e) => e.idAnoActual)
      .filter((id): id is number => id != null)
  );
  const salidas = salidasAll.filter((s) => !s.idAno || studentAnoIds.has(s.idAno));

  const asistenciasAll = await getAsistencia({ idRepresentante });
  const lapsoActivo = lapsos.find((l) => l.activo) || null;

  const estudiantesConDetalles = misEstudiantes.map((est) => {
    const studentHorarios =
      est.estadoAcademico !== 'EGRESADO' && est.idAnoActual && est.idSeccion
        ? allHorarios.filter((h) => h.idAno === est.idAnoActual && h.idSeccion === est.idSeccion)
        : [];
    return {
      idEstudiante: est.idEstudiante,
      cedula: est.cedula,
      nombres: est.nombres,
      apellidos: est.apellidos,
      idAnoActual: est.idAnoActual,
      idSeccion: est.idSeccion,
      estadoAcademico: est.estadoAcademico || 'ACTIVO',
      nombreNivel:
        est.estadoAcademico === 'EGRESADO' ? 'Egresado' : est.nombreNivel || 'Año Escolar',
      nombreSeccion: est.nombreSeccion,
      horarios: studentHorarios,
    };
  });

  const inboxResult = await getNotificacionesRepresentante(idRepresentante, { limit: 60 });

  return {
    representante: rep,
    configuracion: {
      anoLectivo: config.anoLectivo,
      nombreInstitucion: config.nombreInstitucion,
    },
    lapsos,
    lapsoActivo,
    recesos,
    salidas,
    notificaciones: inboxResult.notificaciones,
    notificacionesNoLeidas: inboxResult.unreadCount,
    estudiantes: estudiantesConDetalles,
    asistencias: asistenciasAll
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.horaEntrada.localeCompare(a.horaEntrada))
      .map((a) => ({
        idAsistencia: a.idAsistencia,
        idEstudiante: a.idEstudiante,
        lapsoId: a.lapsoId ?? null,
        lapsoNombre: a.lapsoNombre ?? null,
        numeroLapso: a.numeroLapso ?? null,
        fecha: a.fecha,
        horaEntrada: a.horaEntrada,
        estado: a.estado,
        nombreMateria: a.nombreMateria || 'Asignatura',
        motivoJustificacion: a.motivoJustificacion ?? null,
        numeroJustificante: a.numeroJustificante ?? null,
        fechaRecepcionDocumento: a.fechaRecepcionDocumento ?? null,
        modificadoPorNombre: a.modificadoPorNombre ?? null,
        fechaModificacion: a.fechaModificacion ?? null,
      })),
  };
}

// ---------------------------------------------------------------------------
// 8. AUDITORÍA, RESPALDOS & RESTAURACIÓN
// ---------------------------------------------------------------------------
export async function logAuditEvent(entry: {
  idUsuario?: number | null;
  emailOCedula?: string | null;
  rol?: string | null;
  accion: string;
  entidad: string;
  idEntidad?: string | number | null;
  ipOrigen?: string | null;
  userAgent?: string | null;
  detalles?: Record<string, any> | string | null;
}): Promise<AuditLog | null> {
  try {
    return await withWriteLock((db) => {
      const logEntry: AuditLog = {
        idLog: nextNumericId(db.auditLogs, (l) => l.idLog),
        idUsuario: entry.idUsuario ?? null,
        emailOCedula: entry.emailOCedula ? String(entry.emailOCedula).trim() : null,
        rol: entry.rol ? String(entry.rol).trim() : null,
        accion: entry.accion.trim(),
        entidad: entry.entidad.trim(),
        idEntidad: entry.idEntidad != null ? String(entry.idEntidad).trim() : null,
        ipOrigen: entry.ipOrigen ? String(entry.ipOrigen).trim() : null,
        userAgent: entry.userAgent ? String(entry.userAgent).trim().slice(0, 500) : null,
        detalles: entry.detalles ?? null,
        createdAt: new Date().toISOString(),
      };
      db.auditLogs.unshift(logEntry);
      if (db.auditLogs.length > 2000) {
        db.auditLogs = db.auditLogs.slice(0, 2000);
      }
      return logEntry;
    });
  } catch (err) {
    console.error('[LocalDB] Error logging audit event:', err);
    return null;
  }
}

export async function getAuditLogs(
  limit: number = 100,
  filtro?: { accion?: string; entidad?: string }
): Promise<AuditLog[]> {
  const res = await getAuditLogsPaginated({
    page: 1,
    limit: Math.min(Number(limit) || 100, 500),
    accion: filtro?.accion,
    entidad: filtro?.entidad,
  });
  return res.data;
}

export async function getAuditLogsPaginated(params: {
  page?: number;
  limit?: number;
  accion?: string;
  entidad?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
}): Promise<PaginatedResponse<AuditLog>> {
  const db = await readDb();
  const page = Math.max(1, Number(params.page) || 1);
  const limit = Math.min(Math.max(1, Number(params.limit) || 25), 500);
  const offset = (page - 1) * limit;

  const accionFilter = params.accion ? params.accion.trim().toLowerCase() : '';
  const entidadFilter = params.entidad ? params.entidad.trim().toLowerCase() : '';
  const searchLower = params.search ? params.search.trim().toLowerCase() : '';

  // db.auditLogs se inserta con unshift() manteniendo orden descendente por createdAt
  const matched: AuditLog[] = [];
  for (const log of db.auditLogs) {
    if (accionFilter && !log.accion.toLowerCase().includes(accionFilter)) continue;
    if (entidadFilter && log.entidad.toLowerCase() !== entidadFilter) continue;

    if (params.startDate || params.endDate) {
      const logDay = String(log.createdAt || '').slice(0, 10);
      if (params.startDate && logDay < params.startDate) continue;
      if (params.endDate && logDay > params.endDate) continue;
    }

    if (searchLower) {
      const matches =
        log.accion.toLowerCase().includes(searchLower) ||
        (log.emailOCedula || '').toLowerCase().includes(searchLower) ||
        log.entidad.toLowerCase().includes(searchLower) ||
        (log.ipOrigen || '').toLowerCase().includes(searchLower);
      if (!matches) continue;
    }

    matched.push(log);
  }

  // Asegurar orden descendente por createdAt ante restauraciones o importaciones
  matched.sort((a, b) => {
    const cmp = String(b.createdAt).localeCompare(String(a.createdAt));
    return cmp !== 0 ? cmp : b.idLog - a.idLog;
  });

  const totalCount = matched.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));
  const data = matched.slice(offset, offset + limit);

  return {
    data,
    pagination: {
      page,
      limit,
      totalCount,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  };
}

export async function getDatabaseStats() {
  const db = await readDb();
  return {
    anosEscolares: db.anosEscolares.length,
    lapsosEscolares: db.lapsosEscolares.length,
    secciones: db.secciones.length,
    materias: db.materias.length,
    estudiantes: db.estudiantes.length,
    representantes: db.representantes.length,
    asistencias: db.asistencia.length,
    horarios: db.horarios.length,
    salidasInstitucionales: db.salidasInstitucionales.length,
    diasNoLaborables: db.diasNoLaborables.length,
    usuariosPersonal: db.users.length,
    logsAuditoria: db.auditLogs.length,
  };
}

export async function createFullDatabaseBackup(authorInfo?: { id?: number; email?: string; rol?: string }) {
  const db = await readDb();
  return {
    metadata: {
      sistema: 'EduAsist - Sistema de Control de Asistencia Escolar',
      version: '1.0.0',
      fechaGeneracion: new Date().toISOString(),
      generadoPor: authorInfo || { email: 'director@eduasist.edu', rol: 'director' },
      resumenConteos: {
        configuracion: db.configuracionInstitucional.length,
        recesos: db.recesosInstitucionales.length,
        salidas: db.salidasInstitucionales.length,
        lapsosEscolares: db.lapsosEscolares.length,
        diasNoLaborables: db.diasNoLaborables.length,
        anosEscolares: db.anosEscolares.length,
        secciones: db.secciones.length,
        materias: db.materias.length,
        asignacionesDocentes: db.docenteMaterias.length,
        representantes: db.representantes.length,
        estudiantes: db.estudiantes.length,
        asistencias: db.asistencia.length,
        horarios: db.horarios.length,
        usuariosPersonal: db.users.length,
        notificacionesRepresentante: db.notificacionesRepresentante.length,
      },
    },
    data: {
      configuracionInstitucional: db.configuracionInstitucional,
      recesosInstitucionales: db.recesosInstitucionales,
      salidasInstitucionales: db.salidasInstitucionales,
      lapsosEscolares: db.lapsosEscolares,
      diasNoLaborables: db.diasNoLaborables,
      anosEscolares: db.anosEscolares,
      secciones: db.secciones,
      materias: db.materias,
      docenteMaterias: db.docenteMaterias,
      representantes: db.representantes,
      estudiantes: db.estudiantes,
      asistencia: db.asistencia,
      horarios: db.horarios,
      users: db.users,
      notificacionesRepresentante: db.notificacionesRepresentante,
    },
  };
}

export async function restoreFullDatabaseBackup(backupPayload: any) {
  if (!backupPayload || !backupPayload.data) {
    throw new Error('Archivo de respaldo inválido o estructura de datos corrupta.');
  }

  return withWriteLock(async (db) => {
    const normalized = await normalizeAndEnsureIntegrity({
      ...backupPayload.data,
      auditLogs: db.auditLogs,
      pushSubscriptions: db.pushSubscriptions,
      milestoneDispatches: db.milestoneDispatches,
      notificacionesRepresentante:
        backupPayload.data.notificacionesRepresentante ?? db.notificacionesRepresentante,
    });

    Object.assign(db, normalized);

    return {
      success: true,
      mensaje: 'Base de datos restaurada correctamente desde la copia de seguridad.',
      tablasRestauradas: Object.keys(backupPayload.data).length,
    };
  });
}

export async function resetDatabaseToMasterSeed() {
  return withWriteLock(async (db) => {
    const adminHash = await bcrypt.hash('admin1234', 10);
    db.asistencia = [];
    db.horarios = [];
    db.docenteMaterias = [];
    db.estudiantes = [];
    db.representantes = [];
    db.pushSubscriptions = [];
    db.notificacionesRepresentante = [];
    db.users = [
      {
        id: 1,
        uid: 'usr_admin_master',
        usuario: 'admin',
        email: 'admin@eduasist.edu',
        nombre: 'Admin',
        apellidos: 'Principal',
        cedula: 'admin',
        telefono: '0414-0000000',
        rol: 'director',
        activo: true,
        passwordHash: adminHash,
        createdAt: new Date().toISOString(),
      },
    ];

    return {
      success: true,
      mensaje:
        'Sistema reiniciado a la semilla oficial con el usuario maestro Director (usuario: admin / admin@eduasist.edu).',
    };
  });
}

// ---------------------------------------------------------------------------
// 9. SUSCRIPCIONES WEB PUSH
// ---------------------------------------------------------------------------
export async function upsertPushSubscription(params: {
  idRepresentante: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
}): Promise<PushSubscriptionRecord> {
  return withWriteLock((db) => {
    const idx = db.pushSubscriptions.findIndex((s) => s.endpoint === params.endpoint);
    if (idx !== -1) {
      db.pushSubscriptions[idx] = {
        ...db.pushSubscriptions[idx],
        idRepresentante: Number(params.idRepresentante),
        p256dh: params.p256dh,
        auth: params.auth,
        userAgent: params.userAgent || null,
        activa: true,
      };
      return db.pushSubscriptions[idx];
    }
    const created: PushSubscriptionRecord = {
      idSubscription: nextNumericId(db.pushSubscriptions, (s) => s.idSubscription),
      idRepresentante: Number(params.idRepresentante),
      endpoint: params.endpoint,
      p256dh: params.p256dh,
      auth: params.auth,
      userAgent: params.userAgent || null,
      activa: true,
      createdAt: new Date().toISOString(),
    };
    db.pushSubscriptions.push(created);
    return created;
  });
}

export async function deactivatePushSubscriptionForRep(
  endpoint: string,
  idRepresentante: number
): Promise<boolean> {
  return withWriteLock((db) => {
    const before = db.pushSubscriptions.length;
    db.pushSubscriptions = db.pushSubscriptions.filter(
      (s) => !(s.endpoint === endpoint && s.idRepresentante === Number(idRepresentante))
    );
    return db.pushSubscriptions.length < before;
  });
}

export async function deletePushSubscriptionsByEndpoints(endpoints: string[]): Promise<void> {
  if (!endpoints.length) return;
  const set = new Set(endpoints);
  await withWriteLock((db) => {
    db.pushSubscriptions = db.pushSubscriptions.filter((s) => !set.has(s.endpoint));
  });
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const hashA = crypto.createHash('sha256').update(String(a || ''), 'utf8').digest();
  const hashB = crypto.createHash('sha256').update(String(b || ''), 'utf8').digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

export async function rotatePushSubscriptionByPreviousKeys(params: {
  oldEndpoint: string;
  oldP256dh: string;
  oldAuth: string;
  newEndpoint: string;
  newP256dh: string;
  newAuth: string;
  userAgent?: string | null;
  expectedRepId?: number;
}): Promise<{ rotated: boolean; idRepresentante?: number; idSubscription?: number }> {
  return withWriteLock((db) => {
    const existingIdx = db.pushSubscriptions.findIndex(
      (s) => s.endpoint === params.oldEndpoint && s.activa
    );
    if (existingIdx === -1) {
      return { rotated: false };
    }
    const existing = db.pushSubscriptions[existingIdx];
    if (
      params.expectedRepId !== undefined &&
      existing.idRepresentante !== Number(params.expectedRepId)
    ) {
      return { rotated: false };
    }

    if (
      !timingSafeEqualStr(existing.p256dh, params.oldP256dh) ||
      !timingSafeEqualStr(existing.auth, params.oldAuth)
    ) {
      return { rotated: false };
    }

    const rep = db.representantes.find((r) => r.idRepresentante === existing.idRepresentante);
    if (!rep || rep.activo === false) {
      return { rotated: false };
    }

    const nowIso = new Date().toISOString();
    // Si ya existía otra entrada con el nuevo endpoint, limpiarla antes de actualizar
    db.pushSubscriptions = db.pushSubscriptions.filter(
      (s, idx) => idx === existingIdx || s.endpoint !== params.newEndpoint
    );
    const updatedIdx = db.pushSubscriptions.findIndex(
      (s) => s.idSubscription === existing.idSubscription
    );
    if (updatedIdx === -1) {
      return { rotated: false };
    }

    db.pushSubscriptions[updatedIdx] = {
      ...db.pushSubscriptions[updatedIdx],
      endpoint: params.newEndpoint,
      p256dh: params.newP256dh,
      auth: params.newAuth,
      userAgent: params.userAgent || db.pushSubscriptions[updatedIdx].userAgent || null,
      activa: true,
      lastUsed: nowIso,
    };

    return {
      rotated: true,
      idRepresentante: existing.idRepresentante,
      idSubscription: existing.idSubscription,
    };
  });
}

export async function markPushSubscriptionsUsed(endpoints: string[]): Promise<void> {
  if (!endpoints.length) return;
  const set = new Set(endpoints);
  const nowIso = new Date().toISOString();
  await withWriteLock((db) => {
    for (let i = 0; i < db.pushSubscriptions.length; i++) {
      if (set.has(db.pushSubscriptions[i].endpoint)) {
        db.pushSubscriptions[i] = {
          ...db.pushSubscriptions[i],
          lastUsed: nowIso,
        };
      }
    }
  });
}

export async function getPushSubscriptionsCountForRep(idRepresentante: number): Promise<number> {
  const db = await readDb();
  return db.pushSubscriptions.filter(
    (s) => s.idRepresentante === Number(idRepresentante) && s.activa
  ).length;
}

export async function getPushSubscriptionsForRep(
  idRepresentante: number
): Promise<PushSubscriptionRecord[]> {
  const db = await readDb();
  return db.pushSubscriptions.filter(
    (s) => s.idRepresentante === Number(idRepresentante) && s.activa
  );
}

export async function getPushDispatchPayloadForBatch(
  idMateria: number,
  records: Array<{
    idEstudiante: number;
    estado: string;
    horaEntrada?: string;
    motivoJustificacion?: string | null;
  }>
) {
  const db = await readDb();
  const mat = db.materias.find((m) => m.idMateria === Number(idMateria));
  const estMap = new Map(db.estudiantes.map((e) => [e.idEstudiante, e]));
  const activeRepIds = new Set(
    db.representantes.filter((r) => r.activo !== false).map((r) => r.idRepresentante)
  );

  const resolvedRecords = records
    .map((r) => {
      const est = estMap.get(Number(r.idEstudiante));
      if (!est || !activeRepIds.has(est.idRepresentante)) return null;
      return {
        idEstudiante: est.idEstudiante,
        estado: r.estado,
        horaEntrada: r.horaEntrada,
        motivoJustificacion: r.motivoJustificacion ?? null,
        idRepresentante: est.idRepresentante,
        estudianteNombre: `${est.nombres} ${est.apellidos}`.trim(),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const repIds = new Set(resolvedRecords.map((r) => r.idRepresentante));
  const rawSubs = db.pushSubscriptions.filter((s) => s.activa && repIds.has(s.idRepresentante));
  const subscriptions = Array.from(
    new Map(
      rawSubs.map((s) => [
        s.endpoint,
        {
          idRepresentante: s.idRepresentante,
          endpoint: s.endpoint,
          p256dh: s.p256dh,
          auth: s.auth,
        },
      ])
    ).values()
  );

  return {
    idMateria: Number(idMateria),
    nombreMateria: mat?.nombreMateria || 'Asignatura',
    records: resolvedRecords,
    subscriptions,
  };
}

export async function getSalidasPushDispatchPayload(idSalida: number) {
  const db = await readDb();
  const salidaRaw = db.salidasInstitucionales.find((s) => s.idSalida === Number(idSalida));
  if (!salidaRaw) {
    throw new Error('Configuración de hora de salida no encontrada.');
  }

  const anoMap = new Map(db.anosEscolares.map((a) => [a.idAno, a.nombreNivel]));
  const activeRepIds = new Set(
    db.representantes.filter((r) => r.activo !== false).map((r) => r.idRepresentante)
  );
  const nombreNivel = salidaRaw.idAno
    ? anoMap.get(Number(salidaRaw.idAno)) || 'Año Escolar'
    : 'Toda la institución';

  const salida: SalidaInstitucional = {
    ...salidaRaw,
    idAno: salidaRaw.idAno != null && Number(salidaRaw.idAno) > 0 ? Number(salidaRaw.idAno) : null,
    nombreNivel,
  };

  const matchingEstudiantes = db.estudiantes.filter(
    (est) =>
      est.estadoAcademico !== 'EGRESADO' &&
      est.idAnoActual != null &&
      activeRepIds.has(est.idRepresentante) &&
      (!salida.idAno || est.idAnoActual === salida.idAno)
  );

  const groupedByRep = new Map<
    number,
    {
      idRepresentante: number;
      estudiantes: Array<{ idEstudiante: number; nombre: string }>;
    }
  >();

  for (const est of matchingEstudiantes) {
    if (!est.idRepresentante) continue;
    let bucket = groupedByRep.get(est.idRepresentante);
    if (!bucket) {
      bucket = { idRepresentante: est.idRepresentante, estudiantes: [] };
      groupedByRep.set(est.idRepresentante, bucket);
    }
    bucket.estudiantes.push({
      idEstudiante: est.idEstudiante,
      nombre: `${est.nombres} ${est.apellidos}`.trim(),
    });
  }

  const targets = Array.from(groupedByRep.values());
  const repIds = new Set(targets.map((t) => t.idRepresentante));

  const rawSubs = db.pushSubscriptions.filter((s) => s.activa && repIds.has(s.idRepresentante));
  const subscriptions = Array.from(
    new Map(
      rawSubs.map((s) => [
        s.endpoint,
        {
          idRepresentante: s.idRepresentante,
          endpoint: s.endpoint,
          p256dh: s.p256dh,
          auth: s.auth,
        },
      ])
    ).values()
  );

  const nombreInstitucion =
    db.configuracionInstitucional.find((c) => c.clave === 'nombre_institucion')?.valor ||
    'la institución';

  return {
    salida,
    nombreInstitucion,
    targets,
    subscriptions,
  };
}

export async function getEligibleRepresentantesForMilestones(): Promise<number[]> {
  const db = await readDb();
  const activeAnoIds = new Set(
    db.anosEscolares.filter((a) => a.activo !== false).map((a) => a.idAno)
  );
  const activeRepIds = new Set(
    db.representantes.filter((r) => r.activo !== false).map((r) => r.idRepresentante)
  );

  const eligibleRepIds = new Set<number>();
  for (const est of db.estudiantes) {
    if (!est.idRepresentante || !activeRepIds.has(est.idRepresentante)) continue;
    if (est.estadoAcademico === 'EGRESADO' || est.idAnoActual == null) continue;
    if (activeAnoIds.size === 0 || activeAnoIds.has(est.idAnoActual)) {
      eligibleRepIds.add(est.idRepresentante);
    }
  }
  return Array.from(eligibleRepIds);
}

export async function getMilestonePushTargets(): Promise<{
  targetRepresentantes: number;
  targetDevices: number;
  eligibleRepresentanteIds: number[];
  subscriptions: Array<{
    idRepresentante: number;
    endpoint: string;
    p256dh: string;
    auth: string;
  }>;
}> {
  const db = await readDb();
  const eligibleRepIdsList = await getEligibleRepresentantesForMilestones();
  const eligibleRepIds = new Set(eligibleRepIdsList);

  const rawSubs = db.pushSubscriptions.filter(
    (s) => s.activa && eligibleRepIds.has(s.idRepresentante)
  );
  const uniqueSubs = Array.from(
    new Map(
      rawSubs.map((s) => [
        s.endpoint,
        {
          idRepresentante: s.idRepresentante,
          endpoint: s.endpoint,
          p256dh: s.p256dh,
          auth: s.auth,
        },
      ])
    ).values()
  );

  const uniqueSubscribedReps = new Set(uniqueSubs.map((s) => s.idRepresentante));

  return {
    targetRepresentantes: uniqueSubscribedReps.size,
    targetDevices: uniqueSubs.length,
    eligibleRepresentanteIds: eligibleRepIdsList,
    subscriptions: uniqueSubs,
  };
}

export async function recordMilestoneDispatch(entry: MilestoneDispatchRecord): Promise<void> {
  await withWriteLock((db) => {
    db.milestoneDispatches.unshift(entry);
    if (db.milestoneDispatches.length > 100) {
      db.milestoneDispatches = db.milestoneDispatches.slice(0, 100);
    }
  });
}

export async function hasMilestoneDispatchedToday(
  date: string,
  tipo: 'receso' | 'salida',
  trigger: 'auto' | 'manual'
): Promise<boolean> {
  const db = await readDb();
  return db.milestoneDispatches.some(
    (d) => d.date === date && d.tipo === tipo && d.trigger === trigger
  );
}

export async function getMilestoneDispatches(
  limit: number = 20
): Promise<MilestoneDispatchRecord[]> {
  const db = await readDb();
  return db.milestoneDispatches.slice(0, Math.max(1, limit));
}

// ---------------------------------------------------------------------------
// 10. BANDEJA DE NOTIFICACIONES PERSISTENTES PARA REPRESENTANTES
// ---------------------------------------------------------------------------
const MAX_NOTIFICATIONS_PER_REP = 100;
const MAX_NOTIFICATIONS_GLOBAL = 6000;

export async function createNotificacionesRepresentanteBatch(
  items: Array<{
    idRepresentante: number;
    tipo: TipoNotificacionRepresentante;
    titulo: string;
    mensaje: string;
    fechaEvento: string;
    horaEvento: string;
    metadata?: NotificacionRepresentante['metadata'];
  }>
): Promise<NotificacionRepresentante[]> {
  if (!items || items.length === 0) return [];

  return withWriteLock((db) => {
    const activeRepIds = new Set(
      db.representantes.filter((r) => r.activo !== false).map((r) => r.idRepresentante)
    );
    const nowIso = new Date().toISOString();
    let nextId = nextNumericId(db.notificacionesRepresentante, (n) => n.idNotificacion);
    const createdList: NotificacionRepresentante[] = [];

    for (const item of items) {
      const repId = Number(item.idRepresentante);
      if (!activeRepIds.has(repId)) continue;

      const created: NotificacionRepresentante = {
        idNotificacion: nextId++,
        idRepresentante: repId,
        tipo: item.tipo,
        titulo: String(item.titulo || 'Notificación Escolar').trim(),
        mensaje: String(item.mensaje || '').trim(),
        fechaEvento: String(item.fechaEvento || '').trim(),
        horaEvento: String(item.horaEvento || '').trim(),
        leida: false,
        leidaAt: null,
        createdAt: nowIso,
        ...(item.metadata ? { metadata: item.metadata } : {}),
      };
      db.notificacionesRepresentante.unshift(created);
      createdList.push(created);
    }

    if (createdList.length > 0) {
      // Conservar máximo MAX_NOTIFICATIONS_PER_REP por representante y límite global acotado
      const countByRep = new Map<number, number>();
      db.notificacionesRepresentante = db.notificacionesRepresentante
        .filter((n) => {
          const c = (countByRep.get(n.idRepresentante) || 0) + 1;
          countByRep.set(n.idRepresentante, c);
          return c <= MAX_NOTIFICATIONS_PER_REP;
        })
        .slice(0, MAX_NOTIFICATIONS_GLOBAL);
    }

    return createdList;
  });
}

export async function getNotificacionesRepresentante(
  idRepresentante: number,
  options?: { onlyUnread?: boolean; limit?: number }
): Promise<{ notificaciones: NotificacionRepresentante[]; unreadCount: number }> {
  const db = await readDb();
  const repId = Number(idRepresentante);
  const allForRep = db.notificacionesRepresentante
    .filter((n) => n.idRepresentante === repId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.idNotificacion - a.idNotificacion);

  const unreadCount = allForRep.reduce((acc, n) => acc + (n.leida ? 0 : 1), 0);
  const filtered = options?.onlyUnread ? allForRep.filter((n) => !n.leida) : allForRep;
  const limit = Math.min(100, Math.max(1, Number(options?.limit ?? 60)));

  return {
    notificaciones: filtered.slice(0, limit),
    unreadCount,
  };
}

export async function markNotificacionLeida(
  idRepresentante: number,
  idNotificacion: number
): Promise<NotificacionRepresentante | null> {
  return withWriteLock((db) => {
    const idx = db.notificacionesRepresentante.findIndex(
      (n) =>
        n.idNotificacion === Number(idNotificacion) &&
        n.idRepresentante === Number(idRepresentante)
    );
    if (idx === -1) return null;

    if (!db.notificacionesRepresentante[idx].leida) {
      db.notificacionesRepresentante[idx] = {
        ...db.notificacionesRepresentante[idx],
        leida: true,
        leidaAt: new Date().toISOString(),
      };
    }
    return db.notificacionesRepresentante[idx];
  });
}

export async function markTodasNotificacionesLeidas(
  idRepresentante: number
): Promise<{ updatedCount: number }> {
  return withWriteLock((db) => {
    const repId = Number(idRepresentante);
    const nowIso = new Date().toISOString();
    let updatedCount = 0;

    for (let i = 0; i < db.notificacionesRepresentante.length; i++) {
      const item = db.notificacionesRepresentante[i];
      if (item.idRepresentante === repId && !item.leida) {
        db.notificacionesRepresentante[i] = {
          ...item,
          leida: true,
          leidaAt: nowIso,
        };
        updatedCount++;
      }
    }

    return { updatedCount };
  });
}
