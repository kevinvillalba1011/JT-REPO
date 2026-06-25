-- Migration: 20260624_integration_sent_tracking
-- Date: 2026-06-24
-- Description: Agrega trazabilidad del envío al servicio externo (Gap A de
--              la auditoría de trazabilidad). Hoy `sendData()` (en
--              IntegrationService) nunca lanza excepción y devuelve un
--              boolean que ModelProcessor descartaba: si el envío fallaba
--              tras IA_OK, no quedaba ningún rastro consultable en BD de que
--              el JSON no había llegado al sistema externo.
--
--              Diseño: campo de estado de entrega DEDICADO, separado del
--              DocumentState principal (no se sobrecarga `estado`). `estado`
--              sigue significando exactamente lo mismo que hoy (IA_OK =
--              extracción exitosa). El nuevo enum IntegrationStatus responde
--              una pregunta independiente ("¿se entregó?"):
--                - estado_integracion:     PENDIENTE (default) = aún no se
--                                          intentó enviar
--                                          ENVIADO = entregado con éxito
--                                          FALLIDO = se intentó y falló
--                - integracion_enviado_en: fecha/hora del último intento
--                - integracion_error:      mensaje de error del último intento
--                                          fallido (NULL si fue exitoso)
--
--              Permite consultas directas como:
--                SELECT * FROM documents WHERE estado = 'IA_OK' AND estado_integracion = 'FALLIDO';
--              para encontrar documentos correctamente extraídos pero
--              pendientes de reenvío manual.
-- =============================================================================

-- Enum IntegrationStatus (mismo patrón idempotente que el enum DocumentState
-- en el baseline: crear solo si no existe).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'IntegrationStatus') THEN
    CREATE TYPE "IntegrationStatus" AS ENUM ('PENDIENTE', 'ENVIADO', 'FALLIDO');
  END IF;
END$$;

ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "estado_integracion" "IntegrationStatus" NOT NULL DEFAULT 'PENDIENTE';

ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "integracion_enviado_en" TIMESTAMP(3) NULL;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "integracion_error" TEXT NULL;

CREATE INDEX IF NOT EXISTS "documents_estado_integracion_idx" ON "documents" ("estado_integracion");
