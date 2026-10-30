import "fake-indexeddb/auto";
import { nieuwProjectDocument, type InstallatieDocument } from "@elentrik/model";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { clear } from "idb-keyval";
import {
  bewaarConcept,
  nieuwsteConcept,
  wisAangebodenConcept,
  type Concept,
  type ConceptPlek,
} from "../app/composables/concepten";
import { useAutosave, waarschuwBijVerlaten, type AutosaveOpties } from "../app/composables/useAutosave";
import { ConflictFout, type Project } from "../app/composables/useProjectenApi";
import { vertrekBevestiging } from "../app/editor/aanmelding";
import { useEditorStore } from "../app/stores/editor";

const KOPIE_DOC_ID = "kopie-document-id";
const NIEUW_DOC_ID = "nieuw-document-id";
/** De ingelogde gebruiker van elk venster in deze tests. */
const GEBRUIKER = "g1";

type Store = ReturnType<typeof useEditorStore>;
type Bewaar = AutosaveOpties["bewaar"];

function startDocument(): InstallatieDocument {
  return nieuwProjectDocument({ klantNaam: "Janssens", stroomtype: "2x230V", datum: "2026-10-18" });
}

/** Wacht een paar echte macrotaken af, zodat fake-indexeddb zijn werk kan afmaken. */
async function leeg(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await new Promise<void>((klaar) => setImmediate(klaar));
    await nextTick();
  }
}

/** Het concept dat bij het openen van het project wordt aangeboden. */
async function conceptVan(projectId: string): Promise<Concept | undefined> {
  return (await nieuwsteConcept(projectId, GEBRUIKER))?.concept;
}

/** Een wijziging die de teller verhoogt: de projectnaam. */
function wijzig(store: Store, naam: string): void {
  store.wijzigProjectgegevens({ naam });
}

function opzet(overschrijf: Partial<AutosaveOpties> = {}) {
  const store = useEditorStore();
  store.laad({ id: "p1", naam: "Woning Janssens", versie: 1, document: startDocument() });
  const bewaar = vi.fn<Bewaar>(async (_id, versie) => ({ versie: versie + 1 }));
  const haal = vi.fn(async (id: string): Promise<Project> => ({
    id,
    organisatieId: "org-1",
    naam: "Van de server",
    klantnaam: "Janssens",
    gewijzigd: "2026-10-18T10:00:00.000Z",
    // Het dubbel op de server heeft zijn eigen document-id.
    document: id === "kopie1" ? { ...startDocument(), id: KOPIE_DOC_ID } : startDocument(),
    versie: 7,
  }));
  const dupliceer = vi.fn<AutosaveOpties["dupliceer"]>(async (_id, _bestandIds) => ({ id: "kopie1" }));
  const naarProject = vi.fn(async (_id: string) => {});
  const maakNieuw = vi.fn<AutosaveOpties["maakNieuw"]>(async () => ({
    id: "nieuw1",
    versie: 1,
    documentId: NIEUW_DOC_ID,
    bestandIds: {},
  }));
  const autosave = useAutosave({
    store,
    bewaar,
    haal,
    dupliceer,
    maakNieuw,
    naarProject,
    gebruikerId: GEBRUIKER,
    ...overschrijf,
  });
  return { store, bewaar, haal, dupliceer, maakNieuw, naarProject, autosave };
}

