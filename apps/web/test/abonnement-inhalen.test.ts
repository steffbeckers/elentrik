// De uurlijkse inhaaltaak: abonnementsrijen die te lang niet bijgewerkt zijn alsnog synchroniseren
// en betaalde facturen van de laatste 7 dagen alsnog doorsturen. De database is PGlite, Stripe de
// nep-poort en de mailverzender een geheugenverzender; er gaat niets over het netwerk.
import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import type { AbonnementConfig } from "../server/abonnementen/config";
import { haalGemisteMeldingenIn, neemInhaalLock } from "../server/abonnementen/inhalen";
import type { StripeAbonnement, StripeFactuur } from "../server/abonnementen/stripe";
import type { Db } from "../server/db";
import { abonnementen, doorgestuurdeFacturen } from "../server/db/schema";
import { type Mail, type Verzender, zetVerzender } from "../server/mail/verzend";
import { maakTestDb, maakTestOrganisatie } from "./db";
import { maakNepStripe, type NepStripe } from "./nep-stripe";

const DAG_MS = 24 * 3600 * 1000;
const NU = new Date("2026-11-10T12:00:00.000Z");
const INBOX = "boekhouding@voorbeeld.be";

const CONFIG: AbonnementConfig = {
  ingeschakeld: true,
  sleutel: "sk_test_nep_alleen_voor_tests",
  webhookGeheim: "whsec_nep",
  prijzen: { maand: "price_maand", jaar: "price_jaar" },
  boekhoudingInbox: INBOX,
  apiBasis: null,
};

let db: Db;
let stripe: NepStripe;
let mails: Mail[] = [];
const verzender: Verzender = {
  async verstuur(mail) {
    mails.push(mail);
  },
};

/** Organisaties worden hergebruikt tussen de tests (de tabel `abonnementen` wordt wel geleegd). */
const orgs: string[] = [];
let klantTeller = 0;

/** Een abonnementsrij met een eigen klant; geeft het klant-id. */
async function rij(opties: {
  status: string | null;
  periodeEinde?: Date | null;
  bijgewerkt?: Date;
}): Promise<string> {
  const nummer = ++klantTeller;
  const klantId = `cus_inhaal_${nummer}`;
  const organisatieId = (orgs[nummer - 1] ??= await maakTestOrganisatie(db, `Bedrijf ${nummer}`));
  await db.insert(abonnementen).values({
    organisatieId,
    stripeKlantId: klantId,
    status: opties.status,
    periodeEinde: opties.periodeEinde === undefined ? new Date(NU.getTime() + 20 * DAG_MS) : opties.periodeEinde,
    bijgewerkt: opties.bijgewerkt ?? new Date(NU.getTime() - 1000),
  });
  return klantId;
}

function stripeAbonnement(klantId: string): StripeAbonnement {
  return {
    id: `sub_${klantId}`,
    klantId,
    status: "active",
    prijsId: "price_maand",
    periodeEinde: new Date(NU.getTime() + 30 * DAG_MS),
    opgezegdOpPeriodeEinde: false,
    aangemaakt: new Date(NU.getTime() - 60 * DAG_MS),
  };
}

function factuur(id: string, klantId: string, extra: Partial<StripeFactuur> = {}): StripeFactuur {
  const f: StripeFactuur = {
    id,
    nummer: `ELK-${id}`,
    klantId,
    abonnementId: "sub_1",
    bedragBetaald: 1815,
    pdfUrl: "https://stripe.nep/factuur.pdf",
    reden: "subscription_cycle",
    ...extra,
  };
  stripe.facturen.set(id, f);
  return f;
}

const aanroepen = (methode: string) => stripe.aanroepen.filter((a) => a.methode === methode);
const gesynchroniseerdeKlanten = () => aanroepen("abonnementenVanKlant").map((a) => a.invoer as string);

