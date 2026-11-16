-- ==============================================================================
-- SCRIPT DE PRINCIPIO DE MENOR PRIVILEGIO (LEAST PRIVILEGE) PARA POSTGRESQL CLOUD SQL
-- Sistema de Control y Reporte de Asistencia Escolar
-- ==============================================================================

-- 1. Crear un usuario de base de datos específico para la aplicación web
-- (Sin privilegios de superusuario ni facultades administrativas de clúster)
DO
$do$
BEGIN
   IF NOT EXISTS (
      SELECT FROM pg_catalog.pg_roles
      WHERE rolname = 'app_school_user') THEN

      CREATE ROLE app_school_user WITH
         LOGIN
         NOSUPERUSER
         NOCREATEDB
         NOCREATEROLE
         NOINHERIT
         PASSWORD 'ColegioSeguroCloud2026!#';
   END IF;
END
$do$;

-- 2. Revocar privilegios por defecto del esquema público a roles anónimos/públicos
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON DATABASE postgres FROM PUBLIC;

-- 3. Otorgar acceso de conexión estricto a la base de datos de producción
GRANT CONNECT ON DATABASE postgres TO app_school_user;

-- 4. Otorgar uso exclusivo sobre el esquema de tablas escolares
GRANT USAGE ON SCHEMA public TO app_school_user;

-- 5. Otorgar ÚNICAMENTE las operaciones DML necesarias sobre las tablas del sistema escolar
-- Prohibiendo explícitamente DROP TABLE, TRUNCATE, ALTER TABLE, etc.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
   public.users,
   public.configuracion_institucional,
   public.recesos_institucionales,
   public.anos_escolares,
   public.secciones,
   public.materias,
   public.docente_materias,
   public.representantes,
   public.estudiantes,
   public.asistencia,
   public.horarios,
   public.audit_logs
TO app_school_user;

-- 6. Otorgar permisos sobre las secuencias para generación segura de IDs autoincrementales
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO app_school_user;

-- 7. Configurar privilegios por defecto para tablas futuras creadas por migraciones
ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_school_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO app_school_user;

-- 8. Verificación de permisos asignados
SELECT grantee, table_name, privilege_type 
FROM information_schema.role_table_grants 
WHERE grantee = 'app_school_user';
