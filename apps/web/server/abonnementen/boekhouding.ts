// Betaalde Stripe-facturen doorsturen naar de boekhouding: een mail met de factuur als PDF-bijlage
// aan het adres in BOEKHOUDING_INBOX. Elke factuur vertrekt precies een keer: het factuur-id wordt
// vastgelegd in dezelfde transactie als het verzenden (een mislukte verzending kan dus opnieuw), en
// een tweede aanroep voor dezelfde factuur doet niets.
//
// Het inboxadres wordt nergens gelogd of in een foutmelding gezet.
//
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1).
import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { doorgestuurdeFacturen } from "../db/schema";
import { gebruikVerzender, type Mail } from "../mail/verzend";
import { LOCALES } from "../../shared/taal";
import type { StripePoort } from "./stripe";

function esc(waarde: string): string {
  return waarde
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Het bedrag in euro, bijvoorbeeld "€ 18,15"; Stripe geeft het in cent. De mail aan de boekhouding is altijd Nederlandstalig. */
function euro(cent: number): string {
  return (cent / 100).toLocaleString(LOCALES.nl, { style: "currency", currency: "EUR" });
}

/**
 * Stuurt een betaalde factuur door. `"overgeslagen"` zonder inbox, bij een bedrag van nul, of als
 * de factuur al is doorgestuurd. Een fout (Stripe of SMTP) komt boven en legt niets vast, zodat een
 * volgende poging de factuur alsnog verstuurt.
 *
 * Precies een keer, ook bij gelijktijdige aanroepen voor dezelfde factuur: binnen een transactie
 * wordt de factuur eerst "geclaimd" (insert met `ON CONFLICT DO NOTHING`), pas dan volgen de PDF en
 * de mail. Een tweede aanroep wacht op de claim van de eerste en krijgt daarna geen rij terug
 * (overgeslagen); gooit het verzenden, dan vervalt de claim met de transactie en kan Stripes
 * nieuwe poging de factuur alsnog sturen.
 *
 * De regels "geen inbox" en "bedrag nul" gelden vóór de claim, zodat een overgeslagen factuur
 * nooit een claim achterlaat die een latere, legitieme verzending zou blokkeren.
 */
export async function stuurFactuurDoor(
  db: Db,
  stripe: StripePoort,
  inbox: string | null,
  factuurId: string,
): Promise<"verstuurd" | "overgeslagen"> {
  if (!inbox) return "overgeslagen";

  const [bestaat] = await db
    .select({ id: doorgestuurdeFacturen.stripeFactuurId })
    .from(doorgestuurdeFacturen)
    .where(eq(doorgestuurdeFacturen.stripeFactuurId, factuurId));
  if (bestaat) return "overgeslagen";

  const factuur = await stripe.haalFactuur(factuurId);
  if (!factuur) throw new Error("Stripe kent de factuur niet");
  if (factuur.bedragBetaald <= 0) return "overgeslagen";

  return db.transaction(async (tx) => {
    const geclaimd = await tx
      .insert(doorgestuurdeFacturen)
      .values({ stripeFactuurId: factuurId, nummer: factuur.nummer })
      .onConflictDoNothing()
      .returning({ id: doorgestuurdeFacturen.stripeFactuurId });
    if (geclaimd.length === 0) return "overgeslagen";

    const nummer = factuur.nummer ?? factuur.id;
    const pdf = await stripe.factuurPdf(factuur);
    const regel = `Bijgevoegd: Stripe-factuur ${nummer} van ${euro(factuur.bedragBetaald)}, betaald voor een Elentrik-abonnement.`;
    const mail: Mail = {
      aan: inbox,
      onderwerp: `Stripe-factuur ${nummer}`,
      tekst: `${regel}

Elentrik`,
      html: `<p>${esc(regel)}</p>
<p>Elentrik</p>`,
      bijlagen: [{ naam: `${nummer}.pdf`, inhoud: pdf, type: "application/pdf" }],
    };
    // Gooit dit, dan rolt de transactie de claim terug.
    await gebruikVerzender().verstuur(mail);
    return "verstuurd";
  });
}
