export type AdminZoekgroep = { items: Array<{ id: string; naam: string; context: string; verwijderd: boolean }>; meer: boolean };
export type AdminZoekresultaten = { gebruikers: AdminZoekgroep; organisaties: AdminZoekgroep; projecten: AdminZoekgroep };
