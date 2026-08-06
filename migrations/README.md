# Migraciones SQL

Cada cambio de esquema de base de datos se registra en una carpeta propia dentro de esta.

## Convención

- Nombre: `YYYYMMDD_descripcion_corta/migration.sql` (ej. `20260806_entry_report/migration.sql`)
- Cada archivo empieza con un bloque de comentario: nombre de la migración, fecha, descripción
- Las sentencias deben ser **idempotentes** cuando sea posible (`IF NOT EXISTS`, `IF EXISTS`, `OR REPLACE`)
- No se usa `prisma migrate` — los cambios se aplican manualmente con estos scripts
- Se aplican en orden cronológico según el nombre de la carpeta (que ya ordena por fecha)

## Baseline

`20260611_baseline/migration.sql` es el estado de la DB en producción al 2026-06-11. Consolida todos los cambios previos (estructura de `documents`, `document_state_logs`, `excel_records` con payload JSON, `daily_sequences` + función `next_daily_sequence`). **No se debe ejecutar en producción** — esa DB ya tiene este esquema. Solo sirve para levantar entornos nuevos desde cero.

A partir de ahí cada cambio incremental tiene su propia carpeta (`YYYYMMDD_descripcion_corta/migration.sql`) y se aplica en orden cronológico en producción.

## Cómo aplicar en el servidor

Ejecutar los archivos pendientes en orden cronológico:

```bash
# Desde el servidor, conectado a la DB
psql -U postgres -d jt_documents -f migrations/20260806_entry_report/migration.sql
```

O todos de una vez (solo los que no se hayan aplicado):

```bash
for f in migrations/*/migration.sql; do psql -U postgres -d jt_documents -f "$f"; done
```

## Después de aplicar

Siempre regenerar el cliente Prisma si se modificó `schema.prisma`:

```bash
npx prisma generate
```
