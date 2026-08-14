-- Migración: document_prioritario
-- Fecha: 2026-08-14
-- Descripción: agrega la columna `prioritario` a `documents`, para marcar
-- archivos que vinieron de una subcarpeta CORTE_n/FID/ y deben procesarse
-- con prioridad en cola_ocr/cola_modelo antes que el resto del corte.

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS prioritario BOOLEAN NOT NULL DEFAULT false;
