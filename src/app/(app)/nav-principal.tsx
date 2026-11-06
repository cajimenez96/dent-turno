"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type EnlaceNav = { href: string; texto: string };

/** Navegación principal. La sección actual se marca con texto en negrita, fondo y una línea verde (no solo color). */
export function NavPrincipal({ enlaces }: { enlaces: EnlaceNav[] }) {
  const ruta = usePathname();
  return (
    <nav aria-label="Principal" className="-ml-3 flex flex-wrap items-center gap-1">
      {enlaces.map((e) => {
        const activo = ruta === e.href || ruta.startsWith(`${e.href}/`);
        return (
          <Link
            key={e.href}
            href={e.href}
            aria-current={activo ? "page" : undefined}
            className={
              "objetivo-tactil relative inline-flex items-center rounded-md px-3 py-2 text-[14px] hover:bg-surface hover:text-ink " +
              (activo
                ? "bg-surface font-medium text-ink after:absolute after:inset-x-3 after:bottom-0.5 after:h-0.5 after:rounded-full after:bg-brand-green"
                : "text-steel")
            }
          >
            {e.texto}
          </Link>
        );
      })}
    </nav>
  );
}
