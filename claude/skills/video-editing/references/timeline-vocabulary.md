# Timeline vocabulary

`timeline.json` (in the video's VFS) is the authored edit. It places items at
absolute output times on uniform video and audio lanes. Every item's `start`
is authoritative; `timeline_pack` can derive those starts from item-array
order during initial speech authoring. Empty output time is not automatically
intentional.

Write it with `files_put {video_id, path: "timeline.json", content, content_type:
"application/json"}`; compile with `timeline_compile {video_id}`, which derives
`resolved/plan.json`. Validation runs inside compile — `ok: false` with
`diagnostics.errors` names the offending paths. Never edit files under
`resolved/`.

## Minimal talking-head timeline

```json
{
  "version": 1,
  "id": "tl_main",
  "sources": {
    "speaker": { "path": "speaker.mp4" }
  },
  "settings": {},
  "captions": { "enabled": true },
  "tracks": [
    {
      "id": "v1",
      "kind": "video",
      "label": "V1",
      "hidden": false,
      "muted": false,
      "ccEnabled": true,
      "items": [
        {
          "id": "it_opening01",
          "kind": "video",
          "asset": { "source": "speaker" },
          "start": 0,
          "srcStart": 11.35,
          "srcEnd": 14.12
        }
      ]
    }
  ]
}
```

The source key must match the transcript stem. Item ids match
`it_[a-z0-9]{8,}` and are stable editorial identity. Track ids only need to be
unique. Tracks require `id`, `kind`, `label`, `hidden`, `muted`, `ccEnabled`,
and `items`.

**Track array order is RENDER ORDER, top-down — and it is semantic.** The
FIRST track in the array draws on top; the LAST video track is the bottom
layer and is treated as the base footage lane (the editor gives it the
footage skin and the caption toggle, and anything on lanes above it renders
over it). So overlay/text/b-roll lanes go BEFORE the main footage lane in
the array, and the main footage lane stays last among the video tracks,
with audio tracks after it. Appending a new overlay lane AFTER the footage
lane flips the layering: overlays vanish behind the footage and the editor
treats the overlay lane as the main cut.

## Output time and source time

A source-backed item uses:

- `start`: absolute output second where it begins.
- `srcStart`, `srcEnd`: the source-time window.
- `rate`: optional playback rate; omit for `1`.
- `asset.source`: a key from top-level `sources`.

Items on one lane may not overlap. Items on different lanes may overlap. A
hole between speech item end and the next speech item's `start` renders as
black and silence. Gaps over 5 ms require metadata on the right item:

```json
"gapBefore": {
  "intent": "intentional",
  "reason": "speaker takes a deliberate beat before the reveal"
}
```

An unmarked speech gap produces a validation warning and a verification error.
A marker without a real gap is invalid. Use `timeline_shift` to move a tail of
one or more lanes while preserving item identity.

The compiler currently accepts only normal-speed source-backed speech. If a
requested edit cannot validate or compile, keep the diagnostic instead of
inventing a second representation.

## Authoring from transcript phrases

Resolve phrases to exact source seconds with:

```
timeline_resolve {video_id, source: "speaker", phrase: "exact transcript words"}
```

Multiple matches require `occurrence` (1-based) or `near` (a source second).
Copy the returned `start` and `end` into the item. An optional `anchorNote`
records the phrase, source, and returned transcript hash; the numeric source
window remains authoritative.

## Packing ordered speech items

Author speech items in their intended output order with placeholder starts,
then derive cumulative placement:

```
timeline_pack {video_id, track: "v1", start: 0}
```

The operation preserves item IDs, source windows, array order, and every other
lane. It accepts overlapping placeholder starts, rewrites the selected lane
atomically, and validates the result. It refuses any selected lane containing
`gapBefore`, so it cannot erase a deliberate gap decision.

## Tightening pauses

Pause tightening is an explicit authoring operation, never a compile side
effect:

```
timeline_desilence {video_id, ripple: true}
timeline_desilence {video_id, track: ["v1"], item: ["it_opening01"], ripple: true}
```

It reads the stored transcript and `silences.json`, replaces selected
source-backed video items with exact sub-items, and stages `timeline.json`.
The first retained sub-item keeps the original item ID; only additional splits
receive new IDs. The defaults retain 130 ms of air around removed pauses: 50 ms
before speech resumes and 80 ms after speech ends.
With `ripple: true`, later items move earlier by the removed duration. Without
it, their absolute starts stay fixed and the removed time becomes gaps.
Defaults may be authored under `settings.desilence`; call parameters override
them.

## Shifting items

```
timeline_shift {video_id, track: ["v1"], after: 12, delta: 0.5}
```

`track` takes one or more lanes. Every item on a selected lane whose `start`
is at or after `after` moves by the same signed `delta`. The operation rejects
the whole edit if it would make the timeline invalid.

## Captions

Global caption generation lives at top level:

```json
{
  "captions": {
    "enabled": true,
    "preset": "grouped",
    "style": { "maxWords": 4, "gapBreakS": 0.6 },
    "layout": { "x": 0.5, "y": 0.85, "w": 0.88, "align": "center" },
    "font": { "family": "Inter", "sizePx": 72, "weight": 700, "color": "#ffffff", "shadow": true },
    "overrides": []
  }
}
```

Leave `font` out entirely and captions use the product default, in both the
render and the UI preview: Assistant (Google font, Hebrew-friendly) at weight
800, 62px, white, centered, bottom-center, no shadow. The default size is
denominated on a 1080 canvas SHORT side — every ratio preset keeps 62px; an
authored `sizePx` stays literal on any canvas.
Any field you do author wins over that default field-by-field. `shadow: true`
draws a soft dark shadow (`3.5px 3.5px 10px rgba(0,0,0,.75)`).

Presets are `grouped` and `opus-karaoke`. A caption override anchors to source
seconds and applies one operation: `replace-text`, `hide`, `break-line`, or
`style`.

An item may also carry authored `captions` cues. Cue `start` and `end` are
relative to the item's output span; optional words use `{t,d,text}` relative to
the cue.

## Visual and audio items

Every item uses the same timing and lane vocabulary. `kind` is one of `video`,
`audio`, `image`, `text`, `html`, or `zoom`.

- Main footage: `kind:"video"`, `asset:{source:"speaker"}`.
- Registered media: `asset:{assetId:"logo"}` (project asset pool — see
  `assets.md`).
- Job-local material: `asset:{file:"assets/logo.png"}`.
- Text: `kind:"text"`, with `text`, optional `layout` and `style`.
- Deterministic markup: `kind:"html"`, with `html`, optional `css`, and
  exactly one of `motion` or legacy `tweens`. `<script>` elements, inline event
  attributes, remote URLs, CSS transitions/animations, and `@keyframes` are
  forbidden; executable logic belongs only in validated `motion.setup`.
- Zoom/reframe: put `zoom` or `reframe` on the relevant item. A `zoom` kind is
  also available for a timed zoom event.
- Audio: use an audio lane and `kind:"audio"`; `gainDb` and `fades` are
  optional.

Non-source items still require `start`, `srcStart`, and `srcEnd`; for static
material use `srcStart:0` and set `srcEnd` to its duration. Layout coordinates
are normalized to the canvas. `z` controls compositing order.

### GSAP motion (preferred)

For real motion graphics, add one inline `MotionProgramV1` to the HTML item:

```json
"motion": {
  "version": 1,
  "runtime": "gsap-3.14.2",
  "plugins": ["MotionPathPlugin"],
  "setup": "({ gsap, q, effects, durationS }) => { const timeline = gsap.timeline({ paused: true }); timeline.add(effects.swipe(q('#chip'), { path: q('#swipe-path'), duration: durationS }), 0); timeline.add(effects.spin(q('#spark'), { duration: 0.7 }), 0); timeline.add(effects.pop(q('#label'), { duration: 0.45 }), 0); return timeline; }"
}
```

`setup` must contain exactly one synchronous function expression. It receives
`{ gsap, root, q, qa, asset, effects, fps, durationS }` and must return one
finite `gsap.timeline({ paused: true })`. GSAP targets must be DOM values scoped
through `root`, `q()`, or `qa()`; selector strings are not accepted as targets.

Pinned plugins available by id are `MotionPathPlugin`, `CustomEase`,
`MorphSVGPlugin`, `DrawSVGPlugin`, `SplitText`, and `TextPlugin`. Runtime
helpers `effects.swipe`, `effects.spin`, and `effects.pop` are ordinary
GSAP-registered effects, not persisted timeline operations. Synchronous custom
functions, callbacks, nested timelines, custom effects/plugins, and DOM/SVG/
canvas mutation are allowed when they pass validation.

Keep all source inline. Imports, external packages, dynamic code, network or
storage APIs, workers, navigation, timers, asynchronous code, unbounded loops,
infinite timelines, and nondeterministic randomness are rejected. HTML/CSS
assets use `{{asset:<id>}}`; setup uses a literal `asset("<id>")`. Every id must
exist in `assets.json` with MIME, SHA-256, and byte-size metadata. The default
seed is the capsule digest; set `motion.seed` only when an explicit stable seed
is useful.

HTML motion renders through the current local helper's isolated
`hf-browser-sandbox@1` path. Hosted rendering rejects HTML with
`MOTION_BACKEND_UNSUPPORTED`; never remove the motion, rasterize it, or accept
an `omitted_layers` fallback.

### Behind the subject

Any overlay item (`html`, `text`, `image`, or asset-backed `video`) can sit
BEHIND the person in the base footage: set `"behindSubject": true` on the
item. The compiler derives a person-cutout layer at the item's `z + 1`, so the
stack reads base footage → your overlay → the subject's body on top.

It needs a matte registered on the source first. Produce one with the
video-render skill's `matte-subject.mjs` helper (runs person segmentation
locally; first run downloads a ~176 MB model):

