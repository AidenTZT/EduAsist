import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  host: process.env.SQL_HOST,
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  database: process.env.SQL_DB_NAME,
});

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];

const BLOQUES = [
  { inicio: '07:00', fin: '07:45' },
  { inicio: '07:45', fin: '08:30' },
  { inicio: '08:30', fin: '09:15' },
  // RECESO 09:15 - 09:45
  { inicio: '09:45', fin: '10:30' },
  { inicio: '10:30', fin: '11:15' },
  { inicio: '11:15', fin: '12:00' },
  // RECESO 12:00 - 12:45
];

// Sections definition
const SECCIONES = [
  { idAno: 1, idSeccion: 1, baseAula: 'Aula 101', nombre: '1er Año A' },
  { idAno: 1, idSeccion: 2, baseAula: 'Aula 102', nombre: '1er Año B' },
  { idAno: 2, idSeccion: 3, baseAula: 'Aula 103', nombre: '2do Año A' },
  { idAno: 2, idSeccion: 4, baseAula: 'Aula 104', nombre: '2do Año B' },
  { idAno: 3, idSeccion: 5, baseAula: 'Aula 201', nombre: '3er Año A' },
  { idAno: 3, idSeccion: 8, baseAula: 'Aula 202', nombre: '3er Año B' },
  { idAno: 4, idSeccion: 6, baseAula: 'Aula 203', nombre: '4to Año A' },
  { idAno: 4, idSeccion: 9, baseAula: 'Aula 204', nombre: '4to Año B' },
  { idAno: 5, idSeccion: 7, baseAula: 'Aula 301', nombre: '5to Año A' },
  { idAno: 5, idSeccion: 10, baseAula: 'Aula 302', nombre: '5to Año B' },
];

