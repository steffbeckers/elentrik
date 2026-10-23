import { describe, expect, test } from "vitest";
import type { AbonnementOverzicht, Toegang } from "../shared/abonnement";
import { bannerVoor, jaarKorting, prijsTekst, statusTekstSleutel } from "../app/abonnement/weergave";

const NU = new Date("2026-11-01T12:00:00.000Z");
const DAG = 24 * 3600 * 1000;

function toegang(wijziging: Partial<Toegang> = {}): Toegang {
  return { schrijven: true, reden: "proef", proefEinde: new Date(NU.getTime() + 3 * DAG).toISOString(), ...wijziging };
}

function overzicht(wijziging: Partial<AbonnementOverzicht> = {}): AbonnementOverzicht {
  return {
    ingeschakeld: true,
    schrijven: true,
    reden: "proef",
    proefEinde: new Date(NU.getTime() + 3 * DAG).toISOString(),
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
    expect(bannerVoor(op(7), "eigenaar", NU)).toEqual({ soort: "proef", dagen: 7, knop: true });
    expect(bannerVoor(op(6, 1), "eigenaar", NU)).toEqual({ soort: "proef", dagen: 7, knop: true });
    expect(bannerVoor(op(7, 1), "eigenaar", NU)).toBeNull();
    expect(bannerVoor(op(8), "eigenaar", NU)).toBeNull();
    expect(bannerVoor(op(1), "eigenaar", NU)).toEqual({ soort: "proef", dagen: 1, knop: true });
  });

  test("proef: nooit voor een lid of zonder rol", () => {
    expect(bannerVoor(toegang(), "lid", NU)).toBeNull();
    expect(bannerVoor(toegang(), null, NU)).toBeNull();
  });

  test("betaling: alleen voor een eigenaar, en alleen met schrijfrecht", () => {
    const t = toegang({ reden: "betaling-mislukt", proefEinde: null });
    expect(bannerVoor(t, "eigenaar", NU)).toEqual({ soort: "betaling", knop: true });
    expect(bannerVoor(t, "lid", NU)).toBeNull();
  });

  test("alleen-lezen: een lid zonder knop, een eigenaar met knop", () => {
    const t = toegang({ schrijven: false, reden: "proef-voorbij" });
    expect(bannerVoor(t, "lid", NU)).toEqual({ soort: "alleen-lezen", knop: false });
    expect(bannerVoor(t, "eigenaar", NU)).toEqual({ soort: "alleen-lezen", knop: true });
    // Ook een mislukte betaling zonder schrijfrecht is alleen-lezen.
    expect(bannerVoor(toegang({ schrijven: false, reden: "betaling-mislukt" }), "eigenaar", NU)).toEqual({
      soort: "alleen-lezen",
      knop: true,
    });
  });

  test("uit, vrijgesteld en actief: geen banner", () => {
    expect(bannerVoor({ schrijven: true, reden: "uit", proefEinde: null }, "eigenaar", NU)).toBeNull();
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
    expect(statusTekstSleutel(overzicht({ reden: "betaling-mislukt", status: "past_due" }))).toBe(
      "abonnement.status.betalingMislukt",
    );
    expect(statusTekstSleutel(overzicht({ schrijven: false, reden: "beeindigd", status: "canceled" }))).toBe(
      "abonnement.status.beeindigd",
    );
    expect(statusTekstSleutel(overzicht({ schrijven: false, reden: "proef-voorbij" }))).toBe(
      "abonnement.status.proefVoorbij",
    );
  });
});
