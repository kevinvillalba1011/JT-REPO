# Campos de un oficio de embargo (BBVA) y relación con juzgados

Documento de referencia para el endpoint `POST /extraction/manual` (perfil `bbva`) y para el portal legado EmbargosWebJTC. Fuente de los campos de negocio: `campos_por_tipo_documento_3.json`. Fuente del modelo de datos del portal: entidades `Ref*` del EJB (`EmbargosWebJTC-EJB`).

## 1. Qué exige el negocio por tipo de oficio

El oficio puede ser EMBARGO, DESEMBARGO o ALCANCE. Un solo schema de Gemini cubre los tres; el campo `tipoOficio` indica cuáles aplican. Lo que no aplica o no se encuentra se devuelve como `"0"`.

### EMBARGO (34 campos)

| # | Campo | Formato |
|---|-------|---------|
| 1 | NO ID DEMANDADO | Numérico Máximo 12 Caracteres, sin puntos ni comas |
| 2 | FECHA Y HORA RECEPCIÓN CORREO | Fecha DD/MM/AAAA y Hora HH:MM:SS |
| 3 | FECHA Y HORA PROCESAMIENTO OFICIO | Fecha DD/MM/AAAA y Hora HH:MM:SS |
| 4 | TIPO DE PROCESO | Alfabético - Todo en Mayúsculas |
| 5 | TIPO OFICIO | Alfabético - Todo en Mayúsculas |
| 6 | NOMBRE OFICIO INICIAL | Alfanumérico Máximo 40 Caracteres - Todo en Mayúsculas |
| 7 | NOMBRE OFICIO FINAL | Alfanumérico Máximo 40 Caracteres |
| 8 | VALOR EMBARGO | Numérico Máximo 13 Caracteres |
| 9 | NO. DE RADICADO | Numérico Máximo 23 Caracteres |
| 10 | CUENTA BANCO AGRARIO / BANCO DEPÓSITO JUDICIAL | Numérico Máximo 12 Caracteres |
| 11 | NOMBRE BANCO DEPÓSITO JUDICIAL | Alfanumérico Máximo 20 Caracteres - Todo en Mayúsculas |
| 12 | NOMBRE DEL SECRETARIO O FUNCIONARIO ENTE EMBARGANTE | Alfanumérico Máximo 25 Caracteres - Todo en Mayúsculas |
| 13 | CODIGO DE ALCANCE | Alfanumérico - Todo en Mayúsculas |
| 14 | CODIGO DE APLICACIÓN | Alfanumérico Máximo 2 |
| 15 | TIPO LIMITE DE INEMBARGABILIDAD | Alfabético - Todo en Mayúsculas |
| 16 | TIPO DE APLICACIÓN | Alfabético - Todo en Mayúsculas |
| 17 | TIPO RESPUESTA | Alfabético - Todo en Mayúsculas |
| 18 | TIPO ID DEMANDADO | Alfabético - Todo en Mayúsculas |
| 19 | NOMBRE DEMANDADO | Alfanumérico Máximo 25 Caracteres - Todo en Mayúsculas |
| 20 | TIPO ID DEMANDANTE | Alfabético - Texto 1 Carácter |
| 21 | NO ID DEMANDANTE | Numérico Máximo 12 Caracteres |
| 22 | NOMBRE DEMANDANTE | Alfanumérico Máximo 25 Caracteres - Todo en Mayúsculas |
| 23 | NOMBRE DEL ENTE EMBARGANTE | Alfanumérico Máximo 40 Caracteres - Todo en Mayúsculas |
| 24 | CIUDAD | Alfabético - Todo en Mayúsculas |
| 25 | CORREOS ELECTRÓNICOS | Alfanumérico (formato email) |
| 26 | LINK DE COLOCACIÓN DE RESPUESTA | Alfabético - Todo en Mayúsculas |
| 27 | PRODUCTOS A EMBARGAR | Alfabético - Todo en Mayúsculas |
| 28 | SI ES CTA ESPECÍFICA, NO. DE CTA | Numérico Máximo 12 Caracteres |
| 29 | PORCENTAJE A EMBARGAR | Numérico |
| 30 | PRODUCTOS A FUTURO | Alfabético - Texto |
| 33 | TIPO DOCUMENTO RECIBIDO EN EMAIL | Alfabético - Todo en Mayúsculas |
| 34 | TIPO DE REQUERIMIENTO | Alfabético - Todo en Mayúsculas |
| 35 | TIPO DE REQUERIMIENTO INEMBARGABLE | Alfabético - Todo en Mayúsculas |
| 36 | OBSERVACIONES | Alfabético - Todo en Mayúsculas |

