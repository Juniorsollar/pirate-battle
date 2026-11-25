# Assets: sources and licenses

## Provided assets

Everything in this folder comes from the challenge repository [junglegaming/game-developer-challenge](https://github.com/junglegaming/game-developer-challenge) (commit `3158914`) and is used **unchanged**, as the challenge instructs ("Utilize os assets fornecidos como base visual"):

- `png/`, `spritesheet/` (PNG, XML and the UI JSON atlases), `tilesheet/`, `vector/`, `sounds/`
- `sample*.png`, `preview.png`, `ui_scene_background.png`, `logo_jungle_gaming.svg`

The challenge repository does not include a license file for these assets. They are used here only for this evaluation, under the terms set by Jungle Gaming. The Jungle Gaming logo and the Pirate Battle UI belong to their owners.

## Derived files

| File | Source | How it was made |
| --- | --- | --- |
| `spritesheet/ships_miscellaneous_sheet.json` | `spritesheet/ships_miscellaneous_sheet.xml` | `npm run convert:atlas` (`scripts/convert-atlas.mjs`): the same frames converted from Starling XML to TexturePacker JSON, the atlas format PixiJS loads natively |
| `spritesheet/ships_miscellaneous_sheet_retina.json` | `spritesheet/ships_miscellaneous_sheet_retina.xml` | Same conversion. The provided "retina" ship sheet has the same size and frames as the 1× sheet, so it is declared with `scale: 1` |

No image or sound was edited, optimized or added.

## Complementary resources

| Resource | Source | License |
| --- | --- | --- |
| Roboto font (weights 400, 700, 900) | npm package [`@fontsource/roboto`](https://www.npmjs.com/package/@fontsource/roboto) (Google Fonts) | SIL Open Font License 1.1 (see `node_modules/@fontsource/roboto/LICENSE`) |

The font is bundled instead of relying on system fonts. Text then has the same metrics on Windows, macOS and Linux, which keeps the layout and the visual test baselines consistent.
