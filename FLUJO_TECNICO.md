# Flujo Técnico Completo del Pipeline de Procesamiento

> Documento de referencia para desarrolladores. Indica qué archivo `.ts` y qué método ejecuta cada etapa del ciclo de vida de un documento judicial.

---

## Resumen de Estados (Máquina de Estados)

```
INGRESADO → EN_COLA_OCR → PROCESANDO_OCR → EN_COLA_MODELO → PROCESANDO_MODELO → IA_OK
                ↓                    ↓                        ↓
          DUPLICADO          ERROR_OCR / OCR_UNREADABLE   MODEL_ERROR
```

| Estado | Significado |
| :--- | :--- |
| `INGRESADO` | Documento creado en BD, aún no en cola |
| `EN_COLA_OCR` | Esperando ser procesado por OCR Worker |
| `PROCESANDO_OCR` | Document AI extrayendo texto |
| `EN_COLA_MODELO` | Esperando ser procesado por Gemini |
| `PROCESANDO_MODELO` | Gemini analizando y extrayendo JSON |
| `IA_OK` | JSON generado exitosamente |
| `DUPLICADO` | Hash MD5 ya existía, archivo descartado |
| `ERROR_OCR` / `OCR_UNREADABLE` | Fallo en extracción de texto |
| `MODEL_ERROR` | Fallo en extracción de Gemini |

---

## Etapa 1: Ingreso del Documento (Origen)

El documento puede llegar por 3 vías. Cada una tiene su propia **estrategia de extracción**.

### 1.1 Modo LOCAL

**Archivo:** `src/modules/extraction/strategies/local-file.strategy.ts`

| Método | Línea | Qué hace |
| :--- | :--- | :--- |
| `extractFiles(destinationFolder)` | 28 | Escanea recursivamente las rutas configuradas en `LOCAL_SOURCE_PATHS` |
| `readDirectoryRecursive()` | 54 | Lee carpetas recursivamente, filtra por extensión permitida |

