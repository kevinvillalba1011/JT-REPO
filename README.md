# Sistema de Procesamiento de Documentos Asíncrono

Pipeline de procesamiento de documentos judiciales con NestJS, BullMQ (Redis), TypeORM (PostgreSQL), Google Document AI y Gemini.

---

## ▶️ Modo 1 — Desarrollo Local (app en local, infra en Docker)

La app corre con `pnpm run start:dev` y los servicios de infraestructura (Postgres, Redis, FTP) corren en Docker.

### 1. Configurar variables de entorno

```bash
copy .env.example .env
```

Asegúrate de que en `.env` estén estos valores para apuntar a los contenedores:

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/jt_documents
REDIS_HOST=localhost
REDIS_PORT=6379
```

### 2. Levantar solo la infraestructura

```bash
docker compose up -d db redis ftp-server
```

### 3. Verificar que los servicios estén activos

```bash
docker compose ps
```

### 4. Crear tablas con Prisma

```bash
npx prisma migrate dev --name init
```

Genera el cliente de TypeScript:

```bash
npx prisma generate
```

### 5. Iniciar la app

```bash
pnpm install       # solo la primera vez
pnpm run start:dev
```

La app valida y crea automáticamente la estructura de carpetas `./local/` al arrancar.

---

## 🐳 Modo 2 — Full Docker (todo en contenedores)

Requiere tener un `Dockerfile` en la raíz. Todos los servicios —app incluida— corren en contenedores.

### 1. Configurar variables de entorno

```bash
copy .env.example .env
```

Las credenciales de GCP y Gemini deben estar en `.env` para que el `docker compose` las inyecte:

```env
GCP_PROJECT_ID=tu-proyecto
GCP_LOCATION=us
DOCUMENT_AI_PROCESSOR_ID=tu-processor-id
GEMINI_API_KEY=tu-api-key
```

El archivo de cuenta de servicio debe estar en `./secrets/key.json`.

### 2. Construir y levantar todo

```bash
docker compose up -d --build
```

### 3. Ver logs de la app

```bash
docker compose logs -f app
```

### 4. Reiniciar solo la app (tras cambios)

```bash
docker compose up -d --build app
```

### 5. Apagar todo

```bash
docker compose down
```

Para eliminar también los volúmenes de datos (⚠️ borra la BD):

```bash
docker compose down -v
```

---

## 🗂️ Estructura de carpetas `local/`

Creadas automáticamente por `FolderInitializerService` al arrancar:

| Carpeta         | Uso                                              |
| --------------- | ------------------------------------------------ |
| `local/in`      | Entrada de documentos (ingesta → OCR)            |
| `local/ocr`     | Archivos post-OCR en espera de análisis IA       |
| `local/done`    | Archivos finalizados correctamente               |
| `local/ftp`     | Fuente local simulada (solo `GLOBAL_MODE=LOCAL`) |
| `local/data`    | CSV de clientes (`clients.csv`)                  |
| `local/reports` | Reportes CSV generados                           |

---

## ⚙️ Variables de entorno clave

| Variable                            | Descripción                                            |
| ----------------------------------- | ------------------------------------------------------ |
| `GLOBAL_MODE`                       | `LOCAL` \| `FTP` \| `GMAIL` — controla todo el sistema |
| `DATABASE_URL`                      | URL de conexión a PostgreSQL                           |
| `REDIS_HOST` / `REDIS_PORT`         | Conexión a Redis                                       |
| `IN_PATH`                           | Carpeta de entrada (`./local/in`)                      |
| `OCR_PATH`                          | Carpeta intermedia OCR (`./local/ocr`)                 |
| `DONE_PATH`                         | Carpeta de archivos procesados (`./local/done`)        |
| `LOCAL_SOURCE_PATH`                 | Origen de archivos en modo LOCAL (`./local/ftp`)       |
| `LOCAL_DATA_PATH`                   | Carpeta del CSV de clientes (`./local/data`)           |
| `LOCAL_REPORTS_PATH`                | Destino de reportes en modo LOCAL (`./local/reports`)  |
| `GEMINI_API_KEY`                    | API Key de Google AI Studio                            |
| `GCP_PROJECT_ID`                    | ID del proyecto GCP                                    |
| `DOCUMENT_AI_PROCESSOR_ID`          | ID del procesador Document AI                          |
| `GOOGLE_APPLICATION_CREDENTIALS`    | Ruta al JSON de cuenta de servicio                     |
| `ALLOWED_EXTENSIONS`                | Extensiones permitidas (ej: `.pdf,.jpg,.png`)          |
| `CRON_EXTRACTION_SCHEDULE`          | Expresión cron de extracción (ej: `*/15 * * * * *`)    |
| `FTP_HOST` / `FTP_PORT`             | Servidor FTP (modo FTP)                                |
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` | Credenciales Gmail (modo GMAIL)                        |

---

## 🔄 Pipeline de estados

```
EN_COLA_OCR → PROCESANDO_OCR → EN_COLA_MODELO → IA_OK
                                       ↓
                            OCR_UNREADABLE / MODEL_ERROR
```

Al reiniciar, el sistema recupera automáticamente los documentos en estados intermedios y los vuelve a encolar (siempre que el archivo físico exista).

---

## 👥 CSV de Clientes

Archivo: `local/data/clients.csv`  
El número de identificación debe estar en la primera columna:

```
# comentarios ignorados
12345678
98765432
```

- **Cliente registrado** → reporte con **34 campos** completos
- **No registrado** → reporte con **7 campos** básicos (privacidad)
