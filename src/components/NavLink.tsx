"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useNavGuard } from "./nav-guard";

// Link do menu. Se houver gravação não salva (NavGuard.dirty), intercepta a navegação interna
// (onNavigate só roda em SPA, mesma origem) e delega ao Recorder abrir a caixa de saída — em vez
// de navegar. Sem áudio pendente, é um Link comum (prefetch + soft-nav).
export default function NavLink({
  href,
  children,
  className,
  activeClassName,
  "data-testid": testId,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  activeClassName?: string;
  "data-testid"?: string;
}) {
  const guard = useNavGuard();
  const pathname = usePathname();
  const active = pathname === href || (href !== "/" && pathname.startsWith(href + "/"));

  return (
    <Link
      href={href}
      data-testid={testId}
      aria-current={active ? "page" : undefined}
      className={`${className ?? ""} ${active ? activeClassName ?? "" : ""}`}
      onNavigate={(e) => {
        if (guard.dirty) {
          e.preventDefault();
          guard.requestLeave(href);
        }
      }}
    >
      {children}
    </Link>
  );
}
