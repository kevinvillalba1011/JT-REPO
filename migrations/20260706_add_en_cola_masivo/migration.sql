-- Migration: 20260706_add_en_cola_masivo
-- Date: 2026-07-06
-- Description: Agrega el valor EN_COLA_MASIVO al enum DocumentState.
-- Es el estado inicial de un Document del flujo masivo (Excel/CSV) antes de
-- que MasivoProcessor lo tome de la nueva cola dedicada `cola_masivos`
-- (separada de `cola_ocr` para que el procesamiento masivo no compita por
-- workers con el flujo individual de PDFs).
--
-- Postgres permite agregar valores a un enum existente con ALTER TYPE ...
-- ADD VALUE (no requiere recrear el tipo, a diferencia de eliminar valores).
-- NOTA: ALTER TYPE ... ADD VALUE no puede ejecutarse dentro de un bloque de
-- transacción explícito en versiones de Postgres anteriores a la 12; se deja
-- como sentencia suelta (sin BEGIN/COMMIT) para máxima compatibilidad.

ALTER TYPE "DocumentState" ADD VALUE IF NOT EXISTS 'EN_COLA_MASIVO';
