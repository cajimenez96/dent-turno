import { esquema, type Db } from "./db/cliente";

export type EventoAuditoria = {
  accion: "ingreso" | "ingreso_fallido" | "salida" | "ver" | "crear" | "editar" | "anular" | "descargar";
  entidad: string;
  entidadId?: string;
  usuarioId?: string | null;
  pacienteId?: string | null;
  profesionalId?: string | null;
  datos?: Record<string, unknown>;
  ip?: string | null;
  navegador?: string | null;
};

type Ejecutor = Pick<Db, "insert">;

/**
 * Registra un evento. Pasá la transacción (`tx`) cuando la acción escribe datos, así el
 * cambio y su registro se confirman juntos o no se confirma ninguno.
 */
export async function registrar(ejecutor: Ejecutor, evento: EventoAuditoria): Promise<void> {
  await ejecutor.insert(esquema.auditoria).values({
    accion: evento.accion,
    entidad: evento.entidad,
    entidadId: evento.entidadId,
    usuarioId: evento.usuarioId ?? null,
    pacienteId: evento.pacienteId ?? null,
    profesionalId: evento.profesionalId ?? null,
    datos: evento.datos,
    ip: evento.ip ?? null,
    navegador: evento.navegador ?? null,
  });
}
