import { hash, verify } from "@node-rs/argon2";

// argon2id con los parámetros por defecto de la librería (RNF-02: "bcrypt o equivalente").
export function hashearClave(clave: string): Promise<string> {
  return hash(clave);
}

// Hash de una clave inexistente: se verifica contra él cuando el email no existe, para que
// responder "no existe" no tarde distinto que responder "clave incorrecta".
let hashFalso: Promise<string> | undefined;

export async function verificarClave(claveHash: string | null, clave: string): Promise<boolean> {
  hashFalso ??= hash("clave-que-nadie-usa");
  try {
    const ok = await verify(claveHash ?? (await hashFalso), clave);
    return claveHash !== null && ok;
  } catch {
    return false;
  }
}
