# 🧠 Registro de Decisiones y Estado de Tareas

Histórico de decisiones técnicas relevantes. Agregar una entrada por cada cambio arquitectónico significativo (con fecha).

## Registro de Decisiones

| Fecha | Decisión | Justificación |
|:------|:---------|:--------------|
| 2026-07-06 | Cola dedicada `cola_masivos` + `MasivoProcessor` | El flujo masivo (Excel/CSV) compartía `cola_ocr`/`OcrProcessor` con el flujo individual — un batch grande (con reintentos/backoff HTTP internos en `sendBatchWithRetry`) podía ocupar varios de los 5 workers de `cola_ocr`, dejando PDFs individuales esperando turno en la misma cola. Se separó en una cola propia con concurrencia independiente (`MASIVO_QUEUE_CONCURRENCY`, default 2) y `attempts: 1` (sin reintento de BullMQ: `sendBatchWithRetry` ya reintenta el envío HTTP internamente; reintentar el Job completo repetiría el parseo y arriesgaría envíos duplicados al servicio externo). Manejo de errores replicado de `OcrProcessor` (clasificación permanente/transitorio + mover a revisión), reutilizando `ERROR_OCR` como estado terminal — sin estado de error dedicado. Nuevo estado `EN_COLA_MASIVO` en el enum (migración `migrations/20260706_add_en_cola_masivo/migration.sql`, `ALTER TYPE ... ADD VALUE`, sin recrear el tipo). `recoverPendingDocuments()` contempla `EN_COLA_MASIVO`/`PROCESANDO_EXCEL` igual que los otros dos flujos. |
| 2026-07-06 | Emparejamiento PDF↔Excel + exclusión de "masivos" al escaneo individual | Las plantillas Excel traen el nombre original del PDF asociado (`NOMBRE OFICIO INICIAL`, 1 Excel = 1 PDF confirmado) y el nombre final deseado (`NOMBRE OFICIO FINAL`). `MassiveExcelService` localiza el PDF en `MASIVOS_SOURCE_PATH` por nombre (normalizado trim/mayúsculas, tolera `.pdf`/`.PDF`), lo renombra a `nombreOficioFinal` + extensión real, y lo mueve a `EXCEL_DESTINATION_PATH` junto con el Excel — solo tras completar el batch sin lanzar excepción (si el Excel falla, el PDF queda intacto). `oficio.rutaPdf` pasó a apuntar a ese PDF (antes apuntaba al propio Excel); fallback `"0"` si no se encuentra. Requirió excluir PDFs/imágenes del escaneo automático específicamente en la carpeta "masivos" (`LocalFileStrategy` + `MASIVOS_SOURCE_PATH`): sin esto, el flujo individual recogía el PDF en paralelo antes de que el Excel llegara a reclamarlo, una condición de carrera real (no hipotética) dado que el PDF puede esperar en la carpeta un tiempo indeterminado mientras alguien llena la plantilla a mano. |
| 2026-07-06 | Consecutivo diario deshabilitado para `nombreOficioFinal` en flujo masivo | A diferencia del flujo individual (que sigue usando `DailySequenceService` para completar el consecutivo del placeholder), el usuario requiere que en el flujo masivo el nombre final quede **literal**, tal como viene en la columna `NOMBRE OFICIO FINAL` de la plantilla, sin reemplazo automático de placeholder. El bloque de reemplazo queda comentado en `massive-excel.service.ts` (no eliminado), documentando la intención. |
| 2026-06-24 | Limpieza enum `DocumentState`: elimina `OCR_UNREADABLE`, `DUPLICADO`, `ERROR_EXCEL` | Quedaron vestigiales tras el flujo multimodal (sin ningún setter en el código vigente). `OCR_UNREADABLE` lo reemplazó `MODEL_ERROR`; `DUPLICADO` nunca llegó a usarse (la dedup actual mueve/descarta el archivo sin crear registro); `ERROR_EXCEL` nunca se seteaba (los errores de Excel ya caían en `ERROR_OCR`, comportamiento que se mantiene). PostgreSQL no soporta `DROP VALUE` en enums: la migración (`migrations/20260624_cleanup_document_state_enum/migration.sql`) reclasifica filas históricas a `ERROR_OCR` antes de recrear el tipo. Verificado en dev: 0 filas afectadas. |
| 2026-06-24 | Flujo invertido: IA multimodal primero, OCR fallback | El PDF/imagen va **directo a Gemini (multimodal)** como camino principal; Document AI (OCR) solo se usa si el multimodal falla o el archivo supera `GEMINI_INLINE_MAX_MB` (default 15 MB). Más barato (elimina el peaje de OCR por página), mejor en layouts de columnas, y desbloquea documentos de +30 páginas (Gemini acepta PDF nativo, sin el tope de imageless de Document AI). DocAI sigue siendo dependencia obligatoria por ser el fallback. Lógica en `model.processor.ts` → `extraerMultimodalConFallback`. |
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