beforeEach(async () => {
  setActivePinia(createPinia());
  // Alleen setTimeout en Date: fake-indexeddb heeft het echte setImmediate nodig.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  await clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useAutosave", () => {
  test("drie snelle wijzigingen geven precies één bewaar, 2000 ms na de laatste", async () => {
    const { store, bewaar } = opzet();
    wijzig(store, "a");
    await vi.advanceTimersByTimeAsync(1000);
    wijzig(store, "b");
    await vi.advanceTimersByTimeAsync(1000);
    wijzig(store, "c");
    await vi.advanceTimersByTimeAsync(1999);
    expect(bewaar).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await leeg();
    expect(bewaar).toHaveBeenCalledTimes(1);
    expect(bewaar).toHaveBeenCalledWith("p1", 1, { naam: "c", document: store.document });
  });

  test("een wijziging bewaart meteen een concept; na het opslaan is het concept weg", async () => {
    const { store, autosave } = opzet();
    wijzig(store, "a");
    await nextTick();
    await leeg();
    const concept = await conceptVan("p1");
    expect(concept).toMatchObject({ naam: "a", versie: 1, tijd: Date.now() });
    expect(concept?.document).toEqual(store.document);
    expect(autosave.status.value).toBe("bezig");

    await vi.advanceTimersByTimeAsync(2000);
    await leeg();
    expect(await conceptVan("p1")).toBeUndefined();
    expect(autosave.status.value).toBe("opgeslagen");
    expect(store.versie).toBe(2);
  });

  test("een 409 zet de status op conflict en daarna volgt geen tweede bewaar", async () => {
    const { store, bewaar, autosave } = opzet();
    bewaar.mockRejectedValue(new ConflictFout(5));
    wijzig(store, "a");
    await vi.advanceTimersByTimeAsync(2000);
    await leeg();
    expect(autosave.status.value).toBe("conflict");
    expect(autosave.conflict.value).toEqual({ huidigeVersie: 5, lokaleWijzigingen: true });

    wijzig(store, "b");
    await vi.advanceTimersByTimeAsync(60_000);
    await leeg();
    expect(bewaar).toHaveBeenCalledTimes(1);
    expect(store.versie).toBe(1);
    // Het lokale werk blijft in het concept staan.
    expect((await conceptVan("p1"))?.naam).toBe("b");
  });

  test("meldConflict (een 409 bij het exporteren) zet het conflict zonder bewaar; laadServerversie lost het op", async () => {
    const { store, bewaar, autosave } = opzet();
    autosave.meldConflict(7);
    expect(autosave.status.value).toBe("conflict");
    expect(autosave.conflict.value).toEqual({ huidigeVersie: 7, lokaleWijzigingen: false });

    // Zolang het conflict loopt, gaat er niets naar de server.
    wijzig(store, "a");
    await vi.advanceTimersByTimeAsync(60_000);
    await leeg();
    expect(bewaar).not.toHaveBeenCalled();

    await autosave.laadServerversie();
    expect(store.versie).toBe(7);
    expect(autosave.status.value).toBe("opgeslagen");
    expect(autosave.conflict.value).toBeNull();
  });

  test("meldConflict zonder lokale wijzigingen: pas bij een wijziging erna zijn er lokale wijzigingen", async () => {
    const { store, autosave } = opzet();
    autosave.meldConflict(7);
    expect(autosave.conflict.value?.lokaleWijzigingen).toBe(false);
    wijzig(store, "a");
    await nextTick();
    expect(autosave.conflict.value).toEqual({ huidigeVersie: 7, lokaleWijzigingen: true });
  });

  test("meldConflict met onbewaarde wijzigingen: lokale wijzigingen", async () => {
    const { store, autosave } = opzet();
    // Zonder te wachten op de autosave: de wijziging is nog niet op de server.
    wijzig(store, "a");
    await nextTick();
    autosave.meldConflict(7);
    expect(autosave.conflict.value).toEqual({ huidigeVersie: 7, lokaleWijzigingen: true });
  });

  test("een netwerkfout geeft status lokaal; na 10 s volgt een nieuwe poging", async () => {
    const { store, bewaar, autosave } = opzet();
    bewaar.mockRejectedValueOnce(new TypeError("netwerk"));
    wijzig(store, "a");
    await vi.advanceTimersByTimeAsync(2000);
    await leeg();
    expect(autosave.status.value).toBe("lokaal");
    expect(autosave.conflict.value).toBeNull();
    expect(bewaar).toHaveBeenCalledTimes(1);
    expect((await conceptVan("p1"))?.naam).toBe("a");

    await vi.advanceTimersByTimeAsync(9999);
    expect(bewaar).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await leeg();
    expect(bewaar).toHaveBeenCalledTimes(2);
    expect(autosave.status.value).toBe("opgeslagen");
    expect(await conceptVan("p1")).toBeUndefined();
  });

  test("een wijziging tijdens een bewaar geeft nooit twee gelijktijdige bewaars en bewaart daarna opnieuw", async () => {
    let lopend = 0;
    let maxLopend = 0;
    let rond: (() => void) | undefined;
    const { store, bewaar, autosave } = opzet();
    bewaar.mockImplementation(async (_id, versie) => {
      lopend++;
      maxLopend = Math.max(maxLopend, lopend);
      await new Promise<void>((klaar) => {
        rond = klaar;
      });
      lopend--;
      return { versie: versie + 1 };
    });

    wijzig(store, "a");
    await vi.advanceTimersByTimeAsync(2000);
    expect(bewaar).toHaveBeenCalledTimes(1);

    // Tijdens het bewaar: nog een wijziging, ook na meer dan 2000 ms.
    wijzig(store, "b");
    await vi.advanceTimersByTimeAsync(5000);
    await leeg();
    expect(bewaar).toHaveBeenCalledTimes(1);

    rond?.();
    await leeg();
    // Het concept met "b" mag niet gewist zijn.
    expect((await conceptVan("p1"))?.naam).toBe("b");
    expect(store.versie).toBe(2);
    expect(autosave.status.value).toBe("bezig");
    expect(bewaar).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1999);
    expect(bewaar).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(bewaar).toHaveBeenCalledTimes(2);
    expect(bewaar).toHaveBeenLastCalledWith("p1", 2, { naam: "b", document: store.document });
    rond?.();
    await leeg();
    expect(maxLopend).toBe(1);
    expect(autosave.status.value).toBe("opgeslagen");
    expect(await conceptVan("p1")).toBeUndefined();
  });

  test("crash na een bewaar met een wijziging erna: het concept heeft die wijziging en de nieuwe versie", async () => {
    let rond: (() => void) | undefined;
    const { store, bewaar } = opzet();
    bewaar.mockImplementationOnce(async (_id, versie) => {
      await new Promise<void>((klaar) => {
        rond = klaar;
      });
      return { versie: versie + 1 };
    });
    wijzig(store, "a");
    await vi.advanceTimersByTimeAsync(2000);
    expect(bewaar).toHaveBeenCalledTimes(1);
    // Een wijziging terwijl de PUT onderweg is; de server bewaart "a" iets later.
    wijzig(store, "b");
    await nextTick();
    await leeg();
    await vi.advanceTimersByTimeAsync(1);
    rond?.();
    await leeg();
    const lokaal = store.document;

    // Crash: een nieuw venster opent het project (versie 2 op de server) en vindt het concept,
    // al is het vroeger bewaard dan de laatste serverwijziging.
    setActivePinia(createPinia());
    const concept = await conceptVan("p1");
    expect(concept).toMatchObject({ naam: "b", versie: 2 });
    expect(concept?.document).toEqual(lokaal);

    // Het concept laden en bewaren geeft geen conflict met de eigen, al bewaarde wijziging.
    const nieuw = opzet();
    nieuw.store.laad({ id: "p1", naam: concept!.naam, versie: concept!.versie, document: concept!.document });
    nieuw.store.markeerGewijzigd();
    await vi.advanceTimersByTimeAsync(2000);
    await leeg();
    expect(nieuw.bewaar).toHaveBeenCalledWith("p1", 2, expect.objectContaining({ naam: "b" }));
  });

  test("twee vensters op één project: A wist bij het opslaan niet het concept van B in conflict", async () => {
    // Twee vensters, elk met een eigen store en een eigen server-aanroep.
    const a = opzet({ instantieId: "A" });
    setActivePinia(createPinia());
    const b = opzet({ instantieId: "B" });
    b.bewaar.mockRejectedValue(new ConflictFout(2));

    wijzig(b.store, "Werk van B");
    await vi.advanceTimersByTimeAsync(2000);
    await leeg();
    expect(b.autosave.status.value).toBe("conflict");

    wijzig(a.store, "Werk van A");
    await vi.advanceTimersByTimeAsync(2000);
    await leeg();
    expect(a.autosave.status.value).toBe("opgeslagen");

    // B opent het project opnieuw: zijn concept staat er nog en wordt aangeboden.
    b.autosave.stop();
    await leeg();
    expect(await nieuwsteConcept("p1", GEBRUIKER)).toMatchObject({
      sleutel: `concept:u:${GEBRUIKER}:p1:B`,
      concept: { naam: "Werk van B" },
    });
  });

  test("nuOpslaan bewaart meteen", async () => {
    const { store, bewaar, autosave } = opzet();
    wijzig(store, "a");
    await autosave.nuOpslaan();
    expect(bewaar).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(bewaar).toHaveBeenCalledTimes(1);
    expect(autosave.status.value).toBe("opgeslagen");
  });

  test("laadServerversie laadt de serverversie in de store en wist het concept", async () => {
    const { store, bewaar, haal, autosave } = opzet();
    bewaar.mockRejectedValue(new ConflictFout(7));
    wijzig(store, "a");
    await vi.advanceTimersByTimeAsync(2000);
    await leeg();
    expect(autosave.status.value).toBe("conflict");

    await autosave.laadServerversie();
    expect(haal).toHaveBeenCalledWith("p1");
    expect(store.naam).toBe("Van de server");
    expect(store.versie).toBe(7);
    expect(await conceptVan("p1")).toBeUndefined();
    expect(autosave.status.value).toBe("opgeslagen");
    expect(autosave.conflict.value).toBeNull();

    // Autosave werkt daarna weer.
    bewaar.mockImplementation(async (_id, versie) => ({ versie: versie + 1 }));
    wijzig(store, "b");
    await vi.advanceTimersByTimeAsync(2000);
    await leeg();
    expect(bewaar).toHaveBeenCalledTimes(2);
    expect(bewaar).toHaveBeenLastCalledWith("p1", 7, expect.objectContaining({ naam: "b" }));
  });

  test("bewaarAlsKopie dupliceert, bewaart het lokale document in de kopie en navigeert", async () => {
    const { store, bewaar, haal, dupliceer, naarProject, autosave } = opzet();
    bewaar.mockRejectedValueOnce(new ConflictFout(5));
    wijzig(store, "Lokaal");
    const lokaalDocument = store.document;
    await vi.advanceTimersByTimeAsync(2000);
    await leeg();
    expect(autosave.status.value).toBe("conflict");

    await autosave.bewaarAlsKopie();
    expect(dupliceer).toHaveBeenCalledWith("p1", []);
    // Met lokale wijzigingen gaat het om die van de gebruiker: de serverversie wordt niet geladen.
    expect(haal).not.toHaveBeenCalledWith("p1");
    // De kopie krijgt het document-id van de kopie, niet dat van het origineel.
    expect(bewaar).toHaveBeenLastCalledWith("kopie1", 1, {
      naam: "Lokaal (kopie)",
      document: { ...lokaalDocument, id: KOPIE_DOC_ID },
    });
    expect(lokaalDocument?.id).not.toBe(KOPIE_DOC_ID);
    expect(await conceptVan("p1")).toBeUndefined();
    expect(naarProject).toHaveBeenCalledWith("kopie1");
  });

  test("bewaarAlsKopie na een exportconflict zonder lokale wijzigingen: alleen dupliceren, niets overschrijven, navigeren", async () => {
    const { store, bewaar, haal, dupliceer, naarProject, autosave } = opzet();
    const voor = store.document;
    autosave.meldConflict(7);

    await autosave.bewaarAlsKopie();
    // Het duplicaat op de server is al de actuele versie, met eigen planbestanden.
    expect(dupliceer).toHaveBeenCalledTimes(1);
    expect(dupliceer).toHaveBeenCalledWith("p1");
    expect(haal).not.toHaveBeenCalled();
    expect(bewaar).not.toHaveBeenCalled();
    expect(store.document).toBe(voor);
    expect(await conceptVan("p1")).toBeUndefined();
    expect(naarProject).toHaveBeenCalledWith("kopie1");
  });

  test("bewaarAlsKopie zonder lokale wijzigingen, maar met een wijziging tijdens het dupliceren: die gaat mee naar de kopie", async () => {
    const { store, bewaar, dupliceer, naarProject, autosave } = opzet();
    autosave.meldConflict(7);
    dupliceer.mockImplementationOnce(async () => {
      wijzig(store, "Net veranderd");
      return { id: "kopie1" };
    });

    await autosave.bewaarAlsKopie();
    expect(bewaar).toHaveBeenCalledTimes(1);
    expect(bewaar).toHaveBeenLastCalledWith("kopie1", 1, expect.objectContaining({ naam: "Net veranderd (kopie)" }));
    expect(naarProject).toHaveBeenCalledWith("kopie1");
  });

  describe("planbestanden in de kopie", () => {
    function metPlan(document: InstallatieDocument, origineel: string, raster: string): InstallatieDocument {
      return {
        ...document,
        situatie: {
          ...document.situatie,
          paginas: [
            {
              id: "pg",
              titel: "Gelijkvloers",
              plaatsingen: [],
              achtergrond: { origineelBestandId: origineel, rasterBestandId: raster, breedte_px: 1, hoogte_px: 1 },
            },
          ],
        },
      };
    }
    const plannen = (document: InstallatieDocument | null) =>
      document?.situatie.paginas.map((p) => [p.achtergrond?.origineelBestandId, p.achtergrond?.rasterBestandId]);

    async function opzetMetPlan() {
      const o = opzet();
      o.store.laad({ id: "p1", naam: "Woning Janssens", versie: 1, document: metPlan(startDocument(), "oud-o", "oud-r") });
      o.dupliceer.mockImplementation(async () => ({ id: "kopie1", bestandIds: { "oud-o": "nieuw-o", "oud-r": "nieuw-r" } }));
      o.bewaar.mockRejectedValueOnce(new ConflictFout(5));
      wijzig(o.store, "Lokaal");
      await vi.advanceTimersByTimeAsync(2000);
      await leeg();
      expect(o.autosave.status.value).toBe("conflict");
      return o;
    }

    test("de server krijgt de planbestanden van het lokale document en de kopie bewaart de nieuwe id's", async () => {
      const { store, bewaar, dupliceer, autosave } = await opzetMetPlan();
      await autosave.bewaarAlsKopie();
      expect(dupliceer).toHaveBeenCalledWith("p1", ["oud-o", "oud-r"]);
      const invoer = bewaar.mock.lastCall?.[2];
      expect(bewaar.mock.lastCall?.[0]).toBe("kopie1");
      expect(plannen(invoer?.document as InstallatieDocument)).toEqual([["nieuw-o", "nieuw-r"]]);
      // Het document van de editor zelf blijft ongemoeid.
      expect(plannen(store.document)).toEqual([["oud-o", "oud-r"]]);
    });

    test("ook bij een wijziging tijdens het kopiëren hebben alle bewaringen de nieuwe id's", async () => {
      const { store, bewaar, autosave } = await opzetMetPlan();
      bewaar.mockImplementation(async (id, versie) => {
        if (id === "kopie1" && versie === 1) wijzig(store, "Nog nieuwer");
        return { versie: versie + 1 };
      });
      await autosave.bewaarAlsKopie();
      const kopieBewaringen = bewaar.mock.calls.filter(([id]) => id === "kopie1");
      expect(kopieBewaringen).toHaveLength(2);
      for (const [, , invoer] of kopieBewaringen) {
        expect(plannen(invoer.document as InstallatieDocument)).toEqual([["nieuw-o", "nieuw-r"]]);
      }
    });

    test("een id zonder toewijzing blijft staan", async () => {
      const { bewaar, dupliceer, autosave } = await opzetMetPlan();
      dupliceer.mockImplementation(async () => ({ id: "kopie1", bestandIds: { "oud-o": "nieuw-o" } }));
      await autosave.bewaarAlsKopie();
      expect(plannen(bewaar.mock.lastCall?.[2].document as InstallatieDocument)).toEqual([["nieuw-o", "oud-r"]]);
    });
  });

  test("bewaarAlsKopie: een wijziging tijdens het kopiëren gaat ook naar de kopie en het concept wordt pas daarna gewist", async () => {
    const { store, bewaar, naarProject, autosave } = opzet();
    bewaar.mockRejectedValueOnce(new ConflictFout(5));
    wijzig(store, "Lokaal");
    await vi.advanceTimersByTimeAsync(2000);
    await leeg();

    bewaar.mockImplementation(async (id, versie) => {
      if (id === "kopie1" && versie === 1) wijzig(store, "Nog nieuwer");
      return { versie: versie + 1 };
    });
    await autosave.bewaarAlsKopie();
    await leeg();
    expect(bewaar).toHaveBeenCalledTimes(3);
    expect(bewaar).toHaveBeenLastCalledWith("kopie1", 2, expect.objectContaining({ naam: "Nog nieuwer (kopie)" }));
    expect(await conceptVan("p1")).toBeUndefined();
    expect(naarProject).toHaveBeenCalledWith("kopie1");
  });

  test("bewaarAlsKopie wacht op een lopend bewaar en herstelt bij een fout de debounce", async () => {
    let rond: (() => void) | undefined;
    const { store, bewaar, dupliceer, autosave } = opzet();
    bewaar.mockImplementationOnce(async (_id, versie) => {
      await new Promise<void>((klaar) => {
        rond = klaar;
      });
      return { versie: versie + 1 };
    });
    wijzig(store, "a");
    await vi.advanceTimersByTimeAsync(2000);
    expect(bewaar).toHaveBeenCalledTimes(1);

    dupliceer.mockRejectedValueOnce(new TypeError("netwerk"));
    const kopie = autosave.bewaarAlsKopie();
    kopie.catch(() => {});
    await leeg();
    expect(dupliceer).not.toHaveBeenCalled();
    wijzig(store, "b");
    rond?.();
    await expect(kopie).rejects.toThrow("netwerk");
    await leeg();
    expect(dupliceer).toHaveBeenCalledTimes(1);
    // De debounce staat weer aan, dus de wijziging "b" gaat alsnog naar de server.
    await vi.advanceTimersByTimeAsync(2000);
    await leeg();
    expect(bewaar).toHaveBeenCalledTimes(2);
    expect(bewaar).toHaveBeenLastCalledWith("p1", 2, expect.objectContaining({ naam: "b" }));
  });

  test("stop ruimt de watcher en de timers op", async () => {
    const { store, bewaar, autosave } = opzet();
    wijzig(store, "a");
    await vi.advanceTimersByTimeAsync(2000);
    await leeg();
    expect(bewaar).toHaveBeenCalledTimes(1);
    autosave.stop();
    wijzig(store, "b");
    await vi.advanceTimersByTimeAsync(20_000);
    await leeg();
    expect(bewaar).toHaveBeenCalledTimes(1);
  });

  test("stop bewaart onbewaarde wijzigingen nog meteen", async () => {
    const { store, bewaar, autosave } = opzet();
    wijzig(store, "a");
    await nextTick();
    autosave.stop();
    await leeg();
    expect(bewaar).toHaveBeenCalledTimes(1);
    expect(bewaar).toHaveBeenCalledWith("p1", 1, expect.objectContaining({ naam: "a" }));
  });

  test("stop bewaart niet bij een conflict", async () => {
    const { store, bewaar, autosave } = opzet();
    bewaar.mockRejectedValue(new ConflictFout(5));
    wijzig(store, "a");
    await vi.advanceTimersByTimeAsync(2000);
    await leeg();
    wijzig(store, "b");
    await nextTick();
    autosave.stop();
    await leeg();
    expect(bewaar).toHaveBeenCalledTimes(1);
    // Het concept blijft staan voor het volgende openen.
    expect((await conceptVan("p1"))?.naam).toBe("b");
  });

  test("stop bij een fout laat het concept staan", async () => {
    const { store, bewaar, autosave } = opzet();
    bewaar.mockRejectedValue(Object.assign(new Error("geweigerd"), { statusCode: 422 }));
    wijzig(store, "a");
    await vi.advanceTimersByTimeAsync(2000);
    await leeg();
    expect(autosave.status.value).toBe("fout");
    autosave.stop();
    await vi.advanceTimersByTimeAsync(20_000);
    await leeg();
    expect(bewaar).toHaveBeenCalledTimes(1);
    expect((await conceptVan("p1"))?.naam).toBe("a");
  });

  test("stop bewaart nooit in een ander project dat intussen geladen werd", async () => {
    let rond: (() => void) | undefined;
    const { store, bewaar, autosave } = opzet();
    bewaar.mockImplementationOnce(async (_id, versie) => {
      await new Promise<void>((klaar) => {
        rond = klaar;
      });
      return { versie: versie + 1 };
    });
    wijzig(store, "a");
    await vi.advanceTimersByTimeAsync(2000);
    expect(bewaar).toHaveBeenCalledTimes(1);
    // Een wijziging tijdens het bewaar, dan weg van de pagina: stop wil die nog bewaren.
    wijzig(store, "b");
    await nextTick();
    autosave.stop();
    // Intussen opent de volgende pagina een ander project en wijzigt het.
    store.laad({ id: "p2", naam: "Ander project", versie: 3, document: startDocument() });
    wijzig(store, "c");
    rond?.();
    await leeg();
    await vi.advanceTimersByTimeAsync(20_000);
    await leeg();
    expect(bewaar.mock.calls.map(([id]) => id)).toEqual(["p1"]);
  });

  test("een oud venster schrijft niets meer nadat hetzelfde project opnieuw geladen werd", async () => {
    let rond: (() => void) | undefined;
    const { store, bewaar, haal, dupliceer, naarProject, autosave } = opzet();
    bewaar.mockImplementationOnce(async (_id, versie) => {
      await new Promise<void>((klaar) => {
        rond = klaar;
      });
      return { versie: versie + 1 };
    });
    wijzig(store, "a");
    await vi.advanceTimersByTimeAsync(2000);
    expect(bewaar).toHaveBeenCalledTimes(1);
    // Een wijziging tijdens het bewaar, dan weg van de pagina: stop wil die nog bewaren.
    wijzig(store, "b");
    await nextTick();
    autosave.stop();
    // De volgende pagina opent hetzelfde project opnieuw, vers van de server.
    store.laad({ id: "p1", naam: "Van de server", versie: 5, document: startDocument() });
    const nieuw = useAutosave({
      store,
      bewaar,
      haal,
      dupliceer,
      maakNieuw: async () => ({ id: "nieuw1", versie: 1, documentId: NIEUW_DOC_ID, bestandIds: {} }),
      naarProject,
      gebruikerId: GEBRUIKER,
    });
    rond?.();
    await leeg();
    await vi.advanceTimersByTimeAsync(20_000);
    await leeg();
    expect(store.versie).toBe(5);
    expect(bewaar).toHaveBeenCalledTimes(1);
    expect(nieuw.status.value).toBe("opgeslagen");
    nieuw.stop();
  });

  test("laadServerversie: een wijziging tijdens het wissen van het concept wordt bewaard", async () => {
    let wisKlaar: (() => void) | undefined;
    const concepten = {
      bewaarConcept: vi.fn(async () => {}),
      wisConcept: vi.fn(
        () =>
          new Promise<void>((klaar) => {
            wisKlaar = klaar;
          }),
      ),
    };
    const { store, bewaar, autosave } = opzet({ concepten });
    bewaar.mockRejectedValueOnce(new ConflictFout(7));
    wijzig(store, "a");
    await vi.advanceTimersByTimeAsync(2000);
    await leeg();
    expect(autosave.status.value).toBe("conflict");

    const laden = autosave.laadServerversie();
    await leeg();
    expect(wisKlaar).toBeDefined();
    // De status staat al goed terwijl het concept nog gewist wordt.
    expect(autosave.status.value).toBe("opgeslagen");
    expect(autosave.conflict.value).toBeNull();
    wijzig(store, "b");
    await nextTick();
    wisKlaar?.();
    await laden;
    await vi.advanceTimersByTimeAsync(2000);
    await leeg();
    expect(bewaar).toHaveBeenCalledTimes(2);
    expect(bewaar).toHaveBeenLastCalledWith("p1", 7, expect.objectContaining({ naam: "b" }));
    expect(autosave.status.value).toBe("opgeslagen");
  });

  test("een wijziging tijdens het wissen van het concept na een geslaagd bewaar wordt alsnog bewaard", async () => {
    const { store, bewaar, autosave } = opzet();
    let eerste = true;
    bewaar.mockImplementation(async (_id, versie) => {
      if (eerste) {
        eerste = false;
        // Valt midden in het wissen van het concept, nadat het bewaar klaar is.
        setImmediate(() => wijzig(store, "b"));
      }
      return { versie: versie + 1 };
    });
    wijzig(store, "a");
    await vi.advanceTimersByTimeAsync(2000);
    await leeg();
    expect(bewaar).toHaveBeenCalledTimes(1);
    expect(autosave.status.value).toBe("bezig");

    await vi.advanceTimersByTimeAsync(2000);
    await leeg();
    expect(bewaar).toHaveBeenCalledTimes(2);
    expect(bewaar).toHaveBeenLastCalledWith("p1", 2, expect.objectContaining({ naam: "b" }));
    expect(autosave.status.value).toBe("opgeslagen");
    expect(await conceptVan("p1")).toBeUndefined();
  });
});

