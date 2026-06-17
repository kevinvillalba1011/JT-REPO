-- Migration: 20260617_lotes_enviados
-- Date: 2026-06-17
-- Description: Agrega columna lotes_enviados a documents para almacenar
--              los payloads enviados al servicio externo en el flujo masivo.
--              Cada elemento del array corresponde a un lote (chunk de demandados).

ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "lotes_enviados" JSONB NULL;
