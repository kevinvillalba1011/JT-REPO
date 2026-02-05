# API Test – Document AI + Gemini 2.5 Flash Lite

Proyecto NestJS con **3 rutas de prueba**:

1. **OCR** – Sube un archivo → **Google Document AI** devuelve el texto extraído.
2. **Clasificación** – Envías texto → **Gemini 2.5 Flash Lite** indica si es cliente (dato para saber si es cliente).
3. **Extracción** – Envías texto → **Gemini 2.5 Flash Lite** extrae datos estructurados (JSON).

## Requisitos

Para correr el proyecto necesitas tener instalado:

| Requisito   | Versión recomendada | Notas |
|------------|----------------------|--------|
| **Node.js** | 18.x o 20.x (LTS) | [Descargar](https://nodejs.org/) |
| **pnpm**   | 8.x o superior      | Gestor de paquetes. Instalar: `npm install -g pnpm` |
| **Nest CLI** | (opcional)       | Se instala como dependencia de desarrollo con `pnpm install`; los scripts `nest build` y `nest start` usan el del proyecto. |

Comprobar instalación:

```bash
node -v    # v18.x o v20.x
pnpm -v    # 8.x o superior
```

Si prefieres **npm** en lugar de pnpm, puedes usar `npm install` y `npm run start:dev` (el proyecto no define `package-lock.json`, pero npm funciona igual).

## Instalación

```bash
pnpm install
```

## Variables de entorno

Copia `.env.example` a `.env` y configura:

- **Document AI (OCR):** `GCP_PROJECT_ID`, `GCP_LOCATION`, `DOCUMENT_AI_PROCESSOR_ID`, y `GOOGLE_APPLICATION_CREDENTIALS` (ruta al JSON de la cuenta de servicio de GCP).
- **Gemini:** `GEMINI_API_KEY` (API key de Google AI Studio).

## Ejecutar

```bash
pnpm run start:dev
```

App: `http://localhost:3000`  
Swagger: `http://localhost:3000/api`

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/test/ocr` | **Probar OCR.** Body: `multipart/form-data` con campo `file`. Respuesta: `{ success, text }` (texto de Document AI). |
| POST | `/test/clasificacion` | **Probar clasificación.** Body: `{ "text": "..." }`. Respuesta: `{ success, esCliente, razon }` (Gemini 2.5 Flash Lite). |
| POST | `/test/extraccion` | **Probar extracción.** Body: `{ "text": "..." }`. Respuesta: `{ success, data }` (JSON extraído por Gemini 2.5 Flash Lite). |

## Estructura

```
src/
├── main.ts
├── app.module.ts
├── test/
│   └── test.controller.ts    # 3 rutas: ocr, clasificacion, extraccion
├── document-ai/
│   └── document-ai.service.ts # OCR con Google Document AI
└── gemini/
    └── gemini.service.ts      # Clasificación y extracción con Gemini 2.5 Flash Lite
```
