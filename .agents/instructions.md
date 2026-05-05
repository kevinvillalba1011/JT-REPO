# Project Rules & Guidelines - JT-REPO

Este documento contiene las reglas mandatorias para cualquier agente de IA o desarrollador que trabaje en este repositorio.

## 🗄️ Database Management (Prisma)
- **Schema First**: Todos los cambios de estructura deben iniciarse en `schema.prisma`.
- **No Direct Migrations**: Está prohibido el uso de `npx prisma migrate dev` para entornos de producción.
- **Manual SQL Flow**: 
    1. Modificar `schema.prisma`.
    2. Generar script SQL usando: `npx prisma migrate diff --from-schema-datamodel schema.prisma --to-schema-datamodel schema.prisma --script > migration.sql`.
    3. Aplicar el SQL manualmente en la DB.
    4. Ejecutar `npx prisma generate` para sincronizar el cliente.

## 🛠️ Development Standards
- **Linting**: Es obligatorio ejecutar `npm run lint` después de cualquier modificación de código. No se deben dejar errores de lint pendientes.
- **Path Aliases**: Usar siempre alias de ruta `@/*` para imports internos (configurado como `src/*`).
- **Memory Safety**: Para el procesamiento de archivos masivos (Excel/CSV), usar siempre flujos (Streams) con la librería `exceljs` para evitar desbordamientos de memoria.

## 🚀 Business Logic
- **Excel/CSV Bypass**: Todos los archivos `.xlsx`, `.xls` y `.csv` deben ser interceptados para carga directa a la base de datos, omitiendo el paso por OCR o Modelos de IA (Gemini).
- **Idempotency**: Al procesar archivos masivos, siempre limpiar registros previos asociados al nombre del archivo para permitir reintentos seguros.
