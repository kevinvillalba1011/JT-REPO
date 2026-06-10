# Project Rules & Guidelines - JT-REPO

Este documento contiene las reglas mandatorias para cualquier agente de IA o desarrollador que trabaje en este repositorio.

## 🗄️ Database Management (Prisma)
- **Schema First**: Todos los cambios de estructura deben iniciarse en `schema.prisma`.
- **🚫 PROHIBIDO - Migraciones Directas**: Está TERMINANTEMENTE PROHIBIDO ejecutar comandos de migración automática como `npx prisma migrate dev`, `npx prisma migrate deploy`, o cualquier comando que aplique cambios directamente a la base de datos. Los agentes NO deben modificar la DB mediante migraciones automáticas bajo ninguna circunstancia.
- **SQL Manual Flow**:
    1. Antes de modificar `schema.prisma`, guardar una copia del archivo actual (p. ej. `git show HEAD:schema.prisma > /tmp/schema_old.prisma`).
    2. Modificar `schema.prisma` con los cambios necesarios.
    3. Generar el script SQL diffando la versión anterior contra la nueva (100% basado en archivos, no toca la DB): `npx prisma migrate diff --from-schema-datamodel /tmp/schema_old.prisma --to-schema-datamodel schema.prisma --script > migration.sql`.
    4. Revisar el SQL generado: si agrega columnas `NOT NULL` a tablas con datos existentes, agregar un `DEFAULT` temporal (y luego `DROP DEFAULT`) o documentar que la tabla debe truncarse.
    5. **ENTREGAR el archivo `migration.sql` generado al usuario** para que lo revise y aplique manualmente en la DB.
    6. Ejecutar `npx prisma generate` para sincronizar el cliente de Prisma.
    - ⚠️ Nota: `--from-schema-datamodel schema.prisma --to-schema-datamodel schema.prisma` (diffar el archivo contra sí mismo) siempre produce un diff vacío — usar siempre la copia "antes" del schema como `--from-schema-datamodel`.
- **Nunca asumas permisos de escritura en la DB**: Siempre genera el SQL y pásalo al usuario para revisión y aplicación manual.

## 🛠️ Development Standards
- **Linting**: Es obligatorio ejecutar `npm run lint` después de cualquier modificación de código. No se deben dejar errores de lint pendientes.
- **Path Aliases**: Usar siempre alias de ruta `@/*` para imports internos (configurado como `src/*`).
- **Memory Safety**: Para el procesamiento de archivos masivos (Excel/CSV), usar siempre flujos (Streams) con la librería `exceljs` para evitar desbordamientos de memoria.

## 🚀 Business Logic
- **Excel/CSV Bypass**: Todos los archivos `.xlsx`, `.xls` y `.csv` deben ser interceptados para carga directa a la base de datos, omitiendo el paso por OCR o Modelos de IA (Gemini).
- **Idempotency**: Al procesar archivos masivos, siempre limpiar registros previos asociados al nombre del archivo para permitir reintentos seguros.