beforeAll(async () => {
  db = await maakTestDb();
  zetVerzender(verzender);
}, 60_000);

beforeEach(async () => {
  stripe = maakNepStripe();
  mails = [];
  await db.delete(doorgestuurdeFacturen);
  await db.delete(abonnementen);
  klantTeller = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
  zetVerzender(verzender);
});

afterAll(() => {
  zetVerzender(undefined);
});

describe("selectie van rijen om te synchroniseren", () => {
  test("een actieve rij waarvan de periode meer dan 1 dag voorbij is: wel", async () => {
    const klant = await rij({ status: "active", periodeEinde: new Date(NU.getTime() - DAG_MS - 1) });
    stripe.abonnementen.set(klant, [stripeAbonnement(klant)]);
    const r = await haalGemisteMeldingenIn(db, stripe, CONFIG, NU);
    expect(r).toEqual({ gesynchroniseerd: 1, doorgestuurd: 0 });
    expect(gesynchroniseerdeKlanten()).toEqual([klant]);
    // De rij is bijgewerkt met wat Stripe zegt.
    const [bij] = await db.select().from(abonnementen);
    expect(bij!.periodeEinde).toEqual(new Date(NU.getTime() + 30 * DAG_MS));
    expect(bij!.bijgewerkt).toEqual(NU);
  });

  test("een periode die 1 dag min 1 ms voorbij is en recent bijgewerkt: niet", async () => {
    await rij({ status: "active", periodeEinde: new Date(NU.getTime() - DAG_MS + 1) });
    expect(await haalGemisteMeldingenIn(db, stripe, CONFIG, NU)).toEqual({ gesynchroniseerd: 0, doorgestuurd: 0 });
    expect(gesynchroniseerdeKlanten()).toEqual([]);
  });

  test("langer dan 24 uur niet bijgewerkt: wel; 24 uur min 1 ms: niet", async () => {
    const oud = await rij({ status: "trialing", bijgewerkt: new Date(NU.getTime() - DAG_MS - 1) });
    await rij({ status: "trialing", bijgewerkt: new Date(NU.getTime() - DAG_MS + 1) });
    stripe.abonnementen.set(oud, [stripeAbonnement(oud)]);
    expect(await haalGemisteMeldingenIn(db, stripe, CONFIG, NU)).toEqual({ gesynchroniseerd: 1, doorgestuurd: 0 });
    expect(gesynchroniseerdeKlanten()).toEqual([oud]);
  });

  test("active, trialing en past_due komen in aanmerking; canceled en andere statussen nooit", async () => {
    const oud = new Date(NU.getTime() - 5 * DAG_MS);
    const kandidaten = [
      await rij({ status: "active", bijgewerkt: oud }),
      await rij({ status: "trialing", bijgewerkt: oud }),
      await rij({ status: "past_due", bijgewerkt: oud }),
    ];
    await rij({ status: "canceled", periodeEinde: oud, bijgewerkt: oud });
    await rij({ status: "incomplete_expired", periodeEinde: oud, bijgewerkt: oud });
    await rij({ status: null, periodeEinde: null, bijgewerkt: oud });
    for (const k of kandidaten) stripe.abonnementen.set(k, [stripeAbonnement(k)]);
    const r = await haalGemisteMeldingenIn(db, stripe, CONFIG, NU);
    expect(r.gesynchroniseerd).toBe(3);
    expect(gesynchroniseerdeKlanten().sort()).toEqual([...kandidaten].sort());
  });

  test("een Stripe-fout bij een klant stopt de rest niet en telt niet mee", async () => {
    const oud = new Date(NU.getTime() - 5 * DAG_MS);
    const kapot = await rij({ status: "active", bijgewerkt: oud });
    const goed = await rij({ status: "active", bijgewerkt: oud });
    stripe.abonnementen.set(goed, [stripeAbonnement(goed)]);
    const echt = stripe.abonnementenVanKlant;
    stripe.abonnementenVanKlant = async (klantId) => {
      if (klantId === kapot) throw new Error("Stripe is niet bereikbaar sk_test_geheim");
      return echt(klantId);
    };
    const fout = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await haalGemisteMeldingenIn(db, stripe, CONFIG, NU);
    expect(r).toEqual({ gesynchroniseerd: 1, doorgestuurd: 0 });
    // Het logt de klant, nooit de foutmelding zelf.
    expect(fout).toHaveBeenCalled();
    expect(JSON.stringify(fout.mock.calls)).not.toContain("sk_test_geheim");
    const [goedeRij] = await db.select().from(abonnementen).where(sql`${abonnementen.stripeKlantId} = ${goed}`);
    expect(goedeRij!.bijgewerkt).toEqual(NU);
  });
});