```
node matte-subject.mjs --input talking-head.mp4 --from 12.0 --to 24.5
```

Upload the resulting alpha webm with `asset_add` (mime `video/webm`) + PUT +
`asset_commit`, then register it on the source and flag the overlay:

```json
"sources": {
  "talking-head": {
    "path": "sources/talking-head.mp4",
    "mattes": [
      { "asset": { "assetId": "ast_..." }, "srcStart": 11.5, "srcEnd": 25.0, "quality": "best" }
    ]
  }
}
```

Matte the SOURCE-time range your window plays (the helper pads 0.5s each
side); re-cuts stay covered while the window's source range stays inside the
matted range. Rules and caveats: without a covering matte the overlay renders
in front and compile warns with the exact range to matte; segments with
zoom/reframe/`frame` skip the cutout (it cannot follow a moving picture yet);
the cutout also covers captions that overlap the person during the window;
graded/LUT footage shows a slight color mismatch on the person. Hosted
rendering rejects behind-subject plans with
`BEHIND_SUBJECT_BACKEND_UNSUPPORTED` — render with the local
`render-video.mjs` helper.

### Legacy tween compatibility

Existing HTML can still use item-level `tweens`. `target` is a selector scoped
to that HTML item, and `at` is seconds from the item's own start:

```json
"tweens": [
  {
    "target": ".progress-fill",
    "from": { "width": "0%" },
    "to": { "width": "100%" },
    "at": 0,
    "durationS": 3,
    "ease": "power2.out"
  },
  {
    "target": ".status-done",
    "from": { "opacity": 0 },
    "to": { "opacity": 1 },
    "at": 3,
    "durationS": 0.25,
    "ease": "none"
  }
]
```

