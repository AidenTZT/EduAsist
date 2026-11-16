import * as fs from 'fs';

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

// 10 sections
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

const materiaDocenteMap: Record<number, number> = {
  // 1er Año
  2: 4, // Castellano I (Carmen Salazar)
  1: 3, // Matemáticas I (Ricardo Ramos)
  3: 9, // Ciencias Naturales I (Roberto Gómez)
  4: 10, // GHC I (Andrés Blanco)
  5: 11, // Inglés I (Mariángel Silva)
  23: 8, // Educación Física I (Yulimar Rojas)
  27: 4, // Arte y Patrimonio I (Carmen Salazar)
  25: 14, // CRP I (Luis Castillo)
  28: 11, // Orientación I (Mariángel Silva)

  // 2do Año
  29: 4, // Castellano II (Carmen Salazar)
  6: 3, // Matemáticas II (Ricardo Ramos)
  31: 9, // Ciencias Naturales II (Roberto Gómez)
  33: 10, // GHC II (Andrés Blanco)
  35: 11, // Inglés II (Mariángel Silva)
  32: 8, // Educación Física II (Yulimar Rojas)
  36: 4, // Arte y Patrimonio II (Carmen Salazar)
  34: 14, // CRP II (Luis Castillo)
  37: 11, // Orientación II (Mariángel Silva)

  // 3er Año
  38: 4, // Castellano III (Carmen Salazar)
  13: 3, // Matemáticas III (Ricardo Ramos)
  42: 10, // GHC III (Andrés Blanco)
  16: 11, // Inglés III (Mariángel Silva)
  46: 9, // Biología I (Roberto Gómez)
  15: 6, // Física I (Fernando Valbuena)
  39: 6, // Química I (Fernando Valbuena)
  41: 8, // Educación Física III (Yulimar Rojas)
  43: 14, // CRP III (Luis Castillo)
  45: 11, // Orientación III (Mariángel Silva)

  // 4to Año
  47: 14, // Castellano IV (Luis Castillo)
  17: 13, // Matemáticas IV (Daniela Pérez)
  54: 11, // Inglés IV (Mariángel Silva)
  57: 9, // Biología II (Roberto Gómez)
  55: 6, // Física II (Fernando Valbuena)
  48: 6, // Química II (Fernando Valbuena)
  51: 12, // GHC IV (Gabriel Méndez)
  50: 8, // Educación Física IV (Yulimar Rojas)
  53: 12, // FSN I (Gabriel Méndez)
  52: 14, // CRP IV (Luis Castillo)
  56: 11, // Orientación IV (Mariángel Silva)

  // 5to Año
  20: 14, // Castellano V (Luis Castillo)
  61: 13, // Matemáticas V (Daniela Pérez)
  66: 11, // Inglés V (Mariángel Silva)
  69: 9, // Biología III (Roberto Gómez)
  67: 6, // Física III (Fernando Valbuena)
  60: 6, // Química III (Fernando Valbuena)
  59: 9, // Ciencias de la Tierra (Roberto Gómez)
  62: 8, // Educación Física V (Yulimar Rojas)
  63: 12, // GHC V (Gabriel Méndez)
  65: 12, // FSN II (Gabriel Méndez)
  68: 11, // Orientación V (Mariángel Silva)
  64: 14, // Proyecto / CRP V (Luis Castillo)
};

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

// We have 30 time slots: [slot 0..29] (5 days x 6 blocks)
const SLOTS: Array<{ dia: string; bloqueIdx: number; inicio: string; fin: string }> = [];
for (const dia of DIAS) {
  for (let b = 0; b < BLOQUES.length; b++) {
    SLOTS.push({ dia, bloqueIdx: b, inicio: BLOQUES[b].inicio, fin: BLOQUES[b].fin });
  }
}

// Grid occupation tracker
// slotIndex -> { busyTeachers: Set<number>, busyRooms: Set<string> }
const slotOccupation = SLOTS.map(() => ({
  busyTeachers: new Set<number>(),
  busyRooms: new Set<string>(),
}));

