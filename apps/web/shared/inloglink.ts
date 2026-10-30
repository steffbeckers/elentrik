// De foutcode waarmee de server een mislukte inloglink meldt: een redirect naar
// `/inloggen?fout=INLOGLINK_MISLUKT`. De server en de inlogpagina delen de naam.
// Expliciete import in de server en client (ruling E1): dit bestand importeert niets.

/** Er ging iets mis na het klikken op een geldige inloglink (bv. de sessie kon niet aangemaakt worden). */
export const INLOGLINK_MISLUKT = "INLOGLINK_MISLUKT";
