"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Buscar" },
  { href: "/radar", label: "Radar" },
];

function RadarLogo() {
  return (
    <span className="relative grid h-8 w-8 place-items-center rounded-lg bg-accent-soft ring-1 ring-accent/30">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
        <circle cx="12" cy="12" r="8.5" opacity="0.45" />
        <circle cx="12" cy="12" r="4.5" opacity="0.7" />
        <path d="M12 12 18 6" />
        <circle cx="16.5" cy="9" r="1.2" fill="var(--accent)" stroke="none" />
      </svg>
      <span className="absolute -right-0.5 -top-0.5 h-2 w-2 animate-ping rounded-full bg-accent opacity-60" />
    </span>
  );
}

export default function Nav() {
  const pathname = usePathname();
  return (
    <header
      className="sticky z-30 border-b border-line/70 bg-bg/70 backdrop-blur-md"
      style={{ top: "env(safe-area-inset-top, 0px)" }}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2.5">
          <RadarLogo />
          <span className="text-[15px] font-semibold tracking-tight">
            Flights<span className="text-accent">Radar</span>
          </span>
        </Link>
        <nav className="seg text-sm">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} aria-pressed={pathname === l.href} className="seg-item px-4">
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
