import { connection } from "next/server";
import { liveCounts } from "@/lib/server/stats";

// The landing page's live numbers. Counts only, nothing about any dreamer.
export async function GET() {
  await connection();
  return Response.json(liveCounts(), { headers: { "Cache-Control": "public, max-age=60" } });
}
