import { nieuwProjectDocument, type InstallatieDocument, type NodeId } from "@elentrik/model";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { TEKSTEN } from "@elentrik/render";
import { sneltoets, type Toets } from "../app/composables/sneltoetsen";
import { bewaarElders, geefProjectVrij, limietKnoppen, toonAlleenLezenBalk, verwerkVrijgave, watermerkVoor } from "../app/editor/limiet";
import type { Projecttoegang } from "../shared/abonnement";
import { uploadFoutMelding } from "../app/situatie/plan-opladen";
import { situatieSneltoets, type SituatieToets } from "../app/situatie/sneltoetsen";
import { useEditorStore } from "../app/stores/editor";

type Store = ReturnType<typeof useEditorStore>;

function startDocument(): InstallatieDocument {
  return nieuwProjectDocument({ klantNaam: "Janssens", stroomtype: "2x230V", datum: "2026-10-18" });
}

function laadNieuw(): Store {
  const store = useEditorStore();
  store.laad({ id: "p1", naam: "Woning Janssens", versie: 1, document: startDocument() });
  return store;
}

function eersteVan(store: Store, type: string): NodeId {
  const n = Object.values(store.document!.nodes).find((k) => k.type === type);
  if (!n) throw new Error(`geen ${type}`);
  return n.id;
}

/** Een kring met een contactdoos, zodat er iets te wijzigen, ongedaan te maken en te verwijderen is. */
function metContactdoos(store: Store): NodeId {
  store.voegToe({ soort: "rail-einde", nodeId: eersteVan(store, "verdeelbord") });
  store.voegToe({ soort: "kring-einde", nodeId: store.selectie[0]! });
  return store.selectie[0]!;
}

function toets(key: string, rest: Partial<Omit<Toets, "key">> = {}): Toets {
  return { key, shiftKey: false, ctrlKey: false, metaKey: false, doelIsInvoer: false, ...rest };
}

beforeEach(() => {
  setActivePinia(createPinia());
});

