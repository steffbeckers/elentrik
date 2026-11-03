import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { user } from "../server/db/schema";
import { bestemming } from "../app/sessie/bestemming";
import { adminTestServer } from "./admin-hulp";

let h: Awaited<ReturnType<typeof adminTestServer>>;
beforeAll(async () => { h = await adminTestServer(); }, 120_000);
afterAll(async () => { await h?.stop(); });

describe("superuser access", () => {
  test("anonymous cannot inspect the admin session", async () => {
    expect((await h.stuur("/api/admin/sessie")).status).toBe(401);
  });
  test.each([undefined, "owner", "member"] as const)("ordinary %s cannot promote itself during registration or profile update", async (rol) => {
    const actor = await h.gebruiker("gewoon", rol);
    const response = await h.stuur("/api/admin/sessie", actor.cookie);
    expect(response.status).toBe(403);
    expect(await response.json()).not.toHaveProperty("superuser");
    await h.auth.api.updateUser({ headers: new Headers({ cookie: actor.cookie }), body: { name: "Nieuw", ...{ superuser: true } } });
    expect((await h.stuur("/api/admin/sessie", actor.cookie)).status).toBe(403);
  });
  test("a promoted user needs no company and revocation applies to the same open session", async () => {
    const actor = await h.gebruiker("beheerder");
    await h.db.execute(sql`update "user" set superuser = true where id = ${actor.id}`);
    const response = await h.stuur("/api/admin/sessie", actor.cookie);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({ superuser: true });
    const mij = await (await h.stuur("/api/mij", actor.cookie)).json();
    expect(mij.gebruiker.superuser).toBe(true);
    expect(mij.actieveOrganisatieId).toBeNull();
    expect((await h.stuur("/api/admin/sessie", actor.cookie, { headers: { "x-elentrik-gebruiker": "ander" } })).status).toBe(401);
    await h.db.execute(sql`update "user" set superuser = false where id = ${actor.id}`);
    expect((await h.stuur("/api/admin/sessie", actor.cookie)).status).toBe(403);
    expect((await h.db.select().from(user).where(eq(user.id, actor.id)))[0]?.name).toBe("beheerder");
  });
  test("only real admin paths bypass the organisation requirement for superusers", () => {
    const sessie = { actieveOrganisatieId: null, superuser: true };
    for (const path of ["/admin", "/admin/organisaties/a"]) {
      expect(bestemming({ path, fullPath: path }, sessie)).toBeNull();
      expect(bestemming({ path, fullPath: path }, { ...sessie, superuser: false })).toBe("/geen-organisatie");
    }
    expect(bestemming({ path: "/administrator", fullPath: "/administrator" }, sessie)).toBe("/geen-organisatie");
    expect(bestemming({ path: "/", fullPath: "/" }, sessie)).toBe("/geen-organisatie");
  });
  test("correcting one's own name is reflected in the existing session view", async () => {
    const actor = await h.gebruiker("oude-naam");
    await h.db.update(user).set({ superuser: true }).where(eq(user.id, actor.id));
    const detail = await (await h.stuur(`/api/admin/gebruikers/${actor.id}`, actor.cookie)).json();
    const response = await h.stuur(`/api/admin/gebruikers/${actor.id}`, actor.cookie, {
      method: "PUT", headers: { "content-type": "application/json", "x-elentrik-gebruiker": actor.id },
      body: JSON.stringify({ mutatieId: crypto.randomUUID(), reden: "Eigen naam corrigeren", verwacht: detail.verwacht, gegevens: { naam: "Nieuwe naam" } }),
    });
    expect(response.status).toBe(200);
    expect((await (await h.stuur("/api/mij", actor.cookie)).json()).gebruiker.naam).toBe("Nieuwe naam");
  });
});