### DESEMBARGO (13 campos)

| # | Campo | Formato |
|---|-------|---------|
| 1 | NO ID DEMANDADO | Numérico Máximo 12 Caracteres, sin puntos ni comas |
| 2 | FECHA Y HORA RECEPCIÓN CORREO | Fecha DD/MM/AAAA y Hora HH:MM:SS |
| 3 | FECHA Y HORA PROCESAMIENTO OFICIO | Fecha DD/MM/AAAA y Hora HH:MM:SS |
| 4 | TIPO DE PROCESO | Alfabético - Todo en Mayúsculas |
| 5 | TIPO OFICIO | Alfabético - Todo en Mayúsculas |
| 6 | NOMBRE OFICIO INICIAL | Alfanumérico Máximo 40 Caracteres - Todo en Mayúsculas |
| 7 | NOMBRE OFICIO FINAL | Alfanumérico Máximo 40 Caracteres |
| 9 | NO. DE RADICADO | Numérico Máximo 23 Caracteres |
| 18 | TIPO ID DEMANDADO | Alfabético - Todo en Mayúsculas |
| 19 | NOMBRE DEMANDADO | Alfanumérico Máximo 25 Caracteres - Todo en Mayúsculas |
| 31 | OFICIO DE EMBARGO A DESEMBARGAR | Alfanumérico Máximo 40 Caracteres |
| 32 | RADICADO OFICIO DE EMBARGO A DESEMBARGAR | Numérico Máximo 23 Caracteres |
| 33 | TIPO DOCUMENTO RECIBIDO EN EMAIL | Alfabético - Todo en Mayúsculas |

### ALCANCE (24 campos)

| # | Campo | Formato |
|---|-------|---------|
| 1 | NO ID DEMANDADO | Numérico Máximo 12 Caracteres, sin puntos ni comas |
| 2 | FECHA Y HORA RECEPCIÓN CORREO | Fecha DD/MM/AAAA y Hora HH:MM:SS |
| 3 | FECHA Y HORA PROCESAMIENTO OFICIO | Fecha DD/MM/AAAA y Hora HH:MM:SS |
| 4 | TIPO DE PROCESO | Alfabético - Todo en Mayúsculas |
| 5 | TIPO OFICIO | Alfabético - Todo en Mayúsculas |
| 6 | NOMBRE OFICIO INICIAL | Alfanumérico Máximo 40 Caracteres - Todo en Mayúsculas |
| 7 | NOMBRE OFICIO FINAL | Alfanumérico Máximo 40 Caracteres |
| 8 | VALOR EMBARGO | Numérico Máximo 13 Caracteres |
| 9 | NO. DE RADICADO | Numérico Máximo 23 Caracteres |
| 10 | CUENTA BANCO AGRARIO / BANCO DEPÓSITO JUDICIAL | Numérico Máximo 12 Caracteres |
| 11 | NOMBRE BANCO DEPÓSITO JUDICIAL | Alfanumérico Máximo 20 Caracteres - Todo en Mayúsculas |
| 12 | NOMBRE DEL SECRETARIO O FUNCIONARIO ENTE EMBARGANTE | Alfanumérico Máximo 25 Caracteres - Todo en Mayúsculas |
| 16 | TIPO DE APLICACIÓN | Alfabético - Todo en Mayúsculas |
| 17 | TIPO RESPUESTA | Alfabético - Todo en Mayúsculas |
| 18 | TIPO ID DEMANDADO | Alfabético - Todo en Mayúsculas |
| 19 | NOMBRE DEMANDADO | Alfanumérico Máximo 25 Caracteres - Todo en Mayúsculas |
| 22 | NOMBRE DEMANDANTE | Alfanumérico Máximo 25 Caracteres - Todo en Mayúsculas |
| 23 | NOMBRE DEL ENTE EMBARGANTE | Alfanumérico Máximo 40 Caracteres - Todo en Mayúsculas |
| 24 | CIUDAD | Alfabético - Todo en Mayúsculas |
| 25 | CORREOS ELECTRÓNICOS | Alfanumérico (formato email) |
| 26 | LINK DE COLOCACIÓN DE RESPUESTA | Alfabético - Todo en Mayúsculas |
| 33 | TIPO DOCUMENTO RECIBIDO EN EMAIL | Alfabético - Todo en Mayúsculas |
| 34 | TIPO DE REQUERIMIENTO | Alfabético - Todo en Mayúsculas |
| 36 | OBSERVACIONES | Alfabético - Todo en Mayúsculas |

