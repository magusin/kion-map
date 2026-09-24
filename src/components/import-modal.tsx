"use client";
import { useState } from "react";
import Modal from "./modal";
import { api } from "@/lib/client";

type Report = {
  created: number;
  updated: number;
  skipped: number;
  placed: number;
  toPlace: number;
  plansCreated: string[];
  zonesCreated: string[];
  errors: { row: number; message: string }[];
};

export default function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    setBusy(true);
    setError(null);
    try {
      setReport(await api<Report>("/api/import", { body: form }));
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Importer des appareils depuis Excel" onClose={onClose} wide>
      {!report ? (
        <div className="space-y-3 text-sm">
          <p>
            Le fichier (.xlsx ou .csv) doit contenir une ligne d&apos;en-tête avec au moins la colonne <b>Nom</b>. Colonnes reconnues :{" "}
            <i>Nom, Type, IP, MAC, Utilisateur, Description, Localisation, Plan, Zone</i>.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-slate-600">
            <li>Un appareil dont le nom existe déjà est <b>mis à jour</b>.</li>
            <li>
              Si la zone indiquée est déjà dessinée, l&apos;appareil y est <b>placé automatiquement</b> (s&apos;il n&apos;y était pas déjà). Sa position reste ajustable ensuite.
            </li>
            <li>Les plans et zones inconnus sont <b>créés automatiquement</b> ; leurs appareils s&apos;y placeront dès que vous dessinerez le contour de la zone.</li>
          </ul>
          <a href="/api/import/template" className="btn btn-sm">⬇ Télécharger le modèle Excel</a>
          <input type="file" accept=".xlsx,.csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full rounded border border-dashed border-slate-300 p-4" />
          {error && <p className="rounded bg-red-50 px-3 py-2 text-red-700">{error}</p>}
          <div className="flex justify-end gap-2">
            <button className="btn" onClick={onClose}>Annuler</button>
            <button className="btn btn-primary" disabled={!file || busy} onClick={run}>
              {busy ? "Import en cours…" : "Importer"}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded bg-green-50 p-3"><div className="text-2xl font-bold text-green-700">{report.created}</div>créé(s)</div>
            <div className="rounded bg-blue-50 p-3"><div className="text-2xl font-bold text-blue-700">{report.updated}</div>mis à jour</div>
            <div className="rounded bg-amber-50 p-3"><div className="text-2xl font-bold text-amber-700">{report.skipped}</div>ignoré(s)</div>
          </div>
          {report.placed > 0 && (
            <p className="rounded bg-green-50 px-3 py-2 text-green-800">
              📍 <b>{report.placed}</b> appareil(s) placé(s) automatiquement dans leur zone. Vous pouvez ajuster leur position (fiche → Déplacer).
            </p>
          )}
          {report.toPlace > 0 && (
            <p className="rounded bg-amber-50 px-3 py-2 text-amber-800">
              ⚠ <b>{report.toPlace}</b> appareil(s) rattaché(s) à une zone pas encore dessinée : ils seront placés automatiquement dès que vous dessinerez son contour (éditeur → Zones → Dessiner).
            </p>
          )}
          {report.plansCreated.length > 0 && <p><b>Plans créés :</b> {report.plansCreated.join(", ")}</p>}
          {report.zonesCreated.length > 0 && <p><b>Zones créées (à dessiner) :</b> {report.zonesCreated.join(", ")}</p>}
          {report.errors.length > 0 && (
            <div>
              <b>Avertissements :</b>
              <ul className="mt-1 max-h-48 overflow-y-auto rounded border border-slate-200 text-xs">
                {report.errors.map((e, i) => (
                  <li key={i} className="border-b border-slate-100 px-2 py-1 last:border-0">Ligne {e.row} : {e.message}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex justify-end">
            <button className="btn btn-primary" onClick={onClose}>Fermer</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
