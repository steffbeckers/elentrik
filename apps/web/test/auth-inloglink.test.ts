// Een fout na een geldige inloglink (hier: de sessiehook faalt) geeft een redirect naar /inloggen met
// een vertaalbare code, geen kale 500. Alleen de verificatie van de inloglink en van de bevestigingslink
// wordt zo opgevangen.
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { type Auth, maakAuth } from "../server/auth";
import { BEVESTIGING_PAD, INLOGLINK_PAD, metInloglinkVangnet } from "../server/auth/inloglink";
import type { Db } from "../server/db";
import { session, user } from "../server/db/schema";
import { type Mail, type Verzender, zetVerzender } from "../server/mail/verzend";
import { INLOGLINK_MISLUKT } from "../shared/inloglink";
import { maakTestDb } from "./db";

// De sessiehook van Better Auth roept dit na elke nieuwe sessie aan; een test kan het laten falen.
const hook = vi.hoisted(() => ({ faal: false }));
vi.mock("../server/organisaties/registratie", () => ({
  richtEersteOrganisatieIn: async () => {
    if (hook.faal) throw new Error("hook stuk voor ontvanger@voorbeeld.be met token abc123");
    return null;
  },
}));

const BASIS = "http://127.0.0.1:3000";

let db: Db;
let auth: Auth;
const mails: Mail[] = [];
const verzamelaar: Verzender = {
  async verstuur(mail) {
    mails.push(mail);
  },
};

beforeAll(async () => {
  vi.stubEnv("BETTER_AUTH_SECRET", "vitest-geheim-alleen-voor-tests-0123456789abcdef");
  vi.stubEnv("BETTER_AUTH_URL", BASIS);
  zetVerzender(verzamelaar);
  db = await maakTestDb();
  auth = maakAuth(db);
});

afterAll(() => {
  vi.unstubAllEnvs();
});

afterEach(() => {
  hook.faal = false;
  vi.restoreAllMocks();
});

let teller = 0;

/** Een bevestigde gebruiker, rechtstreeks in de tabel, met een geldige inloglink. */
async function inloglink(): Promise<{ url: string; email: string }> {
  teller += 1;
  const email = `link${teller}@voorbeeld.be`;
  await db.insert(user).values({ id: crypto.randomUUID(), name: "Jan", email, emailVerified: true });
  mails.length = 0;
  await auth.api.signInMagicLink({
    body: { email, callbackURL: "/projecten" },
    headers: new Headers({ "user-agent": "vitest", "x-forwarded-for": "127.0.0.1" }),
  });
  await new Promise((klaar) => setTimeout(klaar, 0));
  const mail = mails.find((m) => m.aan === email)!;
  return { url: mail.tekst.match(/https?:\/\/\S+/)![0], email };
}

const handler = (verzoek: Request) => auth.handler(verzoek);

/** Een nieuwe, nog onbevestigde gebruiker met de bevestigingslink uit de mail (zonder callbackURL). */
async function bevestigingslink(): Promise<URL> {
  teller += 1;
  const email = `nieuw${teller}@voorbeeld.be`;
  mails.length = 0;
  await auth.api.signUpEmail({
    body: { name: "Jan", email, password: "lang-genoeg-1", wachtendeBedrijfsnaam: "Peeters Elektro" },
    headers: new Headers({ "user-agent": "vitest", "x-forwarded-for": "127.0.0.1" }),
  });
  await new Promise((klaar) => setTimeout(klaar, 0));
  const mail = mails.find((m) => m.aan === email)!;
  return new URL(mail.tekst.match(/https?:\/\/\S+/)![0]);
}