Las descripciones completas (ejemplos, valores permitidos, reglas) están en el JSON.

## 2. Dónde guarda cada dato el portal legado

El portal captura primero el borrador y luego lo verifica por doble digitación (columnas `*_ver_*`). Tablas principales:

| Tabla | Qué guarda | Columnas clave |
|-------|-----------|----------------|
| `ref_embargo` | Cabecera del oficio | `emb_num_radicado` (23 posiciones), `emb_num_oficio`, `emb_fecha_oficio`, `emb_nombre_ente`, `codigo_interno_banco`, `codigo_deposito_judicial`, `emb_ctrl_coactivo`, `emb_nombre_funcionario`, `emb_cargo_funcionario` (solo coactivo), `emb_ciudad`, `emb_departamento`, `emb_direccion`, `emb_label`, `emb_es_desembargo` |
| `ref_demandados` | Un registro por demandado | `dem_tipo_id` (FK a `ref_tipo_id.ti_id`), `dem_num_id`, `dem_nombres`, `dem_apellidos`, `dem_valor_embargo`, `dem_nro_proceso` (solo coactivo), `dem_ver_*` |
| `ref_demandantes` | Un registro por demandante | `det_tipo_id`, `det_num_id`, `det_num_dv`, `det_nombres`, `det_ver_*` |
| `ref_cuentas_demandados` | Cuentas del demandado | Se llenan en una fase posterior (cruce con el banco), no en la captura del oficio |
| `lao_embargo` / `lao_demandados` / `lao_demandante` | Cola de lectura automática (LAO) antes de verificar | `procesado`, `ente`, `n_radicado`, `ruta_pdf`, `nombre_archivo` |
| `ref_control_embargos` | Labels (lotes del buzón) | `ref_label` debe existir para poder guardar |

### Mapeo campo del negocio → portal

| Campo negocio / IA | Campo del portal |
|--------------------|------------------|
| `noRadicado` | `ref_embargo.emb_num_radicado` |
| `nombreOficioInicial` | `ref_embargo.emb_num_oficio` |
| `fechaOficio` (DD/MM/AAAA) | `ref_embargo.emb_fecha_oficio` |
| `nombreEnteEmbargante` | `emb_nombre_ente` + `codigo_interno_banco` (ver sección 3) |
| `cargoFuncionario` / `nombreSecretarioFuncionario` | `emb_cargo_funcionario` / `emb_nombre_funcionario` (solo coactivo) |
| `cuentaBancoAgrarioDepositoJudicial` | `codigo_deposito_judicial` |
| `ciudad` | `emb_ciudad` (el portal lo toma del ente) |
| `demandados[]` (tipoId, numeroId, nombre) | una fila en `ref_demandados` por elemento |
| `demandantes[]` | filas en `ref_demandantes` (si el ente es coactivo, el demandante es el propio ente con su NIT) |
| `tipoOficio` | decide EMBARGO/DESEMBARGO (`emb_es_desembargo`) |
| `radicadoOficioEmbargoADesembargar` | en desembargos, radicado del embargo original; si el oficio no trae uno aparte se repite `noRadicado` |

