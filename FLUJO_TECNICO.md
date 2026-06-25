# Flujo Técnico Completo del Pipeline de Procesamiento

> Documento de referencia para desarrolladores. Indica qué archivo `.ts` y qué método ejecuta cada etapa del ciclo de vida de un documento judicial.

---

## Resumen de Estados (Máquina de Estados)

```
INGRESADO → EN_COLA_OCR → PROCESANDO_OCR → EN_COLA_MODELO → PROCESANDO_MODELO → IA_OK
                ↓                    ↓                        ↓
     FORMATO_NO_SOPORTADO        ERROR_OCR                MODEL_ERROR
```

| Estado | Significado |
| :--- | :--- |
| `INGRESADO` | Documento creado en BD, aún no en cola |
| `EN_COLA_OCR` | Esperando ser enrutado por `OcrProcessor` (router) |
| `PROCESANDO_OCR` | Enrutamiento/staging del archivo (ya **no** extrae OCR; ver nota) |
| `EN_COLA_MODELO` | Esperando ser procesado por Gemini |
| `PROCESANDO_MODELO` | Gemini analizando y extrayendo JSON (multimodal; OCR solo fallback) |
| `IA_OK` | JSON generado exitosamente |
| `ERROR_OCR` | Error en la etapa de enrutamiento/extracción (archivo ausente, error permanente, reintentos agotados) |
| `FORMATO_NO_SOPORTADO` | Extensión no admitida, o archivo demasiado pesado para cualquier vía de extracción (`FILE_MAX_SIZE_MB`) |
| `MODEL_ERROR` | Fallo en extracción de Gemini (incluye documentos ilegibles, antes cubiertos por `OCR_UNREADABLE`) |

> `OCR_UNREADABLE`, `DUPLICADO` y `ERROR_EXCEL` fueron eliminados del enum `DocumentState` (2026-06-24): quedaron vestigiales tras el flujo multimodal y no se asignaban en ningún punto del código. Ver `migrations/20260624_cleanup_document_state_enum/migration.sql`.

> **Flujo invertido (multimodal primero):** desde la migración, el modelo de IA es el camino **principal**. Para PDF/imágenes, `OcrProcessor` ya no llama a Document AI: solo enruta y mueve el archivo (de ahí que `PROCESANDO_OCR` sea ahora un paso de staging). La extracción real ocurre en `PROCESANDO_MODELO`, enviando el **PDF directo a Gemini (multimodal)**; Document AI (OCR) solo se usa como **fallback** si el multimodal falla o el archivo supera `GEMINI_INLINE_MAX_MB`.

---

## Etapa 1: Ingreso del Documento (Origen)

**Archivo:** `src/modules/extraction/strategies/local-file.strategy.ts`

| Método | Línea | Qué hace |
| :--- | :--- | :--- |
| `extractFiles(destinationFolder)` | 28 | Escanea recursivamente las rutas configuradas en `LOCAL_SOURCE_PATHS` |
| `readDirectoryRecursive()` | 54 | Lee carpetas recursivamente, filtra por extensión permitida |

