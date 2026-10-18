import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { projecten } from "../server/db/schema";
import { maakTestDb } from "./db";

describe("maakTestDb", () => {
  test("geeft een database waarin een project ingevoegd en teruggelezen kan worden", async () => {
    const db = await maakTestDb();
    const document = { versie: 1, wortel: { id: "w", kinderen: ["a", "b"] } };

    const [ingevoegd] = await db
      .insert(projecten)
      .values({ naam: "Woning Peeters", document })
      .returning();

    expect(ingevoegd).toBeDefined();
    const rijen = await db
      .select()
      .from(projecten)
      .where(eq(projecten.id, ingevoegd!.id));

    expect(rijen).toHaveLength(1);
    const rij = rijen[0]!;
    expect(rij.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(rij.naam).toBe("Woning Peeters");
    expect(rij.klantnaam).toBe("");
    expect(rij.document).toEqual(document);
    expect(rij.versie).toBe(1);
    expect(rij.aangemaakt).toBeInstanceOf(Date);
    expect(rij.gewijzigd).toBeInstanceOf(Date);
    expect(rij.verwijderd).toBeNull();
  });

  test("elke aanroep geeft een eigen, lege database", async () => {
    const eerste = await maakTestDb();
    await eerste.insert(projecten).values({ naam: "A", document: {} });

    const tweede = await maakTestDb();
    expect(await tweede.select().from(projecten)).toEqual([]);
  });
});
