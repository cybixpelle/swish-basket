# Swish Basket – Jakten på guldbollen

Ett 3D-basketspel i webbläsaren. Snutsa dig förbi försvararna, finta, plocka upp superkrafter och sätt bollen i korgen. Varje mål uppgraderar bollen, från en skrutig boll till **GULDBOLLEN** efter tio mål, men försvaret blir också bättre för varje nivå.

## Starta

Öppna `index.html` i Chrome, Edge, Firefox eller Safari. Det fungerar på dator, surfplatta och telefon. Ingen installation behövs, men internet krävs första gången för Three.js och typsnitten.

**På telefon:** öppna sidan via en webbserver eller ett webbhotell (t.ex. GitHub Pages) och håll telefonen liggande. Dra på vänster halva av skärmen för att gå, och använd knapparna till höger för att skjuta (håll in och släpp) och finta. ⏸ längst ned pausar. På telefon kan man spela Träna och Spela med en spelare. Lägena för två spelare kräver tangentbord.

## Lägen

| Tangent | Läge | Beskrivning |
|---|---|---|
| `1` | **Träna** | Ingen klocka och inga liv. Välj 0 motståndare för fri träning, 1 för **1 mot 1** mot en bot, eller fler. Efter varje skott får du tillbaka bollen på samma plats. |
| `2` | **Spela** | Match mot 1–5 botar i 2 minuter med 3 liv. Spela ensam eller **två tillsammans** mot botarna, med gemensam poäng och gemensamma liv. |
| `3` | **2 spelare** | En mot en på samma tangentbord i 3 minuter, och den med flest poäng vinner. |

Efter att du valt Träna eller Spela väljer du antal spelare och motståndare (med musen eller `←` `→` `↑` `↓`, sedan `Enter`). Valen sparas.

## Kontroller (standard)

| Handling | Ensam | Spelare 1 | Spelare 2 |
|---|---|---|---|
| Gå | Piltangenterna | W A S D | Piltangenterna |
| Skjut (håll in, släpp i grönt) | Space | Space | `-` |
| Finta | Vänster Alt | Q | `.` |
| Passa (tillsammans) | – | E | Höger Shift |

**Välj egna tangenter:** tryck `K` i menyn (eller *Tangenter* i pausmenyn), klicka på en knapp och tryck den tangent du vill ha. Om tangenten redan används byter de två handlingarna plats. P, M, N, Esc och Ctrl går inte att välja. Valen sparas i webbläsaren.

Alltid: `M` musik, `N` ljudeffekter, `P`/`Esc` paus.

## Superkrafter

Superkrafter dyker upp slumpvis på planen och försvinner efter ungefär 11 sekunder (de blinkar innan). Gå på dem för att ta dem.

| | Superkraft | Effekt |
|---|---|---|
| ⤒ | **Hopp-pad** | Glittrande cirkel som får dig att flyga högt. Har du bollen och springer mot korgen blir det **DUNK** (5 poäng). Annars ger skott högt i luften +2. |
| ⚡ | **Superfart** | Du blir jättesnabb i 6 sekunder. |
| ❄️ | **Frysstråle** | Alla motståndare fryser till is i 3,5 sekunder. |
| ×2 | **Dubbla poäng** | Nästa korg inom 12 sekunder ger dubbla poäng. |
| 🎯 | **Prickskytt** | Dubbelt så stort grönt fält och ingen markering i 8 sekunder. |
| 👻 | **Spöke** | Ingen kan sno eller blocka dig, och du går rakt igenom dem, i 6 sekunder. |

## Regler

- Poäng efter avstånd till korgen: under 4 m = 1, 4–6,75 m = 2, 6,75–10 m = 3, över 10 m = 5. Ringen under spelaren visar zonen.
- **Längre bort är svårare:** det gröna fältet blir smalare, markören går fortare och skottet blir mer slumpmässigt.
- Swish: +1. Skott högt i luften efter hopp-paden: +2. Dunk: 5.
- Står en försvarare tätt inpå dig för länge snor hen bollen. I Spela kostar det ett liv.
- Ett skott som är i luften när summern går räknas (buzzer beater).

### Försvarets nivåer

Försvarets nivå är samma som bollens nivå (0–10) och går upp för varje mål. För varje nivå blir botarna:

- snabbare och kvickare
- snabbare på att sno bollen, och de når längre
- svårare att lura med finter
- bättre på att markera skott

Från nivå 2 börjar de också hoppa och blocka. I spel tillsammans täcker en bot lagkamraten och kan snappa passningar.

### 2 spelare

- Den som har bollen anfaller och den andra försvarar. Efter varje skott, block eller stöld byter ni.
- Försvararen hoppar och blockar med **skjut-knappen** och snor bollen med **finta-knappen**. Missar man tappar man balansen en kort stund.
- Superkrafterna gäller här också. Frysstrålen fryser motspelaren.

## Kod

| Fil | Innehåll |
|---|---|
| `js/world.js` | Arenan: plan, korg, nät, publik, reklamskyltar, storbildsskärm, ljus |
| `js/actors.js` | Spelarfigurer och bollens elva nivåer (texturer genereras i koden) |
| `js/audio.js` | All musik och alla ljud syntetiseras med Web Audio, så det finns inga ljudfiler |
| `js/controls.js` | Tangentbindningar och redigeraren för egna tangenter |
| `js/game.js` | Lägen, försvarar-AI med nivåer, samarbete och passningar, PvP, superkrafter, dunk, skottfysik, touchstyrning, kamera, HUD och scoreboard |
