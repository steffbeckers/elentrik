import { readFileSync } from "node:fs";
import { describe, expect, test, vi } from "vitest";
import type { AbonnementOverzicht, Toegang } from "../shared/abonnement";
import {
  bannerVoor,
  behandelSchrijfweigering,
  datumTekst,
  jaarKorting,
  paginaWeergave,
  prijsTekst,
  statusAantal,
  statusTekstSleutel,
} from "../app/abonnement/weergave";

const NU = new Date("2026-11-01T12:00:00.000Z");
const DAG = 24 * 3600 * 1000;

function toegang(wijziging: Partial<Toegang> = {}): Toegang {
  return {
    niveau: "abonnement",
    reden: "proef",
    proefEinde: new Date(NU.getTime() + 3 * DAG).toISOString(),
    achterstalligTot: null,
    ...wijziging,
  };
}

function overzicht(wijziging: Partial<AbonnementOverzicht> = {}): AbonnementOverzicht {
  return {
    ingeschakeld: true,
    niveau: "abonnement",
    reden: "proef",
    proefEinde: new Date(NU.getTime() + 3 * DAG).toISOString(),
    achterstalligTot: null,
    status: null,
    formule: null,
    periodeEinde: null,
    opgezegd: false,
    heeftKlant: false,
    prijzen: null,
    limieten: { kringen: 5, situatieschemas: 1 },
    ...wijziging,
  };
}

/** Maakt de spaties van `nl-BE` (nbsp) vergelijkbaar. */
const gewoon = (tekst: string) => tekst.replace(/\s/g, " ");

describe("prijsTekst", () => {
  test("het bedrag excl. btw en ter info incl. 21 % btw, in nl-BE", () => {
    const prijs = prijsTekst({ bedrag: 3000, munt: "eur", interval: "month" }, "nl");
    const formaat = new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" });
    expect(prijs).toEqual({ excl: formaat.format(30), incl: formaat.format(36.3) });
    expect(gewoon(prijs.excl)).toBe("€ 30,00");
    expect(gewoon(prijs.incl)).toBe("€ 36,30");
  });

  test("volgt de taal: fr-BE en en-GB", () => {
    const p = { bedrag: 3000, munt: "eur", interval: "month" as const };
    expect(prijsTekst(p, "fr").excl).toBe(new Intl.NumberFormat("fr-BE", { style: "currency", currency: "EUR" }).format(30));
    expect(gewoon(prijsTekst(p, "fr").excl)).toBe("30,00 €");
    expect(prijsTekst(p, "en").excl).toBe("€30.00");
  });

  test("incl. btw rondt af op een cent", () => {
    // 999 × 1,21 = 1208,79 cent
    expect(gewoon(prijsTekst({ bedrag: 999, munt: "EUR", interval: "year" }, "nl").incl)).toBe("€ 12,09");
  });
});

describe("jaarKorting", () => {
  test("het afgeronde percentage t.o.v. twaalf maanden", () => {
    const maand = { bedrag: 3000, munt: "eur", interval: "month" as const };
    expect(jaarKorting(maand, { bedrag: 30000, munt: "eur", interval: "year" })).toBe(17);
    expect(jaarKorting(maand, { bedrag: 36000, munt: "eur", interval: "year" })).toBe(0);
  });
});

