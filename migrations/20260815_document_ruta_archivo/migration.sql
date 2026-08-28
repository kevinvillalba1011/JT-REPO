-- Migration: 20260815_document_ruta_archivo
-- Date: 2026-08-15
-- DB objetivo: jt_documents (misma DB del baseline / resto de migraciones)
-- Description: Agrega "documents"."ruta_archivo" — la ruta física final a la
--              que se movió el archivo (carpeta de revisión OCR_UNREADABLE_PATH,
--              no-soportados UNSUPPORTED_PATH, etc.) cuando el documento
--              termina en un estado de error. Antes esa ruta solo quedaba
--              concatenada dentro del texto de error (ocrText / jsonModel.error),
--              sin quedar disponible como columna consultable. Sirve de soporte
--              al nuevo endpoint GET /documents/errores-ia.
--
--              También agrega un índice sobre "fecha_entrada" (columna ya
--              existente desde 20260806_entry_report), usado por ese mismo
--              endpoint para filtrar por la fecha efectiva del lote
--              (COALESCE(fecha_entrada, created_at)).
-- =============================================================================

BEGIN;

ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "ruta_archivo" TEXT;

CREATE INDEX IF NOT EXISTS "idx_documents_fecha_entrada" ON "documents" ("fecha_entrada");

COMMIT;
