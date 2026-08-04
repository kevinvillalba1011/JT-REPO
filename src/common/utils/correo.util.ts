/**
 * Saneamiento de `ente.correosElectronicos`.
 *
 * El OCR y el copiado desde PDF arrastran basura pegada a la dirección:
 * viñetas y guiones largos (`•`, `–`, `»`), prefijos `mailto:` o `Correo:`,
 * delimitadores `<...>`, saltos de línea, espacios de ancho cero y signos de
 * puntuación finales (`.`, `,`, `;`, `)`). El prompt ya pide direcciones
 * limpias, pero el modelo no siempre las entrega así y esa basura terminaba
 * viajando al sistema externo y al reporte.
 *
 * En vez de enumerar qué caracteres quitar, se hace al revés: se BUSCA dentro
 * del texto la subcadena con forma de correo y se descarta todo lo demás. Como
 * ningún carácter de relleno (espacios, invisibles, viñetas, `<`, `>`) entra en
 * las clases del patrón, cualquier basura que rodee o separe direcciones queda
 * fuera por construcción, y dos correos pegados por un salto de línea se
 * reconocen como dos coincidencias distintas. Lo que no contenga un correo
 * reconocible se elimina del array en lugar de dejarlo a medio limpiar.
 */

/**
 * Patrón de dirección de correo. Deliberadamente conservador: exige TLD
 * alfabético de 2+ caracteres, así se descartan cosas como `algo@algo` o
 * `x@1.2` que el OCR produce al partir mal una línea.
 */
const CORREO_REGEX =
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

/**
 * Extrae y normaliza los correos contenidos en un valor suelto. Un mismo
 * elemento puede traer varias direcciones pegadas (ej. `"a@x.com;b@y.com"`),
 * así que devuelve una lista.
 */
function extraerCorreos(valor: unknown): string[] {
  if (typeof valor !== 'string') {
    return [];
  }

  const encontrados = valor.match(CORREO_REGEX) ?? [];

  return encontrados.map((correo) =>
    // Un punto final suele ser el punto de la frase, no parte del dominio.
    correo.toLowerCase().replace(/\.+$/, ''),
  );
}

/**
 * Sanea el array completo: extrae las direcciones válidas de cada elemento,
 * las pasa a minúsculas, quita duplicados y descarta lo que no sea un correo.
 * Devuelve `[]` cuando no queda ninguno (el fallback del contrato para arrays).
 */
export function normalizarCorreos(valores: unknown): string[] {
  const lista = Array.isArray(valores) ? valores : [valores];

  const correos = lista.flatMap((valor) => extraerCorreos(valor));

  return [...new Set(correos)];
}