describe("useAutosave: conceptschrijfacties", () => {
  /** Een conceptarchief in het geheugen waarvan elke schrijfactie wacht tot `laatDoor()`. */
  function trageConcepten() {
    const archief = new Map<string, Concept>();
    const wachtend: (() => void)[] = [];
    const volgorde: string[] = [];
    const concepten = {
      bewaarConcept: vi.fn(async ({ projectId, instantieId }: ConceptPlek, concept: Concept) => {
        await new Promise<void>((klaar) => wachtend.push(klaar));
        archief.set(`${projectId}:${instantieId}`, concept);
        volgorde.push(`bewaar ${concept.naam}`);
      }),
      wisConcept: vi.fn(async ({ projectId, instantieId }: ConceptPlek) => {
        archief.delete(`${projectId}:${instantieId}`);
        volgorde.push("wis");
      }),
    };
    async function laatDoor(): Promise<void> {
      while (wachtend.length > 0) {
        wachtend.shift()?.();
        await leeg();
      }
    }
    return { archief, volgorde, concepten, laatDoor };
  }

  test("wijzigingen terwijl een schrijfactie loopt, geven samen één schrijfactie met het nieuwste document", async () => {
    const { archief, concepten, laatDoor } = trageConcepten();
    const { store } = opzet({ concepten, instantieId: "A" });
    wijzig(store, "a");
    await leeg();
    expect(concepten.bewaarConcept).toHaveBeenCalledTimes(1);
    for (const naam of ["b", "c", "d"]) {
      wijzig(store, naam);
      await leeg();
    }
    await laatDoor();
    expect(concepten.bewaarConcept).toHaveBeenCalledTimes(2);
    expect(concepten.bewaarConcept).toHaveBeenLastCalledWith(
      { gebruikerId: GEBRUIKER, projectId: "p1", instantieId: "A" },
      expect.objectContaining({ naam: "d" }),
    );
    expect(archief.get("p1:A")?.naam).toBe("d");
  });

  test("een wis haalt nooit een schrijfactie in, en een latere wijziging komt na de wis", async () => {
    const { archief, volgorde, concepten, laatDoor } = trageConcepten();
    const { store, autosave } = opzet({ concepten, instantieId: "A" });
    wijzig(store, "a");
    await leeg();
    // "b" wacht achter de lopende schrijfactie van "a".
    wijzig(store, "b");
    await leeg();
    // Het bewaar van "b" slaagt: de wis komt achter de schrijfactie van "b".
    await vi.advanceTimersByTimeAsync(2000);
    await leeg();
    expect(autosave.status.value).toBe("opgeslagen");
    // Een nieuwe wijziging na de wis mag niet in de schrijfactie van vóór de wis belanden.
    wijzig(store, "c");
    await leeg();
    await laatDoor();
    expect(volgorde).toEqual(["bewaar a", "bewaar b", "wis", "bewaar c"]);
    expect(archief.get("p1:A")?.naam).toBe("c");
  });
});