describe("alleenLezen in de editor-store", () => {
  test("staat standaard uit en zetAlleenLezen zet hem aan en uit", () => {
    const store = laadNieuw();
    expect(store.alleenLezen).toBe(false);
    store.zetAlleenLezen(true);
    expect(store.alleenLezen).toBe(true);
    store.zetAlleenLezen(false);
    expect(store.alleenLezen).toBe(false);
  });

  test("een toevoeg-operatie laat document, undo-stapel en teller ongewijzigd", () => {
    const store = laadNieuw();
    const voor = store.document;
    store.zetAlleenLezen(true);

    store.voegToe({ soort: "rail-einde", nodeId: eersteVan(store, "verdeelbord") });

    expect(store.document).toBe(voor);
    expect(store.terug).toHaveLength(0);
    expect(store.selectie).toEqual([]);
    expect(store.gewijzigdSindsOpslaan).toBe(0);
  });

  test("voegToeBijSelectie en een sjabloon doen niets", () => {
    const store = laadNieuw();
    store.selectie = [eersteVan(store, "verdeelbord")];
    const voor = store.document;
    store.zetAlleenLezen(true);

    store.voegToeBijSelectie();
    store.voegSjabloonToe("badkamer");

    expect(store.document).toBe(voor);
    expect(store.terug).toHaveLength(0);
    expect(store.gewijzigdSindsOpslaan).toBe(0);
  });

  test("wijzigVeld laat het document en de undo-stapel ongewijzigd", () => {
    const store = laadNieuw();
    const id = metContactdoos(store);
    const voor = store.document;
    const stappen = store.terug;
    const teller = store.gewijzigdSindsOpslaan;
    store.zetAlleenLezen(true);

    store.wijzigVeld([id], "label", "Keuken");

    expect(store.document).toBe(voor);
    expect(store.terug).toBe(stappen);
    expect(store.gewijzigdSindsOpslaan).toBe(teller);
  });

  test("ongedaanMaken en opnieuw doen niets en laten beide stapels staan", () => {
    const store = laadNieuw();
    metContactdoos(store);
    store.ongedaanMaken();
    const document = store.document;
    const terug = store.terug;
    const vooruit = store.vooruit;
    expect(vooruit).toHaveLength(1);
    store.zetAlleenLezen(true);

    store.ongedaanMaken();
    store.opnieuw();

    expect(store.document).toBe(document);
    expect(store.terug).toBe(terug);
    expect(store.vooruit).toBe(vooruit);
  });

  test("verwijderSelectie gooit niets en wijzigt niets", () => {
    const store = laadNieuw();
    const id = metContactdoos(store);
    store.selectie = [id];
    const voor = store.document;
    store.zetAlleenLezen(true);

    expect(() => store.verwijderSelectie(false)).not.toThrow();
    expect(() => store.verwijderSelectie(true)).not.toThrow();

    expect(store.document).toBe(voor);
  });

  test("afwijkingen en projectgegevens (ook de naam) doen niets", () => {
    const store = laadNieuw();
    const voor = store.document;
    const teller = store.gewijzigdSindsOpslaan;
    store.zetAlleenLezen(true);

    store.zetAfwijking("regel", eersteVan(store, "verdeelbord"), "Bewust zo ontworpen door de klant");
    store.wisAfwijking("regel", eersteVan(store, "verdeelbord"));
    store.wijzigProjectgegevens({ naam: "Andere naam", klantNaam: "Peeters" });

    expect(store.document).toBe(voor);
    expect(store.naam).toBe("Woning Janssens");
    expect(store.gewijzigdSindsOpslaan).toBe(teller);
  });

  test("pasToe zelf doet niets: geen enkele route om het document te wijzigen blijft over", () => {
    const store = laadNieuw();
    const voor = store.document;
    const resultaat = {
      doc: { ...voor!, meta: { ...voor!.meta, ean: "123" } },
      patches: [{ op: "replace" as const, path: ["meta", "ean"], value: "123" }],
      inversePatches: [{ op: "remove" as const, path: ["meta", "ean"] }],
      ids: [],
    };
    store.zetAlleenLezen(true);

    store.pasToe(resultaat);

    expect(store.document).toBe(voor);
    expect(store.terug).toHaveLength(0);
  });

  test("markeerGewijzigd telt niet: een geladen concept bereikt de autosave niet", () => {
    const store = laadNieuw();
    store.zetAlleenLezen(true);
    store.markeerGewijzigd();
    expect(store.gewijzigdSindsOpslaan).toBe(0);
  });

  test("niet-wijzigende acties werken nog: selectie, navigatie, tabblad, onderdeel", () => {
    const store = laadNieuw();
    const id = metContactdoos(store);
    store.zetAlleenLezen(true);

    store.selectie = [id];
    store.navigeer("neer");
    expect(store.selectie).toHaveLength(1);
    expect(store.selectie[0]).not.toBe(id);
    store.tabblad = "kringenlijst";
    expect(store.tabblad).toBe("kringenlijst");
    store.sluitGroep();
  });

  test("zetAlleenLezen(false) herstelt alles", () => {
    const store = laadNieuw();
    const bord = eersteVan(store, "verdeelbord");
    store.zetAlleenLezen(true);
    store.voegToe({ soort: "rail-einde", nodeId: bord });
    expect(store.terug).toHaveLength(0);

    store.zetAlleenLezen(false);
    store.voegToe({ soort: "rail-einde", nodeId: bord });
    expect(store.terug).toHaveLength(1);
    store.ongedaanMaken();
    expect(store.terug).toHaveLength(0);
    store.opnieuw();
    expect(store.terug).toHaveLength(1);
    store.wijzigProjectgegevens({ naam: "Nieuw" });
    expect(store.naam).toBe("Nieuw");
  });

  test("een volgende laad laat de alleen-lezenstand zoals de pagina hem zette", () => {
    const store = laadNieuw();
    store.zetAlleenLezen(true);
    store.laad({ id: "p2", naam: "Andere", versie: 1, document: startDocument() });
    expect(store.alleenLezen).toBe(true);
  });
});

