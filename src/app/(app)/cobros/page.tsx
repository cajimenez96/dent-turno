import Link from "next/link";
import { getDb } from "@/server/db/cliente";
import { pacientesConSaldo } from "@/server/cobros/servicio";
import { exigirPagina, profesionalActual } from "@/server/pagina";
import { aCentavos, formatoMonto } from "@/server/dinero";
import { EncabezadoPagina, tarjeta } from "@/app/componentes/ui";

export const metadata = { title: "Cobros" };

export default async function PaginaCobros() {
  const usuario = await exigirPagina("cobros.ver");
  const { profesionales } = await profesionalActual(usuario, "cobros.ver");
  const filas = await pacientesConSaldo(getDb(), profesionales.map((p) => p.id));
  const deben = filas.filter((f) => aCentavos(f.saldo) > 0);
  const aFavor = filas.filter((f) => aCentavos(f.saldo) < 0);
  const total = deben.reduce((a, f) => a + aCentavos(f.saldo), 0);
  const varios = profesionales.length > 1;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <EncabezadoPagina titulo="Cobros" subtitulo="Pacientes con saldo pendiente" />

      <section className={tarjeta} aria-labelledby="h-deben">
        <h2 id="h-deben" className="text-[16px] font-medium text-linear-paper">Pacientes que deben</h2>
        {deben.length === 0 ? (
          <p className="mt-2 text-[14px] text-linear-fog">Nadie tiene deuda pendiente.</p>
        ) : (
          <>
            <p className="mt-1 text-[14px] text-linear-mist">{deben.length} {deben.length === 1 ? "paciente" : "pacientes"} · {formatoMonto((total / 100).toFixed(2))} en total</p>
            <ul className="mt-2 divide-y divide-linear-graphite">
              {deben.map((f) => (
                <li key={`${f.pacienteId}-${f.profesionalId}`}>
                  <Link href={`/pacientes/${f.pacienteId}/cuenta`} className="objetivo-tactil flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 hover:bg-linear-obsidian">
                    <span className="text-[15px] text-linear-bone">{f.paciente}{varios ? <span className="text-[13px] text-linear-fog"> · {f.profesional}</span> : null}{f.telefono ? <span className="text-[13px] text-linear-fog"> · {f.telefono}</span> : null}</span>
                    <span className="text-[15px] text-linear-coral-red">● Debe {formatoMonto(f.saldo)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {aFavor.length > 0 ? (
        <section className={tarjeta} aria-labelledby="h-favor">
          <h2 id="h-favor" className="text-[16px] font-medium text-linear-paper">Con saldo a favor</h2>
          <ul className="mt-2 divide-y divide-linear-graphite">
            {aFavor.map((f) => (
              <li key={`${f.pacienteId}-${f.profesionalId}`}>
                <Link href={`/pacientes/${f.pacienteId}/cuenta`} className="objetivo-tactil flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 hover:bg-linear-obsidian">
                  <span className="text-[15px] text-linear-bone">{f.paciente}{varios ? <span className="text-[13px] text-linear-fog"> · {f.profesional}</span> : null}</span>
                  <span className="text-[15px] text-linear-mist">▲ A favor {formatoMonto(f.saldo.replace("-", ""))}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
