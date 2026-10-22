import "fake-indexeddb/auto";
import { nieuwProjectDocument, type InstallatieDocument } from "@elentrik/model";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { clear, set } from "idb-keyval";
import {
  bewaarConcept,
  maakInstantieId,
  nieuwsteConcept,
  wisAangebodenConcept,
  wisConcept,
  type Concept,
} from "../app/composables/concepten";
import { useAutosave, waarschuwBijVerlaten, type AutosaveOpties } from "../app/composables/useAutosave";
import { ConflictFout, type Project } from "../app/composables/useProjectenApi";
import { useEditorStore } from "../app/stores/editor";

const KOPIE_DOC_ID = "kopie-document-id";

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
  return (await nieuwsteConcept(projectId))?.concept;
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
    naam: "Van de server",
    klantnaam: "Janssens",
    gewijzigd: "2026-10-18T10:00:00.000Z",
    // Het dubbel op de server heeft zijn eigen document-id.
    document: id === "kopie1" ? { ...startDocument(), id: KOPIE_DOC_ID } : startDocument(),
    versie: 7,
  }));
  const dupliceer = vi.fn(async (_id: string) => ({ id: "kopie1" }));
  const naarProject = vi.fn(async (_id: string) => {});
  const autosave = useAutosave({ store, bewaar, haal, dupliceer, naarProject, ...overschrijf });
  return { store, bewaar, haal, dupliceer, naarProject, autosave };
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

