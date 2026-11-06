import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/server/db/cliente";
import { obtenerTurno } from "@/server/agenda/turnos";
import { exigirPagina } from "@/server/pagina";
import { concesionesDe } from "@/server/auth/sesiones";
import { puede } from "@/server/permisos";
import { etiquetaDiaCap, fechaDe, horaDe } from "@/server/tiempo";
import { botonSecundario, EncabezadoPagina, EtiquetaEstado, tarjeta } from "@/app/componentes/ui";
import { FormularioTurno } from "../../formulario-turno";
import { CambiarEstado, CancelarTurno, LiberarHorario } from "./acciones-turno";

export const metadata = { title: "Turno" };

export default async function PaginaTurno({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const usuario = await exigirPagina("agenda.ver");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const t = await obtenerTurno(getDb(), id);
  if (!t) notFound();
  const concesiones = await concesionesDe(usuario.id);
  if (!puede(concesiones, "agenda.ver", t.profesionalId)) notFound();
  const editar = puede(concesiones, "agenda.editar", t.profesionalId);
  const fecha = fechaDe(t.inicio);
  const duracion = Math.round((t.fin.getTime() - t.inicio.getTime()) / 60000);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <p><Link href={`/agenda?prof=${t.profesionalId}&semana=${fecha}`} className="objetivo-tactil inline-flex items-center text-[14px] text-slate underline underline-offset-4 hover:text-ink">← Volver a la agenda</Link></p>
      <EncabezadoPagina titulo={t.paciente} subtitulo={t.telefono ? `Teléfono ${t.telefono}` : "Sin teléfono cargado"} />

      <section className={tarjeta} aria-label="Datos del turno">
        <dl className="grid gap-3 sm:grid-cols-3">
          <div><dt className="text-[13px] text-steel">Día</dt><dd className="text-[15px] text-ink">{etiquetaDiaCap(fecha)}</dd></div>
          <div><dt className="text-[13px] text-steel">Horario</dt><dd className="font-family-2 text-[15px] text-ink">{horaDe(t.inicio)} a {horaDe(t.fin)}</dd></div>
          <div><dt className="text-[13px] text-steel">Estado</dt><dd><EtiquetaEstado estado={t.estado} liberado={t.horarioLiberado} /></dd></div>
        </dl>
        {t.motivoCancelacion ? <p className="mt-3 text-[14px] text-slate">Motivo de la cancelación: {t.motivoCancelacion}</p> : null}
        <p className="mt-3"><Link href={`/pacientes/${t.pacienteId}`} className="objetivo-tactil inline-flex items-center text-[14px] text-slate underline underline-offset-4 hover:text-ink">Ver datos del paciente</Link></p>
      </section>

      {editar && t.estado === "programado" ? (
        <>
          <section className={`${tarjeta} space-y-3`} aria-labelledby="h-estado">
            <h2 id="h-estado" className="text-[16px] font-medium text-ink">¿Qué pasó con este turno?</h2>
            <div className="flex flex-wrap gap-3">
              <CambiarEstado turnoId={t.id} version={t.version} estado="atendido" etiqueta="Marcar como atendido" estilo="primario" />
              <CambiarEstado turnoId={t.id} version={t.version} estado="ausente" etiqueta="Marcar como ausente" />
            </div>
          </section>
          <section className={tarjeta} aria-labelledby="h-mover">
            <h2 id="h-mover" className="mb-4 text-[16px] font-medium text-ink">Mover a otro horario</h2>
            <FormularioTurno modo="mover" profesionalId={t.profesionalId} turnoId={t.id} version={t.version} fecha={fecha} hora={horaDe(t.inicio)} duracionMin={duracion} />
          </section>
          <section className={tarjeta} aria-labelledby="h-cancelar">
            <h2 id="h-cancelar" className="mb-4 text-[16px] font-medium text-ink">Cancelar</h2>
            <CancelarTurno turnoId={t.id} version={t.version} />
          </section>
        </>
      ) : null}

      {puede(concesiones, "clinico.editar", t.profesionalId) && t.estado === "atendido" ? (
        <section className={tarjeta} aria-labelledby="h-trabajo">
          <h2 id="h-trabajo" className="text-[16px] font-medium text-ink">Historial clínico</h2>
          <p className="mb-3 mt-1 text-[14px] text-steel">Registrá qué se hizo en esta atención.</p>
          <Link href={`/pacientes/${t.pacienteId}/trabajos/nuevo?turno=${t.id}`} className={botonSecundario}>Registrar el trabajo de esta atención</Link>
        </section>
      ) : null}

      {editar && (t.estado === "atendido" || t.estado === "ausente") ? (
        <section className={`${tarjeta} space-y-4`} aria-labelledby="h-corregir">
          <h2 id="h-corregir" className="text-[16px] font-medium text-ink">Corregir o completar</h2>
          <CambiarEstado turnoId={t.id} version={t.version} estado={t.estado === "atendido" ? "ausente" : "atendido"} etiqueta={t.estado === "atendido" ? "Cargué mal: fue ausente" : "Cargué mal: fue atendido"} />
          {t.estado === "ausente" && !t.horarioLiberado ? <LiberarHorario turnoId={t.id} version={t.version} /> : null}
        </section>
      ) : null}
    </div>
  );
}
