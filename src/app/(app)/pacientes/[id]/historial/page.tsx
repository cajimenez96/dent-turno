import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/server/db/cliente";
import { obtenerPaciente } from "@/server/pacientes/servicio";
import { armarOdontograma, historialPaciente } from "@/server/clinico/trabajos";
import { registrarLecturaClinica } from "@/server/clinico/lectura";
import { esPiezaFdi, NOMBRE_CUADRANTE } from "@/server/clinico/fdi";
import { profesionalesCon } from "@/server/agenda/profesionales";
import { concesionesDe } from "@/server/auth/sesiones";
import { puede } from "@/server/permisos";
import { exigirPagina, param } from "@/server/pagina";
import { formatoMonto } from "@/server/dinero";
import { botonPrimario, EncabezadoPagina, tarjeta } from "@/app/componentes/ui";
import { ListaPiezas } from "@/app/componentes/trabajo";
import { Odontograma } from "./odontograma";

export const metadata = { title: "Historial clínico" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

const dmy = (f: string) => f.split("-").reverse().join("/");

export default async function PaginaHistorial({ params, searchParams }: Props) {
  const { id } = await params;
  const q = await searchParams;
  const usuario = await exigirPagina("clinico.ver");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = getDb();
  const paciente = await obtenerPaciente(db, id);
  if (!paciente) notFound();

  const [visibles, concesiones] = await Promise.all([profesionalesCon(db, usuario.id, "clinico.ver"), concesionesDe(usuario.id)]);
  const trabajos = await historialPaciente(db, id, visibles.map((p) => p.id));
  await registrarLecturaClinica(usuario.id, id);

  const porPieza = armarOdontograma(trabajos);
  const pedida = param(q.pieza);
  const pieza = esPiezaFdi(pedida) ? pedida : undefined;
  const base = `/pacientes/${id}/historial`;
  const mostrados = pieza ? trabajos.filter((t) => t.piezas.some((p) => p.pieza === pieza)) : trabajos;
  const editar = visibles.some((p) => puede(concesiones, "clinico.editar", p.id));

  return (
    <div className="space-y-6">
      <p><Link href={`/pacientes/${id}`} className="objetivo-tactil inline-flex items-center text-[14px] text-linear-mist underline underline-offset-4 hover:text-linear-paper">← Volver al paciente</Link></p>
      <EncabezadoPagina
        titulo={`Historial de ${paciente.apellido}, ${paciente.nombre}`}
        subtitulo="Cada vez que se corrige un trabajo se guarda una versión nueva; la anterior no se pierde."
        accion={editar ? <Link href={`/pacientes/${id}/trabajos/nuevo`} className={botonPrimario}>Registrar trabajo</Link> : null}
      />
      {param(q.guardado) ? <p role="status" className="text-[14px] text-linear-pulse-green">Cambios guardados.</p> : null}
      {param(q.eliminado) ? <p role="status" className="text-[14px] text-linear-pulse-green">Trabajo eliminado. Queda en el registro de cambios.</p> : null}

      <section className={tarjeta} aria-labelledby="h-odontograma">
        <h2 id="h-odontograma" className="mb-3 text-[16px] font-medium text-linear-paper">Piezas dentales</h2>
        <Odontograma porPieza={porPieza} seleccionada={pieza} base={base} />
      </section>

      {pieza ? (
        <section className={tarjeta} aria-labelledby="h-pieza">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="h-pieza" className="text-[16px] font-medium text-linear-paper">
              Pieza {pieza} <span className="text-[13px] font-normal text-linear-fog">{NOMBRE_CUADRANTE[Number(pieza[0])]}</span>
            </h2>
            <Link href={base} className="objetivo-tactil inline-flex items-center text-[14px] text-linear-mist underline underline-offset-4">Ver todo el historial</Link>
          </div>
          {(porPieza.get(pieza) ?? []).length === 0 ? (
            <p className="mt-2 text-[14px] text-linear-fog">Esta pieza no tiene tratamientos registrados.</p>
          ) : (
            <ul className="mt-2 divide-y divide-linear-graphite">
              {(porPieza.get(pieza) ?? []).map((e) => (
                <li key={`${e.trabajoId}-${e.tratamiento}`}>
                  <Link href={`/pacientes/${id}/trabajos/${e.trabajoId}`} className="objetivo-tactil flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3 hover:bg-linear-obsidian">
                    <span className="text-[15px] text-linear-bone">{e.tratamiento}{e.caras.length ? ` (${e.caras.join(", ")})` : ""}</span>
                    <span className="font-linear-mono text-[13px] text-linear-fog">{dmy(e.fecha)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <section aria-labelledby="h-trabajos" className="space-y-3">
        <h2 id="h-trabajos" className="text-[16px] font-medium text-linear-paper">
          {pieza ? `Trabajos que incluyen la pieza ${pieza}` : "Trabajos"} <span className="text-[13px] font-normal text-linear-fog">({mostrados.length})</span>
        </h2>
        {mostrados.length === 0 ? (
          <div className={tarjeta}>
            <p className="text-[15px] text-linear-bone">{pieza ? "Ningún trabajo incluye esta pieza." : "Todavía no hay trabajos registrados."}</p>
            {editar && !pieza ? <p className="mt-1 text-[14px] text-linear-fog">Registrá el primero después de la próxima atención.</p> : null}
          </div>
        ) : (
          <ul className="space-y-3">
            {mostrados.map((t) => (
              <li key={t.id}>
                <Link href={`/pacientes/${id}/trabajos/${t.id}`} className={`${tarjeta} block hover:border-linear-ash`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <span className="font-linear-mono text-[14px] text-linear-paper">{dmy(t.fecha)}</span>
                    <span className="text-[13px] text-linear-fog">
                      {visibles.length > 1 ? `${t.profesional} · ` : ""}
                      {t.versionActual > 1 ? `Corregido (versión ${t.versionActual})` : "Versión original"}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-3 whitespace-pre-line text-[15px] text-linear-bone">{t.descripcion}</p>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <ListaPiezas piezas={t.piezas} />
                    <span className="text-[13px] text-linear-fog">{t.monto ? `Informado: ${formatoMonto(t.monto)}` : ""}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
