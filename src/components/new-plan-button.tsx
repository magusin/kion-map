"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "./modal";
import { api } from "@/lib/client";

export default function NewPlanButton() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      const plan = await api<{ id: number }>("/api/plans", {
        body: { name: f.get("name"), description: f.get("description"), width: f.get("width"), height: f.get("height") },
      });
      router.push(`/plans/${plan.id}/edit`);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        + Nouveau plan
      </button>
      {open && (
        <Modal title="Nouveau plan" onClose={() => setOpen(false)}>
          <form onSubmit={onSubmit} className="space-y-3">
            <div>
              <label className="label">Nom</label>
              <input name="name" className="input" required autoFocus placeholder="ex. Bâtiment A - RDC" />
            </div>
            <div>
              <label className="label">Description</label>
              <textarea name="description" className="input" rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Largeur (px)</label>
                <input name="width" type="number" className="input" defaultValue={1200} min={200} max={10000} />
              </div>
              <div>
                <label className="label">Hauteur (px)</label>
                <input name="height" type="number" className="input" defaultValue={800} min={200} max={10000} />
              </div>
            </div>
            <p className="text-xs text-slate-500">Vous pourrez ensuite dessiner les murs et les zones, ou importer une image du plan.</p>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn" onClick={() => setOpen(false)}>Annuler</button>
              <button className="btn btn-primary">Créer et dessiner</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