describe("betaalde facturen van de laatste 7 dagen", () => {
  test("alleen een bekende, nog niet doorgestuurde factuur gaat door; sinds is nu min 7 dagen", async () => {
    const klant = await rij({ status: "active" });
    factuur("in_nieuw", klant);
    factuur("in_al", klant);
    factuur("in_vreemd", "cus_onbekend");
    await db.insert(doorgestuurdeFacturen).values({ stripeFactuurId: "in_al", nummer: "ELK-in_al" });

    const r = await haalGemisteMeldingenIn(db, stripe, CONFIG, NU);

    expect(r).toEqual({ gesynchroniseerd: 0, doorgestuurd: 1 });
    expect(aanroepen("betaaldeFacturen")).toEqual([
      { methode: "betaaldeFacturen", invoer: new Date(NU.getTime() - 7 * DAG_MS) },
    ]);
    expect(mails).toHaveLength(1);
    expect(mails[0]!.aan).toBe(INBOX);
    expect(mails[0]!.onderwerp).toContain("ELK-in_nieuw");
    // De factuur van een onbekende klant wordt zelfs niet opgehaald.
    expect(aanroepen("haalFactuur").map((a) => a.invoer)).not.toContain("in_vreemd");
    const ids = (await db.select().from(doorgestuurdeFacturen)).map((f) => f.stripeFactuurId).sort();
    expect(ids).toEqual(["in_al", "in_nieuw"]);
  });

  test("een tweede run stuurt niets opnieuw", async () => {
    const klant = await rij({ status: "active" });
    factuur("in_1", klant);
    expect((await haalGemisteMeldingenIn(db, stripe, CONFIG, NU)).doorgestuurd).toBe(1);
    expect((await haalGemisteMeldingenIn(db, stripe, CONFIG, NU)).doorgestuurd).toBe(0);
    expect(mails).toHaveLength(1);
  });

  test("een factuur van nul euro wordt niet doorgestuurd en niet geteld", async () => {
    const klant = await rij({ status: "active" });
    factuur("in_nul", klant, { bedragBetaald: 0 });
    expect(await haalGemisteMeldingenIn(db, stripe, CONFIG, NU)).toEqual({ gesynchroniseerd: 0, doorgestuurd: 0 });
    expect(mails).toHaveLength(0);
  });

  test("zonder BOEKHOUDING_INBOX worden geen facturen opgehaald", async () => {
    const klant = await rij({ status: "active" });
    factuur("in_1", klant);
    const r = await haalGemisteMeldingenIn(db, stripe, { ...CONFIG, boekhoudingInbox: null }, NU);
    expect(r).toEqual({ gesynchroniseerd: 0, doorgestuurd: 0 });
    expect(aanroepen("betaaldeFacturen")).toEqual([]);
  });

  test("een mislukte verzending stopt de rest niet; de volgende run probeert de factuur opnieuw", async () => {
    const klant = await rij({ status: "active" });
    factuur("in_a", klant);
    factuur("in_b", klant);
    let eerste = true;
    zetVerzender({
      async verstuur(mail) {
        if (eerste) {
          eerste = false;
          throw new Error(`550 geweigerd voor ${mail.aan}`);
        }
        mails.push(mail);
      },
    });
    const fout = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await haalGemisteMeldingenIn(db, stripe, CONFIG, NU)).doorgestuurd).toBe(1);
    expect(fout).toHaveBeenCalled();
    expect(JSON.stringify(fout.mock.calls)).not.toContain(INBOX);
    expect((await haalGemisteMeldingenIn(db, stripe, CONFIG, NU)).doorgestuurd).toBe(1);
    expect(mails).toHaveLength(2);
  });

  test("een Stripe-fout bij het ophalen van de facturen gooit niet", async () => {
    const klant = await rij({ status: "active", bijgewerkt: new Date(NU.getTime() - 5 * DAG_MS) });
    stripe.abonnementen.set(klant, [stripeAbonnement(klant)]);
    stripe.betaaldeFacturen = async () => {
      throw new Error("Stripe is niet bereikbaar");
    };
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await haalGemisteMeldingenIn(db, stripe, CONFIG, NU)).toEqual({ gesynchroniseerd: 1, doorgestuurd: 0 });
  });
});

