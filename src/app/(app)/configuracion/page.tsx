import { getDb } from "@/server/db/cliente";
import { bloqueosVigentes, horarioLaboral } from "@/server/agenda/configuracion";
import { exigirPagina, param, profesionalActual } from "@/server/pagina";
import { etiquetaDia, fechaDe, horaDe, nombreDia } from "@/server/tiempo";
import { botonSecundario, EncabezadoPagina, tarjeta } from "@/app/componentes/ui";
import { FormularioBloqueo, FormularioHorario, QuitarBloqueo } from "./formularios";

export const metadata = { title: "Configuración" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export default async function PaginaConfiguracion({ searchParams }: Props) {
  const q = await searchParams;
  const usuario = await exigirPagina("agenda.configurar");
  const { profesionales, actual } = await profesionalActual(usuario, "agenda.configurar", param(q.prof));
  if (!actual) return <p className="text-[15px] text-steel">Tu usuario no tiene ningún profesional asignado.</p>;
  const db = getDb();
  const [franjas, bloqueos] = await Promise.all([horarioLaboral(db, actual.id), bloqueosVigentes(db, actual.id)]);

  return (
    <div className="space-y-6">
      <EncabezadoPagina titulo="Configuración de la agenda" subtitulo={actual.nombre} />
      {profesionales.length > 1 ? (
        <form action="/configuracion" className="flex items-center gap-2">
          <label htmlFor="prof" className="text-[13px] text-slate">Profesional</label>
          <select id="prof" name="prof" defaultValue={actual.id} className="objetivo-tactil rounded-md border border-stone bg-canvas px-3 py-2 text-[15px] text-ink">
            {profesionales.map((p) => (<option key={p.id} value={p.id}>{p.nombre}</option>))}
          </select>
          <button type="submit" className={botonSecundario}>Ver</button>
        </form>
      ) : null}

      <section className={tarjeta} aria-labelledby="h-horario">
        <h2 id="h-horario" className="text-[16px] font-medium text-ink">Horario laboral</h2>
        <p className="mb-4 mt-1 text-[14px] text-steel">
          {franjas.length === 0 ? "Todavía no cargaste el horario: por ahora se puede dar turno a cualquier hora." : "Fuera de este horario, el sistema avisa antes de dar un turno."}
        </p>
        <FormularioHorario profesionalId={actual.id} franjas={franjas} />
      </section>

      <section className={tarjeta} aria-labelledby="h-bloqueos">
        <h2 id="h-bloqueos" className="text-[16px] font-medium text-ink">Bloqueos</h2>
        <p className="mb-4 mt-1 text-[14px] text-steel">Horarios en los que no se pueden dar turnos. Un bloqueo anulado deja libre el horario de nuevo.</p>
        {param(q.bloqueo) ? <p role="status" className="mb-3 text-[14px] text-success-text">Bloqueo guardado.</p> : null}
        {bloqueos.length === 0 ? (
          <p className="text-[14px] text-steel">No hay bloqueos vigentes.</p>
        ) : (
          <ul className="divide-y divide-hairline">
            {bloqueos.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-[15px] text-ink">{b.motivo}</p>
                  <p className="text-[13px] text-steel">
                    {b.tipo === "semanal" && b.dia
                      ? `Todos los ${nombreDia(b.dia)}s, de ${b.horaInicio} a ${b.horaFin}`
                      : b.desde && b.hasta ? descripcionPuntual(b.desde, b.hasta) : ""}
                  </p>
                </div>
                <QuitarBloqueo id={b.id} profesionalId={actual.id} motivo={b.motivo} />
              </li>
            ))}
          </ul>
        )}
        <div className="mt-6 border-t border-hairline pt-5">
          <h3 className="mb-4 text-[15px] font-medium text-ink">Agregar un bloqueo</h3>
          <FormularioBloqueo profesionalId={actual.id} />
        </div>
      </section>
    </div>
  );
}

function descripcionPuntual(desde: Date, hasta: Date) {
  const f1 = fechaDe(desde);
  const ultimo = fechaDe(new Date(hasta.getTime() - 1));
  const enteros = horaDe(desde) === "00:00" && horaDe(hasta) === "00:00";
  if (enteros) return f1 === ultimo ? cap(etiquetaDia(f1)) + ", todo el día" : `Del ${etiquetaDia(f1)} al ${etiquetaDia(ultimo)}, días enteros`;
  return f1 === ultimo
    ? `${cap(etiquetaDia(f1))}, de ${horaDe(desde)} a ${horaDe(hasta)}`
    : `Del ${etiquetaDia(f1)} ${horaDe(desde)} al ${etiquetaDia(ultimo)} ${horaDe(hasta)}`;
}
