import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { and, eq, gt, sql } from "drizzle-orm";
import { esquema, getDb } from "../db/cliente";
import { debeRefrescarActividad, evaluarSesion } from "./reglas";
import { puede, ErrorPermiso, type Concesion, type Permiso } from "../permisos";

export const COOKIE_SESION = "sto_sesion";

const hashDeToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function contextoDePedido() {
  const h = await headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    navegador: h.get("user-agent")?.slice(0, 300) ?? null,
  };
}

export async function crearSesion(usuarioId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const ctx = await contextoDePedido();
  await getDb().insert(esquema.sesiones).values({ id: hashDeToken(token), usuarioId, ...ctx });
  (await cookies()).set(COOKIE_SESION, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    // Cookie de sesión (sin fecha): el límite real lo pone la base. maxAge acota el máximo absoluto.
    maxAge: 12 * 60 * 60,
  });
}

export type UsuarioSesion = {
  id: string;
  nombre: string;
  email: string;
  profesionalId: string | null;
  ultimaActividad: Date;
};

/**
 * Devuelve el usuario de la sesión actual, o null. Cada llamada es un "pedido" en el sentido
 * de la regla de inactividad: si pasaron más de 30 minutos desde la última actividad, borra la
 * sesión; si no, renueva la actividad (como mucho una vez por minuto).
 */
export async function usuarioActual(): Promise<UsuarioSesion | null> {
  const token = (await cookies()).get(COOKIE_SESION)?.value;
  if (!token) return null;

  const db = getDb();
  const id = hashDeToken(token);
  const [fila] = await db
    .select({
      creadaAt: esquema.sesiones.creadaAt,
      ultimaActividad: esquema.sesiones.ultimaActividad,
      usuarioId: esquema.usuarios.id,
      nombre: esquema.usuarios.nombre,
      email: esquema.usuarios.email,
      profesionalId: esquema.usuarios.profesionalId,
      activo: esquema.usuarios.activo,
    })
    .from(esquema.sesiones)
    .innerJoin(esquema.usuarios, eq(esquema.usuarios.id, esquema.sesiones.usuarioId))
    .where(eq(esquema.sesiones.id, id));

  if (!fila) return null;
  if (!fila.activo || evaluarSesion(fila) !== "valida") {
    await db.delete(esquema.sesiones).where(eq(esquema.sesiones.id, id));
    return null;
  }
  let ultimaActividad = fila.ultimaActividad;
  if (debeRefrescarActividad(fila.ultimaActividad)) {
    ultimaActividad = new Date();
    await db.update(esquema.sesiones).set({ ultimaActividad }).where(eq(esquema.sesiones.id, id));
  }
  return { id: fila.usuarioId, nombre: fila.nombre, email: fila.email, profesionalId: fila.profesionalId, ultimaActividad };
}

export async function cerrarSesion(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE_SESION)?.value;
  if (token) await getDb().delete(esquema.sesiones).where(eq(esquema.sesiones.id, hashDeToken(token)));
  jar.delete(COOKIE_SESION);
}

export async function concesionesDe(usuarioId: string): Promise<Concesion[]> {
  return getDb()
    .select({ permiso: esquema.rolPermisos.permiso, profesionalId: esquema.asignaciones.profesionalId })
    .from(esquema.asignaciones)
    .innerJoin(esquema.rolPermisos, eq(esquema.rolPermisos.rol, esquema.asignaciones.rol))
    .where(eq(esquema.asignaciones.usuarioId, usuarioId));
}

/**
 * Se llama al principio de cada acción y consulta (documentación sección 6). Devuelve el
 * usuario o lanza ErrorPermiso. Una prueba verifica que toda acción pase por acá.
 */
export async function exigir(permiso: Permiso, opciones: { profesionalId?: string } = {}): Promise<UsuarioSesion> {
  const usuario = await usuarioActual();
  if (!usuario) throw new ErrorPermiso(permiso);
  if (!puede(await concesionesDe(usuario.id), permiso, opciones.profesionalId)) throw new ErrorPermiso(permiso);
  return usuario;
}

/** Cuenta ingresos fallidos recientes de un email (límite de intentos). */
export async function fallidosRecientes(email: string, ventanaMs: number): Promise<number> {
  const desde = new Date(Date.now() - ventanaMs);
  const [fila] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(esquema.auditoria)
    .where(
      and(
        eq(esquema.auditoria.accion, "ingreso_fallido"),
        gt(esquema.auditoria.momento, desde),
        sql`${esquema.auditoria.datos}->>'email' = ${email}`,
      ),
    );
  return fila?.n ?? 0;
}
