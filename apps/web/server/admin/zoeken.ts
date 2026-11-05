import { z } from "zod";
import type { AdminZoekresultaten } from "../../shared/admin/zoeken";
import type { Db } from "../db";
import { parseAdmin } from "./invoer";
import { lijstAdminGebruikers, lijstAdminOrganisaties, lijstAdminProjecten } from "./records";

export async function zoekAdmin(db: Db, invoer: string): Promise<AdminZoekresultaten> {
  const zoek = parseAdmin(z.string().trim().max(200), invoer);
  if (!zoek) return { gebruikers: { items: [], meer: false }, organisaties: { items: [], meer: false }, projecten: { items: [], meer: false } };
  parseAdmin(z.string().min(2), zoek);
  const query = { zoek, perPagina: 6 };
  const [gebruikers, organisaties, projecten] = await Promise.all([
    lijstAdminGebruikers(db, query), lijstAdminOrganisaties(db, query), lijstAdminProjecten(db, { ...query, verwijderd: "exact" }),
  ]);
  return {
    gebruikers: { items: gebruikers.items.slice(0, 5).map((r) => ({ id: r.id, naam: r.naam, context: r.email, verwijderd: false })), meer: gebruikers.totaal > 5 },
    organisaties: { items: organisaties.items.slice(0, 5).map((r) => ({ id: r.id, naam: r.naam, context: `${r.id} · ${r.eigenaren.map((e) => e.email).join(", ")}`, verwijderd: false })), meer: organisaties.totaal > 5 },
    projecten: { items: projecten.items.slice(0, 5).map((r) => ({ id: r.id, naam: r.naam, context: `${r.organisatieNaam ?? "—"} · ${r.klantnaam} · ${r.id}`, verwijderd: !!r.verwijderd })), meer: projecten.totaal > 5 },
  };
}
