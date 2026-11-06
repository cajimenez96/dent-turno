"use client";

import { useActionState } from "react";
import { cambiarEstadoTurno, liberarHorarioTurno } from "@/server/acciones/turnos";
import type { EstadoForm } from "@/server/acciones/comun";
import { AvisoError, botonPeligro, botonPrimario, botonSecundario, Campo, claseCampo, descrito } from "@/app/componentes/ui";

export function CambiarEstado({ turnoId, version, estado, etiqueta, estilo = "secundario" }: {
  turnoId: string; version: number; estado: "atendido" | "ausente"; etiqueta: string; estilo?: "primario" | "secundario";
}) {
  const [s, accion, pendiente] = useActionState<EstadoForm, FormData>(cambiarEstadoTurno, {});
  return (
    <form action={accion} aria-busy={pendiente} className="space-y-2">
      <input type="hidden" name="turnoId" value={turnoId} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="estado" value={estado} />
      <button type="submit" disabled={pendiente} className={estilo === "primario" ? botonPrimario : botonSecundario}>
        {pendiente ? "Guardando…" : etiqueta}
      </button>
      <AvisoError error={s.error} />
    </form>
  );
}

export function CancelarTurno({ turnoId, version }: { turnoId: string; version: number }) {
  const [s, accion, pendiente] = useActionState<EstadoForm, FormData>(cambiarEstadoTurno, {});
  const error = s.error?.campos?.motivo;
  return (
    <form action={accion} noValidate aria-busy={pendiente} className="space-y-3">
      <input type="hidden" name="turnoId" value={turnoId} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="estado" value="cancelado" />
      <Campo id="motivo" etiqueta="Motivo de la cancelación" error={error} ayuda="Queda registrado. Al cancelar, el horario queda libre y el turno no se puede reactivar.">
        <input id="motivo" name="motivo" type="text" maxLength={300} defaultValue={s.valores?.motivo} className={claseCampo} {...descrito("motivo", error, "x")} />
      </Campo>
      {!error ? <AvisoError error={s.error} /> : null}
      <button type="submit" disabled={pendiente} className={botonPeligro}>{pendiente ? "Cancelando…" : "Cancelar turno"}</button>
    </form>
  );
}

export function LiberarHorario({ turnoId, version }: { turnoId: string; version: number }) {
  const [s, accion, pendiente] = useActionState<EstadoForm, FormData>(liberarHorarioTurno, {});
  return (
    <form action={accion} aria-busy={pendiente} className="space-y-2">
      <input type="hidden" name="turnoId" value={turnoId} />
      <input type="hidden" name="version" value={version} />
      <button type="submit" disabled={pendiente} className={botonSecundario}>{pendiente ? "Liberando…" : "Liberar el horario"}</button>
      <p className="text-[13px] text-steel">Deja el lugar disponible para otro paciente. No se puede deshacer.</p>
      <AvisoError error={s.error} />
    </form>
  );
}
