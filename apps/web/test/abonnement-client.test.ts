// De clientlogica van de abonnementspagina en de alleen-lezenmelding. Zoals de andere clienttests
// geen gemounte componenten (de omgeving is node, zonder DOM): de pagina en de projectenlijst zijn
// dun en lopen via deze modules.
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { AbonnementOverzicht } from "../shared/abonnement";
import { beheerAbonnement, kiesFormule, verwerkTerug } from "../app/abonnement/acties";
import { behandelSchrijfweigering, paginaWeergave } from "../app/abonnement/weergave";
import { maakAbonnementApi } from "../app/composables/useAbonnementApi";
import { maakProjectenApi, type ProjectenFetch } from "../app/composables/useProjectenApi";
import { useSessieStore, type Mij, type SessieApi } from "../app/stores/sessie";

const HEADER = "x-elentrik-organisatie";
const NU = new Date("2026-11-01T12:00:00.000Z");

const gewoon = (tekst: string) => tekst.replace(/\s/g, " ");

function overzicht(wijziging: Partial<AbonnementOverzicht> = {}): AbonnementOverzicht {
  return {
    ingeschakeld: true,
    schrijven: false,
    reden: "proef-voorbij",
    proefEinde: NU.toISOString(),
    achterstalligTot: null,
    status: null,
    formule: null,
    periodeEinde: null,
    opgezegd: false,
    heeftKlant: false,
    prijzen: {
      maand: { bedrag: 3000, munt: "eur", interval: "month" },
      jaar: { bedrag: 30000, munt: "eur", interval: "year" },
    },
    ...wijziging,
  };
}

function fout(status: number, code: string) {
  return { status, data: { statusCode: status, data: { code } } };
}

describe("de pagina", () => {
  test("een eigenaar zonder abonnement ziet twee kaarten met -17 % op jaarlijks", () => {
    const w = paginaWeergave(overzicht(), "eigenaar");
    expect(w.kaarten.map((k) => k.formule)).toEqual(["maand", "jaar"]);
    expect(w.kaarten[0]!.korting).toBeNull();
    expect(w.kaarten[1]!.korting).toBe(17);
    expect(gewoon(w.kaarten[0]!.prijs.excl)).toBe("€ 30,00");
    expect(w.beheer).toBeNull();
    expect(w.melding).toBeNull();
  });

  test("een lid ziet geen knoppen, wel de uitleg", () => {
    const w = paginaWeergave(overzicht(), "lid");
    expect(w.kaarten).toEqual([]);
    expect(w.beheer).toBeNull();
    expect(w.melding).toBe("lid");
  });

  test("een eigenaar met een abonnement ziet beheren; bij past_due of unpaid betaling regelen", () => {
    const actief = overzicht({ schrijven: true, reden: "actief", status: "active", formule: "maand", heeftKlant: true });
    expect(paginaWeergave(actief, "eigenaar").kaarten).toEqual([]);
    expect(paginaWeergave(actief, "eigenaar").beheer).toBe("abonnement.beheren");
    for (const status of ["past_due", "unpaid"] as const) {
      expect(paginaWeergave({ ...actief, status }, "eigenaar").beheer).toBe("abonnement.betalingRegelen");
    }
    // Een beëindigd abonnement kan opnieuw genomen worden.
    const beeindigd = paginaWeergave({ ...actief, status: "canceled", schrijven: false, reden: "beeindigd" }, "eigenaar");
    expect(beeindigd.kaarten).toHaveLength(2);
    expect(beeindigd.beheer).toBeNull();
  });

  test("zonder prijzen: de status blijft en de melding komt, zonder knoppen", () => {
    const w = paginaWeergave(overzicht({ prijzen: null }), "eigenaar");
    expect(w.statusSleutel).toBe("abonnement.status.proefVoorbij");
    expect(w.melding).toBe("prijzen");
    expect(w.kaarten).toEqual([]);
    expect(w.beheer).toBeNull();
  });

  test("zonder prijzen maar met een abonnement kan een eigenaar nog beheren", () => {
    const w = paginaWeergave(
      overzicht({ prijzen: null, status: "active", reden: "actief", schrijven: true, heeftKlant: true }),
      "eigenaar",
    );
    expect(w.beheer).toBe("abonnement.beheren");
    expect(w.melding).toBeNull();
  });

  test("abonnementen uit: alleen de melding dat betalen nog niet is ingesteld", () => {
    const w = paginaWeergave(overzicht({ ingeschakeld: false, reden: "uit", schrijven: true, prijzen: null }), "eigenaar");
    // De zin "Betalen is nog niet ingesteld." staat één keer: in de melding, niet ook in de statusregel.
    expect(w.statusSleutel).toBeNull();
    expect(w.melding).toBe("uit");
    expect(w.kaarten).toEqual([]);
    expect(w.beheer).toBeNull();
  });
});

