"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { buscarPacientesAccion } from "@/server/acciones/pacientes";
import type { PacienteResumen } from "@/server/pacientes/servicio";
import { claseCampo } from "@/app/componentes/ui";

type Estado = { fase: "reposo" } | { fase: "buscando" } | { fase: "listo"; pacientes: PacienteResumen[] } | { fase: "error" };

const nombre = (p: PacienteResumen) => `${p.apellido}, ${p.nombre}`;
const detalle = (p: PacienteResumen) => [p.numeroDocumento ? `${p.tipoDocumento} ${p.numeroDocumento}` : "sin documento", p.telefono].filter(Boolean).join(" · ");

/** Busca pacientes mientras se escribe. El elegido viaja en el campo oculto `pacienteId`. */
export function SelectorPaciente({ inicial, error, volver }: { inicial: PacienteResumen | null; error?: string; volver: string }) {
  const id = useId();
  const [elegido, setElegido] = useState<PacienteResumen | null>(inicial);
  const [texto, setTexto] = useState("");
  const [estado, setEstado] = useState<Estado>({ fase: "reposo" });
  const pedido = useRef(0);

  useEffect(() => {
    const t = texto.trim();
    if (t.length < 2) return;
    const mio = ++pedido.current;
    const espera = setTimeout(async () => {
      try {
        const r = await buscarPacientesAccion(t);
        if (mio !== pedido.current) return; // llegó una respuesta vieja
        setEstado(r.ok ? { fase: "listo", pacientes: r.pacientes } : { fase: "error" });
      } catch {
        if (mio === pedido.current) setEstado({ fase: "error" });
      }
    }, 250);
    return () => clearTimeout(espera);
  }, [texto]);

  const corto = texto.trim().length < 2;
  const fase = corto ? "reposo" : estado.fase;
  const nuevoHref = `/pacientes/nuevo?volver=${encodeURIComponent(volver)}${texto.trim() ? `&buscado=${encodeURIComponent(texto.trim())}` : ""}`;

  if (elegido) {
    return (
      <div>
        <input type="hidden" name="pacienteId" value={elegido.id} />
        <p className="block text-[13px] font-medium text-linear-mist">Paciente</p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3 rounded-[6px] border border-linear-ash bg-linear-obsidian px-3 py-2.5">
          <div>
            <p className="text-[15px] text-linear-paper">{nombre(elegido)}</p>
            <p className="text-[13px] text-linear-fog">{detalle(elegido)}</p>
          </div>
          <button type="button" onClick={() => { setElegido(null); setTexto(""); }} className="objetivo-tactil text-[14px] text-linear-mist underline underline-offset-4 hover:text-linear-paper">
            Cambiar paciente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <label htmlFor={id} className="block text-[13px] font-medium text-linear-mist">Paciente</label>
      <input
        id={id}
        type="search"
        autoComplete="off"
        value={texto}
        onChange={(e) => { setTexto(e.target.value); if (e.target.value.trim().length >= 2) setEstado({ fase: "buscando" }); }}
        placeholder="Apellido, nombre o documento"
        className={claseCampo}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-estado ${id}-error` : `${id}-estado`}
      />
      <div id={`${id}-estado`} aria-live="polite" className="mt-2 text-[14px]">
        {fase === "reposo" ? <p className="text-linear-fog">Escribí al menos 2 letras o el documento.</p> : null}
        {fase === "buscando" ? <p className="text-linear-fog">Buscando…</p> : null}
        {fase === "error" ? <p className="text-linear-coral-red">No pudimos buscar. Revisá tu conexión y volvé a escribir.</p> : null}
        {!corto && estado.fase === "listo" && estado.pacientes.length === 0 ? (
          <p className="text-linear-mist">
            No encontramos pacientes con “{texto.trim()}”.{" "}
            <Link href={nuevoHref} className="underline underline-offset-4 hover:text-linear-paper">Crear paciente nuevo</Link>
          </p>
        ) : null}
      </div>
      {error ? <p id={`${id}-error`} className="mt-1 text-[13px] text-linear-coral-red">{error}</p> : null}
      {!corto && estado.fase === "listo" && estado.pacientes.length > 0 ? (
        <ul className="mt-1 divide-y divide-linear-graphite rounded-[6px] border border-linear-ash">
          {estado.pacientes.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => setElegido(p)} className="objetivo-tactil block w-full px-3 py-2.5 text-left hover:bg-linear-obsidian">
                <span className="block text-[15px] text-linear-paper">{nombre(p)}</span>
                <span className="block text-[13px] text-linear-fog">{detalle(p)}</span>
              </button>
            </li>
          ))}
          <li className="px-3 py-2.5 text-[14px]">
            <Link href={nuevoHref} className="text-linear-mist underline underline-offset-4 hover:text-linear-paper">¿No está? Crear paciente nuevo</Link>
          </li>
        </ul>
      ) : null}
    </div>
  );
}
