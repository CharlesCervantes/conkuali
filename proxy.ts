import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth-constants";

// Solo lee la presencia de la cookie (chequeo optimista) — nunca consulta la
// base de datos aquí. La verificación real y autoritativa vive en la DAL
// (lib/server/auth/dal.ts), que corre cerca de los datos.
const PUBLIC_ROUTES = ["/login"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const tieneSesion = request.cookies.has(SESSION_COOKIE_NAME);
  const esRutaPublica = PUBLIC_ROUTES.includes(pathname);

  if (!tieneSesion && !esRutaPublica) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (tieneSesion && esRutaPublica) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
