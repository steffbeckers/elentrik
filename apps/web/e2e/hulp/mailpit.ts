// Leest de mail die de e2e-server naar Mailpit stuurt (API op 127.0.0.1:8025).
import { E2E_URL, MAILPIT_URL } from "../omgeving";
import { linkUitTekst } from "./link";

export type OntvangenMail = { onderwerp: string; tekst: string; html: string };

type Bericht = { ID: string; Created: string; To: { Address: string }[] };

async function haalJson<T>(pad: string): Promise<T> {
  const antwoord = await fetch(`${MAILPIT_URL}${pad}`);
  if (!antwoord.ok) throw new Error(`Mailpit ${pad}: ${antwoord.status}`);
  return (await antwoord.json()) as T;
}

/**
 * Wacht tot er een mail aan `adres` is (eventueel enkel na een tijdstip) en geeft de laatste.
 * Gooit een fout na `timeout` ms.
 */
export async function laatsteMailAan(
  adres: string,
  opties: { na?: Date; timeout?: number } = {},
): Promise<OntvangenMail> {
  const einde = Date.now() + (opties.timeout ?? 15_000);
  const gezocht = adres.toLowerCase();
  for (;;) {
    const lijst = await haalJson<{ messages: Bericht[] }>("/api/v1/messages?limit=200");
    const gevonden = lijst.messages
      .filter((m) => m.To.some((t) => t.Address.toLowerCase() === gezocht))
      .filter((m) => !opties.na || new Date(m.Created) >= opties.na)
      .sort((a, b) => new Date(b.Created).getTime() - new Date(a.Created).getTime())[0];
    if (gevonden) {
      const volledig = await haalJson<{ Subject: string; Text: string; HTML: string }>(
        `/api/v1/message/${gevonden.ID}`,
      );
      return { onderwerp: volledig.Subject, tekst: volledig.Text, html: volledig.HTML };
    }
    if (Date.now() > einde) throw new Error(`Geen mail aan ${adres} ontvangen in Mailpit`);
    await new Promise((klaar) => setTimeout(klaar, 250));
  }
}

/** De eerste link naar de e2e-server (`http://127.0.0.1:3100/...`) in de platte tekst van de mail. */
export function linkUit(mail: { tekst: string }): string {
  return linkUitTekst(mail.tekst, E2E_URL);
}