describe("terug uit Checkout", () => {
  test("?terug=cs_1 synchroniseert, haalt terug daarna uit de URL en ververst de sessie", async () => {
    const volgorde: string[] = [];
    const nieuw = overzicht({ status: "active", reden: "actief", schrijven: true });
    const api = {
      synchroniseer: vi.fn(async (sessie: string) => {
        volgorde.push(`sync:${sessie}`);
        return nieuw;
      }),
    };
    const resultaat = await verwerkTerug("cs_1", {
      api,
      laadSessie: async () => void volgorde.push("sessie"),
      verwijderTerug: async () => void volgorde.push("url"),
    });
    expect(api.synchroniseer).toHaveBeenCalledWith("cs_1");
    expect(resultaat).toBe(nieuw);
    expect(volgorde).toEqual(["sync:cs_1", "url", "sessie"]);
  });

  test("zonder terug niets; een mislukte synchronisatie geeft null en haalt terug toch weg", async () => {
    const synchroniseer = vi.fn(async () => Promise.reject(new Error("netwerk")));
    const verwijderTerug = vi.fn();
    const laadSessie = vi.fn(async () => {});
    expect(await verwerkTerug(undefined, { api: { synchroniseer }, laadSessie, verwijderTerug })).toBeNull();
    expect(synchroniseer).not.toHaveBeenCalled();
    expect(verwijderTerug).not.toHaveBeenCalled();
    expect(await verwerkTerug("cs_2", { api: { synchroniseer }, laadSessie, verwijderTerug })).toBeNull();
    expect(verwijderTerug).toHaveBeenCalledTimes(1);
  });
});

describe("Kies en beheren", () => {
  test("Kies navigeert naar de url van Checkout", async () => {
    const checkout = vi.fn(async () => ({ url: "https://stripe.test/cs" }));
    const navigeer = vi.fn();
    expect(await kiesFormule("jaar", { api: { checkout }, navigeer, herlaad: vi.fn() })).toBe("doorgestuurd");
    expect(checkout).toHaveBeenCalledWith("jaar");
    expect(navigeer).toHaveBeenCalledWith("https://stripe.test/cs");
  });

  test("een 409 ABONNEMENT_BESTAAT: opnieuw laden, niet navigeren", async () => {
    const checkout = vi.fn(async () => Promise.reject(fout(409, "ABONNEMENT_BESTAAT")));
    const navigeer = vi.fn();
    const herlaad = vi.fn(async () => {});
    expect(await kiesFormule("maand", { api: { checkout }, navigeer, herlaad })).toBe("bestaat");
    expect(herlaad).toHaveBeenCalledTimes(1);
    expect(navigeer).not.toHaveBeenCalled();
  });

  test("een andere fout gaat door naar de aanroeper", async () => {
    const checkout = vi.fn(async () => Promise.reject(fout(500, "X")));
    await expect(kiesFormule("maand", { api: { checkout }, navigeer: vi.fn(), herlaad: vi.fn() })).rejects.toMatchObject({
      status: 500,
    });
  });

  test("beheren navigeert naar het portaal; een 409 GEEN_KLANT laadt opnieuw", async () => {
    const navigeer = vi.fn();
    const portaal = vi.fn(async () => ({ url: "https://stripe.test/portaal" }));
    expect(await beheerAbonnement({ api: { portaal }, navigeer, herlaad: vi.fn() })).toBe("doorgestuurd");
    expect(navigeer).toHaveBeenCalledWith("https://stripe.test/portaal");

    const herlaad = vi.fn(async () => {});
    const zonderKlant = vi.fn(async () => Promise.reject(fout(409, "GEEN_KLANT")));
    expect(await beheerAbonnement({ api: { portaal: zonderKlant }, navigeer, herlaad })).toBe("geen-klant");
    expect(herlaad).toHaveBeenCalledTimes(1);
  });
});