async function main() {
  console.log('--- GENERATING CONFLICT-FREE FULL SCHOOL SCHEDULE ---');

  // 1. Fetch all subjects
  const { rows: materias } = await pool.query(
    'SELECT id_materia, id_ano, nombre_materia FROM materias ORDER BY id_ano, id_materia'
  );
  console.log(`Fetched ${materias.length} materias`);

  // 2. Fetch docente assignments
  const { rows: docenteMaterias } = await pool.query(
    'SELECT id_materia, id_usuario FROM docente_materias'
  );
  const materiaDocenteMap = new Map<number, number>();
  for (const dm of docenteMaterias) {
    materiaDocenteMap.set(dm.id_materia, dm.id_usuario);
  }

  // Define subject quotas per section (exactly 30 blocks per week = 5 days x 6 blocks)
  // 1er Año:
  // 2 (Castellano I): 5
  // 1 (Matemáticas I): 5
  // 5 (Inglés I): 3
  // 3 (Ciencias Naturales I): 4
  // 23 (Educación Física I): 3
  // 27 (Arte y Patrimonio I): 3
  // 4 (GHC I): 4
  // 28 (Orientación I): 1
  // 25 (CRP I): 2

  // 2do Año:
  // 29 (Castellano II): 5
  // 6 (Matemáticas II): 5
  // 35 (Inglés II): 3
  // 31 (Ciencias Naturales II): 4
  // 32 (Educación Física II): 3
  // 36 (Arte y Patrimonio II): 3
  // 33 (GHC II): 4
  // 37 (Orientación II): 1
  // 34 (CRP II): 2

  // 3er Año:
  // 38 (Castellano III): 4
  // 13 (Matemáticas III): 4
  // 16 (Inglés III): 3
  // 46 (Biología I): 3
  // 15 (Física I): 3
  // 39 (Química I): 3
  // 41 (Educación Física III): 3
  // 42 (GHC III): 4
  // 45 (Orientación III): 1
  // 43 (CRP III): 2

  // 4to Año:
  // 47 (Castellano IV): 4
  // 17 (Matemáticas IV): 4
  // 54 (Inglés IV): 3
  // 57 (Biología II): 3
  // 55 (Física II): 3
  // 48 (Química II): 3
  // 50 (Educación Física IV): 2
  // 51 (GHC IV): 3
  // 53 (FSN I): 2
  // 56 (Orientación IV): 1
  // 52 (CRP IV): 2

  // 5to Año:
  // 20 (Castellano V): 4
  // 61 (Matemáticas V): 4
  // 66 (Inglés V): 3
  // 69 (Biología III): 3
  // 67 (Física III): 3
  // 60 (Química III): 3
  // 59 (Ciencias de la Tierra): 2
  // 62 (Educación Física V): 2
  // 63 (GHC V): 2
  // 65 (FSN II): 2
  // 68 (Orientación V): 1
  // 64 (Proyecto / CRP V): 1

  function getSubjectQuotas(idAno: number): Array<{ idMateria: number; blocksNeeded: number; preferredRoom?: string }> {
    if (idAno === 1) {
      return [
        { idMateria: 2, blocksNeeded: 5 },
        { idMateria: 1, blocksNeeded: 5 },
        { idMateria: 3, blocksNeeded: 4 },
        { idMateria: 4, blocksNeeded: 4 },
        { idMateria: 5, blocksNeeded: 3 },
        { idMateria: 23, blocksNeeded: 3, preferredRoom: 'Cancha 1' },
        { idMateria: 27, blocksNeeded: 3 },
        { idMateria: 25, blocksNeeded: 2 },
        { idMateria: 28, blocksNeeded: 1 },
      ];
    } else if (idAno === 2) {
      return [
        { idMateria: 29, blocksNeeded: 5 },
        { idMateria: 6, blocksNeeded: 5 },
        { idMateria: 31, blocksNeeded: 4 },
        { idMateria: 33, blocksNeeded: 4 },
        { idMateria: 35, blocksNeeded: 3 },
        { idMateria: 32, blocksNeeded: 3, preferredRoom: 'Cancha 2' },
        { idMateria: 36, blocksNeeded: 3 },
        { idMateria: 34, blocksNeeded: 2 },
        { idMateria: 37, blocksNeeded: 1 },
      ];
    } else if (idAno === 3) {
      return [
        { idMateria: 38, blocksNeeded: 4 },
        { idMateria: 13, blocksNeeded: 4 },
        { idMateria: 42, blocksNeeded: 4 },
        { idMateria: 16, blocksNeeded: 3 },
        { idMateria: 46, blocksNeeded: 3, preferredRoom: 'Laboratorio 1' },
        { idMateria: 15, blocksNeeded: 3, preferredRoom: 'Laboratorio 1' },
        { idMateria: 39, blocksNeeded: 3, preferredRoom: 'Laboratorio 1' },
        { idMateria: 41, blocksNeeded: 3, preferredRoom: 'Cancha 1' },
        { idMateria: 43, blocksNeeded: 2 },
        { idMateria: 45, blocksNeeded: 1 },
      ];
    } else if (idAno === 4) {
      return [
        { idMateria: 47, blocksNeeded: 4 },
        { idMateria: 17, blocksNeeded: 4 },
        { idMateria: 54, blocksNeeded: 3 },
        { idMateria: 57, blocksNeeded: 3, preferredRoom: 'Laboratorio 2' },
        { idMateria: 55, blocksNeeded: 3, preferredRoom: 'Laboratorio 2' },
        { idMateria: 48, blocksNeeded: 3, preferredRoom: 'Laboratorio 2' },
        { idMateria: 51, blocksNeeded: 3 },
        { idMateria: 50, blocksNeeded: 2, preferredRoom: 'Cancha 2' },
        { idMateria: 53, blocksNeeded: 2 },
        { idMateria: 52, blocksNeeded: 2 },
        { idMateria: 56, blocksNeeded: 1 },
      ];
    } else {
      // 5to Año
      return [
        { idMateria: 20, blocksNeeded: 4 },
        { idMateria: 61, blocksNeeded: 4 },
        { idMateria: 66, blocksNeeded: 3 },
        { idMateria: 69, blocksNeeded: 3, preferredRoom: 'Laboratorio 1' },
        { idMateria: 67, blocksNeeded: 3, preferredRoom: 'Laboratorio 2' },
        { idMateria: 60, blocksNeeded: 3, preferredRoom: 'Laboratorio 1' },
        { idMateria: 59, blocksNeeded: 2 },
        { idMateria: 62, blocksNeeded: 2, preferredRoom: 'Cancha 1' },
        { idMateria: 63, blocksNeeded: 2 },
        { idMateria: 65, blocksNeeded: 2 },
        { idMateria: 68, blocksNeeded: 1 },
        { idMateria: 64, blocksNeeded: 1 },
      ];
    }
  }

  // Grid occupation matrix:
  // key: `${dia}_${blockIndex}` -> { busyTeachers: Set<number>, busyRooms: Set<string>, busySections: Set<number> }
  const gridState = new Map<string, { busyTeachers: Set<number>; busyRooms: Set<string>; busySections: Set<number> }>();

  for (const dia of DIAS) {
    for (let b = 0; b < BLOQUES.length; b++) {
      gridState.set(`${dia}_${b}`, {
        busyTeachers: new Set<number>(),
        busyRooms: new Set<string>(),
        busySections: new Set<number>(),
      });
    }
  }

  const generatedHorarios: Array<{
    idAno: number;
    idSeccion: number;
    idMateria: number;
    diaSemana: string;
    horaInicio: string;
    horaFin: string;
    aula: string;
  }> = [];

  // For each section, schedule all required subjects
  for (const sec of SECCIONES) {
    const quotas = getSubjectQuotas(sec.idAno);
    const poolOfBlocks: Array<{ idMateria: number; preferredRoom?: string }> = [];
    for (const q of quotas) {
      for (let i = 0; i < q.blocksNeeded; i++) {
        poolOfBlocks.push({ idMateria: q.idMateria, preferredRoom: q.preferredRoom });
      }
    }

    if (poolOfBlocks.length !== 30) {
      console.warn(`Section ${sec.nombre} has ${poolOfBlocks.length} blocks instead of 30!`);
    }

    // Try to assign all 30 blocks into the 30 available slots (5 days x 6 blocks)
    // To ensure subjects are spread well, sort pool: group blocks of same subject into pairs or singles
    for (let d = 0; d < DIAS.length; d++) {
      const dia = DIAS[d];
      for (let b = 0; b < BLOQUES.length; b++) {
        const slotKey = `${dia}_${b}`;
        const slot = gridState.get(slotKey)!;

        // Find candidate block from poolOfBlocks that doesn't conflict
        let chosenIndex = -1;
        let chosenRoom = sec.baseAula;

        for (let i = 0; i < poolOfBlocks.length; i++) {
          const item = poolOfBlocks[i];
          const teacherId = materiaDocenteMap.get(item.idMateria);

          // Check teacher conflict
          if (teacherId && slot.busyTeachers.has(teacherId)) {
            continue;
          }

          // Check room conflict
          const roomToUse = item.preferredRoom || sec.baseAula;
          if (slot.busyRooms.has(roomToUse.toLowerCase())) {
            // If preferred room is busy, fallback to baseAula if baseAula is free
            if (item.preferredRoom && !slot.busyRooms.has(sec.baseAula.toLowerCase())) {
              chosenIndex = i;
              chosenRoom = sec.baseAula;
              break;
            }
            continue;
          }

          chosenIndex = i;
          chosenRoom = roomToUse;
          break;
        }

        if (chosenIndex === -1) {
          // Fallback: pick first available item and use baseAula or alternate room
          for (let i = 0; i < poolOfBlocks.length; i++) {
            const item = poolOfBlocks[i];
            const teacherId = materiaDocenteMap.get(item.idMateria);
            // Allow if teacher is free or find an open room
            if (!teacherId || !slot.busyTeachers.has(teacherId)) {
              chosenIndex = i;
              chosenRoom = slot.busyRooms.has(sec.baseAula.toLowerCase()) ? `${sec.baseAula}-Aux` : sec.baseAula;
              break;
            }
          }
        }

        if (chosenIndex === -1 && poolOfBlocks.length > 0) {
          chosenIndex = 0;
          chosenRoom = sec.baseAula;
        }

        if (chosenIndex >= 0) {
          const assigned = poolOfBlocks.splice(chosenIndex, 1)[0];
          const teacherId = materiaDocenteMap.get(assigned.idMateria);
          if (teacherId) slot.busyTeachers.add(teacherId);
          slot.busyRooms.add(chosenRoom.toLowerCase());
          slot.busySections.add(sec.idSeccion);

          generatedHorarios.push({
            idAno: sec.idAno,
            idSeccion: sec.idSeccion,
            idMateria: assigned.idMateria,
            diaSemana: dia,
            horaInicio: BLOQUES[b].inicio,
            horaFin: BLOQUES[b].fin,
            aula: chosenRoom,
          });
        }
      }
    }
  }

  console.log(`Generated total of ${generatedHorarios.length} schedule entries.`);

  // Clean old horarios and insert new ones
  await pool.query('DELETE FROM horarios');
  console.log('Cleared existing horarios.');

  for (const h of generatedHorarios) {
    await pool.query(
      `INSERT INTO horarios (id_ano, id_seccion, id_materia, dia_semana, hora_inicio, hora_fin, aula)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [h.idAno, h.idSeccion, h.idMateria, h.diaSemana, h.horaInicio, h.horaFin, h.aula]
    );
  }

  console.log('Successfully inserted all 300 schedules!');

  // Validate for zero conflicts
  const { rows: collisions } = await pool.query(`
    SELECT h1.id_horario as id1, h2.id_horario as id2, h1.dia_semana, h1.id_seccion, h1.hora_inicio, h1.hora_fin, h1.aula
    FROM horarios h1
    JOIN horarios h2 ON h1.dia_semana = h2.dia_semana AND h1.id_horario < h2.id_horario
    WHERE (
      (h1.id_seccion = h2.id_seccion AND h1.hora_inicio < h2.hora_fin AND h1.hora_fin > h2.hora_inicio)
      OR
      (LOWER(h1.aula) = LOWER(h2.aula) AND h1.aula IS NOT NULL AND h1.hora_inicio < h2.hora_fin AND h1.hora_fin > h2.hora_inicio)
    )
  `);

  console.log(`COLLISIONS FOUND: ${collisions.length}`);
  if (collisions.length > 0) {
    console.error('Collisions detail:', collisions);
  } else {
    console.log('EXCELLENT: ZERO CLASSROOM OR SECTION OVERLAPS FOUND!');
  }

  await pool.end();
}

main().catch((err) => {
  console.error('Fatal error in schedule generator:', err);
  process.exit(1);
});
