# 🧠 Registro de Decisiones y Estado de Tareas

Histórico de decisiones técnicas relevantes. Agregar una entrada por cada cambio arquitectónico significativo (con fecha).

## Registro de Decisiones

| Fecha | Decisión | Justificación |
|:------|:---------|:--------------|
| 2026-06-11 | Documentación en capas (general → específico) | `AGENTS.md` queda como router general; temas específicos (DB, arquitectura, decisiones) viven en `.agents/*.md`. |
| 2026-06-11 | Consecutivo diario atómico (`DailySequenceService`) | Reemplaza `COUNT(*)` en ambos flujos para evitar race conditions y colisiones entre flujo individual y masivo. Tabla `daily_sequences` + función SQL `next_daily_sequence()`. |
| 2026-06-11 | Migraciones SQL en `migrations/` | Archivos numerados (`NNN_descripcion.sql`), idempotentes. Reemplaza archivos sueltos `migration.sql`. |
| 2026-06-10 | Diagramas de arquitectura actualizados | Reemplazados diagramas obsoletos por tres: arquitectura general, flujo masivo, flujo individual. |
| 2026-06-10 | Eliminación de modos FTP/Gmail | Solo queda `Local*Strategy`. |
| 2026-06-10 | Rutas de destino externas configurables | `EXCEL_DESTINATION_PATH` y `OCR_DESTINATION_PATH` con bind-mounts en Docker. |
| 2026-06-04 | Deduplicación estricta contra DB | Eliminado Set en memoria; solo validación contra DB. |
| 2026-06-04 | Extracción de ruta original | Propagación de `originalPath` via BullMQ para trazabilidad. |
| 2026-05-12 | Integración REST Automatizada | `IntegrationService` con Auth Bearer Token dinámica. |
| 2026-03-18 | Patrón Strict JSON (Gemini) | Structured Outputs nativos para consistencia. |
| 2026-03-18 | Redis Distributed Lock | Reemplaza `.lock` en filesystem. |
| 2026-03-18 | Arquitectura Multi-Tenant | Inyección dinámica de `TenantProfile`. |
| 2026-03-18 | Cascade Fallback Multi-Modelo | Rotación Flash 2.5 → 1.5 → Pro para cuotas RPM. |
| 2026-02-19 | Implementación BullMQ | Colas independientes OCR y Modelo. |

## Estado de Tareas

- [x] Integración REST externa (IA_OK / EXCEL_OK)
- [x] Eliminar modos FTP/Gmail
- [x] Consecutivo diario atómico
- [x] Migraciones SQL organizadas en `migrations/`
- [ ] Manejo de fallos de `sendData` (cola de reenvío o flag en DB)
- [ ] Bull Dashboard para monitoreo visual
