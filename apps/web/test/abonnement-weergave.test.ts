import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import type { AbonnementOverzicht, Toegang } from "../shared/abonnement";
import { bannerVoor, datumTekst, jaarKorting, prijsTekst, statusAantal, statusTekstSleutel } from "../app/abonnement/weergave";

const NU = new Date("2026-11-01T12:00:00.000Z");
const DAG = 24 * 3600 * 1000;

function toegang(wijziging: Partial<Toegang> = {}): Toegang {
  return {
    schrijven: true,
    reden: "proef",
    proefEinde: new Date(NU.getTime() + 3 * DAG).toISOString(),
    achterstalligTot: null,
    ...wijziging,
  };
}

function overzicht(wijziging: Partial<AbonnementOverzicht> = {}): AbonnementOverzicht {
  return {
    ingeschakeld: true,
    schrijven: true,
    reden: "proef",
    proefEinde: new Date(NU.getTime() + 3 * DAG).toISOString(),
    achterstalligTot: null,
    status: null,
    formule: null,
    periodeEinde: null,
    opgezegd: false,
    heeftKlant: false,
    prijzen: null,
    ...wijziging,
  };
}

/** Maakt de spaties van `nl-BE` (nbsp) vergelijkbaar. */
const gewoon = (tekst: string) => tekst.replace(/\s/g, " ");

describe("prijsTekst", () => {
  test("het bedrag excl. btw en ter info incl. 21 % btw, in nl-BE", () => {
    const prijs = prijsTekst({ bedrag: 3000, munt: "eur", interval: "month" });
    const formaat = new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" });
    expect(prijs).toEqual({ excl: formaat.format(30), incl: formaat.format(36.3) });
    expect(gewoon(prijs.excl)).toBe("€ 30,00");
    expect(gewoon(prijs.incl)).toBe("€ 36,30");
  });

  test("incl. btw rondt af op een cent", () => {
    // 999 × 1,21 = 1208,79 cent
    expect(gewoon(prijsTekst({ bedrag: 999, munt: "EUR", interval: "year" }).incl)).toBe("€ 12,09");
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

  test("betaling: alleen voor een eigenaar, en alleen met schrijfrecht, met de datum", () => {
    const tot = new Date(NU.getTime() + 10 * DAG).toISOString();
    const t = toegang({ reden: "betaling-mislukt", proefEinde: null, achterstalligTot: tot });
    expect(bannerVoor(t, "eigenaar", NU)).toEqual({ soort: "betaling", tot, knop: true, knopSleutel: "abonnement.betalingRegelen" });
    expect(bannerVoor(t, "lid", NU)).toBeNull();
    // Zonder bekende einddatum blijft de banner, zonder datum.
    expect(bannerVoor({ ...t, achterstalligTot: null }, "eigenaar", NU)).toEqual({ soort: "betaling", knop: true, knopSleutel: "abonnement.betalingRegelen" });
  });

  test("alleen-lezen: een lid zonder knop, een eigenaar met knop", () => {
    const t = toegang({ schrijven: false, reden: "proef-voorbij" });
    expect(bannerVoor(t, "lid", NU)).toEqual({ soort: "alleen-lezen", knop: false });
    expect(bannerVoor(t, "eigenaar", NU)).toEqual({
      soort: "alleen-lezen",
      knop: true,
      knopSleutel: "abonnement.banner.kies",
    });
    // Ook een mislukte betaling zonder schrijfrecht is alleen-lezen.
    expect(bannerVoor(toegang({ schrijven: false, reden: "betaling-mislukt" }), "eigenaar", NU)).toEqual({
      soort: "alleen-lezen",
      knop: true,
      knopSleutel: "abonnement.betalingRegelen",
    });
  });

  test("alleen-lezen na een mislukte betaling: de knop zegt Betaling regelen; anders Kies een abonnement", () => {
    const onbetaald = toegang({ schrijven: false, reden: "betaling-mislukt" });
    expect(bannerVoor(onbetaald, "eigenaar", NU)?.knopSleutel).toBe("abonnement.betalingRegelen");
    expect(bannerVoor(onbetaald, "lid", NU)).toEqual({ soort: "alleen-lezen", knop: false });
    const voorbij = toegang({ schrijven: false, reden: "proef-voorbij" });
    expect(bannerVoor(voorbij, "eigenaar", NU)?.knopSleutel).toBe("abonnement.banner.kies");
  });

  test("uit, vrijgesteld en actief: geen banner", () => {
    expect(bannerVoor({ schrijven: true, reden: "uit", proefEinde: null, achterstalligTot: null }, "eigenaar", NU)).toBeNull();
    expect(bannerVoor(toegang({ reden: "vrijgesteld" }), "eigenaar", NU)).toBeNull();
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
        overzicht({ schrijven: false, reden: "betaling-mislukt", status: "unpaid", achterstalligTot: NU.toISOString() }),
      ),
    ).toBe("abonnement.status.betalingMislukt");
    expect(statusTekstSleutel(overzicht({ schrijven: false, reden: "beeindigd", status: "canceled" }))).toBe(
      "abonnement.status.beeindigd",
    );
    expect(statusTekstSleutel(overzicht({ schrijven: false, reden: "proef-voorbij" }))).toBe(
      "abonnement.status.proefVoorbij",
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

describe("de exporttekst in alleen-lezen", () => {
  test("stelt niet voor te betalen om te exporteren: de laatst opgeslagen versie kan er wel uit", () => {
    const nl = JSON.parse(readFileSync(new URL("../i18n/locales/nl.json", import.meta.url), "utf8")) as {
      editor: { export: { geblokkeerd: Record<string, string> } };
    };
    const tekst = nl.editor.export.geblokkeerd["alleen-lezen"]!;
    expect(tekst).toContain("laatst opgeslagen versie");
    expect(tekst).toContain("alleen lokaal");
    expect(tekst).not.toMatch(/na het kiezen van een abonnement/);
  });
});

describe("de teksten met de betaaldatum", () => {
  const nl = JSON.parse(readFileSync(new URL("../i18n/locales/nl.json", import.meta.url), "utf8")) as {
    abonnement: { banner: { betaling: string }; status: { betalingMisluktTot: string } };
  };
  const vul = (tekst: string, datum: string) => tekst.replace("{datum}", datum);

  test("datumTekst geeft een datum in het Nederlands", () => {
    expect(gewoon(datumTekst("2026-11-14T10:00:00.000Z"))).toBe("14 november 2026");
  });

  test("de banner en de statusregel gebruiken de zin uit de spec met de datum", () => {
    const datum = datumTekst("2026-11-14T10:00:00.000Z");
    expect(vul(nl.abonnement.banner.betaling, datum)).toBe(
      "Je laatste betaling is mislukt. Regel je betaling vóór 14 november 2026.",
    );
    expect(vul(nl.abonnement.status.betalingMisluktTot, datum)).toBe(
      "Je laatste betaling is mislukt. Regel je betaling vóór 14 november 2026.",
    );
  });
});
