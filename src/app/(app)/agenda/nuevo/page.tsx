import Link from "next/link";
import { getDb } from "@/server/db/cliente";
import { exigirPagina, param, profesionalActual } from "@/server/pagina";
import { obtenerPaciente } from "@/server/pacientes/servicio";
import { esFecha, hoy } from "@/server/tiempo";
import { EncabezadoPagina, tarjeta } from "@/app/componentes/ui";
import { FormularioTurno } from "../formulario-turno";

export const metadata = { title: "Nuevo turno" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function PaginaNuevoTurno({ searchParams }: Props) {
  const q = await searchParams;
  const usuario = await exigirPagina("agenda.editar");
  const { actual } = await profesionalActual(usuario, "agenda.editar", param(q.prof));
  if (!actual) {
    return <p className="text-[15px] text-steel">Tu usuario no tiene ningún profesional asignado.</p>;
  }
  const fecha = esFecha(param(q.fecha)) ? param(q.fecha) : hoy();
  const horaPedida = /^\d{2}:\d{2}$/.test(param(q.hora)) ? param(q.hora) : "09:00";
  const idPaciente = param(q.paciente);
  const paciente = /^[0-9a-f-]{36}$/i.test(idPaciente) ? await obtenerPaciente(getDb(), idPaciente) : null;
  // Datos que se conservan si hay que ir a crear un paciente y volver.
  const volver = `prof=${actual.id}&fecha=${fecha}&hora=${horaPedida}`;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <p><Link href={`/agenda?prof=${actual.id}`} className="objetivo-tactil inline-flex items-center text-[14px] text-slate underline underline-offset-4 hover:text-ink">← Volver a la agenda</Link></p>
      <EncabezadoPagina titulo="Nuevo turno" subtitulo={`Agenda de ${actual.nombre}`} />
      <div className={tarjeta}>
        <FormularioTurno modo="nuevo" profesionalId={actual.id} fecha={fecha} hora={horaPedida} duracionMin={60} paciente={paciente && paciente.activo ? paciente : null} volver={volver} />
      </div>
    </div>
  );
}
