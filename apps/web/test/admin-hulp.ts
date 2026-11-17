import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { eq } from "drizzle-orm";
import { createApp, createRouter, toNodeListener, type EventHandler } from "h3";
import { vi } from "vitest";
import { maakAuth, zetAuth } from "../server/auth";
import { zetAbonnementen } from "../server/abonnementen/config";
import { zetDb } from "../server/db";
import { member, user } from "../server/db/schema";
import { zetVerzender } from "../server/mail/verzend";
import { maakTestDb, maakTestOrganisatie } from "./db";
import { beveiligdeRoutebestanden, routeUit } from "./routes";

/** Real database, auth and HTTP; only outbound email/billing are disabled. */
export async function adminTestServer() {
  vi.stubEnv("BETTER_AUTH_SECRET", "admin-test-geheim-0123456789abcdefghijklmnopqrstuvwxyz");
  vi.stubEnv("BETTER_AUTH_URL", "http://127.0.0.1:3000");
  zetVerzender({ async verstuur() {} });
  zetAbonnementen({ config: { ingeschakeld: false, limieten: { kringen: 5, situatieschemas: 1 } }, stripe: null });
  const db = await maakTestDb();
  zetDb(db);
  const auth = maakAuth(db);
  zetAuth(auth);
  const router = createRouter();
  for (const route of beveiligdeRoutebestanden().map(routeUit)) {
    const module = await import(route.bestand) as { default: EventHandler };
    router.use(route.pad, module.default, route.methode);
  }
  const app = createApp();
  app.use(router);
  const server = createServer(toNodeListener(app));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const basis = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const wachtwoord = "test-wachtwoord-123";
  async function gebruiker(naam: string, rol?: "owner" | "member") {
    const email = `${naam}-${crypto.randomUUID()}@voorbeeld.be`;
    const body = { name: naam, email, password: wachtwoord, superuser: true };
    const result = await auth.api.signUpEmail({ body });
    const id = result.user.id;
    await db.update(user).set({ emailVerified: true }).where(eq(user.id, id));
    if (rol) {
      const organisatieId = await maakTestOrganisatie(db);
      await db.insert(member).values({ id: crypto.randomUUID(), userId: id, organizationId: organisatieId, role: rol, createdAt: new Date() });
    }
    const { headers } = await auth.api.signInEmail({ body: { email, password: wachtwoord }, returnHeaders: true });
    const cookie = headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    return { id, cookie };
  }
  async function stuur(pad: string, cookie?: string, opties: RequestInit = {}) {
    const headers = new Headers(opties.headers);
    if (cookie) headers.set("cookie", cookie);
    return fetch(`${basis}${pad}`, { ...opties, headers });
  }
  return {
    db, auth, gebruiker, stuur,
    async stop() {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      zetAbonnementen(undefined);
      vi.unstubAllEnvs();
    },
  };
}
