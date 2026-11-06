import Link from "next/link";
import { getDb } from "@/server/db/cliente";
import { buscarPacientes } from "@/server/pacientes/servicio";
import { exigirPagina, param } from "@/server/pagina";
import { concesionesDe } from "@/server/auth/sesiones";
import { puede } from "@/server/permisos";
import { botonPrimario, botonSecundario, claseCampo, EncabezadoPagina, tarjeta } from "@/app/componentes/ui";

export const metadata = { title: "Pacientes" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function PaginaPacientes({ searchParams }: Props) {
  const q = await searchParams;
  const usuario = await exigirPagina("pacientes.ver");
  const texto = param(q.q).trim();
  const [pacientes, concesiones] = await Promise.all([buscarPacientes(getDb(), texto, 50), concesionesDe(usuario.id)]);
  const editar = puede(concesiones, "pacientes.editar");

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        titulo="Pacientes"
        subtitulo={texto ? `${pacientes.length} resultado(s) para “${texto}”` : "Ordenados por apellido"}
        accion={editar ? <Link href="/pacientes/nuevo" className={botonPrimario}>Nuevo paciente</Link> : null}
      />
      {param(q.desactivado) ? <p role="status" className="text-[14px] text-success-text">Paciente desactivado.</p> : null}

      <form action="/pacientes" role="search" className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <label htmlFor="q" className="block text-[13px] font-medium text-slate">Buscar por apellido, nombre o documento</label>
          <input id="q" name="q" type="search" defaultValue={texto} autoComplete="off" className={claseCampo} />
        </div>
        <button type="submit" className={botonSecundario}>Buscar</button>
        {texto ? <Link href="/pacientes" className="objetivo-tactil inline-flex items-center text-[14px] text-slate underline underline-offset-4">Quitar búsqueda</Link> : null}
      </form>

      {pacientes.length === 0 ? (
        <section className={tarjeta}>
          <h2 className="text-[16px] font-medium text-ink">{texto ? "No encontramos pacientes con ese dato" : "Todavía no hay pacientes"}</h2>
          <p className="mt-1 text-[14px] text-steel">{texto ? "Revisá cómo está escrito, o probá solo con el apellido." : "Cargá el primero para poder darle un turno."}</p>
          {editar ? <p className="mt-3"><Link href={`/pacientes/nuevo${texto ? `?buscado=${encodeURIComponent(texto)}` : ""}`} className={botonSecundario}>Crear paciente</Link></p> : null}
        </section>
      ) : (
        <ul className={`${tarjeta} divide-y divide-hairline !p-0`}>
          {pacientes.map((p) => (
            <li key={p.id}>
              <Link href={`/pacientes/${p.id}`} className="objetivo-tactil flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 py-3 hover:bg-surface">
                <span className="text-[15px] text-ink">{p.apellido}, {p.nombre}</span>
                <span className="text-[13px] text-steel">
                  {[p.numeroDocumento ? `${p.tipoDocumento} ${p.numeroDocumento}` : "Sin documento", p.telefono].filter(Boolean).join(" · ")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
