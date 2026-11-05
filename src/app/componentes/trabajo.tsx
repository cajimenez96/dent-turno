import type { PiezaTratada } from "@/server/clinico/trabajos";

/** Piezas de un trabajo como etiquetas de texto: "36 · Restauración (M, O)". */
export function ListaPiezas({ piezas }: { piezas: PiezaTratada[] }) {
  if (piezas.length === 0) return <span className="text-[13px] text-linear-fog">Sin piezas indicadas</span>;
  return (
    <ul className="flex flex-wrap gap-2">
      {piezas.map((p) => (
        <li key={`${p.pieza}-${p.tratamiento}`} className="rounded-[6px] border border-linear-graphite px-2 py-1 text-[13px] text-linear-mist">
          <span className="font-linear-mono text-linear-paper">{p.pieza}</span> · {p.tratamiento}
          {p.caras.length ? ` (${p.caras.join(", ")})` : ""}
        </li>
      ))}
    </ul>
  );
}
