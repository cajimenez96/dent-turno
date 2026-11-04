import { sql } from "drizzle-orm";
import { getDb } from "@/server/db/cliente";

export const dynamic = "force-dynamic";

/** Responde 200 si la aplicación llega a la base. Sin datos de pacientes. */
export async function GET() {
  try {
    await getDb().execute(sql`select 1`);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
