import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "drizzle-orm";
import { getDb } from "@/server/db/cliente";
import { obtenerPaciente } from "@/server/pacientes/servicio";
import { exigirPagina, param } from "@/server/pagina";
import { concesionesDe } from "@/server/auth/sesiones";
import { puede } from "@/server/permisos";
import { aFecha, etiquetaDiaCap, fechaDe, horaDe } from "@/server/tiempo";
import { botonPrimario, botonSecundario, EncabezadoPagina, EtiquetaEstado, tarjeta } from "@/app/componentes/ui";
import { FormularioPaciente } from "../formulario-paciente";
import { DesactivarPaciente } from "./desactivar";

export const metadata = { title: "Paciente" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function PaginaPaciente({ params, searchParams }: Props) {
  const { id } = await params;
  const q = await searchParams;
  const usuario = await exigirPagina("pacientes.ver");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = getDb();
  const p = await obtenerPaciente(db, id);
  if (!p) notFound();
  const concesiones = await concesionesDe(usuario.id);
  const editar = puede(concesiones, "pacientes.editar");
  const agendar = puede(concesiones, "agenda.editar");

  const { rows } = await db.execute<{ id: string; inicio: Date; fin: Date; estado: "programado" | "atendido" | "ausente" | "cancelado"; liberado: boolean }>(sql`
    select id, lower(rango) as inicio, upper(rango) as fin, estado, horario_liberado as liberado
    from turnos where paciente_id = ${id} order by lower(rango) desc limit 10`);
  const turnos = rows.map((t) => ({ ...t, inicio: aFecha(t.inicio), fin: aFecha(t.fin) }));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <p><Link href="/pacientes" className="objetivo-tactil inline-flex items-center text-[14px] text-linear-mist underline underline-offset-4 hover:text-linear-paper">← Volver a pacientes</Link></p>
      <EncabezadoPagina
        titulo={`${p.apellido}, ${p.nombre}`}
        subtitulo={p.activo ? undefined : "Paciente desactivado"}
        accion={agendar && p.activo ? <Link href={`/agenda/nuevo?paciente=${p.id}`} className={botonPrimario}>Dar turno</Link> : null}
      />
      {param(q.guardado) ? <p role="status" className="text-[14px] text-linear-pulse-green">Cambios guardados.</p> : null}

      <section className={tarjeta} aria-labelledby="h-datos">
        <h2 id="h-datos" className="mb-4 text-[16px] font-medium text-linear-paper">Datos</h2>
        {editar ? (
          <FormularioPaciente
            id={p.id}
            inicial={{ nombre: p.nombre, apellido: p.apellido, tipoDocumento: p.tipoDocumento, numeroDocumento: p.numeroDocumento ?? "", telefono: p.telefono ?? "", nacimiento: p.nacimiento ?? "", email: p.email ?? "" }}
          />
        ) : (
          <dl className="grid gap-3 sm:grid-cols-2 text-[15px]">
            <div><dt className="text-[13px] text-linear-fog">Documento</dt><dd>{p.numeroDocumento ? `${p.tipoDocumento} ${p.numeroDocumento}` : "—"}</dd></div>
            <div><dt className="text-[13px] text-linear-fog">Teléfono</dt><dd>{p.telefono ?? "—"}</dd></div>
            <div><dt className="text-[13px] text-linear-fog">Nacimiento</dt><dd>{p.nacimiento ? p.nacimiento.split("-").reverse().join("/") : "—"}</dd></div>
            <div><dt className="text-[13px] text-linear-fog">Email</dt><dd>{p.email ?? "—"}</dd></div>
          </dl>
        )}
      </section>

      {puede(concesiones, "clinico.ver") ? (
        <section className={tarjeta} aria-labelledby="h-historial">
          <h2 id="h-historial" className="text-[16px] font-medium text-linear-paper">Historial clínico</h2>
          <p className="mt-1 text-[14px] text-linear-fog">Trabajos realizados, piezas dentales y registro de cambios.</p>
          <p className="mt-3"><Link href={`/pacientes/${p.id}/historial`} className={botonSecundario}>Ver historial clínico</Link></p>
        </section>
      ) : null}

      <section className={tarjeta} aria-labelledby="h-turnos">
        <h2 id="h-turnos" className="text-[16px] font-medium text-linear-paper">Turnos</h2>
        {turnos.length === 0 ? (
          <p className="mt-2 text-[14px] text-linear-fog">Todavía no tiene turnos.</p>
        ) : (
          <ul className="mt-2 divide-y divide-linear-graphite">
            {turnos.map((t) => (
              <li key={t.id}>
                <Link href={`/agenda/turnos/${t.id}`} className="objetivo-tactil flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 hover:bg-linear-obsidian">
                  <span className="text-[15px] text-linear-bone">{etiquetaDiaCap(fechaDe(t.inicio))} · <span className="font-linear-mono text-[14px]">{horaDe(t.inicio)}</span></span>
                  <EtiquetaEstado estado={t.estado} liberado={t.liberado} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {editar && p.activo ? (
        <section className={tarjeta} aria-labelledby="h-desactivar">
          <h2 id="h-desactivar" className="mb-3 text-[16px] font-medium text-linear-paper">Desactivar</h2>
          <DesactivarPaciente id={p.id} />
        </section>
      ) : null}
    </div>
  );
}
