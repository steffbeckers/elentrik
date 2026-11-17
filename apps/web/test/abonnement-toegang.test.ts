// De toegangsbeslissing en de keuze van het gevolgde abonnement: pure functies, geen database.
import { describe, expect, test } from "vitest";
import type { AbonnementStatus } from "../shared/abonnement";
import {
  achterstalligTot,
  ACHTERSTALLIG_DAGEN,
  bepaalBedrijfsniveau,
  bepaalProjecttoegang,
  kiesGevolgdAbonnement,
} from "../server/abonnementen/toegang";

const nu = new Date("2026-11-01T12:00:00Z");
const DAG = 24 * 3600 * 1000;
const verlopen = new Date(nu.getTime() - DAG);

type Invoer = Parameters<typeof bepaalBedrijfsniveau>[0];

function niveau(deel: Partial<Invoer>) {
  return bepaalBedrijfsniveau({
    nu,
    ingeschakeld: true,
    proefEinde: verlopen,
    vrijgesteld: false,
    onderwijs: false,
    abonnement: null,
    ...deel,
  });
}

function met(status: AbonnementStatus, achterstalligSinds: Date | null = null): Invoer["abonnement"] {
  return { status, achterstalligSinds };
}

describe("vaste waarden", () => {
  test("14 dagen achterstal", () => {
    expect(ACHTERSTALLIG_DAGEN).toBe(14);
  });
});

describe("bepaalBedrijfsniveau", () => {
  test("abonnementen uit: uit, ook met onderwijs, vrijstelling of een beëindigd abonnement", () => {
    expect(niveau({ ingeschakeld: false })).toEqual({ niveau: "uit", reden: "uit" });
    expect(niveau({ ingeschakeld: false, abonnement: met("canceled") })).toEqual({ niveau: "uit", reden: "uit" });
    expect(niveau({ ingeschakeld: false, onderwijs: true })).toEqual({ niveau: "uit", reden: "uit" });
    expect(niveau({ ingeschakeld: false, vrijgesteld: true })).toEqual({ niveau: "uit", reden: "uit" });
  });

  test("vrijgesteld: vrijgesteld, ook met een actief of beëindigd abonnement", () => {
    expect(niveau({ vrijgesteld: true })).toEqual({ niveau: "vrijgesteld", reden: "vrijgesteld" });
    expect(niveau({ vrijgesteld: true, abonnement: met("canceled") })).toEqual({
      niveau: "vrijgesteld",
      reden: "vrijgesteld",
    });
    expect(niveau({ vrijgesteld: true, abonnement: met("active") })).toEqual({
      niveau: "vrijgesteld",
      reden: "vrijgesteld",
    });
  });

  test("onderwijs: onderwijs, ook met een actief abonnement of een lopende proef", () => {
    expect(niveau({ onderwijs: true })).toEqual({ niveau: "onderwijs", reden: "onderwijs" });
    expect(niveau({ onderwijs: true, abonnement: met("active") })).toEqual({ niveau: "onderwijs", reden: "onderwijs" });
    expect(niveau({ onderwijs: true, proefEinde: new Date(nu.getTime() + DAG) })).toEqual({
      niveau: "onderwijs",
      reden: "onderwijs",
    });
  });

  test.each(["active", "trialing"] as const)("%s: abonnement met reden actief, ook zonder proef", (status) => {
    expect(niveau({ abonnement: met(status) })).toEqual({ niveau: "abonnement", reden: "actief" });
  });

  describe("past_due", () => {
    test("op 13 dagen: nog abonnement", () => {
      const sinds = new Date(nu.getTime() - 13 * DAG);
      expect(niveau({ abonnement: met("past_due", sinds) })).toEqual({
        niveau: "abonnement",
        reden: "betaling-mislukt",
      });
    });

    test("1 ms vóór het einde van de 14 dagen: nog abonnement", () => {
      const sinds = new Date(nu.getTime() - 14 * DAG + 1);
      expect(niveau({ abonnement: met("past_due", sinds) })).toEqual({
        niveau: "abonnement",
        reden: "betaling-mislukt",
      });
    });

    test("op exact 14 dagen: gratis", () => {
      const sinds = new Date(nu.getTime() - 14 * DAG);
      expect(niveau({ abonnement: met("past_due", sinds) })).toEqual({ niveau: "gratis", reden: "betaling-mislukt" });
    });

    test("op 15 dagen: gratis met reden betaling-mislukt", () => {
      const sinds = new Date(nu.getTime() - 15 * DAG);
      expect(niveau({ abonnement: met("past_due", sinds) })).toEqual({ niveau: "gratis", reden: "betaling-mislukt" });
    });

    test("zonder bekend begin: nog abonnement", () => {
      expect(niveau({ abonnement: met("past_due") })).toEqual({ niveau: "abonnement", reden: "betaling-mislukt" });
    });

    test("na 15 dagen met een lopende proef: abonnement als proef", () => {
      const sinds = new Date(nu.getTime() - 15 * DAG);
      const proefEinde = new Date(nu.getTime() + DAG);
      expect(niveau({ proefEinde, abonnement: met("past_due", sinds) })).toEqual({
        niveau: "abonnement",
        reden: "proef",
      });
    });
  });

  describe("zonder abonnement", () => {
    test("lopende proef (proefEinde 1 ms in de toekomst): abonnement als proef", () => {
      expect(niveau({ proefEinde: new Date(nu.getTime() + 1) })).toEqual({ niveau: "abonnement", reden: "proef" });
    });

    test("voorbije proef (proefEinde is nu): gratis", () => {
      expect(niveau({ proefEinde: nu })).toEqual({ niveau: "gratis", reden: "gratis" });
    });

    test("voorbije proef van gisteren: gratis", () => {
      expect(niveau({})).toEqual({ niveau: "gratis", reden: "gratis" });
    });
  });

  describe("een abonnement zonder volledige toegang, met een verlopen proef", () => {
    test.each([
      ["canceled", "beeindigd"],
      ["incomplete_expired", "beeindigd"],
      ["paused", "beeindigd"],
      ["unpaid", "betaling-mislukt"],
      ["incomplete", "gratis"],
    ] as const)("%s: gratis met reden %s", (status, reden) => {
      expect(niveau({ abonnement: met(status) })).toEqual({ niveau: "gratis", reden });
    });

    test.each(["canceled", "incomplete_expired", "unpaid", "incomplete", "paused"] as const)(
      "%s met een lopende proef: abonnement als proef",
      (status) => {
        const proefEinde = new Date(nu.getTime() + DAG);
        expect(niveau({ proefEinde, abonnement: met(status) })).toEqual({ niveau: "abonnement", reden: "proef" });
      },
    );
  });
});

