"use client";

import { useActionState, useState } from "react";
import { agregarBloqueo, guardarHorario, quitarBloqueo } from "@/server/acciones/configuracion";
import type { EstadoForm } from "@/server/acciones/comun";
import { etiquetaDiaCap, fechaDe, horaDe } from "@/server/tiempo";
import type { Franja } from "@/server/agenda/configuracion";
import type { AfectadoPorBloqueo } from "@/server/agenda/configuracion";
import { AvisoError, AvisoHecho, botonPeligro, botonPrimario, botonSecundario, Campo, claseCampo, descrito, PanelConfirmacion } from "@/app/componentes/ui";

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

export function FormularioHorario({ profesionalId, franjas }: { profesionalId: string; franjas: Franja[] }) {
  const [s, accion, pendiente] = useActionState<EstadoForm, FormData>(guardarHorario, {});
  const campos = s.error?.campos ?? {};
  const valor = (dia: number, n: number, k: "inicio" | "fin") =>
    s.valores?.[`${k}-${dia}-${n}`] ?? franjas.filter((f) => f.dia === dia)[n]?.[k] ?? "";

  return (
    <form action={accion} noValidate aria-busy={pendiente} className="space-y-4">
      <input type="hidden" name="profesionalId" value={profesionalId} />
      <fieldset className="space-y-3">
        <legend className="sr-only">Horario de atención por día</legend>
        {DIAS.map((nombre, i) => {
          const dia = i + 1;
          const error = campos[`${dia}`];
          return (
            <div key={dia} className="grid items-start gap-x-4 gap-y-2 sm:grid-cols-[110px_1fr]">
              <p className="pt-2.5 text-[15px] text-linear-bone">{nombre}</p>
              <div>
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  {[0, 1].map((n) => (
                    <div key={n} className="flex items-center gap-2">
                      <label className="sr-only" htmlFor={`inicio-${dia}-${n}`}>{nombre}, {n === 0 ? "mañana" : "tarde"}, desde</label>
                      <input id={`inicio-${dia}-${n}`} name={`inicio-${dia}-${n}`} type="time" defaultValue={valor(dia, n, "inicio")} className={`${claseCampo} !mt-0 w-[120px]`} aria-invalid={error ? true : undefined} />
                      <span aria-hidden="true" className="text-linear-fog">a</span>
                      <label className="sr-only" htmlFor={`fin-${dia}-${n}`}>{nombre}, {n === 0 ? "mañana" : "tarde"}, hasta</label>
                      <input id={`fin-${dia}-${n}`} name={`fin-${dia}-${n}`} type="time" defaultValue={valor(dia, n, "fin")} className={`${claseCampo} !mt-0 w-[120px]`} aria-invalid={error ? true : undefined} />
                    </div>
                  ))}
                </div>
                {error ? <p className="mt-1 text-[13px] text-linear-coral-red">{error}</p> : null}
              </div>
            </div>
          );
        })}
      </fieldset>
      <p className="text-[13px] text-linear-fog">Dejá las dos horas vacías en los días que no atiende. Cada día admite hasta dos franjas (por ejemplo mañana y tarde).</p>
      {!Object.keys(campos).length ? <AvisoError error={s.error} /> : null}
      <AvisoHecho texto={s.hecho} />
      <button type="submit" disabled={pendiente} className={botonPrimario}>{pendiente ? "Guardando…" : "Guardar horario"}</button>
    </form>
  );
}