**Flujo:**
1. Copia el archivo desde la carpeta origen (ej: `C:\pruebas\`) hacia `./local/in/`
2. Usa el **nombre original** del archivo (sin timestamp)
3. Verifica en BD (`findByFileName`) para no copiar duplicados

---

## Etapa 2: Orquestación y Deduplicación (ExtractionService)

**Archivo:** `src/modules/extraction/extraction.service.ts`

Este es el **cerebro del ingreso**. Un cron se ejecuta cada 15 segundos.

| Método | Línea | Qué hace |
| :--- | :--- | :--- |
| `handleCron()` | 107 | **Cron principal** (cada 15s). Adquiere lock Redis, ejecuta estrategia, procesa archivos |
| `processFile(filePath, fileName)` | 153 | Verifica tamaño, crea registro en BD, encola a OCR |
| `recoverPendingDocuments()` | 54 | Al arrancar la app, re-encola documentos que quedaron en `EN_COLA_OCR` o `EN_COLA_MODELO` tras un crash |

### Flujo detallado de `processFile()`:

```
1. Verifica tamaño del archivo:
   ├─ Si > FILE_MAX_SIZE_MB → NO SOPORTADO
   │   └─ Mueve a UNSUPPORTED_PATH
   │   └─ Crea registro en BD con Estado: DocumentState.FORMATO_NO_SOPORTADO
   └─ Si está dentro del límite → continúa
2. Crea registro en BD: documentRepository.create()
   └─ Estado: DocumentState.EN_COLA_OCR
3. Encola en BullMQ: cola_ocr.add('process-ocr', ...)
```

> La deduplicación de archivos ocurre antes de esta etapa, en `LocalFileStrategy` (Etapa 1): el archivo se **mueve** (no se copia) desde la carpeta origen, por lo que no puede volver a recogerse en un siguiente tick del cron.

**Base de datos consultada:** `documents` (tabla principal)
**Campo de deduplicación:** `md5Hash` (hash MD5 del archivo)

---

## Etapa 3: Procesamiento OCR (OcrProcessor)

**Archivo:** `src/modules/ocr/ocr.processor.ts`

**BullMQ Queue:** `cola_ocr` (concurrency: 5)

| Método | Línea | Qué hace |
| :--- | :--- | :--- |
| `process(job)` | 40 | Procesa el job de la cola OCR. Decide si es Excel o PDF/Imagen |

### Rama A: Archivos Excel/CSV Masivos

**Archivo:** `src/modules/ocr/services/massive-excel.service.ts`

| Método | Línea | Qué hace |
| :--- | :--- | :--- |
| `process(filePath, fileName)` | 17 | Parsea Excel/CSV con streams e inserta filas en tabla `excel_records` |

**Flujo:**
1. Estado: `PROCESANDO_EXCEL`
2. Usa `exceljs` para leer por streams (no carga todo en memoria)
3. Inserta cada fila en tabla `excel_records`
4. Estado: `EXCEL_OK`
5. Dispara `IntegrationService.sendData(..., 'EXCEL_OK')`

### Rama B: PDF / Imagen / Otros (ya NO hace OCR aquí)

**Archivo:** `src/modules/ocr/ocr.processor.ts`

| Método | Línea | Qué hace |
| :--- | :--- | :--- |
| `process(job)` | ~60 | Para PDF/imagen: **no** llama a Document AI; solo mueve el archivo y lo encola al model stage |

**Flujo:**
1. Estado: `PROCESANDO_OCR` (staging, no hay OCR)
2. Mueve archivo de `./local/in/` → `./local/ocr/`
3. Estado: `EN_COLA_MODELO`
4. Encola en BullMQ: `cola_modelo.add('process-model', { documentId, filePath })` **sin texto** (el PDF se enviará directo a Gemini)
5. Si la extensión no se admite → `FORMATO_NO_SOPORTADO` (se mueve a `./local/unsupported`)

> Document AI (`document-ai.strategy.ts` → `extractText()`) ya **no** se usa aquí; quedó como **fallback** dentro del model stage (Etapa 4).

---

## Etapa 4: Procesamiento de Modelo IA (ModelProcessor)

**Archivo:** `src/modules/model/model.processor.ts`

**BullMQ Queue:** `cola_modelo` (concurrency: 2, rate limit: 15 RPM)

| Método | Línea | Qué hace |
| :--- | :--- | :--- |
| `process(job)` | ~140 | Extrae el JSON estructurado. **Multimodal primero (PDF directo); OCR fallback** |
| `extraerMultimodalConFallback(filePath)` | ~87 | Decide el modo de extracción (ver flujo) |

### Flujo detallado:

```
1. Estado: PROCESANDO_MODELO
2. Valida GEMINI_API_KEY
3. extraerMultimodalConFallback(filePath):
   ├─ 1) PRINCIPAL — PDF/imagen DIRECTO a Gemini (multimodal):
   │      geminiService.extraerJudicial('', fileBuffer, mimeType)
   │      • acepta PDF nativo, SIN tope de 30 páginas
   │      • solo si el archivo ≤ GEMINI_INLINE_MAX_MB (default 15 MB)
   │
   └─ 2) FALLBACK — si el multimodal falla o el archivo es muy grande:
          docAiStrategy.extractText(filePath) -> texto -> extraerJudicial(text)
          (si ni multimodal ni OCR extraen contenido -> MODEL_ERROR)
   └─ Inyecta prompt del TenantProfile (davibank) + responseSchema (Structured Outputs)
   └─ Fallback chain de modelos: GEMINI_FALLBACK_MODELS
