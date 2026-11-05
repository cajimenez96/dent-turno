import { sql } from "drizzle-orm";
import type { Db } from "../db/cliente";
import type { Permiso } from "../permisos";

export type ProfesionalVisible = { id: string; nombre: string };

/** Profesionales sobre los que el usuario tiene el permiso (alcance propio o "todos"). */
export async function profesionalesCon(db: Pick<Db, "execute">, usuarioId: string, permiso: Permiso): Promise<ProfesionalVisible[]> {
  const { rows } = await db.execute<ProfesionalVisible>(sql`
    select p.id, p.nombre from profesionales p
    where p.activo and exists (
      select 1 from asignaciones a join rol_permisos rp on rp.rol = a.rol
      where a.usuario_id = ${usuarioId} and rp.permiso = ${permiso}
        and (a.profesional_id is null or a.profesional_id = p.id))
    order by p.nombre`);
  return rows;
}
