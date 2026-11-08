// projecttoegangVoor: leest gekocht_op en abonnement_stempel_op en het niveau van de organisatie,
// tegen PGlite. Expliciete imports (ruling E1).
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, test } from "vitest";
import type { AbonnementConfig } from "../server/abonnementen/config";
import { projecttoegangVoor } from "../server/abonnementen/repo";
import type { Db } from "../server/db";
import { abonnementen, organization, projecten } from "../server/db/schema";
import { maakTestDb, maakTestOrganisatie } from "./db";

const LIMIETEN = { kringen: 5, situatieschemas: 1 };
const INGESCHAKELD: AbonnementConfig = {
  ingeschakeld: true,
  sleutel: "sk_test_nep",
  webhookGeheim: null,
  prijzen: { maand: "price_maand", jaar: "price_jaar", project: null },
  limieten: LIMIETEN,
  boekhoudingInbox: null,
  apiBasis: null,
};
const UIT: AbonnementConfig = { ingeschakeld: false, limieten: LIMIETEN };

const nu = new Date("2026-11-07T12:00:00Z");
const verleden = new Date("2026-10-01T00:00:00Z");

let db: Db;
let gratisOrg: string;

beforeAll(async () => {
  db = await maakTestDb();
  gratisOrg = await maakTestOrganisatie(db);
  await db.update(organization).set({ proefEinde: verleden }).where(eq(organization.id, gratisOrg));
});

async function project(organisatieId: string | null, deel: { gekochtOp?: Date; abonnementStempelOp?: Date } = {}) {
  const id = randomUUID();
  await db.insert(projecten).values({ id, organisatieId, naam: "Project", document: {}, ...deel });
  return id;
}

describe("projecttoegangVoor", () => {
  test("gratis, gewoon project: limiet en watermerk", async () => {
    const id = await project(gratisOrg);
    expect(await projecttoegangVoor(db, id, INGESCHAKELD, nu)).toEqual({
      niveau: "gratis",
      organisatieId: gratisOrg,
      toegang: { bewerken: true, limiet: true, watermerk: "gratis", gekocht: false, gestempeld: false },
    });
  });

  test("gratis, gekocht project: volledige toegang", async () => {
    const id = await project(gratisOrg, { gekochtOp: verleden, abonnementStempelOp: verleden });
    expect(await projecttoegangVoor(db, id, INGESCHAKELD, nu)).toMatchObject({
      niveau: "gratis",
      toegang: { bewerken: true, limiet: false, watermerk: null, gekocht: true, gestempeld: true },
    });
  });

  test("gratis, gestempeld project: alleen-lezen; met een actief abonnement weer bewerkbaar", async () => {
    const id = await project(gratisOrg, { abonnementStempelOp: verleden });
    expect(await projecttoegangVoor(db, id, INGESCHAKELD, nu)).toMatchObject({
      niveau: "gratis",
      toegang: { bewerken: false, limiet: false, watermerk: null, gekocht: false, gestempeld: true },
    });

    const metAbonnement = await maakTestOrganisatie(db);
    await db.update(organization).set({ proefEinde: verleden }).where(eq(organization.id, metAbonnement));
    await db.insert(abonnementen).values({ organisatieId: metAbonnement, stripeKlantId: "cus_pt", status: "active" });
    const ander = await project(metAbonnement, { abonnementStempelOp: verleden });
    expect(await projecttoegangVoor(db, ander, INGESCHAKELD, nu)).toMatchObject({
      niveau: "abonnement",
      organisatieId: metAbonnement,
      toegang: { bewerken: true, limiet: false, watermerk: null, gestempeld: true },
    });
  });

  test("onderwijs: watermerk onderwijs zonder limiet", async () => {
    const school = await maakTestOrganisatie(db);
    await db.update(organization).set({ onderwijs: true }).where(eq(organization.id, school));
    const id = await project(school);
    expect(await projecttoegangVoor(db, id, INGESCHAKELD, nu)).toMatchObject({
      niveau: "onderwijs",
      toegang: { bewerken: true, limiet: false, watermerk: "onderwijs" },
    });
  });

  test("abonnementen uit: niveau uit, zonder limiet of watermerk", async () => {
    const id = await project(gratisOrg);
    expect(await projecttoegangVoor(db, id, UIT, nu)).toMatchObject({
      niveau: "uit",
      toegang: { bewerken: true, limiet: false, watermerk: null },
    });
  });

  test("een project zonder organisatie of een onbekend project: null", async () => {
    expect(await projecttoegangVoor(db, await project(null), INGESCHAKELD, nu)).toBeNull();
    expect(await projecttoegangVoor(db, randomUUID(), INGESCHAKELD, nu)).toBeNull();
  });
});
