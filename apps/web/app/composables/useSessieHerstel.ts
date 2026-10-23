// Herstel na een fout van een API-route (spec 5b.5): een verlopen sessie (401), of de gebruiker
// is geen lid meer van de actieve organisatie (404), of zijn rol veranderde (403). De sessie wordt
// opnieuw gelezen: de server kiest dan zelf een andere organisatie (de pagina laadt opnieuw via
// haar watch op de actieve organisatie), of er volgt /inloggen of /geen-organisatie.
import { bestemming } from "~/sessie/bestemming";
import { foutStatus } from "~/sessie/fouten";
import { useSessieStore } from "~/stores/sessie";

export function useSessieHerstel(): (fout: unknown) => Promise<void> {
  const sessie = useSessieStore();
  const route = useRoute();
  return async function herstelSessie(fout: unknown): Promise<void> {
    const status = foutStatus(fout);
    if (status !== 401 && status !== 403 && status !== 404) return;
    try {
      await sessie.laad();
    } catch {
      return;
    }
    const doel = bestemming(route, sessie.sessieInfo);
    if (doel) await navigateTo(doel, { replace: true });
  };
}
