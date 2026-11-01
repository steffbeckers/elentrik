# Zelf een situatieplan tekenen

De gebruiker heeft implementatie van de besproken OpenPlan3D-proefintegratie gevraagd. Installateurs zonder bouwplan krijgen naast uploaden een lokaal gehoste 2D-editor voor muren, deuren, ramen en tekst. Iedere situatiepagina blijft afzonderlijk bewerkbaar. Geen externe OpenPlan3D-dienst of account.

## Aanpak
OpenPlan3D is gekozen boven React Planner (oude React-afhankelijkheden) en een volledig eigen tekenkern. Integreer de MIT-gelicentieerde 2D-canvas met zijn transitieve bronafhankelijkheden, vastgepind op upstream commit 98f9cb467e4045c6abc5d9880ada1f03dff50c68. Een kleine Svelte-shell draait in een lokaal iframe zodat shortcuts, styles en stores de Vue-editor niet beïnvloeden. Geen 3D-, meubel-, AI- of cloudinterface. Lokale broncode, licentie en reproductie-instructies worden meegeleverd.

## Gedrag en opslag
Een schermvullende dialoog biedt tekenen, selecteren, ongedaan maken, opnieuw en plan gebruiken. Bewaar de OpenPlan3D-projectgegevens in het bestaande installatiedocument plus het exportkader in cm en pixels per cm. Genereer een PNG via de gedeelde OpenPlan3D-renderer, upload via de bestaande bestands-API en wijzig pas na succes de situatiepagina in één undo-stap. Annuleren verandert het document niet. Opnieuw openen laadt dezelfde tekening. Bestaande symboolposities worden omgerekend bij een gewijzigd exportkader; bestaande uploadplannen blijven werken. PDF-export gebruikt de bestaande rasterroute.

## Grenzen
Behoud NL/FR/EN voor Elentrik-bediening. Iframe-berichten controleren bronvenster, origin, sessie en formaat. Limiteer project- en rastergrootte. Alleen-lezen, een verwijderd project en een mislukte upload mogen niets overschrijven. Dit is een 2D-integratie, geen volledige OpenPlan3D-app. Elke verdieping krijgt een eigen situatiepagina.
