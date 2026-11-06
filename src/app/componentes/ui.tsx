import type { ReactNode } from "react";
import type { ErrorAccion } from "@/server/resultado";

export const claseCampo =
  "objetivo-tactil mt-1 block w-full rounded-md border border-stone bg-canvas px-3 py-2.5 " +
  "text-[15px] text-ink placeholder:text-steel focus:border-brand-green aria-[invalid=true]:border-danger-text";

export const botonPrimario =
  "objetivo-tactil inline-flex items-center justify-center rounded-full bg-primary px-4 py-2.5 text-[15px] font-medium " +
  "text-on-primary hover:bg-charcoal disabled:cursor-wait disabled:opacity-60";

export const botonSecundario =
  "objetivo-tactil inline-flex items-center justify-center rounded-full border border-stone px-4 py-2.5 text-[15px] " +
  "text-ink hover:bg-surface disabled:cursor-wait disabled:opacity-60";

export const botonPeligro =
  "objetivo-tactil inline-flex items-center justify-center rounded-full border border-danger-text px-4 py-2.5 text-[15px] " +
  "text-danger-text hover:bg-surface disabled:cursor-wait disabled:opacity-60";

export const tarjeta = "rounded-lg border border-hairline bg-canvas p-5";

const iconoAlerta = (
  <svg aria-hidden="true" viewBox="0 0 16 16" className="mt-0.5 h-4 w-4 shrink-0" fill="currentColor">
    <path d="M8 1.5 15 14H1L8 1.5Zm-.75 4.75v3.5h1.5v-3.5h-1.5Zm0 4.75v1.5h1.5V11h-1.5Z" />
  </svg>
);

export function Campo({
  id, etiqueta, error, ayuda, children,
}: { id: string; etiqueta: string; error?: string; ayuda?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block text-[13px] font-medium text-slate">
        {etiqueta}
      </label>
      {children}
      {ayuda && !error ? (
        <p id={`${id}-ayuda`} className="mt-1 text-[13px] text-steel">
          {ayuda}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="mt-1 flex items-start gap-2 text-[13px] text-danger-text">
          {iconoAlerta}
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

/** Atributos de accesibilidad para un campo con su error o ayuda. */
export const descrito = (id: string, error?: string, ayuda?: string) => ({
  "aria-invalid": error ? (true as const) : undefined,
  "aria-describedby": error ? `${id}-error` : ayuda ? `${id}-ayuda` : undefined,
});

/** Error general de un formulario. Los códigos que piden confirmación no se muestran acá. */
export function AvisoError({ error }: { error?: ErrorAccion }) {
  if (!error || error.codigo === "REQUIERE_CONFIRMACION") return null;
  return (
    <p role="alert" className="flex items-start gap-2 text-[14px] text-danger-text">
      {iconoAlerta}
      <span>{error.mensaje}</span>
    </p>
  );
}

export function AvisoHecho({ texto }: { texto?: string }) {
  if (!texto) return null;
  return (
    <p role="status" className="flex items-start gap-2 text-[14px] text-success-text">
      <svg aria-hidden="true" viewBox="0 0 16 16" className="mt-0.5 h-4 w-4 shrink-0" fill="currentColor">
        <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm3.2 5.2-3.8 3.8a.75.75 0 0 1-1.06 0L4.8 8.46l1.06-1.06.97.97 3.3-3.3 1.07 1.13Z" />
      </svg>
      <span>{texto}</span>
    </p>
  );
}

/** Recuadro para decisiones que el usuario tiene que confirmar. */
export function PanelConfirmacion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div role="alert" className="rounded-lg border border-brand-tag bg-surface p-4">
      <p className="flex items-start gap-2 text-[15px] font-medium text-ink">
        {iconoAlerta}
        <span>{titulo}</span>
      </p>
      <div className="mt-2 text-[14px] text-slate">{children}</div>
    </div>
  );
}

const ESTADOS = {
  programado: { texto: "Programado", color: "text-slate", icono: "M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm.75 3.5v3.19l2.28 1.37-.77 1.28L7.25 8.4V4.5h1.5Z" },
  atendido: { texto: "Atendido", color: "text-success-text", icono: "M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm3.2 5.2-3.8 3.8a.75.75 0 0 1-1.06 0L4.8 8.46l1.06-1.06.97.97 3.3-3.3 1.07 1.13Z" },
  ausente: { texto: "Ausente", color: "text-danger-text", icono: "M8 1.5 15 14H1L8 1.5Zm-.75 4.75v3.5h1.5v-3.5h-1.5Zm0 4.75v1.5h1.5V11h-1.5Z" },
  cancelado: { texto: "Cancelado", color: "text-steel", icono: "M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1ZM5.28 4.22 8 6.94l2.72-2.72 1.06 1.06L9.06 8l2.72 2.72-1.06 1.06L8 9.06l-2.72 2.72-1.06-1.06L6.94 8 4.22 5.28l1.06-1.06Z" },
} as const;

/** Estado de un turno: siempre con texto e ícono, nunca solo con color (RNF-24). */
export function EtiquetaEstado({ estado, liberado }: { estado: keyof typeof ESTADOS; liberado?: boolean }) {
  const e = ESTADOS[estado];
  return (
    <span className={`inline-flex items-center gap-1.5 text-[13px] ${e.color}`}>
      <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor">
        <path d={e.icono} />
      </svg>
      {e.texto}
      {estado === "ausente" && liberado ? " · horario liberado" : ""}
    </span>
  );
}

export function EncabezadoPagina({ titulo, subtitulo, accion }: { titulo: string; subtitulo?: string; accion?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[22px] leading-[1.3] font-semibold text-ink">{titulo}</h1>
        {subtitulo ? <p className="text-[13px] text-steel">{subtitulo}</p> : null}
      </div>
      {accion}
    </div>
  );
}