describe("bannerVoor", () => {
  test("proef: voor een eigenaar op dag 7 wel en op dag 8 niet", () => {
    const op = (dagen: number, uren = 0) =>
      toegang({ proefEinde: new Date(NU.getTime() + dagen * DAG + uren * 3600_000).toISOString() });
    expect(bannerVoor(op(7), "eigenaar", NU)).toEqual({ soort: "proef", dagen: 7, knop: true, knopSleutel: "abonnement.banner.kies" });
    expect(bannerVoor(op(6, 1), "eigenaar", NU)).toEqual({ soort: "proef", dagen: 7, knop: true, knopSleutel: "abonnement.banner.kies" });
    expect(bannerVoor(op(7, 1), "eigenaar", NU)).toBeNull();
    expect(bannerVoor(op(8), "eigenaar", NU)).toBeNull();
    expect(bannerVoor(op(1), "eigenaar", NU)).toEqual({ soort: "proef", dagen: 1, knop: true, knopSleutel: "abonnement.banner.kies" });
  });

  test("proef: nooit voor een lid of zonder rol", () => {
    expect(bannerVoor(toegang(), "lid", NU)).toBeNull();
    expect(bannerVoor(toegang(), null, NU)).toBeNull();
  });

  test("betaling binnen de gratie: alleen voor een eigenaar, met de datum", () => {
    const tot = new Date(NU.getTime() + 10 * DAG).toISOString();
    const t = toegang({ reden: "betaling-mislukt", proefEinde: null, achterstalligTot: tot });
    expect(bannerVoor(t, "eigenaar", NU)).toEqual({ soort: "betaling", tot, knop: true, knopSleutel: "abonnement.betalingRegelen" });
    expect(bannerVoor(t, "lid", NU)).toBeNull();
    // Zonder bekende einddatum blijft de banner, zonder datum.
    expect(bannerVoor({ ...t, achterstalligTot: null }, "eigenaar", NU)).toEqual({ soort: "betaling", knop: true, knopSleutel: "abonnement.betalingRegelen" });
  });

  test("geen alleen-lezenbanner meer bij gratis", () => {
    for (const rol of ["eigenaar", "lid", null] as const) {
      expect(bannerVoor(toegang({ niveau: "gratis", reden: "gratis", proefEinde: null }), rol, NU)).toBeNull();
      expect(bannerVoor(toegang({ niveau: "gratis", reden: "beeindigd", proefEinde: null }), rol, NU)).toBeNull();
    }
  });

  test("proefbanner alleen tijdens de overgangsproef", () => {
    const binnen = new Date(NU.getTime() + 3 * DAG).toISOString();
    expect(bannerVoor(toegang({ reden: "proef", proefEinde: binnen }), "eigenaar", NU)).toEqual({
      soort: "proef",
      dagen: 3,
      knop: true,
      knopSleutel: "abonnement.banner.kies",
    });
    // Een gratis bedrijf met een oude proefdatum krijgt geen proefbanner.
    expect(bannerVoor(toegang({ niveau: "gratis", reden: "gratis", proefEinde: binnen }), "eigenaar", NU)).toBeNull();
  });

  test("een mislukte betaling voorbij de gratie (niveau gratis): banner voor de eigenaar, zonder datum", () => {
    const voorbij = new Date(NU.getTime() - 2 * DAG).toISOString();
    const verwacht = { soort: "betaling", naGratie: true, knop: true, knopSleutel: "abonnement.betalingRegelen" };
    // past_due na 14 dagen: de datum ligt in het verleden en wordt niet getoond.
    const pastDue = toegang({ niveau: "gratis", reden: "betaling-mislukt", proefEinde: null, achterstalligTot: voorbij });
    expect(bannerVoor(pastDue, "eigenaar", NU)).toEqual(verwacht);
    // unpaid: geen datum.
    expect(bannerVoor({ ...pastDue, achterstalligTot: null }, "eigenaar", NU)).toEqual(verwacht);
    expect(bannerVoor(pastDue, "lid", NU)).toBeNull();
    expect(bannerVoor(pastDue, null, NU)).toBeNull();
  });

  test("uit, vrijgesteld en actief: geen banner", () => {
    expect(bannerVoor({ niveau: "uit", reden: "uit", proefEinde: null, achterstalligTot: null }, "eigenaar", NU)).toBeNull();
    expect(bannerVoor(toegang({ niveau: "vrijgesteld", reden: "vrijgesteld" }), "eigenaar", NU)).toBeNull();
    expect(bannerVoor(toegang({ reden: "actief" }), "eigenaar", NU)).toBeNull();
  });
});

