"use client";

import { useActionState, useState } from "react";
import { desactivarPacienteForm } from "@/server/acciones/pacientes";
import type { EstadoForm } from "@/server/acciones/comun";
import { AvisoError, botonPeligro, botonSecundario } from "@/app/componentes/ui";

export function DesactivarPaciente({ id }: { id: string }) {
  const [s, accion, pendiente] = useActionState<EstadoForm, FormData>(desactivarPacienteForm, {});
  const [pregunta, setPregunta] = useState(false);
  if (!pregunta && !s.error) {
    return <button type="button" onClick={() => setPregunta(true)} className={botonSecundario}>Desactivar paciente</button>;
  }
  return (
    <form action={accion} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <p className="text-[14px] text-slate">El paciente deja de aparecer en las búsquedas. Su historia y sus turnos pasados se conservan.</p>
      <AvisoError error={s.error} />
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={pendiente} className={botonPeligro}>{pendiente ? "Desactivando…" : "Sí, desactivar"}</button>
        <button type="button" onClick={() => setPregunta(false)} className={botonSecundario}>No, volver</button>
      </div>
    </form>
  );
}
