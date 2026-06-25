# 🤖 AGENTS.md — Punto de entrada para agentes de IA

Este documento es el punto de partida para cualquier agente de IA o desarrollador que trabaje en este repositorio. Da el contexto general y **enruta** a documentos específicos según el tema en el que vayas a trabajar.

---

## 🧭 Mapa de documentación (general → específico)

| Si vas a trabajar en... | Lee |
|---|---|
| Cambios de esquema / base de datos / migraciones SQL / Prisma | [`.agents/instructions.md`](.agents/instructions.md) |
| Pipeline, colas BullMQ, flujos OCR/IA/Excel, multitenant, integración externa | [`.agents/architecture.md`](.agents/architecture.md) |
| Historial de decisiones técnicas y estado de tareas pendientes | [`.agents/decisions.md`](.agents/decisions.md) |
| Convenciones de código de Excel/CSV masivo (mapeo de campos) | [`campos_por_tipo_documento_3.json`](campos_por_tipo_documento_3.json) y `src/modules/ocr/services/excel-field-mapping.ts` |

Si tu tarea toca varios temas, lee todos los documentos relevantes antes de empezar. Si haces un cambio arquitectónico significativo, agrega una entrada en [`.agents/decisions.md`](.agents/decisions.md).

---

## ⚠️ Reglas mandatorias (aplican siempre)

- **Linting**: ejecutar `pnpm lint` después de cualquier modificación de código. No dejar errores de lint pendientes.
- **Path Aliases**: usar siempre `@/*` para imports internos (mapeado a `src/*` en `tsconfig.json`).
- **Memory Safety**: para archivos masivos (Excel/CSV), usar el lector **no-streaming** de exceljs (`new ExcelJS.Workbook(); await workbook.xlsx.readFile(filePath)`). **No usar** `stream.xlsx.WorkbookReader` — tiene un bug conocido donde las celdas de texto llegan como `{sharedString: N}` sin resolver cuando `sharedStrings.xml` aparece después de las hojas dentro del zip. Las plantillas son pequeñas (cientos de filas), cargarlas completas en memoria es seguro. Ver `.agents/decisions.md` para detalle.
- **Excel/CSV Bypass**: `.xlsx`/`.xls`/`.csv` deben ir directo a DB, omitiendo OCR/Gemini.
- **Idempotency**: procesamiento masivo debe limpiar registros previos del mismo archivo antes de re-insertar.
- **🚫 Nunca ejecutar comandos Prisma que apliquen cambios a la DB** (`migrate dev/deploy`, `db push`). Ver [`.agents/instructions.md`](.agents/instructions.md) para el flujo correcto.

---

## 📋 Contexto del Proyecto

**Nombre:** JT-REPO
**Stack:** NestJS, Prisma (PostgreSQL), Redis (BullMQ), Google Gemini (multimodal), Google Document AI (fallback OCR).
**Objetivo:** Automatizar el procesamiento de documentos judiciales mediante IA generativa multimodal (Gemini, PDF directo) para extraer datos estructurados, con Document AI (OCR) como respaldo y soporte multitenant.

**Flujo de extracción (individual):** Gemini multimodal es el camino **principal** (PDF directo, sin tope de 30 páginas); Document AI (OCR) quedó **solo como fallback** cuando el multimodal falla o el archivo supera `GEMINI_INLINE_MAX_MB`. Document AI sigue siendo dependencia obligatoria por ser ese fallback. Detalle en [`.agents/architecture.md`](.agents/architecture.md).

## 📦 Comandos

| Comando | Descripción |
|---------|-------------|
| `pnpm install` | Instalar dependencias (pnpm 10, Node 24) |
| `pnpm build` | Build (`nest build`) |
| `pnpm start:dev` | Dev mode (watch) |
| `pnpm start:prod` | Producción (requiere `pnpm build`) |
| `pnpm lint` | ESLint --fix |
| `pnpm format` | Prettier |
| `pnpm test` | Unit tests |
| `pnpm test -- path/to/file.spec.ts` | Test individual |
| `pnpm test:e2e` | E2E tests |
| `npx prisma generate` | Regenerar cliente Prisma |

Jest config (en `package.json`): `rootDir: src`, matches `*.spec.ts`.

## ⚙️ Environment

Vars validadas al arranque via `src/common/config/env.validation.ts` (`class-validator`). `.env.example` documenta el set completo. Vars requeridas: `DATABASE_URL`, `REDIS_HOST`, `GEMINI_API_KEY`, `DOCUMENT_AI_PROCESSOR_ID`, `GCP_PROJECT_ID`.

`TENANT_PROFILE` (`default` | `bbva` | `davibank`) selecciona el `TenantProfile` activo.

## 📂 Estructura

```
src/
  modules/         # Lógica de negocio
    extraction/    # Cron de extracción de archivos
    ocr/           # OcrProcessor + MassiveExcelService
    model/         # ModelProcessor (Gemini)
    integration/   # REST API externa
    tenant/        # Perfiles multitenant
    documents/     # Repositorio Document
    report/        # Generación CSV diaria
    client/        # Lista de clientes
  common/
    prisma/        # PrismaModule (Global)
    services/      # DailySequenceService, FolderInitializer, GeminiService
    config/        # Validación de env
migrations/        # SQL numerados (001_xxx.sql, 002_xxx.sql, ...)
.agents/           # Documentación específica por tema (ver mapa arriba)
schema.prisma      # Modelo de datos (snake_case en SQL via @map)
```

## 🛠 Convenciones generales

- `snake_case` para DB, `camelCase` para código TS (vía `@map` en Prisma).
- Structured Outputs nativos de Gemini (MIME application/json).
- Backoff exponencial y fallback multi-modelo para resiliencia.
