# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚠️ Mandatory rules (read first)

This repo has its own agent rulebook with **higher priority than this file**: [`AGENTS.md`](AGENTS.md) points to [`.agents/instructions.md`](.agents/instructions.md), which contains binding rules. Key ones:

- **Never run Prisma migration commands** (`prisma migrate dev/deploy`, or anything that applies changes directly to the DB, including `migrate diff --from-url`). Schema changes flow as: save a copy of the current `schema.prisma` (e.g. `git show HEAD:schema.prisma > /tmp/schema_old.prisma`) → edit `schema.prisma` → generate a script by diffing the old file against the new one (purely file-based, no DB connection): `npx prisma migrate diff --from-schema-datamodel /tmp/schema_old.prisma --to-schema-datamodel schema.prisma --script > migration.sql` → review for `NOT NULL` columns added to tables with existing data (add temporary `DEFAULT`/`DROP DEFAULT` or note a `TRUNCATE`) → hand `migration.sql` to the user to review/apply manually → `npx prisma generate`.
- **Run `pnpm lint` after any code change** — no pending lint errors.
- **Use the `@/*` path alias** (maps to `src/*`, see `tsconfig.json`) for internal imports.
- **Excel/CSV bypass**: `.xlsx`/`.xls`/`.csv` files must skip OCR/Gemini entirely and go straight to DB.
- **Idempotency**: bulk Excel processing must clear previous records for the same file name before re-inserting (supports safe retries).
- **Memory safety for bulk files**: large Excel/CSV processing should use streaming (`exceljs` stream API) rather than loading the whole workbook into memory.

`AGENTS.md` also maintains a running architecture diagram (Mermaid) and a decision log (`🧠 Registro de Decisiones`) — check it for recent architectural decisions and add an entry there for significant changes.

## Project overview

NestJS backend that asynchronously ingests legal/judicial documents (oficios de embargo, desembargo, alcance), runs OCR/AI extraction (Google Document AI + Gemini) or, for Excel/CSV bulk files, parses them directly, and pushes the resulting structured JSON to an external REST integration endpoint. Multi-tenant via a "profile" abstraction (e.g. `davibank`, `bbva`, `default`) that controls prompts, response schemas, and report field sets.

## Commands

- Install: `pnpm install` (pnpm 10, Node 24 — see `volta` field in package.json)
- Build: `pnpm build` (`nest build`)
- Run dev (watch mode): `pnpm start:dev`
- Run prod: `pnpm start:prod` (after `pnpm build`)
- Lint: `pnpm lint` (eslint --fix on src/apps/libs/test)
- Format: `pnpm format` (prettier on src/test)
- Unit tests: `pnpm test`
- Watch unit tests: `pnpm test:watch`
- Coverage: `pnpm test:cov`
- Single test file: `pnpm test -- path/to/file.spec.ts` (or `pnpm test -- -t "test name"`)
- E2E tests: `pnpm test:e2e` (config: `test/jest-e2e.json`)
- Pipeline tests: `pnpm test:pipeline` (config: `test/jest-pipeline.json`)
- Prisma client generation: `npx prisma generate` (after editing `schema.prisma`)
- DB schema sync: there is no `prisma/migrations` folder — schema changes are applied via raw SQL or `prisma db push`, not `prisma migrate`.

Jest config (in package.json) sets `rootDir: src` and matches `*.spec.ts`.

## Environment configuration

All env vars are validated at boot via `src/common/config/env.validation.ts` (`class-validator`). `.env.example` documents the full set, grouped by concern (system, infra, paths, pipeline, AI services, queues, integration, multitenant). Required vars (validation throws if missing): `DATABASE_URL`, `REDIS_HOST`, `GEMINI_API_KEY`, `DOCUMENT_AI_PROCESSOR_ID`, `GCP_PROJECT_ID`. Most paths/feature flags have in-code defaults (e.g. `OCR_PATH` defaults to `./local/ocr`).

`extraction`, `client`, and `report` modules each use a single local strategy implementation (`LocalFileStrategy`, `LocalClientStrategy`, `LocalReportStrategy`) — there is no longer a mode switch.

`TENANT_PROFILE` (`default` | `bbva` | `davibank`) selects the active `TenantProfile` (see Multitenancy below).

## Architecture: the document pipeline

The core flow is a chain of BullMQ queues, each backed by Redis, with state persisted in Postgres via Prisma (`Document.state`, an enum in `schema.prisma`: `INGRESADO → EN_COLA_OCR → PROCESANDO_OCR → EN_COLA_MODELO → PROCESANDO_MODELO → IA_OK`, plus error/terminal states like `ERROR_OCR`, `MODEL_ERROR`, `EXCEL_OK`, `DUPLICADO`, `FORMATO_NO_SOPORTADO`, `OCR_UNREADABLE`).

