# Migraciones SQL

Cada cambio de esquema de base de datos se registra como un archivo SQL numerado en esta carpeta.

## Convención

- Nombre: `NNN_descripcion_corta.sql` (ej. `001_add_integration_sent.sql`)
- Cada archivo empieza con un bloque de comentario: número, fecha, descripción
- Las sentencias deben ser **idempotentes** cuando sea posible (`IF NOT EXISTS`, `IF EXISTS`, `OR REPLACE`)
- No se usa `prisma migrate` — los cambios se aplican manualmente con estos scripts

## Baseline

`000_baseline.sql` es el estado actual de la DB en producción al 2026-06-11. Consolida todos los cambios previos (estructura de `documents`, `document_state_logs`, `excel_records` con payload JSON, `daily_sequences` + función `next_daily_sequence`). **No se debe ejecutar en producción** — esa DB ya tiene este esquema. Solo sirve para levantar entornos nuevos desde cero.

A partir de `001_*.sql` cada cambio incremental tiene su archivo propio y se aplica en orden en producción.

## Cómo aplicar en el servidor

Ejecutar los archivos pendientes en orden numérico:

```bash
# Desde el servidor, conectado a la DB
psql -U postgres -d jt_documents -f migrations/001_xxx.sql
```

O todos de una vez (solo los que no se hayan aplicado):

```bash
for f in migrations/*.sql; do psql -U postgres -d jt_documents -f "$f"; done
```

## Después de aplicar

Siempre regenerar el cliente Prisma si se modificó `schema.prisma`:

```bash
npx prisma generate
```