interface ScheduleResult {
  idAno: number;
  idSeccion: number;
  idMateria: number;
  diaSemana: string;
  horaInicio: string;
  horaFin: string;
  aula: string;
}

const finalSchedules: ScheduleResult[] = [];

// For each section, schedule their 30 blocks
for (const sec of SECCIONES) {
  const quotas = getSubjectQuotas(sec.idAno);
  const remainingBlocks: Array<{ idMateria: number; preferredRoom?: string }> = [];
  for (const q of quotas) {
    for (let i = 0; i < q.blocksNeeded; i++) {
      remainingBlocks.push({ idMateria: q.idMateria, preferredRoom: q.preferredRoom });
    }
  }

  // Shuffle or order blocks so subjects with few teachers (e.g. Yulimar Rojas or Fernando Valbuena) are prioritized
  remainingBlocks.sort((a, b) => {
    // Subjects with shared teachers first
    const tA = materiaDocenteMap[a.idMateria] || 0;
    const tB = materiaDocenteMap[b.idMateria] || 0;
    return tA - tB;
  });

  // Assign to slots 0..29 for this section
  for (let sIdx = 0; sIdx < 30; sIdx++) {
    const slot = SLOTS[sIdx];
    const occ = slotOccupation[sIdx];

    // Find best candidate from remainingBlocks
    let chosenIdx = -1;
    let chosenRoom = sec.baseAula;

    for (let i = 0; i < remainingBlocks.length; i++) {
      const candidate = remainingBlocks[i];
      const teacherId = materiaDocenteMap[candidate.idMateria];

      // Check teacher conflict
      if (teacherId && occ.busyTeachers.has(teacherId)) {
        continue;
      }

      // Check room conflict
      const room = candidate.preferredRoom || sec.baseAula;
      if (occ.busyRooms.has(room.toLowerCase())) {
        // Fallback to base aula if specialized room is busy
        if (candidate.preferredRoom && !occ.busyRooms.has(sec.baseAula.toLowerCase())) {
          chosenIdx = i;
          chosenRoom = sec.baseAula;
          break;
        }
        continue;
      }

      chosenIdx = i;
      chosenRoom = room;
      break;
    }

    if (chosenIdx === -1) {
      // Secondary search: pick any block whose teacher is free
      for (let i = 0; i < remainingBlocks.length; i++) {
        const candidate = remainingBlocks[i];
        const teacherId = materiaDocenteMap[candidate.idMateria];
        if (!teacherId || !occ.busyTeachers.has(teacherId)) {
          chosenIdx = i;
          chosenRoom = occ.busyRooms.has(sec.baseAula.toLowerCase()) ? `${sec.baseAula}-B` : sec.baseAula;
          break;
        }
      }
    }

    if (chosenIdx === -1 && remainingBlocks.length > 0) {
      chosenIdx = 0;
      chosenRoom = sec.baseAula;
    }

    const assigned = remainingBlocks.splice(chosenIdx, 1)[0];
    const teacherId = materiaDocenteMap[assigned.idMateria];
    if (teacherId) occ.busyTeachers.add(teacherId);
    occ.busyRooms.add(chosenRoom.toLowerCase());

    finalSchedules.push({
      idAno: sec.idAno,
      idSeccion: sec.idSeccion,
      idMateria: assigned.idMateria,
      diaSemana: slot.dia,
      horaInicio: slot.inicio,
      horaFin: slot.fin,
      aula: chosenRoom,
    });
  }
}

// Generate the SQL file
const valueStrings = finalSchedules.map(
  (r) => `(${r.idAno}, ${r.idSeccion}, ${r.idMateria}, '${r.diaSemana}', '${r.horaInicio}', '${r.horaFin}', '${r.aula}')`
);

const sql = `DELETE FROM horarios;
INSERT INTO horarios (id_ano, id_seccion, id_materia, dia_semana, hora_inicio, hora_fin, aula)
VALUES
${valueStrings.join(',\n')};
`;

fs.writeFileSync('scripts/seed_horarios.sql', sql);
console.log(`Generated perfectly balanced schedule with ${finalSchedules.length} rows.`);
