import "fake-indexeddb/auto";
import { nieuwProjectDocument } from "@elentrik/model";
import { clear } from "idb-keyval";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { nextTick } from "vue";
import { opnieuwProberen, vertrekBevestiging, type SessieControle } from "../app/editor/aanmelding";
import { useAutosave, type AutosaveOpties } from "../app/composables/useAutosave";
import type { Project } from "../app/composables/useProjectenApi";
import { useEditorStore } from "../app/stores/editor";

type Bewaar = AutosaveOpties["bewaar"];

async function leeg(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await new Promise<void>((klaar) => setImmediate(klaar));
    await nextTick();
  }
}

/** Een editorvenster van gebruiker "an" waarvan de autosave een 401 kreeg (afgemeld). */
async function afgemeldVenster() {
  const store = useEditorStore();
  const document = nieuwProjectDocument({ klantNaam: "Janssens", stroomtype: "2x230V", datum: "2026-10-18" });
  store.laad({ id: "p1", naam: "Woning", versie: 1, document });
  const bewaar = vi.fn<Bewaar>(async () => Promise.reject(Object.assign(new Error("401"), { status: 401 })));
  const autosave = useAutosave({
    store,
    bewaar,
    haal: async () => ({}) as Project,
    dupliceer: async () => ({ id: "kopie" }),
    naarProject: () => {},
    gebruikerId: "an",
  });
  store.wijzigProjectgegevens({ naam: "Werk van An" });
  await vi.advanceTimersByTimeAsync(2000);
  await leeg();
  expect(autosave.afgemeld.value).toBe(true);
  bewaar.mockClear();
  bewaar.mockImplementation(async (_id, versie) => ({ versie: versie + 1 }));
  return { bewaar, autosave };
}

/** Een sessie die na `laad` van `gebruikerId` is (null: niet ingelogd). */
function sessie(gebruikerId: string | null, laadFout?: Error): SessieControle & { laad: ReturnType<typeof vi.fn> } {
  return {
    laad: vi.fn(async () => {
      if (laadFout) throw laadFout;
    }),
    gebruikerId: () => gebruikerId,
  };
}

beforeEach(async () => {
  setActivePinia(createPinia());
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  await clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("opnieuwProberen", () => {
  test("nu ingelogd als een andere gebruiker: niets naar de server, en afgemeld blijft", async () => {
    const { bewaar, autosave } = await afgemeldVenster();
    const s = sessie("bart");
    expect(await opnieuwProberen({ sessie: s, verwacht: "an", nuOpslaan: autosave.nuOpslaan })).toBe("andereGebruiker");
    expect(s.laad).toHaveBeenCalledTimes(1);
    expect(bewaar).not.toHaveBeenCalled();
    expect(autosave.afgemeld.value).toBe(true);
    expect(autosave.status.value).toBe("lokaal");
  });

  test("nog niet opnieuw ingelogd: niets naar de server", async () => {
    const { bewaar, autosave } = await afgemeldVenster();
    expect(await opnieuwProberen({ sessie: sessie(null), verwacht: "an", nuOpslaan: autosave.nuOpslaan })).toBe(
      "afgemeld",
    );
    expect(bewaar).not.toHaveBeenCalled();
    expect(autosave.afgemeld.value).toBe(true);
  });

  test("opnieuw ingelogd als dezelfde gebruiker: bewaren", async () => {
    const { bewaar, autosave } = await afgemeldVenster();
    expect(await opnieuwProberen({ sessie: sessie("an"), verwacht: "an", nuOpslaan: autosave.nuOpslaan })).toBe(
      "geprobeerd",
    );
    expect(bewaar).toHaveBeenCalledTimes(1);
    expect(autosave.afgemeld.value).toBe(false);
    expect(autosave.status.value).toBe("opgeslagen");
  });

  test("de sessie is niet te lezen (netwerk): toch proberen, de server controleert de gebruiker", async () => {
    const { bewaar, autosave } = await afgemeldVenster();
    const s = sessie("bart", new TypeError("netwerk"));
    expect(await opnieuwProberen({ sessie: s, verwacht: "an", nuOpslaan: autosave.nuOpslaan })).toBe("geprobeerd");
    expect(bewaar).toHaveBeenCalledTimes(1);
  });
});

describe("vertrekBevestiging", () => {
  test("opgeslagen: geen vraag", () => {
    expect(vertrekBevestiging("opgeslagen")).toBeNull();
  });

  test("onbewaard (ook lokaal mislukt): de sterkere waarschuwing", () => {
    expect(vertrekBevestiging("onbewaard")).toBe("editor.vertrek.bevestigingOnbewaard");
  });

  test.each(["bezig", "lokaal", "conflict", "fout"] as const)("%s: de gewone vraag", (status) => {
    expect(vertrekBevestiging(status)).toBe("editor.vertrek.bevestiging");
  });
});