describe("useAutosave: wachtOpConcept", () => {
  test("wacht op een schrijfactie die na een wijziging volgt", async () => {
    let klaar: (() => void) | undefined;
    const concepten = {
      bewaarConcept: vi.fn(
        () =>
          new Promise<void>((k) => {
            klaar = k;
          }),
      ),
      wisConcept: vi.fn(async () => {}),
    };
    const { store, autosave } = opzet({ concepten });
    let gewacht = false;
    store.markeerGewijzigd();
    const wachten = autosave.wachtOpConcept().then(() => {
      gewacht = true;
    });
    await leeg();
    expect(concepten.bewaarConcept).toHaveBeenCalledTimes(1);
    expect(gewacht).toBe(false);
    klaar?.();
    await wachten;
    expect(gewacht).toBe(true);
  });

  test("geeft true als de eigen schrijfactie lukte", async () => {
    const { store, autosave } = opzet();
    store.markeerGewijzigd();
    expect(await autosave.wachtOpConcept()).toBe(true);
  });

  test("concept laden met een vol archief: false, en het aangeboden concept blijft staan", async () => {
    // Het concept van een vorig venster, aangeboden bij het openen.
    await bewaarConcept(
      { gebruikerId: GEBRUIKER, projectId: "p1", instantieId: "oud" },
      { document: startDocument(), versie: 1, naam: "Oud werk", tijd: 100 },
    );
    const aangeboden = (await nieuwsteConcept("p1", GEBRUIKER))!;
    // In dit venster faalt elke schrijfactie (quota), maar wissen lukt wel.
    const concepten = {
      bewaarConcept: vi.fn(async () => {
        throw new DOMException("vol", "QuotaExceededError");
      }),
      wisConcept: vi.fn(async () => {}),
    };
    const { store, autosave } = opzet({ concepten, instantieId: "nieuw" });
    // Zoals de pagina: laden, als wijziging tellen, en pas na een geslaagde eigen schrijf wissen.
    store.laad({ id: "p1", naam: aangeboden.concept.naam, versie: 1, document: aangeboden.concept.document });
    store.markeerGewijzigd();
    const gelukt = await autosave.wachtOpConcept();
    expect(gelukt).toBe(false);
    if (gelukt) await wisAangebodenConcept(aangeboden);
    expect(await nieuwsteConcept("p1", GEBRUIKER)).toMatchObject({
      sleutel: `concept:u:${GEBRUIKER}:p1:oud`,
      concept: { naam: "Oud werk" },
    });
  });
});

