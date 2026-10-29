// Mail versturen via Microsoft Graph (app-only, client credentials). Alleen de HTML-versie gaat mee
// (Mail.tekst blijft ongebruikt). `fetch` en de klok zijn injecteerbaar, zodat tests niets
// versturen. Fouten noemen de status en de Graph-foutcode, nooit het geheim of het token.
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module
// rechtstreeks (ruling E1).
import type { Mail, Verzender } from "./verzend";

export type GraphConfig = { tenantId: string; clientId: string; clientGeheim: string; afzender: string };

/** Het token wordt niet meer hergebruikt vanaf 5 minuten voor het verloopt. */
const MARGE_MS = 5 * 60 * 1000;

type Token = { waarde: string; verlooptOp: number };

/** De foutcode uit een Graph-antwoord ({ error: { code } }) of een tokenantwoord ({ error }); anders leeg. */
async function foutcode(antwoord: Response): Promise<string> {
  try {
    const body = (await antwoord.json()) as { error?: unknown };
    const e = body?.error;
    const code = typeof e === "string" ? e : (e as { code?: unknown } | null | undefined)?.code;
    // Alleen een korte, onschuldige code; vrije tekst uit het antwoord nemen we niet over.
    return typeof code === "string" && /^[\w.-]{1,100}$/.test(code) ? code : "";
  } catch {
    return "";
  }
}

async function graphFout(wat: string, antwoord: Response): Promise<Error> {
  const code = await foutcode(antwoord);
  return new Error(`${wat} mislukt: status ${antwoord.status}${code ? `, code ${code}` : ""}`);
}

export function maakGraphVerzender(config: GraphConfig, fetchFn: typeof fetch = fetch, nu: () => number = Date.now): Verzender {
  let token: Token | undefined;
  let lopend: Promise<Token> | undefined;

  async function haalToken(): Promise<Token> {
    const antwoord = await fetchFn(`https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientGeheim,
        grant_type: "client_credentials",
        scope: "https://graph.microsoft.com/.default",
      }).toString(),
    });
    if (!antwoord.ok) throw await graphFout("Graph-token aanvragen", antwoord);
    const body = (await antwoord.json()) as { access_token?: unknown; expires_in?: unknown };
    if (typeof body.access_token !== "string" || !body.access_token) throw new Error("Graph-token aanvragen mislukt: geen token in het antwoord");
    const seconden = Number(body.expires_in);
    return { waarde: body.access_token, verlooptOp: nu() + (Number.isFinite(seconden) ? seconden : 0) * 1000 };
  }

  /** Een geldig token: het onthouden token, of één gedeelde aanvraag voor alle wachtenden. */
  function geefToken(): Promise<Token> {
    if (token && nu() < token.verlooptOp - MARGE_MS) return Promise.resolve(token);
    lopend ??= haalToken()
      .then((t) => (token = t))
      .finally(() => {
        lopend = undefined;
      });
    return lopend;
  }

  return {
    async verstuur(mail: Mail) {
      if (!mail.aan.trim()) throw new Error("Mail zonder ontvanger (aan is leeg)");
      const body = JSON.stringify({
        message: {
          subject: mail.onderwerp,
          body: { contentType: "HTML", content: mail.html },
          toRecipients: [{ emailAddress: { address: mail.aan } }],
          ...(mail.bijlagen?.length
            ? {
                attachments: mail.bijlagen.map((b) => ({
                  "@odata.type": "#microsoft.graph.fileAttachment",
                  name: b.naam,
                  contentType: b.type,
                  contentBytes: Buffer.from(b.inhoud).toString("base64"),
                })),
              }
            : {}),
        },
        saveToSentItems: false,
      });
      const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(config.afzender)}/sendMail`;

      for (let poging = 1; ; poging++) {
        const gebruikt = await geefToken();
        const antwoord = await fetchFn(url, {
          method: "POST",
          headers: { authorization: `Bearer ${gebruikt.waarde}`, "content-type": "application/json" },
          body,
        });
        if (antwoord.ok) return; // 202 Accepted
        if (antwoord.status === 401 && poging === 1) {
          // Het token is geweigerd: vergeten (tenzij een ander al een nieuw heeft) en één keer opnieuw.
          if (token === gebruikt) token = undefined;
          continue;
        }
        throw await graphFout("Graph-mail versturen", antwoord);
      }
    },
  };
}