Omit `target` to animate the positioned outer HTML layer. Supported properties
are `x`, `y`, `scale`, `scaleX`, `scaleY`, `rotation`, `opacity`, `filter`,
`color`, `backgroundColor`, `borderRadius`, `width`, and `height`.

HTML layout has two explicit modes. Add `layout.w` and/or `layout.h` to create
a positioned outer box: width-only HTML keeps intrinsic height and treats
`layout.y` as its top edge; a fixed height uses `layout.y` as the vertical
centre; height-only HTML defaults to the full canvas width. With neither
dimension, the outer layer intentionally fills the frame and its contents are
positioned by the authored CSS. A dimensionless `layout` block produces the
`html-layout-full-frame` warning so `x`/`y` cannot be mistaken for box
placement; omit the block for an intentional full-frame layer.

## Web editor publication and locking

Publishing `timeline.json` updates the authored timeline immediately, while
its preview compiles asynchronously. The web editor keeps the last valid
compiled preview visible and adopts the revision-fenced replacement when it is
published. Compilation, loading, and retries are automatic and silent; the
timeline does not expose publication telemetry. A bounded refresh retry does
not require another file write.

While an AI edit run or remote-MCP edit lease owns the live timeline, the web
editor pauses and locks timeline interaction. Remote connector agents bracket
revisions to an existing timeline with `timeline_edit_start` and
`timeline_edit_finish`; start takes a caller-generated UUID `edit_id` that must
be reused on retry, and abandoned leases expire automatically. `Preview
anyway` restores playback, scrubbing, selection, and zoom for that edit only;
mutations, drops, delete, and undo/redo remain disabled. Explicitly pinned
historical versions are immutable and are not blocked.

