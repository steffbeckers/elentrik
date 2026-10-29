import { sql } from "drizzle-orm";
import { setResponseStatus } from "h3";
import { gebruikDb } from "../db";
import { defineBeveiligdeHandler } from "../utils/toegang";

const TIMEOUT_MS = 3000;

/** Een trivial query; gooit als de database niet bereikbaar is of te traag antwoordt. */
async function controleerDatabase(): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const teLaat = new Promise<never>((_, afwijzen) => {
    timer = setTimeout(() => afwijzen(new Error("timeout")), TIMEOUT_MS);
  });
  try {
    await Promise.race([gebruikDb().execute(sql`select 1`), teLaat]);
  } finally {
    clearTimeout(timer);
  }
}

// Publiek: Docker en de monitoring hebben geen sessie. Het antwoord noemt nooit een fout of een
// instelling; alleen of de database antwoordt.
export default defineBeveiligdeHandler(
  async (event) => {
    try {
      await controleerDatabase();
      return { ok: true };
    } catch {
      setResponseStatus(event, 503);
      return { ok: false };
    }
  },
  { publiek: true },
);
