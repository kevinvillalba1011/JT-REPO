import { parseValorEmbargo } from './valor-embargo.util';

describe('parseValorEmbargo', () => {
  it.each([
    ['16.000.000.00', 16000000],
    ['16.000.000,00', 16000000],
    ['16.000.000', 16000000],
    ['16000000', 16000000],
    ['$ 5.500.000.00', 5500000],
    ['1.500', 1500],
    ['1,5', 1],
    // Caso ambiguo documentado en el util: separador final de 1-2 dígitos
    // SIEMPRE se interpreta como decimal (se trunca), nunca como miles.
    ['1,50', 1],
    ['1.50', 1],
    ['', 0],
    [null, 0],
    [16000000, 16000000],
    [1600.99, 1600],
  ])('parseValorEmbargo(%p) === %p', (input, expected) => {
    expect(parseValorEmbargo(input)).toBe(expected);
  });
});
