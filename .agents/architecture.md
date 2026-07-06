# 🏛 Arquitectura y Flujos

Detalle del pipeline, diagramas y módulos. Consultar al trabajar en `extraction`, `ocr`, `model`, `report`, `tenant`, `integration`.

## Diagrama de Arquitectura (Container Level)

```mermaid
graph TB
    subgraph "Capas del Sistema (NestJS)"
        ES[ExtractionService]
        OW[OcrProcessor]
        MP[MasivoProcessor]
        MW[ModelProcessor]
        ME[MassiveExcelService]
        RS[ReportService]
    end

    subgraph "Infraestructura & Persistencia"
        DB[(PostgreSQL)]
        RD[(Redis / BullMQ)]
        FS[Local File System]
    end

    subgraph "Servicios Externos (GCP)"
        DocAI(Document AI / solo fallback)
        Gemini(Gemini multimodal)
    end

    subgraph "Integración Externa"
        EXT(API REST Externa)
    end

    Source(LOCAL_SOURCE_PATHS / SERVER_PATH_*) --> ES
    ES -- copia a IN_PATH --> FS
    ES -- .xlsx/.xls/.csv --> RD
    ES -- resto de extensiones --> RD
    RD -- cola_masivos --> MP
    RD -- cola_ocr --> OW
    MP -- invoca --> ME
    OW -- PDF/imagen sin OCR, solo mueve --> RD
    RD -- cola_modelo --> MW
    MW -- 1 · PDF directo multimodal --> Gemini
    MW -- 2 · fallback si falla o supera inline --> DocAI
    DocAI -- texto OCR --> Gemini
    OW -- Update State --> DB
    MP -- Update State --> DB
    MW -- Save JSON --> DB
    ME -- Persist ExcelRecord --> DB
    MW -- sendData IA_OK --> EXT
    ME -- sendData EXCEL_ROW --> EXT
    RS -- Genera CSV --> DB
```

> **2026-07-06:** el flujo masivo dejó de compartir `cola_ocr`/`OcrProcessor` con el
> flujo individual. Ahora tiene su propia cola dedicada `cola_masivos` y su propio
> `MasivoProcessor`, para que un batch de Excel grande (reintentos/backoff en
> llamadas HTTP externas dentro de `sendBatchWithRetry`) no compita por workers con
> los PDFs del flujo individual. `ExtractionService.processFile()` enruta por
> extensión al crear el Job. Ver `.agents/decisions.md`.

## Flujo Masivo (Excel/CSV)

`ExtractionService` enruta `.xlsx`/`.xls`/`.csv` directo a `cola_masivos` (nunca pasan
por `cola_ocr`/`OcrProcessor`). `MasivoProcessor` (concurrencia `MASIVO_QUEUE_CONCURRENCY`,
default 2; `attempts: 1` — sin reintento a nivel BullMQ, ver justificación abajo)
invoca `MassiveExcelService.process()`, que bypasea OCR/IA por completo.

Lee el workbook completo en memoria con `exceljs` (**no** streaming — `WorkbookReader`
tiene un bug conocido con `sharedStrings.xml`, ver nota en `AGENTS.md` y detalle en
la entrada de decisiones correspondiente) → detecta tipo oficio → `mapRowToPayload()`
por fila → persiste en `ExcelRecord` (idempotente: limpia registros previos del mismo
archivo antes de re-insertar) → `startBatch` → `sendData` por chunk con reintento
interno (`sendBatchWithRetry`, hasta 3 intentos con backoff) → mueve el Excel a
`EXCEL_DESTINATION_PATH` → estado `EXCEL_OK`.

> `attempts: 1` es intencional: `sendBatchWithRetry` ya reintenta internamente el
> envío HTTP; reintentar el **Job completo** volvería a parsear el Excel y reenviar
> desde cero, arriesgando envíos duplicados al servicio externo. Los errores
> anteriores al envío (Excel corrupto, `startBatch` caído) se manejan igual que en
> `OcrProcessor`: clasificación permanente/transitorio (`isPermanentError`) y mover
> a `OCR_UNREADABLE_PATH` para revisión — reutilizando `ERROR_OCR` como estado
> terminal, sin un estado de error dedicado para masivo.

### Emparejamiento PDF ↔ Excel (1 Excel = 1 PDF)

Las plantillas Excel traen el nombre **original** del PDF asociado en
`NOMBRE OFICIO INICIAL` (con el que la persona que llenó la plantilla identificó el
documento) y el nombre **final** deseado en `NOMBRE OFICIO FINAL`. Antes de mover el
Excel a `EXCEL_DESTINATION_PATH`, `MassiveExcelService` busca en `MASIVOS_SOURCE_PATH`
un PDF cuyo nombre (sin extensión, normalizado trim/mayúsculas) coincida con
`nombreOficioInicial`, lo renombra a `nombreOficioFinal` + su extensión real, y lo
mueve junto con el Excel. `oficio.rutaPdf` apunta a esa ruta final (fallback `"0"`
si no se encontró el PDF — el Excel se procesa igual, sin bloquear el batch).

