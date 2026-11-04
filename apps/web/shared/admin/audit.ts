export type AdminAuditDoel = {
  type: "gebruiker" | "organisatie" | "project" | "notitie";
  id: string;
  organisatieId: string | null;
  projectId: string | null;
};
export type AdminAuditItem = {
  id: string;
  actor: { id: string; naam: string };
  doel: AdminAuditDoel;
  actie: string;
  reden: string;
  tijd: string;
  correctieId: string | null;
};
export type AdminAuditDetail = AdminAuditItem & { voor: unknown; na: unknown };
