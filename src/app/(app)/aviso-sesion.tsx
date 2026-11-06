"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { salir, seguirTrabajando } from "@/server/acciones/auth";

const AVISO_ANTES_MS = 2 * 60 * 1000; // igual que AVISO_ANTES_MS de server/auth/reglas.ts
const INACTIVIDAD_MS = 30 * 60 * 1000;

/** Avisa 2 minutos antes de que la sesión se cierre por inactividad, y deja seguir. */
export function AvisoSesion({ msHastaCierre }: { msHastaCierre: number }) {
  const router = useRouter();
  const dialogo = useRef<HTMLDialogElement>(null);
  const [restante, setRestante] = useState<number | null>(null);
  const [cierraEn, setCierraEn] = useState(() => Date.now() + msHastaCierre);

  useEffect(() => {
    const ahora = Date.now();
    const hastaAviso = Math.max(0, cierraEn - AVISO_ANTES_MS - ahora);
    const temporizador = setTimeout(() => {
      setRestante(Math.max(0, cierraEn - Date.now()));
      dialogo.current?.showModal();
    }, hastaAviso);
    return () => clearTimeout(temporizador);
  }, [cierraEn]);

  useEffect(() => {
    if (restante === null) return;
    const intervalo = setInterval(() => {
      const faltan = cierraEn - Date.now();
      if (faltan <= 0) {
        clearInterval(intervalo);
        dialogo.current?.close();
        router.refresh(); // la página vuelve al ingreso porque la sesión ya venció
      } else {
        setRestante(faltan);
      }
    }, 1000);
    return () => clearInterval(intervalo);
  }, [restante === null, cierraEn, router]); // eslint-disable-line react-hooks/exhaustive-deps

  async function continuar() {
    const { ok } = await seguirTrabajando();
    dialogo.current?.close();
    setRestante(null);
    if (ok) setCierraEn(Date.now() + INACTIVIDAD_MS);
    else router.refresh();
  }

  const minutos = restante === null ? 0 : Math.floor(restante / 60000);
  const segundos = restante === null ? 0 : Math.floor((restante % 60000) / 1000);

  return (
    <dialog
      ref={dialogo}
      aria-labelledby="titulo-aviso"
      className="m-auto w-[min(92vw,24rem)] rounded-lg border border-hairline bg-canvas p-6 text-ink backdrop:bg-black/60"
    >
      <h2 id="titulo-aviso" className="text-[20px] font-medium tracking-[-0.24px] text-ink">
        ¿Seguís trabajando?
      </h2>
      <p className="mt-2 text-[15px] text-steel" role="timer">
        Tu sesión se va a cerrar en {minutos}:{String(segundos).padStart(2, "0")} por inactividad.
      </p>
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <form action={salir}>
          <button
            type="submit"
            className="objetivo-tactil rounded-full border border-stone px-4 py-2.5 text-[15px] text-ink hover:bg-surface"
          >
            Salir
          </button>
        </form>
        <button
          type="button"
          autoFocus
          onClick={continuar}
          className="objetivo-tactil rounded-full bg-primary px-4 py-2.5 text-[15px] font-medium text-on-primary hover:bg-charcoal"
        >
          Seguir trabajando
        </button>
      </div>
    </dialog>
  );
}
