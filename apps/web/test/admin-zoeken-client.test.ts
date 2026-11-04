import { expect, test, vi } from "vitest";
import type { AdminZoekresultaten } from "../shared/admin/zoeken";
import { maakAdminZoeken } from "../app/composables/useAdminZoeken";
const results = (name: string): AdminZoekresultaten => ({ gebruikers: { items: [{ id: name, naam: name, context: "email", verwijderd: false }], meer: false }, organisaties: { items: [], meer: false }, projecten: { items: [], meer: false } });
test("late responses cannot replace newer results or repopulate after account change", async () => {
  const pending: Array<(r: AdminZoekresultaten) => void> = [];
  const fetch = vi.fn(() => new Promise<AdminZoekresultaten>((resolve) => pending.push(resolve)));
  const search = maakAdminZoeken(fetch, "u1");
  const old = search.zoek("old"); const latest = search.zoek("latest");
  pending[1]!(results("new")); await latest;
  pending[0]!(results("old")); await old;
  expect(search.resultaat.value?.gebruikers.items[0]?.naam).toBe("new");
  const late = search.zoek("again"); search.gebruikerGewijzigd(null);
  pending[2]!(results("private")); await late;
  expect(search.resultaat.value).toBeNull();
  search.gebruikerGewijzigd("u2"); await search.zoek("other");
  expect(fetch).toHaveBeenCalledTimes(3);
});
test("empty and short queries disclose nothing, clear superseded errors, and errors are explicit", async () => {
  const fetch = vi.fn().mockRejectedValue(new Error("offline")); const search = maakAdminZoeken(fetch, "u1");
  await search.zoek("valid"); expect(search.fout.value).toBeTruthy(); expect(search.bezig.value).toBe(false);
  await search.zoek(" "); expect(search.resultaat.value).toBeNull(); expect(search.fout.value).toBeNull();
  await search.zoek("a"); expect(fetch).toHaveBeenCalledTimes(1);
});
