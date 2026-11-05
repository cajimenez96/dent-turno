// Numeración dental FDI de dos dígitos: el primero es el cuadrante, el segundo la posición (1 = incisivo central).
// Permanentes: cuadrantes 1 a 4, posiciones 1 a 8. Temporarias: cuadrantes 5 a 8, posiciones 1 a 5.

export const CARAS = ["M", "D", "V", "L", "O"] as const;
export type Cara = (typeof CARAS)[number];

export const NOMBRE_CARA: Record<Cara, string> = {
  M: "Mesial",
  D: "Distal",
  V: "Vestibular",
  L: "Lingual o palatina",
  O: "Oclusal o incisal",
};

const rango = (cuadrante: number, hasta: number) => Array.from({ length: hasta }, (_, i) => `${cuadrante}${i + 1}`);

export const PERMANENTES = [1, 2, 3, 4].flatMap((c) => rango(c, 8));
export const TEMPORARIAS = [5, 6, 7, 8].flatMap((c) => rango(c, 5));
export const PIEZAS_VALIDAS = new Set([...PERMANENTES, ...TEMPORARIAS]);

export const esPiezaFdi = (v: string) => PIEZAS_VALIDAS.has(v);

export const NOMBRE_CUADRANTE: Record<number, string> = {
  1: "Superior derecho",
  2: "Superior izquierdo",
  3: "Inferior izquierdo",
  4: "Inferior derecho",
  5: "Superior derecho (temporarios)",
  6: "Superior izquierdo (temporarios)",
  7: "Inferior izquierdo (temporarios)",
  8: "Inferior derecho (temporarios)",
};

/** Cada cuadrante en el orden en que se dibuja de izquierda a derecha, como se ve la boca de frente. */
export const filaDeCuadrantes = {
  permanentesSuperior: [[1, 8, 1], [2, 1, 8]] as const,
  permanentesInferior: [[4, 8, 1], [3, 1, 8]] as const,
  temporariasSuperior: [[5, 5, 1], [6, 1, 5]] as const,
  temporariasInferior: [[8, 5, 1], [7, 1, 5]] as const,
};

/** Piezas de un cuadrante de `desde` a `hasta` (puede ir en descenso). */
export function piezasDeCuadrante(cuadrante: number, desde: number, hasta: number): string[] {
  const paso = desde <= hasta ? 1 : -1;
  const salida: string[] = [];
  for (let n = desde; n !== hasta + paso; n += paso) salida.push(`${cuadrante}${n}`);
  return salida;
}
