"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { deviceType, type DeviceDTO } from "@/lib/types";
import { deviceHref, personHref } from "@/lib/links";

type Person = { name: string; count: number; places: string[] };

/** Recherche instantanée : propose les opérateurs et les appareils, et mène à leur position sur le plan. */
export default function SearchBox() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<DeviceDTO[] | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const router = useRouter();
  const seq = useRef(0);

  useEffect(() => {
    const term = q.trim();
    const id = ++seq.current;
    const t = setTimeout(async () => {
      if (!term) {
        setPeople([]);
        return setResults(null);
      }
      const [r, p] = await Promise.all([
        api<DeviceDTO[]>(`/api/devices?q=${encodeURIComponent(term)}&limit=8`).catch(() => []),
        api<Person[]>(`/api/people?q=${encodeURIComponent(term)}`).catch(() => []),
      ]);
      if (id === seq.current) {
        setResults(r);
        setPeople(p.slice(0, 4));
      }
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="relative">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (people.length === 1 && people[0].name.toLowerCase() === q.trim().toLowerCase()) router.push(personHref(people[0].name));
          else if (results?.length === 1) router.push(deviceHref(results[0]));
          else router.push(`/devices?q=${encodeURIComponent(q)}`);
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="input py-2.5 text-base"
          placeholder="ex. 192.168.1.10, SRV-AD01, Marie Dupont…"
          autoFocus
        />
      </form>
      {results && (
        <div className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg">
          {people.map((p) => (
            <Link key={p.name} href={personHref(p.name)} className="flex items-center gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2 hover:bg-blue-50">
              <span className="text-xl">👤</span>
              <div className="min-w-0 flex-1">
                <div className="font-medium">{p.name}</div>
                <div className="truncate text-xs text-slate-500">{p.places.join(", ") || "Appareils non placés"}</div>
              </div>
              <span className="text-xs text-slate-500">{p.count} appareil(s) →</span>
            </Link>
          ))}
          {results.length === 0 && people.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-500">Aucun résultat.</p>
          ) : (
            results.map((d) => (
              <Link key={d.id} href={deviceHref(d)} className="flex items-center gap-3 border-b border-slate-100 px-4 py-2 last:border-0 hover:bg-blue-50">
                <span className="text-xl">{deviceType(d.type).icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{d.name}</div>
                  <div className="truncate text-xs text-slate-500">
                    {[d.ip, d.assignedUser, d.location].filter(Boolean).join(" · ") || deviceType(d.type).label}
                  </div>
                </div>
                <div className="text-right text-xs text-slate-500">
                  {d.plan ? (
                    <>
                      <div>{d.plan.name}</div>
                      {d.zone && <div style={{ color: d.zone.color }}>{d.zone.name}</div>}
                    </>
                  ) : (
                    <span className="text-amber-600">Non placé</span>
                  )}
                </div>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
