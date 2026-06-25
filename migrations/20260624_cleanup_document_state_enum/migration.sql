-- Migration: 20260624_cleanup_document_state_enum
-- Date: 2026-06-24
-- Description: Limpia el enum DocumentState eliminando 3 valores vestigiales
--              que ya no se asignan en ningún flujo del código vigente:
--                - OCR_UNREADABLE: con el flujo multimodal (PDF directo a
--                  Gemini, Document AI solo como fallback) ya no existe un
--                  paso separado de "OCR ilegible"; los documentos que no se
--                  pueden extraer caen hoy en MODEL_ERROR.
--                - DUPLICADO: la deduplicación actual (LocalFileStrategy)
--                  mueve/descarta el archivo origen sin crear un registro
--                  Document; este estado nunca se asigna en el código vigente.
--                - ERROR_EXCEL: el flujo de Excel/CSV masivo no setea este
--                  estado; cualquier error de Excel cae hoy en el catch
--                  genérico de OcrProcessor y queda como ERROR_OCR (revisado
--                  y aceptado explícitamente al decidir esta limpieza).
--
--              NOTA IMPORTANTE (PostgreSQL): un tipo ENUM no soporta
--              "ALTER TYPE ... DROP VALUE". La única forma de remover valores
--              es: renombrar el tipo actual, crear uno nuevo con la lista
--              reducida, migrar las columnas dependientes al nuevo tipo
--              (vía cast a TEXT y de vuelta al enum), y eliminar el tipo viejo.
--              Si alguna fila existente todavía usa un valor a eliminar, el
--              cast del paso de migración de columnas FALLARÍA; por eso el
--              Paso 1 reclasifica esas filas ANTES del swap del tipo.
--
--              Verificado en el ambiente de desarrollo donde se generó este
--              script: 0 filas en "documents" y 0 filas en
--              "document_state_logs" usan alguno de los 3 valores a eliminar.
--              El paso 1 se deja igual como medida defensiva, por si la DB
--              destino (ej. producción) sí tiene filas históricas.
--
--              Mapeo de reclasificación histórica (todas -> ERROR_OCR):
--                OCR_UNREADABLE -> ERROR_OCR  (ya era una falla terminal de
--                  extracción, previa al modelo; ERROR_OCR es el bucket de
--                  errores de esa misma etapa)
--                ERROR_EXCEL    -> ERROR_OCR  (mismo comportamiento que hoy
--                  tiene el código vigente para errores de Excel)
--                DUPLICADO      -> ERROR_OCR  (reclasificación de
--                  conveniencia: no queda un estado "descartado sin error"
--                  en el enum resultante. Si en el futuro se necesita
--                  distinguir duplicados históricos para reportería, hacerlo
--                  ANTES de correr este script, p.ej. exportando esas filas
--                  por su "estado" actual)
-- =============================================================================

-- Paso 1: Reclasificar filas históricas que usen los valores a eliminar
-- (defensivo; no-op si no existen filas, como en este ambiente de desarrollo).
UPDATE "documents"
SET "estado" = 'ERROR_OCR'
WHERE "estado"::text IN ('OCR_UNREADABLE', 'DUPLICADO', 'ERROR_EXCEL');

UPDATE "document_state_logs"
SET "estado_anterior" = 'ERROR_OCR'
WHERE "estado_anterior"::text IN ('OCR_UNREADABLE', 'DUPLICADO', 'ERROR_EXCEL');

UPDATE "document_state_logs"
SET "nuevo_estado" = 'ERROR_OCR'
WHERE "nuevo_estado"::text IN ('OCR_UNREADABLE', 'DUPLICADO', 'ERROR_EXCEL');

-- Paso 2: Swap del tipo ENUM (renombrar viejo, crear nuevo reducido,
-- migrar columnas dependientes, eliminar el tipo viejo).
ALTER TYPE "DocumentState" RENAME TO "DocumentState_old";

CREATE TYPE "DocumentState" AS ENUM (
  'INGRESADO',
  'EN_COLA_OCR',
  'PROCESANDO_OCR',
  'ERROR_OCR',
  'EN_COLA_MODELO',
  'PROCESANDO_MODELO',
  'MODEL_ERROR',
  'IA_OK',
  'FORMATO_NO_SOPORTADO',
  'PROCESANDO_EXCEL',
  'EXCEL_OK'
);

ALTER TABLE "documents"
  ALTER COLUMN "estado" TYPE "DocumentState"
  USING ("estado"::text::"DocumentState");

ALTER TABLE "document_state_logs"
  ALTER COLUMN "estado_anterior" TYPE "DocumentState"
  USING ("estado_anterior"::text::"DocumentState");

ALTER TABLE "document_state_logs"
  ALTER COLUMN "nuevo_estado" TYPE "DocumentState"
  USING ("nuevo_estado"::text::"DocumentState");

DROP TYPE "DocumentState_old";

-- NOT NULL e índices existentes (documents_estado_idx, etc.) se preservan
-- automáticamente: ALTER COLUMN ... TYPE no afecta otras propiedades de la
-- columna ni requiere recrear índices manualmente en PostgreSQL.