describe("bepaalProjecttoegang (tabel in spec 4.3)", () => {
  const gekocht = { gekocht: true, gestempeld: false };
  const gestempeld = { gekocht: false, gestempeld: true };
  const beide = { gekocht: true, gestempeld: true };
  const anders = { gekocht: false, gestempeld: false };
  const alle = [gekocht, gestempeld, beide, anders];
  const vrij = (p: { gekocht: boolean; gestempeld: boolean }) => ({ bewerken: true, limiet: false, watermerk: null, ...p });

  test("uit, elk project: bewerken, geen limiet, geen watermerk", () => {
    for (const p of alle) expect(bepaalProjecttoegang("uit", p)).toEqual(vrij(p));
  });

  test("vrijgesteld, elk project: bewerken, geen limiet, geen watermerk", () => {
    for (const p of alle) expect(bepaalProjecttoegang("vrijgesteld", p)).toEqual(vrij(p));
  });

  test("onderwijs, gekocht: bewerken zonder watermerk (gekocht gaat vóór onderwijs)", () => {
    expect(bepaalProjecttoegang("onderwijs", gekocht)).toEqual(vrij(gekocht));
    expect(bepaalProjecttoegang("onderwijs", beide)).toEqual(vrij(beide));
  });

  test("onderwijs, gestempeld en niet gekocht: niet bewerken, geen watermerk", () => {
    expect(bepaalProjecttoegang("onderwijs", gestempeld)).toEqual({
      bewerken: false,
      limiet: false,
      watermerk: null,
      gekocht: false,
      gestempeld: true,
    });
  });

  test("onderwijs, anders: bewerken zonder limiet, met watermerk onderwijs", () => {
    expect(bepaalProjecttoegang("onderwijs", anders)).toEqual({
      bewerken: true,
      limiet: false,
      watermerk: "onderwijs",
      gekocht: false,
      gestempeld: false,
    });
  });

  test("abonnement, elk project: bewerken, geen limiet, geen watermerk", () => {
    for (const p of alle) expect(bepaalProjecttoegang("abonnement", p)).toEqual(vrij(p));
  });

  test("gratis, gekocht: bewerken zonder limiet en zonder watermerk", () => {
    expect(bepaalProjecttoegang("gratis", gekocht)).toEqual(vrij(gekocht));
    expect(bepaalProjecttoegang("gratis", beide)).toEqual(vrij(beide));
  });

  test("gratis, gestempeld en niet gekocht: niet bewerken, geen watermerk", () => {
    expect(bepaalProjecttoegang("gratis", gestempeld)).toEqual({
      bewerken: false,
      limiet: false,
      watermerk: null,
      gekocht: false,
      gestempeld: true,
    });
  });

  test("gratis, anders: bewerken met limiet en watermerk gratis", () => {
    expect(bepaalProjecttoegang("gratis", anders)).toEqual({
      bewerken: true,
      limiet: true,
      watermerk: "gratis",
      gekocht: false,
      gestempeld: false,
    });
  });
});

