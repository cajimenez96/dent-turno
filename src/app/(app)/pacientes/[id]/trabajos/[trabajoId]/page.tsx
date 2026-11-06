import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/server/db/cliente";
import { obtenerPaciente } from "@/server/pacientes/servicio";
import { obtenerTrabajo, versionesTrabajo } from "@/server/clinico/trabajos";
import { registrarLecturaClinica } from "@/server/clinico/lectura";
import { concesionesDe } from "@/server/auth/sesiones";
import { puede } from "@/server/permisos";
import { exigirPagina } from "@/server/pagina";
import { fechaDe, horaDe } from "@/server/tiempo";
import { formatoMonto } from "@/server/dinero";
import { EncabezadoPagina, tarjeta } from "@/app/componentes/ui";
import { ListaPiezas } from "@/app/componentes/trabajo";
import { FormularioTrabajo } from "../formulario-trabajo";
import { EliminarTrabajo } from "./eliminar";

export const metadata = { title: "Trabajo" };

const dmy = (f: string) => f.split("-").reverse().join("/");
const uuid = /^[0-9a-f-]{36}$/i;

export default async function PaginaTrabajo({ params }: { params: Promise<{ id: string; trabajoId: string }> }) {
  const { id, trabajoId } = await params;
  const usuario = await exigirPagina("clinico.ver");
  if (!uuid.test(id) || !uuid.test(trabajoId)) notFound();
  const db = getDb();
  const t = await obtenerTrabajo(db, trabajoId);
  if (!t || t.pacienteId !== id) notFound();
  const concesiones = await concesionesDe(usuario.id);
  if (!puede(concesiones, "clinico.ver", t.profesionalId)) notFound();
  const paciente = await obtenerPaciente(db, id);
  if (!paciente) notFound();
  const editar = puede(concesiones, "clinico.editar", t.profesionalId);
  const versiones = await versionesTrabajo(db, t.id);
  await registrarLecturaClinica(usuario.id, id, t.id);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <p><Link href={`/pacientes/${id}/historial`} className="objetivo-tactil inline-flex items-center text-[14px] text-slate underline underline-offset-4 hover:text-ink">← Volver al historial</Link></p>
      <EncabezadoPagina titulo={`Trabajo del ${dmy(t.fecha)}`} subtitulo={`${paciente.apellido}, ${paciente.nombre} · ${t.profesional} · versión ${t.versionActual}`} />

      <section className={tarjeta} aria-labelledby="h-vigente">
        <h2 id="h-vigente" className="sr-only">Versión vigente</h2>
        <p className="whitespace-pre-line text-[15px] text-ink">{t.descripcion}</p>
        <div className="mt-3"><ListaPiezas piezas={t.piezas} /></div>
        {t.monto ? <p className="mt-3 text-[13px] text-steel">Monto informado: {formatoMonto(t.monto)}</p> : null}
      </section>

      {editar ? (
        <section className={tarjeta} aria-labelledby="h-editar">
          <h2 id="h-editar" className="mb-1 text-[16px] font-medium text-ink">Corregir este trabajo</h2>
          <p className="mb-4 text-[14px] text-steel">Antes de guardar vas a ver qué cambia. La versión actual no se pierde.</p>
          <FormularioTrabajo modo="editar" trabajoId={t.id} version={t.versionActual} inicial={{ fecha: t.fecha, descripcion: t.descripcion, monto: t.monto ? t.monto.replace(".", ",") : "", piezas: t.piezas }} />
        </section>
      ) : null}

      <section className={tarjeta} aria-labelledby="h-versiones">
        <h2 id="h-versiones" className="text-[16px] font-medium text-ink">Registro de cambios</h2>
        <ol className="mt-3 space-y-4">
          {versiones.map((v) => (
            <li key={v.numero} className="border-l-2 border-hairline pl-4">
              <p className="text-[14px] text-ink">
                Versión {v.numero}{v.numero === t.versionActual ? " (vigente)" : ""}
                <span className="ml-2 text-[13px] text-steel">{dmy(fechaDe(v.editadoAt))} {horaDe(v.editadoAt)} · {v.editadoPor ?? "Usuario desconocido"}</span>
              </p>
              {v.resumen ? (
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13px] text-slate">
                  {v.resumen.split("\n").map((l) => (<li key={l}>{l}</li>))}
                </ul>
              ) : <p className="mt-1 text-[13px] text-steel">Registro original.</p>}
              {v.numero !== t.versionActual ? (
                <details className="mt-1">
                  <summary className="objetivo-tactil flex cursor-pointer items-center text-[13px] text-slate">Ver cómo estaba</summary>
                  <div className="mt-2 space-y-2 rounded-md border border-hairline p-3">
                    <p className="text-[13px] text-steel">Fecha {dmy(v.fecha)}{v.monto ? ` · Informado ${formatoMonto(v.monto)}` : ""}</p>
                    <p className="whitespace-pre-line text-[14px] text-ink">{v.descripcion}</p>
                    <ListaPiezas piezas={v.piezas} />
                  </div>
                </details>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      {editar ? (
        <section className={tarjeta} aria-labelledby="h-eliminar">
          <h2 id="h-eliminar" className="mb-3 text-[16px] font-medium text-ink">Eliminar</h2>
          <EliminarTrabajo trabajoId={t.id} />
        </section>
      ) : null}
    </div>
  );
}