## Settings and assets

`settings.canvas` is the output frame; it defaults to `1080x1920` (9:16
vertical). Change it through the `timeline_canvas` verb, not a hand-edit —
the verb also refits placed free-rect frames, overlay sizes, and near-default
caption layouts to the new shape. Ratio presets pin the short side to 1080:

| ratio | canvas |
| --- | --- |
| `16:9` | 1920x1080 |
| `9:16` | 1080x1920 |
| `1:1` | 1080x1080 |
| `4:3` | 1440x1080 |
| `3:4` | 1080x1440 |
| `original` | the source's native aspect from probe.json (snaps to a preset within 0.1, else short side 1080) |

`timeline_canvas` takes `ratio` OR explicit `width`+`height` (16–7680, never
both), plus `fit`: `"contain"` (default) keeps every placement fully visible —
black bars are emergent, add a background layer deliberately if they are
unwanted; `"cover"` fills the frame and crops. It returns the refit blast
radius (`refit_item_count`, `reflowed_caption_count`). Picking fit: source
and canvas aspects within ~30% of each other → `cover` is safe; landscape
into vertical (or protected content near the edges — on-screen text, logos,
a second subject) → inspect frames with `qa_framing` first and prefer
`contain` with a deliberate background. Every canvas renders: the hosted
executor covers 16:9/9:16/1:1, anything else goes through the sandbox
executor or the local render helper automatically.

`settings.grade` defaults to `"none"`. Optional audio settings are
`normalize`, `targetLufs`, `truePeakDb`, and `lra`. `colorNormalize` is
`auto`, `off`, or `force`.

Reference registered pool media through `item.asset.assetId`. Declare custom
fonts in `settings.fonts`, then select the family in `captions.font`. See
`assets.md` for the asset workflow.

## Editorial metadata

Items may carry `name`, `beat`, `quote`, `reason`, `exact:true`, and
`provenance`. `exact:true` protects an item from `timeline_desilence`.
`provenance` is `{round, changeId, actor}` where `actor` is `agent`, `user`, or
`system`.

Compile after every structural edit. Its reported path and accepted-key list
are authoritative when this reference and the server differ.
