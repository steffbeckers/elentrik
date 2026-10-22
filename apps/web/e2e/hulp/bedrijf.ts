// Snapshot en herstel van de bedrijfsgegevens voor e2e-tests. De gegevens zijn één gedeelde
// rij in de ontwikkelbank; een test die ze wijzigt of een logo oplaadt moet ze volledig
// terugzetten, ook de verwijzing naar het logo (die kan de API zelf niet terugzetten).
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import type { APIRequestContext } from "@playwright/test";
import postgres from "postgres";

export type BedrijfSnapshot = {
  /** De volledige rij (met `logoBestandId`), of `null` als er nog geen rij was. */
  installateur: Record<string, unknown> | null;
  /** De logo-bestanden die er al waren; alles wat erbij komt, ruimt `herstelBedrijf` op. */
  logoIds: string[];
};

function verbind() {
  return postgres(process.env.DATABASE_URL ?? "postgres://elentrik:elentrik@127.0.0.1:5432/elentrik", {
    max: 1,
  });
}

/** Dezelfde map als de server (`ELENTRIK_BESTANDEN_DIR`, standaard relatief aan apps/web). */
function bestandenMap(): string {
  return resolve(process.env.ELENTRIK_BESTANDEN_DIR || ".data/bestanden");
}

export async function bewaarBedrijfSnapshot(): Promise<BedrijfSnapshot> {
  const sql = verbind();
  try {
    const rijen = await sql<{ installateur: Record<string, unknown> }[]>`
      select installateur from bedrijfsinstellingen where id = 1`;
    const logos = await sql<{ id: string }[]>`select id from bestanden where soort = 'logo'`;
    return { installateur: rijen[0]?.installateur ?? null, logoIds: logos.map((l) => l.id) };
  } finally {
    await sql.end();
  }
}

/** Zet de bedrijfsrij terug zoals ze was en verwijdert de logo's die sindsdien zijn bijgekomen (rij en bestand). */
export async function herstelBedrijf(snapshot: BedrijfSnapshot): Promise<void> {
  const sql = verbind();
  try {
    if (snapshot.installateur === null) {
      await sql`delete from bedrijfsinstellingen where id = 1`;
    } else {
      await sql`
        insert into bedrijfsinstellingen (id, installateur, gewijzigd)
        values (1, ${sql.json(snapshot.installateur as Parameters<typeof sql.json>[0])}, now())
        on conflict (id) do update
          set installateur = excluded.installateur, gewijzigd = excluded.gewijzigd`;
    }
    const nieuwe = await sql<{ id: string; sleutel: string }[]>`
      select id, sleutel from bestanden
      where soort = 'logo' and id <> all(${snapshot.logoIds}::uuid[])`;
    for (const { id, sleutel } of nieuwe) {
      await sql`delete from bestanden where id = ${id}`;
      await rm(resolve(bestandenMap(), sleutel), { force: true });
    }
  } finally {
    await sql.end();
  }
}

/** Een bekende uitgangstoestand voor elke test: enkel de naam, zonder adres of contactgegevens. */
export async function zetBedrijfBasislijn(request: APIRequestContext): Promise<void> {
  const antwoord = await request.put("/api/bedrijfsgegevens", { data: { naam: "E2E" } });
  if (!antwoord.ok()) throw new Error(`Basislijn bewaren mislukt: ${antwoord.status()}`);
}