describe("een fout na een geldige inloglink", () => {
  test("zonder vangnet is het een kale 500 (de aanleiding)", async () => {
    const { url } = await inloglink();
    hook.faal = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
    const antwoord = await handler(new Request(url));
    expect(antwoord.status).toBe(500);
  });

  test("met het vangnet: 302 naar /inloggen?fout=INLOGLINK_MISLUKT, en geen sessiecookie", async () => {
    const { url } = await inloglink();
    // De bestemming van de link: een echte link, dus Better Auth zelf leest ze ook (rate limit: één keer).
    const link = new URL(url);
    link.searchParams.set("callbackURL", "/uitnodiging/abc");
    hook.faal = true;
    vi.spyOn(console, "error").mockImplementation(() => {});

    const antwoord = await metInloglinkVangnet(new Request(link), handler);

    expect(antwoord.status).toBe(302);
    expect(antwoord.headers.get("location")).toBe(`/inloggen?fout=${INLOGLINK_MISLUKT}&terug=%2Fuitnodiging%2Fabc`);
    expect(antwoord.headers.getSetCookie()).toEqual([]);
  });

  test("het log bevat geen adres, token of boodschap van de fout", async () => {
    const { url, email } = await inloglink();
    hook.faal = true;
    const fouten = vi.spyOn(console, "error").mockImplementation(() => {});

    await metInloglinkVangnet(new Request(url), handler);

    // Better Auth logt de fout zelf ook (zijn eigen logger); hier telt alleen onze regel.
    const regels = fouten.mock.calls
      .map((c) => String(c[0]))
      .filter((r) => r.startsWith("Inloglink"))
      .join("\n");
    expect(regels).toBe(`Inloglink verifiëren mislukt op ${INLOGLINK_PAD}: status 500`);
    for (const verboden of [email, "ontvanger@voorbeeld.be", "abc123", new URL(url).searchParams.get("token")!]) {
      expect(regels).not.toContain(verboden);
    }
  });

  test("een gooiende handler wordt ook opgevangen", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const antwoord = await metInloglinkVangnet(new Request(`${BASIS}${INLOGLINK_PAD}?token=x`), async () => {
      throw new Error("kapot");
    });
    expect(antwoord.status).toBe(302);
    expect(antwoord.headers.get("location")).toBe(`/inloggen?fout=${INLOGLINK_MISLUKT}`);
  });

  test("een geldige link zonder fout werkt gewoon: sessie en redirect naar de callback", async () => {
    const { url, email } = await inloglink();
    const antwoord = await metInloglinkVangnet(new Request(url), handler);
    expect(antwoord.status).toBe(302);
    expect(antwoord.headers.get("location")).toBe(`${BASIS}/projecten`);
    expect(antwoord.headers.getSetCookie().length).toBeGreaterThan(0);
    const [gebruiker] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
    expect(await db.select().from(session).where(eq(session.userId, gebruiker!.id))).toHaveLength(1);
  });

  test("een ongeldige token laat Better Auth zelf antwoorden (geen eigen redirect)", async () => {
    const antwoord = await metInloglinkVangnet(
      new Request(`${BASIS}${INLOGLINK_PAD}?token=bestaat-niet&callbackURL=/projecten&errorCallbackURL=/inloggen`),
      handler,
    );
    expect(antwoord.status).toBe(302);
    expect(antwoord.headers.get("location")).toBe(`${BASIS}/inloggen?error=INVALID_TOKEN`);
  });

  test("andere auth-paden worden niet onderschept, ook niet bij een 500 of een fout", async () => {
    const kapot = new Response("boem", { status: 500 });
    const doorgegeven = await metInloglinkVangnet(new Request(`${BASIS}/api/auth/sign-in/email`, { method: "POST" }), async () => kapot);
    expect(doorgegeven).toBe(kapot);
    await expect(
      metInloglinkVangnet(new Request(`${BASIS}/api/auth/sign-in/email`), async () => {
        throw new Error("blijft een fout");
      }),
    ).rejects.toThrow("blijft een fout");
    // Alleen GET op het verify-pad: het aanvragen van een link (POST) niet.
    const aanvraag = new Response("boem", { status: 500 });
    expect(
      await metInloglinkVangnet(new Request(`${BASIS}/api/auth/sign-in/magic-link`, { method: "POST" }), async () => aanvraag),
    ).toBe(aanvraag);
  });

  test("een 4xx op het verify-pad blijft zoals ze is (alleen een serverfout wordt opgevangen)", async () => {
    const vier = new Response("nee", { status: 403 });
    expect(await metInloglinkVangnet(new Request(`${BASIS}${INLOGLINK_PAD}?token=x`), async () => vier)).toBe(vier);
  });
});

