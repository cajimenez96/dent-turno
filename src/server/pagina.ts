import { redirect } from "next/navigation";
import { exigir, type UsuarioSesion } from "./auth/sesiones";
import { ErrorPermiso, type Permiso } from "./permisos";
import { getDb } from "./db/cliente";
import { profesionalesCon, type ProfesionalVisible } from "./agenda/profesionales";

/** Para páginas: sin sesión va al ingreso; con sesión pero sin permiso, vuelve a la agenda. */
export async function exigirPagina(permiso: Permiso): Promise<UsuarioSesion> {
  try {
    return await exigir(permiso);
  } catch (error) {
    if (error instanceof ErrorPermiso) redirect("/ingresar");
    throw error;
  }
}

/** El profesional con el que se trabaja: el pedido en la URL si el usuario lo puede ver, o el primero. */
export async function profesionalActual(usuario: UsuarioSesion, permiso: Permiso, pedido?: string) {
  const profesionales: ProfesionalVisible[] = await profesionalesCon(getDb(), usuario.id, permiso);
  const actual = profesionales.find((p) => p.id === pedido) ?? profesionales[0] ?? null;
  return { profesionales, actual };
}

/** Primer valor de un parámetro de URL. */
export const param = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
