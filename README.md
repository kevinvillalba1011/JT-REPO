# Sistema de Procesamiento de Documentos Asíncrono

Pipeline de procesamiento de documentos judiciales con NestJS, BullMQ (Redis), Prisma ORM (PostgreSQL), Google Gemini (multimodal — extracción principal) y Google Document AI (OCR de respaldo). Multi-Tenant.

---

## 🚀 Guía de Inicio Rápido (Modo Desarrollo Local)

En este modo, la aplicación de NestJS correrá localmente en tu máquina (para un desarrollo ágil) mientras que los servicios pesados de infraestructura (Postgres, Redis) correrán en contenedores de Docker.

### A. Preparación del Entorno

**1. Instalar dependencias**

Asegúrate de tener Node.js instalado y ejecutar la instalación usando `pnpm`:

```bash
pnpm install
```

**2. Configurar variables de entorno**

Crea tu archivo `.env` a partir del ejemplo proporcionado:

```bash
cp .env.example .env
```

Verifica que las variables de conexión a la BD y Redis apunten a los futuros contenedores locales:

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/jt_documents
REDIS_HOST=localhost
REDIS_PORT=6379
TENANT_PROFILE=default # Configuración dinámica de Multi-Tenant
```

**3. Levantar la Infraestructura (Docker)**

Inicia únicamente los servicios de soporte en segundo plano:

```bash
docker-compose up -d db redis
```

_(Puedes verificar que estén encendidos ejecutando `docker-compose ps`)_

**4. Sincronizar la Base de Datos (Opcional)**

Dado que los contenedores están recién creados, la Base de Datos de Postgres está vacía. Empuja el esquema ORM actual hacia ella:

```bash
npx prisma db push
npx prisma generate
```

### B. Ejecución

**1. Arrancar el Servidor Node**
Finalmente, inicia la aplicación estable. Esta creará la estructura de carpetas automáticamente (`./local/`):

```bash
pnpm run start:dev
```

---

## 🛠️ Manejo de Base de Datos y Futuros Cambios (Prisma)

El proyecto utiliza **Prisma ORM**. Si en el futuro necesitas agregar nuevas tablas, relacionar entidades o cambiar el nombre de los campos, este es el flujo de trabajo estandarizado que debes seguir:

**1. Cambias el modelo:**  
Modifica el archivo temporalmente genérico `schema.prisma`.

**2. Creas una Migración de Base de Datos (Flujo Seguro):**  
Para evitar fallos en producción, **no** utilices `prisma migrate dev` en entornos productivos. El flujo correcto es:
- **Desarrollo**: Modifica el `schema.prisma`.
- **Generar SQL**: Usa el siguiente comando para obtener un script SQL puro:
  ```bash
  npx prisma migrate diff --from-schema-datamodel schema.prisma --to-schema-datamodel schema.prisma --script > migration.sql
  ```
- **Sincronizar**: Ejecuta `npx prisma generate` para actualizar los tipos en NestJS.
- **Producción**: Aplica el archivo `migration.sql` manualmente en la base de datos.

_(Este comando generará una carpeta en `/prisma/migrations/` que DEBE subirse al repositorio)_

**3. Actualizas tu código TypeScript:**  
Para que NestJS se entere de que existen las nuevas tablas y dispongas de autocompletado en tu código, regenera el cliente local de Prisma:

```bash
npx prisma generate
```

### 🚨 Factory Reset (Arranque 100% Limpio y Destructivo)

Si el entorno de desarrollo se contamina gravemente con oficios fantasmas atascados, o necesitas purgar todo rastro de pruebas anteriores, **borrar solo la base de datos o carpetas no es suficiente**. Debes vaciar la memoria temporal encolada o Redis romperá tu backend.

Sigue esta secuencia obligatoria para dejar tu sistema virgen:

**1. Limpia las carpetas físicas generadas:**
Borra manualmente todos los PDFs y CSVs residuales dentro de:
*   `./local/in/`
*   `./local/ocr/`
*   `./local/done/`
*   `./local/reports/`
*   `./local/unsupported/`
*   `./local/duplicates/`
*   *(⚠️ **NO borres** tu listado maestro en `./local/data/clientes.csv`)*.

**2. Aniquila el Historial de la Base de Datos (PostgreSQL):**
```bash
npx prisma migrate reset --force
npx prisma generate
```

**3. Purga las colas activas en Memoria RAM (Redis):**
Vacía de inmediato el cerebro asíncrono de BullMQ mediante línea de comandos en tu contenedor:
```bash
docker exec -it jt-redis redis-cli FLUSHALL
```
*(Luego de esto, es 100% seguro arrancar `pnpm run start:dev` nuevamente).*

---

## 🐳 Modo Full Docker (Producción / Todo en Contenedores)

Requiere tener configurado el `Dockerfile`. Todos los servicios (incluyendo la aplicación NestJS) correrán aislados en contenedores vinculados.

### A. Preparación del Entorno
1.  **Configurar credenciales (GCP/Gemini):** En el archivo `.env` o a través del JSON ubicado en `./secrets/key.json`.
2.  **Construir las imágenes Docker:**
    ```bash
    docker-compose build
    ```

### B. Ejecución y Gestión
1.  **Levantar todo el cluster:**
    ```bash
    docker-compose up -d --build
    ```
2.  **Ver logs de la aplicación en vivo:**
    ```bash
    docker-compose logs -f app
    ```
3.  **Apagar y destruir el cluster:**

    ```bash
    docker-compose down

    # Variante para borrar también los volúmenes (⚠️ Eliminará los datos de Postgres)
    docker-compose down -v
    ```

---

## 📂 Arquitectura de Archivos (Modo Local)

Todo sucede dentro de la carpeta raíz aislada de trabajo autogenerada (`./local/`). Esto dicta desde dónde absorbe los documentos iniciales, de dónde consume el listado maestro de clientes (`clients.csv`), y hacia dónde despacha el reporte diario a las 23:00.

- **Base de Clientes:** Si subes clientes nuevos, debes actualizar y reemplazar el archivo local en `./local/data/clients.csv`. *(El sistema lo relee y refresca en caliente automáticamente cada 1 hora)*.
- **Ingesta de Oficios:** El sistema puede leer de múltiples carpetas simultáneamente. 
  - **En el Servidor:** Configura las rutas reales de tus carpetas en el `.env` usando `SERVER_PATH_1`, `SERVER_PATH_2`, `SERVER_PATH_3` y `SERVER_PATH_4` (esta última es la carpeta MASIVOS).
  - **Configuración:** La variable `LOCAL_SOURCE_PATHS` en el `.env` apunta a las rutas internas del contenedor (`/app/source/1`, `/app/source/2`, `/app/source/3`, `/app/source/masivos`) que Docker mapea automáticamente a tus carpetas del servidor.
  - **Procesamiento:** El bot escanea todas estas ubicaciones de forma **recursiva** buscando archivos válidos.
- **Reportes Finales:** Finalizada la IA, tu CSV limpio segmentado por campos se guardará con la fecha de hoy dentro de `./local/reports/`.
- **Archivos Especiales:** Los archivos duplicados (MD5 existente) se mueven a `./local/duplicates` con un timestamp. Los archivos con formato no soportado (ej. `.docx`, `.zip`) se mueven a `./local/unsupported`.
- *(Rutas de Transición)*: `local/in/`, `local/ocr/` son internas del pipeline del sistema. No colocar ni tocar archivos allí para evitar disrumpir transacciones.

---

## ⚙️ Variables de Entorno Clave

| Variable                   | Descripción                                      |
| -------------------------- | ------------------------------------------------ |
| `SERVER_PATH_1...4`        | Rutas absolutas del servidor hacia las 4 carpetas a monitorear (la 4ta es MASIVOS) |
| `LOCAL_SOURCE_PATHS`       | Mapeo interno de carpetas en el contenedor separadas por comas |
| `TENANT_PROFILE`           | Controla esquema Multi-Tenant (ej. `default`)    |
| `DATABASE_URL`             | URL de conexión a PostgreSQL                     |
| `IN_PATH`                  | Carpeta de entrada (`./local/in`)                |
| `OCR_PATH`                 | Carpeta intermedia OCR (`./local/ocr`)           |
| `EXCEL_DESTINATION_PATH`   | Destino final externo de Excel/CSV procesados (`./local/excel-done`) |
| `OCR_DESTINATION_PATH`     | Destino final externo de documentos OCR procesados (`./local/ocr-done`) |
| `UNSUPPORTED_PATH`         | Carpeta de no admitidos (`./local/unsupported`)  |
| `DUPLICATES_PATH`          | Carpeta de duplicados (`./local/duplicates`)     |
| `GEMINI_API_KEY`           | API Key provista por Google AI Studio            |
| `GEMINI_INLINE_MAX_MB`     | Tamaño máx. (MB) para enviar un PDF/imagen inline a Gemini (multimodal). Por encima del umbral se usa Document AI como fallback. Default: `15` |
| `DOCUMENT_AI_PROCESSOR_ID` | ID de Google Document AI. **Sigue siendo obligatorio**: Document AI quedó como fallback del flujo multimodal |

### 🔗 Integración Externa REST (Opcional)

El sistema permite despachar automáticamente los resultados en tiempo real a una API REST externa una vez finalizado el procesamiento (`IA_OK` o `EXCEL_OK`). El servicio gestiona automáticamente la autenticación Bearer y la renovación de tokens.

| Variable | Descripción |
| :--- | :--- |
| `INTEGRATION_AUTH_URL` | URL para obtener el Bearer token (POST) |
| `INTEGRATION_AUTH_PAYLOAD` | JSON payload de credenciales |
| `INTEGRATION_DATA_URL` | URL destino donde se envía el JSON procesado |

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

**Auto-Recuperación (Resilience):**
_(Si un contenedor crashea abruptamente o se reinicia la aplicación, el backend cuenta con un mecanismo de resiliencia leyendo los estados PostgreSQL para re-encolar a Redis los archivos olvidados en estados `EN_COLA_X`)._

**2. Endpoints Disponibles:**
El servicio expone un Endpoint analítico de progreso que soporta filtrado dinámico para integraciones Frontend:
`GET /documents?page=1&limit=50&state=IA_OK&startDate=2026-03-01...`