describe("de bevestigingslink (verify-email)", () => {
  test("zonder vangnet is een fout in de sessiehook een kale 500 (de aanleiding)", async () => {
    const link = await bevestigingslink();
    hook.faal = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await handler(new Request(link))).status).toBe(500);
  });

  test("met het vangnet: 302 naar /inloggen?fout=INLOGLINK_MISLUKT, geen 500 en geen sessiecookie", async () => {
    const link = await bevestigingslink();
    hook.faal = true;
    const fouten = vi.spyOn(console, "error").mockImplementation(() => {});

    const antwoord = await metInloglinkVangnet(new Request(link), handler);

    expect(antwoord.status).toBe(302);
    expect(antwoord.headers.get("location")).toBe(`/inloggen?fout=${INLOGLINK_MISLUKT}`);
    expect(antwoord.headers.getSetCookie()).toEqual([]);
    const regels = fouten.mock.calls
      .map((c) => String(c[0]))
      .filter((r) => r.startsWith("Inloglink"))
      .join("\n");
    expect(regels).toBe(`Inloglink verifiëren mislukt op ${BEVESTIGING_PAD}: status 500`);
  });

  test("de bestemming blijft bewaard in de foutredirect", async () => {
    const link = await bevestigingslink();
    link.searchParams.set("callbackURL", "/uitnodiging/abc");
    hook.faal = true;
    vi.spyOn(console, "error").mockImplementation(() => {});

    const antwoord = await metInloglinkVangnet(new Request(link), handler);

    expect(antwoord.headers.get("location")).toBe(`/inloggen?fout=${INLOGLINK_MISLUKT}&terug=%2Fuitnodiging%2Fabc`);
  });

  test("zonder fout werkt de bevestiging gewoon", async () => {
    const link = await bevestigingslink();
    const antwoord = await metInloglinkVangnet(new Request(link), handler);
    expect(antwoord.status).toBe(302);
    expect(antwoord.headers.getSetCookie().length).toBeGreaterThan(0);
  });

  test("een 4xx van Better Auth zelf (ongeldige token) gaat ongewijzigd door", async () => {
    const antwoord = await metInloglinkVangnet(
      new Request(`${BASIS}${BEVESTIGING_PAD}?token=bestaat-niet&callbackURL=/projecten`),
      handler,
    );
    expect(antwoord.status).toBeLessThan(500);
    expect(antwoord.headers.get("location") ?? "").not.toContain("INLOGLINK_MISLUKT");
  });

  test("een gooiende handler wordt ook opgevangen", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const antwoord = await metInloglinkVangnet(new Request(`${BASIS}${BEVESTIGING_PAD}?token=x`), async () => {
      throw new Error("kapot");
    });
    expect(antwoord.status).toBe(302);
    expect(antwoord.headers.get("location")).toBe(`/inloggen?fout=${INLOGLINK_MISLUKT}`);
  });

  test("alleen GET op dat pad wordt opgevangen", async () => {
    const kapot = new Response("boem", { status: 500 });
    expect(
      await metInloglinkVangnet(new Request(`${BASIS}${BEVESTIGING_PAD}`, { method: "POST" }), async () => kapot),
    ).toBe(kapot);
  });
});

describe("de bestemming (callbackURL) in de foutredirect", () => {
  /** Een serverfout op het verify-pad met deze `callbackURL`; zonder echte link, dus zonder rate limit. */
  async function foutlocatie(callbackURL: string | null): Promise<string | null> {
    const verzoek = new URL(`${BASIS}${INLOGLINK_PAD}?token=x`);
    if (callbackURL !== null) verzoek.searchParams.set("callbackURL", callbackURL);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const antwoord = await metInloglinkVangnet(new Request(verzoek), async () => new Response(null, { status: 500 }));
    expect(antwoord.status).toBe(302);
    return antwoord.headers.get("location");
  }

  test("ook met een query in de bestemming", async () => {
    expect(await foutlocatie("/uitnodiging/abc?x=1&y=2")).toBe(
      `/inloggen?fout=${INLOGLINK_MISLUKT}&terug=%2Fuitnodiging%2Fabc%3Fx%3D1%26y%3D2`,
    );
  });

  test("de standaardbestemming `/` hoeft niet mee", async () => {
    expect(await foutlocatie("/")).toBe(`/inloggen?fout=${INLOGLINK_MISLUKT}`);
  });

  test.each(["//evil.example", "https://evil.example", "/\\evil.example", "/.//evil.example", "%2F%2Fevil.example", "javascript:alert(1)", ""])(
    "%j valt weg",
    async (callbackURL) => {
      expect(await foutlocatie(callbackURL)).toBe(`/inloggen?fout=${INLOGLINK_MISLUKT}`);
    },
  );

  test("zonder callbackURL: geen terug", async () => {
    expect(await foutlocatie(null)).toBe(`/inloggen?fout=${INLOGLINK_MISLUKT}`);
  });
});
