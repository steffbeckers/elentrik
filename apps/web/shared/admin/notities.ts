export type AdminNotitie = {
  id: string; organisatieId: string; projectId: string | null; tekst: string; opvolgdatum: string | null;
  auteur: { id: string; naam: string }; aangemaakt: string; gewijzigd: string; gearchiveerd: string | null; verwacht: string;
};
