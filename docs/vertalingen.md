# Woordenlijst: Nederlands, Frans en Engels

Dit is de bron voor alle vertalingen in Elentrik: de interface (`apps/web/i18n/locales`), de AREI-berichten (`packages/arei/src/berichten`), de teksten van de pdf (`packages/render/src/teksten`) en de mails. Wie een tekst vertaalt, volgt deze lijst. Ontbreekt een term, voeg hem dan eerst hier toe en gebruik hem daarna overal gelijk.

De vertalingen zijn eigen werk (clean room). Ze nemen geen tekst of terminologie van andere software over.

## Afspraken

- **Talen:** `nl` (standaard), `fr` en `en`. De locales zijn `nl-BE`, `fr-BE` en `en-GB`.
- **Belgisch Frans:** we spreken de gebruiker aan met "vous". Waar een getal voluit staat, schrijven we "septante" en "nonante" (niet "soixante-dix" en "quatre-vingt-dix"). Cijfers in de interface en op het schema blijven cijfers.
- **Engels:** Brits Engels (`en-GB`). "Socket" en "tumble dryer", geen "outlet" en "dryer".
- **Ongewijzigd in elke taal:**
  - artikelnummers van het AREI/RGIE;
  - grenswaarden (`30 mA`, `16 A`, `2,5 mm²`);
  - technische labels op het schema, zoals `XVB 3G2,5`, met een decimale komma. Die labels worden nooit vertaald, zodat een keurder de tekening in elke taal hetzelfde leest.
- **Niet vertaald:** wat de gebruiker zelf typt (projectnamen, klantgegevens, eigen ruimtenamen, de motivatie van een afwijking).
- **Plaatshouders en meervoudsvormen:** `{naam}` en `|` staan per sleutel identiek in elke taal.
- **Datums in de pdf:** korte notatie van de locale van de dossiertaal: `19/10/2026` (nl), `19/10/26` (fr) en `19/10/2026` (en).
- **Hoofdletters:** de benaming van een toesteltype in de pdf staat in een lopende zin of tussen haakjes in kleine letters ("Toestel (wasmachine)"); een ruimte en een type staan op zichzelf met een hoofdletter.

## Kernbegrippen

| NL | FR | EN |
|---|---|---|
| AREI | RGIE | AREI (Belgian wiring regulations) |
| eendraadschema | schéma unifilaire | single-line diagram |
| situatieschema | plan de position | layout plan |
| kringenlijst | liste des circuits | circuit list |
| verdeelbord | tableau de distribution | distribution board |
| automaat | disjoncteur | circuit breaker |
| differentieel | interrupteur différentiel | residual current device (RCD) |
| keuring | contrôle | inspection |
| bevinding | constat | finding |
| afwijking | dérogation | deviation |
| eigenaar / lid | propriétaire / membre | owner / member |
| proefperiode | période d'essai | free trial |

In lopende zinnen mag het Engels "RCD" schrijven nadat de term eenmaal voluit is gebruikt, en in een smalle tabelkop of een korte AREI-melding. In het Frans blijft het "interrupteur différentiel" (de korte vorm "différentiel" alleen in een smalle kolomkop).

## Installatie en schema

| NL | FR | EN |
|---|---|---|
| installatie | installation | installation |
| kring | circuit | circuit |
| punt | point | point |
| beveiliging | protection | protection |
| zekering | fusible | fuse |
| leiding | câble | cable |
| kabeltype | type de câble | cable type |
| doorsnede | section | cross-section |
| gevoeligheid | sensibilité | sensitivity |
| polen | pôles | poles |
| stroomtype | type de courant | current type |
| klasse (differentieel) | classe | class |
| algemeen differentieel | interrupteur différentiel général | main RCD |
| natte ruimte | local humide | wet room |
| regelset | jeu de règles | rule set |
| artikel (van het AREI) | article (du RGIE) | article (of the AREI) |
| nominale stroom | courant nominal | rated current |