describe("sneltoetsen in alleen-lezen", () => {
  test.each<[string, Toets]>([
    ["Delete", toets("Delete")],
    ["Shift+Delete", toets("Delete", { shiftKey: true })],
    ["Backspace", toets("Backspace")],
    ["Enter (toevoegen)", toets("Enter")],
    ["Ctrl+Z (ongedaan maken)", toets("z", { ctrlKey: true })],
    ["Ctrl+Shift+Z (opnieuw)", toets("z", { ctrlKey: true, shiftKey: true })],
    ["Ctrl+Y (opnieuw)", toets("y", { ctrlKey: true })],
    ["Ctrl+V (plakken)", toets("v", { ctrlKey: true })],
  ])("%s doet niets", (_naam, invoer) => {
    expect(sneltoets({ ...invoer, alleenLezen: true })).toBeNull();
  });

  test.each<[string, Toets]>([
    ["pijl omhoog", toets("ArrowUp")],
    ["pijl links", toets("ArrowLeft")],
    ["Escape", toets("Escape")],
  ])("%s (selectie) werkt nog", (_naam, invoer) => {
    expect(sneltoets({ ...invoer, alleenLezen: true })).not.toBeNull();
    expect(sneltoets({ ...invoer, alleenLezen: true })).toEqual(sneltoets(invoer));
  });

  test("zonder alleenLezen blijft alles zoals het was", () => {
    expect(sneltoets(toets("Delete"))).toEqual({ soort: "verwijder", heleTak: false });
    expect(sneltoets({ ...toets("Delete"), alleenLezen: false })).toEqual({ soort: "verwijder", heleTak: false });
    expect(sneltoets(toets("z", { ctrlKey: true }))).toEqual({ soort: "ongedaan" });
  });

  test("de situatie-sneltoetsen: draaien, schuiven, van het plan halen en ongedaan maken doen niets", () => {
    const basis: SituatieToets = {
      key: "r",
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      doelIsInvoer: false,
      doelIsKnop: false,
    };
    for (const wijziging of [
      { key: "r" },
      { key: "Delete" },
      { key: "ArrowLeft" },
      { key: "ArrowDown", shiftKey: true },
      { key: "z", ctrlKey: true },
      { key: "y", ctrlKey: true },
    ]) {
      expect(situatieSneltoets({ ...basis, ...wijziging, alleenLezen: true })).toBeNull();
      expect(situatieSneltoets({ ...basis, ...wijziging })).not.toBeNull();
    }
    // Escape annuleert plaatsen en meten: dat wijzigt niets.
    expect(situatieSneltoets({ ...basis, key: "Escape", alleenLezen: true })).toEqual({ soort: "annuleer" });
  });
});

describe("een plan uploaden zonder abonnement", () => {
  /** Een `$fetch`-fout zoals de editor hem krijgt: status bovenaan, de foutcode in `data.data.code`. */
  const fetchFout = (status: number, code: string) => Object.assign(new Error(`HTTP ${status}`), { status, data: { data: { code } } });

  test.each(["PROJECT_ALLEEN_LEZEN", "PROJECT_LIMIET"])("een 402 %s gaat langs de alleen-lezenafhandeling: niets meer te melden", async (code) => {
    const alleenLezen = vi.fn(async () => true);
    const fout = fetchFout(402, code);
    expect(await uploadFoutMelding(fout, alleenLezen)).toBeNull();
    expect(alleenLezen).toHaveBeenCalledWith(fout);
  });

  test("een 402 met een andere code, of een afhandeling die niets doet, blijft de algemene fout", async () => {
    const alleenLezen = vi.fn(async () => false);
    expect(await uploadFoutMelding(fetchFout(402, "ANDERE"), alleenLezen)).toBe("mislukt");
    // De oude code van de organisatie bestaat niet meer.
    expect(await uploadFoutMelding(fetchFout(402, "ABONNEMENT_VEREIST"), alleenLezen)).toBe("mislukt");
    expect(alleenLezen).not.toHaveBeenCalled();
    expect(await uploadFoutMelding(fetchFout(402, "PROJECT_ALLEEN_LEZEN"), alleenLezen)).toBe("mislukt");
  });

  test("andere fouten behouden hun eigen melding en raken de afhandeling niet", async () => {
    const alleenLezen = vi.fn(async () => true);
    expect(await uploadFoutMelding(fetchFout(413, "BESTAND_TE_GROOT"), alleenLezen)).toBe("teGroot");
    expect(await uploadFoutMelding(fetchFout(415, "X"), alleenLezen)).toBe("onbekendType");
    expect(await uploadFoutMelding(fetchFout(413, "OPSLAG_VOL"), alleenLezen)).toBe("opslagVol");
    expect(await uploadFoutMelding(new Error("netwerk"), alleenLezen)).toBe("mislukt");
    expect(alleenLezen).not.toHaveBeenCalled();
  });
});

