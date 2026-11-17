import { beforeAll, beforeEach, expect, test } from "vitest";
import type { Db } from "../server/db";
import { instanceMeldingen } from "../server/db/schema";
import { lijstInstances } from "../server/admin/instances";
import { maakTestDb } from "./db";

let db: Db;
const nu = new Date("2026-11-09T12:00:00Z");
const dagenTerug = (dagen: number) => new Date(nu.getTime() - dagen * 86_400_000);
const rij = (n: number, laatste: Date) => ({
  instanceId: crypto.randomUUID(), host: `host-${n}.example`, versie: "abc123", abonnementenAan: n % 2 === 0,
  aantalOrganisaties: n, aantalGebruikers: n + 1, eersteMeldingOp: dagenTerug(30), laatsteMeldingOp: laatste,
});

beforeAll(async () => { db = await maakTestDb(); });
beforeEach(async () => { await db.delete(instanceMeldingen); });

test("de nieuwste melding staat bovenaan en de velden worden afgebeeld", async () => {
  await db.insert(instanceMeldingen).values([rij(1, dagenTerug(3)), rij(2, dagenTerug(1)), rij(3, dagenTerug(2))]);
  const pagina = await lijstInstances(db, nu);
  expect(pagina.items.map((i) => i.host)).toEqual(["host-2.example", "host-3.example", "host-1.example"]);
  expect(pagina.totaal).toBe(3);
  expect(pagina.items[0]).toMatchObject({ abonnementenAan: true, aantalOrganisaties: 2, aantalGebruikers: 3, aantalMeldingen: 1, laatsteIp: null,
    laatsteMeldingOp: dagenTerug(1).toISOString(), eersteMeldingOp: dagenTerug(30).toISOString() });
});

test("stil is true na meer dan 7 dagen zonder melding", async () => {
  await db.insert(instanceMeldingen).values([rij(1, dagenTerug(8)), rij(2, dagenTerug(6))]);
  const { items } = await lijstInstances(db, nu);
  expect(items.find((i) => i.host === "host-1.example")!.stil).toBe(true);
  expect(items.find((i) => i.host === "host-2.example")!.stil).toBe(false);
});

test("51 rijen geven op pagina 2 één item", async () => {
  await db.insert(instanceMeldingen).values(Array.from({ length: 51 }, (_, n) => rij(n, dagenTerug(1 + n / 100))));
  const p1 = await lijstInstances(db, nu);
  const p2 = await lijstInstances(db, nu, { pagina: "2" });
  expect([p1.items.length, p2.items.length, p2.totaal, p2.perPagina, p2.pagina]).toEqual([50, 1, 51, 50, 2]);
});
