# Sistema de Procesamiento de Documentos Asíncrono

Pipeline de procesamiento de documentos judiciales con NestJS, BullMQ (Redis), Prisma ORM (PostgreSQL), Google Document AI y Gemini (Multi-Tenant).

---

## 🚀 Guía de Inicio Rápido (Modo Desarrollo Local)

En este modo, la aplicación de NestJS correrá localmente en tu máquina (para un desarrollo ágil) mientras que los servicios pesados de infraestructura (Postgres, Redis, FTP) correrán en contenedores de Docker.

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
docker-compose up -d db redis ftp-server
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

**2. Creas una Migración de Base de Datos:**  
No utilices `db push` para producción. Para dejar registro de tu cambio de estructura de manera formal, genera un archivo de migración SQL usando el siguiente comando:

```bash
npx prisma migrate dev --name describe_tu_cambio
```

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

## 📂 Modos de Operación y Arquitectura de Archivos

El sistema soporta tres estrategias controladas por la variable `GLOBAL_MODE`. Esto dicta desde dónde absorbe los documentos iniciales, de dónde consume el listado maestro de clientes (`clients.csv`), y hacia dónde despacha el reporte diario a las 23:00.

### 1. Modo LOCAL (`GLOBAL_MODE=LOCAL`)
Estrategia ideal para pruebas y servidores locales. Todo sucede dentro de la carpeta raíz aislada de trabajo autogenerada (`./local/`).

- **Base de Clientes:** Si subes clientes nuevos, debes actualizar y reemplazar el archivo local en `./local/data/clients.csv`. *(El sistema lo relee y refresca en caliente automáticamente cada 1 hora)*.
- **Ingesta de Oficios:** Los archivos crudos a analizar (PDF, JPG, XLS, CSV) deben colocarse en `./local/ftp/` (Simulando un host físico de entrada). La recolección es **recursiva**, el bot penetrará todas las sub-carpetas infinitamente buscando archivos válidos.
- **Reportes Finales:** Finalizada la IA, tu CSV limpio segmentado por campos se guardará con la fecha de hoy dentro de `./local/reports/`.
- **Archivos Especiales:** Los archivos duplicados (MD5 existente) se mueven a `./local/duplicates` con un timestamp. Los archivos con formato no soportado (ej. `.docx`, `.zip`) se mueven a `./local/unsupported`.
- *(Rutas de Transición)*: `local/in/`, `local/ocr/`, `local/done/` son internas del pipeline del sistema (Movit). No colocar ni tocar archivos allí para evitar disrumpir transacciones.

### 2. Modo FTP (`GLOBAL_MODE=FTP`)
Pensado para infraestructuras on-premise Legacy (`FTP_HOST`, `FTP_PORT`, `FTP_USER...`).

> **💡 Nota sobre entorno local/Docker:** Debido a la configuración en `docker-compose.yml`, el contenedor del FTP (`jt-ftp`) tiene montado un volumen local. Todo lo que coloques en la carpeta externa `./ftp/` de tu PC aparecerá virtualmente dentro de `/ftp/testuser` en el contenedor. Por lo que, para simular y probar este flujo entero sin servidor remoto, es suficiente con arrojar allí los oficios en tu explorador de archivos.

- **Base de Clientes:** Descarga cada hora el listado remoto asumiendo la raíz del FTP `/clients.csv`.
- **Ingesta de Oficios:** Consume robóticamente los archivos explorando de forma **recursiva profunda (DFS)** todas las carpetas dentro del directorio `/source` del host remoto FTP y limpia el host dejándolos en el pipeline unificado de la BD. 
- **Reportes Finales:** Empuja el archivo de salidos finales CSV a la carpeta `/reports` de tu FTP externo. 

### 3. Modo GMAIL (`GLOBAL_MODE=GMAIL`)
Gestión remota conectada a flujos judiciales vivos. Requiere `GMAIL_USER` y `GMAIL_APP_PASSWORD` en `.env`. *(Activar Contraseñas de Apps Nativas de Google, Login Tradicional no funciona en el bot).*

- **Base de Clientes:** Sigue leyendo nativamente del archivo físico local de la app en `./local/data/clients.csv`.
- **Ingesta de Oficios:** Vía IMAP, audita constantemente la bandeja de entrada, aislando los Emails, validando sus metadatos y encolando la lectura de todos sus Archivos Adjuntos.
- **Reportes Finales:** Vía SMTP, un Bot re-envía por email el CSV del reporte final como correo saliente a la casilla origen.

---

## ⚙️ Variables de Entorno Clave

| Variable                   | Descripción                                      |
| -------------------------- | ------------------------------------------------ |
| `GLOBAL_MODE`              | `LOCAL` \| `FTP` \| `GMAIL` — Fuente del Sistema |
| `TENANT_PROFILE`           | Controla esquema Multi-Tenant (ej. `default`)    |
| `DATABASE_URL`             | URL de conexión a PostgreSQL                     |
| `IN_PATH`                  | Carpeta de entrada (`./local/in`)                |
| `OCR_PATH`                 | Carpeta intermedia OCR (`./local/ocr`)           |
| `DONE_PATH`                | Carpeta de procesados (`./local/done`)           |
| `UNSUPPORTED_PATH`         | Carpeta de no admitidos (`./local/unsupported`)  |
| `DUPLICATES_PATH`          | Carpeta de duplicados (`./local/duplicates`)     |
| `GEMINI_API_KEY`           | API Key provista por Google AI Studio            |
| `DOCUMENT_AI_PROCESSOR_ID` | ID extraído de Google Document AI                |

---

## 🔄 Pipeline de Estados & APIs

**1. Flujo de Extracción y Modelado:**

```text
[Cron Job de Ingesta] (Escaneo recursivo local, FTP o IMAP)
          ↓
     EN_COLA_OCR 
 (Orquestador de Estrategias)
          │
          ├─► Archivo .PDF / .JPG / .PNG 
          │      └─► (DocumentAiStrategy) -> Llama a Google Document API
          │
          ├─► Archivo .XLS / .XLSX / .CSV 
          │      └─► (ExcelStrategy) -> Bypass. Convierte hojas a texto estructurado.
          │
          ▼
   PROCESANDO_OCR 
          │
          ├─► ERRORES POSIBLES:
          │      • OCR_UNREADABLE (Imagen borrosa, escaneo en blanco)
          │      • ERROR_OCR (Excel corrupto con contraseña, falla de Red GCP)
          │      • FORMATO_NO_SOPORTADO (El archivo se mueve a local/unsupported)
          │
          ▼
   EN_COLA_MODELO (Se inyecta el Texto puro a Gemini)
          │
          ├─► ERRORES POSIBLES:
          │      • MODEL_ERROR (Gemini alucinó o retornó un JSON cortado/incompleto)
          │
          ▼
        IA_OK (Éxito. Archivo listo para exportarse a las 23:00)
```

**Auto-Recuperación (Resilience):**
_(Si un contenedor crashea abruptamente o se reinicia la aplicación, el backend cuenta con un mecanismo de resiliencia leyendo los estados PostgreSQL para re-encolar a Redis los archivos olvidados en estados `EN_COLA_X`)._

**2. Endpoints Disponibles:**
El servicio expone un Endpoint analítico de progreso que soporta filtrado dinámico para integraciones Frontend:
`GET /documents?page=1&limit=50&state=IA_OK&startDate=2026-03-01...`
