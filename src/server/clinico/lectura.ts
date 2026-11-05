import { getDb } from "../db/cliente";
import { registrar } from "../auditoria";
import { contextoDePedido } from "../auth/sesiones";

/** Deja constancia de que se leyó una historia clínica o un trabajo (RNF-07). */
export async function registrarLecturaClinica(usuarioId: string, pacienteId: string, trabajoId?: string): Promise<void> {
  await registrar(getDb(), {
    accion: "ver", entidad: trabajoId ? "trabajo" : "historia_clinica", entidadId: trabajoId, usuarioId, pacienteId, ...(await contextoDePedido()),
  });
}
