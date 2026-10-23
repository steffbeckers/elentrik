# Woordenlijst: Nederlands, Frans en Engels

Dit is de bron voor alle vertalingen in Elentrik: de interface (`apps/web/i18n/locales`), de AREI-berichten (`packages/arei/src/berichten`), de teksten van de pdf (`packages/render/src/teksten`) en de mails. Wie een tekst vertaalt, volgt deze lijst. Ontbreekt een term, voeg hem dan eerst hier toe en gebruik hem daarna overal gelijk.

De vertalingen zijn eigen werk (clean room). Ze nemen geen tekst of terminologie van andere software over.

## Afspraken

- **Talen:** `nl` (standaard), `fr` en `en`. De locales zijn `nl-BE`, `fr-BE` en `en-GB`.
- **Belgisch Frans:** we spreken de gebruiker aan met "vous". Waar een getal voluit staat, schrijven we "septante" en "nonante" (niet "soixante-dix" en "quatre-vingt-dix"). Cijfers in de interface en op het schema blijven cijfers.
- **Engels:** Brits Engels (`en-GB`). "Socket" en "tumble dryer", geen "outlet" en "dryer".
- **Ongewijzigd in elke taal:** de waarden en de artikelnummers zelf, zodat een keurder in elke taal hetzelfde leest:
  - artikelnummers van het AREI/RGIE;
  - grenswaarden en andere waarden (`30 mA`, `16 A`, `2,5 mm²`): de waarde en de eenheid zijn in elke taal dezelfde; alleen de schrijfwijze van het getal volgt de locale (zie hieronder).
- **Notatie van getallen:** in lopende tekst (de interface en de berichten in de pdf) volgt de notatie van een getal de locale van de taal: `2,5 mm²` in het Nederlands en Frans, `2.5 mm²` in het Engels. Alleen de technische labels op het schema houden de Belgische decimale komma, in elke taal, zoals `XVB 3G2,5`. Die labels worden nooit vertaald of herschreven.
- **Franse typografie:** voor `:`, `;`, `?` en `!` staat een vaste spatie (U+00A0), en de duizendtalscheiding van `Intl` (fr-BE) is een smalle vaste spatie (U+202F). De pdf breekt een regel nooit op die spaties.
- **Niet vertaald:** wat de gebruiker zelf typt (projectnamen, klantgegevens, eigen ruimtenamen, de motivatie van een afwijking).
- **Plaatshouders en meervoudsvormen:** `{naam}` en `|` staan per sleutel identiek in elke taal.
- **Datums in de pdf:** dag/maand/jaar in de locale van de dossiertaal, met een jaar van vier cijfers in elke taal: `19/10/2026` (nl, fr en en). Een dag onder de 10 heeft één cijfer (`5/03/2026`). Dit geldt voor de cartouche en voor de datum van een afwijking.
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

## Eigenschappen (`velden`)

De veldnamen en keuzes van het paneel Eigenschappen (`velden.*` in de vertaalbestanden). Eenheden (`mA`, `A`, `kA`, `mm²`, `W`), de polen (1 tot 4), het type van een differentieel (AC, A, F, B) en de curve van een automaat (B, C, D) blijven in elke taal dezelfde.

| NL | FR | EN |
|---|---|---|
| label | libellé | label |
| ruimte (veld) | pièce | room |
| kortsluitvermogen | pouvoir de coupure | breaking capacity |
| aantal geleiders | nombre de conducteurs | number of conductors |
| plaatsing | pose | installation method |
| inbouw / opbouw | encastré / apparent | flush-mounted / surface-mounted |
| in buis / in de grond | sous tube / enterré | in conduit / underground |
| aantal | nombre | quantity |
| randaarde | contact de terre | earth contact |
| kinderbeveiliging | sécurité enfants | child protection |
| waterdicht | étanche | waterproof |
| vermogen | puissance | power |
| soort | type | type |
| standaard | standard | standard |
| TL | tube fluorescent | fluorescent tube |
| spot | spot | spotlight |
| noodverlichting | éclairage de secours | emergency lighting |
| enkel / dubbel | simple / double | single / double |
| wissel | va-et-vient | two-way |
| kruis | permutateur | intermediate |
| dimmer | variateur | dimmer |
| drukknop | bouton-poussoir | push button |

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
| dossier | dossier | dossier |
| dossiertaal | langue du dossier | dossier language |
| versie (van een project) | version | version |
| exporteren | exporter | export |
| bewaren | enregistrer | save |
| ongedaan maken | annuler | undo |
| opnieuw | rétablir | redo |

## Interface

| NL | FR | EN |
|---|---|---|
| onderbord | tableau divisionnaire | sub-board |
| onderdeel (in de editor) | élément | component |
| sjabloon | modèle | template |
| concept (lokaal) | brouillon | draft |
| eigenschappen | propriétés | properties |
| alleen lezen | lecture seule | read-only |
| inloggen / uitloggen | se connecter / se déconnecter | sign in / sign out |
| registreren | s'inscrire | sign up |
| inloglink | lien de connexion | sign-in link |
| bedrijf | entreprise | company |
| bedrijfsgegevens | données de l'entreprise | company details |
| ondernemingsnummer | numéro d'entreprise | company number |
| bus (in een adres) | boîte | box |
| gemeente | commune | town |
| cartouche | cartouche | title block |
| maandelijks / jaarlijks (formule) | mensuel / annuel | monthly / yearly |
| btw | TVA | VAT |
| taal | langue | language |

De namen van de talen staan altijd in hun eigen taal: "Nederlands", "Français", "English". In de Franse interface staat een vaste spatie vóór `:`, `?`, `!` en `;`, en binnen « ».

## Opvolgpunt

Laat het Frans vóór de lancering nalezen door iemand met Frans als moedertaal.
