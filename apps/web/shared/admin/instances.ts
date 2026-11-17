/** Een zelf gehoste Elentrik-instance die zich heeft gemeld (datums als ISO-string). */
export type AdminInstance = {
  instanceId: string;
  host: string;
  versie: string;
  abonnementenAan: boolean;
  aantalOrganisaties: number;
  aantalGebruikers: number;
  eersteMeldingOp: string;
  laatsteMeldingOp: string;
  aantalMeldingen: number;
  laatsteIp: string | null;
  /** Laatste melding meer dan 7 dagen geleden. */
  stil: boolean;
};
