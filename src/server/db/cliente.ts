import { Pool as PgPool } from "pg";
import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as esquema from "./esquema";

export type Db = NodePgDatabase<typeof esquema>;

const global = globalThis as unknown as { __stoDb?: Db };

/**
 * Cliente de base de datos, creado la primera vez que se usa (así `next build` no
 * necesita una base). En Neon usa el driver por WebSocket, que permite transacciones
 * interactivas (bloqueo, verificación e inserción); en local usa `pg` común.
 * Los dos exponen la misma interfaz de Drizzle.
 */
export function getDb(): Db {
  if (global.__stoDb) return global.__stoDb;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL. Copiá .env.example a .env.local y completalo.");

  if (new URL(url).hostname.endsWith(".neon.tech")) {
    neonConfig.webSocketConstructor = ws;
    global.__stoDb = drizzleNeon(new NeonPool({ connectionString: url }), { schema: esquema }) as unknown as Db;
  } else {
    global.__stoDb = drizzlePg(new PgPool({ connectionString: url, max: 5 }), { schema: esquema });
  }
  return global.__stoDb;
}

export { esquema };
