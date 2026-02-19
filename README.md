# Sistema de Procesamiento de Documentos Asíncrono

Este proyecto implementa un pipeline de procesamiento de documentos utilizando NestJS, BullMQ (Redis) y TypeORM (en el prompt de implementación).

## Estructura de Carpetas (`local/`)

El sistema utiliza el directorio `./local` para toda la persistencia de archivos de ejecución. Se divide en dos categorías:

### 1. Rutas Internas del Sistema (Siempre usadas)

Son fundamentales para el pipeline de BullMQ:

- `local/in`: Entrada de documentos para OCR.
- `local/ocr`: Documentos con texto extraído, en espera de procesamiento por IA.
- `local/done`: Documentos finalizados con éxito.

### 2. Rutas de Modo Local (Configurables)

Se activan principalmente cuando `GLOBAL_MODE=LOCAL`:

- `local/ftp`: Directorio fuente para simular o realizar extracción local.
- `local/data`: Contiene el archivo `clients.csv` para validación de clientes.
- `local/reports`: Carpeta de salida para los reportes generados.

---

## 🚀 Guía de Inicio Rápido

1.  **Configuración**: Copia `.env.example` a `.env` y ajusta `GLOBAL_MODE`.
2.  **Infraestructura**: `docker-compose up -d`.
3.  **Inicio**: Al arrancar, el `FolderInitializerService` validará y creará toda la estructura de `/local`.

---

## Funcionamiento del Pipeline

El sistema se rige por la variable `GLOBAL_MODE` (LOCAL, FTP, GMAIL):

1.  **Extracción**: Mueve archivos a `local/in`.
2.  **OCR**: Extrae texto y mueve el archivo a `local/ocr`.
3.  **IA (Gemini)**: Analiza el texto, valida contra clientes y mueve el archivo final a `local/done`.
4.  **Validación de Clientes**: Si el demandado NO es un cliente registrado en el CSV de `local/data`, el JSON se recorta.
5.  **Reporte**: Genera CSV en `local/reports` (o lo sube a FTP/Email según el modo).
