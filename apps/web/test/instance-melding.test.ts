import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { instance, instanceMeldingen } from "../server/db/schema";
import { leesInstanceMelding } from "../shared/instance";
import { maakTestDb } from "./db";

const geldig = () => ({
  instanceId: randomUUID(),
  host: "kopie.example",
  versie: "abc1234",
  abonnementenAan: false,
  aantalOrganisaties: 3,
  aantalGebruikers: 7,
});

describe("leesInstanceMelding", () => {
  it("accepteert een geldige melding", () => {
    const melding = geldig();
    expect(leesInstanceMelding(melding)).toEqual(melding);
  });

  it.each([
    ["null", null],
    ["een array", []],
    ["tekst", "tekst"],
    ["een instanceId zonder uuid", { ...geldig(), instanceId: "geen-uuid" }],
    ["een host van 254 tekens", { ...geldig(), host: "a".repeat(254) }],
    ["een host met hoofdletters", { ...geldig(), host: "Kopie.Example" }],
    ["een host met een spatie", { ...geldig(), host: "a b" }],
    ["een lege versie", { ...geldig(), versie: "" }],
    ["een versie van 65 tekens", { ...geldig(), versie: "v".repeat(65) }],
    ["een negatief aantal", { ...geldig(), aantalGebruikers: -1 }],
    ["een kommagetal", { ...geldig(), aantalGebruikers: 1.5 }],
    ["een te groot aantal", { ...geldig(), aantalGebruikers: 10_000_001 }],
    ["een extra veld", { ...geldig(), email: "a@b.example" }],
  ])("weigert ongeldige meldingen: %s", (_naam, invoer) => {
    expect(leesInstanceMelding(invoer)).toBeNull();
  });

  it.each(["192.0.2.10", "2001:db8::1"])("accepteert een IP als host: %s", (host) => {
    expect(leesInstanceMelding({ ...geldig(), host })).not.toBeNull();
  });
});

describe("migratie", () => {
  it("maakt beide tabellen", async () => {
    const db = await maakTestDb();
    const id = randomUUID();
    await db.insert(instance).values({ id });
    const [rij] = await db.select().from(instance);
    expect(rij).toMatchObject({ sleutel: "deze", id });

    await db.insert(instanceMeldingen).values({
      instanceId: id,
      host: "kopie.example",
      versie: "abc1234",
      abonnementenAan: false,
      aantalOrganisaties: 1,
      aantalGebruikers: 2,
      eersteMeldingOp: new Date(),
      laatsteMeldingOp: new Date(),
    });
    const [melding] = await db.select().from(instanceMeldingen);
    expect(melding).toMatchObject({ instanceId: id, aantalMeldingen: 1, laatsteIp: null });
  });
});
