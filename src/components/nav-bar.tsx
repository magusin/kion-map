"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { hasRole, ROLE_LABELS, type SessionUser } from "@/lib/roles";

const ROLE_STYLE = {
  VIEWER: "bg-slate-200 text-slate-700",
  MODERATOR: "bg-amber-100 text-amber-800",
  ADMIN: "bg-red-100 text-red-800",
};

export default function NavBar({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  const router = useRouter();
  const [q, setQ] = useState("");

  const links = [
    { href: "/", label: "Plans" },
    { href: "/devices", label: "Appareils" },
    { href: "/people", label: "Opérateurs" },
    ...(hasRole(user.role, "ADMIN") ? [{ href: "/admin/users", label: "Comptes" }] : []),
  ];

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    // Rechargement complet : vide le cache du routeur après la déconnexion.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/login";
  }

  return (
    <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-900 text-slate-100">
      <div className="flex h-14 items-center gap-4 px-4">
        <Link href="/" className="flex items-center gap-2 font-bold">
          <span className="text-xl">🗺️</span>
          <span>Kion Map</span>
        </Link>
        <nav className="flex gap-1">
          {links.map((l) => {
            const active = l.href === "/" ? pathname === "/" || pathname.startsWith("/plans") : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded px-3 py-1.5 text-sm ${active ? "bg-slate-700 text-white" : "text-slate-300 hover:bg-slate-800"}`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <form
          className="ml-auto hidden max-w-md flex-1 md:block"
          onSubmit={(e) => {
            e.preventDefault();
            router.push(`/devices?q=${encodeURIComponent(q)}`);
          }}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher un appareil (nom, IP, utilisateur…)"
            className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-white placeholder-slate-400 outline-none focus:border-blue-400"
          />
        </form>
        <div className="flex items-center gap-2 text-sm md:ml-0 ml-auto">
          <Link href="/account" className="hidden text-slate-200 hover:underline sm:inline">
            {user.displayName || user.username}
          </Link>
          <span className={`badge ${ROLE_STYLE[user.role]}`}>{ROLE_LABELS[user.role]}</span>
          <button onClick={logout} className="rounded px-2 py-1 text-slate-300 hover:bg-slate-800" title="Se déconnecter">
            ⎋
          </button>
        </div>
      </div>
    </header>
  );
}
