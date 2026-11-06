"use client";

import { useActionState, useState } from "react";
import { eliminarTrabajoForm } from "@/server/acciones/trabajos";
import type { EstadoForm } from "@/server/acciones/comun";
import { AvisoError, botonPeligro, botonSecundario, Campo, claseCampo, descrito } from "@/app/componentes/ui";

export function EliminarTrabajo({ trabajoId }: { trabajoId: string }) {
  const [s, accion, pendiente] = useActionState<EstadoForm, FormData>(eliminarTrabajoForm, {});
  const [abierto, setAbierto] = useState(false);
  const error = s.error?.campos?.motivo;
  if (!abierto && !s.error) return <button type="button" onClick={() => setAbierto(true)} className={botonSecundario}>Eliminar este trabajo</button>;
  return (
    <form action={accion} noValidate className="space-y-3">
      <input type="hidden" name="trabajoId" value={trabajoId} />
      <p className="text-[14px] text-slate">El trabajo deja de verse en el historial y en el odontograma. No se borra: queda en el registro de cambios con tu nombre y el motivo.</p>
      <Campo id="motivo" etiqueta="Motivo" error={error}>
        <input id="motivo" name="motivo" maxLength={300} defaultValue={s.valores?.motivo} className={claseCampo} {...descrito("motivo", error)} />
      </Campo>
      {!error ? <AvisoError error={s.error} /> : null}
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={pendiente} className={botonPeligro}>{pendiente ? "Eliminando…" : "Sí, eliminar"}</button>
        <button type="button" onClick={() => setAbierto(false)} className={botonSecundario}>No, volver</button>
      </div>
    </form>
  );
}