1. **`ExtractionService`** (`src/modules/extraction`) — cron job (`CRON_EXTRACTION_SCHEDULE`, default every minute). Uses a Redis lock (`extraction:lock`, NX + 120s TTL) to avoid overlapping runs. Uses `LocalFileStrategy` to pull new files into `IN_PATH`, dedupes by MD5 hash against `Document.md5Hash` (duplicates moved to `DUPLICATES_PATH` and recorded as `DUPLICADO`), then creates a `Document` row (`EN_COLA_OCR`) and enqueues a job on `cola_ocr`. Also runs `onApplicationBootstrap` recovery (re-enqueues documents stuck in `EN_COLA_OCR`/`PROCESANDO_OCR`/`EN_COLA_MODELO`) and a daily cleanup cron (`EVERY_DAY_AT_MIDNIGHT`) that purges old files from `IN_PATH`/`OCR_PATH` based on `FILE_RETENTION_DAYS`.

2. **`OcrProcessor`** (`src/modules/ocr/ocr.processor.ts`, `@Processor('cola_ocr')`, concurrency 5) — branches by file extension:
   - `.xlsx`/`.xls`/`.csv` → bulk path via `MassiveExcelService` (bypasses AI entirely), then `EXCEL_OK`.
   - Other supported extensions → picks the first `TextExtractorStrategy` whose `canHandle(ext)` is true (`DocumentAiStrategy` for PDFs/images via Google Document AI, `ExcelExtractorStrategy` as fallback). Extracted text is saved (`EN_COLA_MODELO`) and the file is moved to `OCR_PATH`, then a job is enqueued on `cola_modelo` (6 attempts, exponential backoff starting at 15s — tuned for Gemini rate limits).
   - Unsupported extensions are moved to `UNSUPPORTED_PATH` and marked `FORMATO_NO_SOPORTADO`.
   - Any thrown error sets `ERROR_OCR` before rethrowing (BullMQ retry); `onFailed` sets `ERROR_OCR` permanently once retries are exhausted.

3. **`ModelProcessor`** (`src/modules/model/model.processor.ts`, `@Processor('cola_modelo')`, concurrency/rate-limit configurable via `MODEL_QUEUE_CONCURRENCY`/`MODEL_QUEUE_RPM_LIMIT`) — calls `GeminiService.extraerJudicial(text)`, which uses the active `TenantProfile`'s `promptTemplate` + `responseSchema` and a fallback chain of Gemini models (`GEMINI_FALLBACK_MODELS`). After a successful extraction it post-processes the result JSON in-place:
   - injects `oficio.rutaPdf`, `oficio.fechaHoraProcesamientoOficio`, `oficio.nombreOficioInicial` (from filename), `infoCliente.fechaHoraRecepcionCorreo`;
   - replaces a `"00000000"` placeholder in `oficio.nombreOficioFinal` with `MMDD` + a daily consecutive counter (`DocumentRepository.countProcessedToday()`).
   - Saves `jsonModel` and sets state `IA_OK`, then calls `IntegrationService.sendData(resultJson, 'IA_OK')`.
   - The "trim non-client fields" logic (based on `ClientService.isClient` + `profile.nonClientFields`) exists but is currently **commented out** — full JSON is always saved/sent.
   - On error: `MODEL_ERROR` with error details in `jsonModel`, then rethrow for BullMQ retry.

4. **`ReportService`** (`src/modules/report`) — daily cron (`CRON_REPORT_SCHEDULE`, default 23:00) generates a CSV from all `IA_OK` documents, one row per `demandado` (or one fallback row if `demandados` is empty), choosing `profile.clientFields` vs `profile.nonClientFields` per row based on `ClientService.isClient`. Output is written via `LocalReportStrategy`.

5. **`ClientService`** (`src/modules/client`) — hourly cron + `onModuleInit` refreshes an in-memory `Set<string>` of known client IDs from `LocalClientStrategy`.

## Multitenancy (`src/modules/tenant`)

`TenantModule` is `@Global()` and provides a `'TENANT_PROFILE'` token (a `TenantProfile`: `id`, `promptTemplate`, `responseSchema` (Gemini `Schema`), `clientFields`, `nonClientFields`, `identifierKey`), selected by `TENANT_PROFILE` env var. Profiles live in `src/modules/tenant/profiles/*.profile.ts`. The "final JSON" shape for a tenant (e.g. davibank) is nested: `oficio`, `demandados[]`, `demandantes[]`, `ente`, `infoCliente` — `clientFields`/`nonClientFields` are dot/array paths into this structure (e.g. `demandados[0].numeroId`), used by `ReportService.resolvePath` and `ClientService`.

