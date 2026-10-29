import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const smtpVerstuur = vi.hoisted(() => vi.fn().mockResolvedValue({}));
vi.mock("nodemailer", () => ({ createTransport: () => ({ sendMail: smtpVerstuur }) }));

import { maakGraphVerzender, type GraphConfig } from "../server/mail/graph";
import { gebruikVerzender, zetVerzender } from "../server/mail/verzend";

const GEHEIM = "geheim-WAARDE-9f3a";
const TOKEN = "token-WAARDE-77c1";
const config: GraphConfig = { tenantId: "tenant-1", clientId: "client-1", clientGeheim: GEHEIM, afzender: "noreply@elentrik.be" };
const mail = { aan: "jan@voorbeeld.be", onderwerp: "Hallo", tekst: "platte tekst", html: "<p>html</p>" };

const TOKEN_URL = "https://login.microsoftonline.com/tenant-1/oauth2/v2.0/token";
const SEND_URL = "https://graph.microsoft.com/v1.0/users/noreply%40elentrik.be/sendMail";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const tokenAntwoord = (token = TOKEN, expires_in = 3600) => json(200, { access_token: token, expires_in, token_type: "Bearer" });
const verstuurd = () => new Response(null, { status: 202 });

type Aanroep = { url: string; init: RequestInit };
function nepFetch(...antwoorden: Response[]) {
  const aanroepen: Aanroep[] = [];
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    aanroepen.push({ url: String(url), init: init ?? {} });
    const volgende = antwoorden.shift();
    if (!volgende) throw new Error("onverwachte fetch");
    return volgende;
  });
  return { fn: fn as unknown as typeof fetch, aanroepen };
}
const koppen = (a: Aanroep) => a.init.headers as Record<string, string>;
const fouten = (p: Promise<void>) =>
  p.then(
    () => undefined,
    (e: unknown) => e as Error,
  );

