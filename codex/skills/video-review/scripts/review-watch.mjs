#!/usr/bin/env node

// src/review-watch/review-watch.ts
var LONG_POLL_SECONDS = 240;
var RETRY_BACKOFF_MS = [2e3, 5e3, 15e3, 3e4];
function fatal(message, code) {
  process.stdout.write(`${JSON.stringify({ status: "error", message })}
`);
  process.exit(code);
}
function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg || !arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (key === "once") {
      args[key] = true;
    } else if (next !== void 0 && !next.startsWith("--")) {
      args[key] = next;
      i++;
    } else {
      args[key] = true;
    }
  }
  const token = typeof args.token === "string" ? args.token : process.env.AGENTCUT_WATCH_TOKEN ?? "";
  if (!/^crvw_[A-Za-z0-9_-]{43}$/.test(token)) {
    fatal("missing or malformed --token (crvw_\u2026); mint one with the review_watch_session verb", 2);
  }
  const endpoint = typeof args.endpoint === "string" ? args.endpoint.replace(/\/$/, "") : process.env.AGENTCUT_ENDPOINT ?? "";
  if (!/^https?:\/\//.test(endpoint)) fatal("missing or malformed --endpoint (https://\u2026)", 2);
  const maxSeconds = args["max-seconds"] !== void 0 ? Number(args["max-seconds"]) : 570;
  if (!Number.isFinite(maxSeconds) || maxSeconds < 1 || maxSeconds > 6 * 60 * 60) {
    fatal("--max-seconds must be between 1 and 21600", 2);
  }
  return { token, endpoint, maxSeconds, once: args.once === true };
}
async function pollOnce(args, waitSeconds) {
  let response;
  try {
    response = await fetch(`${args.endpoint}/api/v1/review-watch/inbox?wait_seconds=${waitSeconds}`, {
      headers: { authorization: `Bearer ${args.token}` },
      signal: AbortSignal.timeout((waitSeconds + 60) * 1e3)
    });
  } catch (error) {
    return { kind: "retryable", detail: error instanceof Error ? error.message : String(error) };
  }
  if (response.status === 401 || response.status === 410) {
    fatal(`watch token rejected (${response.status}); mint a new one with review_watch_session`, 2);
  }
  if (!response.ok) {
    return { kind: "retryable", detail: `inbox returned ${response.status}` };
  }
  const body = await response.json().catch(() => null);
  const open = (body?.videos ?? []).filter((video) => video.open_count > 0);
  return open.length > 0 ? { kind: "comments", videos: open } : { kind: "idle" };
}
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const deadline = Date.now() + args.maxSeconds * 1e3;
  let retries = 0;
  for (; ; ) {
    const remaining = Math.max(0, Math.floor((deadline - Date.now()) / 1e3));
    const waitSeconds = args.once ? 0 : Math.min(LONG_POLL_SECONDS, remaining);
    const result = await pollOnce(args, waitSeconds);
    if (result.kind === "comments") {
      process.stdout.write(`${JSON.stringify({ status: "comments", videos: result.videos })}
`);
      process.exit(0);
    }
    if (result.kind === "retryable") {
      const backoff = RETRY_BACKOFF_MS[Math.min(retries, RETRY_BACKOFF_MS.length - 1)] ?? 3e4;
      retries++;
      process.stderr.write(`review-watch: ${result.detail}; retrying in ${backoff / 1e3}s
`);
      await new Promise((resolve) => setTimeout(resolve, Math.min(backoff, Math.max(deadline - Date.now(), 0))));
    } else {
      retries = 0;
      process.stderr.write(`review-watch: no open comments (${remaining}s left)
`);
    }
    if (args.once || Date.now() >= deadline) {
      process.stdout.write(`${JSON.stringify({ status: "idle" })}
`);
      process.exit(3);
    }
  }
}
void main();
