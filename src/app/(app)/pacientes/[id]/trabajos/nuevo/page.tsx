import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/server/db/cliente";
import { obtenerPaciente } from "@/server/pacientes/servicio";
import { obtenerTurno } from "@/server/agenda/turnos";
import { exigirPagina, param, profesionalActual } from "@/server/pagina";
import { fechaDe, hoy } from "@/server/tiempo";
import { EncabezadoPagina, tarjeta } from "@/app/componentes/ui";
import { FormularioTrabajo } from "../formulario-trabajo";

export const metadata = { title: "Registrar trabajo" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function PaginaNuevoTrabajo({ params, searchParams }: Props) {
  const { id } = await params;
  const q = await searchParams;
  const usuario = await exigirPagina("clinico.editar");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = getDb();
  const paciente = await obtenerPaciente(db, id);
  if (!paciente || !paciente.activo) notFound();

  const turnoId = /^[0-9a-f-]{36}$/i.test(param(q.turno)) ? param(q.turno) : undefined;
  const turno = turnoId ? await obtenerTurno(db, turnoId) : null;
  const turnoValido = turno && turno.pacienteId === id ? turno : null;
  const { actual } = await profesionalActual(usuario, "clinico.editar", turnoValido?.profesionalId ?? param(q.prof));
  if (!actual) return <p className="text-[15px] text-steel">Tu usuario no tiene ningún profesional asignado para registrar trabajos.</p>;
  const fechaTurno = turnoValido ? fechaDe(turnoValido.inicio) : hoy();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <p><Link href={`/pacientes/${id}/historial`} className="objetivo-tactil inline-flex items-center text-[14px] text-slate underline underline-offset-4 hover:text-ink">← Volver al historial</Link></p>
      <EncabezadoPagina titulo="Registrar trabajo" subtitulo={`${paciente.apellido}, ${paciente.nombre} · ${actual.nombre}`} />
      <div className={tarjeta}>
        <FormularioTrabajo
          modo="nuevo"
          profesionalId={actual.id}
          pacienteId={id}
          turnoId={turnoValido?.id}
          inicial={{ fecha: fechaTurno > hoy() ? hoy() : fechaTurno, descripcion: "", monto: "", piezas: [] }}
        />
      </div>
    </div>
  );
}
