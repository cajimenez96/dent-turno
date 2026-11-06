"use client";

import { useActionState, useId, useState } from "react";
import { guardarEdicionTrabajo, guardarTrabajoNuevo } from "@/server/acciones/trabajos";
import type { EstadoForm } from "@/server/acciones/comun";
import { CARAS, NOMBRE_CARA, NOMBRE_CUADRANTE, piezasDeCuadrante, type Cara } from "@/server/clinico/fdi";
import type { PiezaTratada } from "@/server/clinico/trabajos";
import { AvisoError, botonPrimario, botonSecundario, Campo, claseCampo, descrito, PanelConfirmacion } from "@/app/componentes/ui";

type Fila = PiezaTratada & { clave: number };
type Inicial = { fecha: string; descripcion: string; monto: string; piezas: PiezaTratada[] };

type Props =
  | { modo: "nuevo"; inicial: Inicial; profesionalId: string; pacienteId: string; turnoId?: string }
  | { modo: "editar"; inicial: Inicial; trabajoId: string; version: number };

const GRUPOS = [1, 2, 3, 4, 5, 6, 7, 8].map((c) => ({ c, piezas: piezasDeCuadrante(c, 1, c <= 4 ? 8 : 5) }));

export function FormularioTrabajo(props: Props) {
  const [estado, accion, pendiente] = useActionState<EstadoForm, FormData>(props.modo === "nuevo" ? guardarTrabajoNuevo : guardarEdicionTrabajo, {});
  const [filas, setFilas] = useState<Fila[]>(() => props.inicial.piezas.map((p, i) => ({ ...p, clave: i })));
  const [siguiente, setSiguiente] = useState(props.inicial.piezas.length);
  const id = useId();
  const v = estado.valores ?? {};
  const campos = estado.error?.campos ?? {};
  const pide = estado.error?.codigo === "REQUIERE_CONFIRMACION" ? estado.error : null;
  const resumen = (pide?.detalle as { resumen?: string[] } | undefined)?.resumen ?? [];

  const cambiar = (clave: number, parcial: Partial<PiezaTratada>) => setFilas((fs) => fs.map((f) => (f.clave === clave ? { ...f, ...parcial } : f)));
  const alternarCara = (f: Fila, cara: Cara) => cambiar(f.clave, { caras: f.caras.includes(cara) ? f.caras.filter((c) => c !== cara) : [...f.caras, cara] });

  return (
    <form action={accion} noValidate aria-busy={pendiente} className="space-y-5">
      {props.modo === "nuevo" ? (
        <>
          <input type="hidden" name="profesionalId" value={props.profesionalId} />
          <input type="hidden" name="pacienteId" value={props.pacienteId} />
          {props.turnoId ? <input type="hidden" name="turnoId" value={props.turnoId} /> : null}
        </>
      ) : (
        <>
          <input type="hidden" name="trabajoId" value={props.trabajoId} />
          <input type="hidden" name="version" value={props.version} />
        </>
      )}
      <input type="hidden" name="piezas" value={JSON.stringify(filas.map(({ pieza, caras, tratamiento }) => ({ pieza, caras, tratamiento })))} />

      <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
        <Campo id="fecha" etiqueta="Fecha de la atención" error={campos.fecha}>
          <input id="fecha" name="fecha" type="date" required defaultValue={v.fecha ?? props.inicial.fecha} className={claseCampo} {...descrito("fecha", campos.fecha)} />
        </Campo>
        <Campo id="monto" etiqueta="Monto informado (opcional)" error={campos.monto} ayuda="Es solo informativo: no genera ningún cobro.">
          <input id="monto" name="monto" inputMode="decimal" autoComplete="off" placeholder="12.500" defaultValue={v.monto ?? props.inicial.monto} className={claseCampo} {...descrito("monto", campos.monto, "x")} />
        </Campo>
      </div>

      <Campo id="descripcion" etiqueta="Qué se hizo" error={campos.descripcion}>
        <textarea id="descripcion" name="descripcion" required rows={5} maxLength={2000} defaultValue={v.descripcion ?? props.inicial.descripcion} className={claseCampo} {...descrito("descripcion", campos.descripcion)} />
      </Campo>

      <fieldset className="space-y-3">
        <legend className="text-[13px] font-medium text-slate">Piezas tratadas (opcional)</legend>
        {filas.length === 0 ? <p className="text-[14px] text-steel">Si el trabajo no es sobre una pieza en particular, dejalo así.</p> : null}
        <ul className="space-y-3">
          {filas.map((f, i) => (
            <li key={f.clave} className="rounded-lg border border-hairline bg-surface p-3">
              <div className="grid gap-3 sm:grid-cols-[150px_1fr]">
                <div>
                  <label htmlFor={`${id}-p${f.clave}`} className="block text-[13px] text-slate">Pieza {i + 1}</label>
                  <select id={`${id}-p${f.clave}`} value={f.pieza} onChange={(e) => cambiar(f.clave, { pieza: e.target.value })} className={claseCampo}>
                    <option value="">Elegir…</option>
                    {GRUPOS.map((g) => (
                      <optgroup key={g.c} label={NOMBRE_CUADRANTE[g.c]}>
                        {g.piezas.map((p) => (<option key={p} value={p}>{p}</option>))}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor={`${id}-t${f.clave}`} className="block text-[13px] text-slate">Tratamiento</label>
                  <input id={`${id}-t${f.clave}`} value={f.tratamiento} maxLength={80} onChange={(e) => cambiar(f.clave, { tratamiento: e.target.value })} placeholder="Restauración" className={claseCampo} />
                </div>
              </div>
              <fieldset className="mt-3">
                <legend className="text-[13px] text-slate">Caras</legend>
                <div className="mt-1 flex flex-wrap gap-x-4">
                  {CARAS.map((c) => (
                    <label key={c} className="objetivo-tactil flex items-center gap-2 text-[14px] text-ink">
                      <input type="checkbox" checked={f.caras.includes(c)} onChange={() => alternarCara(f, c)} className="h-4 w-4 accent-primary" />
                      <span><span className="font-family-2">{c}</span> <span className="text-steel">{NOMBRE_CARA[c]}</span></span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <button type="button" onClick={() => setFilas((fs) => fs.filter((x) => x.clave !== f.clave))} className="objetivo-tactil mt-2 text-[14px] text-slate underline underline-offset-4 hover:text-ink" aria-label={`Quitar la pieza ${i + 1}`}>
                Quitar esta pieza
              </button>
            </li>
          ))}
        </ul>
        {campos.piezas ? <p className="text-[13px] text-danger-text">{campos.piezas}</p> : null}
        <button type="button" onClick={() => { setFilas((fs) => [...fs, { clave: siguiente, pieza: "", caras: [], tratamiento: "" }]); setSiguiente((n) => n + 1); }} className={botonSecundario}>
          Agregar pieza
        </button>
      </fieldset>

      {!pide ? <AvisoError error={estado.error} /> : null}

      {pide ? (
        <PanelConfirmacion titulo="Esto es lo que va a cambiar">
          <ul className="list-disc space-y-1 pl-5">
            {resumen.map((r) => (<li key={r}>{r}</li>))}
          </ul>
          <p className="mt-2">Se guarda como versión nueva. La anterior queda en el registro de cambios.</p>
        </PanelConfirmacion>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {pide ? (
          <>
            <button type="submit" name="confirmar" value="1" disabled={pendiente} className={botonPrimario}>{pendiente ? "Guardando…" : "Confirmar y guardar"}</button>
            <button type="submit" disabled={pendiente} className={botonSecundario}>Seguir editando</button>
          </>
        ) : (
          <button type="submit" disabled={pendiente} className={botonPrimario}>
            {pendiente ? "Guardando…" : props.modo === "nuevo" ? "Guardar trabajo" : "Revisar cambios"}
          </button>
        )}
      </div>
    </form>
  );
}
