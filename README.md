# Sistema de Procesamiento de Documentos Asíncrono

Pipeline de procesamiento de documentos judiciales con NestJS, BullMQ (Redis), Prisma ORM (PostgreSQL), Google Gemini (multimodal — extracción principal) y Google Document AI (OCR de respaldo). Multi-Tenant.

---

## 🆕 Novedades recientes

- **2026-08-04 · ALCANCE recupera default CONGELAR; DESEMBARGO histórico ya no se sobrescribe:** `infoCliente.tipoAplicacion` vuelve a tener el mismo comportamiento en EMBARGO y ALCANCE (CONGELAR por defecto si no hay valor explícito); DESEMBARGO sigue en `"0"` siempre. Ver `normalizarTipoAplicacion` en `src/common/utils/tipo-oficio.util.ts`.
- **2026-08-04 · `demandados[].oficioEmbargoADesembargar` con fallback a fecha:** si el documento no trae número de oficio bajo etiqueta explícita OFICIO/COMUNICADO, en vez de `"0"` el post-procesamiento (`model.processor.ts`) completa el campo con la fecha del oficio (DDMMAA) o, si tampoco hay fecha, con la fecha de procesamiento — mismo segmento de fecha que ya usaba `nombreOficioFinal`. Solo aplica al flujo individual (IA); el prompt sigue devolviendo `"0"` cuando no encuentra la etiqueta, la fecha se completa después, determinísticamente.
- **2026-08-04 · Sin límite de caracteres en nombres que cruzan con la BD del cliente:** `oficio.nombreOficioInicial`, `demandados[].nombre`, `demandantes[].nombre`, `ente.nombreEnteEmbargante` y `ente.nombreSecretarioFuncionario` ya no se truncan en ningún punto del pipeline (prompt, post-procesamiento, ni validación del formulario en el backend Java). Antes se cortaban a 25/40/50 caracteres muy por debajo de lo que el documento trae, lo que rompía el cruce contra el sistema del cliente.
- **2026-08-04 · `numeroId` de demandado/demandante amplía tope a 30:** era la llave de cruce contra la BD del cliente (`identifierKey`) y estaba topada a 12 caracteres en el prompt, en post-procesamiento y en la validación del formulario del backend Java, muy por debajo del tope real de la columna en BD (30) — un número de identificación real más largo se truncaba y podía romper el cruce o hacer match con el cliente equivocado.
- **2026-08-04 · Correos electrónicos saneados:** `ente.correosElectronicos` ya no arrastra la basura del OCR (viñetas, `mailto:`, `<...>`, etiquetas "Correo:", puntuación final, mayúsculas, duplicados). Nueva regla en el prompt + saneamiento determinístico en `src/common/utils/correo.util.ts`, aplicado al flujo IA y al Excel masivo; los elementos sin una dirección válida se descartan en vez de escribirse a medias. El reporte Java repite el saneamiento para cubrir documentos cargados antes de este cambio.
- **2026-08-04 · Un demandado por cada cuantía:** el prompt ya no permite fusionar apariciones del mismo demandado. La unidad del array `demandados[]` es cada APARICIÓN con datos propios, no la persona: cuantías, radicados, porcentajes u oficios a desembargar distintos generan un objeto independiente cada uno, repitiendo identificación y nombre. Antes solo se separaba por radicado, así que una misma persona con varias cuantías se colapsaba en un solo registro.
- **2026-07-31 · `oficioEmbargoADesembargar` por demandado y número de oficio estricto:** el campo pasó de `oficio.oficioEmbargoADesembargar` a `demandados[].oficioEmbargoADesembargar` (igual que `radicadoADesembargar`). Además ya **no** admite sustituir el número de oficio por uno de resolución/acto administrativo: si no hay etiqueta explícita de OFICIO/COMUNICADO queda en `"0"` y el número de resolución va en `radicadoADesembargar`. Ese reemplazo por resolución sigue vigente **solo** para construir `oficio.nombreOficioFinal` (en los 3 tipos de oficio). Ambos campos de desembargo se fuerzan a `"0"` en EMBARGO y ALCANCE.
- **2026-07-31 · `tipoAplicacion` sin default fuera de EMBARGO:** el relleno automático a `CONGELAR` aplica únicamente a oficios de EMBARGO. En DESEMBARGO y ALCANCE se respeta un `CONGELAR`/`DEBITAR` explícito del documento (o de la columna del Excel de ALCANCE) y en cualquier otro caso queda en `"0"`. Centralizado en `src/common/utils/tipo-oficio.util.ts`, aplicado en el flujo IA, el flujo Excel masivo y el envío a la API externa.
- **2026-07-21 · Subcarpeta de destino simplificada a solo fecha:** la subcarpeta anticolisión de PDFs destino pasó de `yyyyMMddHHmmss` a `yyyyMMdd` (hora Bogotá, sin hora/min/seg). El sufijo anticolisión de `resolverRutaSinColision` pasó de `_N` a `-N` (ej. `nombre_archivo-1.pdf`). Ver `src/common/utils/file-destination.util.ts`.
- **2026-08-06 · Estructura de entrada por corte (`CORTE_[n]`) y trazabilidad de lotes (`entry_report`):** los oficios ahora se depositan como `[tipo_oficio]/[YYYYMMDD]/CORTE_[n]/*` (ej. `./local/embargos/20260806/CORTE_1/`); se mantiene compatibilidad con la forma legacy (archivos sueltos en la raíz del tipo, o en `[tipo_oficio]/[YYYYMMDD]/*` sin cortes). Cada terna `(tipo_oficio, fecha_entrada, corte)` genera un registro en la tabla nueva `entry_report`, que cuenta cuántos documentos entraron vs. cuántos terminaron procesados/error, y dispara un Excel consolidado de entrada por corte cuando el lote cierra. Incluye endpoint manual `POST /entry-report/reprocesar`. Ver [Estructura de carpetas de entrada](#-estructura-de-carpetas-de-entrada), [Trazabilidad de lotes](#-trazabilidad-de-lotes-entry_report) y [⚠️ Migración pendiente de aplicar](#️-migración-pendiente-de-aplicar-2026-08-06). **Requiere aplicar una migración SQL manualmente antes de desplegar.**
- **2026-07-17 · Carpetas de ingesta renombradas y unificadas:** `SERVER_PATH_1..4` → `SERVER_PATH_EMBARGOS`, `SERVER_PATH_DESEMBARGOS`, `SERVER_PATH_ALCANCES`, `SERVER_PATH_MASIVOS`. `LOCAL_SOURCE_PATHS` ahora usa **el mismo valor** en local, Docker local y Docker producción (`./local/embargos,./local/desembargos,./local/alcances,./local/masivos`) — ya no apunta a rutas internas tipo `/app/source/1`. Ver [sección de arquitectura de archivos](#-arquitectura-de-archivos-modo-local).
- **2026-07-17 · Subcarpeta de destino ahora granular a segundos:** la subcarpeta anticolisión de PDFs destino pasó de `ddMMyyyyHH` a `yyyyMMddHHmmss` (hora Bogotá, año primero para ordenar cronológicamente), para reducir aún más cuántos oficios terminan compartiendo carpeta y por lo tanto cuántos reciben sufijo `_N`. Ver `src/common/utils/file-destination.util.ts`.
- **2026-07-16 · Anti-colisión de PDFs destino:** los PDFs procesados (flujo individual y masivo) ahora se guardan en una subcarpeta con fecha y hora (hora Bogotá) dentro de `OCR_DESTINATION_PATH` / `EXCEL_DESTINATION_PATH`, con sufijo `_1`, `_2`... si dos oficios generan el mismo nombre final en esa subcarpeta. Antes un `nombreOficioFinal` repetido sobrescribía el PDF anterior. Ver `src/common/utils/file-destination.util.ts`.
- **2026-07-16 · `valorEmbargo` como texto literal:** Gemini ahora transcribe el monto tal cual aparece en el documento (string, sin limpiar), y la conversión a entero COP se centraliza en `parseValorEmbargo` (`src/common/utils/valor-embargo.util.ts`), usada tanto por el flujo IA como por el flujo Excel masivo. Antes cada flujo lo parseaba distinto y montos como `"16.000.000.00"` se interpretaban mal.
- **2026-07-16 · `radicadoADesembargar` por demandado:** para oficios tipo DESEMBARGO, este campo ahora se extrae por cada `demandados[]` (antes era único a nivel de oficio), para reflejar el contrato actual con la API externa de embargos. (`oficio.oficioEmbargoADesembargar` se movió también a nivel de demandado el 2026-07-31.)
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

Esto crea automáticamente la estructura de carpetas en `./local/` (incluye `embargos/`, `desembargos/`, `alcances/`, `masivos/`, `in/`, `ocr/`, `ocr-done/`, `excel-done/`, `data/`, `reports/`, `reporte_entrada/`).

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

- **`SERVER_PATH_EMBARGOS` / `SERVER_PATH_DESEMBARGOS` / `SERVER_PATH_ALCANCES` / `SERVER_PATH_MASIVOS`** en el `.env` del servidor deben apuntar a las **rutas reales** de las carpetas a monitorear (no a `./local/...`). `docker-compose.yml` las monta dentro del contenedor en `/app/local/embargos`, `/app/local/desembargos`, `/app/local/alcances` y `/app/local/masivos` (minúsculas — en Linux el filesystem es case-sensitive, una ruta en mayúsculas no coincide y el escaneo la salta con el warning `Source path does not exist`).
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
./local/embargos/  ./local/desembargos/  ./local/alcances/  ./local/masivos/
./local/reporte_entrada/
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
  - **En el Servidor (Docker):** Configura las rutas reales de tus carpetas en el `.env` usando `SERVER_PATH_EMBARGOS`, `SERVER_PATH_DESEMBARGOS`, `SERVER_PATH_ALCANCES` y `SERVER_PATH_MASIVOS`. `docker-compose.yml` las monta dentro del contenedor en `/app/local/embargos`, `/app/local/desembargos`, `/app/local/alcances` y `/app/local/masivos`.
  - **Configuración:** La variable `LOCAL_SOURCE_PATHS` en el `.env` (`./local/embargos,./local/desembargos,./local/alcances,./local/masivos`) es la ruta que la app realmente lee, y usa el **mismo valor en local, Docker local y Docker prod** — se resuelve relativa a la raíz del proceso (repo en local, `/app` en el contenedor), y el volumen de Docker está mapeado justo a esa misma estructura. ⚠️ **Todas estas rutas van en minúsculas**: en Linux (case-sensitive) una carpeta configurada en mayúsculas que no coincide con el filesystem real hace que el escaneo la ignore silenciosamente (log `Source path does not exist`).
  - **Procesamiento:** El bot escanea todas estas ubicaciones de forma **recursiva** buscando archivos válidos. Las 3 primeras carpetas procesan cualquier extensión soportada por el flujo individual (OCR/Gemini). **La carpeta MASIVOS es especial**: solo recoge automáticamente Excel/CSV (`.xlsx`/`.xls`/`.csv`), que se procesan en su propia cola (`cola_masivos`, separada de `cola_ocr` para no competir por workers con el flujo individual). Un PDF dejado en MASIVOS **no** se procesa solo — queda "en espera" hasta que un Excel de esa misma carpeta lo reclame por nombre: la plantilla trae el nombre original del PDF (`NOMBRE OFICIO INICIAL`) para localizarlo y el nombre final deseado (`NOMBRE OFICIO FINAL`) para renombrarlo antes de moverlo junto con el Excel a `EXCEL_DESTINATION_PATH`.
- **Reportes Finales:** Finalizada la IA, tu CSV limpio segmentado por campos se guardará con la fecha de hoy dentro de `./local/reports/`.
- **Archivos Especiales:** Los archivos duplicados (MD5 existente) se mueven a `./local/duplicates` con un timestamp. Los archivos con formato no soportado (ej. `.docx`, `.zip`) se mueven a `./local/unsupported`.
- **Anti-colisión de PDFs destino:** los PDFs finales (individual en `OCR_DESTINATION_PATH`, masivo en `EXCEL_DESTINATION_PATH`) se guardan dentro de una subcarpeta `yyyyMMdd` (fecha Bogotá), y si dos oficios generan el mismo `nombreOficioFinal` en esa misma subcarpeta (mismo día), el segundo recibe sufijo `-1`, `-2`, etc. (ej. `nombre_archivo-1.pdf`) — el `nombreOficioFinal` persistido en DB no lleva ese sufijo, solo el archivo físico.
- *(Rutas de Transición)*: `local/in/`, `local/ocr/` son internas del pipeline del sistema. No colocar ni tocar archivos allí para evitar disrumpir transacciones.

---

## 📁 Estructura de Carpetas de Entrada

Dentro de cada carpeta raíz de `LOCAL_SOURCE_PATHS` (`embargos`, `desembargos`, `alcances`, `masivos`), los oficios se organizan por fecha de entrada y, opcionalmente, por corte:

```text
local/
└── embargos/                     # raíz de tipo de oficio (= LOCAL_SOURCE_PATHS)
    ├── 20260806/                 # fecha de entrada, formato YYYYMMDD
    │   ├── CORTE_1/               # ← MAYÚSCULAS estrictas, obligatorio "CORTE_<n>"
    │   │   ├── oficio_a.pdf
    │   │   └── oficio_b.pdf
    │   ├── CORTE_2/
    │   │   └── oficio_c.pdf
    │   └── ...                   # CORTE_3, CORTE_10, etc. — se procesan en orden numérico
    │
    ├── 20260805/                 # forma legacy con fecha, SIN subcarpetas de corte
    │   └── oficio_suelto.pdf     # corte queda como SIN_CORTE
    │
    └── oficio_viejo.pdf          # forma legacy de raíz (archivo suelto sin fecha)
                                   # se usa la fecha de HOY como fecha de entrada, SIN_CORTE
```

**Reglas:**

- **`CORTE_[n]` es estricto y en mayúsculas** (`CORTE_1`, `CORTE_23`, ...). Una subcarpeta que no matchee exactamente ese patrón (ej. `corte_1`, `Corte1`, `CORTE-1`) se **ignora**: se loguea un `warn` (`Ignorando carpeta con estructura no soportada...`) y los archivos se dejan **intactos** donde están — no se mueven ni se procesan, hasta que se renombre la carpeta correctamente.
- Si una carpeta de fecha ya tiene subcarpetas `CORTE_n` válidas, cualquier archivo suelto directamente en esa carpeta de fecha (sin corte) también se ignora, por estar mal ubicado.
- Los cortes se procesan **en orden numérico** (`CORTE_1`, `CORTE_2`, ..., `CORTE_10`, no orden alfabético), encolando por completo los archivos de un corte antes de pasar al siguiente.
- Compatibilidad hacia atrás (forma "legacy"): archivos sueltos en la raíz del tipo de oficio, o en `[tipo_oficio]/[YYYYMMDD]/` sin subcarpetas de corte, se siguen procesando igual que antes — con `corte = SIN_CORTE`.
- Profundidades mayores a `[tipo_oficio]/[YYYYMMDD]/CORTE_[n]/` no están soportadas.

Ver `src/common/utils/ruta-entrada.util.ts` (reglas de parseo) y `src/modules/extraction/strategies/local-file.strategy.ts` (descubrimiento).

---

## 🧾 Trazabilidad de Lotes (`entry_report`)

Cada carpeta de entrada descubierta (una terna `tipo_oficio` + `fecha_entrada` + `corte`) genera o actualiza una fila en la tabla `entry_report`, creada **antes** de mover los archivos (para que el conteo refleje lo que había en la carpeta al momento del descubrimiento, no lo que sobrevive a un movimiento parcialmente fallido).

**Columnas principales:**

| Columna | Descripción |
| --- | --- |
| `tipo_oficio`, `fecha_entrada`, `corte` | Clave única del lote (`@@unique`) |
| `ruta` | Ruta absoluta de la carpeta escaneada |
| `numero_documentos_entrada` | Cuántos archivos se descubrieron en la carpeta |
| `numero_documentos_procesados` | Cuántos llegaron a un estado terminal OK (`IA_OK` / `EXCEL_OK`) |
| `numero_documentos_error` | Cuántos llegaron a un estado terminal de error (`MODEL_ERROR` / `ERROR_OCR`, agotados los reintentos) |
| `reporte_generado_en` / `reporte_ruta` | Se llenan cuando el cron genera el Excel de ese lote; mientras estén `NULL`, el lote sigue pendiente de reporte |

Cada fila de `documents` guarda también, de forma desnormalizada, `entry_report_id`, `tipo_oficio` (derivado de la carpeta física), `tipo_oficio_ia` (detectado por Gemini, o por la hoja del Excel en el flujo masivo — se guarda aparte para poder auditar discrepancias contra `tipo_oficio`), `fecha_entrada`, `corte`, `nombre_oficio_final` y `conteo_registrado`.

**Flujo por colas:** cuando un `Document` llega a un estado terminal DEFINITIVO, se publica un evento en `cola_conteo_ok` (`IA_OK` / `EXCEL_OK`) o `cola_conteo_error` (`MODEL_ERROR` / `ERROR_OCR` con reintentos de BullMQ agotados), que incrementa `numero_documentos_procesados` o `numero_documentos_error` de forma idempotente (candado `conteo_registrado` en `documents`, verificado y marcado en la misma transacción que incrementa el contador).

> ⚠️ **Los `MODEL_ERROR` / `ERROR_OCR` escritos justo antes de un reintento de BullMQ NO cuentan.** Los processors de OCR/modelo escriben ese estado en DB inmediatamente antes de relanzar la excepción para que BullMQ reintente el job (hasta 3 intentos). Si se publicara el evento de conteo ahí, un mismo documento podría incrementar `numero_documentos_error` hasta 3 veces (una por intento fallido), inflando el contador y rompiendo la igualdad `entrada = procesados + error` de la que depende el cierre del lote. El conteo de error solo se dispara desde el punto en que el estado es realmente definitivo (reintentos agotados, típicamente vía `@OnWorkerEvent('failed')` o en la recuperación tras un reinicio).

**Cuándo se considera cerrado un lote:** cuando `numero_documentos_entrada = numero_documentos_procesados + numero_documentos_error`. A partir de ahí queda disponible para que el cron de reportería genere su Excel.

Ver `src/modules/entry-report/` (repositorio, servicio, processors de las colas de conteo) y `schema.prisma` (modelos `EntryReport` y `Document`).

---

## 📊 Reporte de Entrada

El cron `CRON_ENTRY_REPORT_SCHEDULE` (default `*/5 * * * *`) revisa periódicamente qué lotes de `entry_report` cerraron (`entrada = procesados + error`) y **no** tienen reporte generado. Por cada terna distinta `(fecha_entrada, corte)` con **todos** sus lotes (de todos los tipos de oficio) cerrados, genera un único Excel consolidado con una fila por documento:

| Columna |
| --- |
| `FECHA DEL CORTE` |
| `NUMERO DE CORTE` |
| `NOMBRE INICIAL` |
| `NOMBRE FINAL` |
| `TIPO DE OFICIO` |
| `FECHA DE CREACION` |

- **Ruta de salida:** `<REPORTE_ENTRADA_PATH>/[YYYYMMDD]/CORTE_[n].xlsx` (ej. `./local/reporte_entrada/20260806/CORTE_1.xlsx` en local, `/opt/reporte_entrada/20260806/CORTE_1.xlsx` en el contenedor).
- **Cuándo se genera:** solo cuando TODOS los lotes de esa fecha+corte (uno por tipo de oficio que haya tenido archivos en ese corte) están cerrados — así se evita escribir el Excel con filas faltantes de un tipo de oficio que todavía sigue en proceso.
- Una vez escrito, los lotes involucrados se marcan con `reporte_generado_en` / `reporte_ruta` para no regenerarlo en cada tick.

Ver `src/modules/entry-report/entry-report-excel.service.ts`.

---

## 🔁 Endpoint Manual de Relectura

`POST /entry-report/reprocesar` permite a un operador repetir la lectura de una carpeta `[tipo_oficio]/[YYYYMMDD]/CORTE_[n]` (por ejemplo, si se agregaron archivos a mano tras el escaneo automático) y/o forzar la regeneración del Excel de ese corte, sin esperar al cron.

```bash
curl -X POST http://localhost:3000/entry-report/reprocesar \
  -H "Content-Type: application/json" \
  -d '{
    "tipoOficio": "embargos",
    "fechaEntrada": "20260806",
    "corte": "CORTE_1"
  }'
```

Qué hace exactamente:

1. **Relee** la carpeta `[tipo_oficio]/[fechaEntrada]/[corte]` (acepta variantes de mayúsculas/minúsculas en `tipoOficio` y `corte`, se normalizan internamente): si hay archivos nuevos, los descubre, suma el lote en `entry_report` y los encola para su procesamiento normal (OCR/Gemini o masivo, según extensión). Si no hay archivos (porque ya se movieron en una corrida anterior) pero ya existe un `entry_report` para esa terna, no falla — simplemente no hay nada nuevo que encolar.
2. **Regenera** el Excel consolidado de ese corte, en modo forzado: toma de la base de datos **todos** los documentos que existan para esa terna (no solo los recién leídos) y reescribe el archivo, aunque el lote ya estuviera marcado como reportado o todavía no esté cerrado.

Devuelve `entryReportId`, `ruta` (carpeta origen), `archivosEncontrados`, `archivosEncolados` y `reporteRuta` (ruta del Excel regenerado).

Ver `src/modules/entry-report/entry-report.controller.ts`, `entry-report-manual.service.ts` y `dto/reprocesar-corte.dto.ts`.

---

## ⚠️ Migración Pendiente de Aplicar (2026-08-06)

**Este cambio requiere aplicar una migración SQL manualmente antes de desplegar** — este repo no usa `prisma migrate`, así que actualizar `schema.prisma` en el código NO actualiza la base de datos por sí solo.

```bash
psql -U postgres -d jt_documents -f migrations/20260806_entry_report/migration.sql
npx prisma generate
```

(O, si se aplica dentro del contenedor de Postgres en Docker: `docker exec -i jt-db psql -U postgres -d jt_documents < migrations/20260806_entry_report/migration.sql`.)

**Si no se aplica esta migración, la aplicación arranca sin errores pero falla en tiempo de ejecución** con `P2022 - The column documents.entry_report_id does not exist` (comprobado). La migración crea la tabla `entry_report` y agrega a `documents` las columnas `entry_report_id`, `tipo_oficio`, `tipo_oficio_ia`, `fecha_entrada`, `corte`, `nombre_oficio_final` y `conteo_registrado`.

---

## ✅ Cambios Manuales Requeridos para Desplegar

Checklist para quien despliega este cambio (2026-08-06):

1. **Variables de entorno nuevas** — agregar tanto en el `.env` **local** como en el `.env` del **servidor**:
   ```env
   REPORTE_ENTRADA_PATH=./local/reporte_entrada
   SERVER_PATH_REPORTE_ENTRADA=<ruta real en el host del servidor>
   CRON_ENTRY_REPORT_SCHEDULE=*/5 * * * *
   EXTRACTION_LOCK_TTL_SECONDS=600
   ```
2. **Carpetas a crear:**
   - Local: `./local/reporte_entrada` (la app la crea sola al arrancar si no existe, igual que el resto de `./local/*`).
   - Servidor: la carpeta real apuntada por `SERVER_PATH_REPORTE_ENTRADA`, que `docker-compose.yml` monta dentro del contenedor como `/opt/reporte_entrada`.
3. **Volumen nuevo en `docker-compose.yml`** (ya presente en este repo, verificar que el `docker-compose.yml` de despliegue lo tenga):
   ```yaml
   - ${SERVER_PATH_REPORTE_ENTRADA:-./local/reporte_entrada}:/opt/reporte_entrada
   ```
4. **Migración SQL** — ver [sección anterior](#️-migración-pendiente-de-aplicar-2026-08-06): `migrations/20260806_entry_report/migration.sql` + `npx prisma generate`.
5. **Nueva estructura de carpetas para quien deposita los oficios** — ver [Estructura de Carpetas de Entrada](#-estructura-de-carpetas-de-entrada). En resumen: `[tipo_oficio]/[YYYYMMDD]/CORTE_[n]/*`, con `CORTE_[n]` **en mayúsculas exactas**. Una carpeta de corte mal nombrada (minúsculas, sin guion bajo, etc.) se ignora — **los archivos no se pierden** (quedan intactos en su carpeta), pero **tampoco se procesan** hasta corregir el nombre.

---

## ⚙️ Variables de Entorno Clave

| Variable                   | Descripción                                      |
| -------------------------- | ------------------------------------------------ |
| `SERVER_PATH_EMBARGOS/DESEMBARGOS/ALCANCES/MASIVOS` | Rutas absolutas del servidor hacia las 4 carpetas a monitorear (solo Docker) |
| `LOCAL_SOURCE_PATHS`       | Carpetas que la app escanea, separadas por comas. Mismo valor en local, Docker local y Docker prod (`./local/embargos,./local/desembargos,./local/alcances,./local/masivos`) — en minúsculas, ver aviso arriba |
| `MASIVOS_SOURCE_PATH`      | Ruta de la carpeta MASIVOS vista por la app — debe coincidir con el último elemento de `LOCAL_SOURCE_PATHS`. Restringe esa carpeta a solo Excel/CSV y permite localizar el PDF asociado a cada plantilla |
| `REPORTE_ENTRADA_PATH`     | Carpeta base donde se escribe el Excel de reporte de entrada. Apunta directo a la carpeta final (el código no le agrega ningún segmento extra). Default: `./local/reporte_entrada` |
| `SERVER_PATH_REPORTE_ENTRADA` | Ruta en el host del servidor que se monta como `/opt/reporte_entrada` dentro del contenedor (solo Docker) |
| `CRON_ENTRY_REPORT_SCHEDULE` | Expresión cron (5 campos) que revisa qué lotes de `entry_report` cerraron para generar su Excel de entrada. Default: `*/5 * * * *` |
| `EXTRACTION_LOCK_TTL_SECONDS` | TTL (segundos) del lock distribuido de extracción (Redis). Default: `600` (antes fijo en `120`; se subió porque un tick ahora puede recorrer varias carpetas `CORTE_[n]` en secuencia) |
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