describe("statusTekstSleutel", () => {
  test("een sleutel per situatie", () => {
    expect(statusTekstSleutel(overzicht({ ingeschakeld: false, reden: "uit" }))).toBe("abonnement.status.uit");
    expect(statusTekstSleutel(overzicht({ reden: "vrijgesteld" }))).toBe("abonnement.status.vrijgesteld");
    expect(statusTekstSleutel(overzicht({ reden: "proef" }))).toBe("abonnement.status.proef");
    expect(statusTekstSleutel(overzicht({ reden: "actief", status: "active", formule: "maand" }))).toBe(
      "abonnement.status.actief",
    );
    expect(statusTekstSleutel(overzicht({ reden: "actief", status: "active", opgezegd: true }))).toBe(
      "abonnement.status.opgezegd",
    );
    expect(
      statusTekstSleutel(
        overzicht({ reden: "betaling-mislukt", status: "past_due", achterstalligTot: NU.toISOString() }),
      ),
    ).toBe("abonnement.status.betalingMisluktTot");
    // Zonder schrijfrecht of zonder einddatum geen "vóór {datum}".
    expect(statusTekstSleutel(overzicht({ reden: "betaling-mislukt", status: "past_due" }))).toBe(
      "abonnement.status.betalingMislukt",
    );
    expect(
      statusTekstSleutel(
        overzicht({ niveau: "gratis", reden: "betaling-mislukt", status: "unpaid", achterstalligTot: NU.toISOString() }),
      ),
    ).toBe("abonnement.status.betalingMislukt");
    expect(statusTekstSleutel(overzicht({ niveau: "gratis", reden: "beeindigd", status: "canceled" }))).toBe(
      "abonnement.status.beeindigd",
    );
    expect(statusTekstSleutel(overzicht({ niveau: "gratis", reden: "gratis" }))).toBe("abonnement.status.gratis");
    expect(statusTekstSleutel(overzicht({ niveau: "onderwijs", reden: "onderwijs" }))).toBe(
      "abonnement.status.onderwijs",
    );
  });
});

describe("statusAantal (meervoud van de statusregel)", () => {
  const nl = JSON.parse(readFileSync(new URL("../i18n/locales/nl.json", import.meta.url), "utf8")) as {
    abonnement: { status: { proef: string } };
  };

  test("het aantal resterende dagen, nooit negatief", () => {
    expect(statusAantal(overzicht({ proefEinde: new Date(NU.getTime() + DAG).toISOString() }), NU)).toBe(1);
    expect(statusAantal(overzicht({ proefEinde: new Date(NU.getTime() + 3 * DAG).toISOString() }), NU)).toBe(3);
    expect(statusAantal(overzicht({ proefEinde: new Date(NU.getTime() - DAG).toISOString() }), NU)).toBe(0);
    expect(statusAantal(overzicht({ proefEinde: null }), NU)).toBe(0);
  });

  test("de proeftekst heeft een enkelvoud en een meervoud", () => {
    const [een, meer] = nl.abonnement.status.proef.split("|").map((s) => s.trim());
    expect(een).toContain("nog {dagen} dag,");
    expect(meer).toContain("nog {dagen} dagen,");
  });
});

describe("de bannerteksten bij een mislukte betaling", () => {
  type Banner = { banner: { betalingZonderDatum: string; betalingNaGratie: string } };
  const talen = Object.fromEntries(
    (["nl", "fr", "en"] as const).map((taal) => [
      taal,
      (JSON.parse(readFileSync(new URL(`../i18n/locales/${taal}.json`, import.meta.url), "utf8")) as { abonnement: Banner })
        .abonnement.banner,
    ]),
  ) as Record<"nl" | "fr" | "en", Banner["banner"]>;

  test("zonder datum: de terugval op de gratis versie, niet meer 'geen projecten bewerken'", () => {
    expect(talen.nl.betalingZonderDatum).toBe(
      "Je laatste betaling is mislukt. Regel je betaling snel, anders valt je bedrijf terug op de gratis versie en worden projecten uit je abonnement alleen-lezen.",
    );
    expect(talen.fr.betalingZonderDatum).toContain("version gratuite");
    expect(talen.en.betalingZonderDatum).toContain("free version");
  });

  test("na de gratie: het bedrijf gebruikt de gratis versie al", () => {
    expect(talen.nl.betalingNaGratie).toContain("Je bedrijf gebruikt nu de gratis versie");
    expect(talen.fr.betalingNaGratie).toContain("version gratuite");
    expect(talen.en.betalingNaGratie).toContain("free version");
  });

  test("geen tekst zegt nog dat het bedrijf niets meer kan bewerken", () => {
    for (const banner of Object.values(talen)) {
      for (const tekst of [banner.betalingZonderDatum, banner.betalingNaGratie]) {
        expect(tekst).not.toMatch(/geen projecten meer|ne pourra bientôt plus|no longer be able/);
      }
    }
  });
});