### Tipo de identificación

Catálogo `ref_tipo_id` (`ti_id` → código): 1 CC, 2 CE, 4 TI, V PPT, A CD, 3 NJ (NIT), 5 PP, 6 NE, 7 SE, 8 SF, 9 NN. Letras que devuelve la IA: C→CC, E→CE, N→NJ, T→TI, P→PP.

## 3. Cómo se relaciona un oficio con el juzgado (ente)

**No hay llave foránea.** El catálogo es `ref_entes_judiciales`, cuya llave es `codigo_interno_banco`. El embargo guarda dos referencias sueltas:

- `ref_embargo.emb_nombre_ente`: el nombre del ente como texto, que debe coincidir con `ref_entes_judiciales.nombre_entidad`.
- `ref_embargo.codigo_interno_banco`: el código numérico del ente.

Columnas relevantes del catálogo:

| Columna | Uso |
|---------|-----|
| `nombre_entidad` | Nombre exacto con el que se busca y se muestra |
| `tipo` | `JUZGADO` = proceso judicial. Cualquier otro valor = coactivo (DIAN, alcaldías, etc.). Define `emb_ctrl_coactivo` |
| `codigo_interno_despacho` | Prefijo del radicado de 23 dígitos del despacho. Si el ente no es coactivo y el radicado está vacío, el portal lo usa como radicado inicial |
| `no_cuenta_judicial` | Cuenta de depósito judicial (Banco Agrario) del despacho |
| `municipio`, `departamento`, `direccion_despacho` | Se copian a ciudad, departamento y dirección del embargo |
| `nit`, `dv`, `tipoId` | Para ente coactivo: identificación del demandante |
| `correo`, `correo_ce`, `correo_reit` | Correos de respuesta |

Al elegir el ente en el portal (`consultarEnte`) se llenan automáticamente: departamento, ciudad, dirección, código interno del banco, bandera coactivo y, si es coactivo, el demandante con el NIT del ente.

### Cómo lo identifica hoy la lectura automática (IA vieja, sin Gemini)

1. Busca el nombre de un ente del catálogo dentro del texto del PDF.
2. Si no, busca por regex del nombre.
3. Si no, usa la ciudad y la tabla `entes_buscar_ia`.
4. Para juzgados, cruza la cuenta de depósito judicial del texto con el prefijo del radicado; esa pareja identifica el despacho.
5. Para coactivos, busca el NIT del ente en el texto.

### Cómo lo resuelve el botón "Rellenar datos (IA)"

La IA devuelve `nombreEnteEmbargante` como texto libre. El portal lo normaliza (sin tildes, mayúsculas) y lo busca en el catálogo: primero coincidencia exacta y, si no, coincidencia parcial **solo si es única**. Si no hay una única coincidencia, el ente queda sin llenar y el mensaje muestra lo que leyó la IA para que el operador lo escoja.

### Mejoras posibles para back-jt

- Devolver también `ciudad` y `cuentaBancoAgrarioDepositoJudicial` para desempatar entes con nombre parecido (ej. "Juzgado 1 Civil Municipal" en varias ciudades).
- Enviar el catálogo (o sus nombres) en el prompt para que Gemini escoja el nombre exacto.
- Usar la cuenta judicial y el prefijo del radicado, como hace la IA vieja, como segunda vía de identificación.

## 4. Requisitos para que el portal acepte el oficio

- Ente válido en el catálogo.
- Radicado de 23 posiciones (o generar la anomalía de radicado incompleto). En coactivo se captura número de proceso por demandado.
- Al menos un demandado con tipo e identificación válidos; el cliente se valida contra la base del banco.
- Label válido: el nombre del PDF hasta el primer `_` o `.` debe existir en `ref_control_embargos.ref_label`.
- Los datos de la pantalla 1 se copian a la de verificación; el operador solo revisa.