## Typen in het schema (`NodeType`)

Dit zijn ook de teksten van `types` in de pdf. Een kolomkop of tabelcel is smal; de langste vorm moet er nog in passen.

| NL | FR | EN |
|---|---|---|
| aansluiting | raccordement | supply connection |
| teller | compteur | meter |
| differentieel | interrupteur différentiel | residual current device (RCD) |
| automaat | disjoncteur | circuit breaker |
| zekering | fusible | fuse |
| verdeelbord | tableau de distribution | distribution board |
| leiding | câble | cable |
| contactdoos | prise de courant | socket |
| lichtpunt | point lumineux | light point |
| schakelaar | interrupteur | switch |
| toestel | appareil | appliance |

## Toestelsoorten (`Toestelsoort`)

| NL | FR | EN |
|---|---|---|
| wasmachine | lave-linge | washing machine |
| droogkast | sèche-linge | tumble dryer |
| vaatwasser | lave-vaisselle | dishwasher |
| kookplaat | plaque de cuisson | hob |
| oven | four | oven |
| boiler | chauffe-eau | water heater |
| warmtepomp | pompe à chaleur | heat pump |
| laadpaal | borne de recharge | EV charger |
| omvormer | onduleur | inverter |
| andere | autre | other |

## Vaste ruimtes (`Ruimte`)

| NL | FR | EN |
|---|---|---|
| badkamer | salle de bain | bathroom |
| keuken | cuisine | kitchen |
| wasplaats | buanderie | laundry room |
| slaapkamer | chambre | bedroom |
| leefruimte | pièce de vie | living area |
| garage | garage | garage |
| kelder | cave | basement |
| zolder | grenier | attic |
| buiten | extérieur | outdoors |
| technisch | local technique | technical room |
| andere | autre | other |

## Pdf (dossier)

| NL | FR | EN |
|---|---|---|
| bijlage | annexe | appendix |
| klant | client | customer |
| werf | chantier | site |
| installateur | installateur | installer |
| keurder | contrôleur | inspector |
| datum | date | date |
| versie | version | version |
| pagina | page | page |
| EAN | EAN | EAN |
| handtekening installateur | signature de l'installateur | installer's signature |
| handtekening keurder | signature du contrôleur | inspector's signature |
| fouten | erreurs | errors |
| waarschuwingen | avertissements | warnings |
| info | info | info |
| afwijkingen | dérogations | deviations |
| afgeweken | dérogation accordée | deviation applied |
| overgeslagen pagina's | pages ignorées | skipped pages |
| AREI art. (voor een artikelnummer) | RGIE art. | AREI art. |
| motivatie | motivation | justification |
| door | par | by |
| geen bevindingen | aucun constat | no findings |
| geen kringen | aucun circuit | no circuits |
| ruimte (kolomkop) | pièce | room |
| differentieel (kolomkop) | différentiel | RCD |
| type (in "30 mA type A") | type | type |

De kolomkoppen "différentiel" en "RCD" zijn bewust korter dan de volledige term: de kolom van de kringenlijst is te smal voor "interrupteur différentiel" op A4. De cel zelf toont `30 mA type A`.

## Gebruikers en abonnement

| NL | FR | EN |
|---|---|---|
| eigenaar | propriétaire | owner |
| lid | membre | member |
| organisatie | organisation | organisation |
| uitnodiging | invitation | invitation |
| abonnement | abonnement | subscription |
| proefperiode | période d'essai | free trial |
| formule | formule | plan |
| project | projet | project |
| dossier | dossier | file |
| dossiertaal | langue du dossier | file language |
| versie (van een project) | version | version |
| exporteren | exporter | export |
| bewaren | enregistrer | save |
| ongedaan maken | annuler | undo |
| opnieuw | rétablir | redo |

## Opvolgpunt

Laat het Frans vóór de lancering nalezen door iemand met Frans als moedertaal.