describe("de teksten met de betaaldatum", () => {
  const nl = JSON.parse(readFileSync(new URL("../i18n/locales/nl.json", import.meta.url), "utf8")) as {
    abonnement: { banner: { betaling: string }; status: { betalingMisluktTot: string } };
  };
  const vul = (tekst: string, datum: string) => tekst.replace("{datum}", datum);

  test("datumTekst geeft een datum in de taal: nl-BE, fr-BE en en-GB", () => {
    expect(gewoon(datumTekst("2026-11-14T10:00:00.000Z", "nl"))).toBe("14 november 2026");
    expect(gewoon(datumTekst("2026-11-14T10:00:00.000Z", "fr"))).toBe("14 novembre 2026");
    expect(gewoon(datumTekst("2026-11-14T10:00:00.000Z", "en"))).toBe("14 November 2026");
  });

  test("de banner en de statusregel gebruiken de zin uit de spec met de datum", () => {
    const datum = datumTekst("2026-11-14T10:00:00.000Z", "nl");
    expect(vul(nl.abonnement.banner.betaling, datum)).toBe(
      "Je laatste betaling is mislukt. Regel je betaling vóór 14 november 2026.",
    );
    expect(vul(nl.abonnement.status.betalingMisluktTot, datum)).toBe(
      "Je laatste betaling is mislukt. Regel je betaling vóór 14 november 2026.",
    );
  });
});

