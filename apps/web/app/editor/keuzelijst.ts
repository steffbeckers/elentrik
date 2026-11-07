// Puur, met expliciete imports (ruling E1): de `content`-optie voor een `USelect` in een dialoog.
//
// Reka zet standaard `disableOutsidePointerEvents` aan: zolang een keuzelijst openstaat, krijgt de
// rest van de dialoog geen muisklikken. De eerste klik op Bewaren (of een ander veld) sloot dan
// alleen de keuzelijst en ging verloren. Met deze optie sluit die klik de lijst én komt hij aan.
export const KEUZELIJST_IN_DIALOOG = { disableOutsidePointerEvents: false } as const;
