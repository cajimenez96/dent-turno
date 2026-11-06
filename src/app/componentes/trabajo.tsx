import type { PiezaTratada } from "@/server/clinico/trabajos";

/** Piezas de un trabajo como etiquetas de texto: "36 · Restauración (M, O)". */
export function ListaPiezas({ piezas }: { piezas: PiezaTratada[] }) {
  if (piezas.length === 0) return <span className="text-[13px] text-steel">Sin piezas indicadas</span>;
  return (
    <ul className="flex flex-wrap gap-2">
      {piezas.map((p) => (
        <li key={`${p.pieza}-${p.tratamiento}`} className="rounded-md border border-hairline px-2 py-1 text-[13px] text-slate">
          <span className="font-family-2 text-ink">{p.pieza}</span> · {p.tratamiento}
          {p.caras.length ? ` (${p.caras.join(", ")})` : ""}
        </li>
      ))}
    </ul>
  );
}