describe("een plan uploaden in een verwijderd project", () => {
  const fetchFout = (status: number, code: string) => Object.assign(new Error(`HTTP ${status}`), { status, data: { data: { code } } });

  test("een 404 meldt het project als verwijderd: niets meer te melden", async () => {
    const alleenLezen = vi.fn(async () => true);
    const verwijderd = vi.fn();
    expect(await uploadFoutMelding(fetchFout(404, "NIET_GEVONDEN"), alleenLezen, verwijderd)).toBeNull();
    expect(verwijderd).toHaveBeenCalledTimes(1);
    expect(alleenLezen).not.toHaveBeenCalled();
  });

  test("een 404 zonder foutcode telt ook", async () => {
    const verwijderd = vi.fn();
    const fout = Object.assign(new Error("weg"), { statusCode: 404 });
    expect(await uploadFoutMelding(fout, async () => false, verwijderd)).toBeNull();
    expect(verwijderd).toHaveBeenCalledTimes(1);
  });

  test("andere fouten roepen verwijderd niet aan", async () => {
    const verwijderd = vi.fn();
    expect(await uploadFoutMelding(fetchFout(422, "X"), async () => false, verwijderd)).toBe("tePixels");
    expect(await uploadFoutMelding(fetchFout(402, "PROJECT_ALLEEN_LEZEN"), async () => false, verwijderd)).toBe("mislukt");
    expect(await uploadFoutMelding(new Error("netwerk"), async () => false, verwijderd)).toBe("mislukt");
    expect(verwijderd).not.toHaveBeenCalled();
  });
});


describe("het limietvenster en de alleen-lezenbalk", () => {
  const PRIJS = { bedrag: 1900, munt: "eur", interval: "eenmalig" as const };
  const toegang = (deel: Partial<Projecttoegang>): Projecttoegang => ({
    bewerken: true,
    limiet: false,
    watermerk: null,
    gekocht: false,
    gestempeld: false,
    ...deel,
  });

  test("een eigenaar met een projectprijs: vrijgeven en een abonnement nemen", () => {
    expect(limietKnoppen("eigenaar", PRIJS)).toEqual({ lid: false, vrijgeven: true, abonnement: true });
  });

  test("zonder projectprijs: alleen de abonnementsknop", () => {
    expect(limietKnoppen("eigenaar", null)).toEqual({ lid: false, vrijgeven: false, abonnement: true });
  });

  test("een lid: de uitleg voor een lid, zonder knoppen", () => {
    expect(limietKnoppen("lid", PRIJS)).toEqual({ lid: true, vrijgeven: false, abonnement: false });
    expect(limietKnoppen(null, PRIJS)).toEqual({ lid: true, vrijgeven: false, abonnement: false });
  });

  test("de balk alleen voor een gestempeld project dat niet bewerkbaar is", () => {
    expect(toonAlleenLezenBalk(toegang({ bewerken: false, gestempeld: true }))).toBe(true);
    expect(toonAlleenLezenBalk(toegang({ bewerken: true, gestempeld: true }))).toBe(false);
    expect(toonAlleenLezenBalk(toegang({ bewerken: false, gestempeld: false }))).toBe(false);
    expect(toonAlleenLezenBalk(null)).toBe(false);
  });

  test("het watermerk van het afdrukvoorbeeld volgt de projecttoegang, in de dossiertaal", () => {
    expect(watermerkVoor(toegang({ watermerk: "gratis" }), "nl")).toEqual({ titel: "Gratis versie", ondertitel: "Geen officieel dossier" });
    expect(watermerkVoor(toegang({ watermerk: "onderwijs" }), "nl")).toEqual({ titel: "Onderwijsversie", ondertitel: "Geen officieel dossier" });
    expect(watermerkVoor(toegang({ watermerk: "gratis" }), "fr")).toEqual(TEKSTEN.fr.watermerkGratis);
    expect(watermerkVoor(toegang({ watermerk: null }), "nl")).toBeUndefined();
    expect(watermerkVoor(null, "nl")).toBeUndefined();
  });
});

