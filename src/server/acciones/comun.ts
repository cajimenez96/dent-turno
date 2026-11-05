import { ErrorPermiso, type Permiso } from "../permisos";
import { exigir, type UsuarioSesion } from "../auth/sesiones";
import type { ErrorAccion, Resultado } from "../resultado";

/** Estado que devuelve toda acción de formulario: el error (si hubo) y lo que se escribió, para no perderlo. */
export type EstadoForm = { error?: ErrorAccion; valores?: Record<string, string>; hecho?: string };

export function valoresDe(formulario: FormData): Record<string, string> {
  const v: Record<string, string> = {};
  for (const [k, x] of formulario.entries()) if (typeof x === "string" && !k.startsWith("$ACTION")) v[k] = x;
  return v;
}

export const texto = (f: FormData, clave: string) => (typeof f.get(clave) === "string" ? (f.get(clave) as string) : "");

export const confirma = (f: FormData) => f.get("confirmar") === "1";

/** Permiso para una acción: devuelve el usuario o un estado de error listo para mostrar. */
export async function autorizar(
  permiso: Permiso,
  profesionalId?: string,
): Promise<{ usuario: UsuarioSesion; error?: undefined } | { usuario?: undefined; error: EstadoForm }> {
  try {
    return { usuario: await exigir(permiso, { profesionalId }) };
  } catch (error) {
    if (error instanceof ErrorPermiso) {
      return { error: { error: { codigo: "SIN_PERMISO", mensaje: "No tenés permiso para hacer esto, o tu sesión se cerró. Volvé a ingresar." } } };
    }
    throw error;
  }
}

export const aEstado = <T>(r: Resultado<T>, valores: Record<string, string>): EstadoForm =>
  r.ok ? { valores } : { error: r.error, valores };
