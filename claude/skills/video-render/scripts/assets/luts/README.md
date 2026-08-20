# Bundled log-to-Rec.709 LUTs — PROOF OF CONCEPT ONLY

These two `.cube` files were extracted from ChatCut desktop v0.1.11
(`io.chatcut.desktop`, app.asar `out/renderer/luts/`):

- `slog3-to-709.cube` — Sony S-Log3 / S-Gamut3.Cine → s709 (33³)
- `clog3-to-709.cube` — Canon Cinema Gamut / Canon Log 3 → Canon 709 (33³).
  The file header carries `Copyright(c) 2025 Canon Inc. All Rights Reserved.`
  Canon distributes it under a personal-use EULA, not a redistribution grant.

They MUST be replaced by analytically generated LUTs (built from the published
transfer-function formulas and gamut matrices) before any public launch. Do not
ship these bytes.

## Lesson from the first generation attempt (d7d8411, reverted 2026-08-15)

A first analytical generator was landed and then reverted: it applied the
display OETF directly to scene-linear values with **no OOTF / highlight
rolloff**, so everything above display white hard-clipped — about 5 stops of
highlight information gone, and 13 of the 33 neutral-ramp steps came out pure
white. Requirements for any future replacement:

- It MUST include a highlight rolloff (an OOTF / tone-mapping stage between
  scene-linear and the display OETF), not a bare linear→OETF encode.
- It MUST be numerically validated against these reference files before the
  swap. Known oracle triplets: S-Log3 code 420/1023 (18% gray) must land at
  ~0.437 display; the neutral ramp must NOT saturate to white before input
  code ~0.9.
