import { requirePageUser } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/roles";
import PasswordForm from "@/components/password-form";

export default async function AccountPage() {
  const user = await requirePageUser();
  return (
    <div className="mx-auto w-full max-w-md space-y-4 p-4 md:p-6">
      <h1 className="text-lg font-semibold">Mon compte</h1>
      <div className="card p-4 text-sm">
        <p><span className="text-slate-500">Identifiant :</span> {user.username}</p>
        <p><span className="text-slate-500">Rôle :</span> {ROLE_LABELS[user.role]}</p>
      </div>
      <PasswordForm />
    </div>
  );
}
