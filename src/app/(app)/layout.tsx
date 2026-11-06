import { redirect } from "next/navigation";
import { usuarioActual, concesionesDe } from "@/server/auth/sesiones";
import { puede } from "@/server/permisos";
import { msHastaCierre } from "@/server/auth/reglas";
import { salir } from "@/server/acciones/auth";
import { AvisoSesion } from "./aviso-sesion";
import { NavPrincipal, type EnlaceNav } from "./nav-principal";

export const dynamic = "force-dynamic";

export default async function MarcoApp({ children }: { children: React.ReactNode }) {
  const usuario = await usuarioActual();
  if (!usuario) redirect("/ingresar");
  const concesiones = await concesionesDe(usuario.id);
  const enlaces: EnlaceNav[] = [
    ...(puede(concesiones, "agenda.ver") ? [{ href: "/agenda", texto: "Agenda" }] : []),
    ...(puede(concesiones, "pacientes.ver") ? [{ href: "/pacientes", texto: "Pacientes" }] : []),
    ...(puede(concesiones, "agenda.configurar") ? [{ href: "/configuracion", texto: "Configuración" }] : []),
  ];

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-16">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-10 focus:rounded-md focus:bg-canvas focus:px-3 focus:py-2">
        Saltar al contenido
      </a>
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-hairline py-3">
        <NavPrincipal enlaces={enlaces} />
        <div className="flex items-center gap-3">
          <span className="text-[13px] text-steel">{usuario.nombre}</span>
          <form action={salir}>
            <button type="submit" className="objetivo-tactil rounded-full border border-stone px-3 py-2 text-[14px] text-ink hover:bg-surface">
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