describe("concepten", () => {
  test("bewaren, ophalen en wissen", async () => {
    const document = startDocument();
    await bewaarConcept("p1", "A", { document, versie: 3, naam: "N", tijd: 123 });
    expect(await conceptVan("p1")).toEqual({ document, versie: 3, naam: "N", tijd: 123 });
    await wisConcept("p1", "A");
    expect(await conceptVan("p1")).toBeUndefined();
  });

  test("nieuwsteConcept: ook een concept van vóór de laatste serverwijziging wordt aangeboden", async () => {
    // De server wijzigde om 11:00 (bv. de eigen PUT die nog net slaagde); het concept is van 10:00.
    await bewaarConcept("p1", "A", { document: startDocument(), versie: 1, naam: "N", tijd: Date.parse("2026-10-18T10:00:00.000Z") });
    expect((await conceptVan("p1"))?.naam).toBe("N");
  });

  test("nieuwsteConcept: zonder concept geeft null", async () => {
    expect(await nieuwsteConcept("p1")).toBeNull();
  });

  test("elk venster heeft een eigen sleutel; het nieuwste op tijd wordt aangeboden", async () => {
    await bewaarConcept("p1", "A", { document: startDocument(), versie: 1, naam: "A", tijd: 200 });
    await bewaarConcept("p1", "B", { document: startDocument(), versie: 1, naam: "B", tijd: 100 });
    expect(await nieuwsteConcept("p1")).toMatchObject({ sleutel: "concept:p1:A", concept: { naam: "A" } });
    await wisConcept("p1", "A");
    expect(await nieuwsteConcept("p1")).toMatchObject({ sleutel: "concept:p1:B", concept: { naam: "B" } });
  });

  test("wisAangebodenConcept wist alleen het aangeboden concept", async () => {
    await bewaarConcept("p1", "A", { document: startDocument(), versie: 1, naam: "A", tijd: 200 });
    await bewaarConcept("p1", "B", { document: startDocument(), versie: 1, naam: "B", tijd: 100 });
    const aangeboden = await nieuwsteConcept("p1");
    await wisAangebodenConcept(aangeboden!);
    expect(await nieuwsteConcept("p1")).toMatchObject({ sleutel: "concept:p1:B" });
  });

  test("wisAangebodenConcept laat het concept staan als een ander venster het intussen herschreef", async () => {
    // B krijgt S1 aangeboden; het venster A leeft nog en schrijft S2 onder dezelfde sleutel.
    await bewaarConcept("p1", "A", { document: startDocument(), versie: 1, naam: "S1", tijd: 100 });
    const aangeboden = await nieuwsteConcept("p1");
    await bewaarConcept("p1", "A", { document: startDocument(), versie: 1, naam: "S2", tijd: 200 });
    await wisAangebodenConcept(aangeboden!);
    expect(await nieuwsteConcept("p1")).toMatchObject({ sleutel: "concept:p1:A", concept: { naam: "S2" } });
  });

  test("een concept onder de oude sleutel per project is ook een kandidaat", async () => {
    await set("concept:p1", { document: startDocument(), versie: 1, naam: "Oud", tijd: 300 });
    await bewaarConcept("p1", "A", { document: startDocument(), versie: 1, naam: "A", tijd: 200 });
    const aangeboden = await nieuwsteConcept("p1");
    expect(aangeboden).toMatchObject({ sleutel: "concept:p1", concept: { naam: "Oud" } });
    await wisAangebodenConcept(aangeboden!);
    expect(await nieuwsteConcept("p1")).toMatchObject({ sleutel: "concept:p1:A" });
  });

  test("maakInstantieId gebruikt randomUUID als die er is", () => {
    expect(maakInstantieId({ randomUUID: () => "a-b-c-d-e", getRandomValues: (a) => a })).toBe("a-b-c-d-e");
  });

  test("maakInstantieId zonder randomUUID (geen veilige context) valt terug op getRandomValues", () => {
    const zonderUuid = { getRandomValues: (rij: Uint8Array<ArrayBuffer>) => crypto.getRandomValues(rij) };
    const een = maakInstantieId(zonderUuid);
    const twee = maakInstantieId(zonderUuid);
    expect(een).toMatch(/^[0-9a-f]{32}$/);
    expect(een).not.toBe(twee);
  });

  test("maakInstantieId zonder crypto valt terug op de tijd en Math.random", () => {
    const een = maakInstantieId(null);
    const twee = maakInstantieId(null);
    expect(een).toMatch(/^[0-9a-z]+-[0-9a-z]+$/);
    expect(een).not.toBe(twee);
  });

  test("de concepten van een ander project tellen niet mee", async () => {
    await bewaarConcept("p10", "A", { document: startDocument(), versie: 1, naam: "Ander", tijd: 300 });
    await set("concept:p10", { document: startDocument(), versie: 1, naam: "Ander oud", tijd: 400 });
    expect(await nieuwsteConcept("p1")).toBeNull();
  });
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
    expect(autosave.conflict.value).toEqual({ huidigeVersie: 5 });

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
    expect(autosave.conflict.value).toEqual({ huidigeVersie: 7 });

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
    expect(await nieuwsteConcept("p1")).toMatchObject({ sleutel: "concept:p1:B", concept: { naam: "Werk van B" } });
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
    const { store, bewaar, dupliceer, naarProject, autosave } = opzet();
    bewaar.mockRejectedValueOnce(new ConflictFout(5));
    wijzig(store, "Lokaal");
    const lokaalDocument = store.document;
    await vi.advanceTimersByTimeAsync(2000);
    await leeg();
    expect(autosave.status.value).toBe("conflict");

    await autosave.bewaarAlsKopie();
    expect(dupliceer).toHaveBeenCalledWith("p1");
    // De kopie krijgt het document-id van de kopie, niet dat van het origineel.
    expect(bewaar).toHaveBeenLastCalledWith("kopie1", 1, {
      naam: "Lokaal (kopie)",
      document: { ...lokaalDocument, id: KOPIE_DOC_ID },
    });
    expect(lokaalDocument?.id).not.toBe(KOPIE_DOC_ID);
    expect(await conceptVan("p1")).toBeUndefined();
    expect(naarProject).toHaveBeenCalledWith("kopie1");
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
    const nieuw = useAutosave({ store, bewaar, haal, dupliceer, naarProject });
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
      bewaarConcept: vi.fn(async (projectId: string, instantieId: string, concept: Concept) => {
        await new Promise<void>((klaar) => wachtend.push(klaar));
        archief.set(`${projectId}:${instantieId}`, concept);
        volgorde.push(`bewaar ${concept.naam}`);
      }),
      wisConcept: vi.fn(async (projectId: string, instantieId: string) => {
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
    expect(concepten.bewaarConcept).toHaveBeenLastCalledWith("p1", "A", expect.objectContaining({ naam: "d" }));
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
    await bewaarConcept("p1", "oud", { document: startDocument(), versie: 1, naam: "Oud werk", tijd: 100 });
    const aangeboden = (await nieuwsteConcept("p1"))!;
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
    expect(await nieuwsteConcept("p1")).toMatchObject({ sleutel: "concept:p1:oud", concept: { naam: "Oud werk" } });
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

  test.each([422, 404])("een %i zet de status op fout, zonder nieuwe poging of autosave", async (code) => {
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
  test.each(["bezig", "lokaal", "onbewaard", "conflict", "fout"] as const)(
    "status %s: waarschuwen bij het verlaten",
    (status) => {
      expect(waarschuwBijVerlaten(status)).toBe(true);
    },
  );

  test("status opgeslagen: geen waarschuwing", () => {
    expect(waarschuwBijVerlaten("opgeslagen")).toBe(false);
  });
});
