import "fake-indexeddb/auto";
import { nieuwProjectDocument, type InstallatieDocument } from "@elentrik/model";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { bewaarConcept, haalConcept, nieuwerConcept, wisConcept } from "../app/composables/concepten";
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
    // De kopie krijgt het document-id van de kopie, niet dat van het origineel.
    expect(bewaar).toHaveBeenLastCalledWith("kopie1", 1, {
      naam: "Lokaal (kopie)",
      document: { ...lokaalDocument, id: KOPIE_DOC_ID },
    });
    expect(lokaalDocument?.id).not.toBe(KOPIE_DOC_ID);
    expect(await haalConcept("p1")).toBeUndefined();
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
    expect(await haalConcept("p1")).toBeUndefined();
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
    expect(await haalConcept("p1")).toBeUndefined();
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
    expect((await haalConcept("p1"))?.naam).toBe("b");

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
    "status %s: de browser waarschuwt bij het verlaten",
    (status) => {
      const event = { preventDefault: vi.fn() };
      waarschuwBijVerlaten(status, event);
      expect(event.preventDefault).toHaveBeenCalledTimes(1);
    },
  );

  test("status opgeslagen: geen waarschuwing", () => {
    const event = { preventDefault: vi.fn() };
    waarschuwBijVerlaten("opgeslagen", event);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});
