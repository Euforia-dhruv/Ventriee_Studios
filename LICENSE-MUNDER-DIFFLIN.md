# Vendored code and art: munder-difflin

The office floor in `src/renderer/src/office/` is a port of
[munder-difflin](https://github.com/HarnessMD/munder-difflin) (v0.4.6).

## Source code: MIT

MIT License

Copyright (c) 2026 Chaitanya Giri

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## What was changed for Ventriee

- `themeRegistry.ts` and `themeLoader.ts` were rewritten to expose a single
  office theme instead of the original multi-theme, cafe/errand-driven config.
- `Character.ts`, `ThoughtBubble.ts` and `MessageEnvelope.ts` had their
  `@/design/tokens` import repointed at the local `tokens.ts`.
- `cast.ts` maps Ventriee worker roles to the office cast and no longer depends
  on the original show-specific wiring.
- `components/OfficeFloor.tsx` is new: it binds the engine to Ventriee's agent
  and message state.
- Unused modules (theme-specific config, speech-act wiring for the original
  app) were dropped.

## Tilesets and map art: LimeZu, not MIT

The pixel art under `src/renderer/src/office/assets/` (the three PNG tilesets
and the Tiled map that is built from them) is "Modern Interiors - RPG Tileset
[16X16]" by LimeZu, under the LimeZu Complete Version license. That license
permits use and modification in commercial and non-commercial projects and
requires credit to LimeZu (https://limezu.itch.io/).

The character sprites are not LimeZu art. They are drawn procedurally in
`src/renderer/src/office/portraitArt.ts` and fall under the MIT license above.
