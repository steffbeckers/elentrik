import type { InstallatieDocument } from "@elentrik/model";
export type AdminCorrectie = { id: string; projectId: string; organisatieId: string; reden: string; gestart: string; verloopt: string; beeindigd: string | null };
export type AdminProjectRevisie = { naam: string; versie: number; document: InstallatieDocument };
export type AdminRevisie = { id: string; projectId: string; organisatieId: string; correctieId: string; auditId: string; voor: AdminProjectRevisie; na: AdminProjectRevisie; tijd: string };
