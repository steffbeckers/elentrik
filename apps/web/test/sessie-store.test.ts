import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useSessieStore, type Mij, type SessieApi } from "../app/stores/sessie";

const MIJ: Mij = {
  gebruiker: { id: "u1", naam: "An Peeters", email: "an@example.test", proefGebruikt: true },
  organisaties: [
    { id: "o1", naam: "Peeters Elektro", rol: "eigenaar", toegang: { schrijven: true, reden: "uit" as const, proefEinde: null, achterstalligTot: null } },
    { id: "o2", naam: "Janssens BV", rol: "lid", toegang: { schrijven: true, reden: "uit" as const, proefEinde: null, achterstalligTot: null } },
  ],
  actieveOrganisatieId: "o1",
};

function maakApi(overschrijf: Partial<SessieApi> = {}) {
  let actief = MIJ.actieveOrganisatieId;
  const volgorde: string[] = [];
  const api: SessieApi = {
    mij: vi.fn(async () => {
      volgorde.push("mij");
      return { ...MIJ, actieveOrganisatieId: actief };
    }),
    wisselActief: vi.fn(async (id: string) => {
      volgorde.push(`wissel:${id}`);
      actief = id;
    }),
    uitloggen: vi.fn(async () => {
      volgorde.push("uitloggen");
    }),
    ...overschrijf,
  };
  return { api, volgorde };
}

function nietIngelogd(): Error & { status: number } {
  return Object.assign(new Error("Niet ingelogd"), { status: 401 });
}

beforeEach(() => {
  setActivePinia(createPinia());
});

describe("laad", () => {
  test("vult gebruiker, organisaties, de actieve organisatie en de rol", async () => {
    const { api } = maakApi();
    const store = useSessieStore();
    store.gebruikApi(api);
    expect(store.geladen).toBe(false);
    await store.laad();
    expect(store.geladen).toBe(true);
    expect(store.gebruiker).toEqual(MIJ.gebruiker);
    expect(store.organisaties).toHaveLength(2);
    expect(store.actieveOrganisatie).toEqual(MIJ.organisaties[0]);
    expect(store.rol).toBe("eigenaar");
  });

  test("een 401: niet ingelogd, zonder fout", async () => {
    const { api } = maakApi({ mij: vi.fn(async () => Promise.reject(nietIngelogd())) });
    const store = useSessieStore();
    store.gebruikApi(api);
    await store.laad();
    expect(store.geladen).toBe(true);
    expect(store.gebruiker).toBeNull();
    expect(store.organisaties).toEqual([]);
    expect(store.actieveOrganisatie).toBeNull();
    expect(store.rol).toBeNull();
  });

  test("een andere fout gaat door en laat de sessie ongeladen", async () => {
    const kapot = Object.assign(new Error("kapot"), { status: 500 });
    const { api } = maakApi({ mij: vi.fn(async () => Promise.reject(kapot)) });
    const store = useSessieStore();
    store.gebruikApi(api);
    await expect(store.laad()).rejects.toBe(kapot);
    expect(store.geladen).toBe(false);
  });

  test("faalt /api/mij na een eerdere lading (bv. net na inloggen), dan is de sessie weer ongeladen", async () => {
    const kapot = Object.assign(new Error("kapot"), { status: 500 });
    let antwoord: () => Promise<Mij> = async () => Promise.reject(nietIngelogd());
    const { api } = maakApi({ mij: vi.fn(async () => antwoord()) });
    const store = useSessieStore();
    store.gebruikApi(api);
    await store.laad();
    expect(store.geladen).toBe(true);

    // Inloggen lukte, maar /api/mij faalt: de volgende navigatie moet opnieuw laden.
    antwoord = async () => Promise.reject(kapot);
    await expect(store.laad()).rejects.toBe(kapot);
    expect(store.geladen).toBe(false);

    antwoord = async () => MIJ;
    await store.laad();
    expect(store.geladen).toBe(true);
    expect(store.gebruiker).toEqual(MIJ.gebruiker);
  });

  test("zonder actieve organisatie: geen rol", async () => {
    const { api } = maakApi({
      mij: vi.fn(async () => ({ ...MIJ, organisaties: [], actieveOrganisatieId: null })),
    });
    const store = useSessieStore();
    store.gebruikApi(api);
    await store.laad();
    expect(store.gebruiker?.id).toBe("u1");
    expect(store.actieveOrganisatie).toBeNull();
    expect(store.rol).toBeNull();
  });
});

describe("sessieInfo", () => {
  test("niet ingelogd: null; ingelogd: de actieve organisatie (of null)", async () => {
    const store = useSessieStore();
    expect(store.sessieInfo).toBeNull();
    store.gebruikApi(maakApi().api);
    await store.laad();
    expect(store.sessieInfo).toEqual({ actieveOrganisatieId: "o1" });

    const zonder = maakApi({ mij: vi.fn(async () => ({ ...MIJ, organisaties: [], actieveOrganisatieId: null })) });
    store.gebruikApi(zonder.api);
    await store.laad();
    expect(store.sessieInfo).toEqual({ actieveOrganisatieId: null });

    const uit = maakApi({ mij: vi.fn(async () => Promise.reject(nietIngelogd())) });
    store.gebruikApi(uit.api);
    await store.laad();
    expect(store.sessieInfo).toBeNull();
  });
});

