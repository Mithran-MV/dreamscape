import { getDb } from "./db";

// What Dreamscape has made so far, counted straight from the database for the landing page.
export function liveCounts() {
  const n = (sql: string) => (getDb().prepare(sql).get() as { n: number }).n;
  return {
    painted: n("SELECT COUNT(*) n FROM dreams WHERE status = 'done'"),
    anchored: n("SELECT COUNT(*) n FROM dreams WHERE registry_tx IS NOT NULL"),
    traced: n("SELECT COUNT(*) n FROM traces WHERE request_id IS NOT NULL"),
    galleries: n("SELECT COUNT(*) n FROM users WHERE ens_json IS NOT NULL"),
    comics: n("SELECT COUNT(*) n FROM episodes WHERE status IN ('draft', 'published')"),
    portraits: n("SELECT COUNT(*) n FROM dreams WHERE video_state = 'done'"),
    sold: n("SELECT COUNT(*) n FROM sales"),
  };
}
