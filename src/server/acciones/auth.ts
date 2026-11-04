"use server";

import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { esquema, getDb } from "../db/cliente";
import { registrar } from "../auditoria";
import { verificarClave } from "../auth/clave";
import { ingresoBloqueado, VENTANA_INTENTOS_MS } from "../auth/reglas";
import { cerrarSesion, contextoDePedido, crearSesion, fallidosRecientes, usuarioActual } from "../auth/sesiones";

export type EstadoIngreso = { error?: string; email?: string };

const entrada = z.object({
  email: z.string().trim().toLowerCase().email("Escribí un email válido."),
  clave: z.string().min(1, "Escribí tu clave."),
});

const MENSAJE_GENERICO = "El email o la clave no son correctos. Revisalos y volvé a intentar.";

export async function ingresar(_previo: EstadoIngreso, formulario: FormData): Promise<EstadoIngreso> {
  const parseo = entrada.safeParse({ email: formulario.get("email"), clave: formulario.get("clave") });
  if (!parseo.success) {
    return { error: parseo.error.issues[0]?.message, email: String(formulario.get("email") ?? "") };
  }
  const { email, clave } = parseo.data;
  const db = getDb();
  const ctx = await contextoDePedido();

  if (ingresoBloqueado(await fallidosRecientes(email, VENTANA_INTENTOS_MS))) {
    return {
      error: "Hubo demasiados intentos fallidos. Esperá 15 minutos y volvé a intentar.",
      email,
    };
  }

  const [usuario] = await db
    .select()
    .from(esquema.usuarios)
    .where(sql`lower(${esquema.usuarios.email}) = ${email}`);

  const claveOk = await verificarClave(usuario?.claveHash ?? null, clave);
  if (!usuario || !usuario.activo || !claveOk) {
    await registrar(db, { accion: "ingreso_fallido", entidad: "sesion", datos: { email }, ...ctx });
    return { error: MENSAJE_GENERICO, email };
  }

  await crearSesion(usuario.id);
  await registrar(db, { accion: "ingreso", entidad: "sesion", usuarioId: usuario.id, ...ctx });
  redirect("/agenda");
}

export async function salir(): Promise<void> {
  const usuario = await usuarioActual();
  if (usuario) await registrar(getDb(), { accion: "salida", entidad: "sesion", usuarioId: usuario.id, ...(await contextoDePedido()) });
  await cerrarSesion();
  redirect("/ingresar");
}

/** Mantiene la sesión viva desde el aviso "¿Seguís trabajando?": basta con tocar el servidor. */
export async function seguirTrabajando(): Promise<{ ok: boolean }> {
  return { ok: (await usuarioActual()) !== null };
}

