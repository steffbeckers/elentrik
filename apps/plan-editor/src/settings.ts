// Vervangt `$lib/stores/settings` (zie de alias in vite.config.ts). De vendor-code
// blijft ongewijzigd; alleen de maatlabels volgen hier de interfacetaal.
import {
  formatLength as vendorLength,
  formatLengthPrecise as vendorPrecise,
  formatArea as vendorArea,
} from '../vendor/openplan3d/stores/settings';
import { formatteerMaat, formatteerMaatKort, formatteerOppervlak } from './maten';

export * from '../vendor/openplan3d/stores/settings';

let taal = 'nl';
export function zetMaatTaal(nieuw: string) { taal = nieuw; }

type Eenheden = 'metric' | 'imperial';

export function formatLength(cm: number, units: Eenheden): string {
  if (units !== 'metric') return vendorLength(cm, units);
  return cm >= 100 ? formatteerMaatKort(cm / 100, taal) : vendorLength(cm, units);
}

export function formatLengthPrecise(cm: number, units: Eenheden): string {
  if (units !== 'metric' || cm < 100) return vendorPrecise(cm, units);
  return formatteerMaat(cm / 100, taal, 2);
}

export function formatArea(m2: number, units: Eenheden): string {
  return units === 'metric' ? formatteerOppervlak(m2, taal) : vendorArea(m2, units);
}
