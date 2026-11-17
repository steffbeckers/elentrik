import { eq } from "drizzle-orm";
import { beforeAll, expect, test } from "vitest";
import type { AbonnementStatus } from "../shared/abonnement";
import { bepaalBedrijfsniveau } from "../server/abonnementen/toegang";
import { groepVoor, toegangGroepSql, verklaarToegang } from "../server/admin/toegangsweergave";
import type { Db } from "../server/db";
import { abonnementen, organization } from "../server/db/schema";
import { ADMIN_BILLING } from "./admin-fixtures";
import { maakTestDb, maakTestOrganisatie } from "./db";

const nu = new Date("2026-11-03T12:00:00Z");
const DAG = 86400000;
const basis = { nu, ingeschakeld: true, proefEinde: nu, vrijgesteld: false, onderwijs: false, abonnement: null };

test("explanation preserves precedence and unknown dates", () => {
  expect(verklaarToegang(basis)).toMatchObject({ niveau: "gratis", reden: "gratis", onderwijs: false });
  expect(verklaarToegang({ ...basis, ingeschakeld: false })).toMatchObject({ niveau: "uit", reden: "uit" });
  expect(verklaarToegang({ ...basis, vrijgesteld: true, abonnement: { status: "unpaid", achterstalligSinds: null } })).toMatchObject({ niveau: "vrijgesteld", reden: "vrijgesteld" });
  expect(verklaarToegang({ ...basis, onderwijs: true, abonnement: { status: "active", achterstalligSinds: null } })).toMatchObject({ niveau: "onderwijs", reden: "onderwijs", onderwijs: true });
  expect(verklaarToegang({ ...basis, abonnement: { status: "active", achterstalligSinds: null } })).toMatchObject({ niveau: "abonnement", reden: "actief" });
  expect(verklaarToegang({ ...basis, abonnement: { status: "past_due", achterstalligSinds: null } })).toMatchObject({ niveau: "abonnement", reden: "betaling-mislukt", achterstalligTot: null });
  expect(verklaarToegang({ ...basis, abonnement: { status: "past_due", achterstalligSinds: new Date("2026-10-20T12:00:00Z") } })).toMatchObject({ niveau: "gratis", reden: "betaling-mislukt" });
});

let db: Db;
beforeAll(async () => { db = await maakTestDb(); });

test("toegangGroepSql volgt bepaalBedrijfsniveau (pariteit)", async () => {
  const toekomst = new Date(nu.getTime() + DAG);
  const verleden = new Date(nu.getTime() - DAG);
  type Geval = { vrijgesteld?: boolean; onderwijs?: boolean; proefEinde: Date; status?: string; sinds?: Date | null };
  const gevallen: Geval[] = [
    { proefEinde: verleden },
    { proefEinde: toekomst },
    { proefEinde: nu },
    { vrijgesteld: true, proefEinde: verleden, status: "unpaid" },
    { onderwijs: true, proefEinde: verleden },
    { onderwijs: true, proefEinde: toekomst, status: "active" },
    { proefEinde: verleden, status: "active" },
    { proefEinde: verleden, status: "trialing" },
    { proefEinde: verleden, status: "past_due", sinds: null },
    { proefEinde: verleden, status: "past_due", sinds: new Date(nu.getTime() - 13 * DAG) },
    { proefEinde: verleden, status: "past_due", sinds: new Date(nu.getTime() - 14 * DAG) },
    { proefEinde: verleden, status: "past_due", sinds: new Date(nu.getTime() - 15 * DAG) },
    { proefEinde: toekomst, status: "past_due", sinds: new Date(nu.getTime() - 15 * DAG) },
    { proefEinde: verleden, status: "unpaid" },
    { proefEinde: verleden, status: "canceled" },
    { proefEinde: toekomst, status: "canceled" },
    { proefEinde: verleden, status: "incomplete" },
    { proefEinde: verleden, status: "paused" },
    { proefEinde: verleden, status: "incomplete_expired" },
  ];
  const ids: string[] = [];
  for (const g of gevallen) {
    const id = await maakTestOrganisatie(db);
    ids.push(id);
    await db.update(organization).set({ vrijgesteld: g.vrijgesteld ?? false, onderwijs: g.onderwijs ?? false, proefEinde: g.proefEinde })
      .where(eq(organization.id, id));
    if (g.status) {
      await db.insert(abonnementen).values({ organisatieId: id, stripeKlantId: `cus_${id}`, status: g.status, achterstalligSinds: g.sinds ?? null });
    }
  }
  for (const config of [ADMIN_BILLING, { ingeschakeld: false as const, limieten: ADMIN_BILLING.limieten }]) {
    const groep = toegangGroepSql(config, nu);
    for (const [i, g] of gevallen.entries()) {
      const [rij] = await db.select({ groep }).from(organization)
        .leftJoin(abonnementen, eq(abonnementen.organisatieId, organization.id)).where(eq(organization.id, ids[i]!));
      const verwacht = groepVoor(bepaalBedrijfsniveau({
        nu, ingeschakeld: config.ingeschakeld, proefEinde: g.proefEinde, vrijgesteld: g.vrijgesteld ?? false,
        onderwijs: g.onderwijs ?? false,
        abonnement: g.status ? { status: g.status as AbonnementStatus, achterstalligSinds: g.sinds ?? null } : null,
      }));
      expect({ geval: i, groep: rij!.groep }).toEqual({ geval: i, groep: verwacht });
    }
  }
});
