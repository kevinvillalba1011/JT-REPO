# Diagrama de Flujo Paso a Paso (Modo FTP)

A continuación tienes el ciclo de vida exacto de un documento cuando el sistema está en `GLOBAL_MODE=FTP`. Todo el proceso ocurre de manera automatizada de principio a fin.

```mermaid
flowchart TD
    classDef time fill:#5b5b5b,stroke:#fff,stroke-width:2px,color:#fff;
    classDef ftp fill:#F4B400,stroke:#fff,stroke-width:2px,color:#111;
    classDef folder fill:#4876B7,stroke:#fff,stroke-width:2px,color:#fff;
    classDef process fill:#2E8B57,stroke:#fff,stroke-width:2px,color:#fff;
    classDef decision fill:#8B0000,stroke:#fff,stroke-width:2px,color:#fff;
    classDef ai fill:#673AB7,stroke:#fff,stroke-width:2px,color:#fff;

    Start((⏱️ Cron: Inicia<br>cada 15 Segs)):::time
    
    %% --- PASO 1: EXTRACCIÓN FTP ---
    Start --> ConnectFTP[📡 Conexión a FTP\nAutentica usuario y puerto]:::ftp
    ConnectFTP --> ScanFTP[🔎 Escaneo Recursivo\nBusca PDFs/Imágenes en servidor FTP]:::ftp
    ScanFTP --> Download[⬇️ Descarga y Renombrado\nAñade timestamp ej: 171166_doc.pdf]:::ftp
    Download --> InFolder[(📁 Carpeta local/in/ )]:::folder

    %% --- PASO 2: VALIDACIÓN ---
    InDirProcess[⚙️ Extracción\nLee todos los archivos descargados]:::process
    InFolder --> InDirProcess
    InDirProcess --> Hash[#️⃣ Calcula Firma Única MD5 del PDF]:::process
    Hash --> CheckDB{❓ ¿Firma existe en Base de Datos PostgreSQL?}:::decision
    
    CheckDB -- ❌ SÍ (Duplicado) --> Borrar[🗑️ Borra el archivo físico de local/in/]:::decision
    CheckDB -- ✔️ NO (Nuevo) --> Registra[📝 Crea Documento en BD\nEstado: EN_COLA_OCR]:::process
    
    %% --- PASO 3: COLA OCR ---
    Registra --> ColaOCR[📥 Añade a Cola Redis: cola_ocr]:::process
    ColaOCR --> WorkOCR[🤖 OCR Worker Toma el Job]:::process
    WorkOCR --> SendAI1[📤 Envía PDF en Base64 a\nGoogle Document AI]:::ai
    SendAI1 --> ReceiveAI1[📖 Retorna todo el\ntexto extraído del documento]:::ai
    ReceiveAI1 --> MoveOCRFolder[(📁 Mueve PDF a local/ocr/ )]:::folder
    MoveOCRFolder --> UpdateDB1[📝 Actualiza DB a\nEstado: EN_COLA_MODELO]:::process

    %% --- PASO 4: COLA MODELO (GEMINI) ---
    UpdateDB1 --> ColaModel[📥 Añade a Cola Redis: cola_modelo\n(Pasando el texto extraído)]:::process
    ColaModel --> WorkModel[🤖 Model Worker Toma el Job]:::process
    WorkModel --> SendAI2[📤 Envía Texto OCR + Prompt JSON a\nGemini API Flash/Pro]:::ai
    SendAI2 --> ReceiveAI2[🧠 Gemini devuelve el JSON\nestructurado puro]:::ai
    ReceiveAI2 --> MoveDoneFolder[(📁 Mueve PDF a destino final:\nlocal/done/ )]:::folder
    MoveDoneFolder --> SaveDB[✅ Guarda el JSON intacto en DB\nEstado: IA_OK]:::process

    SaveDB --> Fin(((🏁 Misión Cumplida)))
```

### 📋 Resumen Literario del Flujo
1. **El Reloj:** Cada 15 segundos tu aplicación se despierta.
2. **La Pesca (FTP):** Va al servidor FTP remoto, se conecta con las credenciales, escanea las carpetas y descarga cualquier documento permitido, añadiéndole un prefijo de número al nombre para que nunca haya colisión de nombres. Los archivos caen en el buche local (`./local/in/`).
3. **El Filtro (MD5):** A cada archivo descargado se le saca la huella digital (MD5). Va y le pregunta a PostgreSQL si esa huella ya existe. Si la respuesta es sí, lo mueve a `./local/duplicates` con un prefijo de tiempo para auditoría (ahorrando costos de API). Si es nuevo, lo bautiza en la BD y lo empuja a la primera cola.
4. **El Validador (OCR):** Si el archivo llega al OCR pero su extensión no es soportada (ej: .docx, .zip), se mueve automáticamente a `./local/unsupported` con el estado `FORMATO_NO_SOPORTADO`.

4. **La Lectura (OCR):** El primer procesador virtual (Worker) agarra el archivo, se lo manda enterito en Base64 a Document AI de Google, recibe de regreso toda la "sopa de letras" extraída, mueve el archivo físico a la carpeta intermedia (`./local/ocr/`) y empuja este texto a la segunda cola.
5. **El Cerebro (Gemini):** El segundo procesador virtual agarra el texto masticado, le pega tus reglas estrictas de extracción (del archivo `bbva.profile.ts`) y se lo manda a Gemini.
6. **El Archivo (Final):** Gemini escupe el JSON puro de los demandantes, fechas y valores. Ese JSON se inyecta impecable a PostgreSQL (Marcado como `IA_OK`), y el archivo PDF descansa para siempre en tu carpeta `./local/done/`.
