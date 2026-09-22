"use client";
import { useState } from "react";
import { api } from "@/lib/client";

export default function PasswordForm() {
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    if (f.get("password") !== f.get("confirm")) return setMsg({ text: "Les mots de passe ne correspondent pas", ok: false });
    try {
      await api("/api/auth/password", { method: "PUT", body: { current: f.get("current"), password: f.get("password") } });
      form.reset();
      setMsg({ text: "Mot de passe modifié", ok: true });
    } catch (err) {
      setMsg({ text: (err as Error).message, ok: false });
    }
  }
  return (
    <form onSubmit={onSubmit} className="card space-y-3 p-4">
      <h2 className="font-semibold">Changer le mot de passe</h2>
      <input name="current" type="password" className="input" placeholder="Mot de passe actuel" required autoComplete="current-password" />
      <input name="password" type="password" className="input" placeholder="Nouveau mot de passe (8 caractères min.)" minLength={8} required autoComplete="new-password" />
      <input name="confirm" type="password" className="input" placeholder="Confirmer" minLength={8} required autoComplete="new-password" />
      {msg && <p className={`text-sm ${msg.ok ? "text-green-700" : "text-red-600"}`}>{msg.text}</p>}
      <button className="btn btn-primary">Enregistrer</button>
    </form>
  );
}
