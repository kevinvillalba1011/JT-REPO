# Sistema de Procesamiento de Documentos Asíncrono

Pipeline de procesamiento de documentos judiciales con NestJS, BullMQ (Redis), Prisma ORM (PostgreSQL), Google Gemini (multimodal — extracción principal) y Google Document AI (OCR de respaldo). Multi-Tenant.

---

## 🆕 Novedades recientes

- **2026-07-21 · Subcarpeta de destino simplificada a solo fecha:** la subcarpeta anticolisión de PDFs destino pasó de `yyyyMMddHHmmss` a `yyyyMMdd` (hora Bogotá, sin hora/min/seg). El sufijo anticolisión de `resolverRutaSinColision` pasó de `_N` a `-N` (ej. `nombre_archivo-1.pdf`). Ver `src/common/utils/file-destination.util.ts`.
- **2026-07-17 · Carpetas de ingesta renombradas y unificadas:** `SERVER_PATH_1..4` → `SERVER_PATH_EMBARGOS`, `SERVER_PATH_DESEMBARGOS`, `SERVER_PATH_ALCANCES`, `SERVER_PATH_MASIVOS`. `LOCAL_SOURCE_PATHS` ahora usa **el mismo valor** en local, Docker local y Docker producción (`./local/EMBARGOS,./local/DESEMBARGOS,./local/ALCANCES,./local/MASIVOS`) — ya no apunta a rutas internas tipo `/app/source/1`. Ver [sección de arquitectura de archivos](#-arquitectura-de-archivos-modo-local).
- **2026-07-17 · Subcarpeta de destino ahora granular a segundos:** la subcarpeta anticolisión de PDFs destino pasó de `ddMMyyyyHH` a `yyyyMMddHHmmss` (hora Bogotá, año primero para ordenar cronológicamente), para reducir aún más cuántos oficios terminan compartiendo carpeta y por lo tanto cuántos reciben sufijo `_N`. Ver `src/common/utils/file-destination.util.ts`.
- **2026-07-16 · Anti-colisión de PDFs destino:** los PDFs procesados (flujo individual y masivo) ahora se guardan en una subcarpeta con fecha y hora (hora Bogotá) dentro de `OCR_DESTINATION_PATH` / `EXCEL_DESTINATION_PATH`, con sufijo `_1`, `_2`... si dos oficios generan el mismo nombre final en esa subcarpeta. Antes un `nombreOficioFinal` repetido sobrescribía el PDF anterior. Ver `src/common/utils/file-destination.util.ts`.
- **2026-07-16 · `valorEmbargo` como texto literal:** Gemini ahora transcribe el monto tal cual aparece en el documento (string, sin limpiar), y la conversión a entero COP se centraliza en `parseValorEmbargo` (`src/common/utils/valor-embargo.util.ts`), usada tanto por el flujo IA como por el flujo Excel masivo. Antes cada flujo lo parseaba distinto y montos como `"16.000.000.00"` se interpretaban mal.
- **2026-07-16 · `radicadoADesembargar` por demandado:** para oficios tipo DESEMBARGO, este campo ahora se extrae por cada `demandados[]` (antes era único a nivel de oficio), para reflejar el contrato actual con la API externa de embargos. `oficio.oficioEmbargoADesembargar` se mantiene sin cambios.
- **Puertos Docker reasignados:** Postgres expone `5433` (antes `5432`) y Redis `6380` en el host, para evitar choques con instalaciones locales. `COMPOSE_PROJECT_NAME` default cambió a `jt-ia`. Nueva variable `LOG_LEVELS` (default `log,verbose,error,warn`) para controlar los niveles de log de Nest.

---

## 🚀 Guía de Inicio Rápido (Desde Cero)

Setup de un ambiente **nuevo** (primera vez en tu máquina o en un servidor limpio). El flujo estándar de día a día está en [Modos de Ejecución](#-modos-de-ejecución).

**1. Instalar dependencias**

Requiere Node 24 y pnpm 10 (ver `volta`/`packageManager` en `package.json`):

```bash
pnpm install
```

**2. Configurar variables de entorno**

```bash
cp .env.example .env
```

Como mínimo, completa en tu `.env`:

```env
GEMINI_API_KEY=...
GCP_PROJECT_ID=...
DOCUMENT_AI_PROCESSOR_ID=...
GOOGLE_APPLICATION_CREDENTIALS=./secrets/key.json   # coloca el JSON de credenciales GCP en ./secrets/
TENANT_PROFILE=default                              # default | bbva | davibank
```

**3. Levantar la infraestructura (Docker)**

Solo los servicios de soporte (Postgres + Redis), en segundo plano:

```bash
docker-compose up -d db redis
docker-compose ps   # confirma que ambos estén "Up"
```

Con los puertos actuales del `docker-compose.yml`, ajusta tu `.env` para apuntar al host:

```env
DATABASE_URL=postgresql://postgres:password@localhost:5433/jt_documents
REDIS_HOST=localhost
REDIS_PORT=6380
```

**4. Crear el esquema de la Base de Datos**

⚠️ Este proyecto **no usa** `prisma migrate dev/deploy` ni `prisma db push` (ver [regla mandatoria en `AGENTS.md`](AGENTS.md)). El esquema se aplica ejecutando manualmente los archivos SQL de `migrations/` en orden, directamente contra el contenedor de Postgres:

```bash
for f in migrations/*/migration.sql; do
  echo "Aplicando $f"
  docker exec -i jt-db psql -U postgres -d jt_documents < "$f"
done
```

Luego sincroniza el cliente de Prisma (solo genera tipos, no toca la DB):

```bash
npx prisma generate
```

**5. Arrancar la aplicación**

```bash
pnpm run start:dev
```

Esto crea automáticamente la estructura de carpetas en `./local/` (incluye `EMBARGOS/`, `DESEMBARGOS/`, `ALCANCES/`, `MASIVOS/`, `in/`, `ocr/`, `ocr-done/`, `excel-done/`, `data/`, `reports/`).

---

## 🧭 Modos de Ejecución

### 1) Local — Node nativo + infraestructura en Docker (desarrollo día a día)

La app corre en tu máquina (`pnpm start:dev`, hot-reload); Postgres y Redis corren en Docker.

```bash
docker-compose up -d db redis   # si no están corriendo
pnpm run start:dev
```

Apagar solo la infraestructura (conserva los datos):

```bash
docker-compose stop db redis
```

### 2) Docker Local — Todo en contenedores (en tu máquina)

Igual que producción pero corriendo localmente. Requiere `Dockerfile` configurado.

```bash
# Primera vez / tras cambios en dependencias o Dockerfile
docker-compose build

# Levantar todo el cluster (db + redis + app)
docker-compose up -d --build

# Ver logs de la app en vivo
docker-compose logs -f app
```

Si es una DB nueva (volumen recién creado), aplica las migraciones igual que en el paso 4 de arriba (`docker exec -i jt-db psql ...`) antes de que la app las necesite.

Apagar:

```bash
docker-compose down

# Variante para borrar también los volúmenes (⚠️ elimina los datos de Postgres)
docker-compose down -v
```

### 3) Servidor (Producción)

Mismo `docker-compose.yml`, con dos diferencias clave respecto a Docker local:

- **`SERVER_PATH_EMBARGOS` / `SERVER_PATH_DESEMBARGOS` / `SERVER_PATH_ALCANCES` / `SERVER_PATH_MASIVOS`** en el `.env` del servidor deben apuntar a las **rutas reales** de las carpetas a monitorear (no a `./local/...`). `docker-compose.yml` las monta dentro del contenedor en `/app/local/EMBARGOS`, `/app/local/DESEMBARGOS`, `/app/local/ALCANCES` y `/app/local/MASIVOS`.
- **`COMPOSE_PROJECT_NAME`** distinto si conviven varios stacks en el mismo host, y credenciales reales (`GEMINI_API_KEY`, `GOOGLE_APPLICATION_CREDENTIALS` → `./secrets/key.json`, `DOCUMENT_AI_PROCESSOR_ID`, `GCP_PROJECT_ID`).

```bash
# En el servidor
git pull
cp .env.example .env        # solo la primera vez; luego edita con las rutas y credenciales reales
docker-compose build
docker-compose up -d --build
docker-compose logs -f app
```

La base de datos de producción **ya tiene el baseline aplicado** (`migrations/20260611_baseline/`) — no lo vuelvas a correr ahí. Aplica solo las migraciones incrementales pendientes desde el último despliegue, en orden cronológico (el nombre de cada carpeta ya viene ordenado por fecha):

```bash
docker exec -i jt-db psql -U postgres -d jt_documents < migrations/20260706_add_en_cola_masivo/migration.sql
# ...siguiente migración pendiente, en orden
npx prisma generate
```

---

## 🗄️ Manejo de Base de Datos (Prisma + SQL manual)

El esquema vive en `schema.prisma`, pero **los cambios a la DB nunca se aplican con comandos de Prisma** (`migrate dev/deploy`, `db push` están prohibidos — ver `AGENTS.md`). El flujo estandarizado:

**1. Modifica `schema.prisma`** con el cambio necesario.

**2. Genera el SQL de la migración** (comando de solo lectura, no toca la DB):

```bash
npx prisma migrate diff --from-schema-datamodel schema.prisma --to-schema-datamodel schema.prisma --script > migration.sql
```

Revisa y ajusta el SQL a mano (debe ser **idempotente**: `IF NOT EXISTS`, `IF EXISTS`, `OR REPLACE`), y guárdalo como `migrations/YYYYMMDD_descripcion_corta/migration.sql` (convención vigente — ver carpetas existentes en `migrations/`).

**3. Sincroniza el cliente de Prisma:**

```bash
npx prisma generate
```

**4. Entrega el archivo SQL** para revisión y aplicación manual en cada ambiente (local, servidor) con el comando `docker exec -i jt-db psql ...` de las secciones anteriores.

---

### 🚨 Factory Reset (Arranque 100% Limpio y Destructivo)

Solo para ambientes **locales**. Si el entorno se contamina con oficios fantasmas atascados o necesitas purgar todo rastro de pruebas anteriores, borrar solo carpetas o la DB no basta — también hay que vaciar Redis, o BullMQ intentará reprocesar jobs fantasma.

**1. Limpia las carpetas físicas generadas** (⚠️ **NO borres** `./local/data/clients.csv`, tu listado maestro de clientes):

```
./local/in/
./local/ocr/
./local/ocr-done/
./local/excel-done/
./local/ocr-unreadable/
./local/unsupported/
./local/duplicates/
./local/reports/
./local/EMBARGOS/  ./local/DESEMBARGOS/  ./local/ALCANCES/  ./local/MASIVOS/
```

**2. Aniquila el historial de la Base de Datos y reaplica el esquema desde cero:**

```bash
docker-compose down -v          # borra también el volumen de Postgres
docker-compose up -d db redis

for f in migrations/*/migration.sql; do
  docker exec -i jt-db psql -U postgres -d jt_documents < "$f"
done
npx prisma generate
```

**3. Purga las colas activas en Redis** (si no usaste `down -v`, o para asegurarte):

```bash
docker exec -it jt-redis-llm redis-cli FLUSHALL
```

*(Luego de esto, es 100% seguro arrancar `pnpm run start:dev` nuevamente).*

---

## 📂 Arquitectura de Archivos (Modo Local)

Todo sucede dentro de la carpeta raíz aislada de trabajo autogenerada (`./local/`). Esto dicta desde dónde absorbe los documentos iniciales, de dónde consume el listado maestro de clientes (`clients.csv`), y hacia dónde despacha el reporte diario a las 23:00.

- **Base de Clientes:** Si subes clientes nuevos, debes actualizar y reemplazar el archivo local en `./local/data/clients.csv`. *(El sistema lo relee y refresca en caliente automáticamente cada 1 hora)*.
- **Ingesta de Oficios:** El sistema puede leer de múltiples carpetas simultáneamente.
  - **En el Servidor (Docker):** Configura las rutas reales de tus carpetas en el `.env` usando `SERVER_PATH_EMBARGOS`, `SERVER_PATH_DESEMBARGOS`, `SERVER_PATH_ALCANCES` y `SERVER_PATH_MASIVOS`. `docker-compose.yml` las monta dentro del contenedor en `/app/local/EMBARGOS`, `/app/local/DESEMBARGOS`, `/app/local/ALCANCES` y `/app/local/MASIVOS`.
  - **Configuración:** La variable `LOCAL_SOURCE_PATHS` en el `.env` (`./local/EMBARGOS,./local/DESEMBARGOS,./local/ALCANCES,./local/MASIVOS`) es la ruta que la app realmente lee, y usa el **mismo valor en local, Docker local y Docker prod** — se resuelve relativa a la raíz del proceso (repo en local, `/app` en el contenedor), y el volumen de Docker está mapeado justo a esa misma estructura.
  - **Procesamiento:** El bot escanea todas estas ubicaciones de forma **recursiva** buscando archivos válidos. Las 3 primeras carpetas procesan cualquier extensión soportada por el flujo individual (OCR/Gemini). **La carpeta MASIVOS es especial**: solo recoge automáticamente Excel/CSV (`.xlsx`/`.xls`/`.csv`), que se procesan en su propia cola (`cola_masivos`, separada de `cola_ocr` para no competir por workers con el flujo individual). Un PDF dejado en MASIVOS **no** se procesa solo — queda "en espera" hasta que un Excel de esa misma carpeta lo reclame por nombre: la plantilla trae el nombre original del PDF (`NOMBRE OFICIO INICIAL`) para localizarlo y el nombre final deseado (`NOMBRE OFICIO FINAL`) para renombrarlo antes de moverlo junto con el Excel a `EXCEL_DESTINATION_PATH`.
- **Reportes Finales:** Finalizada la IA, tu CSV limpio segmentado por campos se guardará con la fecha de hoy dentro de `./local/reports/`.
- **Archivos Especiales:** Los archivos duplicados (MD5 existente) se mueven a `./local/duplicates` con un timestamp. Los archivos con formato no soportado (ej. `.docx`, `.zip`) se mueven a `./local/unsupported`.
- **Anti-colisión de PDFs destino:** los PDFs finales (individual en `OCR_DESTINATION_PATH`, masivo en `EXCEL_DESTINATION_PATH`) se guardan dentro de una subcarpeta `yyyyMMdd` (fecha Bogotá), y si dos oficios generan el mismo `nombreOficioFinal` en esa misma subcarpeta (mismo día), el segundo recibe sufijo `-1`, `-2`, etc. (ej. `nombre_archivo-1.pdf`) — el `nombreOficioFinal` persistido en DB no lleva ese sufijo, solo el archivo físico.
- *(Rutas de Transición)*: `local/in/`, `local/ocr/` son internas del pipeline del sistema. No colocar ni tocar archivos allí para evitar disrumpir transacciones.

---

## ⚙️ Variables de Entorno Clave

| Variable                   | Descripción                                      |
| -------------------------- | ------------------------------------------------ |
| `SERVER_PATH_EMBARGOS/DESEMBARGOS/ALCANCES/MASIVOS` | Rutas absolutas del servidor hacia las 4 carpetas a monitorear (solo Docker) |
| `LOCAL_SOURCE_PATHS`       | Carpetas que la app escanea, separadas por comas. Mismo valor en local, Docker local y Docker prod (`./local/EMBARGOS,./local/DESEMBARGOS,./local/ALCANCES,./local/MASIVOS`) |
| `MASIVOS_SOURCE_PATH`      | Ruta de la carpeta MASIVOS vista por la app — debe coincidir con el último elemento de `LOCAL_SOURCE_PATHS`. Restringe esa carpeta a solo Excel/CSV y permite localizar el PDF asociado a cada plantilla |
| `MASIVO_QUEUE_CONCURRENCY` | Concurrencia de `cola_masivos` (`MasivoProcessor`), independiente de `cola_ocr` (default `2`) |
| `TENANT_PROFILE`           | Controla esquema Multi-Tenant (`default` \| `bbva` \| `davibank`) |
| `DATABASE_URL`             | URL de conexión a PostgreSQL                     |
| `REDIS_HOST` / `REDIS_PORT`| Conexión a Redis (BullMQ). En Docker local: `localhost:6380` hacia el host |
| `IN_PATH`                  | Carpeta de entrada (`./local/in`)                |
| `OCR_PATH`                 | Carpeta intermedia OCR (`./local/ocr`)           |
| `EXCEL_DESTINATION_PATH`   | Destino final externo de Excel/CSV procesados (`./local/excel-done`) |
| `OCR_DESTINATION_PATH`     | Destino final externo de documentos OCR procesados (`./local/ocr-done`) |
| `UNSUPPORTED_PATH`         | Carpeta de no admitidos (`./local/unsupported`)  |
| `DUPLICATES_PATH`          | Carpeta de duplicados (`./local/duplicates`)     |
| `GEMINI_API_KEY`           | API Key provista por Google AI Studio            |
| `GEMINI_INLINE_MAX_MB`     | Tamaño máx. (MB) para enviar un PDF/imagen inline a Gemini (multimodal). Por encima del umbral se usa Document AI como fallback. Default: `15` |
| `DOCUMENT_AI_PROCESSOR_ID` | ID de Google Document AI. **Sigue siendo obligatorio**: Document AI quedó como fallback del flujo multimodal |
| `COMPOSE_PROJECT_NAME`     | Nombre base para aislar red, volúmenes y contenedores en Docker Compose (default `jt-ia`) |
| `LOG_LEVELS`               | Niveles de log de Nest, separados por coma (default `log,verbose,error,warn`) |

### 🔗 Integración Externa REST (Opcional)

El sistema permite despachar automáticamente los resultados en tiempo real a una API REST externa una vez finalizado el procesamiento (`IA_OK` o `EXCEL_OK`). El servicio gestiona automáticamente la autenticación Bearer y la renovación de tokens.

| Variable | Descripción |
| :--- | :--- |
| `INTEGRATION_AUTH_URL` | URL para obtener el Bearer token (POST) |
| `INTEGRATION_AUTH_PAYLOAD` | JSON payload de credenciales |
| `INTEGRATION_DATA_URL` | URL destino donde se envía el JSON procesado |
| `INTEGRATION_BATCH_START_URL` | URL para notificar el inicio de un batch masivo de Excel/CSV (devuelve un `loteId`). Si no está configurada, los batches usan `loteId="LOCAL"` y omiten el despacho remoto de inicio |
| `INTEGRATION_BATCH_CONCURRENCY` | Máximo de filas enviadas en paralelo a `INTEGRATION_DATA_URL` durante el procesamiento masivo (default `5`) |
| `INTEGRATION_LOTE_SIZE` | Filas por "lote" usadas para calcular `cantidadLotes` enviado a `startBatch` (default `100`) |

---

## 🔄 Pipeline de Estados & APIs

**1. Flujo de Extracción y Modelado** (IA multimodal primero; OCR solo fallback):

```text
[Cron Job de Ingesta] (Escaneo recursivo local)
          ↓
     EN_COLA_OCR
 (Orquestador / router de estrategias — ya NO ejecuta OCR para PDFs)
          │
          ├─► Archivo .XLS / .XLSX / .CSV (Carga Masiva)
          │      └─► (MassiveExcelService) -> Bypass IA y OCR
          │          ├─► PROCESANDO_EXCEL (Lectura por Streams/Lotes)
          │          └─► EXCEL_OK (Éxito. Datos en tabla excel_records)
          │
          ├─► Archivo .PDF / .JPG / .PNG
          │      └─► OcrProcessor solo mueve el archivo y lo encola a cola_modelo
          │          (FORMATO_NO_SOPORTADO si la extensión no se admite)
          │
          ▼
   EN_COLA_MODELO  →  PROCESANDO_MODELO
          │
          ├─► 1) PRINCIPAL: PDF directo a Gemini (multimodal).
          │      Acepta PDF nativo, SIN tope de 30 páginas.
          │
          ├─► 2) FALLBACK: si el multimodal falla o el archivo supera
          │      GEMINI_INLINE_MAX_MB → Document AI (OCR) -> texto -> Gemini.
          │
          ├─► ERRORES POSIBLES:
          │      • MODEL_ERROR (ni multimodal ni OCR extrajeron / JSON inválido)
          │
          ▼
         IA_OK (documento individual analizado por IA)
```

> **Document AI sigue siendo dependencia obligatoria** por ser el fallback (requiere `DOCUMENT_AI_PROCESSOR_ID`, `GCP_PROJECT_ID` y credenciales GCP). Los documentos ilegibles caen en `MODEL_ERROR`. Antes el flujo era **OCR primero → texto → Gemini**; ahora es **Gemini multimodal primero → fallback OCR**.
>
> **2026-06-24:** se eliminaron del enum `DocumentState` los valores `OCR_UNREADABLE`, `DUPLICADO` y `ERROR_EXCEL` (vestigiales, sin uso en el código). Ver `migrations/20260624_cleanup_document_state_enum/migration.sql`.
>
> **Consecutivo diario:** el segmento final de `nombreOficioFinal` (`{mmdd}{consecutivo4}`) se genera de forma atómica vía la función SQL `next_daily_sequence()` (tabla `daily_sequences`, ver `src/common/services/daily-sequence.service.ts`) — nunca se calcula con `COUNT(*)`, para evitar colisiones bajo concurrencia. En el flujo masivo este reemplazo de placeholder está deshabilitado a propósito: el nombre final queda literal, tal como viene en la plantilla Excel.

**Auto-Recuperación (Resilience):**
_(Si un contenedor crashea abruptamente o se reinicia la aplicación, el backend cuenta con un mecanismo de resiliencia leyendo los estados PostgreSQL para re-encolar a Redis los archivos olvidados en estados `EN_COLA_X`)._

**2. Endpoints Disponibles:**
El servicio expone un Endpoint analítico de progreso que soporta filtrado dinámico para integraciones Frontend:
`GET /documents?page=1&limit=50&state=IA_OK&startDate=2026-03-01...`
