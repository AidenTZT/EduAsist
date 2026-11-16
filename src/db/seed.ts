import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { db } from './index.ts';
import {
  users,
  configuracionInstitucional,
  recesosInstitucionales,
  anosEscolares,
  secciones,
  materias,
} from './schema.ts';
import { eq, sql } from 'drizzle-orm';

/**
 * Script de inicialización y migración de semilla oficial para EduControl Cloud.
 * Garantiza un único usuario maestro por defecto:
 * - Rol: Director
 * - Nombre: Admin
 * - Contraseña inicial: admin1234 (hasheada criptográficamente con bcrypt)
 */
export async function seedDatabase(options: { resetAllUsers?: boolean } = {}) {
  console.log('[Seed] Iniciando configuración de semilla institucional...');

  // 1. Configuración Institucional Global
  const defaultConfigs = [
    {
      clave: 'ano_lectivo',
      valor: '2025 - 2026',
      descripcion: 'Año lectivo escolar institucional',
    },
    {
      clave: 'nombre_institucion',
      valor: 'Liceo Nacional Bolivariano Gran Mariscal de Ayacucho',
      descripcion: 'Nombre oficial del plantel educativo',
    },
    {
      clave: 'codigo_plantel',
      valor: 'S0424D0101',
      descripcion: 'Código DEA oficial del Ministerio del Poder Popular para la Educación',
    },
  ];

  for (const cfg of defaultConfigs) {
    const existing = await db
      .select()
      .from(configuracionInstitucional)
      .where(eq(configuracionInstitucional.clave, cfg.clave))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(configuracionInstitucional).values(cfg);
    }
  }

  // 2. Recesos Institucionales
  const defaultRecesos = [
    {
      nombre: 'Receso de la Mañana',
      horaInicio: '09:15',
      horaFin: '09:45',
      activo: true,
      descripcion: 'Pausa matutina para desayuno y esparcimiento',
    },
    {
      nombre: 'Receso del Mediodía',
      horaInicio: '12:00',
      horaFin: '12:45',
      activo: true,
      descripcion: 'Almuerzo escolar',
    },
  ];

  for (const receso of defaultRecesos) {
    const existing = await db
      .select()
      .from(recesosInstitucionales)
      .where(eq(recesosInstitucionales.nombre, receso.nombre))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(recesosInstitucionales).values(receso);
    }
  }

  // 4. Años Escolares (1er a 5to Año)
  const defaultAnos = [
    '1er Año - Educación Media General',
    '2do Año - Educación Media General',
    '3er Año - Educación Media General',
    '4to Año - Ciencias y Tecnología',
    '5to Año - Ciencias y Tecnología',
  ];

  const existingAnos = await db.select().from(anosEscolares);
  if (existingAnos.length === 0) {
    for (const nombreNivel of defaultAnos) {
      await db.insert(anosEscolares).values({ nombreNivel, activo: true });
    }
  } else {
    // Limpiar años huérfanos duplicados sin secciones asignadas
    await db.execute(
      sql`DELETE FROM anos_escolares WHERE id_ano > 5 AND id_ano NOT IN (SELECT DISTINCT id_ano FROM secciones WHERE id_ano IS NOT NULL)`
    );
  }

  // 5. Configurar Usuario Maestro Inicial (Admin / admin1234)
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash('admin1234', salt);

  if (options.resetAllUsers) {
    console.log('[Seed] Modo Reset: Configurando único usuario maestro Admin...');
    // Si se solicita reset total de usuarios, dejar exclusivamente el maestro
    await db.delete(users);
    await db.insert(users).values({
      uid: 'usr_admin_master',
      email: 'admin@educontrol.edu',
      nombre: 'Admin',
      apellidos: 'Principal',
      cedula: 'admin',
      telefono: '0414-0000000',
      rol: 'director',
      passwordHash,
    });
  } else {
    // Buscar si ya existe el usuario Admin
    const existingAdmin = await db
      .select()
      .from(users)
      .where(sql`LOWER(${users.nombre}) = 'admin' OR LOWER(${users.cedula}) = 'admin' OR LOWER(${users.email}) = 'admin@educontrol.edu'`)
      .limit(1);

    if (existingAdmin.length === 0) {
      console.log('[Seed] Creando usuario maestro inicial Admin con rol Director...');
      await db.insert(users).values({
        uid: 'usr_admin_master',
        email: 'admin@educontrol.edu',
        nombre: 'Admin',
        apellidos: 'Principal',
        cedula: 'admin',
        telefono: '0414-0000000',
        rol: 'director',
        passwordHash,
      });
    } else {
      console.log('[Seed] Usuario maestro Admin detectado. Verificando rol de Director y hash bcrypt...');
      await db
        .update(users)
        .set({
          nombre: 'Admin',
          rol: 'director',
          passwordHash,
        })
        .where(eq(users.id, existingAdmin[0].id));
    }
  }

  console.log('[Seed] Semilla institucional y usuario maestro asegurados con éxito.');
}

// Ejecutar si se invoca directamente desde CLI
if (process.argv[1]?.endsWith('seed.ts')) {
  const shouldResetUsers = process.argv.includes('--reset-users');
  seedDatabase({ resetAllUsers: shouldResetUsers })
    .then(() => {
      console.log('✅ Proceso de seeding finalizado satisfactoriamente.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Error durante seeding:', err);
      process.exit(1);
    });
}
