"use client";

import { useActionState } from "react";
import { ingresar, type EstadoIngreso } from "@/server/acciones/auth";

const campo =
  "objetivo-tactil mt-1 block w-full rounded-[6px] border border-linear-ash bg-linear-obsidian px-3 py-2.5 " +
  "text-[15px] text-linear-paper placeholder:text-linear-fog focus:border-linear-mist";

export function FormularioIngreso() {
  const [estado, accion, pendiente] = useActionState<EstadoIngreso, FormData>(ingresar, {});

  return (
    <form action={accion} className="mt-6 space-y-4" noValidate aria-busy={pendiente}>
      <div>
        <label htmlFor="email" className="block text-[13px] font-medium text-linear-mist">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          defaultValue={estado.email}
          aria-invalid={estado.error ? true : undefined}
          aria-describedby={estado.error ? "error-ingreso" : undefined}
          className={campo}
        />
      </div>
      <div>
        <label htmlFor="clave" className="block text-[13px] font-medium text-linear-mist">
          Clave
        </label>
        <input
          id="clave"
          name="clave"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={estado.error ? true : undefined}
          aria-describedby={estado.error ? "error-ingreso" : undefined}
          className={campo}
        />
      </div>

      {estado.error ? (
        <p id="error-ingreso" role="alert" className="flex items-start gap-2 text-[14px] text-linear-coral-red">
          <svg aria-hidden="true" viewBox="0 0 16 16" className="mt-0.5 h-4 w-4 shrink-0" fill="currentColor">
            <path d="M8 1.5 15 14H1L8 1.5Zm-.75 4.75v3.5h1.5v-3.5h-1.5Zm0 4.75v1.5h1.5V11h-1.5Z" />
          </svg>
          <span>{estado.error}</span>
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pendiente}
        className="objetivo-tactil w-full rounded-[6px] bg-linear-acid-lime px-4 py-2.5 text-[15px] font-medium text-linear-void hover:brightness-95 disabled:cursor-wait disabled:opacity-60"
      >
        {pendiente ? "Ingresando…" : "Ingresar"}
      </button>
    </form>
  );
}
