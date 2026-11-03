import { PartijSchema } from "@elentrik/model";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db";
import { bedrijfsinstellingen, organization, user } from "../db/schema";
import { haalBedrijf } from "../bedrijf/repo";
import { nietGevondenFout } from "../fouten";
import { schrijfAdminAudit } from "./audit";
import { MutatieBasisSchema, parseAdmin } from "./invoer";
import { eisAdminVersie, versieToken, voerAdminMutatieUit } from "./mutaties";
import { haalAdminGebruiker, haalAdminOrganisatie } from "./records";
import type { AdminActor } from "./toegang";

const NaamSchema = z.string().trim().min(1).max(200);
const GebruikerSchema = MutatieBasisSchema.extend({ gegevens: z.object({ naam: NaamSchema }).strict() }).strict();
const OrganisatieSchema = MutatieBasisSchema.extend({ gegevens: z.object({ naam: NaamSchema, installateur: PartijSchema.strict() }).strict() }).strict();

export async function corrigeerGebruiker(db: Db, actor: AdminActor, id: string, invoer: unknown) {
  const i = parseAdmin(GebruikerSchema, invoer);
  const doel = { type: "gebruiker" as const, id, organisatieId: null, projectId: null };
  const actie = "gebruiker.naam";
  return voerAdminMutatieUit(db, actor, { mutatieId: i.mutatieId, actie, doel, payload: i }, async (tx) => {
    const [rij] = await tx.select({ naam: user.name }).from(user).where(eq(user.id, id)).for("update");
    if (!rij) throw nietGevondenFout();
    eisAdminVersie(i.verwacht, rij);
    if (rij.naam !== i.gegevens.naam) {
      await tx.update(user).set({ name: i.gegevens.naam, updatedAt: new Date() }).where(eq(user.id, id));
      await schrijfAdminAudit(tx, actor, { doel, actie, reden: i.reden, voor: rij, na: i.gegevens });
    }
    return haalAdminGebruiker(tx, id);
  });
}

export async function corrigeerOrganisatie(db: Db, actor: AdminActor, id: string, invoer: unknown) {
  const i = parseAdmin(OrganisatieSchema, invoer);
  const doel = { type: "organisatie" as const, id, organisatieId: id, projectId: null };
  const actie = "organisatie.gegevens";
  return voerAdminMutatieUit(db, actor, { mutatieId: i.mutatieId, actie, doel, payload: i }, async (tx) => {
    const [rij] = await tx.select({ naam: organization.name }).from(organization).where(eq(organization.id, id)).for("no key update");
    if (!rij) throw nietGevondenFout();
    await tx.select({ id: bedrijfsinstellingen.id }).from(bedrijfsinstellingen).where(eq(bedrijfsinstellingen.organisatieId, id)).for("update");
    const voor = { naam: rij.naam, installateur: await haalBedrijf(tx, id) };
    eisAdminVersie(i.verwacht, voor);
    const { logoBestandId: _genegeerd, ...partij } = i.gegevens.installateur;
    const na = { naam: i.gegevens.naam, installateur: { ...partij, ...(voor.installateur.logoBestandId ? { logoBestandId: voor.installateur.logoBestandId } : {}) } };
    if (versieToken(voor) !== versieToken(na)) {
      await tx.update(organization).set({ name: na.naam }).where(eq(organization.id, id));
      const gewijzigd = new Date();
      await tx.insert(bedrijfsinstellingen).values({ organisatieId: id, installateur: na.installateur, gewijzigd })
        .onConflictDoUpdate({ target: bedrijfsinstellingen.organisatieId, set: { installateur: na.installateur, gewijzigd } });
      await schrijfAdminAudit(tx, actor, { doel, actie, reden: i.reden, voor, na });
    }
    return haalAdminOrganisatie(tx, id);
  });
}
