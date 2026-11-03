import { expect, test, vi } from "vitest";
import { maakAdminApi } from "../app/composables/useAdminApi";
test("admin transport always uses explicit target and expected-user, never active company", async () => {
  const fetch = vi.fn(async () => ({})); const api = maakAdminApi(fetch, "actor");
  await api.organisatie("company/1"); await api.gebruikers({ zoek: "a & b", pagina: 2 }); await api.audit({ projectId: "p1" });
  await api.opvolging({ pagina: 2 });
  expect(fetch.mock.calls).toEqual([
    ["/api/admin/organisaties/company%2F1", { headers: { "x-elentrik-gebruiker": "actor" } }],
    ["/api/admin/gebruikers?zoek=a+%26+b&pagina=2", { headers: { "x-elentrik-gebruiker": "actor" } }],
    ["/api/admin/audit?projectId=p1", { headers: { "x-elentrik-gebruiker": "actor" } }],
    ["/api/admin/opvolging?pagina=2", { headers: { "x-elentrik-gebruiker": "actor" } }],
  ]);
});
test("failed mutations keep form values and retry identity; changed payload gets a fresh ID", async () => {
  const fetch = vi.fn().mockRejectedValue(new Error("lost response")); const api = maakAdminApi(fetch, "actor");
  const form = { verwacht: "version", reden: "Reason", gegevens: { naam: "Name" } };
  const original = structuredClone(form);
  await expect(api.corrigeerGebruiker("u1", form)).rejects.toThrow();
  const first = fetch.mock.calls[0]![1].body;
  await expect(api.corrigeerGebruiker("u1", form)).rejects.toThrow();
  expect(fetch.mock.calls[1]![1].body).toEqual(first);
  expect(form).toEqual(original);
  form.gegevens.naam = "Changed";
  await expect(api.corrigeerGebruiker("u1", form)).rejects.toThrow();
  const second = fetch.mock.calls[2]![1].body;
  expect(second.mutatieId).not.toBe(first.mutatieId);
  expect(first.gegevens.naam).toBe("Name");
  fetch.mockResolvedValue({ naam: "Changed" });
  await api.corrigeerGebruiker("u1", form);
  expect(fetch.mock.calls[3]![1].body.mutatieId).toBe(second.mutatieId);
  await api.corrigeerGebruiker("u1", form);
  expect(fetch.mock.calls[4]![1].body.mutatieId).not.toBe(second.mutatieId);
});