describe("useAutosave: foutsoorten", () => {
  test("netwerkfout met een kapot conceptarchief geeft status onbewaard", async () => {
    const concepten = {
      bewaarConcept: vi.fn(async () => {
        throw new Error("IndexedDB kapot");
      }),
      wisConcept: vi.fn(async () => {}),
    };
    const { store, bewaar, autosave } = opzet({ concepten });
    bewaar.mockRejectedValueOnce(new TypeError("netwerk"));
    wijzig(store, "a");
    await vi.advanceTimersByTimeAsync(2000);
    await leeg();
    expect(autosave.status.value).toBe("onbewaard");

    // Het herstel na 10 s lukt en zet alles weer op opgeslagen.
    await vi.advanceTimersByTimeAsync(10_000);
    await leeg();
    expect(bewaar).toHaveBeenCalledTimes(2);
    expect(autosave.status.value).toBe("opgeslagen");
  });

  test("een kapot conceptarchief bij een lopende offline-status zet lokaal om in onbewaard", async () => {
    let kapot = false;
    const concepten = {
      bewaarConcept: vi.fn(async () => {
        if (kapot) throw new Error("IndexedDB kapot");
      }),
      wisConcept: vi.fn(async () => {}),
    };
    const { store, bewaar, autosave } = opzet({ concepten });
    bewaar.mockRejectedValue(new TypeError("netwerk"));
    wijzig(store, "a");
    await vi.advanceTimersByTimeAsync(2000);
    await leeg();
    expect(autosave.status.value).toBe("lokaal");
    kapot = true;
    wijzig(store, "b");
    await leeg();
    expect(autosave.status.value).toBe("onbewaard");
  });

  test("een 422 zet de status op fout, zonder nieuwe poging of autosave", async () => {
    const code = 422;
    const { store, bewaar, autosave } = opzet();
    bewaar.mockRejectedValue(Object.assign(new Error("geweigerd"), { statusCode: code }));
    wijzig(store, "a");
    await vi.advanceTimersByTimeAsync(2000);
    await leeg();
    expect(autosave.status.value).toBe("fout");
    expect(autosave.fout.value).toEqual({ status: code });

    await vi.advanceTimersByTimeAsync(60_000);
    wijzig(store, "b");
    await vi.advanceTimersByTimeAsync(60_000);
    await leeg();
    expect(bewaar).toHaveBeenCalledTimes(1);
    expect(autosave.status.value).toBe("fout");
    // Het concept blijft intussen bijgewerkt.
    expect((await conceptVan("p1"))?.naam).toBe("b");

    // Handmatig opnieuw proberen.
    bewaar.mockImplementation(async (_id, versie) => ({ versie: versie + 1 }));
    await autosave.nuOpslaan();
    expect(bewaar).toHaveBeenCalledTimes(2);
    expect(autosave.fout.value).toBeNull();
    expect(autosave.status.value).toBe("opgeslagen");
  });

  test.each([408, 429])("een %i volgt het pad van een 5xx: lokaal en een nieuwe poging na 10 s", async (code) => {
    const { store, bewaar, autosave } = opzet();
    bewaar.mockRejectedValueOnce(Object.assign(new Error("later"), { statusCode: code }));
    wijzig(store, "a");
    await vi.advanceTimersByTimeAsync(2000);
    await leeg();
    expect(autosave.status.value).toBe("lokaal");
    expect(autosave.fout.value).toBeNull();
    await vi.advanceTimersByTimeAsync(10_000);
    await leeg();
    expect(bewaar).toHaveBeenCalledTimes(2);
    expect(autosave.status.value).toBe("opgeslagen");
  });

  test("een 401 (sessie verlopen): lokaal en afgemeld, zonder nieuwe poging; het concept blijft", async () => {
    const { store, bewaar, autosave } = opzet();
    bewaar.mockRejectedValue(Object.assign(new Error("Niet ingelogd"), { statusCode: 401 }));
    expect(autosave.afgemeld.value).toBe(false);
    wijzig(store, "a");
    await vi.advanceTimersByTimeAsync(2000);
    await leeg();
    expect(autosave.status.value).toBe("lokaal");
    expect(autosave.afgemeld.value).toBe(true);
    expect(autosave.fout.value).toBeNull();
    expect(vi.getTimerCount()).toBe(0);

    // Verder tekenen: het concept volgt, maar er gaat niets naar de server.
    wijzig(store, "b");
    await vi.advanceTimersByTimeAsync(60_000);
    await leeg();
    expect(bewaar).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(autosave.status.value).toBe("lokaal");
    expect((await conceptVan("p1"))?.naam).toBe("b");
    expect(waarschuwBijVerlaten(autosave.status.value)).toBe(true);
  });

  test("na een 401: opnieuw proberen zonder sessie blijft afgemeld, met sessie wordt alles opgeslagen", async () => {
    const { store, bewaar, autosave } = opzet();
    bewaar.mockRejectedValue(Object.assign(new Error("Niet ingelogd"), { status: 401 }));
    wijzig(store, "a");
    await vi.advanceTimersByTimeAsync(2000);
    await leeg();
    expect(autosave.afgemeld.value).toBe(true);

    // Nog niet opnieuw ingelogd.
    await autosave.nuOpslaan();
    expect(bewaar).toHaveBeenCalledTimes(2);
    expect(autosave.afgemeld.value).toBe(true);
    expect(autosave.status.value).toBe("lokaal");
    expect(vi.getTimerCount()).toBe(0);

    // Opnieuw ingelogd in een ander tabblad.
    bewaar.mockImplementation(async (_id, versie) => ({ versie: versie + 1 }));
    await autosave.nuOpslaan();
    await leeg();
    expect(bewaar).toHaveBeenCalledTimes(3);
    expect(bewaar).toHaveBeenLastCalledWith("p1", 1, expect.objectContaining({ naam: "a" }));
    expect(autosave.afgemeld.value).toBe(false);
    expect(autosave.status.value).toBe("opgeslagen");
    expect(await conceptVan("p1")).toBeUndefined();

    // Daarna werkt de autosave weer zoals voorheen.
    wijzig(store, "b");
    await vi.advanceTimersByTimeAsync(2000);
    await leeg();
    expect(bewaar).toHaveBeenCalledTimes(4);
    expect(autosave.status.value).toBe("opgeslagen");
  });

  test("een 401 ANDERE_GEBRUIKER (een ander logde in): hetzelfde pad, afgemeld en zonder nieuwe poging", async () => {
    const { store, bewaar, autosave } = opzet();
    bewaar.mockRejectedValue(
      Object.assign(new Error("Ingelogd als een andere gebruiker"), {
        statusCode: 401,
        data: { data: { code: "ANDERE_GEBRUIKER" } },
      }),
    );
    wijzig(store, "a");
    await vi.advanceTimersByTimeAsync(2000);
    await leeg();
    expect(autosave.status.value).toBe("lokaal");
    expect(autosave.afgemeld.value).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    expect((await conceptVan("p1"))?.naam).toBe("a");
  });

  test("afgemeld en dan een netwerkfout bij opnieuw proberen: geen lus van nieuwe pogingen", async () => {
    const { store, bewaar, autosave } = opzet();
    bewaar.mockRejectedValueOnce(Object.assign(new Error("Niet ingelogd"), { status: 401 }));
    wijzig(store, "a");
    await vi.advanceTimersByTimeAsync(2000);
    await leeg();
    bewaar.mockRejectedValueOnce(new TypeError("netwerk"));
    await autosave.nuOpslaan();
    expect(autosave.afgemeld.value).toBe(true);
    expect(autosave.status.value).toBe("lokaal");
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(bewaar).toHaveBeenCalledTimes(2);
  });

  test("afgemeld en dan een 404 bij opnieuw proberen: verwijderd, en afgemeld vervalt", async () => {
    const { store, bewaar, autosave } = opzet();
    bewaar.mockRejectedValueOnce(Object.assign(new Error("Niet ingelogd"), { status: 401 }));
    wijzig(store, "a");
    await vi.advanceTimersByTimeAsync(2000);
    await leeg();
    bewaar.mockRejectedValueOnce(Object.assign(new Error("weg"), { status: 404 }));
    await autosave.nuOpslaan();
    expect(autosave.status.value).toBe("verwijderd");
    expect(autosave.afgemeld.value).toBe(false);
  });

  describe("402 ABONNEMENT_VEREIST", () => {
    const abonnementVereist = () =>
      Object.assign(new Error("Abonnement vereist"), {
        statusCode: 402,
        data: { data: { code: "ABONNEMENT_VEREIST", reden: "beeindigd" } },
      });

    test("status alleen-lezen, concept bewaard, geen nieuwe poging", async () => {
      const { store, bewaar, autosave } = opzet();
      bewaar.mockRejectedValue(abonnementVereist());
      expect(autosave.alleenLezen.value).toBe(false);
      wijzig(store, "a");
      await vi.advanceTimersByTimeAsync(2000);
      await leeg();
      expect(autosave.status.value).toBe("alleen-lezen");
      expect(autosave.alleenLezen.value).toBe(true);
      expect(autosave.fout.value).toBeNull();
      expect(autosave.afgemeld.value).toBe(false);
      expect((await conceptVan("p1"))?.naam).toBe("a");
      expect(vi.getTimerCount()).toBe(0);

      // Ook na de 2 s-timer en lang daarna volgt er geen PUT meer.
      await vi.advanceTimersByTimeAsync(60_000);
      await leeg();
      expect(bewaar).toHaveBeenCalledTimes(1);
      expect(waarschuwBijVerlaten(autosave.status.value)).toBe(true);
    });

    test("een wijziging die daarna nog binnenkomt houdt het concept bij en stuurt niets", async () => {
      const { store, bewaar, autosave } = opzet();
      bewaar.mockRejectedValue(abonnementVereist());
      wijzig(store, "a");
      await vi.advanceTimersByTimeAsync(2000);
      await leeg();

      wijzig(store, "b");
      await vi.advanceTimersByTimeAsync(60_000);
      await leeg();
      expect(bewaar).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
      expect(autosave.status.value).toBe("alleen-lezen");
      expect((await conceptVan("p1"))?.naam).toBe("b");
    });

    test("stop bewaart niet meer: het concept blijft staan", async () => {
      const { store, bewaar, autosave } = opzet();
      bewaar.mockRejectedValue(abonnementVereist());
      wijzig(store, "a");
      await vi.advanceTimersByTimeAsync(2000);
      await leeg();
      wijzig(store, "b");
      await nextTick();
      autosave.stop();
      await vi.advanceTimersByTimeAsync(20_000);
      await leeg();
      expect(bewaar).toHaveBeenCalledTimes(1);
      expect((await conceptVan("p1"))?.naam).toBe("b");
    });

    test("nuOpslaan na betaling bewaart alles en haalt de editor uit alleen-lezen", async () => {
      const { store, bewaar, autosave } = opzet();
      bewaar.mockRejectedValueOnce(abonnementVereist());
      wijzig(store, "a");
      await vi.advanceTimersByTimeAsync(2000);
      await leeg();
      expect(autosave.status.value).toBe("alleen-lezen");

      await autosave.nuOpslaan();
      await leeg();
      expect(bewaar).toHaveBeenCalledTimes(2);
      expect(bewaar).toHaveBeenLastCalledWith("p1", 1, expect.objectContaining({ naam: "a" }));
      expect(autosave.status.value).toBe("opgeslagen");
      expect(autosave.alleenLezen.value).toBe(false);
      expect(await conceptVan("p1")).toBeUndefined();
    });

    test("nuOpslaan zonder abonnement blijft alleen-lezen, zonder timer", async () => {
      const { store, bewaar, autosave } = opzet();
      bewaar.mockRejectedValue(abonnementVereist());
      wijzig(store, "a");
      await vi.advanceTimersByTimeAsync(2000);
      await leeg();
      await autosave.nuOpslaan();
      expect(bewaar).toHaveBeenCalledTimes(2);
      expect(autosave.status.value).toBe("alleen-lezen");
      expect(autosave.alleenLezen.value).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    });

    test("een 402 zonder die code volgt het bestaande fout-pad", async () => {
      const { store, bewaar, autosave } = opzet();
      bewaar.mockRejectedValue(Object.assign(new Error("Betaling vereist"), { statusCode: 402 }));
      wijzig(store, "a");
      await vi.advanceTimersByTimeAsync(2000);
      await leeg();
      expect(autosave.status.value).toBe("fout");
      expect(autosave.fout.value).toEqual({ status: 402 });
      expect(autosave.alleenLezen.value).toBe(false);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(bewaar).toHaveBeenCalledTimes(1);
    });

    test("een 402 met een andere code volgt ook het fout-pad", async () => {
      const { store, bewaar, autosave } = opzet();
      bewaar.mockRejectedValue(
        Object.assign(new Error("Anders"), { statusCode: 402, data: { data: { code: "IETS_ANDERS" } } }),
      );
      wijzig(store, "a");
      await vi.advanceTimersByTimeAsync(2000);
      await leeg();
      expect(autosave.status.value).toBe("fout");
      expect(autosave.alleenLezen.value).toBe(false);
    });

    test("alleen-lezen en dan een 404 bij opnieuw proberen: verwijderd, en alleen-lezen vervalt", async () => {
      const { store, bewaar, autosave } = opzet();
      bewaar.mockRejectedValueOnce(abonnementVereist());
      wijzig(store, "a");
      await vi.advanceTimersByTimeAsync(2000);
      await leeg();
      bewaar.mockRejectedValueOnce(Object.assign(new Error("weg"), { status: 404 }));
      await autosave.nuOpslaan();
      expect(autosave.status.value).toBe("verwijderd");
      expect(autosave.alleenLezen.value).toBe(false);
    });

    test("een kapot conceptarchief bij de 402: onbewaard (niet alleen-lezen), zonder nieuwe poging", async () => {
      const concepten = {
        bewaarConcept: vi.fn(async () => {
          throw new Error("IndexedDB kapot");
        }),
        wisConcept: vi.fn(async () => {}),
      };
      const { store, bewaar, autosave } = opzet({ concepten });
      bewaar.mockRejectedValue(abonnementVereist());
      wijzig(store, "a");
      await vi.advanceTimersByTimeAsync(2000);
      await leeg();
      expect(autosave.alleenLezen.value).toBe(true);
      expect(autosave.status.value).toBe("onbewaard");
      expect(vertrekBevestiging(autosave.status.value)).toBe("editor.vertrek.bevestigingOnbewaard");
      expect(await autosave.wachtOpConcept()).toBe(false);
      await vi.advanceTimersByTimeAsync(60_000);
      await leeg();
      expect(bewaar).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    });

    test("een conceptschrijfactie die later mislukt, zet alleen-lezen om in onbewaard, en herstelt weer", async () => {
      let kapot = false;
      const concepten = {
        bewaarConcept: vi.fn(async () => {
          if (kapot) throw new Error("IndexedDB kapot");
        }),
        wisConcept: vi.fn(async () => {}),
      };
      const { store, bewaar, autosave } = opzet({ concepten });
      bewaar.mockRejectedValue(abonnementVereist());
      wijzig(store, "a");
      await vi.advanceTimersByTimeAsync(2000);
      await leeg();
      expect(autosave.status.value).toBe("alleen-lezen");

      kapot = true;
      wijzig(store, "b");
      await leeg();
      expect(autosave.status.value).toBe("onbewaard");
      expect(autosave.alleenLezen.value).toBe(true);
      expect(vertrekBevestiging(autosave.status.value)).toBe("editor.vertrek.bevestigingOnbewaard");

      kapot = false;
      wijzig(store, "c");
      await leeg();
      expect(autosave.status.value).toBe("alleen-lezen");
      expect(bewaar).toHaveBeenCalledTimes(1);
    });

    test("een netwerkfout bij opnieuw proberen in alleen-lezen: geen timer, status blijft alleen-lezen", async () => {
      const { store, bewaar, autosave } = opzet();
      bewaar.mockRejectedValueOnce(abonnementVereist());
      wijzig(store, "a");
      await vi.advanceTimersByTimeAsync(2000);
      await leeg();
      bewaar.mockRejectedValueOnce(new TypeError("netwerk"));
      await autosave.nuOpslaan();
      expect(autosave.status.value).toBe("alleen-lezen");
      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(bewaar).toHaveBeenCalledTimes(2);
    });

    test("laadServerversie haalt de status terug naar opgeslagen", async () => {
      const { store, bewaar, autosave } = opzet();
      bewaar.mockRejectedValue(abonnementVereist());
      wijzig(store, "a");
      await vi.advanceTimersByTimeAsync(2000);
      await leeg();
      await autosave.laadServerversie();
      expect(autosave.status.value).toBe("opgeslagen");
      expect(autosave.alleenLezen.value).toBe(false);
    });
  });

  test("zonder gebruiker start de autosave niet", () => {
    expect(() => opzet({ gebruikerId: "" })).toThrow(/gebruiker/i);
  });

  test("een 500 blijft lokaal en volgt een nieuwe poging na 10 s", async () => {
    const { store, bewaar, autosave } = opzet();
    bewaar.mockRejectedValueOnce(Object.assign(new Error("server stuk"), { status: 500 }));
    wijzig(store, "a");
    await vi.advanceTimersByTimeAsync(2000);
    await leeg();
    expect(autosave.status.value).toBe("lokaal");
    expect(autosave.fout.value).toBeNull();
    await vi.advanceTimersByTimeAsync(10_000);
    await leeg();
    expect(bewaar).toHaveBeenCalledTimes(2);
    expect(autosave.status.value).toBe("opgeslagen");
  });

  test("een wijziging terwijl de status lokaal is, blijft lokaal en wordt na de vertraging bewaard", async () => {
    const { store, bewaar, autosave } = opzet();
    bewaar.mockRejectedValueOnce(new TypeError("netwerk"));
    wijzig(store, "a");
    await vi.advanceTimersByTimeAsync(2000);
    await leeg();
    expect(autosave.status.value).toBe("lokaal");

    wijzig(store, "b");
    await nextTick();
    expect(autosave.status.value).toBe("lokaal");
    await vi.advanceTimersByTimeAsync(2000);
    await leeg();
    expect(bewaar).toHaveBeenCalledTimes(2);
    expect(bewaar).toHaveBeenLastCalledWith("p1", 1, expect.objectContaining({ naam: "b" }));
    expect(autosave.status.value).toBe("opgeslagen");
  });
});