export function FormularioBloqueo({ profesionalId }: { profesionalId: string }) {
  const [s, accion, pendiente] = useActionState<EstadoForm, FormData>(agregarBloqueo, {});
  const [tipo, setTipo] = useState<"puntual" | "semanal">((s.valores?.tipo as "puntual" | "semanal") ?? "puntual");
  const c = s.error?.campos ?? {};
  const v = s.valores ?? {};
  const pide = s.error?.codigo === "REQUIERE_CONFIRMACION";
  const afectados = pide ? ((s.error?.detalle as { afectados?: AfectadoPorBloqueo[] })?.afectados ?? []) : [];

  return (
    <form action={accion} noValidate aria-busy={pendiente} className="space-y-4">
      <input type="hidden" name="profesionalId" value={profesionalId} />
      <fieldset>
        <legend className="text-[13px] font-medium text-linear-mist">Tipo de bloqueo</legend>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
          {[["puntual", "Días o fechas puntuales (vacaciones, un congreso)"], ["semanal", "Todas las semanas (almuerzo, reunión fija)"]].map(([valor, texto]) => (
            <label key={valor} className="objetivo-tactil flex items-center gap-2 text-[15px] text-linear-bone">
              <input type="radio" name="tipo" value={valor} checked={tipo === valor} onChange={() => setTipo(valor as "puntual" | "semanal")} className="h-4 w-4 accent-[#e4f222]" />
              {texto}
            </label>
          ))}
        </div>
      </fieldset>

      <Campo id="motivo" etiqueta="Motivo" error={c.motivo}>
        <input id="motivo" name="motivo" maxLength={120} defaultValue={v.motivo} placeholder={tipo === "puntual" ? "Vacaciones" : "Almuerzo"} className={claseCampo} {...descrito("motivo", c.motivo)} />
      </Campo>

      {tipo === "puntual" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo id="fechaDesde" etiqueta="Desde el día" error={c.fechaDesde}>
            <input id="fechaDesde" name="fechaDesde" type="date" defaultValue={v.fechaDesde} className={claseCampo} {...descrito("fechaDesde", c.fechaDesde)} />
          </Campo>
          <Campo id="fechaHasta" etiqueta="Hasta el día (inclusive)" error={c.fechaHasta} ayuda="Si es un solo día, dejalo vacío.">
            <input id="fechaHasta" name="fechaHasta" type="date" defaultValue={v.fechaHasta} className={claseCampo} {...descrito("fechaHasta", c.fechaHasta, "x")} />
          </Campo>
          <Campo id="horaDesde" etiqueta="Desde la hora" error={c.horaDesde} ayuda="Dejá las dos horas vacías para bloquear días enteros.">
            <input id="horaDesde" name="horaDesde" type="time" defaultValue={v.horaDesde} className={claseCampo} {...descrito("horaDesde", c.horaDesde, "x")} />
          </Campo>
          <Campo id="horaHasta" etiqueta="Hasta la hora" error={c.horaHasta}>
            <input id="horaHasta" name="horaHasta" type="time" defaultValue={v.horaHasta} className={claseCampo} {...descrito("horaHasta", c.horaHasta)} />
          </Campo>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo id="dia" etiqueta="Día de la semana" error={c.dia}>
            <select key={`dia-${v.dia ?? "1"}`} id="dia" name="dia" defaultValue={v.dia ?? "1"} className={claseCampo} {...descrito("dia", c.dia)}>
              {DIAS.map((d, i) => (<option key={d} value={i + 1}>{d}</option>))}
            </select>
          </Campo>
          <Campo id="horaDesde" etiqueta="Desde la hora" error={c.horaDesde}>
            <input id="horaDesde" name="horaDesde" type="time" required defaultValue={v.horaDesde} className={claseCampo} {...descrito("horaDesde", c.horaDesde)} />
          </Campo>
          <Campo id="horaHasta" etiqueta="Hasta la hora" error={c.horaHasta}>
            <input id="horaHasta" name="horaHasta" type="time" required defaultValue={v.horaHasta} className={claseCampo} {...descrito("horaHasta", c.horaHasta)} />
          </Campo>
        </div>
      )}

      <AvisoError error={s.error} />
      {pide ? (
        <PanelConfirmacion titulo={s.error?.mensaje ?? ""}>
          <ul className="space-y-1">
            {afectados.map((a) => (
              <li key={a.id}>{a.paciente} · {etiquetaDiaCap(fechaDe(new Date(a.inicio)))}, {horaDe(new Date(a.inicio))}</li>
            ))}
          </ul>
          <p className="mt-2">Si guardás el bloqueo, esos turnos siguen programados: después los cancelás o los movés vos desde la agenda.</p>
        </PanelConfirmacion>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {pide ? (
          <>
            <button type="submit" name="confirmar" value="1" disabled={pendiente} className={botonPrimario}>{pendiente ? "Guardando…" : "Guardar el bloqueo igual"}</button>
            <button type="submit" disabled={pendiente} className={botonSecundario}>Volver a revisar</button>
          </>
        ) : (
          <button type="submit" disabled={pendiente} className={botonPrimario}>{pendiente ? "Guardando…" : "Agregar bloqueo"}</button>
        )}
      </div>
    </form>
  );
}

export function QuitarBloqueo({ id, profesionalId, motivo }: { id: string; profesionalId: string; motivo: string }) {
  const [s, accion, pendiente] = useActionState<EstadoForm, FormData>(quitarBloqueo, {});
  return (
    <form action={accion}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="profesionalId" value={profesionalId} />
      <button type="submit" disabled={pendiente} className={botonPeligro} aria-label={`Anular el bloqueo ${motivo}`}>{pendiente ? "Anulando…" : "Anular"}</button>
      <AvisoError error={s.error} />
    </form>
  );
}
