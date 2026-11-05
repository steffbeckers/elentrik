import { LOCALES, isTaal } from "../../shared/taal";
export function useAdminDatums() {
  const { locale } = useI18n();
  function datum(waarde: string | null | undefined, tijd = true): string {
    if (!waarde) return '—';
    return new Intl.DateTimeFormat(LOCALES[isTaal(locale.value) ? locale.value : 'nl'], {
      timeZone: 'Europe/Brussels', dateStyle: 'medium', ...(tijd ? { timeStyle: 'short' as const } : {}),
    }).format(new Date(waarde.length === 10 ? `${waarde}T12:00:00Z` : waarde));
  }
  return { datum };
}