Para que esto funcione, `LocalFileStrategy` **excluye PDFs/imágenes del escaneo
individual específicamente en la carpeta "masivos"** (`MASIVOS_SOURCE_PATH`): solo
`.xlsx`/`.xls`/`.csv` se recogen ahí. Un PDF dejado en esa carpeta queda "en espera"
hasta que su Excel lo reclame por nombre — de lo contrario, el flujo individual lo
procesaría en paralelo antes de que el Excel llegara a buscarlo.

## Flujo Individual (IA multimodal primero — PDF directo; OCR solo fallback)

**El modelo de IA es ahora el camino PRINCIPAL de extracción.** `OcrProcessor` (`cola_ocr`) ya NO ejecuta OCR para PDF/imágenes: solo enruta (Excel bypass, formato no soportado), mueve el archivo a `OCR_PATH` y lo encola a `cola_modelo` SIN texto.

`ModelProcessor` → `extraerMultimodalConFallback(filePath)`:
1. **Principal:** envía el PDF/imagen **directo a Gemini (multimodal)**. Gemini acepta PDF nativo, **sin el tope de ~30 páginas** de Document AI (imageless): así un oficio de +30 páginas se procesa sin problema.
2. **Fallback (Document AI):** si el multimodal falla, o el archivo supera `GEMINI_INLINE_MAX_MB` (default 15 MB, demasiado grande para enviarlo inline), cae a Document AI (OCR) → texto → Gemini.
3. Si ni el multimodal ni el OCR extraen contenido → `MODEL_ERROR` (revisión).

Luego post-procesa JSON (fechas, `nombreOficioFinal` con consecutivo atómico, rename) → mueve a `OCR_DESTINATION_PATH` → `sendData` → estado `IA_OK`.

> **Document AI sigue siendo dependencia OBLIGATORIA** por ser el fallback: `DOCUMENT_AI_PROCESSOR_ID`, `GCP_PROJECT_ID` y las credenciales GCP deben permanecer configuradas.

(Antes el flujo era OCR primero → texto → Gemini; ahora es Gemini multimodal primero → fallback OCR.)

## Pipeline de estados

`INGRESADO → EN_COLA_OCR → PROCESANDO_OCR → EN_COLA_MODELO → PROCESANDO_MODELO → IA_OK`

> Con el flujo multimodal, `PROCESANDO_OCR` es ahora una etapa de **enrutamiento/staging** (mueve el archivo, no extrae OCR); la extracción real (multimodal, o fallback Document AI) ocurre en `PROCESANDO_MODELO`.

Estados terminales de error: `ERROR_OCR`, `MODEL_ERROR`, `FORMATO_NO_SOPORTADO`.
Excel: `EN_COLA_MASIVO → PROCESANDO_EXCEL → EXCEL_OK` (errores de Excel quedan como
`ERROR_OCR`, sin estado dedicado — ver `.agents/decisions.md`, entrada 2026-07-06).

> **2026-06-24:** se eliminaron del enum `DocumentState` los valores `OCR_UNREADABLE`, `DUPLICADO` y `ERROR_EXCEL` (vestigiales, sin ningún setter en el código vigente). Ver `migrations/20260624_cleanup_document_state_enum/migration.sql` y la entrada correspondiente en `.agents/decisions.md`.

## Multitenancy (`src/modules/tenant`)

`TenantModule` (`@Global()`) provee `'TENANT_PROFILE'` token. Perfiles en `src/modules/tenant/profiles/*.profile.ts`. Cada perfil define: `promptTemplate`, `responseSchema` (Gemini Schema), `clientFields`, `nonClientFields`, `identifierKey`.

Al editar un perfil, mantener en sync: `responseSchema` (lo que Gemini debe retornar), `promptTemplate` (reglas de extracción), y `clientFields`/`nonClientFields` (misma forma JSON desde distintos ángulos).

## Integración Externa (`src/modules/integration`)

`IntegrationService` (`@Global()`) cachea bearer token (refresh 1 min antes de expirar). Expone `sendData(json, source)` y `startBatch(...)`. Si la URL no está configurada, hace log y no-op (el pipeline sigue funcionando sin integración).

## Otras notas

- `FolderInitializerService` crea todas las carpetas configuradas al arranque.
- `src/main.ts` resuelve `GOOGLE_APPLICATION_CREDENTIALS` a path absoluto y sirve Swagger en `/api/docs`.
