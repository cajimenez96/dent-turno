// Fechas y horas del consultorio. Argentina no tiene horario de verano desde 2009, así que
// America/Argentina/Buenos_Aires es siempre UTC-3 y alcanza con un desfase fijo.
export const ZONA = "America/Argentina/Buenos_Aires";
const DESFASE_MS = 3 * 60 * 60 * 1000;
const DIA_MS = 24 * 60 * 60 * 1000;

/** Fecha real: "2026-02-30" no pasa (Date la correría al 2 de marzo, así que se compara de ida y vuelta). */
export const esFecha = (v: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};
export const esHora = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

/** "2026-11-02" + "09:30" en hora de Buenos Aires → instante. */
export function aInstante(fecha: string, hora: string): Date {
  return new Date(`${fecha}T${hora}:00-03:00`);
}

/** Fecha (AAAA-MM-DD) en Buenos Aires de un instante. */
export function fechaDe(instante: Date): string {
  return new Date(instante.getTime() - DESFASE_MS).toISOString().slice(0, 10);
}

/** Hora (HH:MM) en Buenos Aires de un instante. */
export function horaDe(instante: Date): string {
  return new Date(instante.getTime() - DESFASE_MS).toISOString().slice(11, 16);
}

export const hoy = (ahora = new Date()) => fechaDe(ahora);

export function sumarDias(fecha: string, dias: number): string {
  return new Date(Date.parse(`${fecha}T00:00:00Z`) + dias * DIA_MS).toISOString().slice(0, 10);
}

/** Día ISO: 1 = lunes ... 7 = domingo. */
export function diaIso(fecha: string): number {
  const d = new Date(`${fecha}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

export const lunesDe = (fecha: string) => sumarDias(fecha, 1 - diaIso(fecha));

export function minutosDe(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

const NOMBRES_DIA = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
export const nombreDia = (iso: number) => NOMBRES_DIA[iso - 1];

export function etiquetaDia(fecha: string): string {
  return new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(`${fecha}T00:00:00Z`),
  );
}

/** Igual que etiquetaDia, con la primera letra en mayúscula (para títulos). */
export const etiquetaDiaCap = (fecha: string) => {
  const t = etiquetaDia(fecha);
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export function etiquetaSemana(lunes: string): string {
  const f = (v: string, conAnio: boolean) =>
    new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long", ...(conAnio ? { year: "numeric" } : {}), timeZone: "UTC" }).format(
      new Date(`${v}T00:00:00Z`),
    );
  return `${f(lunes, false)} al ${f(sumarDias(lunes, 6), true)}`;
}

/** Literal de rango semiabierto [inicio, fin) para castear con ::tstzrange. */
export const literalRango = (inicio: Date, fin: Date) => `[${inicio.toISOString()},${fin.toISOString()})`;

/** Drizzle devuelve los timestamptz de `execute` como texto ("2026-11-10 13:00:00+00"); esto los pasa a Date. */
export const aFecha = (v: Date | string): Date => (v instanceof Date ? v : new Date(v));