describe("waarschuwBijVerlaten", () => {
  test.each(["bezig", "lokaal", "onbewaard", "conflict", "fout", "alleen-lezen", "verwijderd"] as const)(
    "status %s: waarschuwen bij het verlaten",
    (status) => {
      expect(waarschuwBijVerlaten(status)).toBe(true);
    },
  );

  test("status opgeslagen: geen waarschuwing", () => {
    expect(waarschuwBijVerlaten("opgeslagen")).toBe(false);
  });

});

describe("useAutosave: project elders verwijderd (404)", () => {
  const weg = () =>
    Object.assign(new Error("Niet gevonden"), { status: 404, data: { data: { code: "NIET_GEVONDEN" } } });

  async function verwijderdeOpzet(overschrijf: Partial<AutosaveOpties> = {}) {
    const o = opzet(overschrijf);
    o.bewaar.mockRejectedValueOnce(weg());
    wijzig(o.store, "a");
    await vi.advanceTimersByTimeAsync(2000);
    await leeg();
    return o;
  }

  test("een 404 geeft de status verwijderd, bewaart het concept lokaal en probeert niet opnieuw", async () => {
    const { store, bewaar, autosave } = await verwijderdeOpzet();
    expect(autosave.status.value).toBe("verwijderd");
    expect(autosave.verwijderd.value).toBe(true);
    expect(autosave.fout.value).toBeNull();
    expect((await conceptVan("p1"))?.naam).toBe("a");
    expect(vi.getTimerCount()).toBe(0);

    // Geen nieuwe poging, ook niet na een volgende wijziging, en ook niet met nuOpslaan.
    wijzig(store, "b");
    await vi.advanceTimersByTimeAsync(60_000);
    await leeg();
    await autosave.nuOpslaan();
    expect(bewaar).toHaveBeenCalledTimes(1);
    expect(autosave.status.value).toBe("verwijderd");
    // Het concept volgt de nieuwste wijziging.
    expect((await conceptVan("p1"))?.naam).toBe("b");
  });

  test("een 404 zonder foutcode in het antwoord telt ook als verwijderd", async () => {
    const { store, bewaar, autosave } = opzet();
    bewaar.mockRejectedValueOnce(Object.assign(new Error("weg"), { statusCode: 404 }));
    wijzig(store, "a");
    await vi.advanceTimersByTimeAsync(2000);
    await leeg();
    expect(autosave.status.value).toBe("verwijderd");
  });

  test("een kapot conceptarchief: status onbewaard (verwijderd blijft true), en na een gelukte schrijfactie weer verwijderd", async () => {
    let stuk = true;
    const concepten = {
      bewaarConcept: vi.fn(async () => {
        if (stuk) throw new Error("IndexedDB kapot");
      }),
      wisConcept: vi.fn(async () => {}),
    };
    const { store, bewaar, autosave } = await verwijderdeOpzet({ concepten });
    expect(autosave.status.value).toBe("onbewaard");
    expect(autosave.verwijderd.value).toBe(true);
    // Het werk staat alleen in het geheugen: verlaten vraagt de strengste bevestiging.
    expect(waarschuwBijVerlaten(autosave.status.value)).toBe(true);
    expect(vertrekBevestiging(autosave.status.value)).toBe("editor.vertrek.bevestigingOnbewaard");
    expect(bewaar).toHaveBeenCalledTimes(1);

    stuk = false;
    wijzig(store, "b");
    await leeg();
    expect(autosave.status.value).toBe("verwijderd");
    expect(autosave.verwijderd.value).toBe(true);
    expect(bewaar).toHaveBeenCalledTimes(1);
  });

  test("stop bewaart niets meer en laat het concept staan", async () => {
    const { bewaar, autosave } = await verwijderdeOpzet();
    autosave.stop();
    await vi.advanceTimersByTimeAsync(20_000);
    await leeg();
    expect(bewaar).toHaveBeenCalledTimes(1);
    expect((await conceptVan("p1"))?.naam).toBe("a");
  });

  test("verlaten vraagt nog altijd: het concept van een verwijderd project is nooit meer te openen", async () => {
    const { autosave } = await verwijderdeOpzet();
    expect(waarschuwBijVerlaten(autosave.status.value)).toBe(true);
    expect(vertrekBevestiging(autosave.status.value)).toBe("editor.vertrek.bevestiging");
  });

  test("een vers geladen project (teller 0) wist de status verwijderd", async () => {
    const { store, autosave } = await verwijderdeOpzet();
    store.laad({ id: "p2", naam: "Ander", versie: 1, document: startDocument() });
    await nextTick();
    expect(autosave.status.value).toBe("opgeslagen");
    expect(autosave.verwijderd.value).toBe(false);
  });

  test("bewaarAlsNieuwProject maakt een nieuw project met het huidige document en navigeert", async () => {
    const { store, bewaar, maakNieuw, naarProject, autosave } = await verwijderdeOpzet();
    wijzig(store, "Daarna");
    await nextTick();
    const document = store.document;

    await autosave.bewaarAlsNieuwProject();

    expect(maakNieuw).toHaveBeenCalledTimes(1);
    expect(maakNieuw).toHaveBeenCalledWith({ naam: "Daarna", document });
    // Het document is al helemaal bij de server; verder gaat er niets naar het nieuwe project.
    expect(bewaar).toHaveBeenCalledTimes(1);
    expect(naarProject).toHaveBeenCalledWith("nieuw1");
    // Het concept hoort nu bij het nieuwe project en niet meer bij het verwijderde.
    expect(await conceptVan("p1")).toBeUndefined();
  });

  test("een wijziging tijdens het maken gaat met de nieuwe planbestand-id's mee naar het nieuwe project", async () => {
    const { store, bewaar, maakNieuw, naarProject, autosave } = await verwijderdeOpzet();
    const metPlan = (document: InstallatieDocument): InstallatieDocument => ({
      ...document,
      situatie: {
        ...document.situatie,
        paginas: [
          {
            id: "pg1",
            titel: "Plan",
            plaatsingen: [],
            achtergrond: { origineelBestandId: "oud-o", rasterBestandId: "oud-r", breedte_px: 10, hoogte_px: 10 },
          },
        ],
      },
    });
    store.laad({ id: "p1", naam: "Woning", versie: 1, document: metPlan(startDocument()) });
    // Een wijziging terwijl de server bezig is.
    maakNieuw.mockImplementationOnce(async () => {
      wijzig(store, "Tijdens");
      return {
        id: "nieuw1",
        versie: 1,
        documentId: NIEUW_DOC_ID,
        bestandIds: { "oud-o": "nieuw-o", "oud-r": "nieuw-r" },
      };
    });

    await autosave.bewaarAlsNieuwProject();

    expect(bewaar).toHaveBeenLastCalledWith("nieuw1", 1, {
      naam: "Tijdens",
      document: expect.objectContaining({ id: NIEUW_DOC_ID }),
    });
    const bewaard = bewaar.mock.lastCall![2].document;
    expect(bewaard.situatie.paginas[0]!.achtergrond).toMatchObject({
      origineelBestandId: "nieuw-o",
      rasterBestandId: "nieuw-r",
    });
    expect(naarProject).toHaveBeenCalledWith("nieuw1");
    expect(await conceptVan("p1")).toBeUndefined();
  });

  test("mislukt het bewaren van een latere wijziging, dan toch naar het nieuwe project: geen tweede project, de wijziging in zijn concept", async () => {
    const { store, bewaar, maakNieuw, naarProject, autosave } = await verwijderdeOpzet();
    maakNieuw.mockImplementationOnce(async () => {
      wijzig(store, "Tijdens");
      return { id: "nieuw1", versie: 1, documentId: NIEUW_DOC_ID, bestandIds: {} };
    });
    bewaar.mockRejectedValueOnce(Object.assign(new Error("netwerk"), { status: 500 }));

    await autosave.bewaarAlsNieuwProject();

    expect(maakNieuw).toHaveBeenCalledTimes(1);
    expect(naarProject).toHaveBeenCalledTimes(1);
    expect(naarProject).toHaveBeenCalledWith("nieuw1");
    // De wijziging staat in het concept van het nieuwe project, met zijn document-id en versie.
    const nieuwConcept = await conceptVan("nieuw1");
    expect(nieuwConcept).toMatchObject({ naam: "Tijdens", versie: 1 });
    expect(nieuwConcept?.document.id).toBe(NIEUW_DOC_ID);
    // Het concept van het verwijderde project is weg.
    expect(await conceptVan("p1")).toBeUndefined();
  });

  test("mislukt het maken, dan blijft de status verwijderd en het concept staan, en kan het opnieuw", async () => {
    const { maakNieuw, naarProject, autosave } = await verwijderdeOpzet();
    maakNieuw.mockRejectedValueOnce(Object.assign(new Error("geen abonnement"), { status: 402 }));

    await expect(autosave.bewaarAlsNieuwProject()).rejects.toMatchObject({ status: 402 });

    expect(autosave.status.value).toBe("verwijderd");
    expect(naarProject).not.toHaveBeenCalled();
    expect((await conceptVan("p1"))?.naam).toBe("a");
    await autosave.bewaarAlsNieuwProject();
    expect(naarProject).toHaveBeenCalledWith("nieuw1");
  });
});
