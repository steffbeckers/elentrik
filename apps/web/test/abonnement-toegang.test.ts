// De toegangsbeslissing en de keuze van het gevolgde abonnement: pure functies, geen database.
import { describe, expect, test } from "vitest";
import type { AbonnementStatus } from "../shared/abonnement";
import { achterstalligTot, ACHTERSTALLIG_DAGEN, bepaalToegang, kiesGevolgdAbonnement, PROEF_DAGEN } from "../server/abonnementen/toegang";

const nu = new Date("2026-11-01T12:00:00Z");
const DAG = 24 * 3600 * 1000;
const verlopen = new Date(nu.getTime() - DAG);

type Invoer = Parameters<typeof bepaalToegang>[0];

function toegang(deel: Partial<Invoer>) {
  return bepaalToegang({ nu, ingeschakeld: true, proefEinde: verlopen, vrijgesteld: false, abonnement: null, ...deel });
}

function met(status: AbonnementStatus, achterstalligSinds: Date | null = null): Invoer["abonnement"] {
  return { status, achterstalligSinds };
}

describe("vaste waarden", () => {
  test("30 dagen proef en 14 dagen achterstal", () => {
    expect(PROEF_DAGEN).toBe(30);
    expect(ACHTERSTALLIG_DAGEN).toBe(14);
  });
});

describe("bepaalToegang", () => {
  test("abonnementen uit: altijd schrijven, ook met een verlopen proef en een beëindigd abonnement", () => {
    expect(toegang({ ingeschakeld: false })).toEqual({ schrijven: true, reden: "uit" });
    expect(toegang({ ingeschakeld: false, abonnement: met("canceled") })).toEqual({ schrijven: true, reden: "uit" });
  });

  test("vrijgesteld: schrijven", () => {
    expect(toegang({ vrijgesteld: true })).toEqual({ schrijven: true, reden: "vrijgesteld" });
    expect(toegang({ vrijgesteld: true, abonnement: met("canceled") })).toEqual({
      schrijven: true,
      reden: "vrijgesteld",
    });
  });

  test.each(["active", "trialing"] as const)("%s: schrijven met reden actief, ook zonder proef", (status) => {
    expect(toegang({ abonnement: met(status) })).toEqual({ schrijven: true, reden: "actief" });
  });

  describe("past_due", () => {
    test("1 ms vóór het einde van de 14 dagen: nog schrijven", () => {
      const sinds = new Date(nu.getTime() - 14 * DAG + 1);
      expect(toegang({ abonnement: met("past_due", sinds) })).toEqual({ schrijven: true, reden: "betaling-mislukt" });
    });

    test("op exact 14 dagen: alleen-lezen", () => {
      const sinds = new Date(nu.getTime() - 14 * DAG);
      expect(toegang({ abonnement: met("past_due", sinds) })).toEqual({ schrijven: false, reden: "betaling-mislukt" });
    });

    test("een lopende proef geeft dan nog wel schrijfrecht, als proef", () => {
      const sinds = new Date(nu.getTime() - 20 * DAG);
      const proefEinde = new Date(nu.getTime() + DAG);
      expect(toegang({ proefEinde, abonnement: met("past_due", sinds) })).toEqual({ schrijven: true, reden: "proef" });
    });
  });

  describe("zonder abonnement", () => {
    test("proefEinde 1 ms in de toekomst: proef", () => {
      expect(toegang({ proefEinde: new Date(nu.getTime() + 1) })).toEqual({ schrijven: true, reden: "proef" });
    });

    test("proefEinde is nu: proef voorbij", () => {
      expect(toegang({ proefEinde: nu })).toEqual({ schrijven: false, reden: "proef-voorbij" });
    });
  });

  describe("een abonnement zonder schrijfrecht, met een verlopen proef", () => {
    test.each([
      ["canceled", "beeindigd"],
      ["incomplete_expired", "beeindigd"],
      ["paused", "beeindigd"],
      ["unpaid", "betaling-mislukt"],
      ["incomplete", "proef-voorbij"],
    ] as const)("%s: alleen-lezen met reden %s", (status, reden) => {
      expect(toegang({ abonnement: met(status) })).toEqual({ schrijven: false, reden });
    });

    test.each(["canceled", "incomplete_expired", "unpaid", "incomplete", "paused"] as const)(
      "%s met een lopende proef: schrijven als proef",
      (status) => {
        const proefEinde = new Date(nu.getTime() + DAG);
        expect(toegang({ proefEinde, abonnement: met(status) })).toEqual({ schrijven: true, reden: "proef" });
      },
    );
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
