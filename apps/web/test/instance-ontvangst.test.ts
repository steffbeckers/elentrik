// De ontvangende kant van de instance-ping: opslaan, het dagplafond, de limiet per sleutel en het
// opruimen. De database is PGlite; er gaat niets over het netwerk.
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";
import type { Db } from "../server/db";
import { instanceMeldingen } from "../server/db/schema";
import {
  BEWAARDAGEN,
  DAGPLAFOND,
  maakLimiet,
  ruimInstanceMeldingenOp,
  slaMeldingOp,
} from "../server/instance/ontvangst";
import type { InstanceMelding } from "../shared/instance";
import { maakTestDb } from "./db";

const DAG_MS = 24 * 3600 * 1000;
const NU = new Date("2026-11-09T12:00:00Z");

function melding(extra: Partial<InstanceMelding> = {}): InstanceMelding {
  return {
    instanceId: randomUUID(),
    host: "elentrik.voorbeeld.be",
    versie: "abc1234",
    abonnementenAan: false,
    aantalOrganisaties: 1,
    aantalGebruikers: 2,
    ...extra,
  };
}

function rij(eerste: Date, laatste: Date = eerste, instanceId: string = randomUUID()) {
  return {
    instanceId,
    host: "h.be",
    versie: "v",
    abonnementenAan: false,
    aantalOrganisaties: 0,
    aantalGebruikers: 0,
    eersteMeldingOp: eerste,
    laatsteMeldingOp: laatste,
  };
}

let db: Db;
beforeEach(async () => {
  db = await maakTestDb();
});

describe("slaMeldingOp", () => {
  test("eerste melding maakt een rij, tweede werkt bij", async () => {
    const eerste = melding();
    const later = new Date(NU.getTime() + 3600_000);
    expect(await slaMeldingOp(db, eerste, "192.0.2.1", NU)).toBe("nieuw");
    const tweede = melding({
      instanceId: eerste.instanceId,
      host: "nieuw.voorbeeld.be",
      versie: "def5678",
      abonnementenAan: true,
      aantalOrganisaties: 5,
      aantalGebruikers: 9,
    });
    expect(await slaMeldingOp(db, tweede, "192.0.2.2", later)).toBe("bijgewerkt");
    const rijen = await db.select().from(instanceMeldingen);
    expect(rijen).toHaveLength(1);
    const opgeslagen = rijen[0]!;
    expect(opgeslagen.aantalMeldingen).toBe(2);
    expect(opgeslagen.eersteMeldingOp).toEqual(NU);
    expect(opgeslagen.laatsteMeldingOp).toEqual(later);
    expect(opgeslagen.host).toBe("nieuw.voorbeeld.be");
    expect(opgeslagen.versie).toBe("def5678");
    expect(opgeslagen.abonnementenAan).toBe(true);
    expect(opgeslagen.aantalOrganisaties).toBe(5);
    expect(opgeslagen.aantalGebruikers).toBe(9);
    expect(opgeslagen.laatsteIp).toBe("192.0.2.2");
  });

  test("gelijktijdige meldingen met dezelfde nieuwe id geven één rij", async () => {
    const m = melding();
    const uitkomsten = await Promise.all([slaMeldingOp(db, m, null, NU), slaMeldingOp(db, m, null, NU)]);
    expect([...uitkomsten].sort()).toEqual(["bijgewerkt", "nieuw"]);
    const rijen = await db.select().from(instanceMeldingen);
    expect(rijen).toHaveLength(1);
    expect(rijen[0]!.aantalMeldingen).toBe(2);
  });

  test("plafond: de 101ste nieuwe id op dezelfde UTC-dag wordt niet opgeslagen, een bestaande id wel bijgewerkt", async () => {
    expect(DAGPLAFOND).toBe(100);
    const bestaande = melding();
    const begin = new Date("2026-11-09T00:00:00Z");
    await db
      .insert(instanceMeldingen)
      .values(Array.from({ length: DAGPLAFOND }, (_, i) => rij(begin, begin, i === 0 ? bestaande.instanceId : undefined)));
    expect(await slaMeldingOp(db, melding(), null, NU)).toBe("plafond");
    expect(await db.select().from(instanceMeldingen)).toHaveLength(DAGPLAFOND);
    expect(await slaMeldingOp(db, bestaande, null, NU)).toBe("bijgewerkt");
    const morgen = new Date("2026-11-10T00:00:01Z");
    expect(await slaMeldingOp(db, melding(), null, morgen)).toBe("nieuw");
    expect(await db.select().from(instanceMeldingen)).toHaveLength(DAGPLAFOND + 1);
  });
});

describe("maakLimiet", () => {
  test("limiet: 10 per uur per sleutel", () => {
    const limiet = maakLimiet();
    const t = 1_000_000;
    for (let i = 0; i < 10; i++) expect(limiet("a", t)).toBe(true);
    expect(limiet("a", t)).toBe(false);
    expect(limiet("b", t)).toBe(true);
    expect(limiet("a", t + 3_600_001)).toBe(true);
  });
});

describe("ruimInstanceMeldingenOp", () => {
  test("opruimen wist alleen meldingen ouder dan 365 dagen", async () => {
    expect(BEWAARDAGEN).toBe(365);
    const oud = rij(new Date(NU.getTime() - 366 * DAG_MS));
    const recent = rij(new Date(NU.getTime() - 364 * DAG_MS));
    await db.insert(instanceMeldingen).values([oud, recent]);
    expect(await ruimInstanceMeldingenOp(db, NU)).toBe(1);
    const over = await db.select({ id: instanceMeldingen.instanceId }).from(instanceMeldingen);
    expect(over.map((r) => r.id)).toEqual([recent.instanceId]);
    expect(
      await db.select().from(instanceMeldingen).where(eq(instanceMeldingen.instanceId, oud.instanceId)),
    ).toHaveLength(0);
  });
});
