export type CodigoError =
  | "NO_AUTENTICADO"
  | "SIN_PERMISO"
  | "INVALIDO"
  | "SOLAPAMIENTO"
  | "EN_BLOQUEO"
  | "FUERA_DE_HORARIO"
  | "REQUIERE_CONFIRMACION"
  | "CONFLICTO_VERSION"
  | "NO_ENCONTRADO";

export type ErrorAccion = { codigo: CodigoError; mensaje: string; campos?: Record<string, string>; detalle?: unknown };

export type Resultado<T> = { ok: true; datos: T } | { ok: false; error: ErrorAccion };

export const ok = <T>(datos: T): Resultado<T> => ({ ok: true, datos });

export const falla = (codigo: CodigoError, mensaje: string, extra: { campos?: Record<string, string>; detalle?: unknown } = {}): Resultado<never> => ({
  ok: false,
  error: { codigo, mensaje, ...extra },
});

/** Convierte un error de Zod en el primer mensaje por campo. */
export function camposDeZod(error: { issues: { path: PropertyKey[]; message: string }[] }): Record<string, string> {
  const campos: Record<string, string> = {};
  for (const i of error.issues) {
    const k = String(i.path[0] ?? "");
    if (!(k in campos)) campos[k] = i.message;
  }
  return campos;
}

/** Código de error de Postgres, venga directo o envuelto por Drizzle. */
export function codigoPg(error: unknown): string | undefined {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.cause?.code ?? e?.code;
}
