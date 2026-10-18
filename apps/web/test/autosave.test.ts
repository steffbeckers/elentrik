import "fake-indexeddb/auto";
import { nieuwProjectDocument, type InstallatieDocument } from "@elentrik/model";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { bewaarConcept, haalConcept, nieuwerConcept, wisConcept } from "../app/composables/concepten";
import { useAutosave, type AutosaveOpties } from "../app/composables/useAutosave";
import { ConflictFout, type Project } from "../app/composables/useProjectenApi";
import { useEditorStore } from "../app/stores/editor";

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
    document: startDocument(),
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
  await wisConcept("p1");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("concepten", () => {
  test("bewaren, ophalen en wissen", async () => {
    const document = startDocument();
    await bewaarConcept("p1", { document, versie: 3, naam: "N", tijd: 123 });
    expect(await haalConcept("p1")).toEqual({ document, versie: 3, naam: "N", tijd: 123 });
    await wisConcept("p1");
    expect(await haalConcept("p1")).toBeUndefined();
  });

  test("nieuwerConcept: concept nieuwer dan het project geeft het concept", async () => {
    await bewaarConcept("p1", { document: startDocument(), versie: 1, naam: "N", tijd: Date.parse("2026-10-18T12:00:00.000Z") });
    const concept = await nieuwerConcept({ id: "p1", gewijzigd: "2026-10-18T11:00:00.000Z" });
    expect(concept?.naam).toBe("N");
  });

  test("nieuwerConcept: concept ouder dan het project geeft null", async () => {
    await bewaarConcept("p1", { document: startDocument(), versie: 1, naam: "N", tijd: Date.parse("2026-10-18T10:00:00.000Z") });
    expect(await nieuwerConcept({ id: "p1", gewijzigd: "2026-10-18T11:00:00.000Z" })).toBeNull();
  });

  test("nieuwerConcept: zonder concept geeft null", async () => {
    expect(await nieuwerConcept({ id: "p1", gewijzigd: "2026-10-18T11:00:00.000Z" })).toBeNull();
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
    const concept = await haalConcept("p1");
    expect(concept).toMatchObject({ naam: "a", versie: 1, tijd: Date.now() });
    expect(concept?.document).toEqual(store.document);
    expect(autosave.status.value).toBe("bezig");

    await vi.advanceTimersByTimeAsync(2000);
    await leeg();
    expect(await haalConcept("p1")).toBeUndefined();
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
    expect((await haalConcept("p1"))?.naam).toBe("b");
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
    expect((await haalConcept("p1"))?.naam).toBe("a");

    await vi.advanceTimersByTimeAsync(9999);
    expect(bewaar).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await leeg();
    expect(bewaar).toHaveBeenCalledTimes(2);
    expect(autosave.status.value).toBe("opgeslagen");
    expect(await haalConcept("p1")).toBeUndefined();
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
    expect((await haalConcept("p1"))?.naam).toBe("b");
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
    expect(await haalConcept("p1")).toBeUndefined();
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
    expect(await haalConcept("p1")).toBeUndefined();
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
    expect(bewaar).toHaveBeenLastCalledWith("kopie1", 1, { naam: "Lokaal (kopie)", document: lokaalDocument });
    expect(await haalConcept("p1")).toBeUndefined();
    expect(naarProject).toHaveBeenCalledWith("kopie1");
  });

  test("stop ruimt de watcher en de timers op", async () => {
    const { store, bewaar, autosave } = opzet();
    wijzig(store, "a");
    await nextTick();
    autosave.stop();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(bewaar).not.toHaveBeenCalled();
    wijzig(store, "b");
    await vi.advanceTimersByTimeAsync(20_000);
    expect(bewaar).not.toHaveBeenCalled();
  });
});
