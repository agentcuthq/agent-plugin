# Smoothing speech joins (`smooth_joins_start`)

This optional run applies short Constant Power audio crossfades at compiled
speech joins. The picture stays a hard cut and total output duration does not
change. Nothing runs automatically during render.

Run it after `timeline_compile` when a listen or verification pass finds
clicks, pops, or chopped word endings:

```
smooth_joins_start {video_id}
smooth_joins_start {video_id, crossfade_ms: 90}
smooth_joins_start {video_id, joins: [{index: 3, crossfade_ms: 40}, {index: 7, crossfade_ms: 220}]}
```

| Parameter | Default | Meaning |
|---|---|---|
| `crossfade_ms` | `130` | Transition at scored joins; `0` disables it. |
| `curve` | `equal-power` | Fade shape (`equal-power` or `linear`). |
| `max_ms` | `500` | Ceiling on one join. |
| `joins` | — | Per-join overrides: `[{index, crossfade_ms}]`. |

It returns `{run_id}` — poll `run_status`, then read `audio/joined.json` with
`files_get` for the per-join report.

The run consumes `plan.speechJoins`, not inferred adjacency. Joins with more
than 5 ms of marked intentional output gap are skipped; that gap is real
timeline content and must not be crossfaded away. The same join indices are
used by verification. Use the reported left and right item ids to find the
authored items when the edit itself needs changing.

Keep `equal-power` unless the material calls for a deliberate amplitude dip.
The crossfade can use only the source handles around each item boundary, so
the applied duration may be clamped below the request.

The run writes `audio/joined.m4a` and `audio/joined.json`:

```jsonc
{
  "plan_sha256": "…",
  "params": { "crossfade_ms": 130, "curve": "equal-power", "max_ms": 500 },
  "total_duration_s": 47.213,
  "segments": 42,
  "joins": [
    { "index": 0, "requested_ms": 130, "applied_ms": 130, "handle_ms": 1840, "clamped": false },
    { "index": 1, "requested_ms": 130, "applied_ms": 52, "handle_ms": 52, "clamped": true,
      "reason": "limited by available source handle" }
  ]
}
```

`applied_ms` is the transition actually rendered. Asking for more cannot widen
a handle-limited join; adjust the relevant item's source window and compile
again when the edit permits it.

The artifact is accepted only when `plan_sha256` matches the current
`resolved/plan.json`. Therefore the order is `timeline_compile` →
`smooth_joins_start` → render, and the run must be redone after each recompile
whose output should use smoothed audio.
