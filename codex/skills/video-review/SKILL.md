---
name: video-review
description: >-
  How review COMMENTS on AgentCut videos reach this session and get resolved —
  the owner leaves timecoded comments on the video's review page instead of
  editing the timeline themselves, and this session turns each comment into an
  edit. Covers the review_inbox check, the claim/pull → edit → render →
  review_resolve cycle, reply etiquette, and the opt-in WATCH MODE (the
  bundled review-watch.mjs waiter blocks for free until new comments arrive,
  so this same session can babysit a review page at near-zero cost). Use when
  the user mentions review comments, feedback on the cut, "check my
  comments", "watch the review page", or when review_inbox reports open
  comments at session start.
---

# Review comments → edits (AgentCut)

The review page is how non-editors direct the edit: they watch the current
cut and pin comments to timecodes ("cut this pause", "logo holds too long").
Those comments land in an inbox this session reads. You do the editing with
the normal timeline-authoring verbs; this skill only covers how comments get in
and how resolutions get back out.

## Session-start check (cheap, do it once)

At the start of a session — or whenever the user asks about feedback — call
`review_inbox` (no arguments, one call). If any video has `open_count > 0`,
tell the user what's waiting ("3 open comments on *Nova teaser*") and offer
to handle them. Never start editing unprompted; the user decides.

## The cycle

1. **`review_pull { video_id }`** — atomically claims every open comment and
   returns one instruction: `[cmt_<id> #N @ mm:ss.s] "…" — by <name>` lines
   (ranges appear as `RANGE mm:ss.s–mm:ss.s`; indented `↳` lines are thread
   replies, context not extra tasks). Timecodes refer to the CURRENT cut the
   reviewer watched, not the raw source — resolve them against the compiled
   timeline. Claimed comments show IN PROGRESS on the review page.
2. **Edit** — the video-editing skill's normal flow: author a complete
   candidate, call `timeline_check`, then `timeline_commit`. Start a preview
   with `render_start` and verification with `verify_start`; poll either run
   once at a time with `run_status`.
3. **`review_resolve { video_id, claim_id, resolutions }`** — one outcome per
   `cmt_` marker: `"fixed"` with a short reply, `"wont_fix"` with the reason,
   or `"skipped"` to hand it back to OPEN. Publish/render BEFORE resolving so
   `fixed_in_seq` (defaults to the latest completed version) points at the
   version that actually contains the fix.

The claim is soft: it expires after `claim_minutes` (default 30) and the
comments flip back to OPEN on their own — a crashed session wedges nothing.
Long edit still going? Re-call `review_pull` with the same `claim_id` to
renew. Giving up early? `review_release` is the polite exit.

## Reply etiquette

Replies appear verbatim on the commenter's card. 1–2 sentences, concrete,
about what changed: "Held the logo 12 more frames; tagline enters at 00:03."
No apologies, no restating their request, no process narration.

## Watch mode (opt-in ONLY)

When the user explicitly asks you to watch/babysit the review page ("watch my
comments", "stay on review duty"):

1. `review_watch_session { video_id }` (once) → `{ watch_token, endpoint }`.
   The token is independent for THIS agent session and listens only to that
   video. It becomes visibly connected on the review page after the waiter
   makes its first inbox request; minting the token alone is not presence.
2. Loop — run the bundled waiter as a normal blocking shell command:

   ```
   node <this skill dir>/scripts/review-watch.mjs \
     --token <watch_token> --endpoint <endpoint> --max-seconds 570
   ```

   It long-polls the inbox over plain HTTPS (zero cost while blocked) and
   exits `0` with `{status:"comments", videos:[…]}` the moment open comments
   appear; exit `3` (`{status:"idle"}`) means the wait elapsed quietly — just
   run it again; exit `2` means the token is bad/expired — mint a new one
   with `review_watch_session { video_id }`.
3. On comments: run the full cycle above IN THIS SESSION, then return to the
   waiter loop.

Rules: the waiter IS the sleep — this loop is the sanctioned exception to the
"one sleep-and-recheck per turn" doctrine, and the only polling you do is
running the waiter again. Keep renewing idle waits until the user stops or
closes this session. Stop immediately when the user interjects unless they
explicitly ask review duty to continue, never watch while also mid-cycle, and
never spawn another session to do the watching. A stopped waiter disappears
from the review page within about one minute; after every resolved batch,
return to the waiter so the page becomes connected again.