describe("de API", () => {
  test("de POST's sturen de actieve organisatie mee; lezen niet", async () => {
    const oproepen: [string, { method?: string; headers?: Record<string, string>; body?: unknown }?][] = [];
    const haal = vi.fn(async (url: string, opties?: { method?: string; headers?: Record<string, string>; body?: unknown }) => {
      oproepen.push(opties === undefined ? [url] : [url, opties]);
      return {};
    });
    const api = maakAbonnementApi(haal, { actieveOrganisatieId: () => "o1" });
    await api.haal();
    await api.checkout("maand");
    await api.portaal();
    await api.synchroniseer("cs_1");
    expect(oproepen).toEqual([
      ["/api/abonnement"],
      ["/api/abonnement/checkout", { method: "POST", body: { formule: "maand" }, headers: { [HEADER]: "o1" } }],
      ["/api/abonnement/portaal", { method: "POST", headers: { [HEADER]: "o1" } }],
      ["/api/abonnement/synchroniseer", { method: "POST", body: { sessie: "cs_1" }, headers: { [HEADER]: "o1" } }],
    ]);
  });
});

describe("een 402 ABONNEMENT_VEREIST op Nieuw project of Dupliceren", () => {
  const MIJ: Mij = {
    gebruiker: { id: "u1", naam: "An", email: "an@example.test", proefGebruikt: true },
    organisaties: [
      {
        id: "o1",
        naam: "Peeters",
        rol: "eigenaar",
        toegang: { schrijven: false, reden: "proef-voorbij", proefEinde: NU.toISOString(), achterstalligTot: null },
      },
    ],
    actieveOrganisatieId: "o1",
    abonnementenIngeschakeld: true,
  };

  beforeEach(() => {
    setActivePinia(createPinia());
  });

  test("ververst de sessie (nieuwe toegang) en meldt dat de fout behandeld is", async () => {
    const sessie = useSessieStore();
    const api: SessieApi = { mij: vi.fn(async () => MIJ), wisselActief: vi.fn(), uitloggen: vi.fn() };
    sessie.gebruikApi(api);
    const laad = vi.spyOn(sessie, "laad");

    const weigering = { status: 402, data: { statusCode: 402, data: { code: "ABONNEMENT_VEREIST", reden: "proef-voorbij" } } };
    const projecten = maakProjectenApi((async () => Promise.reject(weigering)) as ProjectenFetch);
    await expect(projecten.maak({ naam: "X", klantnaam: "", stroomtype: "2x230V" })).rejects.toBe(weigering);
    await expect(projecten.dupliceer("p1")).rejects.toBe(weigering);

    expect(await behandelSchrijfweigering(weigering, () => sessie.laad())).toBe(true);
    expect(laad).toHaveBeenCalledTimes(1);
    expect(sessie.toegang.schrijven).toBe(false);
    expect(sessie.proefGebruikt).toBe(true);
  });

  test("een andere fout (ook een 402 met een andere code) is niet behandeld en laadt niets", async () => {
    const laad = vi.fn(async () => {});
    expect(await behandelSchrijfweigering({ status: 500 }, laad)).toBe(false);
    expect(await behandelSchrijfweigering(fout(402, "IETS_ANDERS"), laad)).toBe(false);
    expect(laad).not.toHaveBeenCalled();
  });

  test("mislukt het verversen van de sessie, dan blijft de fout toch behandeld", async () => {
    const laad = vi.fn(async () => Promise.reject(new Error("netwerk")));
    expect(await behandelSchrijfweigering(fout(402, "ABONNEMENT_VEREIST"), laad)).toBe(true);
  });
});

describe("de sessie-store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  test("zonder organisatie: schrijven, reden uit en geen proef", () => {
    const sessie = useSessieStore();
    expect(sessie.toegang).toEqual({ schrijven: true, reden: "uit", proefEinde: null, achterstalligTot: null });
    expect(sessie.proefGebruikt).toBe(false);
  });
});
