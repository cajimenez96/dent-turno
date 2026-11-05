"use client";

import Link from "next/link";
import { useActionState } from "react";
import { guardarPaciente } from "@/server/acciones/pacientes";
import type { EstadoForm } from "@/server/acciones/comun";
import type { Duplicado, PacienteResumen } from "@/server/pacientes/servicio";
import { AvisoError, botonPrimario, botonSecundario, Campo, claseCampo, descrito, PanelConfirmacion } from "@/app/componentes/ui";

type Valores = Partial<Record<"nombre" | "apellido" | "tipoDocumento" | "numeroDocumento" | "telefono" | "nacimiento" | "email", string>>;

const etiquetaDup = (d: PacienteResumen) =>
  `${d.apellido}, ${d.nombre}${d.numeroDocumento ? ` · ${d.tipoDocumento} ${d.numeroDocumento}` : ""}${d.nacimiento ? ` · nació el ${d.nacimiento.split("-").reverse().join("/")}` : ""}`;

export function FormularioPaciente({ id, inicial, volverATurno }: { id?: string; inicial: Valores; volverATurno?: string }) {
  const [estado, accion, pendiente] = useActionState<EstadoForm, FormData>(guardarPaciente, {});
  const v = { ...inicial, ...estado.valores };
  const campos = estado.error?.campos ?? {};
  const duplicados = estado.error?.codigo === "REQUIERE_CONFIRMACION" ? ((estado.error.detalle as { duplicados?: Duplicado[] })?.duplicados ?? []) : [];
  const existente = (estado.error?.detalle as { existente?: PacienteResumen } | undefined)?.existente;

  return (
    <form action={accion} noValidate aria-busy={pendiente} className="space-y-5">
      {id ? <input type="hidden" name="id" value={id} /> : null}
      {volverATurno ? <input type="hidden" name="volverATurno" value={volverATurno} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="apellido" etiqueta="Apellido" error={campos.apellido}>
          <input id="apellido" name="apellido" required autoComplete="off" defaultValue={v.apellido} className={claseCampo} {...descrito("apellido", campos.apellido)} />
        </Campo>
        <Campo id="nombre" etiqueta="Nombre" error={campos.nombre}>
          <input id="nombre" name="nombre" required autoComplete="off" defaultValue={v.nombre} className={claseCampo} {...descrito("nombre", campos.nombre)} />
        </Campo>
      </div>

      <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
        <Campo id="tipoDocumento" etiqueta="Documento">
          <select key={`doc-${v.tipoDocumento ?? "DNI"}`} id="tipoDocumento" name="tipoDocumento" defaultValue={v.tipoDocumento ?? "DNI"} className={claseCampo}>
            <option value="DNI">DNI</option>
            <option value="Pasaporte">Pasaporte</option>
            <option value="Otro">Otro</option>
          </select>
        </Campo>
        <Campo id="numeroDocumento" etiqueta="Número" error={campos.numeroDocumento} ayuda="Opcional. Sirve para no cargar dos veces a la misma persona.">
          <input id="numeroDocumento" name="numeroDocumento" inputMode="numeric" autoComplete="off" defaultValue={v.numeroDocumento} className={claseCampo} {...descrito("numeroDocumento", campos.numeroDocumento, "x")} />
        </Campo>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="telefono" etiqueta="Teléfono" error={campos.telefono}>
          <input id="telefono" name="telefono" type="tel" autoComplete="off" defaultValue={v.telefono} className={claseCampo} {...descrito("telefono", campos.telefono)} />
        </Campo>
        <Campo id="nacimiento" etiqueta="Fecha de nacimiento" error={campos.nacimiento}>
          <input id="nacimiento" name="nacimiento" type="date" defaultValue={v.nacimiento} className={claseCampo} {...descrito("nacimiento", campos.nacimiento)} />
        </Campo>
      </div>

      <Campo id="email" etiqueta="Email" error={campos.email}>
        <input id="email" name="email" type="email" autoComplete="off" defaultValue={v.email} className={claseCampo} {...descrito("email", campos.email)} />
      </Campo>

      <AvisoError error={estado.error} />
      {existente ? (
        <p className="text-[14px]">
          <Link href={`/pacientes/${existente.id}`} className="text-linear-mist underline underline-offset-4 hover:text-linear-paper">
            Abrir a {existente.apellido}, {existente.nombre}
          </Link>
        </p>
      ) : null}

      {duplicados.length > 0 ? (
        <PanelConfirmacion titulo="Puede que este paciente ya esté cargado">
          <p>Revisá si es alguno de estos antes de crear uno nuevo:</p>
          <ul className="mt-2 space-y-1">
            {duplicados.map((d) => (
              <li key={d.id}>
                <Link href={`/pacientes/${d.id}`} className="objetivo-tactil inline-flex items-center text-linear-paper underline underline-offset-4">
                  {etiquetaDup(d)}
                </Link>
              </li>
            ))}
          </ul>
        </PanelConfirmacion>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {duplicados.length > 0 ? (
          <>
            <button type="submit" name="confirmar" value="1" disabled={pendiente} className={botonPrimario}>
              {pendiente ? "Guardando…" : "Es otra persona: crear igual"}
            </button>
            <button type="submit" disabled={pendiente} className={botonSecundario}>Volver a revisar</button>
          </>
        ) : (
          <button type="submit" disabled={pendiente} className={botonPrimario}>
            {pendiente ? "Guardando…" : id ? "Guardar cambios" : "Crear paciente"}
          </button>
        )}
      </div>
    </form>
  );
}
