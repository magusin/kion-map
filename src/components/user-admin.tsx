"use client";
import { useState } from "react";
import Modal from "./modal";
import { api } from "@/lib/client";
import { ROLE_LABELS, type Role } from "@/lib/roles";

type User = { id: number; username: string; displayName: string | null; role: Role; createdAt: string };

const ROLE_HELP: Record<Role, string> = {
  VIEWER: "Consulte les plans, zones et appareils, fait des recherches.",
  MODERATOR: "Peut en plus créer et modifier plans, zones et appareils, et importer des fichiers Excel.",
  ADMIN: "Tous les droits, dont la gestion des comptes.",
};

export default function UserAdmin({ meId, initialUsers }: { meId: number; initialUsers: User[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [editing, setEditing] = useState<User | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(u: User) {
    if (!confirm(`Supprimer le compte « ${u.username} » ?`)) return;
    try {
      await api(`/api/users/${u.id}`, { method: "DELETE" });
      setUsers((all) => all.filter((x) => x.id !== u.id));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 p-4 md:p-6">
      <div className="flex items-center">
        <h1 className="text-lg font-semibold">Comptes</h1>
        <button className="btn btn-primary btn-sm ml-auto" onClick={() => setEditing("new")}>+ Nouveau compte</button>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
          <div key={r} className="card p-3 text-xs">
            <b className="text-sm">{ROLE_LABELS[r]}</b>
            <p className="text-slate-600">{ROLE_HELP[r]}</p>
          </div>
        ))}
      </div>
      {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-600 uppercase">
            <tr>
              <th className="px-3 py-2">Identifiant</th>
              <th className="px-3 py-2">Nom affiché</th>
              <th className="px-3 py-2">Rôle</th>
              <th className="px-3 py-2">Créé le</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="px-3 py-2 font-medium">{u.username} {u.id === meId && <span className="text-xs text-slate-400">(vous)</span>}</td>
                <td className="px-3 py-2">{u.displayName}</td>
                <td className="px-3 py-2">{ROLE_LABELS[u.role]}</td>
                <td className="px-3 py-2 text-slate-500">{new Date(u.createdAt).toLocaleDateString("fr-FR")}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <button className="btn btn-sm" onClick={() => setEditing(u)}>Modifier</button>{" "}
                  {u.id !== meId && <button className="btn btn-sm btn-danger" onClick={() => remove(u)}>Supprimer</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <UserForm
          user={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(u) => {
            setUsers((all) => (all.some((x) => x.id === u.id) ? all.map((x) => (x.id === u.id ? u : x)) : [...all, u].sort((a, b) => a.username.localeCompare(b.username))));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function UserForm({ user, onClose, onSaved }: { user: User | null; onClose: () => void; onSaved: (u: User) => void }) {
  const [error, setError] = useState<string | null>(null);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const password = String(f.get("password") ?? "");
    const body: Record<string, unknown> = { displayName: f.get("displayName"), role: f.get("role") };
    if (password) body.password = password;
    try {
      onSaved(user ? await api<User>(`/api/users/${user.id}`, { method: "PATCH", body }) : await api<User>("/api/users", { body: { ...body, username: f.get("username"), password } }));
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <Modal title={user ? `Modifier ${user.username}` : "Nouveau compte"} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        {!user && (
          <div>
            <label className="label">Identifiant</label>
            <input name="username" className="input" required minLength={2} autoFocus autoComplete="off" />
          </div>
        )}
        <div>
          <label className="label">Nom affiché</label>
          <input name="displayName" className="input" defaultValue={user?.displayName ?? ""} />
        </div>
        <div>
          <label className="label">Rôle</label>
          <select name="role" className="input" defaultValue={user?.role ?? "VIEWER"}>
            {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">{user ? "Nouveau mot de passe (laisser vide pour ne pas changer)" : "Mot de passe"}</label>
          <input name="password" type="password" className="input" minLength={8} required={!user} autoComplete="new-password" />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary">Enregistrer</button>
        </div>
      </form>
    </Modal>
  );
}