describe("paginaWeergave", () => {
  const prijzen = {
    maand: { bedrag: 1500, munt: "eur", interval: "month" as const },
    jaar: { bedrag: 15000, munt: "eur", interval: "year" as const },
    project: null,
  };
  const metProject = { ...prijzen, project: { bedrag: 2500, munt: "eur", interval: "eenmalig" as const } };
  const gratis = { niveau: "gratis" as const, reden: "gratis" as const, proefEinde: null };

  test("een eigenaar in de proef krijgt de kaarten Maandelijks en Jaarlijks", () => {
    const w = paginaWeergave(overzicht({ prijzen }), "eigenaar", "nl");
    expect(w.blokken.kaarten.map((k) => k.formule)).toEqual(["maand", "jaar"]);
  });

  test("een vrijgesteld bedrijf: geen kaarten, geen melding en de status 'hoeft niet te betalen'", () => {
    const w = paginaWeergave(overzicht({ reden: "vrijgesteld", proefEinde: null, prijzen }), "eigenaar", "nl");
    expect(w.blokken.kaarten).toEqual([]);
    expect(w.melding).toBeNull();
    expect(w.beheer).toBeNull();
    expect(w.statusSleutel).toBe("abonnement.status.vrijgesteld");
    const nl = JSON.parse(readFileSync(new URL("../i18n/locales/nl.json", import.meta.url), "utf8")) as {
      abonnement: { status: { vrijgesteld: string } };
    };
    expect(nl.abonnement.status.vrijgesteld).toContain("Je bedrijf hoeft niet te betalen");
  });

  test("een vrijgesteld bedrijf zonder prijzen toont ook niet 'prijzen ontbreken'", () => {
    const w = paginaWeergave(overzicht({ reden: "vrijgesteld", prijzen: null }), "eigenaar", "nl");
    expect(w.melding).toBeNull();
    expect(w.blokken.kaarten).toEqual([]);
  });

  test("pagina toont projectblok met prijs", () => {
    const w = paginaWeergave(overzicht({ ...gratis, prijzen: metProject }), "eigenaar", "nl");
    expect(w.blokken.gratis).toEqual({ kringen: 5, situatieschemas: 1 });
    expect(w.blokken.project).toEqual({ prijs: prijsTekst(metProject.project, "nl") });
    expect(gewoon(w.blokken.project!.prijs.excl)).toBe("€ 25,00");
    expect(gewoon(w.blokken.project!.prijs.incl)).toBe("€ 30,25");
    expect(w.blokken.kaarten.map((k) => k.formule)).toEqual(["maand", "jaar"]);
  });

  test("zonder projectprijs geen projectblok, wel het gratis blok", () => {
    const w = paginaWeergave(overzicht({ ...gratis, prijzen }), "eigenaar", "nl");
    expect(w.blokken.project).toBeNull();
    expect(w.blokken.gratis).not.toBeNull();
  });

  test("een lid ziet de blokken zonder kaarten", () => {
    const w = paginaWeergave(overzicht({ ...gratis, prijzen: metProject }), "lid", "nl");
    expect(w.melding).toBe("lid");
    expect(w.blokken.gratis).not.toBeNull();
    expect(w.blokken.kaarten).toEqual([]);
  });

  test("een lopend abonnement toont geen gratis- of projectblok", () => {
    const w = paginaWeergave(
      overzicht({ niveau: "abonnement", reden: "actief", status: "active", formule: "maand", prijzen: metProject }),
      "eigenaar",
      "nl",
    );
    expect(w.blokken.gratis).toBeNull();
    expect(w.blokken.project).toBeNull();
    expect(w.beheer).toBe("abonnement.beheren");
  });

  test("een eigenaar met past_due of unpaid voorbij de gratie (niveau gratis) ziet de gratis- en projectblokken", () => {
    for (const status of ["past_due", "unpaid"] as const) {
      const w = paginaWeergave(
        overzicht({ niveau: "gratis", reden: "betaling-mislukt", proefEinde: null, status, prijzen: metProject }),
        "eigenaar",
        "nl",
      );
      expect(w.beheer).toBe("abonnement.betalingRegelen");
      expect(w.blokken).toEqual({
        gratis: { kringen: 5, situatieschemas: 1 },
        project: { prijs: prijsTekst(metProject.project, "nl") },
        kaarten: [],
      });
    }
  });

  test("een eigenaar met past_due binnen de gratie (niveau abonnement) ziet geen blokken", () => {
    const w = paginaWeergave(
      overzicht({ niveau: "abonnement", reden: "betaling-mislukt", proefEinde: null, status: "past_due", prijzen: metProject }),
      "eigenaar",
      "nl",
    );
    expect(w.beheer).toBe("abonnement.betalingRegelen");
    expect(w.blokken).toEqual({ gratis: null, project: null, kaarten: [] });
  });

  test("onderwijs: melding onderwijs zonder kaarten", () => {
    for (const rol of ["eigenaar", "lid"] as const) {
      const w = paginaWeergave(overzicht({ niveau: "onderwijs", reden: "onderwijs", prijzen: metProject }), rol, "nl");
      expect(w.melding).toBe("onderwijs");
      expect(w.blokken).toEqual({ gratis: null, project: null, kaarten: [] });
      expect(w.statusSleutel).toBeNull();
    }
  });
});

describe("behandelSchrijfweigering", () => {
  const fout = (status: number, code: string) => ({ status, data: { statusCode: status, data: { code } } });

  test("schrijfweigering PROJECT_LIMIET geeft 'limiet'", async () => {
    const laad = vi.fn(async () => {});
    expect(await behandelSchrijfweigering(fout(402, "PROJECT_LIMIET"), laad)).toBe("limiet");
  });

  test("PROJECT_ALLEEN_LEZEN geeft 'alleen-lezen' en leest de sessie opnieuw", async () => {
    const laad = vi.fn(async () => {});
    expect(await behandelSchrijfweigering(fout(402, "PROJECT_ALLEEN_LEZEN"), laad)).toBe("alleen-lezen");
    expect(laad).toHaveBeenCalledTimes(1);
  });

  test("het oude ABONNEMENT_VEREIST en andere fouten zijn niet behandeld", async () => {
    const laad = vi.fn(async () => {});
    expect(await behandelSchrijfweigering(fout(402, "ABONNEMENT_VEREIST"), laad)).toBe(false);
    expect(await behandelSchrijfweigering(fout(500, "PROJECT_LIMIET"), laad)).toBe(false);
    expect(await behandelSchrijfweigering({ status: 500 }, laad)).toBe(false);
  });
});
