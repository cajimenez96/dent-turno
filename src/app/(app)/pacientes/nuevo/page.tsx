import Link from "next/link";
import { exigirPagina, param } from "@/server/pagina";
import { EncabezadoPagina, tarjeta } from "@/app/componentes/ui";
import { FormularioPaciente } from "../formulario-paciente";

export const metadata = { title: "Nuevo paciente" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function PaginaNuevoPaciente({ searchParams }: Props) {
  const q = await searchParams;
  await exigirPagina("pacientes.editar");
  // Si venían de buscar "Pérez Ana", se adelanta el apellido para ahorrar tipeo.
  const buscado = param(q.buscado).trim();
  const [apellido = "", ...resto] = buscado.split(/\s+/);
  const volver = param(q.volver);
  const atras = volver ? `/agenda/nuevo?${volver.replace(/[^A-Za-z0-9=&:-]/g, "")}` : "/pacientes";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <p><Link href={atras} className="objetivo-tactil inline-flex items-center text-[14px] text-linear-mist underline underline-offset-4 hover:text-linear-paper">← {volver ? "Volver al turno" : "Volver a pacientes"}</Link></p>
      <EncabezadoPagina titulo="Nuevo paciente" />
      <div className={tarjeta}>
        <FormularioPaciente inicial={{ apellido: apellido && !/^\d+$/.test(apellido) ? apellido : "", nombre: resto.join(" ") }} volverATurno={volver || undefined} />
      </div>
    </div>
  );
}
