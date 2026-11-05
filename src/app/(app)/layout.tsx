import { redirect } from "next/navigation";
import Link from "next/link";
import { usuarioActual, concesionesDe } from "@/server/auth/sesiones";
import { puede } from "@/server/permisos";
import { msHastaCierre } from "@/server/auth/reglas";
import { salir } from "@/server/acciones/auth";
import { AvisoSesion } from "./aviso-sesion";

export const dynamic = "force-dynamic";

const enlace = "objetivo-tactil inline-flex items-center rounded-[6px] px-3 py-2 text-[15px] text-linear-mist hover:bg-linear-carbon hover:text-linear-paper";

export default async function MarcoApp({ children }: { children: React.ReactNode }) {
  const usuario = await usuarioActual();
  if (!usuario) redirect("/ingresar");
  const concesiones = await concesionesDe(usuario.id);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-16">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-10 focus:rounded-[6px] focus:bg-linear-carbon focus:px-3 focus:py-2">
        Saltar al contenido
      </a>
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-linear-graphite py-3">
        <nav aria-label="Principal" className="-ml-3 flex flex-wrap items-center gap-1">
          {puede(concesiones, "agenda.ver") ? <Link href="/agenda" className={enlace}>Agenda</Link> : null}
          {puede(concesiones, "pacientes.ver") ? <Link href="/pacientes" className={enlace}>Pacientes</Link> : null}
          {puede(concesiones, "cobros.ver") ? <Link href="/cobros" className={enlace}>Cobros</Link> : null}
          {puede(concesiones, "reportes.ver") ? <Link href="/reportes" className={enlace}>Reportes</Link> : null}
          {puede(concesiones, "agenda.configurar") ? <Link href="/configuracion" className={enlace}>Configuración</Link> : null}
        </nav>
        <div className="flex items-center gap-3">
          <span className="text-[13px] text-linear-fog">{usuario.nombre}</span>
          <form action={salir}>
            <button type="submit" className="objetivo-tactil rounded-[6px] border border-linear-ash px-3 py-2 text-[14px] text-linear-mist hover:border-linear-fog">
              Salir
            </button>
          </form>
        </div>
      </header>
      <main id="contenido" className="pt-6">
        {children}
      </main>
      <AvisoSesion msHastaCierre={msHastaCierre(usuario.ultimaActividad)} />
    </div>
  );
}
