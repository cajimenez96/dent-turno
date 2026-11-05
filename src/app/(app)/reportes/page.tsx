import Link from "next/link";
import { getDb } from "@/server/db/cliente";
import { esMesValido, mesActual, reporteMensual } from "@/server/cobros/servicio";
import { exigirPagina, param, profesionalActual } from "@/server/pagina";
import { formatoMonto } from "@/server/dinero";
import { EncabezadoPagina, tarjeta } from "@/app/componentes/ui";

export const metadata = { title: "Reportes" };

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const ORIGEN: Record<string, string> = { trabajo: "Trabajos", ausencia: "Ausencias", otro: "Otros" };
const MEDIO: Record<string, string> = { efectivo: "Efectivo", transferencia: "Transferencia" };
const enlace = "objetivo-tactil inline-flex items-center rounded-[6px] border border-linear-ash px-3 py-2 text-[14px] text-linear-mist hover:border-linear-fog";

function vecino(anio: number, mes: number, d: number) {
  const f = new Date(Date.UTC(anio, mes - 1 + d, 1));
  return { anio: f.getUTCFullYear(), mes: f.getUTCMonth() + 1 };
}
const clave = (a: number, m: number) => `${a}-${String(m).padStart(2, "0")}`;

export default async function PaginaReportes({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const usuario = await exigirPagina("reportes.ver");
  const { profesionales, actual } = await profesionalActual(usuario, "reportes.ver", param(q.prof));
  if (!actual) return <p className="text-[15px] text-linear-mist">No tenés acceso a reportes de ningún profesional.</p>;
  const hoyMes = mesActual();
  const m = /^(\d{4})-(\d{2})$/.exec(param(q.mes));
  const pedido = m ? { anio: Number(m[1]), mes: Number(m[2]) } : hoyMes;
  const { anio, mes } = esMesValido(pedido.anio, pedido.mes) ? pedido : hoyMes;
  const r = await reporteMensual(getDb(), actual.id, anio, mes);
  const ant = vecino(anio, mes, -1);
  const sig = vecino(anio, mes, 1);
  const href = (a: number, mm: number) => `/reportes?prof=${actual.id}&mes=${clave(a, mm)}`;
  const esFuturo = sig.anio > hoyMes.anio || (sig.anio === hoyMes.anio && sig.mes > hoyMes.mes);
  const t = r.turnos;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <EncabezadoPagina titulo={`Resumen de ${MESES[mes - 1]} de ${anio}`} subtitulo={actual.nombre} />

      <nav aria-label="Elegir mes" className="flex flex-wrap items-center gap-3">
        <Link href={href(ant.anio, ant.mes)} className={enlace}>← {MESES[ant.mes - 1]}</Link>
        {!esFuturo ? <Link href={href(sig.anio, sig.mes)} className={enlace}>{MESES[sig.mes - 1]} →</Link> : null}
        {anio !== hoyMes.anio || mes !== hoyMes.mes ? <Link href={href(hoyMes.anio, hoyMes.mes)} className={enlace}>Este mes</Link> : null}
      </nav>
      {profesionales.length > 1 ? (
        <nav aria-label="Elegir profesional" className="flex flex-wrap gap-2">
          {profesionales.map((p) => (
            <Link key={p.id} href={`/reportes?prof=${p.id}&mes=${clave(anio, mes)}`} aria-current={p.id === actual.id ? "page" : undefined} className={`${enlace} ${p.id === actual.id ? "border-linear-mist text-linear-paper" : ""}`}>{p.nombre}</Link>
          ))}
        </nav>
      ) : null}

      <section className={tarjeta} aria-labelledby="h-prest">
        <h2 id="h-prest" className="text-[16px] font-medium text-linear-paper">Prestaciones del mes</h2>
        <p className="mt-1 text-[24px] text-linear-paper">{formatoMonto(r.prestaciones.total)}</p>
        <p className="text-[13px] text-linear-fog">{r.prestaciones.cantidad} {r.prestaciones.cantidad === 1 ? "cargo" : "cargos"} · es lo cargado en la cuenta, no una factura</p>
        {r.prestaciones.porOrigen.length > 0 ? (
          <ul className="mt-3 divide-y divide-linear-graphite">
            {r.prestaciones.porOrigen.map((o) => (<li key={o.origen} className="flex justify-between py-2 text-[15px]"><span className="text-linear-mist">{ORIGEN[o.origen] ?? o.origen}</span><span>{formatoMonto(o.total)}</span></li>))}
          </ul>
        ) : <p className="mt-2 text-[14px] text-linear-fog">No hubo cargos este mes.</p>}
      </section>

      <section className={tarjeta} aria-labelledby="h-cobr">
        <h2 id="h-cobr" className="text-[16px] font-medium text-linear-paper">Cobrado en el mes</h2>
        <p className="mt-1 text-[24px] text-linear-paper">{formatoMonto(r.cobrado.total)}</p>
        {r.cobrado.porMedio.length > 0 ? (
          <ul className="mt-3 divide-y divide-linear-graphite">
            {r.cobrado.porMedio.map((o) => (<li key={o.medio} className="flex justify-between py-2 text-[15px]"><span className="text-linear-mist">{MEDIO[o.medio] ?? o.medio}</span><span>{formatoMonto(o.total.replace("-", ""))}{o.total.startsWith("-") ? " (resta)" : ""}</span></li>))}
          </ul>
        ) : <p className="mt-2 text-[14px] text-linear-fog">No hubo cobros este mes.</p>}
        {r.cobrado.anulaciones !== "0.00" ? <p className="mt-2 text-[13px] text-linear-fog">Ya descuenta {formatoMonto(r.cobrado.anulaciones.replace("-", ""))} de cobros anulados.</p> : null}
      </section>

      <section className={tarjeta} aria-labelledby="h-at">
        <h2 id="h-at" className="text-[16px] font-medium text-linear-paper">Atención</h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div><dt className="text-[13px] text-linear-fog">Atendidos</dt><dd className="text-[18px]">{t.atendido}</dd></div>
          <div><dt className="text-[13px] text-linear-fog">Ausentes</dt><dd className="text-[18px]">{t.ausente}</dd></div>
          <div><dt className="text-[13px] text-linear-fog">Cancelados</dt><dd className="text-[18px]">{t.cancelado}</dd></div>
          <div><dt className="text-[13px] text-linear-fog">Programados</dt><dd className="text-[18px]">{t.programado}</dd></div>
        </dl>
        <p className="mt-3 text-[14px] text-linear-mist">{r.pacientesAtendidos} {r.pacientesAtendidos === 1 ? "paciente distinto atendido" : "pacientes distintos atendidos"}</p>
      </section>

      <section className={tarjeta} aria-labelledby="h-pend">
        <h2 id="h-pend" className="text-[16px] font-medium text-linear-paper">Deuda pendiente hoy</h2>
        <p className="mt-1 text-[24px] text-linear-paper">{formatoMonto(r.pendienteHoy)}</p>
        <p className="mt-1 text-[13px] text-linear-fog">Suma de lo que deben los pacientes a hoy, sin importar el mes. <Link href="/cobros" className="underline underline-offset-4">Ver quiénes</Link></p>
      </section>
    </div>
  );
}
