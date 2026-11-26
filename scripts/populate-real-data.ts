import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import type {
  AnoEscolar,
  AuditLog,
  ConfiguracionInstitucional,
  DiaNoLaborable,
  DocenteMateria,
  Estudiante,
  Horario,
  LapsoEscolar,
  Materia,
  NotificacionRepresentante,
  RecesoInstitucional,
  RegistroAsistencia,
  Representante,
  RolUsuario,
  SalidaInstitucional,
  Seccion,
  Usuario,
} from '../src/types.ts';

const DB_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DB_DIR, 'eduasist-db.json');

interface StoredUser extends Usuario {
  passwordHash: string;
}

interface StoredRepresentante extends Representante {
  passwordHash: string;
}

async function main() {
  console.log('[Populate] Generando base de datos institucional realista para EduAsist...');
  const nowIso = new Date().toISOString();

  const [adminHash, docenteHash, repHash] = await Promise.all([
    bcrypt.hash('admin1234', 10),
    bcrypt.hash('docente123', 10),
    bcrypt.hash('rep123', 10),
  ]);

  // 1. Configuración Institucional
  const configuracionInstitucional: ConfiguracionInstitucional[] = [
    {
      idConfig: 1,
      clave: 'ano_lectivo',
      valor: '2026 - 2027',
      descripcion: 'Año lectivo escolar vigente',
      updatedAt: nowIso,
    },
    {
      idConfig: 2,
      clave: 'nombre_institucion',
      valor: 'Liceo Nacional Bolivariano "Gran Mariscal de Ayacucho"',
      descripcion: 'Nombre oficial del plantel educativo',
      updatedAt: nowIso,
    },
    {
      idConfig: 3,
      clave: 'codigo_plantel',
      valor: 'S0424D0101',
      descripcion: 'Código DEA oficial del plantel',
      updatedAt: nowIso,
    },
    {
      idConfig: 4,
      clave: 'hora_receso_inicio',
      valor: '09:15',
      descripcion: 'Hora oficial de inicio del receso escolar (HH:MM)',
      updatedAt: nowIso,
    },
    {
      idConfig: 5,
      clave: 'hora_receso_fin',
      valor: '09:45',
      descripcion: 'Hora oficial de finalización del receso escolar (HH:MM)',
      updatedAt: nowIso,
    },
    {
      idConfig: 6,
      clave: 'hora_salida',
      valor: '12:30',
      descripcion: 'Hora oficial de salida de clases de la institución (HH:MM)',
      updatedAt: nowIso,
    },
    {
      idConfig: 7,
      clave: 'alerta_receso_activa',
      valor: 'true',
      descripcion: 'Envío automático de notificación push al iniciar el receso',
      updatedAt: nowIso,
    },
    {
      idConfig: 8,
      clave: 'alerta_salida_activa',
      valor: 'true',
      descripcion: 'Envío automático de notificación push a la hora de salida',
      updatedAt: nowIso,
    },
  ];

  // 2. Recesos y Salidas
  const recesosInstitucionales: RecesoInstitucional[] = [
    {
      idReceso: 1,
      nombre: 'Receso Matutino',
      horaInicio: '09:15',
      horaFin: '09:45',
      activo: true,
      descripcion: 'Descanso pedagógico matutino para desayuno y recreación',
    },
  ];

  const salidasInstitucionales: SalidaInstitucional[] = [
    {
      idSalida: 1,
      nombre: 'Hora de Salida Oficial',
      horaSalida: '12:30',
      idAno: null,
      activo: true,
      notificarPush: true,
      descripcion: 'Culminación regular de la jornada matutina',
      ultimaNotificacionFecha: null,
      ultimaNotificacionHora: null,
    },
  ];

  // 3. Lapsos Escolares (ciclo anterior cerrado 2025-2026 + ciclo activo 2026-2027)
  const lapsosEscolares: LapsoEscolar[] = [
    {
      id: 1,
      nombre: 'Primer Lapso',
      numeroLapso: 1,
      fechaInicio: '2025-09-15',
      fechaFin: '2025-12-19',
      anioEscolar: '2025 - 2026',
      activo: false,
      createdAt: '2025-09-10T12:00:00.000Z',
      updatedAt: '2025-12-20T15:00:00.000Z',
    },
    {
      id: 2,
      nombre: 'Segundo Lapso',
      numeroLapso: 2,
      fechaInicio: '2026-01-08',
      fechaFin: '2026-03-27',
      anioEscolar: '2025 - 2026',
      activo: false,
      createdAt: '2026-01-05T12:00:00.000Z',
      updatedAt: '2026-03-28T15:00:00.000Z',
    },
    {
      id: 3,
      nombre: 'Tercer Lapso',
      numeroLapso: 3,
      fechaInicio: '2026-04-06',
      fechaFin: '2026-07-17',
      anioEscolar: '2025 - 2026',
      activo: false,
      createdAt: '2026-04-01T12:00:00.000Z',
      updatedAt: '2026-07-18T15:00:00.000Z',
    },
    {
      id: 4,
      nombre: 'Primer Lapso',
      numeroLapso: 1,
      fechaInicio: '2026-09-14',
      fechaFin: '2026-12-18',
      anioEscolar: '2026 - 2027',
      activo: true,
      createdAt: '2026-09-01T12:00:00.000Z',
      updatedAt: nowIso,
    },
    {
      id: 5,
      nombre: 'Segundo Lapso',
      numeroLapso: 2,
      fechaInicio: '2027-01-07',
      fechaFin: '2027-03-26',
      anioEscolar: '2026 - 2027',
      activo: false,
      createdAt: '2026-09-01T12:00:00.000Z',
      updatedAt: nowIso,
    },
    {
      id: 6,
      nombre: 'Tercer Lapso',
      numeroLapso: 3,
      fechaInicio: '2027-04-05',
      fechaFin: '2027-07-16',
      anioEscolar: '2026 - 2027',
      activo: false,
      createdAt: '2026-09-01T12:00:00.000Z',
      updatedAt: nowIso,
    },
  ];

  // 4. Días No Laborables / Feriados
  const diasNoLaborables: DiaNoLaborable[] = [
    {
      id: 1,
      fechaInicio: '2026-10-12',
      fechaFin: '2026-10-12',
      motivo: 'Día de la Resistencia Indígena (Feriado Nacional)',
      lapsoId: 4,
      createdAt: '2026-09-15T10:00:00.000Z',
    },
    {
      id: 2,
      fechaInicio: '2026-11-02',
      fechaFin: '2026-11-02',
      motivo: 'Jornada Pedagógica / Consejo Docente Institucional',
      lapsoId: 4,
      createdAt: '2026-10-20T10:00:00.000Z',
    },
    {
      id: 3,
      fechaInicio: '2026-12-21',
      fechaFin: '2027-01-06',
      motivo: 'Receso Navideño y Año Nuevo',
      lapsoId: null,
      createdAt: '2026-09-15T10:00:00.000Z',
    },
  ];

  // 5. Personal Institucional (Director maestro + Coordinador + Directivo + 10 Docentes)
  const staffDefs: Array<{
    id: number;
    uid: string;
    usuario: string | null;
    email: string;
    nombre: string;
    apellidos: string;
    cedula: string;
    telefono: string;
    rol: RolUsuario;
    hash: string;
  }> = [
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
      hash: adminHash,
    },
    {
      id: 2,
      uid: 'usr_director_acad',
      usuario: 'fvalbuena',
      email: 'director@eduasist.edu',
      nombre: 'Fernando José',
      apellidos: 'Valbuena Martínez',
      cedula: 'V-11458920',
      telefono: '0414-5123490',
      rol: 'director',
      hash: adminHash,
    },
    {
      id: 3,
      uid: 'usr_coord_acad',
      usuario: 'coordinador',
      email: 'coordinacion@eduasist.edu',
      nombre: 'Elena Beatriz',
      apellidos: 'Morales Mendoza',
      cedula: 'V-12904318',
      telefono: '0412-6782341',
      rol: 'coordinador',
      hash: adminHash,
    },
    {
      id: 4,
      uid: 'usr_doc_ramos',
      usuario: 'rramos',
      email: 'ricardo.ramos@eduasist.edu',
      nombre: 'Ricardo Antonio',
      apellidos: 'Ramos Silva',
      cedula: 'V-14203891',
      telefono: '0424-7891234',
      rol: 'docente',
      hash: docenteHash,
    },
    {
      id: 5,
      uid: 'usr_doc_salazar',
      usuario: 'csalazar',
      email: 'carmen.salazar@eduasist.edu',
      nombre: 'Carmen Yolanda',
      apellidos: 'Salazar Peña',
      cedula: 'V-15092341',
      telefono: '0416-4321987',
      rol: 'docente',
      hash: docenteHash,
    },
    {
      id: 6,
      uid: 'usr_doc_rojas',
      usuario: 'yrojas',
      email: 'yulimar.rojas@eduasist.edu',
      nombre: 'Yulimar Del Carmen',
      apellidos: 'Rojas Rodríguez',
      cedula: 'V-16324510',
      telefono: '0414-9872310',
      rol: 'docente',
      hash: docenteHash,
    },
    {
      id: 7,
      uid: 'usr_doc_gomez',
      usuario: 'rgomez',
      email: 'roberto.gomez@eduasist.edu',
      nombre: 'Roberto Carlos',
      apellidos: 'Gómez Quintero',
      cedula: 'V-13882014',
      telefono: '0412-5543218',
      rol: 'docente',
      hash: docenteHash,
    },
    {
      id: 8,
      uid: 'usr_doc_blanco',
      usuario: 'ablanco',
      email: 'andres.blanco@eduasist.edu',
      nombre: 'Andrés Eloy',
      apellidos: 'Blanco Márquez',
      cedula: 'V-17450129',
      telefono: '0424-3129045',
      rol: 'docente',
      hash: docenteHash,
    },
    {
      id: 9,
      uid: 'usr_doc_silva',
      usuario: 'msilva',
      email: 'mariangel.silva@eduasist.edu',
      nombre: 'Mariángel Carolina',
      apellidos: 'Silva Tovar',
      cedula: 'V-18234901',
      telefono: '0414-7650912',
      rol: 'docente',
      hash: docenteHash,
    },
    {
      id: 10,
      uid: 'usr_doc_mendez',
      usuario: 'gmendez',
      email: 'gabriel.mendez@eduasist.edu',
      nombre: 'Gabriel Alejandro',
      apellidos: 'Méndez Rivas',
      cedula: 'V-19012487',
      telefono: '0416-8901234',
      rol: 'docente',
      hash: docenteHash,
    },
    {
      id: 11,
      uid: 'usr_doc_perez',
      usuario: 'dperez',
      email: 'daniela.perez@eduasist.edu',
      nombre: 'Daniela Coromoto',
      apellidos: 'Pérez Moreno',
      cedula: 'V-16873420',
      telefono: '0412-3459812',
      rol: 'docente',
      hash: docenteHash,
    },
    {
      id: 12,
      uid: 'usr_doc_castillo',
      usuario: 'lcastillo',
      email: 'luis.castillo@eduasist.edu',
      nombre: 'Luis Eduardo',
      apellidos: 'Castillo Duarte',
      cedula: 'V-15409821',
      telefono: '0424-6543219',
      rol: 'docente',
      hash: docenteHash,
    },
    {
      id: 13,
      uid: 'usr_doc_herrera',
      usuario: 'pherrera',
      email: 'patricia.herrera@eduasist.edu',
      nombre: 'Patricia Valentina',
      apellidos: 'Herrera León',
      cedula: 'V-17901234',
      telefono: '0414-2348765',
      rol: 'docente',
      hash: docenteHash,
    },
  ];

  const users: StoredUser[] = staffDefs.map((s) => ({
    id: s.id,
    uid: s.uid,
    usuario: s.usuario,
    email: s.email,
    nombre: s.nombre,
    apellidos: s.apellidos,
    cedula: s.cedula,
    telefono: s.telefono,
    rol: s.rol,
    activo: true,
    passwordHash: s.hash,
    createdAt: '2026-09-01T12:00:00.000Z',
  }));

  // 6. Años Escolares y Secciones
  const anosEscolares: AnoEscolar[] = [
    { idAno: 1, nombreNivel: '1er Año - Educación Media General', activo: true },
    { idAno: 2, nombreNivel: '2do Año - Educación Media General', activo: true },
    { idAno: 3, nombreNivel: '3er Año - Educación Media General', activo: true },
    { idAno: 4, nombreNivel: '4to Año - Ciencias y Tecnología', activo: true },
    { idAno: 5, nombreNivel: '5to Año - Ciencias y Tecnología', activo: true },
  ];

  const secciones: Seccion[] = [];
  let secId = 1;
  for (const ano of anosEscolares) {
    for (const letra of ['A', 'B']) {
      secciones.push({
        idSeccion: secId++,
        idAno: ano.idAno,
        nombreSeccion: letra,
      });
    }
  }

  // 7. Materias por Año y Asignación de Docentes (8 materias por año = 40 materias, 1 docente por materia)
  const pensumPorAno: Record<number, Array<{ nombre: string; idDocente: number }>> = {
    1: [
      { nombre: 'Castellano y Literatura', idDocente: 5 },
      { nombre: 'Matemáticas', idDocente: 4 },
      { nombre: 'Inglés y Otras Lenguas', idDocente: 8 },
      { nombre: 'Ciencias Naturales', idDocente: 6 },
      { nombre: 'Geografía, Historia y Ciudadanía', idDocente: 7 },
      { nombre: 'Arte y Patrimonio', idDocente: 11 },
      { nombre: 'Educación Física', idDocente: 10 },
      { nombre: 'Orientación y Convivencia', idDocente: 12 },
    ],
    2: [
      { nombre: 'Castellano y Literatura', idDocente: 5 },
      { nombre: 'Matemáticas', idDocente: 4 },
      { nombre: 'Inglés y Otras Lenguas', idDocente: 8 },
      { nombre: 'Ciencias Naturales', idDocente: 6 },
      { nombre: 'Geografía, Historia y Ciudadanía', idDocente: 7 },
      { nombre: 'Arte y Patrimonio', idDocente: 11 },
      { nombre: 'Educación Física', idDocente: 10 },
      { nombre: 'Orientación y Convivencia', idDocente: 12 },
    ],
    3: [
      { nombre: 'Castellano y Literatura', idDocente: 5 },
      { nombre: 'Matemáticas', idDocente: 4 },
      { nombre: 'Inglés y Otras Lenguas', idDocente: 8 },
      { nombre: 'Biología', idDocente: 6 },
      { nombre: 'Física', idDocente: 13 },
      { nombre: 'Química', idDocente: 9 },
      { nombre: 'Geografía, Historia y Ciudadanía', idDocente: 7 },
      { nombre: 'Educación Física', idDocente: 10 },
    ],
    4: [
      { nombre: 'Castellano y Literatura', idDocente: 5 },
      { nombre: 'Matemáticas', idDocente: 4 },
      { nombre: 'Inglés y Otras Lenguas', idDocente: 8 },
      { nombre: 'Biología', idDocente: 6 },
      { nombre: 'Física', idDocente: 13 },
      { nombre: 'Química', idDocente: 9 },
      { nombre: 'Formación para la Soberanía Nacional', idDocente: 7 },
      { nombre: 'Educación Física', idDocente: 10 },
    ],
    5: [
      { nombre: 'Castellano y Literatura', idDocente: 5 },
      { nombre: 'Matemáticas', idDocente: 4 },
      { nombre: 'Inglés y Otras Lenguas', idDocente: 8 },
      { nombre: 'Biología', idDocente: 6 },
      { nombre: 'Física', idDocente: 13 },
      { nombre: 'Química', idDocente: 9 },
      { nombre: 'Ciencias de la Tierra', idDocente: 11 },
      { nombre: 'Orientación y Convivencia', idDocente: 12 },
    ],
  };

  const materias: Materia[] = [];
  const docenteMaterias: DocenteMateria[] = [];
  let matId = 1;
  let asigId = 1;
  const materiaToDocente = new Map<number, number>();

  for (const ano of anosEscolares) {
    for (const item of pensumPorAno[ano.idAno]) {
      const mId = matId++;
      materias.push({
        idMateria: mId,
        idAno: ano.idAno,
        nombreMateria: item.nombre,
      });
      docenteMaterias.push({
        idAsignacion: asigId++,
        idUsuario: item.idDocente,
        idMateria: mId,
      });
      materiaToDocente.set(mId, item.idDocente);
    }
  }

  // 8. Horarios Escolares Libres de Conflictos (10 secciones x 20 bloques semanales = 200 bloques, verificados)
  const dias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
  const bloques = [
    { inicio: '07:00', fin: '08:05' },
    { inicio: '08:05', fin: '09:15' },
    { inicio: '09:45', fin: '10:55' },
    { inicio: '10:55', fin: '12:05' },
  ];

  const horarios: Horario[] = [];
  let horId = 1;
  const busyTeacherSlot = new Set<string>();

  for (const sec of secciones) {
    const yearSubjects = materias.filter((m) => m.idAno === sec.idAno);
    const aula = `Aula ${100 + sec.idSeccion}`;
    // 20 slots per week per section (5 days * 4 blocks)
    // Assign each subject ~2 times per week without teacher collision across sections
    const remainingCounts = new Map<number, number>();
    yearSubjects.forEach((m, idx) => {
      // First 4 core subjects get 3 blocks, remaining 4 get 2 blocks -> 4*3 + 4*2 = 20 blocks
      remainingCounts.set(m.idMateria, idx < 4 ? 3 : 2);
    });

    for (let dIdx = 0; dIdx < dias.length; dIdx++) {
      const dia = dias[dIdx];
      for (let bIdx = 0; bIdx < bloques.length; bIdx++) {
        const blk = bloques[bIdx];
        const slotKeyPrefix = `${dia}|${blk.inicio}`;

        // Pick an available subject for this section whose teacher isn't busy in this slot
        const candidates = yearSubjects
          .filter((m) => (remainingCounts.get(m.idMateria) || 0) > 0)
          .sort((a, b) => {
            const diff = (remainingCounts.get(b.idMateria) || 0) - (remainingCounts.get(a.idMateria) || 0);
            if (diff !== 0) return diff;
            return ((a.idMateria + dIdx + bIdx + sec.idSeccion) % 7) - ((b.idMateria + dIdx + bIdx + sec.idSeccion) % 7);
          });

        let chosen = candidates.find((m) => {
          const docId = materiaToDocente.get(m.idMateria)!;
          return !busyTeacherSlot.has(`${slotKeyPrefix}|${docId}`);
        });

        if (!chosen) {
          // Fallback: any subject in this year whose teacher is free in this slot
          chosen = yearSubjects.find((m) => {
            const docId = materiaToDocente.get(m.idMateria)!;
            return !busyTeacherSlot.has(`${slotKeyPrefix}|${docId}`);
          });
        }

        if (chosen) {
          const docId = materiaToDocente.get(chosen.idMateria)!;
          busyTeacherSlot.add(`${slotKeyPrefix}|${docId}`);
          remainingCounts.set(chosen.idMateria, Math.max(0, (remainingCounts.get(chosen.idMateria) || 0) - 1));
          horarios.push({
            idHorario: horId++,
            idAno: sec.idAno,
            idSeccion: sec.idSeccion,
            idMateria: chosen.idMateria,
            diaSemana: dia,
            horaInicio: blk.inicio,
            horaFin: blk.fin,
            aula,
          });
        }
      }
    }
  }

  // 9. Representantes Reales (30 representantes)
  const repData: Array<[string, string, string, string, string]> = [
    ['V-12899421', 'Camila Teresa', 'Pérez Márquez', '0412-8903321', 'camila.perez@gmail.com'],
    ['V-13450219', 'José Gregorio', 'Mendoza Silva', '0414-3120987', 'jose.mendoza@gmail.com'],
    ['V-14128765', 'María Fernanda', 'Gómez Rivas', '0424-6789012', 'maria.gomez@gmail.com'],
    ['V-15239011', 'Carlos Alberto', 'Torres Benítez', '0416-2345678', 'carlos.torres@gmail.com'],
    ['V-11987432', 'Ana Lucía', 'Rivas Peña', '0412-4567890', 'ana.rivas@gmail.com'],
    ['V-16045123', 'Luis Miguel', 'Rodríguez Díaz', '0414-7890123', 'luis.rodriguez@gmail.com'],
    ['V-14789230', 'Yolanda Coromoto', 'Salazar Vera', '0424-1234567', 'yolanda.salazar@gmail.com'],
    ['V-15890341', 'Héctor Rafael', 'Navarro Quintero', '0416-9012345', 'hector.navarro@gmail.com'],
    ['V-17234098', 'Patricia Alejandra', 'Castillo Rojas', '0412-3456789', 'patricia.castillo@gmail.com'],
    ['V-13671234', 'Rafael Eduardo', 'Hernández Lugo', '0414-5678901', 'rafael.hernandez@gmail.com'],
    ['V-18091245', 'Gabriela Valentina', 'Morales Acosta', '0424-8901234', 'gabriela.morales@gmail.com'],
    ['V-12456780', 'Pedro Pablo', 'Quintero Suárez', '0416-6789012', 'pedro.quintero@gmail.com'],
    ['V-15321098', 'Laura Sofía', 'Duarte Blanco', '0412-2340981', 'laura.duarte@gmail.com'],
    ['V-16789012', 'Miguel Ángel', 'León Pacheco', '0414-4321098', 'miguel.leon@gmail.com'],
    ['V-14901234', 'Beatriz Elena', 'Moreno Paredes', '0424-5432109', 'beatriz.moreno@gmail.com'],
    ['V-17543210', 'Juan Carlos', 'Vargas Briceño', '0416-7654321', 'juan.vargas@gmail.com'],
    ['V-13210987', 'Rosa María', 'Zambrano Medina', '0412-8765432', 'rosa.zambrano@gmail.com'],
    ['V-18432109', 'Francisco Javier', 'Romero Delgado', '0414-9876543', 'francisco.romero@gmail.com'],
    ['V-15678901', 'Verónica Andrea', 'Contreras Prieto', '0424-2109876', 'veronica.contreras@gmail.com'],
    ['V-16123456', 'Alejandro José', 'Ortega Ferrer', '0416-3210987', 'alejandro.ortega@gmail.com'],
    ['V-14345678', 'Natalia Isabel', 'Fuentes Carrera', '0412-6543210', 'natalia.fuentes@gmail.com'],
    ['V-17890123', 'Oscar Enrique', 'Barrios Parra', '0414-1098765', 'oscar.barrios@gmail.com'],
    ['V-12765432', 'Carmen Cecilia', 'Sánchez Ramírez', '0424-3987654', 'carmen.sanchez@gmail.com'],
    ['V-18901234', 'Daniel Ernesto', 'Arias Guerrero', '0416-4876543', 'daniel.arias@gmail.com'],
    ['V-15123498', 'Mónica Liliana', 'Pineda Urdaneta', '0412-5765432', 'monica.pineda@gmail.com'],
    ['V-16543289', 'Eduardo Antonio', 'Soto Villalobos', '0414-6654321', 'eduardo.soto@gmail.com'],
    ['V-13987654', 'Paola Cristina', 'Cárdenas Mejías', '0424-7543210', 'paola.cardenas@gmail.com'],
    ['V-17109876', 'Javier Ignacio', 'Rangel Colmenares', '0416-8432109', 'javier.rangel@gmail.com'],
    ['V-14654321', 'Silvia Raquel', 'Núñez Chávez', '0412-9321098', 'silvia.nunez@gmail.com'],
    ['V-18210943', 'Andrés Mauricio', 'Valero Bermúdez', '0414-1432098', 'andres.valero@gmail.com'],
  ];

  const representantes: StoredRepresentante[] = repData.map(([cedula, nombres, apellidos, telefono, email], idx) => ({
    idRepresentante: idx + 1,
    usuario: email.split('@')[0],
    cedula,
    nombres,
    apellidos,
    telefono,
    email,
    activo: true,
    passwordHash: repHash,
  }));

  // 10. Estudiantes Reales (60 activos en 10 secciones + 5 egresados + 3 retirados = 68 estudiantes)
  const nombresF = [
    'Valentina Sofía', 'Camila Nicole', 'Isabella Victoria', 'Sofía Alejandra', 'Mariana Paola',
    'Lucía Fernanda', 'Valeria Andrea', 'Daniela Carolina', 'Gabriela Beatriz', 'Victoria Isabel',
    'Andrea Celeste', 'Paula Daniela', 'Natalia Eugenia', 'Sara Verónica', 'Mónica Alejandra',
    'Oriana Patricia', 'Elena Sofía', 'Clara Inés', 'Bárbara Lucía', 'Rebeca Valentina',
    'Adriana Carolina', 'Estefanía Raquel', 'Fabiana Cristina', 'Génesis Paola', 'Juliana Isabel',
    'Karelis Daniela', 'Lorena Sofía', 'Miranda Beatriz', 'Nohelia Andrea', 'Yulianny María',
  ];
  const nombresM = [
    'Alejandro José', 'Santiago Andrés', 'Sebastián David', 'Mateo Nicolás', 'Diego Armando',
    'Samuel Enrique', 'Gabriel Eduardo', 'Lucas Antonio', 'Daniel Alejandro', 'Carlos Javier',
    'José Manuel', 'Luis Fernando', 'Miguel Ángel', 'Andrés Felipe', 'Juan Pablo',
    'Nicolás Rafael', 'Rafael Ignacio', 'Tomás Ernesto', 'Víctor Hugo', 'Ángel Gabriel',
    'Cristian David', 'Emiliano José', 'Fernando Arturo', 'Héctor Manuel', 'Iván Alberto',
    'Jesús Eduardo', 'Kevin Alejandro', 'Leonardo David', 'Mauricio Enrique', 'Rodrigo Antonio',
  ];

  const estudiantes: Estudiante[] = [];
  let estId = 1;
  let baseCedulaNum = 31105200;

  // 6 estudiantes por sección (10 secciones = 60 estudiantes activos)
  for (let secIdx = 0; secIdx < secciones.length; secIdx++) {
    const sec = secciones[secIdx];
    for (let slot = 0; slot < 6; slot++) {
      const idxGlobal = secIdx * 6 + slot;
      const rep = representantes[idxGlobal % representantes.length];
      const isFemale = idxGlobal % 2 === 0;
      const firstNamePool = isFemale ? nombresF : nombresM;
      const firstName = firstNamePool[Math.floor(idxGlobal / 2) % firstNamePool.length];
      const cedula = `V-${baseCedulaNum + idxGlobal * 137}`;
      estudiantes.push({
        idEstudiante: estId++,
        cedula,
        nombres: firstName,
        apellidos: rep.apellidos,
        idAnoActual: sec.idAno,
        idSeccion: sec.idSeccion,
        idRepresentante: rep.idRepresentante,
        estadoAcademico: 'ACTIVO',
      });
    }
  }

  // 5 Estudiantes Egresados (promoción 2025-2026)
  const egresadosInfo: Array<[string, string, number]> = [
    ['V-29845120', 'Mariana Beatriz', 2],
    ['V-29912340', 'Carlos Eduardo', 4],
    ['V-30045612', 'Ana Gabriela', 5],
    ['V-30128940', 'José Alejandro', 6],
    ['V-30290115', 'Verónica Sofía', 9],
  ];
  for (const [ced, nom, repId] of egresadosInfo) {
    const rep = representantes[repId - 1];
    estudiantes.push({
      idEstudiante: estId++,
      cedula: ced,
      nombres: nom,
      apellidos: rep.apellidos,
      idAnoActual: null,
      idSeccion: null,
      idRepresentante: rep.idRepresentante,
      estadoAcademico: 'EGRESADO',
    });
  }

  // 3 Estudiantes Retirados (ciclo 2025-2026)
  const retiradosInfo: Array<[string, string, number]> = [
    ['V-30412890', 'Kevin David', 12],
    ['V-30567123', 'Oriana Celeste', 15],
    ['V-30678234', 'Tomás Eduardo', 18],
  ];
  for (const [ced, nom, repId] of retiradosInfo) {
    const rep = representantes[repId - 1];
    estudiantes.push({
      idEstudiante: estId++,
      cedula: ced,
      nombres: nom,
      apellidos: rep.apellidos,
      idAnoActual: null,
      idSeccion: null,
      idRepresentante: rep.idRepresentante,
      estadoAcademico: 'RETIRADO',
    });
  }

  // 11. Registros de Asistencia (Ciclo Actual 2026-2027 + Ciclo Anterior Cerrado 2025-2026)
  const asistencia: RegistroAsistencia[] = [];
  let asisId = 1;

  const activeStudents = estudiantes.filter((e) => e.estadoAcademico === 'ACTIVO');
  const fechasActivas = [
    '2026-11-16', // Lunes
    '2026-11-17', // Martes
    '2026-11-19', // Jueves
    '2026-11-20', // Viernes
    '2026-11-23', // Lunes
    '2026-11-24', // Martes
    '2026-11-25', // Miércoles
  ];
  const diaPorFecha: Record<string, string> = {
    '2026-11-16': 'Lunes',
    '2026-11-17': 'Martes',
    '2026-11-19': 'Jueves',
    '2026-11-20': 'Viernes',
    '2026-11-23': 'Lunes',
    '2026-11-24': 'Martes',
    '2026-11-25': 'Miércoles',
  };

  for (let fIdx = 0; fIdx < fechasActivas.length; fIdx++) {
    const fecha = fechasActivas[fIdx];
    const diaNombre = diaPorFecha[fecha];

    for (const sec of secciones) {
      const blocksToday = horarios.filter((h) => h.idSeccion === sec.idSeccion && h.diaSemana === diaNombre);
      // Registrar asistencia para los primeros 2 bloques del día en cada sección (60 estudiantes * 2 materias * 7 días ~ 840 registros)
      const selectedBlocks = blocksToday.slice(0, 2);
      const secStudents = activeStudents.filter((st) => st.idSeccion === sec.idSeccion);

      for (const blk of selectedBlocks) {
        for (const st of secStudents) {
          const seed = (st.idEstudiante * 17 + blk.idMateria * 13 + fIdx * 7) % 100;
          let estado: RegistroAsistencia['estado'] = 'Presente';
          let horaEntrada = `${blk.horaInicio}:05`;
          let justFields: Partial<RegistroAsistencia> = {};

          if (seed >= 96) {
            estado = 'Reposo Médico';
            justFields = {
              motivoJustificacion: 'Reposo médico pediátrico por cuadro viral respiratorio.',
              numeroJustificante: `RM-2026-${String(asisId).padStart(4, '0')}`,
              fechaRecepcionDocumento: fecha,
              modificadoPorId: 3,
              modificadoPorNombre: 'Elena Beatriz Morales Mendoza',
              modificadoPorRol: 'coordinador',
              fechaModificacion: `${fecha}T14:20:00.000Z`,
            };
          } else if (seed >= 93) {
            estado = 'Justificado';
            justFields = {
              motivoJustificacion: 'Cita odontológica / trámite de identidad con soporte consignado por representante.',
              numeroJustificante: `JUS-2026-${String(asisId).padStart(4, '0')}`,
              fechaRecepcionDocumento: fecha,
              modificadoPorId: 3,
              modificadoPorNombre: 'Elena Beatriz Morales Mendoza',
              modificadoPorRol: 'coordinador',
              fechaModificacion: `${fecha}T13:45:00.000Z`,
            };
          } else if (seed >= 87) {
            estado = 'Ausente';
          } else if (seed >= 80) {
            estado = 'Tarde';
            const [hh, mm] = blk.horaInicio.split(':').map(Number);
            const lateMin = mm + 12;
            const adjH = hh + Math.floor(lateMin / 60);
            const adjM = lateMin % 60;
            horaEntrada = `${String(adjH).padStart(2, '0')}:${String(adjM).padStart(2, '0')}:30`;
          }

          asistencia.push({
            idAsistencia: asisId++,
            idEstudiante: st.idEstudiante,
            idMateria: blk.idMateria,
            lapsoId: 4,
            fecha,
            horaEntrada,
            estado,
            ...justFields,
          });
        }
      }
    }
  }

  // Asistencias históricas de 2025-2026 (lapsos cerrados 1, 2, 3) para alumnos EGRESADO, RETIRADO y promoción previa
  const historicalDates = [
    { fecha: '2025-10-15', lapsoId: 1 },
    { fecha: '2025-11-12', lapsoId: 1 },
    { fecha: '2026-02-11', lapsoId: 2 },
    { fecha: '2026-03-04', lapsoId: 2 },
    { fecha: '2026-05-13', lapsoId: 3 },
    { fecha: '2026-06-10', lapsoId: 3 },
  ];
  const inactiveStudents = estudiantes.filter((e) => e.estadoAcademico !== 'ACTIVO');
  const year5Subjects = materias.filter((m) => m.idAno === 5).slice(0, 4);

  for (let hIdx = 0; hIdx < historicalDates.length; hIdx++) {
    const { fecha, lapsoId } = historicalDates[hIdx];
    for (const st of inactiveStudents) {
      for (let mIdx = 0; mIdx < year5Subjects.length; mIdx++) {
        const mat = year5Subjects[mIdx];
        const code = (st.idEstudiante + hIdx * 3 + mIdx) % 12;
        const estado: RegistroAsistencia['estado'] =
          code === 0 ? 'Ausente' : code === 1 ? 'Tarde' : code === 2 ? 'Justificado' : 'Presente';
        asistencia.push({
          idAsistencia: asisId++,
          idEstudiante: st.idEstudiante,
          idMateria: mat.idMateria,
          lapsoId,
          fecha,
          horaEntrada: estado === 'Tarde' ? '07:22:00' : '07:02:00',
          estado,
          ...(estado === 'Justificado'
            ? {
                motivoJustificacion: 'Justificante académico consignado en Coordinación.',
                numeroJustificante: `JUS-2025-${String(asisId).padStart(4, '0')}`,
                fechaRecepcionDocumento: fecha,
                modificadoPorId: 3,
                modificadoPorNombre: 'Elena Beatriz Morales Mendoza',
                modificadoPorRol: 'coordinador',
                fechaModificacion: `${fecha}T14:00:00.000Z`,
              }
            : {}),
        });
      }
    }
  }

  // 12. Notificaciones en bandeja de Representantes
  const notificacionesRepresentante: NotificacionRepresentante[] = [
    {
      idNotificacion: 1,
      idRepresentante: 1,
      tipo: 'receso',
      titulo: 'Inicio de Receso Matutino',
      mensaje: 'La institución ha iniciado el período de receso matutino (09:15 - 09:45).',
      fechaEvento: '2026-11-25',
      horaEvento: '09:15',
      leida: true,
      leidaAt: '2026-11-25T09:20:00.000Z',
      createdAt: '2026-11-25T09:15:00.000Z',
      metadata: { alcance: 'institucional' },
    },
    {
      idNotificacion: 2,
      idRepresentante: 1,
      tipo: 'salida',
      titulo: 'Hora de Salida Oficial',
      mensaje: 'Culminó la jornada matutina regular (12:30). Los estudiantes están listos para el retiro.',
      fechaEvento: '2026-11-25',
      horaEvento: '12:30',
      leida: false,
      leidaAt: null,
      createdAt: '2026-11-25T12:30:00.000Z',
      metadata: { idSalida: 1, nombreSalida: 'Hora de Salida Oficial', alcance: 'institucional' },
    },
  ];

  // Agregar notificaciones reales para las inasistencias/justificaciones recientes
  let notifId = 3;
  for (const reg of asistencia.filter((a) => a.lapsoId === 4 && (a.estado === 'Ausente' || a.estado === 'Tarde' || a.estado === 'Justificado' || a.estado === 'Reposo Médico')).slice(0, 18)) {
    const est = estudiantes.find((e) => e.idEstudiante === reg.idEstudiante);
    const mat = materias.find((m) => m.idMateria === reg.idMateria);
    if (!est || !mat) continue;
    const isJust = reg.estado === 'Justificado' || reg.estado === 'Reposo Médico';
    notificacionesRepresentante.unshift({
      idNotificacion: notifId++,
      idRepresentante: est.idRepresentante,
      tipo: isJust ? 'justificacion' : 'asistencia',
      titulo: isJust
        ? `Justificación registrada (${reg.estado})`
        : `Alerta de asistencia: ${reg.estado}`,
      mensaje: `${est.nombres} ${est.apellidos} registró estado ${reg.estado} en ${mat.nombreMateria} el ${reg.fecha}.`,
      fechaEvento: reg.fecha,
      horaEvento: reg.horaEntrada.slice(0, 5),
      leida: false,
      leidaAt: null,
      createdAt: `${reg.fecha}T${reg.horaEntrada}.000Z`,
      metadata: {
        idEstudiante: est.idEstudiante,
        estudianteNombre: `${est.nombres} ${est.apellidos}`,
        idMateria: mat.idMateria,
        nombreMateria: mat.nombreMateria,
        estado: reg.estado,
      },
    });
  }

  // 13. Bitácora de Auditoría (eventos recientes + rutinarios antiguos para pruebas de retención)
  const auditLogs: AuditLog[] = [
    {
      idLog: 6,
      idUsuario: 1,
      emailOCedula: 'admin@eduasist.edu',
      rol: 'director',
      accion: 'POBLACION_DATOS_REALES',
      entidad: 'DATABASE',
      idEntidad: 'initial_real_population',
      ipOrigen: '127.0.0.1',
      userAgent: 'EduAsist Seeder CLI',
      detalles: {
        personal: users.length,
        representantes: representantes.length,
        estudiantes: estudiantes.length,
        asistencias: asistencia.length,
        horarios: horarios.length,
      },
      createdAt: nowIso,
    },
    {
      idLog: 5,
      idUsuario: 3,
      emailOCedula: 'coordinacion@eduasist.edu',
      rol: 'coordinador',
      accion: 'JUSTIFICACION_ASISTENCIA',
      entidad: 'asistencia',
      idEntidad: 'lapso_4',
      ipOrigen: '192.168.1.12',
      userAgent: 'Chrome/130.0',
      detalles: { motivo: 'Recepción de reposos médicos y justificantes del Primer Lapso' },
      createdAt: '2026-11-25T14:20:00.000Z',
    },
    {
      idLog: 4,
      idUsuario: 4,
      emailOCedula: 'ricardo.ramos@eduasist.edu',
      rol: 'docente',
      accion: 'PASE_ASISTENCIA_LOTE',
      entidad: 'asistencia',
      idEntidad: 'mat_2',
      ipOrigen: '192.168.1.24',
      userAgent: 'Chrome/130.0',
      detalles: { fecha: '2026-11-25', registros: 12 },
      createdAt: '2026-11-25T08:10:00.000Z',
    },
    {
      idLog: 3,
      idUsuario: 4,
      emailOCedula: 'ricardo.ramos@eduasist.edu',
      rol: 'docente',
      accion: 'LOGIN_EXITOSO_PERSONAL',
      entidad: 'users',
      idEntidad: '4',
      ipOrigen: '192.168.1.24',
      userAgent: 'Chrome/130.0',
      detalles: { metodo: 'Credenciales Locales BD (Bcrypt + JWT)' },
      createdAt: '2026-01-15T07:05:00.000Z',
    },
    {
      idLog: 2,
      idUsuario: 5,
      emailOCedula: 'carmen.salazar@eduasist.edu',
      rol: 'docente',
      accion: 'CONSULTA_REPORTE_ASISTENCIA',
      entidad: 'asistencia',
      idEntidad: 'reporte_mensual',
      ipOrigen: '192.168.1.31',
      userAgent: 'Chrome/130.0',
      detalles: { periodo: '2025-2026' },
      createdAt: '2026-02-10T11:20:00.000Z',
    },
    {
      idLog: 1,
      idUsuario: 1,
      emailOCedula: 'admin@eduasist.edu',
      rol: 'director',
      accion: 'CREACION_HORARIO_ESCOLAR',
      entidad: 'horarios',
      idEntidad: 'batch_2026',
      ipOrigen: '127.0.0.1',
      userAgent: 'Chrome/130.0',
      detalles: { totalBloques: horarios.length, conflictos: 0 },
      createdAt: '2026-09-10T09:00:00.000Z',
    },
  ];

  const dbState = {
    configuracionInstitucional,
    recesosInstitucionales,
    salidasInstitucionales,
    lapsosEscolares,
    anosEscolares,
    secciones,
    materias,
    docenteMaterias,
    representantes,
    estudiantes,
    asistencia,
    horarios,
    users,
    auditLogs,
    pushSubscriptions: [],
    milestoneDispatches: [],
    diasNoLaborables,
    notificacionesRepresentante,
    resumenesAsistencia: [],
  };

  await fs.promises.mkdir(DB_DIR, { recursive: true });
  const tmpFile = path.join(DB_DIR, `eduasist-db.${process.pid}.${Date.now()}.tmp`);
  await fs.promises.writeFile(tmpFile, JSON.stringify(dbState, null, 2), 'utf-8');
  await fs.promises.rename(tmpFile, DB_FILE);

  console.log('[Populate] Base de datos poblada exitosamente en:', DB_FILE);
  console.log(
    JSON.stringify(
      {
        anosEscolares: anosEscolares.length,
        secciones: secciones.length,
        materias: materias.length,
        docenteMaterias: docenteMaterias.length,
        horarios: horarios.length,
        users: users.length,
        representantes: representantes.length,
        estudiantes: estudiantes.length,
        estudiantesActivos: activeStudents.length,
        estudiantesEgresados: egresadosInfo.length,
        estudiantesRetirados: retiradosInfo.length,
        asistencia: asistencia.length,
        lapsosEscolares: lapsosEscolares.length,
        diasNoLaborables: diasNoLaborables.length,
        notificacionesRepresentante: notificacionesRepresentante.length,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error('[Populate] Error fatal:', err);
  process.exit(1);
});
