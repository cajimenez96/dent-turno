"use client";

import { useActionState } from "react";
import { agendarTurno, moverTurno } from "@/server/acciones/turnos";
import type { EstadoForm } from "@/server/acciones/comun";
import type { PacienteResumen } from "@/server/pacientes/servicio";
import { AvisoError, botonPrimario, botonSecundario, Campo, claseCampo, descrito, PanelConfirmacion } from "@/app/componentes/ui";
import { SelectorPaciente } from "./selector-paciente";

const HORAS = Array.from({ length: 32 }, (_, i) => {
  const m = 6 * 60 + i * 30;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
});
const DURACIONES = [60, 90, 120, 150, 180].map((m) => ({ m, texto: m % 60 === 0 ? `${m / 60} h` : `${Math.floor(m / 60)} h 30 min` }));

type Props =
  | { modo: "nuevo"; profesionalId: string; fecha: string; hora: string; duracionMin: number; paciente: PacienteResumen | null; volver: string }
  | { modo: "mover"; profesionalId: string; turnoId: string; version: number; fecha: string; hora: string; duracionMin: number };

export function FormularioTurno(props: Props) {
  const [estado, accion, pendiente] = useActionState<EstadoForm, FormData>(props.modo === "nuevo" ? agendarTurno : moverTurno, {});
  const v = estado.valores ?? {};
  const campos = estado.error?.campos ?? {};
  const pide = estado.error?.codigo === "REQUIERE_CONFIRMACION" ? estado.error : null;
  // Si el servidor devuelve la hora fuera de la grilla de la lista, se agrega para no perderla.
  const horaActual = v.hora ?? props.hora;
  const horas = HORAS.includes(horaActual) ? HORAS : [...HORAS, horaActual].sort();

  return (
    <form action={accion} noValidate aria-busy={pendiente} className="space-y-5">
      <input type="hidden" name="profesionalId" value={props.profesionalId} />
      {props.modo === "mover" ? (
        <>
          <input type="hidden" name="turnoId" value={props.turnoId} />
          <input type="hidden" name="version" value={props.version} />
        </>
      ) : (
        <SelectorPaciente inicial={props.paciente} error={campos.pacienteId} volver={props.volver} />
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Campo id="fecha" etiqueta="Día" error={campos.fecha}>
          <input id="fecha" name="fecha" type="date" required defaultValue={v.fecha ?? props.fecha} className={claseCampo} {...descrito("fecha", campos.fecha)} />
        </Campo>
        <Campo id="hora" etiqueta="Hora de inicio" error={campos.hora}>
          <select key={`hora-${horaActual}`} id="hora" name="hora" required defaultValue={horaActual} className={claseCampo} {...descrito("hora", campos.hora)}>
            {horas.map((h) => (
              <option key={h} value={h}>{h}</option>
            ))}
          </select>
        </Campo>
        <Campo id="duracionMin" etiqueta="Duración" error={campos.duracionMin} ayuda="Mínimo 1 hora.">
          <select key={`dur-${v.duracionMin ?? props.duracionMin}`} id="duracionMin" name="duracionMin" defaultValue={v.duracionMin ?? String(props.duracionMin)} className={claseCampo} {...descrito("duracionMin", campos.duracionMin, "Mínimo 1 hora.")}>
            {DURACIONES.map((d) => (
              <option key={d.m} value={d.m}>{d.texto}</option>
            ))}
          </select>
        </Campo>
      </div>

      <AvisoError error={estado.error} />

      {pide ? (
        <PanelConfirmacion titulo={`${pide.mensaje} ¿Querés ${props.modo === "nuevo" ? "agendarlo" : "moverlo"} igual?`}>
          <p>Sirve para urgencias o excepciones. Queda registrado en la auditoría.</p>
        </PanelConfirmacion>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {pide ? (
          <>
            <button type="submit" name="confirmar" value="1" disabled={pendiente} className={botonPrimario}>
              {pendiente ? "Guardando…" : props.modo === "nuevo" ? "Agendar igual" : "Mover igual"}
            </button>
            <button type="submit" disabled={pendiente} className={botonSecundario}>Probar de nuevo con estos datos</button>
          </>
        ) : (
          <button type="submit" disabled={pendiente} className={botonPrimario}>
            {pendiente ? "Guardando…" : props.modo === "nuevo" ? "Agendar turno" : "Mover turno"}
          </button>
        )}
      </div>
    </form>
  );
}
