import { after } from "next/server";
import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { getDb } from "@/server/db/cliente";
import { usuarioActual } from "@/server/auth/sesiones";
import { FormularioIngreso } from "./formulario";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ingresar" };

export default async function PaginaIngresar() {
  if (await usuarioActual()) redirect("/agenda");

  // Neon apaga la base tras 5 minutos sin uso. Despertarla ahora, sin hacer esperar a la
  // página, evita que la primera consulta tras ingresar sea la lenta.
  after(async () => {
    try {
      await getDb().execute(sql`select 1`);
    } catch {
      // Si falla acá, el ingreso mostrará su propio error.
    }
  });

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col justify-center px-4 py-10">
      <div className="grid overflow-hidden rounded-lg border border-hairline bg-canvas md:grid-cols-2">
        {/* Formulario primero: también en móvil, donde el logo pasa a ser un encabezado compacto. */}
        <section className="p-6 sm:p-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-doctora.svg" alt="Logo del consultorio" className="mb-6 h-12 w-12 md:hidden" />
          <h1 className="text-[28px] leading-[1.25] font-semibold text-ink">Ingresar</h1>
          <p className="mt-1 text-[14px] text-steel">Usá tu email y tu clave para ver la agenda.</p>
          <FormularioIngreso />
        </section>
        <aside className="hidden items-center justify-center border-l border-hairline bg-surface p-8 md:flex">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-doctora.svg" alt="Logo del consultorio" className="h-auto w-full max-w-[16rem]" />
        </aside>
      </div>
    </main>
  );
}
