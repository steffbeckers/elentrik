// De teksten van het conflictscherm. Met lokale wijzigingen (een 409 op het bewaren) gaat het om
// "mijn versie"; zonder (een 409 bij de export van een opgeslagen project) toont de editor gewoon
// een oudere versie en gaat er niets verloren. Puur en zonder I/O; expliciete imports (ruling E1).

export type ConflictSleutels = {
  beschrijving: string;
  serverversieUitleg: string;
  kopie: string;
  kopieUitleg: string;
};

export function conflictSleutels(lokaleWijzigingen: boolean): ConflictSleutels {
  const basis = lokaleWijzigingen ? "editor.conflict" : "editor.conflict.zonderLokaal";
  return {
    beschrijving: `${basis}.beschrijving`,
    serverversieUitleg: `${basis}.serverversieUitleg`,
    kopie: `${basis}.kopie`,
    kopieUitleg: `${basis}.kopieUitleg`,
  };
}
