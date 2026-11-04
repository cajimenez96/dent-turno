// Reglas puras de la sesión: sin base de datos, para poder probarlas con facilidad.

export const INACTIVIDAD_MS = 30 * 60 * 1000; // RF-02, RNF-09
export const DURACION_MAXIMA_MS = 12 * 60 * 60 * 1000;
export const AVISO_ANTES_MS = 2 * 60 * 1000;
export const REFRESCO_ACTIVIDAD_MS = 60 * 1000;

export const MAX_INTENTOS_FALLIDOS = 5;
export const VENTANA_INTENTOS_MS = 15 * 60 * 1000;

export type EstadoSesion = "valida" | "inactiva" | "caducada";

export function evaluarSesion(
  sesion: { creadaAt: Date; ultimaActividad: Date },
  ahora: Date = new Date(),
): EstadoSesion {
  if (ahora.getTime() - sesion.creadaAt.getTime() > DURACION_MAXIMA_MS) return "caducada";
  if (ahora.getTime() - sesion.ultimaActividad.getTime() > INACTIVIDAD_MS) return "inactiva";
  return "valida";
}

/** La actividad se registra como mucho una vez por minuto, para no escribir de más. */
export function debeRefrescarActividad(ultimaActividad: Date, ahora: Date = new Date()): boolean {
  return ahora.getTime() - ultimaActividad.getTime() >= REFRESCO_ACTIVIDAD_MS;
}

/** Milisegundos que le quedan a la sesión antes de cerrarse por inactividad. */
export function msHastaCierre(ultimaActividad: Date, ahora: Date = new Date()): number {
  return Math.max(0, ultimaActividad.getTime() + INACTIVIDAD_MS - ahora.getTime());
}

export function ingresoBloqueado(fallidosEnVentana: number): boolean {
  return fallidosEnVentana >= MAX_INTENTOS_FALLIDOS;
}

export const LARGO_MINIMO_CLAVE = 12;

export function validarClave(clave: string): string | null {
  if (clave.length < LARGO_MINIMO_CLAVE) return `La clave debe tener al menos ${LARGO_MINIMO_CLAVE} caracteres.`;
  return null;
}
