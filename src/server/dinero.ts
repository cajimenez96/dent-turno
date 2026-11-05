// Montos en pesos. Se guardan como numeric(12,2) y se manejan como texto o centavos enteros, nunca como float.

/**
 * Lee un monto escrito a la argentina: "12.500", "12.500,50", "12500,5" o "12500.50".
 * Devuelve el monto normalizado ("12500.50") o null si está vacío; undefined si no es un monto válido.
 */
export function leerMonto(texto: string): string | null | undefined {
  const t = texto.trim().replace(/^\$\s*/, "").replace(/\s/g, "");
  if (t === "") return null;
  let normal: string;
  if (t.includes(",")) normal = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) normal = t.replace(/\./g, "");
  else normal = t;
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(normal)) return undefined;
  const [entero, decimales = ""] = normal.split(".");
  return `${Number(entero)}.${decimales.padEnd(2, "0")}`;
}

/** "12500.50" → "$ 12.500,50". */
export function formatoMonto(monto: string | null): string {
  if (monto === null) return "Sin monto";
  const [entero, decimales] = monto.split(".");
  return `$ ${entero.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${decimales ?? "00"}`;
}