describe("wissel", () => {
  test("roept voorVertrek op vóór het wisselen, en laadt daarna opnieuw", async () => {
    const { api, volgorde } = maakApi();
    const store = useSessieStore();
    store.gebruikApi(api);
    await store.laad();
    store.registreerVoorVertrek(async () => {
      volgorde.push("voorVertrek");
      return true;
    });

    expect(await store.wissel("o2")).toBe(true);
    expect(volgorde).toEqual(["mij", "voorVertrek", "wissel:o2", "mij"]);
    expect(store.actieveOrganisatie?.id).toBe("o2");
    expect(store.rol).toBe("lid");
  });

  test("stopt als voorVertrek false teruggeeft", async () => {
    const { api } = maakApi();
    const store = useSessieStore();
    store.gebruikApi(api);
    await store.laad();
    store.registreerVoorVertrek(() => false);

    expect(await store.wissel("o2")).toBe(false);
    expect(api.wisselActief).not.toHaveBeenCalled();
    expect(store.actieveOrganisatie?.id).toBe("o1");
  });

  test("naar de organisatie die al actief is: niets te doen", async () => {
    const voorVertrek = vi.fn(() => true);
    const { api } = maakApi();
    const store = useSessieStore();
    store.gebruikApi(api);
    await store.laad();
    store.registreerVoorVertrek(voorVertrek);

    expect(await store.wissel("o1")).toBe(true);
    expect(voorVertrek).not.toHaveBeenCalled();
    expect(api.wisselActief).not.toHaveBeenCalled();
  });

  test("zonder geregistreerde voorVertrek gaat het wisselen meteen door", async () => {
    const { api } = maakApi();
    const store = useSessieStore();
    store.gebruikApi(api);
    await store.laad();
    expect(await store.wissel("o2")).toBe(true);
    expect(api.wisselActief).toHaveBeenCalledWith("o2");
  });

  test("afmelden van voorVertrek herstelt de standaard; een oudere afmelding wist geen nieuwere", async () => {
    const { api } = maakApi();
    const store = useSessieStore();
    store.gebruikApi(api);
    await store.laad();
    const afmeldenOud = store.registreerVoorVertrek(() => false);
    const afmeldenNieuw = store.registreerVoorVertrek(() => false);
    afmeldenOud();
    expect(await store.wissel("o2")).toBe(false);
    afmeldenNieuw();
    expect(await store.wissel("o2")).toBe(true);
  });
});

describe("uitloggen", () => {
  test("roept voorVertrek op vóór het uitloggen en wist de sessie", async () => {
    const { api, volgorde } = maakApi();
    const store = useSessieStore();
    store.gebruikApi(api);
    await store.laad();
    store.registreerVoorVertrek(async () => {
      volgorde.push("voorVertrek");
      return true;
    });

    expect(await store.uitloggen()).toBe(true);
    expect(volgorde).toEqual(["mij", "voorVertrek", "uitloggen"]);
    expect(store.gebruiker).toBeNull();
    expect(store.organisaties).toEqual([]);
    expect(store.actieveOrganisatie).toBeNull();
    expect(store.geladen).toBe(true);
  });

  test("stopt als voorVertrek false teruggeeft", async () => {
    const { api } = maakApi();
    const store = useSessieStore();
    store.gebruikApi(api);
    await store.laad();
    store.registreerVoorVertrek(async () => false);

    expect(await store.uitloggen()).toBe(false);
    expect(api.uitloggen).not.toHaveBeenCalled();
    expect(store.gebruiker?.id).toBe("u1");
  });
});

describe("afgebroken vertrek", () => {
  test("mislukt het wisselen of uitloggen na voorVertrek, dan hoort de registratie dat", async () => {
    const kapot = Object.assign(new Error("kapot"), { status: 500 });
    const { api } = maakApi({
      wisselActief: vi.fn(async () => Promise.reject(kapot)),
      uitloggen: vi.fn(async () => Promise.reject(kapot)),
    });
    const store = useSessieStore();
    store.gebruikApi(api);
    await store.laad();
    const afgebroken = vi.fn();
    store.registreerVoorVertrek(() => true, afgebroken);

    await expect(store.wissel("o2")).rejects.toBe(kapot);
    expect(afgebroken).toHaveBeenCalledTimes(1);
    await expect(store.uitloggen()).rejects.toBe(kapot);
    expect(afgebroken).toHaveBeenCalledTimes(2);
    expect(store.gebruiker?.id).toBe("u1");
  });

  test("lukt het, of zegt voorVertrek nee, dan niet", async () => {
    const { api } = maakApi();
    const store = useSessieStore();
    store.gebruikApi(api);
    await store.laad();
    const afgebroken = vi.fn();
    const afmelden = store.registreerVoorVertrek(() => true, afgebroken);
    expect(await store.wissel("o2")).toBe(true);
    afmelden();
    store.registreerVoorVertrek(() => false, afgebroken);
    expect(await store.uitloggen()).toBe(false);
    expect(afgebroken).not.toHaveBeenCalled();
  });
});
