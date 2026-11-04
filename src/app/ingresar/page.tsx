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
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="rounded-[12px] border border-linear-graphite bg-linear-carbon p-6 sm:p-8">
        <h1 className="text-[24px] leading-[1.33] font-normal tracking-[-0.288px] text-linear-paper">Ingresar</h1>
        <p className="mt-1 text-[15px] text-linear-fog">Usá tu email y tu clave para ver la agenda.</p>
        <FormularioIngreso />
      </div>
    </main>
  );
}
