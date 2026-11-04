import { createHash } from "node:crypto";
import { z } from "zod";
import { readMultipartFormData, type H3Event } from "h3";
import type { BestandOpslag } from "../bestanden/opslag";
import { controleerOpslagruimte } from "../bestanden/opslagruimte";
import { bewaarBestand, haalBestand } from "../bestanden/repo";
import type { Db } from "../db";
import { nietGevondenFout } from "../fouten";
import { controleerUploadGrootte, metBestandFouten } from "../utils/bestanden";
import { schrijfAdminAudit } from "./audit";
import { levendAdminProject, vereisCorrectie } from "./correcties";
import { parseAdmin } from "./invoer";
import { voerAdminMutatieUit } from "./mutaties";
import type { AdminActor } from "./toegang";

const UploadSchema = z.object({ correctieId: z.uuid(), mutatieId: z.uuid(), soort: z.enum(["plan-origineel", "plan-raster"]), data: z.instanceof(Uint8Array) }).strict();
export async function leesAdminUpload(event: H3Event) {
  controleerUploadGrootte(event);
  const delen = await readMultipartFormData(event);
  // De body heeft exact vier velden; ook dubbele metadata en een opgegeven organisatie worden geweigerd.
  const toegestaan = new Set(["bestand", "soort", "correctieId", "mutatieId"]);
  parseAdmin(z.literal(true), delen?.length === 4 && new Set(delen.map((d) => d.name)).size === 4 && delen.every((d) => toegestaan.has(d.name ?? "")));
  const tekst = (naam: string) => delen!.find((d) => d.name === naam)?.data.toString("utf8");
  return parseAdmin(UploadSchema, { correctieId: tekst("correctieId"), mutatieId: tekst("mutatieId"), soort: tekst("soort"), data: delen!.find((d) => d.name === "bestand")!.data });
}
export async function bewaarAdminBestand(db: Db, opslag: BestandOpslag, actor: AdminActor, projectId: string, invoer: unknown) {
  const i = parseAdmin(UploadSchema, invoer);
  const { data, ...meta } = i;
  const hash = createHash("sha256").update(data).digest("hex");
  return db.transaction(async (tx) => {
    const correctie = await vereisCorrectie(tx, actor, i.correctieId, projectId);
    const doel = { type: "project" as const, id: projectId, projectId, organisatieId: correctie.organisatieId };
    const actie = "project.plan-opgeladen";
    return voerAdminMutatieUit(tx, actor, { mutatieId: i.mutatieId, actie, doel, payload: { ...meta, hash } }, async (werk) => {
      const project = await levendAdminProject(werk, projectId, "update");
      if (project.organisatieId !== correctie.organisatieId) throw nietGevondenFout();
      await controleerOpslagruimte(werk, project.organisatieId, data.length);
      return metBestandFouten(() => bewaarBestand(werk, opslag, { organisatieId: project.organisatieId, projectId, soort: i.soort, data }, async (auditTx, info) => {
        await schrijfAdminAudit(auditTx as Parameters<typeof schrijfAdminAudit>[0], actor, { doel, actie, reden: correctie.reden, correctieId: correctie.id,
          voor: null, na: { ...info, soort: i.soort, sha256: hash } });
      }));
    });
  });
}
export async function haalAdminBestand(db: Db, id: string) {
  if (!z.uuid().safeParse(id).success) throw nietGevondenFout();
  const bestand = await haalBestand(db, id);
  if (!bestand?.organisatieId) throw nietGevondenFout();
  return bestand;
}
