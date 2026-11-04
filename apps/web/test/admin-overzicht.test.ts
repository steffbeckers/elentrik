import { beforeAll, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "../server/db";
import { abonnementen, organization } from "../server/db/schema";
import { adminOverzicht } from "../server/admin/overzicht";
import { maakTestDb, maakTestOrganisatie } from "./db";
import { ADMIN_BILLING } from "./admin-fixtures";
let db: Db;
beforeAll(async () => { db = await maakTestDb(); });
test("overview groups are exclusive and match the actual access precedence", async () => {
  const nu = new Date("2026-11-03T12:00:00Z");
  const cases = [
    { vrij: true, status: "unpaid", einde: "2026-10-01" },
    { vrij: false, status: "trialing", einde: "2026-10-01" },
    { vrij: false, status: "past_due", einde: "2026-10-01" },
    { vrij: false, status: "unknown-new-status", einde: "2026-11-04" },
    { vrij: false, status: "canceled", einde: "2026-10-01" },
  ];
  for (const c of cases) {
    const id = await maakTestOrganisatie(db);
    await db.update(organization).set({ vrijgesteld: c.vrij, proefEinde: new Date(c.einde) }).where(eq(organization.id, id));
    await db.insert(abonnementen).values({ organisatieId: id, stripeKlantId: `cus_${id}`, status: c.status });
  }
  const result = await adminOverzicht(db, ADMIN_BILLING, nu);
  expect(result.aantallen.organisaties).toBe(5);
  expect(result.toegang).toEqual({ vrijgesteld: 1, abonnement: 1, betalingsgratie: 1, proef: 1, alleenLezen: 1, uit: 0 });
  expect(result.aandacht.proefEindigt.items).toHaveLength(1);
  const off = await adminOverzicht(db, { ingeschakeld: false }, nu);
  expect(off.toegang.uit).toBe(5);
  expect(off.aandacht.proefEindigt.items).toEqual([]);
  expect(off.aandacht.betaling.items).toEqual([]);
});