describe("achterstalligTot", () => {
  const sinds = new Date("2026-10-01T10:00:00Z");

  test("past_due met een bekend begin: begin + 14 dagen", () => {
    expect(achterstalligTot({ status: "past_due", achterstalligSinds: sinds })?.toISOString()).toBe(
      new Date(sinds.getTime() + ACHTERSTALLIG_DAGEN * 24 * 3600 * 1000).toISOString(),
    );
  });

  test("anders null: andere status, onbekend begin of geen abonnement", () => {
    for (const status of ["active", "trialing", "unpaid", "canceled", "incomplete"] as const) {
      expect(achterstalligTot({ status, achterstalligSinds: sinds })).toBeNull();
    }
    expect(achterstalligTot({ status: "past_due", achterstalligSinds: null })).toBeNull();
    expect(achterstalligTot(null)).toBeNull();
  });
});

describe("kiesGevolgdAbonnement", () => {
  const oud = new Date("2026-01-01T00:00:00Z");
  const nieuw = new Date("2026-06-01T00:00:00Z");
  const rij = (status: AbonnementStatus, aangemaakt: Date, id: string = status) => ({ id, status, aangemaakt });

  test("een levend abonnement wint van een nieuwer beëindigd: geen dubbel", () => {
    const canceled = rij("canceled", nieuw);
    const active = rij("active", oud);
    expect(kiesGevolgdAbonnement([canceled, active])).toEqual({ gevolgd: active, dubbel: false });
  });

  test("twee actieve: het nieuwste, dubbel", () => {
    const a = rij("active", oud, "a");
    const b = rij("active", nieuw, "b");
    expect(kiesGevolgdAbonnement([a, b])).toEqual({ gevolgd: b, dubbel: true });
    expect(kiesGevolgdAbonnement([b, a])).toEqual({ gevolgd: b, dubbel: true });
  });

  test("past_due en trialing: trialing wint, dubbel", () => {
    const pastDue = rij("past_due", nieuw);
    const trialing = rij("trialing", oud);
    expect(kiesGevolgdAbonnement([pastDue, trialing])).toEqual({ gevolgd: trialing, dubbel: true });
  });

  test("de volledige volgorde", () => {
    const volgorde: AbonnementStatus[] = [
      "active",
      "trialing",
      "past_due",
      "unpaid",
      "paused",
      "incomplete",
      "canceled",
      "incomplete_expired",
    ];
    for (let i = 0; i < volgorde.length - 1; i++) {
      const beter = rij(volgorde[i]!, oud);
      const slechter = rij(volgorde[i + 1]!, nieuw);
      expect(kiesGevolgdAbonnement([slechter, beter]).gevolgd).toBe(beter);
    }
  });

  test("een onbekende status verliest van elke bekende, ook van incomplete_expired", () => {
    const onbekend = rij("nieuwe_status" as AbonnementStatus, nieuw);
    const laatste = rij("incomplete_expired", oud);
    expect(kiesGevolgdAbonnement([onbekend, laatste]).gevolgd).toBe(laatste);
    expect(kiesGevolgdAbonnement([laatste, onbekend]).gevolgd).toBe(laatste);
    // Alleen onbekenden: nog steeds het nieuwste.
    const ouder = rij("raar" as AbonnementStatus, oud);
    expect(kiesGevolgdAbonnement([ouder, onbekend]).gevolgd).toBe(onbekend);
  });

  test("leeg: niets", () => {
    expect(kiesGevolgdAbonnement([])).toEqual({ gevolgd: null, dubbel: false });
  });

  test("één beëindigd abonnement is niet dubbel", () => {
    const canceled = rij("canceled", oud);
    expect(kiesGevolgdAbonnement([canceled, rij("canceled", nieuw)]).dubbel).toBe(false);
    expect(kiesGevolgdAbonnement([canceled]).gevolgd).toBe(canceled);
  });
});