4. Inyecta campos adicionales:
   ├─ oficio.rutaPdf = ruta destino del archivo procesado
   ├─ oficio.fechaHoraProcesamientoOficio = hora Bogotá ISO
   └─ infoCliente.fechaHoraRecepcionCorreo = hora Bogotá ISO
5. Mueve archivo de ./local/ocr/ → OCR_DESTINATION_PATH (renombrado con nombreOficioFinal)
6. Estado: IA_OK
7. Guarda jsonModel en BD
8. Dispara IntegrationService.sendData(resultJson, 'IA_OK')
```

**Archivo del servicio Gemini:** `src/common/services/gemini.service.ts`

| Método | Línea | Qué hace |
| :--- | :--- | :--- |
| `extraerJudicial(text, fileBuffer?, mimeType?)` | ~44 | Llama a Gemini con prompt y schema del tenant. Si recibe `fileBuffer`+`mimeType`, envía el archivo **inline (multimodal)**; si no, procesa solo texto. Devuelve JSON puro |

**Archivo del perfil tenant (schema + prompt):** `src/modules/tenant/profiles/davibank.profile.ts`

Contiene:
- `responseSchema`: Schema anidado con `oficio`, `demandados[]`, `demandantes[]`, `ente`, `infoCliente`
- `promptTemplate`: Instrucciones para Gemini con reglas de extracción
- `clientFields` / `nonClientFields`: Definición de campos para CSV

---

## Etapa 5: Dispatch a API Externa (IntegrationService)

**Archivo:** `src/modules/integration/integration.service.ts`

| Método | Línea | Qué hace |
| :--- | :--- | :--- |
| `sendData(finalJson, source)` | 93 | Autentica con Bearer token y POSTea JSON al endpoint externo |
| `getToken()` | 16 | Obtiene token JWT de `INTEGRATION_AUTH_URL`, lo cachea con expiración |

**Llamado desde:**
- `model.processor.ts` línea ~126 (para `IA_OK`)
- `ocr.processor.ts` línea ~99 (para `EXCEL_OK`)

**Payload enviado:**
```json
{
  "source": "IA_OK",
  "timestamp": "2026-05-15T21:51:14.441Z",
  "data": { ...json generado por Gemini... }
}
```

---

## Etapa 6: Generación de Reportes CSV (ReportService)

**Archivo:** `src/modules/report/report.service.ts`

**Cron:** Todos los días a las 23:00 (`0 23 * * *`)

| Método | Línea | Qué hace |
| :--- | :--- | :--- |
| `handleReport()` | 33 | Consulta documentos `IA_OK`, genera CSV |
| `generateDynamicFields(doc, json, fieldsArray)` | 87 | Convierte JSON anidado a fila CSV usando dot notation |
| `resolvePath(obj, path)` | 105 | Resuelve rutas tipo `demandados[0].numeroId` en el JSON |

**Flujo:**
1. Consulta todos los documentos con estado `IA_OK`
2. Para cada documento:
   - Obtiene `demandados[]` del JSON
   - Genera **una fila CSV por cada demandado** (expansión de array)
   - Usa `clientFields` para ordenar columnas
3. Guarda CSV vía `src/modules/report/strategies/local-report.strategy.ts`

---

## Tabla de Archivos por Etapa

| Etapa | Archivo Principal | Método Clave |
| :--- | :--- | :--- |
| **Bootstrap** | `src/main.ts` | `bootstrap()` |
| **Módulos** | `src/app.module.ts` | `AppModule` imports |
| **Ingesta Local** | `src/modules/extraction/strategies/local-file.strategy.ts` | `extractFiles()` |
| **Orquestación** | `src/modules/extraction/extraction.service.ts` | `handleCron()` → `processFile()` |
| **Hash MD5** | `src/modules/extraction/extraction.service.ts` | `calculateFileHash()` |
| **Creación Documento** | `src/modules/documents/repositories/document.repository.ts` | `create()` |
| **Verificación Hash** | `src/modules/documents/repositories/document.repository.ts` | `findByHash()` |
| **Router / Staging** | `src/modules/ocr/ocr.processor.ts` | `process()` (enruta Excel/PDF; ya no hace OCR) |
| **Document AI (fallback OCR)** | `src/modules/ocr/strategies/document-ai.strategy.ts` | `extractText()` |
| **Excel Masivo** | `src/modules/ocr/services/massive-excel.service.ts` | `process()` |
| **Model Worker (multimodal)** | `src/modules/model/model.processor.ts` | `process()` → `extraerMultimodalConFallback()` |
| **Gemini API** | `src/common/services/gemini.service.ts` | `extraerJudicial()` |
| **Schema/Prompt** | `src/modules/tenant/profiles/davibank.profile.ts` | `DavibankProfile` |
| **Integración REST** | `src/modules/integration/integration.service.ts` | `sendData()` |
| **Reporte CSV** | `src/modules/report/report.service.ts` | `handleReport()` |
| **Persistencia** | `src/modules/documents/repositories/document.repository.ts` | `updateState()` |
| **Base de Datos** | `src/common/prisma/prisma.service.ts` | `PrismaService` (cliente) |

---

## Base de Datos (Tablas involucradas)

| Tabla | Para qué sirve |
| :--- | :--- |
| `documents` | Registro maestro de cada archivo. Campos: `id`, `fileName`, `md5Hash`, `state`, `ocrText`, `jsonModel`, `createdAt` |
| `document_state_logs` | Historial de transiciones de estado. Cada cambio genera un log |
| `excel_records` | Filas insertadas desde archivos Excel/CSV masivos (bypass de IA) |

---

## Colas BullMQ (Redis)

| Cola | Worker | Concurrencia | Qué procesa |
| :--- | :--- | :--- | :--- |
| `cola_ocr` | `OcrProcessor` | 5 | Enrutamiento (Excel / no-soportado) y staging de PDFs (ya **no** extrae OCR) |
| `cola_modelo` | `ModelProcessor` | 2 (limitado a 15 RPM) | Extracción estructurada con Gemini (**multimodal**; Document AI como fallback) |

---

## Carpetas del Sistema (File System)

| Carpeta | Contenido | Quién la usa |
| :--- | :--- | :--- |
| `./local/in/` | Archivos recién ingresados, esperando enrutamiento | ExtractionService |
| `./local/ocr/` | Archivos PDF/imagen en staging, esperando el model stage (se envían directo a Gemini) | OcrProcessor |
| `./local/done/` | Archivos completamente procesados (IA_OK) | ModelProcessor |
| `./local/duplicates/` | Archivos duplicados (mismo MD5) | ExtractionService |
| `./local/unsupported/` | Archivos con extensión no soportada | OcrProcessor |
| `./local/reports/` | CSVs generados diariamente | ReportService (modo LOCAL) |

---

*Documento generado automáticamente. Refleja el estado actual del código en `main`.*
