"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  aplicarACuentaForm, anularCargoForm, anularCobroForm, corregirMontoCargo, guardarCargo, guardarCobro,
} from "@/server/acciones/cobros";
import type { EstadoForm } from "@/server/acciones/comun";
import { AvisoError, AvisoHecho, botonPeligro, botonPrimario, botonSecundario, Campo, claseCampo, descrito } from "@/app/componentes/ui";

export type CargoPendiente = { id: string; concepto: string; saldo: string; etiqueta: string };

export function FormularioCobro({ pacienteId, profesionalId, hoy, pendientes }: { pacienteId: string; profesionalId: string; hoy: string; pendientes: CargoPendiente[] }) {
  const [s, accion, pendiente] = useActionState<EstadoForm, FormData>(guardarCobro, {});
  const c = s.error?.campos ?? {};
  return (
    <form action={accion} noValidate className="space-y-4">
      <input type="hidden" name="pacienteId" value={pacienteId} />
      <input type="hidden" name="profesionalId" value={profesionalId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id={`monto-${profesionalId}`} etiqueta="Monto cobrado" error={c.monto} ayuda="Ejemplo: 12.500 o 12.500,50">
          <input id={`monto-${profesionalId}`} name="monto" inputMode="decimal" autoComplete="off" defaultValue={s.valores?.monto} className={claseCampo} {...descrito(`monto-${profesionalId}`, c.monto, "a")} />
        </Campo>
        <Campo id={`fecha-${profesionalId}`} etiqueta="Fecha" error={c.fecha}>
          <input id={`fecha-${profesionalId}`} name="fecha" type="date" max={hoy} defaultValue={s.valores?.fecha || hoy} className={claseCampo} {...descrito(`fecha-${profesionalId}`, c.fecha)} />
        </Campo>
        <Campo id={`medio-${profesionalId}`} etiqueta="Cómo pagó" error={c.medio}>
          <select id={`medio-${profesionalId}`} name="medio" key={s.valores?.medio} defaultValue={s.valores?.medio ?? "efectivo"} className={claseCampo} {...descrito(`medio-${profesionalId}`, c.medio)}>
            <option value="efectivo">Efectivo</option>
            <option value="transferencia">Transferencia</option>
          </select>
        </Campo>
        <Campo id={`cargo-${profesionalId}`} etiqueta="Aplicar a" error={c.cargoId} ayuda="Si no elegís, se aplica al cargo más antiguo.">
          <select id={`cargo-${profesionalId}`} name="cargoId" defaultValue="" className={claseCampo} {...descrito(`cargo-${profesionalId}`, c.cargoId, "a")}>
            <option value="">Cargos más antiguos primero</option>
            {pendientes.map((g) => (<option key={g.id} value={g.id}>{g.etiqueta}</option>))}
          </select>
        </Campo>
      </div>
      <AvisoError error={Object.keys(c).length ? undefined : s.error} />
      <AvisoHecho texto={s.hecho} />
      <button type="submit" disabled={pendiente} className={botonPrimario}>{pendiente ? "Guardando…" : "Registrar cobro"}</button>
    </form>
  );
}

export function FormularioCargo({
  pacienteId, profesionalId, hoy, origen = "otro", trabajoId, concepto, monto, boton = "Agregar cargo", enlaceCuenta,
}: {
  pacienteId: string; profesionalId: string; hoy: string; origen?: "otro" | "trabajo" | "ausencia"; trabajoId?: string;
  concepto?: string; monto?: string; boton?: string; enlaceCuenta?: boolean;
}) {
  const [s, accion, pendiente] = useActionState<EstadoForm, FormData>(guardarCargo, {});
  const c = s.error?.campos ?? {};
  const id = (n: string) => `${n}-g-${profesionalId}`;
  return (
    <form action={accion} noValidate className="space-y-4">
      <input type="hidden" name="pacienteId" value={pacienteId} />
      <input type="hidden" name="profesionalId" value={profesionalId} />
      <input type="hidden" name="origen" value={origen} />
      {trabajoId ? <input type="hidden" name="trabajoId" value={trabajoId} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id={id("concepto")} etiqueta="Concepto" error={c.concepto}>
          <input id={id("concepto")} name="concepto" maxLength={120} autoComplete="off" defaultValue={s.valores?.concepto ?? concepto} className={claseCampo} {...descrito(id("concepto"), c.concepto)} />
        </Campo>
        <Campo id={id("monto")} etiqueta="Monto" error={c.monto}>
          <input id={id("monto")} name="monto" inputMode="decimal" autoComplete="off" defaultValue={s.valores?.monto ?? monto} className={claseCampo} {...descrito(id("monto"), c.monto)} />
        </Campo>
        <Campo id={id("fecha")} etiqueta="Fecha" error={c.fecha}>
          <input id={id("fecha")} name="fecha" type="date" max={hoy} defaultValue={s.valores?.fecha || hoy} className={claseCampo} {...descrito(id("fecha"), c.fecha)} />
        </Campo>
      </div>
      <AvisoError error={Object.keys(c).length ? undefined : s.error} />
      <AvisoHecho texto={s.hecho} />
      {s.hecho && enlaceCuenta ? <p><Link href={`/pacientes/${pacienteId}/cuenta`} className="text-[14px] text-linear-mist underline underline-offset-4">Ir a la cuenta del paciente</Link></p> : null}
      <button type="submit" disabled={pendiente || (!!s.hecho && !!enlaceCuenta)} className={botonSecundario}>{pendiente ? "Guardando…" : boton}</button>
    </form>
  );
}

export function CorregirMonto({ cargoId, actual }: { cargoId: string; actual: string }) {
  const [s, accion, pendiente] = useActionState<EstadoForm, FormData>(corregirMontoCargo, {});
  const [abierto, setAbierto] = useState(false);
  const e = s.error?.campos?.monto;
  if (!abierto) return <button type="button" onClick={() => setAbierto(true)} className={botonSecundario}>Corregir monto</button>;
  return (
    <form action={accion} noValidate className="space-y-3">
      <input type="hidden" name="cargoId" value={cargoId} />
      <Campo id={`nuevo-${cargoId}`} etiqueta="Monto correcto" error={e}>
        <input id={`nuevo-${cargoId}`} name="monto" inputMode="decimal" autoComplete="off" defaultValue={s.valores?.monto ?? actual.replace(".", ",")} className={claseCampo} {...descrito(`nuevo-${cargoId}`, e)} />
      </Campo>
      {!e ? <AvisoError error={s.error} /> : null}
      <AvisoHecho texto={s.hecho} />
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={pendiente} className={botonPrimario}>{pendiente ? "Guardando…" : "Guardar monto"}</button>
        <button type="button" onClick={() => setAbierto(false)} className={botonSecundario}>Cancelar</button>
      </div>
    </form>
  );
}

/** Anular un cargo o un cobro: pide el motivo y avisa qué pasa con el registro. */
export function AnularConMotivo({ tipo, id, aviso }: { tipo: "cargo" | "cobro"; id: string; aviso: string }) {
  const [s, accion, pendiente] = useActionState<EstadoForm, FormData>(tipo === "cargo" ? anularCargoForm : anularCobroForm, {});
  const [abierto, setAbierto] = useState(false);
  const e = s.error?.campos?.motivo;
  if (!abierto && !s.error) return <button type="button" onClick={() => setAbierto(true)} className={botonSecundario}>Anular {tipo}</button>;
  return (
    <form action={accion} noValidate className="space-y-3">
      <input type="hidden" name={tipo === "cargo" ? "cargoId" : "cobroId"} value={id} />
      <p className="text-[14px] text-linear-mist">{aviso}</p>
      <Campo id={`motivo-${id}`} etiqueta="Motivo" error={e}>
        <input id={`motivo-${id}`} name="motivo" maxLength={300} autoComplete="off" defaultValue={s.valores?.motivo} className={claseCampo} {...descrito(`motivo-${id}`, e)} />
      </Campo>
      {!e ? <AvisoError error={s.error} /> : null}
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={pendiente} className={botonPeligro}>{pendiente ? "Anulando…" : `Sí, anular ${tipo}`}</button>
        <button type="button" onClick={() => setAbierto(false)} className={botonSecundario}>No, volver</button>
      </div>
    </form>
  );
}

export function AplicarACuenta({ pacienteId, profesionalId, aCuenta }: { pacienteId: string; profesionalId: string; aCuenta: string }) {
  const [s, accion, pendiente] = useActionState<EstadoForm, FormData>(aplicarACuentaForm, {});
  return (
    <form action={accion} className="space-y-2">
      <input type="hidden" name="pacienteId" value={pacienteId} />
      <input type="hidden" name="profesionalId" value={profesionalId} />
      <AvisoError error={s.error} />
      <AvisoHecho texto={s.hecho} />
      <button type="submit" disabled={pendiente} className={botonSecundario}>{pendiente ? "Aplicando…" : `Aplicar ${aCuenta} a los cargos pendientes`}</button>
    </form>
  );
}
