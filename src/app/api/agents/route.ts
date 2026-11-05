import { connection } from "next/server";
import { liveStalls } from "@/lib/server/vendor";

// Vendor agents with a live stall, straight from Arkiv. A stall whose agent stops beating drops out by itself.
export async function GET() {
  await connection();
  try {
    return Response.json({ agents: await liveStalls() });
  } catch {
    return Response.json({ error: "The market can't be reached right now. Try again in a moment." }, { status: 503 });
  }
}