describe("uitgeschakeld", () => {
  test("abonnementen uit: niets doen en de poort niet aanroepen", async () => {
    await rij({ status: "active", bijgewerkt: new Date(NU.getTime() - 5 * DAG_MS) });
    expect(await haalGemisteMeldingenIn(db, stripe, { ingeschakeld: false }, NU)).toEqual({
      gesynchroniseerd: 0,
      doorgestuurd: 0,
    });
    expect(stripe.aanroepen).toEqual([]);
    expect(mails).toHaveLength(0);
  });
});

describe("het lock", () => {
  test("is het lock bezet, dan gebeurt er niets", async () => {
    const klant = await rij({ status: "active", bijgewerkt: new Date(NU.getTime() - 5 * DAG_MS) });
    factuur("in_1", klant);
    const r = await haalGemisteMeldingenIn(db, stripe, CONFIG, NU, async () => false);
    expect(r).toEqual({ gesynchroniseerd: 0, doorgestuurd: 0 });
    expect(stripe.aanroepen).toEqual([]);
    expect(mails).toHaveLength(0);
  });

  test("een vrij lock laat de run door", async () => {
    const klant = await rij({ status: "active", bijgewerkt: new Date(NU.getTime() - 5 * DAG_MS) });
    stripe.abonnementen.set(klant, [stripeAbonnement(klant)]);
    const r = await haalGemisteMeldingenIn(db, stripe, CONFIG, NU, async () => true);
    expect(r.gesynchroniseerd).toBe(1);
  });

  // PGlite kent maar een sessie, en advisory locks zijn per sessie herbruikbaar: een "bezet" lock
  // is hier dus niet echt na te bootsen. Deze test toont wel dat de echte SQL het juiste lock
  // (hashtext('abonnementen:inhalen')) neemt en het bij het einde van de transactie loslaat.
  test("neemInhaalLock houdt het advisory lock voor 'abonnementen:inhalen' tot het einde van de transactie", async () => {
    // Een bigint-sleutel staat in pg_locks verdeeld over classid (hoge 32 bits) en objid (lage 32).
    const aantal = async (d: Pick<Db, "execute">) =>
      (
        (await d.execute(sql`
          select count(*)::int as aantal from pg_locks
          where locktype = 'advisory'
            and ((classid::bigint << 32) | objid::bigint) = hashtext('abonnementen:inhalen')::bigint
        `)) as unknown as { rows: { aantal: number }[] }
      ).rows[0]!.aantal;

    let binnen = -1;
    await db.transaction(async (tx) => {
      expect(await neemInhaalLock(tx)).toBe(true);
      binnen = await aantal(tx);
    });
    expect(binnen).toBe(1);
    expect(await aantal(db)).toBe(0);
  });
});