When adding/editing a tenant profile, keep `responseSchema` (what Gemini must output), `promptTemplate` (extraction rules — these are very detailed and tenant-specific, e.g. davibank's rules around `tipoOficio` classification, default-value conventions `"0"`/`0`/`[]` for missing fields, `nombreOficioFinal` construction), and `clientFields`/`nonClientFields` in sync — they describe the same JSON shape from different angles.

## Bulk Excel/CSV pipeline (`src/modules/ocr/services/massive-excel.service.ts`)

This bypasses OCR/AI entirely. `MassiveExcelService.process()`:

1. Reads the workbook with the `xlsx` library and detects the document type (`EMBARGO`/`DESEMBARGO`/`ALCANCE`) from the first sheet's name (fallback: filename substring match), via `SUPPORTED_TIPOS_OFICIO` in `excel-field-mapping.ts`.
2. Skips an optional title row (`"PLANTILLA DE DILIGENCIAMIENTO ..."`), reads the header row, and maps each data row to the **same nested JSON shape** used by the AI flow (`oficio`/`demandados[0]`/`demandantes[0]`/`ente`/`infoCliente`) via `mapRowToPayload()` + `EXCEL_FIELD_MAP` (header name → JSON path + type). Missing fields get davibank-style defaults (`"0"`, `0`, `[]`) from `buildDefaultPayload()`.
3. Persists every row to `ExcelRecord` (`excelName`, `tipoOficio`, `numeroFila`, `payload: Json`).
4. Calls `IntegrationService.startBatch(fileName, cantidadLotes, totalRegistros, tipoOficio)` to obtain a `loteId` from the external receiver (`INTEGRATION_BATCH_START_URL`; if unset, falls back to `'LOCAL'` and skips remote dispatch failure). `cantidadLotes` is `Math.ceil(totalRegistros / INTEGRATION_LOTE_SIZE)` (default lote size 100). `tipoOficio` is sent as `"${tipoOficioDetectado} MASIVO"` (e.g. `"EMBARGO MASIVO"`).
5. Sends each row (`{ loteId, numeroFila, tipoOficio, ...payload }`) to `IntegrationService.sendData(...)` with bounded concurrency (`INTEGRATION_BATCH_CONCURRENCY`, default 5) and up to 3 retries with linear backoff per row.
6. Returns a `BatchResult` (`{ loteId, enviados, fallidos, filasFallidas }`), which `OcrProcessor` writes into `Document.ocrText` for the `EXCEL_OK` state.

`campos_por_tipo_documento_3.json` at the repo root is the source-of-truth field catalog (per tipo de oficio) that `EXCEL_FIELD_MAP` implements — keep them in sync if columns change. The three template files (`Plantilla_EMBARGO.xlsx`, `Plantilla_DESEMBARGO.xlsx`, `Plantilla_ALCANCE.xlsx`) are the canonical column layouts for each type.

## External integration (`src/modules/integration`)

`IntegrationModule` is `@Global()`. `IntegrationService` caches a bearer token (fetched from `INTEGRATION_AUTH_URL` with `INTEGRATION_AUTH_PAYLOAD`, refreshed 1 min before expiry) and exposes `sendData(json, source)` (POST to `INTEGRATION_DATA_URL`) and `startBatch(nombreArchivo, cantidadLotes, totalRegistros, tipoOficio)` (POST to `INTEGRATION_BATCH_START_URL`, returns `loteId`). Both `ModelProcessor` (source `'IA_OK'`) and `MassiveExcelService` (source `'EXCEL_ROW'`) use `sendData`. If the relevant URL env var is unset, the service logs and no-ops/returns a safe default rather than throwing — the pipeline must keep working without the external integration configured.

## Persistence (Prisma, `schema.prisma` at repo root)

- `Document` — one row per ingested file; `state` (enum), `ocrText` (Text), `jsonModel` (Json, the final extracted/mapped payload), `md5Hash` for dedup, related `DocumentStateLog[]` (audit trail of state transitions, written automatically by `DocumentRepository.create`/`updateState`).
- `ExcelRecord` — one row per spreadsheet data row (`excelName`, `tipoOficio`, `numeroFila`, `payload: Json`).
- `PrismaService`/`PrismaModule` (`src/common/prisma`) wrap `PrismaClient` for DI.

## Other notes

- `FolderInitializerService` (`src/common/services`, runs on bootstrap) ensures all configured local folders (`IN_PATH`, `OCR_PATH`, `EXCEL_DESTINATION_PATH`, `OCR_DESTINATION_PATH`, local source paths, clients/reports paths, `./secrets`) exist.
- Strategy pattern is still used for local I/O: `extraction/strategies`, `client/strategies`, `report/strategies`, each implementing a small interface (`extractFiles`, `fetchClients`, `saveReport`, etc.) with a single `Local*Strategy` implementation.
- `src/main.ts` resolves `GOOGLE_APPLICATION_CREDENTIALS` to an absolute path (Windows/WSL credential path quirk) and serves Swagger docs at `/api/docs`.
