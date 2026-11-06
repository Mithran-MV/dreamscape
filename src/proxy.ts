// Writes to the API must come from Dreamscape's own pages. A form or script on another site, even a
// sibling *.hacklabs.in one that SameSite=Lax lets through, is turned away. Requests with no Origin
// (scripts, the worker's own calls) carry no browser cookies by accident, so they pass.
import { NextResponse, type NextRequest } from "next/server";

const OWN = new Set(["https://dreamscape.hacklabs.in", "http://localhost:3000", process.env.APP_URL?.replace(/\/+$/, "")]);

export function proxy(request: NextRequest) {
  if (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") return;
  const origin = request.headers.get("origin");
  if (origin === null || OWN.has(origin) || origin === request.nextUrl.origin) return;
  return NextResponse.json({ error: "Requests must come from Dreamscape's own pages." }, { status: 403 });
}

export const config = { matcher: "/api/:path*" };
