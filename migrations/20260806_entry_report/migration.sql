-- Migration: 20260806_entry_report
-- Date: 2026-08-06
-- DB objetivo: jt_documents (misma DB del baseline / resto de migraciones)
-- Description: Agrega trazabilidad de LOTE de entrada. Cada carpeta
--              [tipo_oficio]/[YYYYMMDD]/CORTE_[n]/ (o [tipo_oficio]/[YYYYMMDD]/
--              SIN_CORTE/ cuando no hay corte) pasa a generar un registro en
--              la tabla nueva "entry_report", con contadores de cuántos
--              documentos se leyeron en la carpeta vs. cuántos terminaron
--              procesados OK / en error. Permite responder "¿este lote ya
--              terminó de procesarse por completo?" sin recorrer el
--              filesystem.
--
--              Cada "documents" pasa a guardar de qué lote vino
--              (entry_report_id + las columnas desnormalizadas tipo_oficio /
--              fecha_entrada / corte, que evitan un JOIN para lo que hoy ya
--              se consulta sueltas: p.ej. reportería por tipo de oficio).
--              Todas las columnas nuevas de "documents" son NULL-ables salvo
--              conteo_registrado (default FALSE), porque los documentos
--              históricos (creados antes de este cambio) no tienen un lote de
--              origen conocido.
--
--              Diseño de columnas relevantes:
--                - reporte_generado_en / reporte_ruta: quedan NULL hasta que
--                  el cron de reportería genera el Excel del lote por primera
--                  vez. Sin ellas, el cron no tiene forma de saber si ya
--                  generó el reporte de ese lote en un tick anterior y lo
--                  regeneraría (y reenviaría) en cada ejecución mientras el
--                  lote siga activo.
--                - conteo_registrado (en documents): candado de idempotencia.
--                  El incremento de numero_documentos_procesados /
--                  numero_documentos_error en entry_report se dispara desde
--                  una cola (con reintentos y reprocesos manuales posibles);
--                  sin este flag un mismo documento podría contarse dos
--                  veces. Se verifica y marca en la misma transacción que
--                  incrementa el contador.
--                - tipo_oficio vs. tipo_oficio_ia (en documents): tipo_oficio
--                  se deriva de la ruta de entrada (carpeta física donde cayó
--                  el archivo); tipo_oficio_ia es lo que detecta el modelo
--                  (Gemini) o la hoja del Excel en el flujo masivo. Se
--                  guardan por separado para poder auditar discrepancias
--                  entre ambos (archivo depositado en carpeta equivocada,
--                  etc.), sin que uno pise al otro.
--
--              Tipo de "id": TEXT, igual que "documents"."id" y el resto de
--              PKs uuid del baseline (ver 20260611_baseline/migration.sql).
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS "entry_report" (
  "id"                            TEXT          NOT NULL,
  "fecha_creacion"                TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "tipo_oficio"                   TEXT          NOT NULL,
  "fecha_entrada"                 TEXT          NOT NULL,
  "corte"                         TEXT          NOT NULL,
  "ruta"                          TEXT          NOT NULL,
  "numero_documentos_entrada"     INTEGER       NOT NULL DEFAULT 0,
  "numero_documentos_procesados"  INTEGER       NOT NULL DEFAULT 0,
  "numero_documentos_error"       INTEGER       NOT NULL DEFAULT 0,
  "reporte_generado_en"           TIMESTAMP(3)  NULL,
  "reporte_ruta"                  TEXT          NULL,
  CONSTRAINT "entry_report_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "entry_report_tipo_oficio_fecha_entrada_corte_key"
  ON "entry_report" ("tipo_oficio", "fecha_entrada", "corte");

CREATE INDEX IF NOT EXISTS "entry_report_fecha_entrada_corte_idx"
  ON "entry_report" ("fecha_entrada", "corte");

ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "entry_report_id"     TEXT    NULL;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "tipo_oficio"         TEXT    NULL;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "tipo_oficio_ia"      TEXT    NULL;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "fecha_entrada"       TEXT    NULL;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "corte"               TEXT    NULL;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "nombre_oficio_final" TEXT    NULL;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "conteo_registrado"   BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'documents_entry_report_id_fkey'
  ) THEN
    ALTER TABLE "documents"
      ADD CONSTRAINT "documents_entry_report_id_fkey"
      FOREIGN KEY ("entry_report_id") REFERENCES "entry_report"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS "documents_entry_report_id_idx" ON "documents" ("entry_report_id");

COMMIT;
