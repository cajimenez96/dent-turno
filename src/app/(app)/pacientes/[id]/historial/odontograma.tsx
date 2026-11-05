import Link from "next/link";
import { filaDeCuadrantes, NOMBRE_CUADRANTE, piezasDeCuadrante } from "@/server/clinico/fdi";
import type { EntradaOdontograma } from "@/server/clinico/trabajos";

type Props = { porPieza: Map<string, EntradaOdontograma[]>; seleccionada?: string; base: string };

function Cuadrante({ cuadrante, desde, hasta, porPieza, seleccionada, base }: Props & { cuadrante: number; desde: number; hasta: number }) {
  return (
    <div role="group" aria-label={NOMBRE_CUADRANTE[cuadrante]} className="overflow-x-auto">
      <ul className="flex gap-1">
        {piezasDeCuadrante(cuadrante, desde, hasta).map((p) => {
          const n = porPieza.get(p)?.length ?? 0;
          const activa = seleccionada === p;
          return (
            <li key={p} className="min-w-[34px] flex-1">
              <Link
                href={activa ? base : `${base}?pieza=${p}`}
                aria-current={activa ? "true" : undefined}
                aria-label={`Pieza ${p}${n ? `, ${n} tratamiento${n === 1 ? "" : "s"}` : ", sin tratamientos"}${activa ? ", seleccionada" : ""}`}
                className={`flex min-h-[44px] w-full flex-col items-center justify-center rounded-[6px] border px-1 text-[13px] ${
                  activa ? "border-linear-paper bg-linear-graphite text-linear-paper" : n ? "border-linear-fog bg-linear-obsidian text-linear-paper" : "border-linear-graphite text-linear-fog"
                } hover:border-linear-mist`}
              >
                <span className="font-linear-mono">{p}</span>
                <span aria-hidden="true" className="h-2 text-[10px] leading-none">{n ? "●".repeat(Math.min(n, 3)) : ""}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Arcada({ cuadrantes, ...resto }: Props & { cuadrantes: readonly (readonly [number, number, number])[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 sm:gap-6">
      {cuadrantes.map(([c, desde, hasta]) => (
        <Cuadrante key={c} cuadrante={c} desde={desde} hasta={hasta} {...resto} />
      ))}
    </div>
  );
}

/** Mapa de la boca. Cada pieza es un enlace a su ficha (?pieza=NN); los puntos y el aria-label dicen cuántos tratamientos tiene, no solo el color. */
export function Odontograma(props: Props) {
  const conTemporarias = [...props.porPieza.keys()].some((p) => Number(p[0]) >= 5);
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-linear-fog">Vista de frente: la derecha del paciente queda a la izquierda. ● marca piezas con tratamientos registrados.</p>
      <Arcada cuadrantes={filaDeCuadrantes.permanentesSuperior} {...props} />
      <div className="border-t border-linear-graphite" aria-hidden="true" />
      <Arcada cuadrantes={filaDeCuadrantes.permanentesInferior} {...props} />
      <details open={conTemporarias} className="pt-1">
        <summary className="objetivo-tactil flex cursor-pointer items-center text-[14px] text-linear-mist">Dentición temporaria</summary>
        <div className="mt-3 space-y-3">
          <Arcada cuadrantes={filaDeCuadrantes.temporariasSuperior} {...props} />
          <Arcada cuadrantes={filaDeCuadrantes.temporariasInferior} {...props} />
        </div>
      </details>
    </div>
  );
}
