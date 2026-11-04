import { redirect } from "next/navigation";
import { exigir } from "@/server/auth/sesiones";
import { ErrorPermiso } from "@/server/permisos";
import { msHastaCierre } from "@/server/auth/reglas";
import { salir } from "@/server/acciones/auth";
import { AvisoSesion } from "./aviso-sesion";

export const dynamic = "force-dynamic";
export const metadata = { title: "Agenda" };

export default async function PaginaAgenda() {
  let usuario;
  try {
    usuario = await exigir("agenda.ver");
  } catch (error) {
    if (error instanceof ErrorPermiso) redirect("/ingresar");
    throw error;
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <header className="flex items-center justify-between gap-4 border-b border-linear-graphite pb-4">
        <div>
          <h1 className="text-[20px] leading-[1.33] font-medium tracking-[-0.24px] text-linear-paper">Agenda</h1>
          <p className="text-[13px] text-linear-fog">Sesión de {usuario.nombre}</p>
        </div>
        <form action={salir}>
          <button
            type="submit"
            className="objetivo-tactil rounded-[6px] border border-linear-ash px-4 py-2.5 text-[15px] text-linear-mist hover:border-linear-fog"
          >
            Salir
          </button>
        </form>
      </header>

      <section aria-labelledby="vacio" className="mt-10 rounded-[12px] border border-linear-graphite bg-linear-carbon p-6">
        <h2 id="vacio" className="text-[20px] font-medium tracking-[-0.24px] text-linear-paper">
          Todavía no hay turnos
        </h2>
        <p className="mt-2 max-w-prose text-[15px] text-linear-fog">
          La agenda, los pacientes y los turnos llegan en la próxima fase. Por ahora podés ingresar y salir.
        </p>
      </section>

      <AvisoSesion msHastaCierre={msHastaCierre(usuario.ultimaActividad)} />
    </div>
  );
}
