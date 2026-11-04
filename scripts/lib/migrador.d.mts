import type { Client } from "pg";
export function aplicarMigraciones(cliente: Client, log?: (mensaje: string) => void): Promise<number>;
