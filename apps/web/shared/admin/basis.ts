export type AdminPagina<T> = { items: T[]; totaal: number; pagina: number; perPagina: number };
export type AdminLijstQuery = { zoek: string; pagina: number; perPagina: number; exactId?: string };
export type AdminMutatie<T> = { mutatieId: string; reden: string; verwacht: string; gegevens: T };
