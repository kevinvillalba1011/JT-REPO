-- =============================================================================
-- Migración 000: Baseline del esquema
-- Fecha: 2026-06-11
-- Descripción: Estado actual de la DB en producción al momento de iniciar el
--              control formal de migraciones. Consolida todos los cambios
--              previos (excel_records con payload JSON, hash_md5 opcional,
--              tabla daily_sequences + función next_daily_sequence).
--              Aplicar SOLO en entornos nuevos. La DB de producción ya
--              contiene este esquema y no necesita ejecutarlo.
-- =============================================================================

-- Enum DocumentState
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DocumentState') THEN
    CREATE TYPE "DocumentState" AS ENUM (
      'INGRESADO',
      'EN_COLA_OCR',
      'PROCESANDO_OCR',
      'ERROR_OCR',
      'OCR_UNREADABLE',
      'EN_COLA_MODELO',
      'PROCESANDO_MODELO',
      'MODEL_ERROR',
      'IA_OK',
      'FORMATO_NO_SOPORTADO',
      'DUPLICADO',
      'PROCESANDO_EXCEL',
      'EXCEL_OK',
      'ERROR_EXCEL'
    );
  END IF;
END$$;

-- Tabla documents
CREATE TABLE IF NOT EXISTS "documents" (
  "id"              TEXT          NOT NULL,
  "nombre_archivo"  TEXT          NOT NULL,
  "hash_md5"        TEXT          NULL,
  "estado"          "DocumentState" NOT NULL,
  "texto_ocr"       TEXT          NULL,
  "json_modelo"     JSONB         NULL,
  "created_at"      TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3)  NOT NULL,
  CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "documents_created_at_idx" ON "documents" ("created_at");
CREATE INDEX IF NOT EXISTS "documents_estado_idx"     ON "documents" ("estado");
CREATE INDEX IF NOT EXISTS "documents_hash_md5_idx"   ON "documents" ("hash_md5");

-- Tabla document_state_logs
CREATE TABLE IF NOT EXISTS "document_state_logs" (
  "id"               TEXT          NOT NULL,
  "document_id"      TEXT          NOT NULL,
  "estado_anterior"  "DocumentState" NULL,
  "nuevo_estado"     "DocumentState" NOT NULL,
  "created_at"       TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "document_state_logs_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'document_state_logs_document_id_fkey'
  ) THEN
    ALTER TABLE "document_state_logs"
      ADD CONSTRAINT "document_state_logs_document_id_fkey"
      FOREIGN KEY ("document_id") REFERENCES "documents" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

-- Tabla excel_records (con payload JSON genérico)
CREATE TABLE IF NOT EXISTS "excel_records" (
  "id"             TEXT          NOT NULL,
  "nombre_excel"   TEXT          NOT NULL,
  "tipo_oficio"    TEXT          NOT NULL,
  "numero_fila"    INTEGER       NOT NULL,
  "payload"        JSONB         NOT NULL,
  "created_at"     TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "excel_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "excel_records_nombre_excel_idx" ON "excel_records" ("nombre_excel");
CREATE INDEX IF NOT EXISTS "excel_records_tipo_oficio_idx"  ON "excel_records" ("tipo_oficio");

-- Tabla daily_sequences + función atómica next_daily_sequence
CREATE TABLE IF NOT EXISTS "daily_sequences" (
  "fecha"           DATE    PRIMARY KEY,
  "siguiente_valor" INTEGER NOT NULL DEFAULT 1
);

CREATE OR REPLACE FUNCTION next_daily_sequence(p_date DATE)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_val INTEGER;
BEGIN
  INSERT INTO daily_sequences (fecha, siguiente_valor)
  VALUES (p_date, 2)
  ON CONFLICT (fecha)
  DO UPDATE SET siguiente_valor = daily_sequences.siguiente_valor + 1
  RETURNING siguiente_valor - 1 INTO v_val;

  RETURN v_val;
END;
$$;
