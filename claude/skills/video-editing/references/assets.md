# Assets — the project pool, fonts, and referencing media

Anything in a cut that is not the source video is an **asset**: a logo, a GIF,
a b-roll clip, a music bed, a sound effect, a font. Over the AgentCut MCP
connector, reusable media lives in the **project asset pool** — add it once,
reference it from any video's timeline in that project.

## The project asset pool

Three calls end to end (full mechanics in the `asset-import` skill):

1. **`asset_add`** `{project_id, filename, content_type, sha256?}` → returns
   `{asset_id, upload_url}`. Pass `sha256` of the bytes: identical ready bytes
   already in this project come back as `{asset_id, deduped: true}` with no
   upload at all.
2. **PUT the bytes** to `upload_url` (single PUT, `Content-Type` matching what
   you declared).
3. **`asset_commit`** `{asset_id, width?, height?, duration_s?}` → verifies the
   bytes landed and flips the asset ready.

**Search before you import** — `assets_search {project_id, name?}` — and reuse
the existing `asset_id` when the user references media without attaching it
("use the logo again", "the whoosh from before"). Look at one with
`asset_inspect` (images and gifs come back inline). `asset_delete` is
two-phase: the first call returns an impact report of every timeline
referencing the asset; only `confirm: true` deletes.

Accepted content types: png/jpeg/webp/gif images, mp4/quicktime/webm video,
mpeg/mp4/wav/ogg audio. Fonts are rejected by the pool — see Fonts below.

**What renders today:** image items composite on cloud renders. Gif, video,
and audio pool refs resolve to media but the cloud compositor does not
composite those event kinds yet — a render whose refs resolve nowhere says so
in its `unresolved_refs` field instead of silently omitting the item.

## Referencing an asset from `timeline.json`

Reference the **id**, not a path:

| kind | where | minimal reference |
|---|---|---|
| `image` | video lane item | `{"kind":"image","asset":{"assetId":"<asset_id>"}}` |
| `gif` | video lane item | `{"kind":"image","asset":{"assetId":"<asset_id>"}}` |
| `video` | video lane item | `{"kind":"video","asset":{"assetId":"<asset_id>"}}` |
| `audio` | audio lane item | `{"kind":"audio","asset":{"assetId":"<asset_id>"},"gainDb":-18}` |

Non-source items still require `start`, `srcStart`, and `srcEnd`; for static
material use `srcStart:0` and set `srcEnd` to its duration. Use `asset.file`
only for deliberate job-local files that already exist in the video's VFS
under `assets/`.

See `timeline-vocabulary.md` for the complete lane and item shapes.

## Fonts

Custom fonts bind by family name: declare the face in `settings.fonts`, then
select the family in `captions.font`. Over the connector, declare Google
families by **source** — the renderer embeds the face at render time:

```json
{
  "settings": {
    "fonts": [ { "family": "Bebas Neue", "source": "google", "weights": [400] } ]
  },
  "captions": {
    "enabled": true,
    "preset": "grouped",
    "layout": { "x": 0.5, "y": 0.28, "w": 0.86, "align": "center" },
    "font": { "family": "Bebas Neue", "sizePx": 72, "weight": 400, "color": "#ffffff", "shadow": true }
  }
}
```

Any family on fonts.google.com works — spell it exactly as fonts.google.com
does. A family used in `captions.font` but not declared in `settings.fonts`
is the `unknown-font-family` error. Every `font` field is optional: anything
left out falls back to the product default (Assistant 800, 62px on the
1080x1920 canvas, white, no shadow).

A font file the user supplies (not on Google Fonts) can be placed in the
video's VFS (`files_put` / `upload_start {kind: "jobfile"}` for the binary)
and declared as a bundled face via the sandbox `bash` tool if needed — but
prefer `source: "google"` whenever the family exists there.

## Diagnostics you will actually hit

| code | meaning | fix |
|---|---|---|
| `asset-unknown` | the timeline references an id that is not registered | `assets_search` for the right id, or add the asset |
| `asset-missing` | the id is registered but its bytes are gone | re-add the asset (sha256 dedupe restores it) |
| `asset-kind-mismatch` | a `gif` layer got a video asset, a font used as a layer, … | use the right layer kind |
| `unknown-font-family` | `captions.font.family` is not in `settings.fonts` | declare it in `settings.fonts` |
| `bad-font-source` | a `settings.fonts` entry has both or neither of `asset` / `source` | pick exactly one |

## Guarantees worth relying on

- **Dedupe is by content**, not by name. The same file added twice under two
  names is one asset.
- The pool is project-scoped: an `asset_id` works in every video of its
  project, and nowhere else.
