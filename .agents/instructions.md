# 🗄️ Database Management (Prisma)

Reglas para cualquier cambio que involucre `schema.prisma` o la base de datos PostgreSQL.

## Reglas

- **Schema First**: todo cambio de estructura inicia en `schema.prisma`.
- **🚫 PROHIBIDO**: ejecutar `prisma migrate dev`, `prisma migrate deploy`, `prisma db push`, o cualquier comando que aplique cambios directamente a la DB. Nunca asumir permisos de escritura en la DB — siempre generar SQL y pasarlo al usuario.

## Flujo manual de migraciones

1. Modificar `schema.prisma` con los cambios necesarios.
2. Escribir el SQL de migración manualmente en `migrations/NNN_descripcion.sql` (siguiente número en la secuencia).
3. El SQL debe ser **idempotente** (`IF NOT EXISTS`, `IF EXISTS`, `OR REPLACE`) y empezar con un bloque de comentario con número, fecha y descripción.
4. Si agrega columnas `NOT NULL` a tablas con datos existentes, agregar un `DEFAULT` temporal (y luego `DROP DEFAULT`) o documentar que la tabla debe truncarse.
5. **Entregar el archivo SQL al usuario** para que lo revise y aplique manualmente en la DB.
6. Ejecutar `npx prisma generate` para sincronizar el cliente de Prisma.

Ver [`../migrations/README.md`](../migrations/README.md) para convenciones de nombres y aplicación.

## Estado actual del esquema

- **`Document`** — una fila por archivo. `state` (enum), `ocrText`, `jsonModel` (Json), `md5Hash` (opcional, dedup ahora es por nombre de archivo), `DocumentStateLog[]` (audit trail).
- **`ExcelRecord`** — una fila por fila de Excel (`excelName`, `tipoOficio`, `numeroFila`, `payload: Json`).
- **`DailySequence`** — consecutivo diario atómico (`fecha` PK, `siguiente_valor`). Función SQL `next_daily_sequence(date)`, usada por `DailySequenceService` desde flujo individual y masivo. Nunca calcular consecutivos con `COUNT(*)`.

## Migraciones aplicadas

- `001_restructure_excel_records.sql` (2026-06-10) — `excel_records` pasa a `payload` JSON genérico, `hash_md5` opcional.
- `002_daily_sequence.sql` (2026-06-11) — tabla `daily_sequences` + función `next_daily_sequence()`.
