import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db";
import { abonnementen, organization } from "../db/schema";
import { maakFout, nietGevondenFout } from "../fouten";
import { schrijfAdminAudit } from "./audit";
import { proefEindeVoorDatum } from "./datum";
import { MutatieBasisSchema, parseAdmin } from "./invoer";
import { eisAdminVersie, versieToken, voerAdminMutatieUit } from "./mutaties";
import { bedrijfsrechtenStaat, haalAdminOrganisatie } from "./records";
import type { AdminActor } from "./toegang";

const VrijstellingSchema = MutatieBasisSchema.extend({ gegevens: z.object({ vrijgesteld: z.boolean(), stripeBevestigd: z.boolean() }).strict() }).strict();
const OnderwijsSchema = MutatieBasisSchema.extend({ gegevens: z.object({ onderwijs: z.boolean(), stripeBevestigd: z.boolean() }).strict() }).strict();
const ProefSchema = MutatieBasisSchema.extend({ gegevens: z.object({ einddatum: z.string(), stripeBevestigd: z.boolean() }).strict() }).strict();
type Invoer = z.infer<typeof VrijstellingSchema> | z.infer<typeof OnderwijsSchema> | z.infer<typeof ProefSchema>;
const WEDERZIJDS_UITGESLOTEN = "Vrijstelling en onderwijs sluiten elkaar uit";

function isCheckSchending(fout: unknown): boolean {
  for (let f: unknown = fout; f && typeof f === "object"; f = (f as { cause?: unknown }).cause) {
    if ((f as { code?: unknown }).code === "23514") return true;
  }
  return false;
}

async function wijzigRechten(db: Db, actor: AdminActor, id: string, i: Invoer, nu: Date) {
  const doel = { type: "organisatie" as const, id, organisatieId: id, projectId: null };
  const actie = "vrijgesteld" in i.gegevens ? "organisatie.vrijstelling" : "onderwijs" in i.gegevens ? "organisatie.onderwijs" : "organisatie.proefperiode";
  return voerAdminMutatieUit(db, actor, { mutatieId: i.mutatieId, actie, doel, payload: i }, async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`abonnement:${id}`}))`);
    const [org] = await tx.select().from(organization).where(eq(organization.id, id)).for("update");
    if (!org) throw nietGevondenFout();
    const [abo] = await tx.select().from(abonnementen).where(eq(abonnementen.organisatieId, id)).for("update");
    const voor = bedrijfsrechtenStaat(org, abo);
    eisAdminVersie(i.verwacht, voor);
    if ((abo?.stripeAbonnementId || abo?.openCheckoutSessie) && !i.gegevens.stripeBevestigd) {
      throw maakFout(400, "Bevestig dat bestaande Stripe-betalingen ongewijzigd blijven", "ADMIN_STRIPE_BEVESTIGING");
    }
    if ("vrijgesteld" in i.gegevens && i.gegevens.vrijgesteld && org.onderwijs) throw maakFout(409, WEDERZIJDS_UITGESLOTEN, "ADMIN_ONDERWIJS_VRIJSTELLING");
    if ("onderwijs" in i.gegevens && i.gegevens.onderwijs && org.vrijgesteld) throw maakFout(409, WEDERZIJDS_UITGESLOTEN, "ADMIN_ONDERWIJS_VRIJSTELLING");
    const wijziging = "vrijgesteld" in i.gegevens ? { vrijgesteld: i.gegevens.vrijgesteld }
      : "onderwijs" in i.gegevens ? { onderwijs: i.gegevens.onderwijs } : { proefEinde: proefEindeVoorDatum(i.gegevens.einddatum) };
    if ("proefEinde" in wijziging && (wijziging.proefEinde! <= org.proefEinde || wijziging.proefEinde! <= nu)) {
      throw maakFout(400, "De nieuwe proefperiode moet later eindigen", "ADMIN_PROEF_VERLENGEN");
    }
    const na = bedrijfsrechtenStaat({ ...org, ...wijziging }, abo);
    if (versieToken(voor) !== versieToken(na)) {
      try {
        await tx.transaction((sp) => sp.update(organization).set(wijziging).where(eq(organization.id, id)));
      } catch (fout) {
        if (isCheckSchending(fout)) throw maakFout(409, WEDERZIJDS_UITGESLOTEN, "ADMIN_ONDERWIJS_VRIJSTELLING");
        throw fout;
      }
      await schrijfAdminAudit(tx, actor, { doel, actie, reden: i.reden, voor, na });
    }
    return haalAdminOrganisatie(tx, id);
  });
}
export function zetVrijstelling(db: Db, actor: AdminActor, id: string, invoer: unknown) {
  return wijzigRechten(db, actor, id, parseAdmin(VrijstellingSchema, invoer), new Date());
}
export function verlengProef(db: Db, actor: AdminActor, id: string, invoer: unknown, nu = new Date()) {
  return wijzigRechten(db, actor, id, parseAdmin(ProefSchema, invoer), nu);
}
export function zetOnderwijs(db: Db, actor: AdminActor, id: string, invoer: unknown) {
  return wijzigRechten(db, actor, id, parseAdmin(OnderwijsSchema, invoer), new Date());
}
