// De taal van de interface in de client (plan 8, Task 4): wisselen via de taalkiezer, en na het
// lezen van de sessie de taal van het account, ook als de cookie of de browser iets anders zegt.
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { maakTaalWissel, TAALNAMEN, taalKeuzes } from "../app/sessie/taal";
import { useSessieStore, type Mij, type SessieApi } from "../app/stores/sessie";
import { LOCALES, TALEN, type Taal } from "../shared/taal";

beforeEach(() => {
  setActivePinia(createPinia());
});

describe("TALEN", () => {
  test("is exhaustief: precies de talen van LOCALES, nl eerst", () => {
    expect([...TALEN].sort()).toEqual(Object.keys(LOCALES).sort());
    expect(TALEN[0]).toBe("nl");
  });

  test("elke taal heeft een naam in haar eigen taal", () => {
    expect(TAALNAMEN).toEqual({ nl: "Nederlands", fr: "Français", en: "English" });
  });
});

describe("taalKeuzes", () => {
  test("de drie talen in hun eigen naam, de huidige aangevinkt; kiezen roept de wissel aan", () => {
    const kies = vi.fn();
    const keuzes = taalKeuzes("fr", kies);
    expect(keuzes.map((k) => [k.label, k.checked])).toEqual([
      ["Nederlands", false],
      ["Français", true],
      ["English", false],
    ]);
    keuzes[2]!.onSelect();
    expect(kies).toHaveBeenCalledWith("en");
  });

  test("een wissel die toch faalt, geeft geen onafgehandelde rejection", async () => {
    const onafgehandeld = vi.fn();
    process.on("unhandledRejection", onafgehandeld);
    try {
      taalKeuzes("nl", () => Promise.reject(new Error("kapot")))[1]!.onSelect();
      await new Promise((klaar) => setTimeout(klaar, 10));
      expect(onafgehandeld).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", onafgehandeld);
    }
  });
});

function maakWissel(
  opties: { aangemeld?: boolean; bewaar?: () => Promise<unknown>; zetLocale?: (taal: Taal) => Promise<void> } = {},
) {
  let locale: Taal = "nl";
  const zetLocale = vi.fn(
    opties.zetLocale ??
      (async (taal: Taal) => {
        locale = taal;
      }),
  );
  const bewaar = vi.fn(opties.bewaar ?? (async () => ({})));
  const bijFout = vi.fn();
  const bijBewaard = vi.fn();
  const wissel = maakTaalWissel({
    zetLocale,
    aangemeld: () => opties.aangemeld ?? true,
    bewaar,
    bijFout,
    bijBewaard,
  });
  return { wissel, zetLocale, bewaar, bijFout, bijBewaard, locale: () => locale };
}

describe("zetTaal", () => {
  test("zet de locale en bewaart de taal op het account met PUT /api/mij/taal { taal }", async () => {
    const { wissel, bewaar, bijBewaard, locale } = maakWissel();
    await wissel.zetTaal("fr");
    expect(locale()).toBe("fr");
    expect(bewaar).toHaveBeenCalledWith("/api/mij/taal", { method: "PUT", body: { taal: "fr" } });
    expect(bijBewaard).toHaveBeenCalledWith("fr");
  });

  test("eerst de interface, dan het account", async () => {
    const volgorde: string[] = [];
    const wissel = maakTaalWissel({
      zetLocale: async () => void volgorde.push("locale"),
      aangemeld: () => true,
      bewaar: async () => void volgorde.push("bewaar"),
      bijFout: () => undefined,
    });
    await wissel.zetTaal("en");
    expect(volgorde).toEqual(["locale", "bewaar"]);
  });

  test("zonder sessie: alleen de locale (en dus de cookie), geen API", async () => {
    const { wissel, bewaar, locale } = maakWissel({ aangemeld: false });
    await wissel.zetTaal("en");
    expect(locale()).toBe("en");
    expect(bewaar).not.toHaveBeenCalled();
  });

  test("lukt het bewaren niet, dan blijft de interface gewisseld, met een melding en zonder fout", async () => {
    const kapot = Object.assign(new Error("kapot"), { status: 500 });
    const { wissel, bijFout, bijBewaard, locale } = maakWissel({ bewaar: async () => Promise.reject(kapot) });
    await expect(wissel.zetTaal("fr")).resolves.toBeUndefined();
    expect(locale()).toBe("fr");
    expect(bijFout).toHaveBeenCalledWith(kapot, "bewaren");
    expect(bijBewaard).not.toHaveBeenCalled();
  });

  test("lukt het wisselen van de locale niet, dan geen fout naar boven, wel een melding, en niets bewaard", async () => {
    const kapot = new Error("berichten niet geladen");
    const { wissel, bijFout, bewaar, locale } = maakWissel({ zetLocale: async () => Promise.reject(kapot) });
    await expect(wissel.zetTaal("fr")).resolves.toBeUndefined();
    expect(locale()).toBe("nl");
    expect(bijFout).toHaveBeenCalledWith(kapot, "wisselen");
    expect(bewaar).not.toHaveBeenCalled();
  });

  test("dezelfde taal opnieuw kiezen bewaart opnieuw (zo herstelt een mislukte poging)", async () => {
    const { wissel, zetLocale, bewaar } = maakWissel();
    await wissel.zetTaal("fr");
    await wissel.zetTaal("fr");
    expect(zetLocale).toHaveBeenCalledTimes(2);
    expect(bewaar).toHaveBeenCalledTimes(2);
  });
});

const MIJ: Mij = {
  gebruiker: { id: "u1", naam: "An Peeters", email: "an@example.test", proefGebruikt: false, taal: "en" },
  organisaties: [],
  actieveOrganisatieId: null,
  abonnementenIngeschakeld: false,
};

function sessieApi(overschrijf: Partial<SessieApi> = {}): SessieApi {
  return {
    mij: vi.fn(async () => MIJ),
    wisselActief: vi.fn(async () => undefined),
    uitloggen: vi.fn(async () => undefined),
    ...overschrijf,
  };
}

describe("de sessie-store en de taal van het account", () => {
  test("na laad() met gebruiker.taal = en is de locale en, ook als de cookie fr zegt", async () => {
    let locale: Taal = "fr"; // uit de cookie elentrik_taal
    const store = useSessieStore();
    store.gebruikApi(
      sessieApi({
        zetLocale: vi.fn(async (taal: Taal) => {
          locale = taal;
        }),
      }),
    );
    await store.laad();
    expect(locale).toBe("en");
    expect(store.gebruiker?.taal).toBe("en");
  });

  test("zonder sessie (401) blijft de locale van de cookie", async () => {
    const zetLocale = vi.fn();
    const store = useSessieStore();
    store.gebruikApi(
      sessieApi({
        mij: vi.fn(async () => Promise.reject(Object.assign(new Error("Niet ingelogd"), { status: 401 }))),
        zetLocale,
      }),
    );
    await store.laad();
    expect(zetLocale).not.toHaveBeenCalled();
  });

  test("lukt het wisselen van de locale niet, dan is de sessie toch geladen", async () => {
    const store = useSessieStore();
    store.gebruikApi(sessieApi({ zetLocale: vi.fn(async () => Promise.reject(new Error("berichten niet geladen"))) }));
    await store.laad();
    expect(store.geladen).toBe(true);
    expect(store.gebruiker?.id).toBe("u1");
  });
});
