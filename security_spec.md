# Security Specification - EduControl Cloud (Firestore)

## 1. Data Invariants
1. **Verified Authentication**: Every read and write requires `request.auth != null` and `request.auth.token.email_verified == true`.
2. **RBAC Hierarchy**:
   - `director` (including bootstrapped admin `adrian0424344@gmail.com`): Full institutional management (`users`, `configuracion_institucional`, `lapsos_escolares`, `audit_logs`, backup/restore, all academic/attendance/grades).
   - `coordinador`: Manages `anos_escolares`, `secciones`, `materias`, `docente_materias`, `horarios`, `recesos_institucionales`, `representantes`, `estudiantes`, and academic records. Cannot modify `users`, `configuracion_institucional`, `lapsos_escolares`, or view `audit_logs`.
   - `docente`: Can read academic catalog (`anos_escolares`, `secciones`, `materias`, `docente_materias`, `horarios`, `estudiantes`), read/write `asistencia` and `calificaciones` only when assigned to the target `idMateria` via `docente_materias` or when performing authorized class operations; cannot view `representantes` PII or other `users` PII.
   - `representante`: Can read only their own `representantes` profile, their own `estudiantes` (`resource.data.idRepresentante == getRepId()`), their own children's `asistencia` and `calificaciones` (`resource.data.idRepresentante == getRepId()`), and institutional schedule/recess metadata. Can only update their own `telefono` and `email` in `representantes`, and manage their own `push_subscriptions`.
3. **No Self-Assigned Roles**: Non-admin users cannot create or elevate their own `rol` in `/users` or `/staff_emails`.
4. **PII Isolation**:
   - `users` PII (`email`, `telefono`, `cedula`) is readable only by `director`, `coordinador`, or the profile owner (`resource.data.email == request.auth.token.email`).
   - `representantes` PII is readable only by `director`, `coordinador`, or the owner (`resource.data.email == request.auth.token.email`).
5. **Strict Key & Type Validation**: Every collection validates required fields, allowed keys (`hasOnly`), string lengths (`.size()`), regex patterns for IDs/dates/times, and numeric bounds (e.g., `nota >= 0 && nota <= 20`).

## 2. Dirty Dozen Adversarial Payloads
1. **Unauthenticated Read**: `get(/estudiantes/1)` with `auth = null` -> `PERMISSION_DENIED`.
2. **Unverified Email Write**: `create(/asistencia/1_1_1er)` with `auth.token.email_verified = false` -> `PERMISSION_DENIED`.
3. **Self-Privilege Escalation**: Non-admin authenticated user creates `/users/999` with `rol: "director"` -> `PERMISSION_DENIED`.
4. **Role Mutation via Update**: `docente` updates `/users/own` changing `rol` from `"docente"` to `"director"` -> `PERMISSION_DENIED`.
5. **Shadow / Ghost Field Injection**: Staff creates `/calificaciones/1_1_1er` with an extra field `isAdminApproved: true` -> `PERMISSION_DENIED` (`hasOnly` rejects unknown keys).
6. **IDOR Student Read by Representante**: Representative A queries `/estudiantes` where `idRepresentante == repB` -> `PERMISSION_DENIED`.
7. **IDOR Grades Read by Representante**: Representative A reads `/calificaciones/studentB_1_1er` -> `PERMISSION_DENIED`.
8. **Docente Modifying Unassigned Subject**: `docente` creates `/calificaciones/1_99_1er` where `idMateria == 99` is not assigned to them -> `PERMISSION_DENIED`.
9. **Docente Reading Audit Logs**: `docente` lists `/audit_logs` -> `PERMISSION_DENIED`.
10. **Coordinador Modifying Config/Lapsos**: `coordinador` updates `/lapsos_escolares/1` -> `PERMISSION_DENIED`.
11. **Value Poisoning (Out-of-Bounds Grade)**: Staff writes `/calificaciones/1_1_1er` with `nota: 999` or `nota: "twenty"` -> `PERMISSION_DENIED`.
12. **Resource Poisoning (Oversized ID / String)**: Authenticated user writes `/estudiantes/long_id_over_128_chars` or `nombres` of 5000 chars -> `PERMISSION_DENIED`.
