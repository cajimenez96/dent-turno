import { redirect } from "next/navigation";
import { usuarioActual } from "@/server/auth/sesiones";

export const dynamic = "force-dynamic";

export default async function Inicio() {
  redirect((await usuarioActual()) ? "/agenda" : "/ingresar");
}