describe("graph-verzender", () => {
  test("de tokenaanvraag: url, form-velden en scope", async () => {
    const { fn, aanroepen } = nepFetch(tokenAntwoord(), verstuurd());
    await maakGraphVerzender(config, fn).verstuur(mail);
    const t = aanroepen[0]!;
    expect(t.url).toBe(TOKEN_URL);
    expect(t.init.method).toBe("POST");
    expect(Object.fromEntries(new URLSearchParams(String(t.init.body)))).toEqual({
      client_id: "client-1",
      client_secret: GEHEIM,
      grant_type: "client_credentials",
      scope: "https://graph.microsoft.com/.default",
    });
  });

  test("sendMail: pad, bearer-token en body met ontvanger, onderwerp en html", async () => {
    const { fn, aanroepen } = nepFetch(tokenAntwoord(), verstuurd());
    await maakGraphVerzender(config, fn).verstuur(mail);
    const s = aanroepen[1]!;
    expect(s.url).toBe(SEND_URL);
    expect(s.init.method).toBe("POST");
    expect(koppen(s).authorization).toBe(`Bearer ${TOKEN}`);
    expect(koppen(s)["content-type"]).toBe("application/json");
    expect(JSON.parse(String(s.init.body))).toEqual({
      message: {
        subject: "Hallo",
        body: { contentType: "HTML", content: "<p>html</p>" },
        toRecipients: [{ emailAddress: { address: "jan@voorbeeld.be" } }],
      },
      saveToSentItems: false,
    });
  });

  test("een bijlage gaat als fileAttachment met base64-inhoud", async () => {
    const { fn, aanroepen } = nepFetch(tokenAntwoord(), verstuurd());
    const inhoud = new TextEncoder().encode("%PDF-1.7");
    await maakGraphVerzender(config, fn).verstuur({ ...mail, bijlagen: [{ naam: "ELK-0001.pdf", inhoud, type: "application/pdf" }] });
    expect(JSON.parse(String(aanroepen[1]!.init.body)).message.attachments).toEqual([
      {
        "@odata.type": "#microsoft.graph.fileAttachment",
        name: "ELK-0001.pdf",
        contentType: "application/pdf",
        contentBytes: Buffer.from(inhoud).toString("base64"),
      },
    ]);
  });

  test("zonder bijlagen geen attachments in het bericht", async () => {
    const { fn, aanroepen } = nepFetch(tokenAntwoord(), verstuurd(), verstuurd());
    const v = maakGraphVerzender(config, fn);
    await v.verstuur(mail);
    await v.verstuur({ ...mail, bijlagen: [] });
    expect(JSON.parse(String(aanroepen[1]!.init.body)).message).not.toHaveProperty("attachments");
    expect(JSON.parse(String(aanroepen[2]!.init.body)).message).not.toHaveProperty("attachments");
  });

  test("een mail zonder ontvanger gooit zonder iets te versturen", async () => {
    const { fn, aanroepen } = nepFetch();
    await expect(maakGraphVerzender(config, fn).verstuur({ ...mail, aan: "  " })).rejects.toThrow(/ontvanger/);
    expect(aanroepen).toHaveLength(0);
  });

  test("het token wordt hergebruikt binnen de geldigheid en vernieuwd 5 minuten voor het verloopt", async () => {
    let tijd = 1_000_000;
    const { fn, aanroepen } = nepFetch(tokenAntwoord("t1", 3600), verstuurd(), verstuurd(), tokenAntwoord("t2", 3600), verstuurd());
    const v = maakGraphVerzender(config, fn, () => tijd);
    await v.verstuur(mail);
    tijd += (3600 - 300) * 1000 - 1; // net voor het einde van de hergebruikperiode
    await v.verstuur(mail);
    expect(aanroepen.filter((a) => a.url === TOKEN_URL)).toHaveLength(1);
    tijd += 1; // precies 5 minuten voor het verlopen
    await v.verstuur(mail);
    expect(aanroepen.filter((a) => a.url === TOKEN_URL)).toHaveLength(2);
    expect(koppen(aanroepen[4]!).authorization).toBe("Bearer t2");
  });

  test("gelijktijdige mails delen één tokenaanvraag", async () => {
    const { fn, aanroepen } = nepFetch(tokenAntwoord(), verstuurd(), verstuurd());
    const v = maakGraphVerzender(config, fn);
    await Promise.all([v.verstuur(mail), v.verstuur(mail)]);
    expect(aanroepen.filter((a) => a.url === TOKEN_URL)).toHaveLength(1);
  });

  test("een mislukte tokenaanvraag wordt niet onthouden: de volgende mail probeert opnieuw", async () => {
    const { fn, aanroepen } = nepFetch(json(500, { error: "server_error" }), tokenAntwoord(), verstuurd());
    const v = maakGraphVerzender(config, fn);
    await expect(v.verstuur(mail)).rejects.toThrow(/500/);
    await v.verstuur(mail);
    expect(aanroepen.filter((a) => a.url === TOKEN_URL)).toHaveLength(2);
  });

  test("een 401 op sendMail vergeet het token en probeert één keer opnieuw", async () => {
    const { fn, aanroepen } = nepFetch(
      tokenAntwoord("oud"),
      json(401, { error: { code: "InvalidAuthenticationToken", message: "verlopen" } }),
      tokenAntwoord("nieuw"),
      verstuurd(),
    );
    await maakGraphVerzender(config, fn).verstuur(mail);
    expect(aanroepen.map((a) => a.url)).toEqual([TOKEN_URL, SEND_URL, TOKEN_URL, SEND_URL]);
    expect(koppen(aanroepen[3]!).authorization).toBe("Bearer nieuw");
  });

  test("een tweede 401 geeft een fout, zonder derde poging", async () => {
    const { fn, aanroepen } = nepFetch(
      tokenAntwoord("a"),
      json(401, { error: { code: "InvalidAuthenticationToken" } }),
      tokenAntwoord("b"),
      json(401, { error: { code: "InvalidAuthenticationToken" } }),
    );
    await expect(maakGraphVerzender(config, fn).verstuur(mail)).rejects.toThrow(/401.*InvalidAuthenticationToken/);
    expect(aanroepen).toHaveLength(4);
  });

  test("een 500 gooit met status en foutcode, zonder geheim of token", async () => {
    const { fn } = nepFetch(
      tokenAntwoord(),
      json(500, { error: { code: "ErrorInternalServerError", message: `boem ${GEHEIM} ${TOKEN}` } }),
    );
    const fout = await fouten(maakGraphVerzender(config, fn).verstuur(mail));
    expect(fout).toBeInstanceOf(Error);
    expect(fout!.message).toMatch(/500/);
    expect(fout!.message).toContain("ErrorInternalServerError");
    expect(fout!.message).not.toContain(GEHEIM);
    expect(fout!.message).not.toContain(TOKEN);
    expect(fout!.stack ?? "").not.toContain(GEHEIM);
  });

  test("een mislukte tokenaanvraag gooit met status en foutcode, zonder geheim", async () => {
    const { fn } = nepFetch(json(401, { error: "invalid_client", error_description: `AADSTS7000215: ${GEHEIM}` }));
    const fout = await fouten(maakGraphVerzender(config, fn).verstuur(mail));
    expect(fout!.message).toMatch(/401.*invalid_client/);
    expect(fout!.message).not.toContain(GEHEIM);
  });

  test("een antwoord zonder leesbare body geeft toch een fout met de status", async () => {
    const { fn } = nepFetch(tokenAntwoord(), new Response("<html>bad gateway</html>", { status: 502 }));
    await expect(maakGraphVerzender(config, fn).verstuur(mail)).rejects.toThrow(/502/);
  });
});