**Flujo:**
1. Copia el archivo desde la carpeta origen (ej: `C:\pruebas\`) hacia `./local/in/`
2. Usa el **nombre original** del archivo (sin timestamp)
3. Verifica en BD (`findByFileName`) para no copiar duplicados

### 1.2 Modo FTP

**Archivo:** `src/modules/extraction/strategies/ftp-file.strategy.ts`

| Método | Línea | Qué hace |
| :--- | :--- | :--- |
| `extractFiles(destinationFolder)` | 17 | Conecta al FTP y descarga archivos recursivamente |
| `readFtpDirectoryRecursive()` | 67 | Navega directorios FTP y descarga archivos válidos |

**Flujo:**
1. Conecta al servidor FTP con `basic-ftp`
2. Descarga archivos desde `/source` hacia `./local/in/`
3. Conserva el **nombre original** del archivo remoto

### 1.3 Modo GMAIL

**Archivo:** `src/modules/extraction/strategies/gmail-file.strategy.ts`

| Método | Línea | Qué hace |
| :--- | :--- | :--- |
| `extractFiles(destinationFolder)` | 17 | Conecta por IMAP a Gmail, busca emails con adjuntos |

**Flujo:**
1. Busca emails no leídos con asunto `GMAIL_SEARCH_SUBJECT`
2. Descarga adjuntos PDF a `./local/in/`

---

## Etapa 2: Orquestación y Deduplicación (ExtractionService)

**Archivo:** `src/modules/extraction/extraction.service.ts`

Este es el **cerebro del ingreso**. Un cron se ejecuta cada 15 segundos.

| Método | Línea | Qué hace |
| :--- | :--- | :--- |
| `handleCron()` | 107 | **Cron principal** (cada 15s). Adquiere lock Redis, ejecuta estrategia, procesa archivos |
| `processFile(filePath, fileName)` | 168 | Calcula MD5, verifica duplicados, crea registro en BD, encola a OCR |
| `calculateFileHash(filePath)` | 300 | Genera hash MD5 con stream para evitar cargar todo el archivo en memoria |
| `recoverPendingDocuments()` | 54 | Al arrancar la app, re-encola documentos que quedaron en `EN_COLA_OCR` o `EN_COLA_MODELO` tras un crash |

### Flujo detallado de `processFile()`:

```
1. Verifica tamaño del archivo (descarta si > FILE_MAX_SIZE_MB)
2. Calcula MD5 del archivo (calculateFileHash)
3. Consulta BD: documentRepository.findByHash(hex)
   ├─ Si EXISTE → DUPLICADO
   │   └─ Mueve a ./local/duplicates/
   │   └─ Estado: DocumentState.DUPLICADO
   └─ Si NO EXISTE → NUEVO
       └─ Crea registro en BD: documentRepository.create()
       └─ Estado: DocumentState.EN_COLA_OCR
       └─ Encola en BullMQ: cola_ocr.add('process-ocr', ...)
```

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

### Rama B: PDF / Imagen / Otros

**Archivo:** `src/modules/ocr/strategies/document-ai.strategy.ts`

| Método | Línea | Qué hace |
| :--- | :--- | :--- |
| `extractText(filePath)` | ~25 | Llama a Google Document AI para extraer texto plano del PDF |

**Flujo:**
1. Estado: `PROCESANDO_OCR`
2. `DocumentAiStrategy` envía el archivo a Google Cloud Document AI
3. Recibe texto puro (`ocrText`)
4. Mueve archivo de `./local/in/` → `./local/ocr/`
5. Guarda `ocrText` en BD
6. Estado: `EN_COLA_MODELO`
7. Encola en BullMQ: `cola_modelo.add('process-model', { documentId, filePath, text })`

---

## Etapa 4: Procesamiento de Modelo IA (ModelProcessor)

**Archivo:** `src/modules/model/model.processor.ts`

**BullMQ Queue:** `cola_modelo` (concurrency: 2, rate limit: 15 RPM)

| Método | Línea | Qué hace |
| :--- | :--- | :--- |
| `process(job)` | 42 | Recibe el texto OCR, llama a Gemini, genera JSON estructurado |

### Flujo detallado:

```
1. Estado: PROCESANDO_MODELO
2. Valida GEMINI_API_KEY
3. Llama: geminiService.extraerJudicial(text)
   └─ Inyecta prompt del TenantProfile (davibank)
   └─ Usa responseSchema para Structured Outputs
   └─ Fallback chain: gemini-2.5-flash → 2.5-pro → 1.5-flash
4. Inyecta campos adicionales:
   ├─ ruta_archivo = filePath (ruta original de lectura)
   ├─ oficio.fechaHoraProcesamientoOficio = new Date().toISOString()
   └─ infoCliente.fechaHoraRecepcionCorreo = createdAt.toISOString()
5. Mueve archivo de ./local/ocr/ → ./local/done/
6. Estado: IA_OK
7. Guarda jsonModel en BD
8. Dispara IntegrationService.sendData(resultJson, 'IA_OK')
```

**Archivo del servicio Gemini:** `src/common/services/gemini.service.ts`

| Método | Línea | Qué hace |
| :--- | :--- | :--- |
| `extraerJudicial(text)` | 44 | Llama a Gemini API con prompt y schema del tenant. Devuelve JSON puro |

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
3. Guarda CSV según estrategia:
   - Local → `src/modules/report/strategies/local-report.strategy.ts`
   - FTP → `src/modules/report/strategies/ftp-report.strategy.ts`
   - Gmail → `src/modules/report/strategies/gmail-report.strategy.ts`

---

## Tabla de Archivos por Etapa

| Etapa | Archivo Principal | Método Clave |
| :--- | :--- | :--- |
| **Bootstrap** | `src/main.ts` | `bootstrap()` |
| **Módulos** | `src/app.module.ts` | `AppModule` imports |
| **Ingesta Local** | `src/modules/extraction/strategies/local-file.strategy.ts` | `extractFiles()` |
| **Ingesta FTP** | `src/modules/extraction/strategies/ftp-file.strategy.ts` | `extractFiles()` |
| **Ingesta Gmail** | `src/modules/extraction/strategies/gmail-file.strategy.ts` | `extractFiles()` |
| **Orquestación** | `src/modules/extraction/extraction.service.ts` | `handleCron()` → `processFile()` |
| **Hash MD5** | `src/modules/extraction/extraction.service.ts` | `calculateFileHash()` |
| **Creación Documento** | `src/modules/documents/repositories/document.repository.ts` | `create()` |
| **Verificación Hash** | `src/modules/documents/repositories/document.repository.ts` | `findByHash()` |
| **OCR Worker** | `src/modules/ocr/ocr.processor.ts` | `process()` |
| **Document AI** | `src/modules/ocr/strategies/document-ai.strategy.ts` | `extractText()` |
| **Excel Masivo** | `src/modules/ocr/services/massive-excel.service.ts` | `process()` |
| **Model Worker** | `src/modules/model/model.processor.ts` | `process()` |
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
| `cola_ocr` | `OcrProcessor` | 5 | Extracción de texto con Document AI |
| `cola_modelo` | `ModelProcessor` | 2 (limitado a 15 RPM) | Extracción estructurada con Gemini |

---

## Carpetas del Sistema (File System)

| Carpeta | Contenido | Quién la usa |
| :--- | :--- | :--- |
| `./local/in/` | Archivos recién ingresados, esperando OCR | ExtractionService |
| `./local/ocr/` | Archivos con texto OCR ya extraído, esperando modelo | OcrProcessor |
| `./local/done/` | Archivos completamente procesados (IA_OK) | ModelProcessor |
| `./local/duplicates/` | Archivos duplicados (mismo MD5) | ExtractionService |
| `./local/unsupported/` | Archivos con extensión no soportada | OcrProcessor |
| `./local/reports/` | CSVs generados diariamente | ReportService (modo LOCAL) |

---

*Documento generado automáticamente. Refleja el estado actual del código en `main`.*
