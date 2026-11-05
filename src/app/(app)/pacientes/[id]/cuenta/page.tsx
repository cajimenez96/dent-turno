import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/server/db/cliente";
import { obtenerPaciente } from "@/server/pacientes/servicio";
import { cuentaPaciente } from "@/server/cobros/servicio";
import { concesionesDe } from "@/server/auth/sesiones";
import { puede } from "@/server/permisos";
import { exigirPagina, profesionalActual } from "@/server/pagina";
import { hoy } from "@/server/tiempo";
import { aCentavos, deCentavos, formatoMonto } from "@/server/dinero";
import { botonSecundario, EncabezadoPagina, tarjeta } from "@/app/componentes/ui";
import { AnularConMotivo, AplicarACuenta, CorregirMonto, FormularioCargo, FormularioCobro } from "./formularios";

export const metadata = { title: "Cuenta del paciente" };

const dmy = (f: string) => f.split("-").reverse().join("/");
const uuid = /^[0-9a-f-]{36}$/i;
const MEDIOS: Record<string, string> = { efectivo: "Efectivo", transferencia: "Transferencia" };
const ORIGEN: Record<string, string> = { trabajo: "Trabajo", ausencia: "Ausencia", otro: "Otro" };

export default async function PaginaCuenta({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const usuario = await exigirPagina("cobros.ver");
  if (!uuid.test(id)) notFound();
  const db = getDb();
  const paciente = await obtenerPaciente(db, id);
  if (!paciente) notFound();
  const concesiones = await concesionesDe(usuario.id);
  const { profesionales } = await profesionalActual(usuario, "cobros.ver");
  const { resumenes, cargos, cobros } = await cuentaPaciente(db, id, profesionales.map((p) => p.id));
  const fecha = hoy();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <p><Link href={`/pacientes/${id}`} className="objetivo-tactil inline-flex items-center text-[14px] text-linear-mist underline underline-offset-4 hover:text-linear-paper">← Volver al paciente</Link></p>
      <EncabezadoPagina titulo={`Cuenta de ${paciente.apellido}, ${paciente.nombre}`} subtitulo="Cargos, cobros y saldo" />

      {resumenes.length === 0 ? <p className="text-[15px] text-linear-mist">No tenés acceso a cuentas de ningún profesional.</p> : null}

      {resumenes.map((r) => {
        const cargosPro = cargos.filter((c) => c.profesionalId === r.profesionalId);
        const cobrosPro = cobros.filter((c) => c.profesionalId === r.profesionalId);
        const pendientes = cargosPro.filter((c) => !c.anulado && aCentavos(c.saldo) > 0);
        const registrar = puede(concesiones, "cobros.registrar", r.profesionalId);
        const anular = puede(concesiones, "cobros.anular", r.profesionalId);
        const saldo = aCentavos(r.saldo);
        const aCuenta = aCentavos(r.aCuenta);
        return (
          <section key={r.profesionalId} className={`${tarjeta} space-y-5`} aria-labelledby={`h-${r.profesionalId}`}>
            <h2 id={`h-${r.profesionalId}`} className="text-[16px] font-medium text-linear-paper">{r.profesional}</h2>

            <div className="grid gap-3 sm:grid-cols-3">
              <div><p className="text-[13px] text-linear-fog">Cargado</p><p className="text-[18px] text-linear-paper">{formatoMonto(r.cargos)}</p></div>
              <div><p className="text-[13px] text-linear-fog">Cobrado</p><p className="text-[18px] text-linear-paper">{formatoMonto(r.cobrado)}</p></div>
              <div>
                <p className="text-[13px] text-linear-fog">{saldo > 0 ? "Debe" : saldo < 0 ? "Saldo a favor" : "Saldo"}</p>
                <p className={`text-[18px] ${saldo > 0 ? "text-linear-coral-red" : "text-linear-paper"}`}>
                  {saldo > 0 ? "● " : saldo < 0 ? "▲ " : "✓ "}{formatoMonto(r.saldo.replace("-", ""))}
                </p>
              </div>
            </div>

            {registrar && aCuenta > 0 && pendientes.length > 0 ? (
              <div className="rounded-[6px] border border-linear-graphite p-3">
                <p className="mb-2 text-[14px] text-linear-mist">Hay {formatoMonto(r.aCuenta)} cobrados a cuenta, sin aplicar a ningún cargo.</p>
                <AplicarACuenta pacienteId={id} profesionalId={r.profesionalId} aCuenta={formatoMonto(r.aCuenta)} />
              </div>
            ) : null}

            {registrar ? (
              <div className="space-y-3">
                <h3 className="text-[15px] font-medium text-linear-paper">Registrar un cobro</h3>
                <FormularioCobro
                  pacienteId={id} profesionalId={r.profesionalId} hoy={fecha}
                  pendientes={pendientes.map((c) => ({ id: c.id, concepto: c.concepto, saldo: c.saldo, etiqueta: `${dmy(c.fecha)} · ${c.concepto} · debe ${formatoMonto(c.saldo)}` }))}
                />
              </div>
            ) : null}

            <div>
              <h3 className="text-[15px] font-medium text-linear-paper">Cargos</h3>
              {cargosPro.length === 0 ? <p className="mt-1 text-[14px] text-linear-fog">Todavía no hay cargos.</p> : (
                <ul className="mt-1 divide-y divide-linear-graphite">
                  {cargosPro.map((c) => (
                    <li key={c.id} className="space-y-2 py-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                        <p className="text-[15px] text-linear-bone">{dmy(c.fecha)} · {c.concepto} <span className="text-[13px] text-linear-fog">({ORIGEN[c.origen]})</span></p>
                        <p className="text-[15px] text-linear-paper">{formatoMonto(c.monto)}</p>
                      </div>
                      {c.anulado ? (
                        <p className="text-[13px] text-linear-fog">✕ Anulado: {c.anuladoMotivo}</p>
                      ) : (
                        <p className="text-[13px] text-linear-mist">
                          {aCentavos(c.saldo) === 0 ? "✓ Pagado" : `● Debe ${formatoMonto(c.saldo)}`}
                          {aCentavos(c.imputado) > 0 && aCentavos(c.saldo) > 0 ? ` · pagó ${formatoMonto(c.imputado)}` : ""}
                        </p>
                      )}
                      {!c.anulado && c.trabajoId ? <p><Link href={`/pacientes/${id}/trabajos/${c.trabajoId}`} className="text-[13px] text-linear-mist underline underline-offset-4">Ver el trabajo</Link></p> : null}
                      {!c.anulado && (registrar || anular) ? (
                        <details>
                          <summary className="objetivo-tactil flex cursor-pointer items-center text-[13px] text-linear-mist">Corregir o anular</summary>
                          <div className="mt-2 space-y-4 rounded-[6px] border border-linear-graphite p-3">
                            {registrar ? <CorregirMonto cargoId={c.id} actual={c.monto} /> : null}
                            {anular ? <AnularConMotivo tipo="cargo" id={c.id} aviso={aCentavos(c.imputado) > 0 ? "Este cargo ya tiene cobros aplicados: primero anulá esos cobros." : "El cargo queda en la cuenta, tachado y con tu motivo. No suma al saldo."} /> : null}
                          </div>
                        </details>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h3 className="text-[15px] font-medium text-linear-paper">Cobros</h3>
              {cobrosPro.length === 0 ? <p className="mt-1 text-[14px] text-linear-fog">Todavía no hay cobros.</p> : (
                <ul className="mt-1 divide-y divide-linear-graphite">
                  {cobrosPro.map((c) => (
                    <li key={c.id} className="space-y-2 py-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                        <p className="text-[15px] text-linear-bone">{dmy(c.fecha)} · {c.tipo === "anulacion" ? "Anulación de cobro" : MEDIOS[c.medio] ?? c.medio}</p>
                        <p className={`text-[15px] ${c.tipo === "anulacion" ? "text-linear-coral-red" : "text-linear-paper"}`}>{c.tipo === "anulacion" ? "− " + formatoMonto(c.monto.replace("-", "")) : formatoMonto(c.monto)}</p>
                      </div>
                      {c.tipo === "anulacion" ? <p className="text-[13px] text-linear-fog">Motivo: {c.motivo}</p> : c.anulado ? <p className="text-[13px] text-linear-fog">✕ Anulado</p> : aCentavos(c.monto) > aCentavos(c.imputado) ? <p className="text-[13px] text-linear-mist">▲ {formatoMonto(deCentavos(aCentavos(c.monto) - aCentavos(c.imputado)))} a cuenta</p> : null}
                      {c.tipo === "cobro" && !c.anulado && anular ? (
                        <details>
                          <summary className="objetivo-tactil flex cursor-pointer items-center text-[13px] text-linear-mist">Anular este cobro</summary>
                          <div className="mt-2 rounded-[6px] border border-linear-graphite p-3">
                            <AnularConMotivo tipo="cobro" id={c.id} aviso="No se borra: se agrega una anulación con tu nombre y el motivo, y la deuda vuelve a la cuenta." />
                          </div>
                        </details>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {registrar ? (
              <details>
                <summary className="objetivo-tactil flex cursor-pointer items-center text-[14px] text-linear-mist">Agregar un cargo suelto</summary>
                <div className="mt-2 space-y-2">
                  <p className="text-[13px] text-linear-fog">Para cobrar algo que no sale de un trabajo del historial. El cargo de un trabajo se genera desde el trabajo.</p>
                  <FormularioCargo pacienteId={id} profesionalId={r.profesionalId} hoy={fecha} />
                </div>
              </details>
            ) : null}
          </section>
        );
      })}
      <p><Link href="/cobros" className={botonSecundario}>Ver pacientes con saldo</Link></p>
    </div>
  );
}
