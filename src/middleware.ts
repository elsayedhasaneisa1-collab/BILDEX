import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/@")) {
    const username = pathname.slice(2).split("/")[0];
    const url = req.nextUrl.clone();
    url.pathname = `/designers/${username}`;
    return NextResponse.rewrite(url);
  }
  const protectedPath = ["/dashboard", "/studio", "/designer", "/admin", "/id-card", "/checkout"].some((prefix) => pathname.startsWith(prefix));
  if (protectedPath && !req.cookies.get("bx_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  const res = NextResponse.next();
  if (!req.cookies.get("bx_csrf")) {
    res.cookies.set("bx_csrf", crypto.randomUUID().replaceAll("-", ""), {
      sameSite: "lax",
      secure: req.nextUrl.protocol === "https:",
      path: "/",
      httpOnly: false,
    });
  }
  return res;
}

export const config = { matcher: ["/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|svg|webp|gif|ico)$).*)"] };
