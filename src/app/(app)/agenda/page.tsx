import Link from "next/link";
import { getDb } from "@/server/db/cliente";
import { agendaEntre, type BloqueoDeAgenda, type TurnoDeAgenda } from "@/server/agenda/turnos";
import { atendidosSinTrabajo } from "@/server/clinico/trabajos";
import { horarioLaboral } from "@/server/agenda/configuracion";
import { exigirPagina, param, profesionalActual } from "@/server/pagina";
import { aInstante, diaIso, esFecha, etiquetaDia, etiquetaDiaCap, etiquetaSemana, fechaDe, horaDe, hoy, lunesDe, sumarDias } from "@/server/tiempo";
import { puede } from "@/server/permisos";
import { concesionesDe } from "@/server/auth/sesiones";
import { botonPrimario, botonSecundario, EncabezadoPagina, EtiquetaEstado, tarjeta } from "@/app/componentes/ui";

export const metadata = { title: "Agenda" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const hora = (d: Date) => horaDe(d);

export default async function PaginaAgenda({ searchParams }: Props) {
  const q = await searchParams;
  const usuario = await exigirPagina("agenda.ver");
  const { profesionales, actual } = await profesionalActual(usuario, "agenda.ver", param(q.prof));
  if (!actual) {
    return (
      <section className={tarjeta}>
        <h1 className="text-[20px] font-medium text-linear-paper">No hay agenda para mostrar</h1>
        <p className="mt-2 text-[15px] text-linear-fog">Tu usuario no tiene ningún profesional asignado. Pedile a quien administra el sistema que te asigne uno.</p>
      </section>
    );
  }

  const db = getDb();
  const semanaPedida = param(q.semana);
  const lunes = lunesDe(esFecha(semanaPedida) ? semanaPedida : hoy());
  const desde = aInstante(lunes, "00:00");
  const hasta = aInstante(sumarDias(lunes, 7), "00:00");
  const [{ turnos, bloqueos }, franjas, concesiones] = await Promise.all([
    agendaEntre(db, actual.id, desde, hasta),
    horarioLaboral(db, actual.id),
    concesionesDe(usuario.id),
  ]);
  const puedeEditar = puede(concesiones, "agenda.editar", actual.id);
  const sinTrabajo = puede(concesiones, "clinico.editar", actual.id) ? await atendidosSinTrabajo(db, actual.id) : [];
  const hoyFecha = hoy();
  const nuevoId = param(q.nuevo);
  const prof = `&prof=${actual.id}`;
  const enlaceSemana = (f: string) => `/agenda?semana=${f}${prof}`;

  const dias = Array.from({ length: 7 }, (_, i) => {
    const fecha = sumarDias(lunes, i);
    const ini = aInstante(fecha, "00:00");
    const fin = aInstante(sumarDias(fecha, 1), "00:00");
    const delDia = franjas.filter((f) => f.dia === diaIso(fecha));
    const items = [
      ...turnos.filter((t) => fechaDe(t.inicio) === fecha).map((t) => ({ tipo: "turno" as const, inicio: t.inicio, t })),
      ...bloqueos.filter((b) => b.desde < fin && b.hasta > ini).map((b) => ({ tipo: "bloqueo" as const, inicio: b.desde < ini ? ini : b.desde, b, ini, fin })),
    ].sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
    return { fecha, franjas: delDia, items };
  }).filter((d) => diaIso(d.fecha) <= 5 || d.items.length > 0 || d.franjas.length > 0);

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        titulo="Agenda"
        subtitulo={`${actual.nombre} · ${etiquetaSemana(lunes)}`}
        accion={
          puedeEditar ? (
            <Link href={`/agenda/nuevo?prof=${actual.id}&fecha=${hoyFecha >= lunes && hoyFecha < sumarDias(lunes, 7) ? hoyFecha : lunes}`} className={botonPrimario}>
              Nuevo turno
            </Link>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Link href={enlaceSemana(sumarDias(lunes, -7))} className={botonSecundario} aria-label="Semana anterior">
          ← Anterior
        </Link>
        <Link href={enlaceSemana(lunesDe(hoyFecha))} className={botonSecundario} aria-current={lunes === lunesDe(hoyFecha) ? "date" : undefined}>
          Hoy
        </Link>
        <Link href={enlaceSemana(sumarDias(lunes, 7))} className={botonSecundario} aria-label="Semana siguiente">
          Siguiente →
        </Link>
        {profesionales.length > 1 ? (
          <form action="/agenda" className="ml-auto flex items-center gap-2">
            <input type="hidden" name="semana" value={lunes} />
            <label htmlFor="prof" className="text-[13px] text-linear-mist">Profesional</label>
            <select id="prof" name="prof" defaultValue={actual.id} className="objetivo-tactil rounded-[6px] border border-linear-ash bg-linear-obsidian px-3 py-2 text-[15px] text-linear-paper">
              {profesionales.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
            <button type="submit" className={botonSecundario}>Ver</button>
          </form>
        ) : null}
      </div>

      {sinTrabajo.length > 0 ? (
        <section className={tarjeta} aria-labelledby="h-sin-trabajo">
          <h2 id="h-sin-trabajo" className="text-[16px] font-medium text-linear-paper">Atendidos sin trabajo registrado ({sinTrabajo.length})</h2>
          <p className="mt-1 text-[14px] text-linear-fog">Para que el historial quede completo, registrá lo que se hizo en cada atención.</p>
          <ul className="mt-2 divide-y divide-linear-graphite">
            {sinTrabajo.map((s) => (
              <li key={s.id}>
                <Link href={`/pacientes/${s.pacienteId}/trabajos/nuevo?turno=${s.id}`} className="objetivo-tactil flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 hover:bg-linear-obsidian">
                  <span className="text-[15px] text-linear-bone">{s.paciente}</span>
                  <span className="text-[13px] text-linear-fog">{etiquetaDiaCap(fechaDe(s.inicio))} · {horaDe(s.inicio)} · Registrar trabajo</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {turnos.length === 0 && bloqueos.length === 0 ? (
        <p className="text-[14px] text-linear-fog">
          {franjas.length === 0 ? "Esta semana no hay turnos. Cargá el horario laboral en Configuración para ver cuándo atiende." : "Esta semana no hay turnos todavía."}
        </p>
      ) : null}

      <div className="space-y-4">
        {dias.map((d) => (
          <section key={d.fecha} aria-labelledby={`dia-${d.fecha}`} className={tarjeta}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 id={`dia-${d.fecha}`} className="text-[16px] font-medium text-linear-paper">
                {etiquetaDiaCap(d.fecha)}
                {d.fecha === hoyFecha ? <span className="ml-2 rounded-[6px] border border-linear-ash px-1.5 py-0.5 text-[12px] font-normal normal-case text-linear-mist">Hoy</span> : null}
              </h2>
              <p className="text-[13px] text-linear-fog">
                {d.franjas.length > 0 ? `Atiende ${d.franjas.map((f) => `${f.inicio} a ${f.fin}`).join(" y ")}` : franjas.length > 0 ? "No atiende" : ""}
              </p>
            </div>

            {d.items.length === 0 ? (
              <p className="mt-3 text-[14px] text-linear-fog">Sin turnos.</p>
            ) : (
              <ul className="mt-3 divide-y divide-linear-graphite">
                {d.items.map((it) =>
                  it.tipo === "turno" ? (
                    <FilaTurno key={it.t.id} t={it.t} nuevo={it.t.id === nuevoId} />
                  ) : (
                    <FilaBloqueo key={`${it.b.id}-${it.inicio.toISOString()}`} b={it.b} ini={it.ini} fin={it.fin} />
                  ),
                )}
              </ul>
            )}

            {puedeEditar ? (
              <p className="mt-3">
                <Link href={`/agenda/nuevo?prof=${actual.id}&fecha=${d.fecha}`} className="objetivo-tactil inline-flex items-center text-[14px] text-linear-mist underline underline-offset-4 hover:text-linear-paper">
                  Agregar turno el {etiquetaDia(d.fecha)}
                </Link>
              </p>
            ) : null}
          </section>
        ))}
      </div>
    </div>
  );
}

function FilaTurno({ t, nuevo }: { t: TurnoDeAgenda; nuevo: boolean }) {
  const apagado = t.estado === "cancelado";
  return (
    <li>
      <Link
        href={`/agenda/turnos/${t.id}`}
        className="objetivo-tactil -mx-2 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[6px] px-2 py-3 hover:bg-linear-obsidian"
      >
        <span className={`w-[112px] shrink-0 font-linear-mono text-[14px] ${apagado ? "text-linear-fog line-through" : "text-linear-paper"}`}>
          {hora(t.inicio)} a {hora(t.fin)}
        </span>
        <span className={`order-last min-w-0 basis-full text-[15px] sm:order-none sm:basis-0 sm:flex-1 ${apagado ? "text-linear-fog" : "text-linear-bone"}`}>
          {t.paciente}
          {nuevo ? <span className="ml-2 text-[13px] text-linear-teal">· guardado</span> : null}
        </span>
        <span className="ml-auto sm:ml-0"><EtiquetaEstado estado={t.estado} liberado={t.horarioLiberado} /></span>
      </Link>
    </li>
  );
}

function FilaBloqueo({ b, ini, fin }: { b: BloqueoDeAgenda; ini: Date; fin: Date }) {
  const todoElDia = b.desde <= ini && b.hasta >= fin;
  const d = b.desde < ini ? ini : b.desde;
  const h = b.hasta > fin ? fin : b.hasta;
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
      <span className="w-[112px] shrink-0 font-linear-mono text-[14px] text-linear-fog">{todoElDia ? "Todo el día" : `${hora(d)} a ${hora(h)}`}</span>
      <span className="order-last min-w-0 basis-full text-[15px] text-linear-mist sm:order-none sm:basis-0 sm:flex-1">{b.motivo}</span>
      <span className="ml-auto inline-flex sm:ml-0 items-center gap-1.5 text-[13px] text-linear-fog">
        <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor">
          <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1ZM3.5 8a4.5 4.5 0 0 1 7.3-3.5l-6.3 6.3A4.5 4.5 0 0 1 3.5 8Zm1.7 3.5 6.3-6.3a4.5 4.5 0 0 1-6.3 6.3Z" />
        </svg>
        Bloqueado
      </span>
    </li>
  );
}
