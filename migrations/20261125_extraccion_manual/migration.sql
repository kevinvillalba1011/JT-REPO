-- Migration: 20261125_extraccion_manual
-- Date: 2026-11-25
-- DB objetivo: jt_documents (misma DB del baseline / resto de migraciones)
-- Description: Agrega el valor MANUAL_OK al enum DocumentState. Las extracciones
--              a demanda (POST /extraction/manual, boton "Rellenar datos (IA)"
--              del portal B2B) se guardan en la tabla "documents" existente
--              (json_modelo), con este estado propio para que NO las tome el
--              reporte diario ni las metricas del flujo batch, que consumen
--              IA_OK. No se crea ninguna tabla ni columna nueva.
--
-- Igual que 20260706_add_en_cola_masivo: sentencia suelta, sin BEGIN/COMMIT
-- (ALTER TYPE ... ADD VALUE no corre dentro de una transaccion en Postgres < 12).

ALTER TYPE "DocumentState" ADD VALUE IF NOT EXISTS 'MANUAL_OK';
