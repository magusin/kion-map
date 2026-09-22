import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

// Redirection des visiteurs non connectés vers /login.
// Les droits (rôles) sont vérifiés dans chaque page et route API.
export async function proxy(request: NextRequest) {
  const uid = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!uid) {
    const url = new URL("/login", request.url);
    if (request.nextUrl.pathname !== "/") url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Tout sauf l'API (qui répond 401 en JSON), la page de connexion et les fichiers statiques.
  matcher: ["/((?!api|login|_next/static|_next/image|favicon.ico).*)"],
};
