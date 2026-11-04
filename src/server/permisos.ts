export const PERMISOS = [
  "agenda.ver",
  "agenda.editar",
  "agenda.configurar",
  "pacientes.ver",
  "pacientes.editar",
  "clinico.ver",
  "clinico.editar",
  "cobros.ver",
  "cobros.registrar",
  "cobros.anular",
  "reportes.ver",
  "usuarios.administrar",
] as const;

export type Permiso = (typeof PERMISOS)[number];

/** Un permiso concedido por una asignación. `profesionalId` nulo = alcance sobre todos. */
export type Concesion = { permiso: string; profesionalId: string | null };

export class ErrorPermiso extends Error {
  constructor(permiso: Permiso) {
    super(`Sin permiso: ${permiso}`);
    this.name = "ErrorPermiso";
  }
}

/** Función pura: ¿alguna concesión cubre este permiso (y este profesional, si se indica)? */
export function puede(concesiones: Concesion[], permiso: Permiso, profesionalId?: string): boolean {
  return concesiones.some(
    (c) =>
      c.permiso === permiso &&
      (c.profesionalId === null || profesionalId === undefined || c.profesionalId === profesionalId),
  );
}