describe("graph-verzender: time-out", () => {
  const timeout = () => new DOMException("The operation was aborted due to timeout", "TimeoutError");

  test("beide aanvragen krijgen een AbortSignal", async () => {
    const { fn, aanroepen } = nepFetch(tokenAntwoord(), verstuurd());
    await maakGraphVerzender(config, fn).verstuur(mail);
    for (const a of aanroepen) expect(a.init.signal, a.url).toBeInstanceOf(AbortSignal);
  });

  test("een time-out op het token geeft een fout zonder geheim of token", async () => {
    const fn = vi.fn(async () => {
      throw timeout();
    }) as unknown as typeof fetch;
    const fout = await fouten(maakGraphVerzender(config, fn).verstuur(mail));
    expect(fout).toBeInstanceOf(Error);
    expect(fout!.message).toMatch(/Graph-token aanvragen/);
    expect(fout!.message).toMatch(/time-out/i);
    expect(fout!.message).not.toContain(GEHEIM);
    expect(fout!.stack ?? "").not.toContain(GEHEIM);
  });

  test("een time-out op sendMail geeft een fout zonder geheim of token, en het token blijft bruikbaar", async () => {
    let n = 0;
    const fn = vi.fn(async (url: string | URL | Request) => {
      n++;
      if (n === 1) return tokenAntwoord();
      if (n === 2) throw timeout();
      return String(url) === TOKEN_URL ? tokenAntwoord() : verstuurd();
    }) as unknown as typeof fetch;
    const v = maakGraphVerzender(config, fn);
    const fout = await fouten(v.verstuur(mail));
    expect(fout!.message).toMatch(/Graph-mail versturen/);
    expect(fout!.message).toMatch(/time-out/i);
    expect(fout!.message).not.toContain(GEHEIM);
    expect(fout!.message).not.toContain(TOKEN);
    await v.verstuur(mail);
  });

  test("een afgebroken verzoek (AbortError) wordt ook als time-out gemeld", async () => {
    const fn = vi.fn(async () => {
      throw new DOMException("aborted", "AbortError");
    }) as unknown as typeof fetch;
    const fout = await fouten(maakGraphVerzender(config, fn).verstuur(mail));
    expect(fout!.message).toMatch(/time-out/i);
  });

  test("een andere netwerkfout blijft boven", async () => {
    const fn = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    await expect(maakGraphVerzender(config, fn).verstuur(mail)).rejects.toThrow(/fetch failed/);
  });
});

describe("gebruikVerzender", () => {
  beforeEach(() => {
    zetVerzender(undefined);
    smtpVerstuur.mockClear();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    zetVerzender(undefined);
  });

  test("met MAIL_VERZENDER=graph de Graph-verzender, met de config uit env", async () => {
    vi.stubEnv("MAIL_VERZENDER", "graph");
    vi.stubEnv("GRAPH_TENANT_ID", "tenant-1");
    vi.stubEnv("GRAPH_CLIENT_ID", "client-1");
    vi.stubEnv("GRAPH_CLIENT_GEHEIM", GEHEIM);
    vi.stubEnv("MAIL_AFZENDER", "noreply@elentrik.be");
    const { fn, aanroepen } = nepFetch(tokenAntwoord(), verstuurd());
    vi.stubGlobal("fetch", fn);
    await gebruikVerzender().verstuur(mail);
    expect(aanroepen.map((a) => a.url)).toEqual([TOKEN_URL, SEND_URL]);
    expect(smtpVerstuur).not.toHaveBeenCalled();
  });

  test("zonder MAIL_VERZENDER (of met smtp) de SMTP-verzender", async () => {
    vi.stubEnv("MAIL_VERZENDER", "");
    const fn = vi.fn();
    vi.stubGlobal("fetch", fn);
    await gebruikVerzender().verstuur(mail);
    expect(smtpVerstuur).toHaveBeenCalledTimes(1);

    zetVerzender(undefined);
    vi.stubEnv("MAIL_VERZENDER", "smtp");
    await gebruikVerzender().verstuur(mail);
    expect(smtpVerstuur).toHaveBeenCalledTimes(2);
    expect(fn).not.toHaveBeenCalled();
  });

  test("graph zonder volledige config gooit met de naam van de variabele, niet de waarde", () => {
    vi.stubEnv("MAIL_VERZENDER", "graph");
    vi.stubEnv("GRAPH_TENANT_ID", "tenant-1");
    vi.stubEnv("GRAPH_CLIENT_ID", "client-1");
    vi.stubEnv("GRAPH_CLIENT_GEHEIM", GEHEIM);
    vi.stubEnv("MAIL_AFZENDER", "");
    expect(() => gebruikVerzender()).toThrow(/MAIL_AFZENDER/);
    expect(() => gebruikVerzender()).not.toThrow(new RegExp(GEHEIM));
  });
});
