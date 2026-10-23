// De eerste organisatie van een nieuwe gebruiker, bij zijn eerste bevestigde aanmelding.
//
// Better Auth roept dit aan na elke nieuwe sessie (`databaseHooks.session.create.after` in
// server/auth/index.ts), dus bij elke aanmelding. Zonder wachtende bedrijfsnaam kost het één
// select.
//
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1).
import { randomBytes, randomUUID } from "node:crypto";
import { and, count, eq, isNull } from "drizzle-orm";
import { kenProefperiodeToe } from "../abonnementen/proef";
import type { Db } from "../db";
import { bedrijfsinstellingen, member, organization, projecten, session, user } from "../db/schema";
import { LEGACY_BEDRIJF_ID, neemBestaandeGegevensOver, type OvernameOpties } from "./overname";

export interface RegistratieOpties extends OvernameOpties {
  /** De sessie van deze aanmelding; de nieuwe organisatie wordt er de actieve organisatie. */
  sessieId?: string;
}

const SLUG_TEKENS = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Een unieke slug: de naam in kleine letters zonder accenten, plus 6 willekeurige tekens. */
export function maakSlug(naam: string): string {
  const basis = naam
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  const achtervoegsel = Array.from(randomBytes(6), (b) => SLUG_TEKENS[b % SLUG_TEKENS.length]).join("");
  return `${basis || "organisatie"}-${achtervoegsel}`;
}

/**
 * Maakt voor een bevestigde gebruiker zonder organisatie, met een `wachtendeBedrijfsnaam`, een
 * organisatie met die naam en de gebruiker als `owner`; maakt ze actief in de sessie, vult
 * `installateur.naam` in als die nog leeg is, wist `wachtendeBedrijfsnaam` en neemt de bestaande
 * gegevens over als er nog projecten zonder organisatie of legacy-bedrijfsgegevens zijn. Alles in
 * één transactie.
 *
 * Wie al lid is van een organisatie (of via een uitnodiging zonder bedrijfsnaam kwam), krijgt
 * geen nieuwe; een wachtende naam vervalt dan. Geeft het id van de nieuwe organisatie, of null.
 */
export async function richtEersteOrganisatieIn(
  db: Db,
  gebruiker: { id: string },
  opties: RegistratieOpties = {},
): Promise<string | null> {
  // Snel pad, buiten een transactie: bij een gewone aanmelding is er niets te doen.
  const [vooraf] = await db
    .select({ naam: user.wachtendeBedrijfsnaam, bevestigd: user.emailVerified })
    .from(user)
    .where(eq(user.id, gebruiker.id));
  if (vooraf?.naam == null || !vooraf.bevestigd) return null;

  return db.transaction(async (tx) => {
    // De gebruikersrij vergrendelen: twee gelijktijdige aanmeldingen maken samen één organisatie.
    const [rij] = await tx
      .select({ naam: user.wachtendeBedrijfsnaam, bevestigd: user.emailVerified })
      .from(user)
      .where(eq(user.id, gebruiker.id))
      .for("update");
    if (rij?.naam == null || !rij.bevestigd) return null;

    await tx.update(user).set({ wachtendeBedrijfsnaam: null }).where(eq(user.id, gebruiker.id));

    const naam = rij.naam.trim();
    const [{ aantal } = { aantal: 0 }] = await tx
      .select({ aantal: count() })
      .from(member)
      .where(eq(member.userId, gebruiker.id));
    if (aantal > 0 || naam === "") return null;

    const organisatieId = randomUUID();
    const nu = new Date();
    await tx.insert(organization).values({ id: organisatieId, name: naam, slug: maakSlug(naam), createdAt: nu });
    await tx.insert(member).values({
      id: randomUUID(),
      organizationId: organisatieId,
      userId: gebruiker.id,
      role: "owner",
      createdAt: nu,
    });
    // Het eerste eigen bedrijf van de gebruiker krijgt de proefperiode (spec 4.1).
    await kenProefperiodeToe(tx, { organisatieId, gebruikerId: gebruiker.id, nu });

    // Overnemen als er nog projecten zonder organisatie zijn, of bedrijfsgegevens van vóór de
    // organisaties (ook zonder projecten). Eenmalig: daarna is beide gekoppeld.
    const [zonderOrganisatie] = await tx
      .select({ id: projecten.id })
      .from(projecten)
      .where(isNull(projecten.organisatieId))
      .limit(1);
    const [legacyBedrijf] = zonderOrganisatie
      ? []
      : await tx
          .select({ id: bedrijfsinstellingen.id })
          .from(bedrijfsinstellingen)
          .where(and(eq(bedrijfsinstellingen.id, LEGACY_BEDRIJF_ID), isNull(bedrijfsinstellingen.organisatieId)));
    if (zonderOrganisatie || legacyBedrijf) await neemBestaandeGegevensOver(tx, organisatieId, opties);

    // De bedrijfsnaam wordt installateur.naam, maar overschrijft nooit een bestaande naam.
    const [bedrijf] = await tx
      .select({ installateur: bedrijfsinstellingen.installateur })
      .from(bedrijfsinstellingen)
      .where(eq(bedrijfsinstellingen.organisatieId, organisatieId));
    if (!bedrijf) {
      await tx.insert(bedrijfsinstellingen).values({ organisatieId, installateur: { naam } });
    } else if (bedrijf.installateur.naam.trim() === "") {
      await tx
        .update(bedrijfsinstellingen)
        .set({ installateur: { ...bedrijf.installateur, naam }, gewijzigd: nu })
        .where(eq(bedrijfsinstellingen.organisatieId, organisatieId));
    }

    // De nieuwe organisatie wordt actief, en dus ook de laatst gekozen (spec 2.4).
    await tx.update(user).set({ laatsteOrganisatieId: organisatieId }).where(eq(user.id, gebruiker.id));

    if (opties.sessieId) {
      await tx
        .update(session)
        .set({ activeOrganizationId: organisatieId })
        .where(and(eq(session.id, opties.sessieId), eq(session.userId, gebruiker.id)));
    }

    return organisatieId;
  });
}
