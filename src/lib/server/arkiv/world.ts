// The World Dream's open record: each day's shared themes and feelings, with counts and no words.
import { ExpirationTime } from "@arkiv-network/sdk";
import { and, desc, eq } from "@arkiv-network/sdk/query";
import { arkiv, type Arkiv, type Written } from "./client";
import { isFeeling, isTheme, MIN_DREAMERS, WorldDream, type Feeling, type Theme } from "./schemas";

export type ThemeCount = { theme: Theme; feeling: Feeling; count: number };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CIRCLE = /^[a-z0-9-]{1,64}$/;

// Publishes a day's counts in one transaction: readonly, and kept as long as Arkiv allows (about 182 days).
// Refuses any theme fewer than MIN_DREAMERS dreamers share, and a day already published for that circle.
export function publishWorldDream(input: { date: string; circle?: string; themes: ThemeCount[] }, ctx: Arkiv = arkiv()): Promise<Written[]> {
  const circle = input.circle ?? "world";
  if (!DATE.test(input.date)) throw new Error(`date must be YYYY-MM-DD, got "${input.date}".`);
  if (!CIRCLE.test(circle)) throw new Error(`circle must be lowercase letters, digits and dashes, got "${circle}".`);
  for (const t of input.themes) {
    if (!isTheme(t.theme) || !isFeeling(t.feeling)) throw new Error(`Unknown theme or feeling: ${t.theme}, ${t.feeling}.`);
    if (!Number.isInteger(t.count) || t.count < MIN_DREAMERS) throw new Error(`"${t.theme}" has ${t.count} dreamers; at least ${MIN_DREAMERS} must share a theme.`);
  }
  if (!input.themes.length) return Promise.resolve([]);
  return ctx.serial(async () => {
    const existing = await ctx.reader.count().from(WorldDream).where(and(eq("date", input.date), eq("circle", circle))).createdBy(ctx.serverAddress).fetch();
    if (existing > BigInt(0)) throw new Error(`The World Dream for ${input.date} (${circle}) is already published.`);
    const result = await ctx.server.executeBatch({
      creates: input.themes.map((t) => ({
        schema: WorldDream,
        values: { date: input.date, circle, theme: t.theme, feeling: t.feeling, count: t.count },
        expiration: ExpirationTime.max(),
        flags: { readonly: true },
      })),
    });
    return result.createdEntities.map((key) => ({ key, txHash: result.txHash }));
  });
}

// A day's counts, most shared first.
export async function worldDream(date: string, circle = "world", ctx: Arkiv = arkiv()) {
  const page = await ctx.reader
    .select("*")
    .from(WorldDream)
    .where(and(eq("date", date), eq("circle", circle)))
    .createdBy(ctx.serverAddress)
    .orderBy(desc("count"))
    .limit(100)
    .fetch();
  return page.entities.map((row) => ({ key: row.$key, theme: row.theme.value, feeling: row.feeling.value, count: row.count.value }));
}