describe("een project vrijgeven", () => {
  const fout409 = (code: string) => Object.assign(new Error("409"), { status: 409, data: { data: { code } } });

  test("bewaart eerst het werk, vraagt dan Checkout en stuurt door", async () => {
    const volgorde: string[] = [];
    const uitkomst = await geefProjectVrij({
      nuOpslaan: async () => void volgorde.push("bewaren"),
      vrijgeven: async () => (volgorde.push("vrijgeven"), { url: "https://checkout.example/s1" }),
      conceptBewaard: async () => (volgorde.push("concept?"), true),
      bevestigVertrek: () => void volgorde.push("vertrek bevestigd"),
      navigeer: async (url) => void volgorde.push(`naar ${url}`),
      herlaad: async () => void volgorde.push("herladen"),
    });
    expect(uitkomst).toBe("doorgestuurd");
    expect(volgorde).toEqual([
      "bewaren",
      "vrijgeven",
      "concept?",
      "vertrek bevestigd",
      "naar https://checkout.example/s1",
    ]);
  });

  test("staat het werk niet in het concept, dan blijft de vraag bij het verlaten (geen bevestiging)", async () => {
    const bevestigVertrek = vi.fn();
    const navigeer = vi.fn();
    await geefProjectVrij({
      nuOpslaan: async () => {},
      vrijgeven: async () => ({ url: "https://checkout.example/s1" }),
      conceptBewaard: async () => false,
      bevestigVertrek,
      navigeer,
      herlaad: vi.fn(),
    });
    expect(bevestigVertrek).not.toHaveBeenCalled();
    expect(navigeer).toHaveBeenCalledWith("https://checkout.example/s1");
  });

  test("lukt de vrijgave niet, dan wordt het vertrek niet bevestigd", async () => {
    const bevestigVertrek = vi.fn();
    await expect(
      geefProjectVrij({
        nuOpslaan: async () => {},
        vrijgeven: async () => Promise.reject(fout409("VRIJGAVE_LOOPT")),
        conceptBewaard: async () => true,
        bevestigVertrek,
        navigeer: vi.fn(),
        herlaad: vi.fn(),
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(bevestigVertrek).not.toHaveBeenCalled();
  });

  test.each(["PROJECT_AL_GEKOCHT", "VRIJGEVEN_NIET_NODIG"])("409 %s: de toegang opnieuw laden, niet doorsturen", async (code) => {
    const navigeer = vi.fn();
    const herlaad = vi.fn(async () => {});
    const uitkomst = await geefProjectVrij({
      nuOpslaan: async () => {},
      vrijgeven: async () => Promise.reject(fout409(code)),
      conceptBewaard: async () => true,
      bevestigVertrek: vi.fn(),
      navigeer,
      herlaad,
    });
    expect(uitkomst).toBe("al-vrij");
    expect(herlaad).toHaveBeenCalledTimes(1);
    expect(navigeer).not.toHaveBeenCalled();
  });

  test("409 VRIJGAVE_LOOPT gaat naar de aanroeper (vertaalde fout), zonder doorsturen", async () => {
    const navigeer = vi.fn();
    const fout = fout409("VRIJGAVE_LOOPT");
    await expect(
      geefProjectVrij({
        nuOpslaan: async () => {},
        vrijgeven: async () => Promise.reject(fout),
        conceptBewaard: async () => true,
        bevestigVertrek: vi.fn(),
        navigeer,
        herlaad: vi.fn(),
      }),
    ).rejects.toBe(fout);
    expect(navigeer).not.toHaveBeenCalled();
  });
});

describe("het lokale document elders bewaren (kopie bij een conflict, nieuw project na verwijderen)", () => {
  const fout402 = (code: string) => Object.assign(new Error("402"), { status: 402, data: { data: { code } } });

  test("gelukt", async () => {
    const meldFout = vi.fn();
    expect(await bewaarElders({ actie: async () => {}, behandelWeigering: vi.fn(), meldFout })).toBe("gelukt");
    expect(meldFout).not.toHaveBeenCalled();
  });

  test("402 PROJECT_LIMIET: 'limiet', zodat de aanroeper de download van het lokale document aanbiedt", async () => {
    const fout = fout402("PROJECT_LIMIET");
    const behandelWeigering = vi.fn(async () => "limiet" as const);
    const meldFout = vi.fn();
    expect(await bewaarElders({ actie: () => Promise.reject(fout), behandelWeigering, meldFout })).toBe("limiet");
    expect(behandelWeigering).toHaveBeenCalledWith(fout);
    expect(meldFout).not.toHaveBeenCalled();
  });

  test("402 PROJECT_ALLEEN_LEZEN: behandeld, geen generieke fout", async () => {
    const meldFout = vi.fn();
    const uitkomst = await bewaarElders({
      actie: () => Promise.reject(fout402("PROJECT_ALLEEN_LEZEN")),
      behandelWeigering: async () => "alleen-lezen",
      meldFout,
    });
    expect(uitkomst).toBe("geweigerd");
    expect(meldFout).not.toHaveBeenCalled();
  });

  test("een andere fout wordt gemeld", async () => {
    const fout = new Error("stuk");
    const meldFout = vi.fn();
    const uitkomst = await bewaarElders({ actie: () => Promise.reject(fout), behandelWeigering: async () => false, meldFout });
    expect(uitkomst).toBe("fout");
    expect(meldFout).toHaveBeenCalledWith(fout);
  });
});

describe("terug uit Checkout met ?vrijgave=", () => {
  test("synchroniseert, wist de query en meldt de vrijgave", async () => {
    const volgorde: string[] = [];
    const uitkomst = await verwerkVrijgave("cs_1", {
      synchroniseer: async (sessie) => (volgorde.push(`sync ${sessie}`), { gekocht: true }),
      verwijderQuery: async () => void volgorde.push("query weg"),
    });
    expect(uitkomst).toBe("vrijgegeven");
    expect(volgorde).toEqual(["sync cs_1", "query weg"]);
  });

  test("nog niet betaald (bv. SEPA): de betaling wordt verwerkt", async () => {
    const verwijderQuery = vi.fn();
    expect(await verwerkVrijgave("cs_1", { synchroniseer: async () => ({ gekocht: false }), verwijderQuery })).toBe("verwerking");
    expect(verwijderQuery).toHaveBeenCalledTimes(1);
  });

  test("synchroniseren mislukt: de query gaat toch weg, de webhook loopt het bij", async () => {
    const verwijderQuery = vi.fn();
    expect(await verwerkVrijgave("cs_1", { synchroniseer: async () => Promise.reject(new Error("weg")), verwijderQuery })).toBe("verwerking");
    expect(verwijderQuery).toHaveBeenCalledTimes(1);
  });

  test("zonder ?vrijgave= gebeurt er niets", async () => {
    const synchroniseer = vi.fn();
    expect(await verwerkVrijgave(undefined, { synchroniseer, verwijderQuery: vi.fn() })).toBeNull();
    expect(synchroniseer).not.toHaveBeenCalled();
  });
});
