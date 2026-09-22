import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import LoginForm from "./login-form";

export default async function LoginPage(props: PageProps<"/login">) {
  const { next } = await props.searchParams;
  if (await getCurrentUser()) redirect("/");
  const target = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  return (
    <main className="flex flex-1 items-center justify-center bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center text-white">
          <div className="text-4xl">🗺️</div>
          <h1 className="mt-2 text-2xl font-bold">Kion Map</h1>
          <p className="text-sm text-slate-300">Cartographie du parc informatique</p>
        </div>
        <LoginForm next={target} />
      </div>
    </main>
  );
}
