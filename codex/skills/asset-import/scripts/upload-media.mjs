#!/usr/bin/env node
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/cloud/upload-stream.ts
import { request as httpRequest } from "http";
import { request as httpsRequest } from "https";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
function defaultBackoffMs(attempt) {
  return 500 * 2 ** (attempt - 1);
}
async function* windows(source) {
  for (let pos = 0; pos < source.size; ) {
    const buf = await source.readSlice(pos, STREAM_WINDOW_BYTES);
    if (buf.length === 0) throw new Error(`short read at byte ${pos} of streamed source`);
    pos += buf.length;
    yield buf;
  }
}
function attemptPut(url, source, contentType, idleTimeoutMs) {
  return new Promise((resolve5, reject) => {
    const reqFn = url.protocol === "http:" ? httpRequest : httpsRequest;
    const req = reqFn(
      url,
      {
        method: "PUT",
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(source.size)
        }
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("error", reject);
        res.on(
          "end",
          () => resolve5({
            status: res.statusCode ?? 0,
            statusText: res.statusMessage ?? "",
            body: Buffer.concat(chunks).toString("utf8")
          })
        );
      }
    );
    req.setTimeout(idleTimeoutMs, () => {
      req.destroy(new Error(`socket idle for ${idleTimeoutMs}ms during streamed PUT`));
    });
    req.on("error", reject);
    pipeline(Readable.from(windows(source)), req).catch(reject);
  });
}
var STREAM_WINDOW_BYTES, STREAM_MAX_ATTEMPTS, STREAM_IDLE_TIMEOUT_MS, putFileStream;
var init_upload_stream = __esm({
  "src/cloud/upload-stream.ts"() {
    "use strict";
    STREAM_WINDOW_BYTES = 8 * 1024 * 1024;
    STREAM_MAX_ATTEMPTS = 5;
    STREAM_IDLE_TIMEOUT_MS = 6e4;
    putFileStream = async (url, source, contentType, opts = {}) => {
      const maxAttempts = opts.maxAttempts ?? STREAM_MAX_ATTEMPTS;
      const idleTimeoutMs = opts.idleTimeoutMs ?? STREAM_IDLE_TIMEOUT_MS;
      const backoffMs = opts.backoffMs ?? defaultBackoffMs;
      const target = new URL(url);
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        let res;
        try {
          res = await attemptPut(target, source, contentType, idleTimeoutMs);
        } catch (err) {
          if (attempt === maxAttempts) {
            const detail = err instanceof Error ? err.message : String(err);
            throw new Error(
              `streamed upload of ${source.size} bytes to ${target.host} failed after ${attempt} attempt${attempt === 1 ? "" : "s"}: ${detail}`,
              { cause: err }
            );
          }
          await new Promise((r) => setTimeout(r, backoffMs(attempt)));
          continue;
        }
        if (res.status >= 200 && res.status < 300) return;
        const failure = new Error(
          `streamed upload failed: HTTP ${res.status} ${res.statusText} for ${target.host}` + (res.body ? ` \u2014 ${res.body.slice(0, 300)}` : "")
        );
        if (res.status < 500 || attempt === maxAttempts) throw failure;
        await new Promise((r) => setTimeout(r, backoffMs(attempt)));
      }
      throw new Error("streamed upload: retry loop exited unexpectedly");
    };
  }
});

// src/cloud/client.ts
import { createHash } from "crypto";
import { createWriteStream, mkdirSync, statSync, writeFileSync } from "fs";
import { dirname, join as pathJoin } from "path";
import { Readable as Readable2 } from "stream";
import { pipeline as pipeline2 } from "stream/promises";
function stripTrailingSlash(base) {
  return base.replace(/\/+$/, "");
}
function rendersUrl(base) {
  return `${stripTrailingSlash(base)}/api/v1/renders`;
}
function renderUrl(base, renderId) {
  return `${stripTrailingSlash(base)}/api/v1/renders/${encodeURIComponent(renderId)}`;
}
function qaUrl(base, videoId) {
  return `${stripTrailingSlash(base)}/api/v1/videos/${encodeURIComponent(videoId)}/qa`;
}
function reviewUrl(base, videoId) {
  return `${stripTrailingSlash(base)}/api/v1/videos/${encodeURIComponent(videoId)}/review`;
}
function artifactsUrl(base, videoId, name) {
  const root = `${stripTrailingSlash(base)}/api/v1/videos/${encodeURIComponent(videoId)}/artifacts`;
  return name ? `${root}?name=${encodeURIComponent(name)}` : root;
}
function assetsUrl(base) {
  return `${stripTrailingSlash(base)}/api/v1/assets`;
}
function meUrl(base) {
  return `${stripTrailingSlash(base)}/api/v1/me`;
}
function projectsUrl(base) {
  return `${stripTrailingSlash(base)}/api/v1/projects`;
}
function importSessionsUrl(base) {
  return `${stripTrailingSlash(base)}/api/v1/import-sessions`;
}
function projectVideosUrl(base, projectId) {
  return `${stripTrailingSlash(base)}/api/v1/projects/${encodeURIComponent(projectId)}/videos`;
}
function webVideoUrl(base, projectId, videoId) {
  return `${stripTrailingSlash(base)}/projects/${encodeURIComponent(projectId)}/videos/${encodeURIComponent(videoId)}`;
}
function runUrl(base, runId) {
  return `${stripTrailingSlash(base)}/api/v1/runs/${encodeURIComponent(runId)}`;
}
function multipartUrl(base, tail) {
  const root = `${stripTrailingSlash(base)}/api/v1/uploads/multipart`;
  return tail ? `${root}/${tail}` : root;
}
function multipartRelayUrl(base, uploadId, n, i, of) {
  return `${multipartUrl(base, "relay")}?upload_id=${encodeURIComponent(uploadId)}&n=${n}&i=${i}&of=${of}`;
}
function videoUrl(base, videoId, tail) {
  return `${stripTrailingSlash(base)}/api/v1/videos/${encodeURIComponent(videoId)}/${tail}`;
}
function filesUrl(base, videoId, path) {
  const root = videoUrl(base, videoId, "files");
  return path !== void 0 ? `${root}?path=${encodeURIComponent(path)}` : root;
}
function transcribeUrl(base, videoId) {
  return videoUrl(base, videoId, "transcribe");
}
function ingestUrl(base, videoId) {
  return videoUrl(base, videoId, "ingest");
}
function compileUrl(base, videoId) {
  return videoUrl(base, videoId, "compile");
}
function resolveUrl(base, videoId) {
  return videoUrl(base, videoId, "resolve");
}
function verifyUrl(base, videoId) {
  return videoUrl(base, videoId, "verify");
}
function smoothJoinsUrl(base, videoId) {
  return videoUrl(base, videoId, "smooth-joins");
}
function composeUrl(base, videoId) {
  return videoUrl(base, videoId, "compose");
}
function asRecord(data, ctx) {
  if (data === null || typeof data !== "object") throw new Error(`unexpected ${ctx} response: ${JSON.stringify(data)}`);
  return data;
}
function parseRenderCreate(data) {
  const o = asRecord(data, "render-create");
  const renderId = o.render_id;
  if (typeof renderId !== "string" || renderId === "") throw new Error(`render response missing render_id: ${JSON.stringify(data)}`);
  return { renderId, status: o.status ?? "pending" };
}
function parseRenderState(data) {
  const o = asRecord(data, "render-status");
  const status = o.status;
  if (typeof status !== "string") throw new Error(`render status response missing status: ${JSON.stringify(data)}`);
  return {
    status,
    ...typeof o.phase === "string" ? { phase: o.phase } : {},
    ...typeof o.started_at === "string" ? { startedAt: o.started_at } : {},
    ...typeof o.frames_done === "number" ? { framesDone: o.frames_done } : {},
    ...typeof o.frames_total === "number" ? { framesTotal: o.frames_total } : {},
    ...typeof o.percent === "number" ? { percent: o.percent } : {},
    videoUrl: typeof o.video_url === "string" ? o.video_url : void 0,
    error: o.error
  };
}
function parseArtifactList(data) {
  const o = asRecord(data, "artifact-list");
  const arr = o.artifacts;
  if (!Array.isArray(arr)) throw new Error(`artifact list response missing artifacts[]: ${JSON.stringify(data)}`);
  return arr.filter((n) => typeof n === "string");
}
function parseArtifactContent(data) {
  const o = asRecord(data, "artifact");
  const name = o.name;
  if (typeof name !== "string") throw new Error(`artifact response missing name: ${JSON.stringify(data)}`);
  return { name, content: o.content };
}
function parseAssetCreate(data) {
  const o = asRecord(data, "asset-create");
  const assetId = o.asset_id;
  const uploadUrl = o.upload_url;
  if (typeof assetId !== "string" || assetId === "") {
    throw new Error(`asset create response missing asset_id: ${JSON.stringify(data)}`);
  }
  if (o.status === "ready") {
    return { assetId, uploadUrl: "", ready: true };
  }
  if (typeof uploadUrl !== "string" || uploadUrl === "") {
    throw new Error(`asset create response missing upload_url: ${JSON.stringify(data)}`);
  }
  return { assetId, uploadUrl, ready: false };
}
function parseQaFrames(data) {
  const o = asRecord(data, "qa-frames");
  if (typeof o.url !== "string") throw new Error(`qa frames response missing url: ${JSON.stringify(data)}`);
  return {
    url: o.url,
    width: Number(o.width ?? 0),
    height: Number(o.height ?? 0),
    frames: Number(o.frames ?? 0),
    tStart: Number(o.tStart ?? 0),
    tEnd: Number(o.tEnd ?? 0)
  };
}
function parseQaWaveform(data) {
  const o = asRecord(data, "qa-waveform");
  if (typeof o.url !== "string") throw new Error(`qa waveform response missing url: ${JSON.stringify(data)}`);
  const words = Array.isArray(o.words) ? o.words.map((w) => {
    const r = w;
    return { t: Number(r.t ?? 0), end: Number(r.end ?? 0), text: String(r.text ?? "") };
  }) : [];
  return { url: o.url, words };
}
function parseRect(v) {
  const r = v ?? {};
  return { x: Number(r.x ?? 0), y: Number(r.y ?? 0), w: Number(r.w ?? 0), h: Number(r.h ?? 0) };
}
function parseQaFraming(data) {
  const o = asRecord(data, "qa-framing");
  if (typeof o.url !== "string") throw new Error(`qa framing response missing url: ${JSON.stringify(data)}`);
  const src = o.source ?? {};
  return {
    url: o.url,
    source: { w: Number(src.w ?? 0), h: Number(src.h ?? 0) },
    visible: parseRect(o.visible),
    ...o.proposed !== void 0 && { proposed: parseRect(o.proposed) },
    ...o.clamped !== void 0 && { clamped: Boolean(o.clamped) },
    ...Array.isArray(o.samples) ? { samples: o.samples.map(Number), cols: Number(o.cols ?? 0), rows: Number(o.rows ?? 0) } : {},
    at: Number(o.at ?? 0)
  };
}
function parseQaInspect(data) {
  const o = asRecord(data, "qa-inspect");
  if (typeof o.url !== "string") throw new Error(`qa inspect response missing url: ${JSON.stringify(data)}`);
  const cuts = Array.isArray(o.cuts) ? o.cuts.filter((c) => c !== null && typeof c === "object").map((c) => ({ start: Number(c.start ?? 0), end: Number(c.end ?? 0) })) : [];
  return {
    url: o.url,
    tStart: Number(o.tStart ?? 0),
    tEnd: Number(o.tEnd ?? 0),
    cuts,
    cached: o.cached === true
  };
}
function parseFileList(data) {
  const o = asRecord(data, "file-list");
  const arr = o.files;
  if (!Array.isArray(arr)) throw new Error(`file list response missing files[]: ${JSON.stringify(data)}`);
  return arr.filter((f) => f !== null && typeof f === "object").map((f) => ({
    path: String(f.path ?? ""),
    backend: String(f.backend ?? ""),
    content_type: typeof f.content_type === "string" ? f.content_type : null,
    bytes: typeof f.bytes === "number" ? f.bytes : null,
    sha256: typeof f.sha256 === "string" ? f.sha256 : null,
    status: typeof f.status === "string" ? f.status : null,
    updated_at: typeof f.updated_at === "string" ? f.updated_at : null,
    updated_by: typeof f.updated_by === "string" ? f.updated_by : null
  }));
}
function unwrapFileEnvelope(data, what) {
  const o = asRecord(data, what);
  const f = o.file;
  return f && typeof f === "object" && !Array.isArray(f) ? { ...o, ...f } : o;
}
function parseFileContent(data) {
  const o = unwrapFileEnvelope(data, "file");
  if (typeof o.path !== "string") throw new Error(`file response missing path: ${JSON.stringify(data)}`);
  const content = typeof o.content === "string" ? o.content : void 0;
  const downloadUrl = typeof o.download_url === "string" ? o.download_url : typeof o.url === "string" ? o.url : void 0;
  if (content === void 0 && downloadUrl === void 0) {
    throw new Error(`file response has neither content nor download_url: ${o.path}`);
  }
  return {
    path: o.path,
    content,
    downloadUrl,
    sha256: typeof o.sha256 === "string" ? o.sha256 : null,
    contentType: typeof o.content_type === "string" ? o.content_type : null
  };
}
function parseFilePresign(data) {
  const o = unwrapFileEnvelope(data, "file-presign");
  if (typeof o.upload_url !== "string" || o.upload_url === "") {
    throw new Error(`presign response missing upload_url: ${JSON.stringify(data)}`);
  }
  return {
    uploadUrl: o.upload_url,
    token: typeof o.token === "string" ? o.token : null,
    expiresAt: typeof o.expires_at === "string" ? o.expires_at : null
  };
}
function parseRunState(data) {
  const o = asRecord(data, "run");
  if (typeof o.status !== "string") throw new Error(`run response missing status: ${JSON.stringify(data)}`);
  const events = Array.isArray(o.events) ? o.events.filter((e) => e !== null && typeof e === "object").map((e) => ({ ts: String(e.ts ?? ""), type: String(e.type ?? ""), payload: e.payload })) : [];
  return {
    id: String(o.id ?? ""),
    status: o.status,
    errorCode: typeof o.error_code === "string" ? o.error_code : null,
    errorMessage: typeof o.error_message === "string" ? o.error_message : null,
    events
  };
}
function isTerminalRunStatus(s) {
  return s === "completed" || s === "failed" || s === "timed_out";
}
function numOrNull(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function strOrNull(v) {
  return typeof v === "string" ? v : null;
}
function parseReviewSession(data) {
  const o = asRecord(data, "review-session");
  const videoId = o.video_id;
  if (typeof videoId !== "string" || videoId === "") {
    throw new Error(`review session response missing video_id: ${JSON.stringify(data)}`);
  }
  let activeRound = null;
  if (o.active_round !== null && o.active_round !== void 0) {
    const r = asRecord(o.active_round, "review-session active_round");
    const roundId = r.round_id;
    const runId = r.run_id;
    if (typeof roundId !== "string" || typeof runId !== "string") {
      throw new Error(`review session active_round missing round_id/run_id: ${JSON.stringify(o.active_round)}`);
    }
    const changes = Array.isArray(r.changes) ? r.changes.filter((c) => c !== null && typeof c === "object").map((c) => ({
      id: String(c.id ?? ""),
      idx: Number(c.idx ?? 0),
      kind: String(c.kind ?? ""),
      t: numOrNull(c.t),
      t2: numOrNull(c.t2),
      x: numOrNull(c.x),
      y: numOrNull(c.y),
      text: strOrNull(c.text),
      outcome: strOrNull(c.outcome)
    })) : [];
    activeRound = {
      roundId,
      runId,
      seq: Number(r.seq ?? 0),
      mode: String(r.mode ?? ""),
      status: String(r.status ?? ""),
      instruction: typeof r.instruction === "string" ? r.instruction : "",
      changes
    };
  }
  return {
    videoId,
    title: strOrNull(o.title),
    latestVersionSeq: numOrNull(o.latest_version_seq),
    activeRound,
    timeline: o.timeline ?? null,
    sourceUrl: strOrNull(o.source_url)
  };
}
function extractErrorMessage(data) {
  if (typeof data === "string" && data.trim() !== "") return data;
  if (data && typeof data === "object") {
    const o = data;
    if (typeof o.error === "string") return o.error;
    if (typeof o.message === "string") return o.message;
    if (o.error) return JSON.stringify(o.error);
  }
  return void 0;
}
function isRetryableRequestError(err) {
  if (err instanceof TypeError) return true;
  if (err instanceof RequestTimeoutError) return true;
  if (!(err instanceof CloudHttpError)) return false;
  if (!RETRYABLE_STATUSES.has(err.status)) return false;
  if (err.status !== 503) return true;
  const body = err.body;
  const code = typeof body === "object" && body !== null && typeof body.error === "object" && body.error !== null ? body.error.code : void 0;
  return typeof code !== "string";
}
function requestIdempotencyKey(method, url, body) {
  const hash = createHash("sha256");
  hash.update(method);
  hash.update("\n");
  hash.update(url);
  hash.update("\n");
  if (body !== void 0) hash.update(JSON.stringify(body));
  return `helper-${hash.digest("hex").slice(0, 32)}`;
}
function backoffDelayMs(attempt) {
  return (Math.min(16, 2 ** (attempt - 1)) + Math.random() * 2) * 1e3;
}
async function downloadTo(url, dest, opts = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await downloadToOnce(url, dest, opts);
    } catch (err) {
      const status = err.status;
      const retryable = err instanceof TypeError || typeof status === "number" && status >= 500;
      if (attempt >= REQUEST_MAX_ATTEMPTS || !retryable) throw err;
      await new Promise((r) => setTimeout(r, backoffDelayMs(attempt)));
    }
  }
}
async function downloadToOnce(url, dest, opts = {}) {
  const f = opts.fetchImpl ?? globalThis.fetch;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), opts.timeoutMs ?? DEFAULT_DOWNLOAD_TIMEOUT_MS);
  try {
    const res = await f(url, { signal: ac.signal });
    if (!res.ok) {
      const failure = new Error(`download failed: HTTP ${res.status} ${res.statusText} for ${url}`);
      failure.status = res.status;
      throw failure;
    }
    mkdirSync(dirname(dest), { recursive: true });
    const body = res.body;
    if (!body) {
      const buf = Buffer.from(await res.arrayBuffer());
      writeFileSync(dest, buf);
      return { path: dest, bytes: buf.length };
    }
    await pipeline2(Readable2.fromWeb(body), createWriteStream(dest));
    return { path: dest, bytes: statSync(dest).size };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`download timed out after ${opts.timeoutMs ?? DEFAULT_DOWNLOAD_TIMEOUT_MS}ms: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
var DEFAULT_TIMEOUT_MS, DEFAULT_DOWNLOAD_TIMEOUT_MS, RENDER_CAPABILITIES_HEADER, CloudHttpError, RETRYABLE_STATUSES, RequestTimeoutError, REQUEST_MAX_ATTEMPTS, CloudClient;
var init_client = __esm({
  "src/cloud/client.ts"() {
    "use strict";
    init_upload_stream();
    DEFAULT_TIMEOUT_MS = 3e4;
    DEFAULT_DOWNLOAD_TIMEOUT_MS = 3e5;
    RENDER_CAPABILITIES_HEADER = "X-AgentCut-Render-Capabilities";
    CloudHttpError = class extends Error {
      constructor(status, message, body) {
        super(message);
        this.status = status;
        this.body = body;
        this.name = "CloudHttpError";
      }
      status;
      body;
    };
    RETRYABLE_STATUSES = /* @__PURE__ */ new Set([408, 425, 429, 500, 502, 503, 504]);
    RequestTimeoutError = class extends Error {
      constructor(message) {
        super(message);
        this.name = "RequestTimeoutError";
      }
    };
    REQUEST_MAX_ATTEMPTS = 5;
    CloudClient = class _CloudClient {
      constructor(cfg, opts = {}) {
        this.cfg = cfg;
        this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
        this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        this.authToken = opts.authToken ?? cfg.credential;
        this.streamPutImpl = opts.streamPutImpl ?? putFileStream;
        this.retryBackoffMs = opts.retryBackoffMs ?? backoffDelayMs;
        if (!this.fetchImpl) throw new Error("global fetch is unavailable \u2014 Node 18+ required, or inject fetchImpl");
      }
      cfg;
      fetchImpl;
      timeoutMs;
      streamPutImpl;
      retryBackoffMs;
      authToken;
      requireVideoId() {
        if (!this.cfg.videoId) throw new Error("missing video id \u2014 pass --video-id or set VIDEO_ID");
        return this.cfg.videoId;
      }
      /** Same client (same fetch/timeout) bound to a video id — for flows that
       *  create the video mid-run (init). */
      withVideoId(videoId) {
        return new _CloudClient(
          { ...this.cfg, videoId },
          {
            fetchImpl: this.fetchImpl,
            timeoutMs: this.timeoutMs,
            authToken: this.authToken,
            streamPutImpl: this.streamPutImpl,
            retryBackoffMs: this.retryBackoffMs
          }
        );
      }
      /** The injected fetch — for helpers outside the class (multipart part PUTs)
       *  that need raw Response access (e.g. the ETag header). */
      get fetch() {
        return this.fetchImpl;
      }
      /** POST a JSON body to an absolute API URL with auth — public wrapper over
       *  the private transport for helpers living outside the class (multipart). */
      async postJson(url, body) {
        return this.request("POST", url, body);
      }
      /** POST raw binary bytes to an authenticated API URL (multipart relay
       *  sub-chunks). Content-Type application/octet-stream; JSON response. */
      async postBinary(url, bytes, timeoutMs = DEFAULT_DOWNLOAD_TIMEOUT_MS) {
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), timeoutMs);
        try {
          const res = await this.fetchImpl(url, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${this.authToken}`,
              Accept: "application/json",
              "Content-Type": "application/octet-stream"
            },
            body: bytes,
            signal: ac.signal
          });
          const text = await res.text();
          let data = void 0;
          if (text) {
            try {
              data = JSON.parse(text);
            } catch {
              data = text;
            }
          }
          if (!res.ok) {
            const detail = extractErrorMessage(data) ?? `${res.status} ${res.statusText}`;
            throw new CloudHttpError(res.status, `POST ${url} failed: ${detail}`, data);
          }
          return data;
        } catch (err) {
          if (err instanceof CloudHttpError) throw err;
          if (err instanceof Error && err.name === "AbortError") {
            throw new Error(`request timed out after ${timeoutMs}ms: POST ${url}`);
          }
          throw err;
        } finally {
          clearTimeout(timer);
        }
      }
      /** All JSON API calls go through here. Retries transient failures (see
       *  isRetryableRequestError) with backoff. Every attempt of one logical
       *  request carries the same X-Idempotency-Key (sha256 of method+url+body,
       *  ChatCut-style), so the server MAY dedupe a lost-response retry; until it
       *  does, duplicate-on-retry stays acceptable for our POSTs — creates are
       *  plain row inserts, so the worst case is an orphan row. */
      async request(method, url, body, headers) {
        const idempotencyKey = requestIdempotencyKey(method, url, body);
        for (let attempt = 1; ; attempt++) {
          try {
            return await this.requestOnce(method, url, body, idempotencyKey, headers);
          } catch (err) {
            if (attempt >= REQUEST_MAX_ATTEMPTS || !isRetryableRequestError(err)) throw err;
            await new Promise((r) => setTimeout(r, this.retryBackoffMs(attempt)));
          }
        }
      }
      async requestOnce(method, url, body, idempotencyKey, extraHeaders) {
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), this.timeoutMs);
        try {
          const res = await this.fetchImpl(url, {
            method,
            headers: {
              ...extraHeaders,
              Authorization: `Bearer ${this.authToken}`,
              Accept: "application/json",
              ...body !== void 0 ? { "Content-Type": "application/json" } : {},
              ...idempotencyKey !== void 0 ? { "X-Idempotency-Key": idempotencyKey } : {}
            },
            body: body !== void 0 ? JSON.stringify(body) : void 0,
            signal: ac.signal
          });
          const text = await res.text();
          let data = void 0;
          if (text) {
            try {
              data = JSON.parse(text);
            } catch {
              data = text;
            }
          }
          if (!res.ok) {
            const detail = extractErrorMessage(data) ?? `${res.status} ${res.statusText}`;
            throw new CloudHttpError(res.status, `${method} ${url} failed: ${detail}`, data);
          }
          return data;
        } catch (err) {
          if (err instanceof CloudHttpError) throw err;
          if (err instanceof Error && err.name === "AbortError") {
            throw new RequestTimeoutError(`request timed out after ${this.timeoutMs}ms: ${method} ${url}`);
          }
          throw err;
        } finally {
          clearTimeout(timer);
        }
      }
      // ---- render -------------------------------------------------------------
      async createRender(mode) {
        const data = await this.request("POST", rendersUrl(this.cfg.base), {
          video_id: this.requireVideoId(),
          mode
        });
        return parseRenderCreate(data);
      }
      async getRender(renderId) {
        const data = await this.request("GET", renderUrl(this.cfg.base, renderId));
        return parseRenderState(data);
      }
      // ---- client-executed render (the bundled render helper) -----------------
      // Auth for these three is the render run's OWN token (returned once by the
      // executor:"client" POST /v1/renders), passed as this client's authToken.
      /** The job payload: composition HTML, plan, LUT bytes, signed source URLs,
       *  grade/loudnorm recipe, presigned output PUT. Idempotent — re-fetch for
       *  fresh URLs after a restart or an expired upload URL. */
      async renderManifest(renderId, capabilities = []) {
        const declared = [...new Set(capabilities)].filter((capability) => /^[a-z0-9][a-z0-9@._-]{0,127}$/i.test(capability)).sort().join(",");
        const data = await this.request(
          "GET",
          `${renderUrl(this.cfg.base, renderId)}/manifest`,
          void 0,
          declared === "" ? void 0 : { [RENDER_CAPABILITIES_HEADER]: declared }
        );
        if (typeof data !== "object" || data === null) {
          throw new Error("render manifest response is not an object");
        }
        return data;
      }
      /** Progress/heartbeat. Empty body = pure heartbeat (send at least every
       *  30 s). A 410 means the run went terminal underneath — stop rendering. */
      async renderEvents(renderId, body = {}) {
        await this.request("POST", `${renderUrl(this.cfg.base, renderId)}/events`, body);
      }
      /** Terminal settlement: completed (after the output PUT) or failed. */
      async renderComplete(renderId, body) {
        const data = await this.request("POST", `${renderUrl(this.cfg.base, renderId)}/complete`, body);
        return typeof data === "object" && data !== null ? data : {};
      }
      // ---- qa -----------------------------------------------------------------
      async qaFrames(args) {
        const body = { kind: "frames", start: args.start, end: args.end };
        if (args.cols !== void 0) body.cols = args.cols;
        if (args.interval !== void 0) body.interval = args.interval;
        const data = await this.request("POST", qaUrl(this.cfg.base, this.requireVideoId()), body);
        return parseQaFrames(data);
      }
      async qaWaveform(args) {
        const data = await this.request("POST", qaUrl(this.cfg.base, this.requireVideoId()), {
          kind: "waveform",
          start: args.start,
          end: args.end
        });
        return parseQaWaveform(data);
      }
      async qaInspect(args) {
        const body = { kind: "inspect", start: args.start, end: args.end };
        if (args.nFrames !== void 0) body.n_frames = args.nFrames;
        const data = await this.request("POST", qaUrl(this.cfg.base, this.requireVideoId()), body);
        return parseQaInspect(data);
      }
      async qaFraming(args) {
        const body = { kind: "framing", at: args.at };
        if (args.center !== void 0) body.center = args.center;
        if (args.scale !== void 0) body.scale = args.scale;
        if (args.end !== void 0) body.end = args.end;
        if (args.interval !== void 0) body.interval = args.interval;
        const data = await this.request("POST", qaUrl(this.cfg.base, this.requireVideoId()), body);
        return parseQaFraming(data);
      }
      // ---- artifacts ----------------------------------------------------------
      async listArtifacts() {
        const data = await this.request("GET", artifactsUrl(this.cfg.base, this.requireVideoId()));
        return parseArtifactList(data);
      }
      async getArtifact(name) {
        const data = await this.request("GET", artifactsUrl(this.cfg.base, this.requireVideoId(), name));
        return parseArtifactContent(data);
      }
      // ---- assets -------------------------------------------------------------
      /** POST /api/v1/assets: request an asset row + presigned upload URL
       *  (agentcut assets route: {kind, content_type?, video_id?, filename?} →
       *  {asset_id, upload_url, upload_token, expires_at}). */
      async createAsset(args) {
        const body = { kind: args.kind, video_id: this.requireVideoId() };
        if (args.contentType !== void 0) body.content_type = args.contentType;
        if (args.filename !== void 0) body.filename = args.filename;
        const data = await this.request("POST", assetsUrl(this.cfg.base), body);
        return parseAssetCreate(data);
      }
      /** PUT raw bytes to a presigned upload URL. No Authorization header — the
       *  signed URL carries its own credentials and may be a different host.
       *  Mid-stream network failures (connection resets, TLS record errors) and
       *  5xx responses are retried with exponential backoff — the whole body is
       *  an in-memory buffer, so every attempt is a clean full replay. */
      async upload(url, bytes, contentType, timeoutMs = DEFAULT_DOWNLOAD_TIMEOUT_MS, maxAttempts = 5) {
        let lastErr;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          const ac = new AbortController();
          const timer = setTimeout(() => ac.abort(), timeoutMs);
          try {
            const res = await this.fetchImpl(url, {
              method: "PUT",
              headers: { "Content-Type": contentType },
              body: bytes,
              signal: ac.signal
            });
            if (res.ok) return;
            const failure = new Error(`asset upload failed: HTTP ${res.status} ${res.statusText} for ${url}`);
            if (res.status < 500 || attempt === maxAttempts) throw failure;
            lastErr = failure;
          } catch (err) {
            if (err instanceof Error && err.name === "AbortError") {
              throw new Error(`asset upload timed out after ${timeoutMs}ms: ${url}`);
            }
            const cause = err.cause;
            const detail = cause?.code ?? cause?.message;
            const network = err instanceof TypeError;
            if (!network || attempt === maxAttempts) {
              throw err instanceof TypeError ? new Error(
                `upload network failure after ${attempt} attempt${attempt === 1 ? "" : "s"}${detail ? ` (${detail})` : ""} PUTting ${bytes.length} bytes to ${new URL(url).host}`
              ) : err;
            }
            lastErr = err;
          } finally {
            clearTimeout(timer);
          }
          await new Promise((r) => setTimeout(r, backoffDelayMs(attempt)));
        }
        throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
      }
      /** PUT a seekable source to a presigned upload URL as a stream — the
       *  any-size single-request path (no full-file buffer; see upload-stream.ts).
       *  Used when multipart is unavailable or the source is past its ceiling. */
      async uploadStream(url, source, contentType) {
        await this.streamPutImpl(url, source, contentType);
      }
      // ---- review session -----------------------------------------------------
      async getReview() {
        const data = await this.request("GET", reviewUrl(this.cfg.base, this.requireVideoId()));
        return parseReviewSession(data);
      }
      /** POST a review-round event ({run_id, type, payload?}); expects {ok:true}. */
      async pushReview(body) {
        const data = await this.request("POST", reviewUrl(this.cfg.base, this.requireVideoId()), body);
        const o = data;
        if (!o || o.ok !== true) {
          throw new Error(`review push (${body.type}) did not return {ok:true}: ${JSON.stringify(data)}`);
        }
      }
      // ---- auth gate ----------------------------------------------------------
      /** GET /v1/me — validates the credential; returns the raw payload. */
      async me() {
        const data = await this.request("GET", meUrl(this.cfg.base));
        const o = data;
        if (!o || typeof o !== "object" || typeof o.user_id !== "string") {
          throw new Error(`/v1/me did not return a user: ${JSON.stringify(data)}`);
        }
        return o;
      }
      // ---- projects / videos (init flow) --------------------------------------
      /** API-key-authenticated short-lived, project-scoped helper session. */
      async importSessionCreate(body = {}) {
        const data = await this.request("POST", importSessionsUrl(this.cfg.base), body);
        const o = asRecord(data, "import-session-create");
        if (typeof o.token !== "string" || o.token === "" || typeof o.endpoint !== "string" || o.endpoint === "" || typeof o.project_id !== "string" || o.project_id === "" || typeof o.expires_at !== "string" || o.expires_at === "") {
          throw new Error(`import session response is incomplete: ${JSON.stringify(data)}`);
        }
        return {
          token: o.token,
          endpoint: o.endpoint,
          projectId: o.project_id,
          expiresAt: o.expires_at
        };
      }
      async createProject(title) {
        const data = await this.request("POST", projectsUrl(this.cfg.base), { title });
        const o = asRecord(data, "project-create");
        const projectId = o.project_id;
        if (typeof projectId !== "string" || projectId === "") {
          throw new Error(`project create response missing project_id: ${JSON.stringify(data)}`);
        }
        return { projectId };
      }
      /** POST /v1/assets for a NEW source (no video yet): {kind:"source", ...}.
       *  `sourcePath` offers the file's absolute local path — a same-machine
       *  server (hostd) clones it and answers ready; the cloud ignores the field. */
      async createSourceAsset(args) {
        const body = { kind: "source", content_type: args.contentType };
        if (args.filename !== void 0) body.filename = args.filename;
        if (args.videoId !== void 0) body.video_id = args.videoId;
        if (args.sourcePath !== void 0) body.source_path = args.sourcePath;
        const data = await this.request("POST", assetsUrl(this.cfg.base), body);
        return parseAssetCreate(data);
      }
      /** POST /v1/projects/{id}/videos {asset_id, title?, workflow:"cli"}. */
      async createVideo(projectId, args) {
        const body = { asset_id: args.assetId, workflow: "cli" };
        if (args.title !== void 0) body.title = args.title;
        const data = await this.request("POST", projectVideosUrl(this.cfg.base, projectId), body);
        const o = asRecord(data, "video-create");
        const videoId = o.video_id;
        if (typeof videoId !== "string" || videoId === "") {
          throw new Error(`video create response missing video_id: ${JSON.stringify(data)}`);
        }
        return { videoId, projectId: typeof o.project_id === "string" ? o.project_id : projectId };
      }
      /** Create a video before bytes exist; the client-ingest finalize binds the
       * multipart-minted asset later. */
      async createExternalVideo(projectId, args = {}) {
        const body = {
          workflow: "cli",
          media: "external"
        };
        if (args.title !== void 0) body.title = args.title;
        const data = await this.request("POST", projectVideosUrl(this.cfg.base, projectId), body);
        const o = asRecord(data, "external-video-create");
        if (typeof o.video_id !== "string" || o.video_id === "") {
          throw new Error(`external video response missing video_id: ${JSON.stringify(data)}`);
        }
        return {
          videoId: o.video_id,
          projectId: typeof o.project_id === "string" ? o.project_id : projectId
        };
      }
      // ---- virtual file system -------------------------------------------------
      async filesList() {
        const data = await this.request("GET", filesUrl(this.cfg.base, this.requireVideoId()));
        return parseFileList(data);
      }
      async filesGet(path) {
        const data = await this.request("GET", filesUrl(this.cfg.base, this.requireVideoId(), path));
        return parseFileContent(data);
      }
      /** Inline PUT (≤5MB text payloads) → {path, sha256, bytes}. */
      async filesPutInline(path, content, contentType) {
        const body = { path, content };
        if (contentType !== void 0) body.content_type = contentType;
        const data = await this.request("PUT", filesUrl(this.cfg.base, this.requireVideoId()), body);
        const o = unwrapFileEnvelope(data, "file-put");
        return {
          path: typeof o.path === "string" ? o.path : path,
          sha256: typeof o.sha256 === "string" ? o.sha256 : null,
          bytes: typeof o.bytes === "number" ? o.bytes : null
        };
      }
      /** Presign PUT for large/binary payloads → {upload_url, token, expires_at}. */
      async filesPresign(args) {
        const data = await this.request("PUT", filesUrl(this.cfg.base, this.requireVideoId()), {
          path: args.path,
          content_type: args.contentType,
          bytes: args.bytes,
          sha256: args.sha256,
          presign: true
        });
        return parseFilePresign(data);
      }
      /** Commit a presigned upload → {path, status:"ready"}. */
      async filesCommit(path) {
        const data = await this.request("PUT", filesUrl(this.cfg.base, this.requireVideoId()), { path, commit: true });
        const o = unwrapFileEnvelope(data, "file-commit");
        if (o.status !== "ready") {
          throw new Error(`file commit for ${path} did not return status "ready": ${JSON.stringify(data)}`);
        }
      }
      async filesDelete(path) {
        await this.request("DELETE", filesUrl(this.cfg.base, this.requireVideoId(), path));
      }
      // ---- server-side pipeline verbs -----------------------------------------
      /** POST /videos/{id}/transcribe → 202 {run_id}. */
      async transcribeStart(body) {
        const data = await this.request("POST", transcribeUrl(this.cfg.base, this.requireVideoId()), body);
        const o = asRecord(data, "transcribe");
        if (typeof o.run_id !== "string" || o.run_id === "") {
          throw new Error(`transcribe response missing run_id: ${JSON.stringify(data)}`);
        }
        return { runId: o.run_id };
      }
      /** POST /videos/{id}/ingest {stem?} → 202 {run_id}. Server-side probe + audio
       *  extraction + transcription + screening over the uploaded source. The stem
       *  names every derived artifact (transcripts/<stem>.json, audio/<stem>.wav) —
       *  omit it and the server defaults to "source". */
      async ingestStart(stem) {
        const body = stem !== void 0 && stem !== "" ? { stem } : {};
        const data = await this.request("POST", ingestUrl(this.cfg.base, this.requireVideoId()), body);
        const o = asRecord(data, "ingest");
        if (typeof o.run_id !== "string" || o.run_id === "") {
          throw new Error(`ingest response missing run_id: ${JSON.stringify(data)}`);
        }
        return { runId: o.run_id };
      }
      /** Client-side probe/transcode upload completion. */
      async ingestClientComplete(body) {
        const data = await this.request("POST", ingestUrl(this.cfg.base, this.requireVideoId()), {
          mode: "client",
          ...body
        });
        const o = asRecord(data, "client-ingest");
        if (o.ok !== true) {
          throw new Error(`client ingest did not return {ok:true}: ${JSON.stringify(data)}`);
        }
        return {
          ok: true,
          durationS: Number(o.duration_s ?? 0),
          master: o.master
        };
      }
      /** POST /videos/{id}/verify {mode?, window_s?} → 202 {run_id}. The server
       *  sources the preview audio itself — nothing is uploaded. */
      async verifyStart(body = {}) {
        const data = await this.request("POST", verifyUrl(this.cfg.base, this.requireVideoId()), body);
        const o = asRecord(data, "verify");
        if (typeof o.run_id !== "string" || o.run_id === "") {
          throw new Error(`verify response missing run_id: ${JSON.stringify(data)}`);
        }
        return { runId: o.run_id };
      }
      async smoothJoinsStart(body = {}) {
        const data = await this.request(
          "POST",
          smoothJoinsUrl(this.cfg.base, this.requireVideoId()),
          body
        );
        const o = asRecord(data, "smooth-joins");
        if (typeof o.run_id !== "string" || o.run_id === "") {
          throw new Error(`smooth-joins response missing run_id: ${JSON.stringify(data)}`);
        }
        return { runId: o.run_id };
      }
      /** GET /runs/{id} — run status + events. */
      async getRun(runId) {
        const data = await this.request("GET", runUrl(this.cfg.base, runId));
        return parseRunState(data);
      }
      /** POST /videos/{id}/compile → {ok, plan, diagnostics, uses}. */
      async compileRemote(body) {
        const data = await this.request("POST", compileUrl(this.cfg.base, this.requireVideoId()), body);
        return asRecord(data, "compile");
      }
      /** POST /videos/{id}/resolve {phrase, source?, occurrence?}. */
      async resolveRemote(body) {
        const data = await this.request("POST", resolveUrl(this.cfg.base, this.requireVideoId()), body);
        return asRecord(data, "resolve");
      }
      /** GET /videos/{id}/compose → {html, counts, media:[{src, role}]}. */
      async getCompose() {
        const data = await this.request("GET", composeUrl(this.cfg.base, this.requireVideoId()));
        const o = asRecord(data, "compose");
        if (typeof o.html !== "string") throw new Error(`compose response missing html: ${JSON.stringify(data)}`);
        const media = Array.isArray(o.media) ? o.media.filter((m) => m !== null && typeof m === "object").map((m) => ({ src: String(m.src ?? ""), role: String(m.role ?? "") })) : [];
        const counts = o.counts !== null && typeof o.counts === "object" ? o.counts : {};
        return { html: o.html, counts, media };
      }
      // ---- download (signed URLs; no auth header) -----------------------------
      async download(url, dest, timeoutMs = DEFAULT_DOWNLOAD_TIMEOUT_MS) {
        return downloadTo(url, dest, { fetchImpl: this.fetchImpl, timeoutMs });
      }
    };
  }
});

// src/cloud/jobfile.ts
import { existsSync, mkdirSync as mkdirSync2, readFileSync, writeFileSync as writeFileSync2 } from "fs";
import { join as join2 } from "path";
function jobJsonPath(jobDir) {
  return join2(jobDir, "job.json");
}
function writeJobFile(jobDir, job) {
  mkdirSync2(jobDir, { recursive: true });
  const path = jobJsonPath(jobDir);
  writeFileSync2(path, JSON.stringify(job, null, 2) + "\n", "utf8");
  return path;
}
function readJobFile(jobDir) {
  const path = jobJsonPath(jobDir);
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    if (typeof raw.video_id !== "string" || raw.video_id === "") return null;
    return {
      video_id: raw.video_id,
      project_id: typeof raw.project_id === "string" ? raw.project_id : "",
      api_base: typeof raw.api_base === "string" ? raw.api_base : "",
      stem: typeof raw.stem === "string" ? raw.stem : "source",
      duration_s: typeof raw.duration_s === "number" ? raw.duration_s : 0,
      ...typeof raw.source_path === "string" && raw.source_path !== "" ? { source_path: raw.source_path } : {}
    };
  } catch {
    return null;
  }
}
var init_jobfile = __esm({
  "src/cloud/jobfile.ts"() {
    "use strict";
  }
});

// src/cloud/multipart.ts
import { open } from "fs/promises";
async function runPool(tasks, concurrency) {
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
    while (next < tasks.length) {
      const task = tasks[next++];
      if (task) await task();
    }
  });
  await Promise.all(workers);
}
function jitteredBackoffMs(attempt) {
  const base = Math.min(500 * 2 ** (attempt - 1), 8e3);
  return Math.round(base / 2 + Math.random() * (base / 2));
}
function shouldMultipart(sizeOrBytes) {
  const size = typeof sizeOrBytes === "number" ? sizeOrBytes : sizeOrBytes.length;
  return size > MULTIPART_THRESHOLD_BYTES;
}
function bytesSource(bytes) {
  return {
    size: bytes.length,
    readSlice: async (offset, len) => Buffer.from(bytes.subarray(offset, Math.min(offset + len, bytes.length)))
  };
}
async function readSliceFromHandle(fh, path, size, offset, len) {
  const want = Math.min(len, Math.max(0, size - offset));
  let buf;
  try {
    buf = Buffer.allocUnsafe(want);
  } catch (err) {
    throw new Error(
      `cannot buffer ${want} bytes of ${path} in one slice \u2014 above this runtime's Buffer limit; upload large files via multipart or the streaming single PUT (uploadStream)`,
      { cause: err }
    );
  }
  let done = 0;
  while (done < want) {
    const { bytesRead } = await fh.read(buf, done, Math.min(READ_CHUNK_BYTES, want - done), offset + done);
    if (bytesRead <= 0) throw new Error(`short read at byte ${offset + done} of ${path}`);
    done += bytesRead;
  }
  return buf;
}
async function openFileSource(path) {
  const fh = await open(path, "r");
  const size = (await fh.stat()).size;
  return {
    size,
    readSlice: (offset, len) => readSliceFromHandle(fh, path, size, offset, len),
    close: () => fh.close()
  };
}
function asRecord2(data, ctx) {
  if (data === null || typeof data !== "object") throw new Error(`unexpected ${ctx} response: ${JSON.stringify(data)}`);
  return data;
}
function parsePartUrls(data, ctx) {
  const o = asRecord2(data, ctx);
  if (!Array.isArray(o.parts)) throw new Error(`${ctx} response missing parts[]: ${JSON.stringify(data)}`);
  return o.parts.filter((p) => p !== null && typeof p === "object").map((p) => ({ n: Number(p.n ?? 0), url: String(p.url ?? "") })).filter((p) => Number.isInteger(p.n) && p.n >= 1 && p.url !== "");
}
function parseMultipartCreate(data) {
  const o = asRecord2(data, "multipart-create");
  const uploadId = o.upload_id;
  if (typeof uploadId !== "string" || uploadId === "") {
    throw new Error(`multipart create response missing upload_id: ${JSON.stringify(data)}`);
  }
  const partSize = Number(o.part_size ?? 0);
  if (!(partSize > 0)) throw new Error(`multipart create response missing part_size: ${JSON.stringify(data)}`);
  return {
    uploadId,
    assetId: typeof o.asset_id === "string" && o.asset_id !== "" ? o.asset_id : void 0,
    partSize,
    parts: parsePartUrls(data, "multipart-create")
  };
}
function isMultipartUnavailable(err) {
  if (!(err instanceof CloudHttpError)) return false;
  if (err.status === 404 || err.status === 405) return true;
  if (err.status !== 503) return false;
  const body = err.body;
  return typeof body === "object" && body !== null && typeof body.error === "object" && body.error !== null ? body.error.code === "multipart_unavailable" : false;
}
function isMultipartOversize(err) {
  if (!(err instanceof CloudHttpError) || err.status !== 422) return false;
  const body = err.body;
  return typeof body === "object" && body !== null && typeof body.error === "object" && body.error !== null ? body.error.code === "too_many_parts" : false;
}
function stripEtagQuotes(etag) {
  return etag.trim().replace(/^"+|"+$/g, "");
}
function fmtMb(n) {
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
async function putPart(client, url, chunk, timeoutMs) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    return await client.fetch(url, { method: "PUT", body: chunk, signal: ac.signal });
  } finally {
    clearTimeout(timer);
  }
}
async function refreshPartUrl(client, uploadId, n) {
  const data = await client.postJson(multipartUrl(client.cfg.base, "parts"), { upload_id: uploadId, ns: [n] });
  const url = parsePartUrls(data, "multipart-parts").find((p) => p.n === n)?.url;
  if (!url) throw new Error(`multipart parts refresh did not return a URL for part ${n}: ${JSON.stringify(data)}`);
  return url;
}
async function relayOnePart(client, uploadId, n, chunk) {
  const of = Math.max(1, Math.ceil(chunk.length / RELAY_SUBCHUNK_BYTES));
  for (let i = 1; i <= of; i++) {
    const sub = chunk.subarray((i - 1) * RELAY_SUBCHUNK_BYTES, Math.min(i * RELAY_SUBCHUNK_BYTES, chunk.length));
    const data = await client.postBinary(multipartRelayUrl(client.cfg.base, uploadId, n, i, of), sub);
    const o = data;
    if (!o || o.ok !== true) {
      throw new Error(`relay sub-chunk ${i}/${of} of part ${n} did not return {ok:true}: ${JSON.stringify(data)}`);
    }
  }
  const done = asRecord2(
    await client.postJson(multipartUrl(client.cfg.base, "relay-complete"), { upload_id: uploadId, n }),
    "relay-complete"
  );
  if (typeof done.etag !== "string" || done.etag === "") {
    throw new Error(`relay-complete for part ${n} returned no etag: ${JSON.stringify(done)}`);
  }
  return stripEtagQuotes(done.etag);
}
function isRelayUnavailable(err) {
  return err instanceof CloudHttpError && (err.status === 404 || err.status === 405);
}
function transportDetail(err) {
  const cause = err.cause;
  return cause?.code ?? cause?.message;
}
async function uploadOnePart(client, uploadId, n, chunk, initialUrl, timeoutMs, backoffMs, health, diag) {
  let url = initialUrl;
  let lastErr;
  let transportFailures = 0;
  let relayEligible = false;
  let forceRelay = false;
  for (let attempt = 1; attempt <= PART_MAX_ATTEMPTS; attempt++) {
    const selection = health.select(
      n,
      relayEligible,
      forceRelay,
      attempt === 1 && transportFailures === 0
    );
    const mode = selection.mode;
    const t0 = Date.now();
    const report = (error) => {
      if (!error && mode === "direct" && !selection.reason) return;
      diag?.(
        `part ${n} attempt ${attempt} mode ${mode} bytes ${chunk.length} elapsed ${Date.now() - t0}ms` + (error ? ` error ${error}` : " ok") + (selection.reason ? ` reason ${selection.reason}` : "")
      );
    };
    let skipBackoff = false;
    if (mode === "relay") {
      try {
        const etag = await relayOnePart(client, uploadId, n, chunk);
        health.relaySucceeded(selection);
        report();
        return etag;
      } catch (err) {
        if (isRelayUnavailable(err)) {
          health.markRelayUnavailable();
          report("relay_unavailable");
          skipBackoff = true;
        } else {
          lastErr = err instanceof Error ? err : new Error(String(err));
          report(err instanceof CloudHttpError ? `http_${err.status}` : lastErr.message.slice(0, 80));
        }
      }
    } else {
      try {
        if (!url) url = await refreshPartUrl(client, uploadId, n);
        const res = await putPart(client, url, chunk, timeoutMs);
        if (res.ok) {
          const etag = res.headers.get("etag");
          if (!etag) throw new Error(`part ${n} uploaded but the response had no ETag header \u2014 cannot complete the multipart upload`);
          if (selection.recoveryProbe) health.recoveryProbeSucceeded(n);
          report();
          return stripEtagQuotes(etag);
        }
        lastErr = new Error(`part ${n}: HTTP ${res.status} ${res.statusText}`);
        report(`http_${res.status}`);
        if (res.status >= 400 && res.status < 500) url = void 0;
        skipBackoff = health.prefersRelay(relayEligible, forceRelay) && !selection.recoveryProbe;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          lastErr = new Error(`part ${n}: timed out after ${timeoutMs}ms`);
          transportFailures += 1;
          report("timeout");
        } else if (err instanceof TypeError) {
          const detail = transportDetail(err);
          lastErr = new Error(`part ${n}: network failure${detail ? ` (${detail})` : ""}`);
          transportFailures += 1;
          report(detail ?? "fetch_failed");
        } else {
          throw err;
        }
        if (selection.recoveryProbe) {
          health.recoveryProbeTransportFailed(n);
          forceRelay = true;
          skipBackoff = true;
        } else {
          if (transportFailures >= RELAY_DIRECT_ATTEMPTS && !relayEligible) {
            relayEligible = true;
            health.markRelayEligible(n);
          }
          skipBackoff = health.prefersRelay(relayEligible, forceRelay);
        }
      }
    }
    if (attempt < PART_MAX_ATTEMPTS && !skipBackoff) await sleep(backoffMs(attempt));
  }
  throw new Error(
    `multipart upload failed at part ${n} (${chunk.length} bytes) after ${PART_MAX_ATTEMPTS} attempts: ${lastErr?.message ?? "unknown error"}`
  );
}
async function uploadMultipart(client, opts, timeoutMs = DEFAULT_DOWNLOAD_TIMEOUT_MS) {
  const source = opts.source ?? (opts.bytes !== void 0 ? bytesSource(opts.bytes) : void 0);
  if (!source) throw new Error("uploadMultipart: pass exactly one of bytes or source");
  const createBody = {
    kind: opts.kind,
    size: source.size,
    content_type: opts.contentType
  };
  if (opts.filename !== void 0) createBody.filename = opts.filename;
  if (opts.videoId !== void 0) createBody.video_id = opts.videoId;
  if (opts.path !== void 0) createBody.path = opts.path;
  let session;
  try {
    const created = await client.postJson(multipartUrl(client.cfg.base), createBody);
    const record = asRecord2(created, "multipart-create");
    if (record.already_ready === true && typeof record.asset_id === "string" && record.asset_id !== "") {
      opts.log?.(`upload: reusing ready asset ${record.asset_id}`);
      return { assetId: record.asset_id };
    }
    session = parseMultipartCreate(created);
  } catch (err) {
    if (isMultipartUnavailable(err)) return "unavailable";
    if (isMultipartOversize(err)) return "oversize";
    throw err;
  }
  const abort = async () => {
    try {
      await client.postJson(multipartUrl(client.cfg.base, "abort"), { upload_id: session.uploadId });
    } catch {
    }
  };
  if (opts.kind === "asset" && !session.assetId) {
    await abort();
    throw new Error("multipart create (kind asset) returned no asset_id \u2014 cannot create the video afterwards");
  }
  const total = Math.max(1, Math.ceil(source.size / session.partSize));
  const urls = new Map(session.parts.map((p) => [p.n, p.url]));
  const marks = new Set([1, 2, 3, 4].map((k) => Math.ceil(total * k / 4)));
  const etags = new Array(total);
  const health = new MultipartTransportHealth();
  let doneParts = 0;
  let doneBytes = 0;
  try {
    await runPool(
      Array.from({ length: total }, (_, i) => async () => {
        const n = i + 1;
        const offset = i * session.partSize;
        const chunk = await source.readSlice(offset, session.partSize);
        etags[i] = await uploadOnePart(
          client,
          session.uploadId,
          n,
          chunk,
          urls.get(n),
          timeoutMs,
          opts.backoffMs ?? jitteredBackoffMs,
          health,
          opts.log
        );
        doneParts += 1;
        doneBytes += chunk.length;
        if (opts.log && marks.has(doneParts)) {
          opts.log(`upload: ${doneParts}/${total} parts (${fmtMb(doneBytes)} / ${fmtMb(source.size)})`);
        }
      }),
      PART_CONCURRENCY
    );
    const completeBody = {
      upload_id: session.uploadId,
      parts: etags.map((etag, i) => ({ n: i + 1, etag }))
    };
    if (opts.sha256 !== void 0) {
      completeBody.sha256 = opts.sha256;
      completeBody.bytes = source.size;
    }
    await client.postJson(multipartUrl(client.cfg.base, "complete"), completeBody);
  } catch (err) {
    await abort();
    throw err;
  }
  return opts.kind === "asset" ? { assetId: session.assetId } : {};
}
var MULTIPART_THRESHOLD_BYTES, PART_CONCURRENCY, PART_MAX_ATTEMPTS, RELAY_DIRECT_ATTEMPTS, STICKY_RELAY_AFTER_PARTS, RELAY_RECOVERY_PROBE_EVERY_PARTS, RELAY_SUBCHUNK_BYTES, READ_CHUNK_BYTES, sleep, MultipartTransportHealth;
var init_multipart = __esm({
  "src/cloud/multipart.ts"() {
    "use strict";
    init_client();
    MULTIPART_THRESHOLD_BYTES = 8 * 1024 * 1024;
    PART_CONCURRENCY = 3;
    PART_MAX_ATTEMPTS = 8;
    RELAY_DIRECT_ATTEMPTS = 2;
    STICKY_RELAY_AFTER_PARTS = 2;
    RELAY_RECOVERY_PROBE_EVERY_PARTS = 6;
    RELAY_SUBCHUNK_BYTES = 3670016;
    READ_CHUNK_BYTES = 64 * 1024 * 1024;
    sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    MultipartTransportHealth = class {
      relayEligibleParts = /* @__PURE__ */ new Set();
      stickyRelay = false;
      relayUnavailable = false;
      successfulStickyRelayParts = 0;
      recoveryProbeReady = false;
      recoveryProbePart;
      generation = 0;
      select(part, relayEligible, forceRelay, allowRecoveryProbe) {
        if (this.relayUnavailable) {
          return { mode: "direct", generation: this.generation, recoveryProbe: false };
        }
        if (this.recoveryProbePart === part) {
          return {
            mode: "direct",
            reason: "recovery_probe",
            generation: this.generation,
            recoveryProbe: true
          };
        }
        if (this.stickyRelay) {
          if (this.recoveryProbeReady && this.recoveryProbePart === void 0 && allowRecoveryProbe) {
            this.recoveryProbeReady = false;
            this.recoveryProbePart = part;
            return {
              mode: "direct",
              reason: "recovery_probe",
              generation: this.generation,
              recoveryProbe: true
            };
          }
          return {
            mode: "relay",
            reason: "sticky",
            generation: this.generation,
            recoveryProbe: false
          };
        }
        return {
          mode: forceRelay || relayEligible ? "relay" : "direct",
          generation: this.generation,
          recoveryProbe: false
        };
      }
      prefersRelay(relayEligible, forceRelay) {
        return !this.relayUnavailable && (this.stickyRelay || relayEligible || forceRelay);
      }
      markRelayEligible(part) {
        if (this.relayUnavailable) return;
        this.relayEligibleParts.add(part);
        if (!this.stickyRelay && this.relayEligibleParts.size >= STICKY_RELAY_AFTER_PARTS) {
          this.stickyRelay = true;
          this.successfulStickyRelayParts = 0;
          this.recoveryProbeReady = false;
          this.recoveryProbePart = void 0;
          this.generation += 1;
        }
      }
      relaySucceeded(selection) {
        if (selection.reason !== "sticky" || selection.generation !== this.generation || !this.stickyRelay || this.relayUnavailable) {
          return;
        }
        this.successfulStickyRelayParts += 1;
        if (this.successfulStickyRelayParts >= RELAY_RECOVERY_PROBE_EVERY_PARTS && !this.recoveryProbeReady && this.recoveryProbePart === void 0) {
          this.successfulStickyRelayParts = 0;
          this.recoveryProbeReady = true;
          this.generation += 1;
        }
      }
      recoveryProbeSucceeded(part) {
        if (this.recoveryProbePart !== part) return;
        this.stickyRelay = false;
        this.relayEligibleParts.clear();
        this.successfulStickyRelayParts = 0;
        this.recoveryProbeReady = false;
        this.recoveryProbePart = void 0;
        this.generation += 1;
      }
      recoveryProbeTransportFailed(part) {
        if (this.recoveryProbePart !== part) return;
        this.successfulStickyRelayParts = 0;
        this.recoveryProbeReady = false;
        this.recoveryProbePart = void 0;
        this.generation += 1;
      }
      markRelayUnavailable() {
        if (this.relayUnavailable) return;
        this.relayUnavailable = true;
        this.stickyRelay = false;
        this.relayEligibleParts.clear();
        this.successfulStickyRelayParts = 0;
        this.recoveryProbeReady = false;
        this.recoveryProbePart = void 0;
        this.generation += 1;
      }
    };
  }
});

// ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/helpers/util.js
var util, objectUtil, ZodParsedType, getParsedType;
var init_util = __esm({
  "../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/helpers/util.js"() {
    "use strict";
    (function(util2) {
      util2.assertEqual = (_) => {
      };
      function assertIs(_arg) {
      }
      util2.assertIs = assertIs;
      function assertNever(_x) {
        throw new Error();
      }
      util2.assertNever = assertNever;
      util2.arrayToEnum = (items) => {
        const obj = {};
        for (const item of items) {
          obj[item] = item;
        }
        return obj;
      };
      util2.getValidEnumValues = (obj) => {
        const validKeys = util2.objectKeys(obj).filter((k) => typeof obj[obj[k]] !== "number");
        const filtered = {};
        for (const k of validKeys) {
          filtered[k] = obj[k];
        }
        return util2.objectValues(filtered);
      };
      util2.objectValues = (obj) => {
        return util2.objectKeys(obj).map(function(e) {
          return obj[e];
        });
      };
      util2.objectKeys = typeof Object.keys === "function" ? (obj) => Object.keys(obj) : (object) => {
        const keys = [];
        for (const key in object) {
          if (Object.prototype.hasOwnProperty.call(object, key)) {
            keys.push(key);
          }
        }
        return keys;
      };
      util2.find = (arr, checker) => {
        for (const item of arr) {
          if (checker(item))
            return item;
        }
        return void 0;
      };
      util2.isInteger = typeof Number.isInteger === "function" ? (val) => Number.isInteger(val) : (val) => typeof val === "number" && Number.isFinite(val) && Math.floor(val) === val;
      function joinValues(array, separator = " | ") {
        return array.map((val) => typeof val === "string" ? `'${val}'` : val).join(separator);
      }
      util2.joinValues = joinValues;
      util2.jsonStringifyReplacer = (_, value) => {
        if (typeof value === "bigint") {
          return value.toString();
        }
        return value;
      };
    })(util || (util = {}));
    (function(objectUtil2) {
      objectUtil2.mergeShapes = (first, second) => {
        return {
          ...first,
          ...second
          // second overwrites first
        };
      };
    })(objectUtil || (objectUtil = {}));
    ZodParsedType = util.arrayToEnum([
      "string",
      "nan",
      "number",
      "integer",
      "float",
      "boolean",
      "date",
      "bigint",
      "symbol",
      "function",
      "undefined",
      "null",
      "array",
      "object",
      "unknown",
      "promise",
      "void",
      "never",
      "map",
      "set"
    ]);
    getParsedType = (data) => {
      const t = typeof data;
      switch (t) {
        case "undefined":
          return ZodParsedType.undefined;
        case "string":
          return ZodParsedType.string;
        case "number":
          return Number.isNaN(data) ? ZodParsedType.nan : ZodParsedType.number;
        case "boolean":
          return ZodParsedType.boolean;
        case "function":
          return ZodParsedType.function;
        case "bigint":
          return ZodParsedType.bigint;
        case "symbol":
          return ZodParsedType.symbol;
        case "object":
          if (Array.isArray(data)) {
            return ZodParsedType.array;
          }
          if (data === null) {
            return ZodParsedType.null;
          }
          if (data.then && typeof data.then === "function" && data.catch && typeof data.catch === "function") {
            return ZodParsedType.promise;
          }
          if (typeof Map !== "undefined" && data instanceof Map) {
            return ZodParsedType.map;
          }
          if (typeof Set !== "undefined" && data instanceof Set) {
            return ZodParsedType.set;
          }
          if (typeof Date !== "undefined" && data instanceof Date) {
            return ZodParsedType.date;
          }
          return ZodParsedType.object;
        default:
          return ZodParsedType.unknown;
      }
    };
  }
});

// ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/ZodError.js
var ZodIssueCode, quotelessJson, ZodError;
var init_ZodError = __esm({
  "../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/ZodError.js"() {
    "use strict";
    init_util();
    ZodIssueCode = util.arrayToEnum([
      "invalid_type",
      "invalid_literal",
      "custom",
      "invalid_union",
      "invalid_union_discriminator",
      "invalid_enum_value",
      "unrecognized_keys",
      "invalid_arguments",
      "invalid_return_type",
      "invalid_date",
      "invalid_string",
      "too_small",
      "too_big",
      "invalid_intersection_types",
      "not_multiple_of",
      "not_finite"
    ]);
    quotelessJson = (obj) => {
      const json2 = JSON.stringify(obj, null, 2);
      return json2.replace(/"([^"]+)":/g, "$1:");
    };
    ZodError = class _ZodError extends Error {
      get errors() {
        return this.issues;
      }
      constructor(issues) {
        super();
        this.issues = [];
        this.addIssue = (sub) => {
          this.issues = [...this.issues, sub];
        };
        this.addIssues = (subs = []) => {
          this.issues = [...this.issues, ...subs];
        };
        const actualProto = new.target.prototype;
        if (Object.setPrototypeOf) {
          Object.setPrototypeOf(this, actualProto);
        } else {
          this.__proto__ = actualProto;
        }
        this.name = "ZodError";
        this.issues = issues;
      }
      format(_mapper) {
        const mapper = _mapper || function(issue) {
          return issue.message;
        };
        const fieldErrors = { _errors: [] };
        const processError = (error) => {
          for (const issue of error.issues) {
            if (issue.code === "invalid_union") {
              issue.unionErrors.map(processError);
            } else if (issue.code === "invalid_return_type") {
              processError(issue.returnTypeError);
            } else if (issue.code === "invalid_arguments") {
              processError(issue.argumentsError);
            } else if (issue.path.length === 0) {
              fieldErrors._errors.push(mapper(issue));
            } else {
              let curr = fieldErrors;
              let i = 0;
              while (i < issue.path.length) {
                const el = issue.path[i];
                const terminal = i === issue.path.length - 1;
                if (!terminal) {
                  curr[el] = curr[el] || { _errors: [] };
                } else {
                  curr[el] = curr[el] || { _errors: [] };
                  curr[el]._errors.push(mapper(issue));
                }
                curr = curr[el];
                i++;
              }
            }
          }
        };
        processError(this);
        return fieldErrors;
      }
      static assert(value) {
        if (!(value instanceof _ZodError)) {
          throw new Error(`Not a ZodError: ${value}`);
        }
      }
      toString() {
        return this.message;
      }
      get message() {
        return JSON.stringify(this.issues, util.jsonStringifyReplacer, 2);
      }
      get isEmpty() {
        return this.issues.length === 0;
      }
      flatten(mapper = (issue) => issue.message) {
        const fieldErrors = {};
        const formErrors = [];
        for (const sub of this.issues) {
          if (sub.path.length > 0) {
            const firstEl = sub.path[0];
            fieldErrors[firstEl] = fieldErrors[firstEl] || [];
            fieldErrors[firstEl].push(mapper(sub));
          } else {
            formErrors.push(mapper(sub));
          }
        }
        return { formErrors, fieldErrors };
      }
      get formErrors() {
        return this.flatten();
      }
    };
    ZodError.create = (issues) => {
      const error = new ZodError(issues);
      return error;
    };
  }
});

// ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/locales/en.js
var errorMap, en_default;
var init_en = __esm({
  "../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/locales/en.js"() {
    "use strict";
    init_ZodError();
    init_util();
    errorMap = (issue, _ctx) => {
      let message;
      switch (issue.code) {
        case ZodIssueCode.invalid_type:
          if (issue.received === ZodParsedType.undefined) {
            message = "Required";
          } else {
            message = `Expected ${issue.expected}, received ${issue.received}`;
          }
          break;
        case ZodIssueCode.invalid_literal:
          message = `Invalid literal value, expected ${JSON.stringify(issue.expected, util.jsonStringifyReplacer)}`;
          break;
        case ZodIssueCode.unrecognized_keys:
          message = `Unrecognized key(s) in object: ${util.joinValues(issue.keys, ", ")}`;
          break;
        case ZodIssueCode.invalid_union:
          message = `Invalid input`;
          break;
        case ZodIssueCode.invalid_union_discriminator:
          message = `Invalid discriminator value. Expected ${util.joinValues(issue.options)}`;
          break;
        case ZodIssueCode.invalid_enum_value:
          message = `Invalid enum value. Expected ${util.joinValues(issue.options)}, received '${issue.received}'`;
          break;
        case ZodIssueCode.invalid_arguments:
          message = `Invalid function arguments`;
          break;
        case ZodIssueCode.invalid_return_type:
          message = `Invalid function return type`;
          break;
        case ZodIssueCode.invalid_date:
          message = `Invalid date`;
          break;
        case ZodIssueCode.invalid_string:
          if (typeof issue.validation === "object") {
            if ("includes" in issue.validation) {
              message = `Invalid input: must include "${issue.validation.includes}"`;
              if (typeof issue.validation.position === "number") {
                message = `${message} at one or more positions greater than or equal to ${issue.validation.position}`;
              }
            } else if ("startsWith" in issue.validation) {
              message = `Invalid input: must start with "${issue.validation.startsWith}"`;
            } else if ("endsWith" in issue.validation) {
              message = `Invalid input: must end with "${issue.validation.endsWith}"`;
            } else {
              util.assertNever(issue.validation);
            }
          } else if (issue.validation !== "regex") {
            message = `Invalid ${issue.validation}`;
          } else {
            message = "Invalid";
          }
          break;
        case ZodIssueCode.too_small:
          if (issue.type === "array")
            message = `Array must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `more than`} ${issue.minimum} element(s)`;
          else if (issue.type === "string")
            message = `String must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `over`} ${issue.minimum} character(s)`;
          else if (issue.type === "number")
            message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
          else if (issue.type === "bigint")
            message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
          else if (issue.type === "date")
            message = `Date must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${new Date(Number(issue.minimum))}`;
          else
            message = "Invalid input";
          break;
        case ZodIssueCode.too_big:
          if (issue.type === "array")
            message = `Array must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `less than`} ${issue.maximum} element(s)`;
          else if (issue.type === "string")
            message = `String must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `under`} ${issue.maximum} character(s)`;
          else if (issue.type === "number")
            message = `Number must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
          else if (issue.type === "bigint")
            message = `BigInt must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
          else if (issue.type === "date")
            message = `Date must be ${issue.exact ? `exactly` : issue.inclusive ? `smaller than or equal to` : `smaller than`} ${new Date(Number(issue.maximum))}`;
          else
            message = "Invalid input";
          break;
        case ZodIssueCode.custom:
          message = `Invalid input`;
          break;
        case ZodIssueCode.invalid_intersection_types:
          message = `Intersection results could not be merged`;
          break;
        case ZodIssueCode.not_multiple_of:
          message = `Number must be a multiple of ${issue.multipleOf}`;
          break;
        case ZodIssueCode.not_finite:
          message = "Number must be finite";
          break;
        default:
          message = _ctx.defaultError;
          util.assertNever(issue);
      }
      return { message };
    };
    en_default = errorMap;
  }
});

// ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/errors.js
function setErrorMap(map) {
  overrideErrorMap = map;
}
function getErrorMap() {
  return overrideErrorMap;
}
var overrideErrorMap;
var init_errors = __esm({
  "../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/errors.js"() {
    "use strict";
    init_en();
    overrideErrorMap = en_default;
  }
});

// ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/helpers/parseUtil.js
function addIssueToContext(ctx, issueData) {
  const overrideMap = getErrorMap();
  const issue = makeIssue({
    issueData,
    data: ctx.data,
    path: ctx.path,
    errorMaps: [
      ctx.common.contextualErrorMap,
      // contextual error map is first priority
      ctx.schemaErrorMap,
      // then schema-bound map if available
      overrideMap,
      // then global override map
      overrideMap === en_default ? void 0 : en_default
      // then global default map
    ].filter((x) => !!x)
  });
  ctx.common.issues.push(issue);
}
var makeIssue, EMPTY_PATH, ParseStatus, INVALID, DIRTY, OK, isAborted, isDirty, isValid, isAsync;
var init_parseUtil = __esm({
  "../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/helpers/parseUtil.js"() {
    "use strict";
    init_errors();
    init_en();
    makeIssue = (params) => {
      const { data, path, errorMaps, issueData } = params;
      const fullPath = [...path, ...issueData.path || []];
      const fullIssue = {
        ...issueData,
        path: fullPath
      };
      if (issueData.message !== void 0) {
        return {
          ...issueData,
          path: fullPath,
          message: issueData.message
        };
      }
      let errorMessage = "";
      const maps = errorMaps.filter((m) => !!m).slice().reverse();
      for (const map of maps) {
        errorMessage = map(fullIssue, { data, defaultError: errorMessage }).message;
      }
      return {
        ...issueData,
        path: fullPath,
        message: errorMessage
      };
    };
    EMPTY_PATH = [];
    ParseStatus = class _ParseStatus {
      constructor() {
        this.value = "valid";
      }
      dirty() {
        if (this.value === "valid")
          this.value = "dirty";
      }
      abort() {
        if (this.value !== "aborted")
          this.value = "aborted";
      }
      static mergeArray(status, results) {
        const arrayValue = [];
        for (const s of results) {
          if (s.status === "aborted")
            return INVALID;
          if (s.status === "dirty")
            status.dirty();
          arrayValue.push(s.value);
        }
        return { status: status.value, value: arrayValue };
      }
      static async mergeObjectAsync(status, pairs) {
        const syncPairs = [];
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          syncPairs.push({
            key,
            value
          });
        }
        return _ParseStatus.mergeObjectSync(status, syncPairs);
      }
      static mergeObjectSync(status, pairs) {
        const finalObject = {};
        for (const pair of pairs) {
          const { key, value } = pair;
          if (key.status === "aborted")
            return INVALID;
          if (value.status === "aborted")
            return INVALID;
          if (key.status === "dirty")
            status.dirty();
          if (value.status === "dirty")
            status.dirty();
          if (key.value !== "__proto__" && (typeof value.value !== "undefined" || pair.alwaysSet)) {
            finalObject[key.value] = value.value;
          }
        }
        return { status: status.value, value: finalObject };
      }
    };
    INVALID = Object.freeze({
      status: "aborted"
    });
    DIRTY = (value) => ({ status: "dirty", value });
    OK = (value) => ({ status: "valid", value });
    isAborted = (x) => x.status === "aborted";
    isDirty = (x) => x.status === "dirty";
    isValid = (x) => x.status === "valid";
    isAsync = (x) => typeof Promise !== "undefined" && x instanceof Promise;
  }
});

// ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/helpers/typeAliases.js
var init_typeAliases = __esm({
  "../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/helpers/typeAliases.js"() {
    "use strict";
  }
});

// ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/helpers/errorUtil.js
var errorUtil;
var init_errorUtil = __esm({
  "../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/helpers/errorUtil.js"() {
    "use strict";
    (function(errorUtil2) {
      errorUtil2.errToObj = (message) => typeof message === "string" ? { message } : message || {};
      errorUtil2.toString = (message) => typeof message === "string" ? message : message?.message;
    })(errorUtil || (errorUtil = {}));
  }
});

// ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/types.js
function processCreateParams(params) {
  if (!params)
    return {};
  const { errorMap: errorMap2, invalid_type_error, required_error, description } = params;
  if (errorMap2 && (invalid_type_error || required_error)) {
    throw new Error(`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`);
  }
  if (errorMap2)
    return { errorMap: errorMap2, description };
  const customMap = (iss, ctx) => {
    const { message } = params;
    if (iss.code === "invalid_enum_value") {
      return { message: message ?? ctx.defaultError };
    }
    if (typeof ctx.data === "undefined") {
      return { message: message ?? required_error ?? ctx.defaultError };
    }
    if (iss.code !== "invalid_type")
      return { message: ctx.defaultError };
    return { message: message ?? invalid_type_error ?? ctx.defaultError };
  };
  return { errorMap: customMap, description };
}
function timeRegexSource(args) {
  let secondsRegexSource = `[0-5]\\d`;
  if (args.precision) {
    secondsRegexSource = `${secondsRegexSource}\\.\\d{${args.precision}}`;
  } else if (args.precision == null) {
    secondsRegexSource = `${secondsRegexSource}(\\.\\d+)?`;
  }
  const secondsQuantifier = args.precision ? "+" : "?";
  return `([01]\\d|2[0-3]):[0-5]\\d(:${secondsRegexSource})${secondsQuantifier}`;
}
function timeRegex(args) {
  return new RegExp(`^${timeRegexSource(args)}$`);
}
function datetimeRegex(args) {
  let regex = `${dateRegexSource}T${timeRegexSource(args)}`;
  const opts = [];
  opts.push(args.local ? `Z?` : `Z`);
  if (args.offset)
    opts.push(`([+-]\\d{2}:?\\d{2})`);
  regex = `${regex}(${opts.join("|")})`;
  return new RegExp(`^${regex}$`);
}
function isValidIP(ip, version) {
  if ((version === "v4" || !version) && ipv4Regex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6Regex.test(ip)) {
    return true;
  }
  return false;
}
function isValidJWT(jwt, alg) {
  if (!jwtRegex.test(jwt))
    return false;
  try {
    const [header] = jwt.split(".");
    if (!header)
      return false;
    const base64 = header.replace(/-/g, "+").replace(/_/g, "/").padEnd(header.length + (4 - header.length % 4) % 4, "=");
    const decoded = JSON.parse(atob(base64));
    if (typeof decoded !== "object" || decoded === null)
      return false;
    if ("typ" in decoded && decoded?.typ !== "JWT")
      return false;
    if (!decoded.alg)
      return false;
    if (alg && decoded.alg !== alg)
      return false;
    return true;
  } catch {
    return false;
  }
}
function isValidCidr(ip, version) {
  if ((version === "v4" || !version) && ipv4CidrRegex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6CidrRegex.test(ip)) {
    return true;
  }
  return false;
}
function floatSafeRemainder(val, step) {
  const valDecCount = (val.toString().split(".")[1] || "").length;
  const stepDecCount = (step.toString().split(".")[1] || "").length;
  const decCount = valDecCount > stepDecCount ? valDecCount : stepDecCount;
  const valInt = Number.parseInt(val.toFixed(decCount).replace(".", ""));
  const stepInt = Number.parseInt(step.toFixed(decCount).replace(".", ""));
  return valInt % stepInt / 10 ** decCount;
}
function deepPartialify(schema) {
  if (schema instanceof ZodObject) {
    const newShape = {};
    for (const key in schema.shape) {
      const fieldSchema = schema.shape[key];
      newShape[key] = ZodOptional.create(deepPartialify(fieldSchema));
    }
    return new ZodObject({
      ...schema._def,
      shape: () => newShape
    });
  } else if (schema instanceof ZodArray) {
    return new ZodArray({
      ...schema._def,
      type: deepPartialify(schema.element)
    });
  } else if (schema instanceof ZodOptional) {
    return ZodOptional.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodNullable) {
    return ZodNullable.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodTuple) {
    return ZodTuple.create(schema.items.map((item) => deepPartialify(item)));
  } else {
    return schema;
  }
}
function mergeValues(a, b) {
  const aType = getParsedType(a);
  const bType = getParsedType(b);
  if (a === b) {
    return { valid: true, data: a };
  } else if (aType === ZodParsedType.object && bType === ZodParsedType.object) {
    const bKeys = util.objectKeys(b);
    const sharedKeys = util.objectKeys(a).filter((key) => bKeys.indexOf(key) !== -1);
    const newObj = { ...a, ...b };
    for (const key of sharedKeys) {
      const sharedValue = mergeValues(a[key], b[key]);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newObj[key] = sharedValue.data;
    }
    return { valid: true, data: newObj };
  } else if (aType === ZodParsedType.array && bType === ZodParsedType.array) {
    if (a.length !== b.length) {
      return { valid: false };
    }
    const newArray = [];
    for (let index = 0; index < a.length; index++) {
      const itemA = a[index];
      const itemB = b[index];
      const sharedValue = mergeValues(itemA, itemB);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newArray.push(sharedValue.data);
    }
    return { valid: true, data: newArray };
  } else if (aType === ZodParsedType.date && bType === ZodParsedType.date && +a === +b) {
    return { valid: true, data: a };
  } else {
    return { valid: false };
  }
}
function createZodEnum(values, params) {
  return new ZodEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodEnum,
    ...processCreateParams(params)
  });
}
function cleanParams(params, data) {
  const p = typeof params === "function" ? params(data) : typeof params === "string" ? { message: params } : params;
  const p2 = typeof p === "string" ? { message: p } : p;
  return p2;
}
function custom(check, _params = {}, fatal) {
  if (check)
    return ZodAny.create().superRefine((data, ctx) => {
      const r = check(data);
      if (r instanceof Promise) {
        return r.then((r2) => {
          if (!r2) {
            const params = cleanParams(_params, data);
            const _fatal = params.fatal ?? fatal ?? true;
            ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
          }
        });
      }
      if (!r) {
        const params = cleanParams(_params, data);
        const _fatal = params.fatal ?? fatal ?? true;
        ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
      }
      return;
    });
  return ZodAny.create();
}
var ParseInputLazyPath, handleResult, ZodType, cuidRegex, cuid2Regex, ulidRegex, uuidRegex, nanoidRegex, jwtRegex, durationRegex, emailRegex, _emojiRegex, emojiRegex, ipv4Regex, ipv4CidrRegex, ipv6Regex, ipv6CidrRegex, base64Regex, base64urlRegex, dateRegexSource, dateRegex, ZodString, ZodNumber, ZodBigInt, ZodBoolean, ZodDate, ZodSymbol, ZodUndefined, ZodNull, ZodAny, ZodUnknown, ZodNever, ZodVoid, ZodArray, ZodObject, ZodUnion, getDiscriminator, ZodDiscriminatedUnion, ZodIntersection, ZodTuple, ZodRecord, ZodMap, ZodSet, ZodFunction, ZodLazy, ZodLiteral, ZodEnum, ZodNativeEnum, ZodPromise, ZodEffects, ZodOptional, ZodNullable, ZodDefault, ZodCatch, ZodNaN, BRAND, ZodBranded, ZodPipeline, ZodReadonly, late, ZodFirstPartyTypeKind, instanceOfType, stringType, numberType, nanType, bigIntType, booleanType, dateType, symbolType, undefinedType, nullType, anyType, unknownType, neverType, voidType, arrayType, objectType, strictObjectType, unionType, discriminatedUnionType, intersectionType, tupleType, recordType, mapType, setType, functionType, lazyType, literalType, enumType, nativeEnumType, promiseType, effectsType, optionalType, nullableType, preprocessType, pipelineType, ostring, onumber, oboolean, coerce, NEVER;
var init_types = __esm({
  "../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/types.js"() {
    "use strict";
    init_ZodError();
    init_errors();
    init_errorUtil();
    init_parseUtil();
    init_util();
    ParseInputLazyPath = class {
      constructor(parent, value, path, key) {
        this._cachedPath = [];
        this.parent = parent;
        this.data = value;
        this._path = path;
        this._key = key;
      }
      get path() {
        if (!this._cachedPath.length) {
          if (Array.isArray(this._key)) {
            this._cachedPath.push(...this._path, ...this._key);
          } else {
            this._cachedPath.push(...this._path, this._key);
          }
        }
        return this._cachedPath;
      }
    };
    handleResult = (ctx, result) => {
      if (isValid(result)) {
        return { success: true, data: result.value };
      } else {
        if (!ctx.common.issues.length) {
          throw new Error("Validation failed but no issues detected.");
        }
        return {
          success: false,
          get error() {
            if (this._error)
              return this._error;
            const error = new ZodError(ctx.common.issues);
            this._error = error;
            return this._error;
          }
        };
      }
    };
    ZodType = class {
      get description() {
        return this._def.description;
      }
      _getType(input) {
        return getParsedType(input.data);
      }
      _getOrReturnCtx(input, ctx) {
        return ctx || {
          common: input.parent.common,
          data: input.data,
          parsedType: getParsedType(input.data),
          schemaErrorMap: this._def.errorMap,
          path: input.path,
          parent: input.parent
        };
      }
      _processInputParams(input) {
        return {
          status: new ParseStatus(),
          ctx: {
            common: input.parent.common,
            data: input.data,
            parsedType: getParsedType(input.data),
            schemaErrorMap: this._def.errorMap,
            path: input.path,
            parent: input.parent
          }
        };
      }
      _parseSync(input) {
        const result = this._parse(input);
        if (isAsync(result)) {
          throw new Error("Synchronous parse encountered promise.");
        }
        return result;
      }
      _parseAsync(input) {
        const result = this._parse(input);
        return Promise.resolve(result);
      }
      parse(data, params) {
        const result = this.safeParse(data, params);
        if (result.success)
          return result.data;
        throw result.error;
      }
      safeParse(data, params) {
        const ctx = {
          common: {
            issues: [],
            async: params?.async ?? false,
            contextualErrorMap: params?.errorMap
          },
          path: params?.path || [],
          schemaErrorMap: this._def.errorMap,
          parent: null,
          data,
          parsedType: getParsedType(data)
        };
        const result = this._parseSync({ data, path: ctx.path, parent: ctx });
        return handleResult(ctx, result);
      }
      "~validate"(data) {
        const ctx = {
          common: {
            issues: [],
            async: !!this["~standard"].async
          },
          path: [],
          schemaErrorMap: this._def.errorMap,
          parent: null,
          data,
          parsedType: getParsedType(data)
        };
        if (!this["~standard"].async) {
          try {
            const result = this._parseSync({ data, path: [], parent: ctx });
            return isValid(result) ? {
              value: result.value
            } : {
              issues: ctx.common.issues
            };
          } catch (err) {
            if (err?.message?.toLowerCase()?.includes("encountered")) {
              this["~standard"].async = true;
            }
            ctx.common = {
              issues: [],
              async: true
            };
          }
        }
        return this._parseAsync({ data, path: [], parent: ctx }).then((result) => isValid(result) ? {
          value: result.value
        } : {
          issues: ctx.common.issues
        });
      }
      async parseAsync(data, params) {
        const result = await this.safeParseAsync(data, params);
        if (result.success)
          return result.data;
        throw result.error;
      }
      async safeParseAsync(data, params) {
        const ctx = {
          common: {
            issues: [],
            contextualErrorMap: params?.errorMap,
            async: true
          },
          path: params?.path || [],
          schemaErrorMap: this._def.errorMap,
          parent: null,
          data,
          parsedType: getParsedType(data)
        };
        const maybeAsyncResult = this._parse({ data, path: ctx.path, parent: ctx });
        const result = await (isAsync(maybeAsyncResult) ? maybeAsyncResult : Promise.resolve(maybeAsyncResult));
        return handleResult(ctx, result);
      }
      refine(check, message) {
        const getIssueProperties = (val) => {
          if (typeof message === "string" || typeof message === "undefined") {
            return { message };
          } else if (typeof message === "function") {
            return message(val);
          } else {
            return message;
          }
        };
        return this._refinement((val, ctx) => {
          const result = check(val);
          const setError = () => ctx.addIssue({
            code: ZodIssueCode.custom,
            ...getIssueProperties(val)
          });
          if (typeof Promise !== "undefined" && result instanceof Promise) {
            return result.then((data) => {
              if (!data) {
                setError();
                return false;
              } else {
                return true;
              }
            });
          }
          if (!result) {
            setError();
            return false;
          } else {
            return true;
          }
        });
      }
      refinement(check, refinementData) {
        return this._refinement((val, ctx) => {
          if (!check(val)) {
            ctx.addIssue(typeof refinementData === "function" ? refinementData(val, ctx) : refinementData);
            return false;
          } else {
            return true;
          }
        });
      }
      _refinement(refinement) {
        return new ZodEffects({
          schema: this,
          typeName: ZodFirstPartyTypeKind.ZodEffects,
          effect: { type: "refinement", refinement }
        });
      }
      superRefine(refinement) {
        return this._refinement(refinement);
      }
      constructor(def) {
        this.spa = this.safeParseAsync;
        this._def = def;
        this.parse = this.parse.bind(this);
        this.safeParse = this.safeParse.bind(this);
        this.parseAsync = this.parseAsync.bind(this);
        this.safeParseAsync = this.safeParseAsync.bind(this);
        this.spa = this.spa.bind(this);
        this.refine = this.refine.bind(this);
        this.refinement = this.refinement.bind(this);
        this.superRefine = this.superRefine.bind(this);
        this.optional = this.optional.bind(this);
        this.nullable = this.nullable.bind(this);
        this.nullish = this.nullish.bind(this);
        this.array = this.array.bind(this);
        this.promise = this.promise.bind(this);
        this.or = this.or.bind(this);
        this.and = this.and.bind(this);
        this.transform = this.transform.bind(this);
        this.brand = this.brand.bind(this);
        this.default = this.default.bind(this);
        this.catch = this.catch.bind(this);
        this.describe = this.describe.bind(this);
        this.pipe = this.pipe.bind(this);
        this.readonly = this.readonly.bind(this);
        this.isNullable = this.isNullable.bind(this);
        this.isOptional = this.isOptional.bind(this);
        this["~standard"] = {
          version: 1,
          vendor: "zod",
          validate: (data) => this["~validate"](data)
        };
      }
      optional() {
        return ZodOptional.create(this, this._def);
      }
      nullable() {
        return ZodNullable.create(this, this._def);
      }
      nullish() {
        return this.nullable().optional();
      }
      array() {
        return ZodArray.create(this);
      }
      promise() {
        return ZodPromise.create(this, this._def);
      }
      or(option) {
        return ZodUnion.create([this, option], this._def);
      }
      and(incoming) {
        return ZodIntersection.create(this, incoming, this._def);
      }
      transform(transform) {
        return new ZodEffects({
          ...processCreateParams(this._def),
          schema: this,
          typeName: ZodFirstPartyTypeKind.ZodEffects,
          effect: { type: "transform", transform }
        });
      }
      default(def) {
        const defaultValueFunc = typeof def === "function" ? def : () => def;
        return new ZodDefault({
          ...processCreateParams(this._def),
          innerType: this,
          defaultValue: defaultValueFunc,
          typeName: ZodFirstPartyTypeKind.ZodDefault
        });
      }
      brand() {
        return new ZodBranded({
          typeName: ZodFirstPartyTypeKind.ZodBranded,
          type: this,
          ...processCreateParams(this._def)
        });
      }
      catch(def) {
        const catchValueFunc = typeof def === "function" ? def : () => def;
        return new ZodCatch({
          ...processCreateParams(this._def),
          innerType: this,
          catchValue: catchValueFunc,
          typeName: ZodFirstPartyTypeKind.ZodCatch
        });
      }
      describe(description) {
        const This = this.constructor;
        return new This({
          ...this._def,
          description
        });
      }
      pipe(target) {
        return ZodPipeline.create(this, target);
      }
      readonly() {
        return ZodReadonly.create(this);
      }
      isOptional() {
        return this.safeParse(void 0).success;
      }
      isNullable() {
        return this.safeParse(null).success;
      }
    };
    cuidRegex = /^c[^\s-]{8,}$/i;
    cuid2Regex = /^[0-9a-z]+$/;
    ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
    uuidRegex = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i;
    nanoidRegex = /^[a-z0-9_-]{21}$/i;
    jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
    durationRegex = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/;
    emailRegex = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i;
    _emojiRegex = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
    ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
    ipv4CidrRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/;
    ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
    ipv6CidrRegex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
    base64Regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
    base64urlRegex = /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/;
    dateRegexSource = `((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))`;
    dateRegex = new RegExp(`^${dateRegexSource}$`);
    ZodString = class _ZodString extends ZodType {
      _parse(input) {
        if (this._def.coerce) {
          input.data = String(input.data);
        }
        const parsedType = this._getType(input);
        if (parsedType !== ZodParsedType.string) {
          const ctx2 = this._getOrReturnCtx(input);
          addIssueToContext(ctx2, {
            code: ZodIssueCode.invalid_type,
            expected: ZodParsedType.string,
            received: ctx2.parsedType
          });
          return INVALID;
        }
        const status = new ParseStatus();
        let ctx = void 0;
        for (const check of this._def.checks) {
          if (check.kind === "min") {
            if (input.data.length < check.value) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                code: ZodIssueCode.too_small,
                minimum: check.value,
                type: "string",
                inclusive: true,
                exact: false,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "max") {
            if (input.data.length > check.value) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                code: ZodIssueCode.too_big,
                maximum: check.value,
                type: "string",
                inclusive: true,
                exact: false,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "length") {
            const tooBig = input.data.length > check.value;
            const tooSmall = input.data.length < check.value;
            if (tooBig || tooSmall) {
              ctx = this._getOrReturnCtx(input, ctx);
              if (tooBig) {
                addIssueToContext(ctx, {
                  code: ZodIssueCode.too_big,
                  maximum: check.value,
                  type: "string",
                  inclusive: true,
                  exact: true,
                  message: check.message
                });
              } else if (tooSmall) {
                addIssueToContext(ctx, {
                  code: ZodIssueCode.too_small,
                  minimum: check.value,
                  type: "string",
                  inclusive: true,
                  exact: true,
                  message: check.message
                });
              }
              status.dirty();
            }
          } else if (check.kind === "email") {
            if (!emailRegex.test(input.data)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                validation: "email",
                code: ZodIssueCode.invalid_string,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "emoji") {
            if (!emojiRegex) {
              emojiRegex = new RegExp(_emojiRegex, "u");
            }
            if (!emojiRegex.test(input.data)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                validation: "emoji",
                code: ZodIssueCode.invalid_string,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "uuid") {
            if (!uuidRegex.test(input.data)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                validation: "uuid",
                code: ZodIssueCode.invalid_string,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "nanoid") {
            if (!nanoidRegex.test(input.data)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                validation: "nanoid",
                code: ZodIssueCode.invalid_string,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "cuid") {
            if (!cuidRegex.test(input.data)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                validation: "cuid",
                code: ZodIssueCode.invalid_string,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "cuid2") {
            if (!cuid2Regex.test(input.data)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                validation: "cuid2",
                code: ZodIssueCode.invalid_string,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "ulid") {
            if (!ulidRegex.test(input.data)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                validation: "ulid",
                code: ZodIssueCode.invalid_string,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "url") {
            try {
              new URL(input.data);
            } catch {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                validation: "url",
                code: ZodIssueCode.invalid_string,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "regex") {
            check.regex.lastIndex = 0;
            const testResult = check.regex.test(input.data);
            if (!testResult) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                validation: "regex",
                code: ZodIssueCode.invalid_string,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "trim") {
            input.data = input.data.trim();
          } else if (check.kind === "includes") {
            if (!input.data.includes(check.value, check.position)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_string,
                validation: { includes: check.value, position: check.position },
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "toLowerCase") {
            input.data = input.data.toLowerCase();
          } else if (check.kind === "toUpperCase") {
            input.data = input.data.toUpperCase();
          } else if (check.kind === "startsWith") {
            if (!input.data.startsWith(check.value)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_string,
                validation: { startsWith: check.value },
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "endsWith") {
            if (!input.data.endsWith(check.value)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_string,
                validation: { endsWith: check.value },
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "datetime") {
            const regex = datetimeRegex(check);
            if (!regex.test(input.data)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_string,
                validation: "datetime",
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "date") {
            const regex = dateRegex;
            if (!regex.test(input.data)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_string,
                validation: "date",
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "time") {
            const regex = timeRegex(check);
            if (!regex.test(input.data)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_string,
                validation: "time",
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "duration") {
            if (!durationRegex.test(input.data)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                validation: "duration",
                code: ZodIssueCode.invalid_string,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "ip") {
            if (!isValidIP(input.data, check.version)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                validation: "ip",
                code: ZodIssueCode.invalid_string,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "jwt") {
            if (!isValidJWT(input.data, check.alg)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                validation: "jwt",
                code: ZodIssueCode.invalid_string,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "cidr") {
            if (!isValidCidr(input.data, check.version)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                validation: "cidr",
                code: ZodIssueCode.invalid_string,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "base64") {
            if (!base64Regex.test(input.data)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                validation: "base64",
                code: ZodIssueCode.invalid_string,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "base64url") {
            if (!base64urlRegex.test(input.data)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                validation: "base64url",
                code: ZodIssueCode.invalid_string,
                message: check.message
              });
              status.dirty();
            }
          } else {
            util.assertNever(check);
          }
        }
        return { status: status.value, value: input.data };
      }
      _regex(regex, validation, message) {
        return this.refinement((data) => regex.test(data), {
          validation,
          code: ZodIssueCode.invalid_string,
          ...errorUtil.errToObj(message)
        });
      }
      _addCheck(check) {
        return new _ZodString({
          ...this._def,
          checks: [...this._def.checks, check]
        });
      }
      email(message) {
        return this._addCheck({ kind: "email", ...errorUtil.errToObj(message) });
      }
      url(message) {
        return this._addCheck({ kind: "url", ...errorUtil.errToObj(message) });
      }
      emoji(message) {
        return this._addCheck({ kind: "emoji", ...errorUtil.errToObj(message) });
      }
      uuid(message) {
        return this._addCheck({ kind: "uuid", ...errorUtil.errToObj(message) });
      }
      nanoid(message) {
        return this._addCheck({ kind: "nanoid", ...errorUtil.errToObj(message) });
      }
      cuid(message) {
        return this._addCheck({ kind: "cuid", ...errorUtil.errToObj(message) });
      }
      cuid2(message) {
        return this._addCheck({ kind: "cuid2", ...errorUtil.errToObj(message) });
      }
      ulid(message) {
        return this._addCheck({ kind: "ulid", ...errorUtil.errToObj(message) });
      }
      base64(message) {
        return this._addCheck({ kind: "base64", ...errorUtil.errToObj(message) });
      }
      base64url(message) {
        return this._addCheck({
          kind: "base64url",
          ...errorUtil.errToObj(message)
        });
      }
      jwt(options) {
        return this._addCheck({ kind: "jwt", ...errorUtil.errToObj(options) });
      }
      ip(options) {
        return this._addCheck({ kind: "ip", ...errorUtil.errToObj(options) });
      }
      cidr(options) {
        return this._addCheck({ kind: "cidr", ...errorUtil.errToObj(options) });
      }
      datetime(options) {
        if (typeof options === "string") {
          return this._addCheck({
            kind: "datetime",
            precision: null,
            offset: false,
            local: false,
            message: options
          });
        }
        return this._addCheck({
          kind: "datetime",
          precision: typeof options?.precision === "undefined" ? null : options?.precision,
          offset: options?.offset ?? false,
          local: options?.local ?? false,
          ...errorUtil.errToObj(options?.message)
        });
      }
      date(message) {
        return this._addCheck({ kind: "date", message });
      }
      time(options) {
        if (typeof options === "string") {
          return this._addCheck({
            kind: "time",
            precision: null,
            message: options
          });
        }
        return this._addCheck({
          kind: "time",
          precision: typeof options?.precision === "undefined" ? null : options?.precision,
          ...errorUtil.errToObj(options?.message)
        });
      }
      duration(message) {
        return this._addCheck({ kind: "duration", ...errorUtil.errToObj(message) });
      }
      regex(regex, message) {
        return this._addCheck({
          kind: "regex",
          regex,
          ...errorUtil.errToObj(message)
        });
      }
      includes(value, options) {
        return this._addCheck({
          kind: "includes",
          value,
          position: options?.position,
          ...errorUtil.errToObj(options?.message)
        });
      }
      startsWith(value, message) {
        return this._addCheck({
          kind: "startsWith",
          value,
          ...errorUtil.errToObj(message)
        });
      }
      endsWith(value, message) {
        return this._addCheck({
          kind: "endsWith",
          value,
          ...errorUtil.errToObj(message)
        });
      }
      min(minLength, message) {
        return this._addCheck({
          kind: "min",
          value: minLength,
          ...errorUtil.errToObj(message)
        });
      }
      max(maxLength, message) {
        return this._addCheck({
          kind: "max",
          value: maxLength,
          ...errorUtil.errToObj(message)
        });
      }
      length(len, message) {
        return this._addCheck({
          kind: "length",
          value: len,
          ...errorUtil.errToObj(message)
        });
      }
      /**
       * Equivalent to `.min(1)`
       */
      nonempty(message) {
        return this.min(1, errorUtil.errToObj(message));
      }
      trim() {
        return new _ZodString({
          ...this._def,
          checks: [...this._def.checks, { kind: "trim" }]
        });
      }
      toLowerCase() {
        return new _ZodString({
          ...this._def,
          checks: [...this._def.checks, { kind: "toLowerCase" }]
        });
      }
      toUpperCase() {
        return new _ZodString({
          ...this._def,
          checks: [...this._def.checks, { kind: "toUpperCase" }]
        });
      }
      get isDatetime() {
        return !!this._def.checks.find((ch) => ch.kind === "datetime");
      }
      get isDate() {
        return !!this._def.checks.find((ch) => ch.kind === "date");
      }
      get isTime() {
        return !!this._def.checks.find((ch) => ch.kind === "time");
      }
      get isDuration() {
        return !!this._def.checks.find((ch) => ch.kind === "duration");
      }
      get isEmail() {
        return !!this._def.checks.find((ch) => ch.kind === "email");
      }
      get isURL() {
        return !!this._def.checks.find((ch) => ch.kind === "url");
      }
      get isEmoji() {
        return !!this._def.checks.find((ch) => ch.kind === "emoji");
      }
      get isUUID() {
        return !!this._def.checks.find((ch) => ch.kind === "uuid");
      }
      get isNANOID() {
        return !!this._def.checks.find((ch) => ch.kind === "nanoid");
      }
      get isCUID() {
        return !!this._def.checks.find((ch) => ch.kind === "cuid");
      }
      get isCUID2() {
        return !!this._def.checks.find((ch) => ch.kind === "cuid2");
      }
      get isULID() {
        return !!this._def.checks.find((ch) => ch.kind === "ulid");
      }
      get isIP() {
        return !!this._def.checks.find((ch) => ch.kind === "ip");
      }
      get isCIDR() {
        return !!this._def.checks.find((ch) => ch.kind === "cidr");
      }
      get isBase64() {
        return !!this._def.checks.find((ch) => ch.kind === "base64");
      }
      get isBase64url() {
        return !!this._def.checks.find((ch) => ch.kind === "base64url");
      }
      get minLength() {
        let min = null;
        for (const ch of this._def.checks) {
          if (ch.kind === "min") {
            if (min === null || ch.value > min)
              min = ch.value;
          }
        }
        return min;
      }
      get maxLength() {
        let max = null;
        for (const ch of this._def.checks) {
          if (ch.kind === "max") {
            if (max === null || ch.value < max)
              max = ch.value;
          }
        }
        return max;
      }
    };
    ZodString.create = (params) => {
      return new ZodString({
        checks: [],
        typeName: ZodFirstPartyTypeKind.ZodString,
        coerce: params?.coerce ?? false,
        ...processCreateParams(params)
      });
    };
    ZodNumber = class _ZodNumber extends ZodType {
      constructor() {
        super(...arguments);
        this.min = this.gte;
        this.max = this.lte;
        this.step = this.multipleOf;
      }
      _parse(input) {
        if (this._def.coerce) {
          input.data = Number(input.data);
        }
        const parsedType = this._getType(input);
        if (parsedType !== ZodParsedType.number) {
          const ctx2 = this._getOrReturnCtx(input);
          addIssueToContext(ctx2, {
            code: ZodIssueCode.invalid_type,
            expected: ZodParsedType.number,
            received: ctx2.parsedType
          });
          return INVALID;
        }
        let ctx = void 0;
        const status = new ParseStatus();
        for (const check of this._def.checks) {
          if (check.kind === "int") {
            if (!util.isInteger(input.data)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_type,
                expected: "integer",
                received: "float",
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "min") {
            const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
            if (tooSmall) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                code: ZodIssueCode.too_small,
                minimum: check.value,
                type: "number",
                inclusive: check.inclusive,
                exact: false,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "max") {
            const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
            if (tooBig) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                code: ZodIssueCode.too_big,
                maximum: check.value,
                type: "number",
                inclusive: check.inclusive,
                exact: false,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "multipleOf") {
            if (floatSafeRemainder(input.data, check.value) !== 0) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                code: ZodIssueCode.not_multiple_of,
                multipleOf: check.value,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "finite") {
            if (!Number.isFinite(input.data)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                code: ZodIssueCode.not_finite,
                message: check.message
              });
              status.dirty();
            }
          } else {
            util.assertNever(check);
          }
        }
        return { status: status.value, value: input.data };
      }
      gte(value, message) {
        return this.setLimit("min", value, true, errorUtil.toString(message));
      }
      gt(value, message) {
        return this.setLimit("min", value, false, errorUtil.toString(message));
      }
      lte(value, message) {
        return this.setLimit("max", value, true, errorUtil.toString(message));
      }
      lt(value, message) {
        return this.setLimit("max", value, false, errorUtil.toString(message));
      }
      setLimit(kind, value, inclusive, message) {
        return new _ZodNumber({
          ...this._def,
          checks: [
            ...this._def.checks,
            {
              kind,
              value,
              inclusive,
              message: errorUtil.toString(message)
            }
          ]
        });
      }
      _addCheck(check) {
        return new _ZodNumber({
          ...this._def,
          checks: [...this._def.checks, check]
        });
      }
      int(message) {
        return this._addCheck({
          kind: "int",
          message: errorUtil.toString(message)
        });
      }
      positive(message) {
        return this._addCheck({
          kind: "min",
          value: 0,
          inclusive: false,
          message: errorUtil.toString(message)
        });
      }
      negative(message) {
        return this._addCheck({
          kind: "max",
          value: 0,
          inclusive: false,
          message: errorUtil.toString(message)
        });
      }
      nonpositive(message) {
        return this._addCheck({
          kind: "max",
          value: 0,
          inclusive: true,
          message: errorUtil.toString(message)
        });
      }
      nonnegative(message) {
        return this._addCheck({
          kind: "min",
          value: 0,
          inclusive: true,
          message: errorUtil.toString(message)
        });
      }
      multipleOf(value, message) {
        return this._addCheck({
          kind: "multipleOf",
          value,
          message: errorUtil.toString(message)
        });
      }
      finite(message) {
        return this._addCheck({
          kind: "finite",
          message: errorUtil.toString(message)
        });
      }
      safe(message) {
        return this._addCheck({
          kind: "min",
          inclusive: true,
          value: Number.MIN_SAFE_INTEGER,
          message: errorUtil.toString(message)
        })._addCheck({
          kind: "max",
          inclusive: true,
          value: Number.MAX_SAFE_INTEGER,
          message: errorUtil.toString(message)
        });
      }
      get minValue() {
        let min = null;
        for (const ch of this._def.checks) {
          if (ch.kind === "min") {
            if (min === null || ch.value > min)
              min = ch.value;
          }
        }
        return min;
      }
      get maxValue() {
        let max = null;
        for (const ch of this._def.checks) {
          if (ch.kind === "max") {
            if (max === null || ch.value < max)
              max = ch.value;
          }
        }
        return max;
      }
      get isInt() {
        return !!this._def.checks.find((ch) => ch.kind === "int" || ch.kind === "multipleOf" && util.isInteger(ch.value));
      }
      get isFinite() {
        let max = null;
        let min = null;
        for (const ch of this._def.checks) {
          if (ch.kind === "finite" || ch.kind === "int" || ch.kind === "multipleOf") {
            return true;
          } else if (ch.kind === "min") {
            if (min === null || ch.value > min)
              min = ch.value;
          } else if (ch.kind === "max") {
            if (max === null || ch.value < max)
              max = ch.value;
          }
        }
        return Number.isFinite(min) && Number.isFinite(max);
      }
    };
    ZodNumber.create = (params) => {
      return new ZodNumber({
        checks: [],
        typeName: ZodFirstPartyTypeKind.ZodNumber,
        coerce: params?.coerce || false,
        ...processCreateParams(params)
      });
    };
    ZodBigInt = class _ZodBigInt extends ZodType {
      constructor() {
        super(...arguments);
        this.min = this.gte;
        this.max = this.lte;
      }
      _parse(input) {
        if (this._def.coerce) {
          try {
            input.data = BigInt(input.data);
          } catch {
            return this._getInvalidInput(input);
          }
        }
        const parsedType = this._getType(input);
        if (parsedType !== ZodParsedType.bigint) {
          return this._getInvalidInput(input);
        }
        let ctx = void 0;
        const status = new ParseStatus();
        for (const check of this._def.checks) {
          if (check.kind === "min") {
            const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
            if (tooSmall) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                code: ZodIssueCode.too_small,
                type: "bigint",
                minimum: check.value,
                inclusive: check.inclusive,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "max") {
            const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
            if (tooBig) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                code: ZodIssueCode.too_big,
                type: "bigint",
                maximum: check.value,
                inclusive: check.inclusive,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "multipleOf") {
            if (input.data % check.value !== BigInt(0)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                code: ZodIssueCode.not_multiple_of,
                multipleOf: check.value,
                message: check.message
              });
              status.dirty();
            }
          } else {
            util.assertNever(check);
          }
        }
        return { status: status.value, value: input.data };
      }
      _getInvalidInput(input) {
        const ctx = this._getOrReturnCtx(input);
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.bigint,
          received: ctx.parsedType
        });
        return INVALID;
      }
      gte(value, message) {
        return this.setLimit("min", value, true, errorUtil.toString(message));
      }
      gt(value, message) {
        return this.setLimit("min", value, false, errorUtil.toString(message));
      }
      lte(value, message) {
        return this.setLimit("max", value, true, errorUtil.toString(message));
      }
      lt(value, message) {
        return this.setLimit("max", value, false, errorUtil.toString(message));
      }
      setLimit(kind, value, inclusive, message) {
        return new _ZodBigInt({
          ...this._def,
          checks: [
            ...this._def.checks,
            {
              kind,
              value,
              inclusive,
              message: errorUtil.toString(message)
            }
          ]
        });
      }
      _addCheck(check) {
        return new _ZodBigInt({
          ...this._def,
          checks: [...this._def.checks, check]
        });
      }
      positive(message) {
        return this._addCheck({
          kind: "min",
          value: BigInt(0),
          inclusive: false,
          message: errorUtil.toString(message)
        });
      }
      negative(message) {
        return this._addCheck({
          kind: "max",
          value: BigInt(0),
          inclusive: false,
          message: errorUtil.toString(message)
        });
      }
      nonpositive(message) {
        return this._addCheck({
          kind: "max",
          value: BigInt(0),
          inclusive: true,
          message: errorUtil.toString(message)
        });
      }
      nonnegative(message) {
        return this._addCheck({
          kind: "min",
          value: BigInt(0),
          inclusive: true,
          message: errorUtil.toString(message)
        });
      }
      multipleOf(value, message) {
        return this._addCheck({
          kind: "multipleOf",
          value,
          message: errorUtil.toString(message)
        });
      }
      get minValue() {
        let min = null;
        for (const ch of this._def.checks) {
          if (ch.kind === "min") {
            if (min === null || ch.value > min)
              min = ch.value;
          }
        }
        return min;
      }
      get maxValue() {
        let max = null;
        for (const ch of this._def.checks) {
          if (ch.kind === "max") {
            if (max === null || ch.value < max)
              max = ch.value;
          }
        }
        return max;
      }
    };
    ZodBigInt.create = (params) => {
      return new ZodBigInt({
        checks: [],
        typeName: ZodFirstPartyTypeKind.ZodBigInt,
        coerce: params?.coerce ?? false,
        ...processCreateParams(params)
      });
    };
    ZodBoolean = class extends ZodType {
      _parse(input) {
        if (this._def.coerce) {
          input.data = Boolean(input.data);
        }
        const parsedType = this._getType(input);
        if (parsedType !== ZodParsedType.boolean) {
          const ctx = this._getOrReturnCtx(input);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: ZodParsedType.boolean,
            received: ctx.parsedType
          });
          return INVALID;
        }
        return OK(input.data);
      }
    };
    ZodBoolean.create = (params) => {
      return new ZodBoolean({
        typeName: ZodFirstPartyTypeKind.ZodBoolean,
        coerce: params?.coerce || false,
        ...processCreateParams(params)
      });
    };
    ZodDate = class _ZodDate extends ZodType {
      _parse(input) {
        if (this._def.coerce) {
          input.data = new Date(input.data);
        }
        const parsedType = this._getType(input);
        if (parsedType !== ZodParsedType.date) {
          const ctx2 = this._getOrReturnCtx(input);
          addIssueToContext(ctx2, {
            code: ZodIssueCode.invalid_type,
            expected: ZodParsedType.date,
            received: ctx2.parsedType
          });
          return INVALID;
        }
        if (Number.isNaN(input.data.getTime())) {
          const ctx2 = this._getOrReturnCtx(input);
          addIssueToContext(ctx2, {
            code: ZodIssueCode.invalid_date
          });
          return INVALID;
        }
        const status = new ParseStatus();
        let ctx = void 0;
        for (const check of this._def.checks) {
          if (check.kind === "min") {
            if (input.data.getTime() < check.value) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                code: ZodIssueCode.too_small,
                message: check.message,
                inclusive: true,
                exact: false,
                minimum: check.value,
                type: "date"
              });
              status.dirty();
            }
          } else if (check.kind === "max") {
            if (input.data.getTime() > check.value) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                code: ZodIssueCode.too_big,
                message: check.message,
                inclusive: true,
                exact: false,
                maximum: check.value,
                type: "date"
              });
              status.dirty();
            }
          } else {
            util.assertNever(check);
          }
        }
        return {
          status: status.value,
          value: new Date(input.data.getTime())
        };
      }
      _addCheck(check) {
        return new _ZodDate({
          ...this._def,
          checks: [...this._def.checks, check]
        });
      }
      min(minDate, message) {
        return this._addCheck({
          kind: "min",
          value: minDate.getTime(),
          message: errorUtil.toString(message)
        });
      }
      max(maxDate, message) {
        return this._addCheck({
          kind: "max",
          value: maxDate.getTime(),
          message: errorUtil.toString(message)
        });
      }
      get minDate() {
        let min = null;
        for (const ch of this._def.checks) {
          if (ch.kind === "min") {
            if (min === null || ch.value > min)
              min = ch.value;
          }
        }
        return min != null ? new Date(min) : null;
      }
      get maxDate() {
        let max = null;
        for (const ch of this._def.checks) {
          if (ch.kind === "max") {
            if (max === null || ch.value < max)
              max = ch.value;
          }
        }
        return max != null ? new Date(max) : null;
      }
    };
    ZodDate.create = (params) => {
      return new ZodDate({
        checks: [],
        coerce: params?.coerce || false,
        typeName: ZodFirstPartyTypeKind.ZodDate,
        ...processCreateParams(params)
      });
    };
    ZodSymbol = class extends ZodType {
      _parse(input) {
        const parsedType = this._getType(input);
        if (parsedType !== ZodParsedType.symbol) {
          const ctx = this._getOrReturnCtx(input);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: ZodParsedType.symbol,
            received: ctx.parsedType
          });
          return INVALID;
        }
        return OK(input.data);
      }
    };
    ZodSymbol.create = (params) => {
      return new ZodSymbol({
        typeName: ZodFirstPartyTypeKind.ZodSymbol,
        ...processCreateParams(params)
      });
    };
    ZodUndefined = class extends ZodType {
      _parse(input) {
        const parsedType = this._getType(input);
        if (parsedType !== ZodParsedType.undefined) {
          const ctx = this._getOrReturnCtx(input);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: ZodParsedType.undefined,
            received: ctx.parsedType
          });
          return INVALID;
        }
        return OK(input.data);
      }
    };
    ZodUndefined.create = (params) => {
      return new ZodUndefined({
        typeName: ZodFirstPartyTypeKind.ZodUndefined,
        ...processCreateParams(params)
      });
    };
    ZodNull = class extends ZodType {
      _parse(input) {
        const parsedType = this._getType(input);
        if (parsedType !== ZodParsedType.null) {
          const ctx = this._getOrReturnCtx(input);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: ZodParsedType.null,
            received: ctx.parsedType
          });
          return INVALID;
        }
        return OK(input.data);
      }
    };
    ZodNull.create = (params) => {
      return new ZodNull({
        typeName: ZodFirstPartyTypeKind.ZodNull,
        ...processCreateParams(params)
      });
    };
    ZodAny = class extends ZodType {
      constructor() {
        super(...arguments);
        this._any = true;
      }
      _parse(input) {
        return OK(input.data);
      }
    };
    ZodAny.create = (params) => {
      return new ZodAny({
        typeName: ZodFirstPartyTypeKind.ZodAny,
        ...processCreateParams(params)
      });
    };
    ZodUnknown = class extends ZodType {
      constructor() {
        super(...arguments);
        this._unknown = true;
      }
      _parse(input) {
        return OK(input.data);
      }
    };
    ZodUnknown.create = (params) => {
      return new ZodUnknown({
        typeName: ZodFirstPartyTypeKind.ZodUnknown,
        ...processCreateParams(params)
      });
    };
    ZodNever = class extends ZodType {
      _parse(input) {
        const ctx = this._getOrReturnCtx(input);
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.never,
          received: ctx.parsedType
        });
        return INVALID;
      }
    };
    ZodNever.create = (params) => {
      return new ZodNever({
        typeName: ZodFirstPartyTypeKind.ZodNever,
        ...processCreateParams(params)
      });
    };
    ZodVoid = class extends ZodType {
      _parse(input) {
        const parsedType = this._getType(input);
        if (parsedType !== ZodParsedType.undefined) {
          const ctx = this._getOrReturnCtx(input);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: ZodParsedType.void,
            received: ctx.parsedType
          });
          return INVALID;
        }
        return OK(input.data);
      }
    };
    ZodVoid.create = (params) => {
      return new ZodVoid({
        typeName: ZodFirstPartyTypeKind.ZodVoid,
        ...processCreateParams(params)
      });
    };
    ZodArray = class _ZodArray extends ZodType {
      _parse(input) {
        const { ctx, status } = this._processInputParams(input);
        const def = this._def;
        if (ctx.parsedType !== ZodParsedType.array) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: ZodParsedType.array,
            received: ctx.parsedType
          });
          return INVALID;
        }
        if (def.exactLength !== null) {
          const tooBig = ctx.data.length > def.exactLength.value;
          const tooSmall = ctx.data.length < def.exactLength.value;
          if (tooBig || tooSmall) {
            addIssueToContext(ctx, {
              code: tooBig ? ZodIssueCode.too_big : ZodIssueCode.too_small,
              minimum: tooSmall ? def.exactLength.value : void 0,
              maximum: tooBig ? def.exactLength.value : void 0,
              type: "array",
              inclusive: true,
              exact: true,
              message: def.exactLength.message
            });
            status.dirty();
          }
        }
        if (def.minLength !== null) {
          if (ctx.data.length < def.minLength.value) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              minimum: def.minLength.value,
              type: "array",
              inclusive: true,
              exact: false,
              message: def.minLength.message
            });
            status.dirty();
          }
        }
        if (def.maxLength !== null) {
          if (ctx.data.length > def.maxLength.value) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              maximum: def.maxLength.value,
              type: "array",
              inclusive: true,
              exact: false,
              message: def.maxLength.message
            });
            status.dirty();
          }
        }
        if (ctx.common.async) {
          return Promise.all([...ctx.data].map((item, i) => {
            return def.type._parseAsync(new ParseInputLazyPath(ctx, item, ctx.path, i));
          })).then((result2) => {
            return ParseStatus.mergeArray(status, result2);
          });
        }
        const result = [...ctx.data].map((item, i) => {
          return def.type._parseSync(new ParseInputLazyPath(ctx, item, ctx.path, i));
        });
        return ParseStatus.mergeArray(status, result);
      }
      get element() {
        return this._def.type;
      }
      min(minLength, message) {
        return new _ZodArray({
          ...this._def,
          minLength: { value: minLength, message: errorUtil.toString(message) }
        });
      }
      max(maxLength, message) {
        return new _ZodArray({
          ...this._def,
          maxLength: { value: maxLength, message: errorUtil.toString(message) }
        });
      }
      length(len, message) {
        return new _ZodArray({
          ...this._def,
          exactLength: { value: len, message: errorUtil.toString(message) }
        });
      }
      nonempty(message) {
        return this.min(1, message);
      }
    };
    ZodArray.create = (schema, params) => {
      return new ZodArray({
        type: schema,
        minLength: null,
        maxLength: null,
        exactLength: null,
        typeName: ZodFirstPartyTypeKind.ZodArray,
        ...processCreateParams(params)
      });
    };
    ZodObject = class _ZodObject extends ZodType {
      constructor() {
        super(...arguments);
        this._cached = null;
        this.nonstrict = this.passthrough;
        this.augment = this.extend;
      }
      _getCached() {
        if (this._cached !== null)
          return this._cached;
        const shape = this._def.shape();
        const keys = util.objectKeys(shape);
        this._cached = { shape, keys };
        return this._cached;
      }
      _parse(input) {
        const parsedType = this._getType(input);
        if (parsedType !== ZodParsedType.object) {
          const ctx2 = this._getOrReturnCtx(input);
          addIssueToContext(ctx2, {
            code: ZodIssueCode.invalid_type,
            expected: ZodParsedType.object,
            received: ctx2.parsedType
          });
          return INVALID;
        }
        const { status, ctx } = this._processInputParams(input);
        const { shape, keys: shapeKeys } = this._getCached();
        const extraKeys = [];
        if (!(this._def.catchall instanceof ZodNever && this._def.unknownKeys === "strip")) {
          for (const key in ctx.data) {
            if (!shapeKeys.includes(key)) {
              extraKeys.push(key);
            }
          }
        }
        const pairs = [];
        for (const key of shapeKeys) {
          const keyValidator = shape[key];
          const value = ctx.data[key];
          pairs.push({
            key: { status: "valid", value: key },
            value: keyValidator._parse(new ParseInputLazyPath(ctx, value, ctx.path, key)),
            alwaysSet: key in ctx.data
          });
        }
        if (this._def.catchall instanceof ZodNever) {
          const unknownKeys = this._def.unknownKeys;
          if (unknownKeys === "passthrough") {
            for (const key of extraKeys) {
              pairs.push({
                key: { status: "valid", value: key },
                value: { status: "valid", value: ctx.data[key] }
              });
            }
          } else if (unknownKeys === "strict") {
            if (extraKeys.length > 0) {
              addIssueToContext(ctx, {
                code: ZodIssueCode.unrecognized_keys,
                keys: extraKeys
              });
              status.dirty();
            }
          } else if (unknownKeys === "strip") {
          } else {
            throw new Error(`Internal ZodObject error: invalid unknownKeys value.`);
          }
        } else {
          const catchall = this._def.catchall;
          for (const key of extraKeys) {
            const value = ctx.data[key];
            pairs.push({
              key: { status: "valid", value: key },
              value: catchall._parse(
                new ParseInputLazyPath(ctx, value, ctx.path, key)
                //, ctx.child(key), value, getParsedType(value)
              ),
              alwaysSet: key in ctx.data
            });
          }
        }
        if (ctx.common.async) {
          return Promise.resolve().then(async () => {
            const syncPairs = [];
            for (const pair of pairs) {
              const key = await pair.key;
              const value = await pair.value;
              syncPairs.push({
                key,
                value,
                alwaysSet: pair.alwaysSet
              });
            }
            return syncPairs;
          }).then((syncPairs) => {
            return ParseStatus.mergeObjectSync(status, syncPairs);
          });
        } else {
          return ParseStatus.mergeObjectSync(status, pairs);
        }
      }
      get shape() {
        return this._def.shape();
      }
      strict(message) {
        errorUtil.errToObj;
        return new _ZodObject({
          ...this._def,
          unknownKeys: "strict",
          ...message !== void 0 ? {
            errorMap: (issue, ctx) => {
              const defaultError = this._def.errorMap?.(issue, ctx).message ?? ctx.defaultError;
              if (issue.code === "unrecognized_keys")
                return {
                  message: errorUtil.errToObj(message).message ?? defaultError
                };
              return {
                message: defaultError
              };
            }
          } : {}
        });
      }
      strip() {
        return new _ZodObject({
          ...this._def,
          unknownKeys: "strip"
        });
      }
      passthrough() {
        return new _ZodObject({
          ...this._def,
          unknownKeys: "passthrough"
        });
      }
      // const AugmentFactory =
      //   <Def extends ZodObjectDef>(def: Def) =>
      //   <Augmentation extends ZodRawShape>(
      //     augmentation: Augmentation
      //   ): ZodObject<
      //     extendShape<ReturnType<Def["shape"]>, Augmentation>,
      //     Def["unknownKeys"],
      //     Def["catchall"]
      //   > => {
      //     return new ZodObject({
      //       ...def,
      //       shape: () => ({
      //         ...def.shape(),
      //         ...augmentation,
      //       }),
      //     }) as any;
      //   };
      extend(augmentation) {
        return new _ZodObject({
          ...this._def,
          shape: () => ({
            ...this._def.shape(),
            ...augmentation
          })
        });
      }
      /**
       * Prior to zod@1.0.12 there was a bug in the
       * inferred type of merged objects. Please
       * upgrade if you are experiencing issues.
       */
      merge(merging) {
        const merged = new _ZodObject({
          unknownKeys: merging._def.unknownKeys,
          catchall: merging._def.catchall,
          shape: () => ({
            ...this._def.shape(),
            ...merging._def.shape()
          }),
          typeName: ZodFirstPartyTypeKind.ZodObject
        });
        return merged;
      }
      // merge<
      //   Incoming extends AnyZodObject,
      //   Augmentation extends Incoming["shape"],
      //   NewOutput extends {
      //     [k in keyof Augmentation | keyof Output]: k extends keyof Augmentation
      //       ? Augmentation[k]["_output"]
      //       : k extends keyof Output
      //       ? Output[k]
      //       : never;
      //   },
      //   NewInput extends {
      //     [k in keyof Augmentation | keyof Input]: k extends keyof Augmentation
      //       ? Augmentation[k]["_input"]
      //       : k extends keyof Input
      //       ? Input[k]
      //       : never;
      //   }
      // >(
      //   merging: Incoming
      // ): ZodObject<
      //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
      //   Incoming["_def"]["unknownKeys"],
      //   Incoming["_def"]["catchall"],
      //   NewOutput,
      //   NewInput
      // > {
      //   const merged: any = new ZodObject({
      //     unknownKeys: merging._def.unknownKeys,
      //     catchall: merging._def.catchall,
      //     shape: () =>
      //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
      //     typeName: ZodFirstPartyTypeKind.ZodObject,
      //   }) as any;
      //   return merged;
      // }
      setKey(key, schema) {
        return this.augment({ [key]: schema });
      }
      // merge<Incoming extends AnyZodObject>(
      //   merging: Incoming
      // ): //ZodObject<T & Incoming["_shape"], UnknownKeys, Catchall> = (merging) => {
      // ZodObject<
      //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
      //   Incoming["_def"]["unknownKeys"],
      //   Incoming["_def"]["catchall"]
      // > {
      //   // const mergedShape = objectUtil.mergeShapes(
      //   //   this._def.shape(),
      //   //   merging._def.shape()
      //   // );
      //   const merged: any = new ZodObject({
      //     unknownKeys: merging._def.unknownKeys,
      //     catchall: merging._def.catchall,
      //     shape: () =>
      //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
      //     typeName: ZodFirstPartyTypeKind.ZodObject,
      //   }) as any;
      //   return merged;
      // }
      catchall(index) {
        return new _ZodObject({
          ...this._def,
          catchall: index
        });
      }
      pick(mask) {
        const shape = {};
        for (const key of util.objectKeys(mask)) {
          if (mask[key] && this.shape[key]) {
            shape[key] = this.shape[key];
          }
        }
        return new _ZodObject({
          ...this._def,
          shape: () => shape
        });
      }
      omit(mask) {
        const shape = {};
        for (const key of util.objectKeys(this.shape)) {
          if (!mask[key]) {
            shape[key] = this.shape[key];
          }
        }
        return new _ZodObject({
          ...this._def,
          shape: () => shape
        });
      }
      /**
       * @deprecated
       */
      deepPartial() {
        return deepPartialify(this);
      }
      partial(mask) {
        const newShape = {};
        for (const key of util.objectKeys(this.shape)) {
          const fieldSchema = this.shape[key];
          if (mask && !mask[key]) {
            newShape[key] = fieldSchema;
          } else {
            newShape[key] = fieldSchema.optional();
          }
        }
        return new _ZodObject({
          ...this._def,
          shape: () => newShape
        });
      }
      required(mask) {
        const newShape = {};
        for (const key of util.objectKeys(this.shape)) {
          if (mask && !mask[key]) {
            newShape[key] = this.shape[key];
          } else {
            const fieldSchema = this.shape[key];
            let newField = fieldSchema;
            while (newField instanceof ZodOptional) {
              newField = newField._def.innerType;
            }
            newShape[key] = newField;
          }
        }
        return new _ZodObject({
          ...this._def,
          shape: () => newShape
        });
      }
      keyof() {
        return createZodEnum(util.objectKeys(this.shape));
      }
    };
    ZodObject.create = (shape, params) => {
      return new ZodObject({
        shape: () => shape,
        unknownKeys: "strip",
        catchall: ZodNever.create(),
        typeName: ZodFirstPartyTypeKind.ZodObject,
        ...processCreateParams(params)
      });
    };
    ZodObject.strictCreate = (shape, params) => {
      return new ZodObject({
        shape: () => shape,
        unknownKeys: "strict",
        catchall: ZodNever.create(),
        typeName: ZodFirstPartyTypeKind.ZodObject,
        ...processCreateParams(params)
      });
    };
    ZodObject.lazycreate = (shape, params) => {
      return new ZodObject({
        shape,
        unknownKeys: "strip",
        catchall: ZodNever.create(),
        typeName: ZodFirstPartyTypeKind.ZodObject,
        ...processCreateParams(params)
      });
    };
    ZodUnion = class extends ZodType {
      _parse(input) {
        const { ctx } = this._processInputParams(input);
        const options = this._def.options;
        function handleResults(results) {
          for (const result of results) {
            if (result.result.status === "valid") {
              return result.result;
            }
          }
          for (const result of results) {
            if (result.result.status === "dirty") {
              ctx.common.issues.push(...result.ctx.common.issues);
              return result.result;
            }
          }
          const unionErrors = results.map((result) => new ZodError(result.ctx.common.issues));
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_union,
            unionErrors
          });
          return INVALID;
        }
        if (ctx.common.async) {
          return Promise.all(options.map(async (option) => {
            const childCtx = {
              ...ctx,
              common: {
                ...ctx.common,
                issues: []
              },
              parent: null
            };
            return {
              result: await option._parseAsync({
                data: ctx.data,
                path: ctx.path,
                parent: childCtx
              }),
              ctx: childCtx
            };
          })).then(handleResults);
        } else {
          let dirty = void 0;
          const issues = [];
          for (const option of options) {
            const childCtx = {
              ...ctx,
              common: {
                ...ctx.common,
                issues: []
              },
              parent: null
            };
            const result = option._parseSync({
              data: ctx.data,
              path: ctx.path,
              parent: childCtx
            });
            if (result.status === "valid") {
              return result;
            } else if (result.status === "dirty" && !dirty) {
              dirty = { result, ctx: childCtx };
            }
            if (childCtx.common.issues.length) {
              issues.push(childCtx.common.issues);
            }
          }
          if (dirty) {
            ctx.common.issues.push(...dirty.ctx.common.issues);
            return dirty.result;
          }
          const unionErrors = issues.map((issues2) => new ZodError(issues2));
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_union,
            unionErrors
          });
          return INVALID;
        }
      }
      get options() {
        return this._def.options;
      }
    };
    ZodUnion.create = (types, params) => {
      return new ZodUnion({
        options: types,
        typeName: ZodFirstPartyTypeKind.ZodUnion,
        ...processCreateParams(params)
      });
    };
    getDiscriminator = (type) => {
      if (type instanceof ZodLazy) {
        return getDiscriminator(type.schema);
      } else if (type instanceof ZodEffects) {
        return getDiscriminator(type.innerType());
      } else if (type instanceof ZodLiteral) {
        return [type.value];
      } else if (type instanceof ZodEnum) {
        return type.options;
      } else if (type instanceof ZodNativeEnum) {
        return util.objectValues(type.enum);
      } else if (type instanceof ZodDefault) {
        return getDiscriminator(type._def.innerType);
      } else if (type instanceof ZodUndefined) {
        return [void 0];
      } else if (type instanceof ZodNull) {
        return [null];
      } else if (type instanceof ZodOptional) {
        return [void 0, ...getDiscriminator(type.unwrap())];
      } else if (type instanceof ZodNullable) {
        return [null, ...getDiscriminator(type.unwrap())];
      } else if (type instanceof ZodBranded) {
        return getDiscriminator(type.unwrap());
      } else if (type instanceof ZodReadonly) {
        return getDiscriminator(type.unwrap());
      } else if (type instanceof ZodCatch) {
        return getDiscriminator(type._def.innerType);
      } else {
        return [];
      }
    };
    ZodDiscriminatedUnion = class _ZodDiscriminatedUnion extends ZodType {
      _parse(input) {
        const { ctx } = this._processInputParams(input);
        if (ctx.parsedType !== ZodParsedType.object) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: ZodParsedType.object,
            received: ctx.parsedType
          });
          return INVALID;
        }
        const discriminator = this.discriminator;
        const discriminatorValue = ctx.data[discriminator];
        const option = this.optionsMap.get(discriminatorValue);
        if (!option) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_union_discriminator,
            options: Array.from(this.optionsMap.keys()),
            path: [discriminator]
          });
          return INVALID;
        }
        if (ctx.common.async) {
          return option._parseAsync({
            data: ctx.data,
            path: ctx.path,
            parent: ctx
          });
        } else {
          return option._parseSync({
            data: ctx.data,
            path: ctx.path,
            parent: ctx
          });
        }
      }
      get discriminator() {
        return this._def.discriminator;
      }
      get options() {
        return this._def.options;
      }
      get optionsMap() {
        return this._def.optionsMap;
      }
      /**
       * The constructor of the discriminated union schema. Its behaviour is very similar to that of the normal z.union() constructor.
       * However, it only allows a union of objects, all of which need to share a discriminator property. This property must
       * have a different value for each object in the union.
       * @param discriminator the name of the discriminator property
       * @param types an array of object schemas
       * @param params
       */
      static create(discriminator, options, params) {
        const optionsMap = /* @__PURE__ */ new Map();
        for (const type of options) {
          const discriminatorValues = getDiscriminator(type.shape[discriminator]);
          if (!discriminatorValues.length) {
            throw new Error(`A discriminator value for key \`${discriminator}\` could not be extracted from all schema options`);
          }
          for (const value of discriminatorValues) {
            if (optionsMap.has(value)) {
              throw new Error(`Discriminator property ${String(discriminator)} has duplicate value ${String(value)}`);
            }
            optionsMap.set(value, type);
          }
        }
        return new _ZodDiscriminatedUnion({
          typeName: ZodFirstPartyTypeKind.ZodDiscriminatedUnion,
          discriminator,
          options,
          optionsMap,
          ...processCreateParams(params)
        });
      }
    };
    ZodIntersection = class extends ZodType {
      _parse(input) {
        const { status, ctx } = this._processInputParams(input);
        const handleParsed = (parsedLeft, parsedRight) => {
          if (isAborted(parsedLeft) || isAborted(parsedRight)) {
            return INVALID;
          }
          const merged = mergeValues(parsedLeft.value, parsedRight.value);
          if (!merged.valid) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.invalid_intersection_types
            });
            return INVALID;
          }
          if (isDirty(parsedLeft) || isDirty(parsedRight)) {
            status.dirty();
          }
          return { status: status.value, value: merged.data };
        };
        if (ctx.common.async) {
          return Promise.all([
            this._def.left._parseAsync({
              data: ctx.data,
              path: ctx.path,
              parent: ctx
            }),
            this._def.right._parseAsync({
              data: ctx.data,
              path: ctx.path,
              parent: ctx
            })
          ]).then(([left, right]) => handleParsed(left, right));
        } else {
          return handleParsed(this._def.left._parseSync({
            data: ctx.data,
            path: ctx.path,
            parent: ctx
          }), this._def.right._parseSync({
            data: ctx.data,
            path: ctx.path,
            parent: ctx
          }));
        }
      }
    };
    ZodIntersection.create = (left, right, params) => {
      return new ZodIntersection({
        left,
        right,
        typeName: ZodFirstPartyTypeKind.ZodIntersection,
        ...processCreateParams(params)
      });
    };
    ZodTuple = class _ZodTuple extends ZodType {
      _parse(input) {
        const { status, ctx } = this._processInputParams(input);
        if (ctx.parsedType !== ZodParsedType.array) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: ZodParsedType.array,
            received: ctx.parsedType
          });
          return INVALID;
        }
        if (ctx.data.length < this._def.items.length) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: this._def.items.length,
            inclusive: true,
            exact: false,
            type: "array"
          });
          return INVALID;
        }
        const rest = this._def.rest;
        if (!rest && ctx.data.length > this._def.items.length) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: this._def.items.length,
            inclusive: true,
            exact: false,
            type: "array"
          });
          status.dirty();
        }
        const items = [...ctx.data].map((item, itemIndex) => {
          const schema = this._def.items[itemIndex] || this._def.rest;
          if (!schema)
            return null;
          return schema._parse(new ParseInputLazyPath(ctx, item, ctx.path, itemIndex));
        }).filter((x) => !!x);
        if (ctx.common.async) {
          return Promise.all(items).then((results) => {
            return ParseStatus.mergeArray(status, results);
          });
        } else {
          return ParseStatus.mergeArray(status, items);
        }
      }
      get items() {
        return this._def.items;
      }
      rest(rest) {
        return new _ZodTuple({
          ...this._def,
          rest
        });
      }
    };
    ZodTuple.create = (schemas, params) => {
      if (!Array.isArray(schemas)) {
        throw new Error("You must pass an array of schemas to z.tuple([ ... ])");
      }
      return new ZodTuple({
        items: schemas,
        typeName: ZodFirstPartyTypeKind.ZodTuple,
        rest: null,
        ...processCreateParams(params)
      });
    };
    ZodRecord = class _ZodRecord extends ZodType {
      get keySchema() {
        return this._def.keyType;
      }
      get valueSchema() {
        return this._def.valueType;
      }
      _parse(input) {
        const { status, ctx } = this._processInputParams(input);
        if (ctx.parsedType !== ZodParsedType.object) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: ZodParsedType.object,
            received: ctx.parsedType
          });
          return INVALID;
        }
        const pairs = [];
        const keyType = this._def.keyType;
        const valueType = this._def.valueType;
        for (const key in ctx.data) {
          pairs.push({
            key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, key)),
            value: valueType._parse(new ParseInputLazyPath(ctx, ctx.data[key], ctx.path, key)),
            alwaysSet: key in ctx.data
          });
        }
        if (ctx.common.async) {
          return ParseStatus.mergeObjectAsync(status, pairs);
        } else {
          return ParseStatus.mergeObjectSync(status, pairs);
        }
      }
      get element() {
        return this._def.valueType;
      }
      static create(first, second, third) {
        if (second instanceof ZodType) {
          return new _ZodRecord({
            keyType: first,
            valueType: second,
            typeName: ZodFirstPartyTypeKind.ZodRecord,
            ...processCreateParams(third)
          });
        }
        return new _ZodRecord({
          keyType: ZodString.create(),
          valueType: first,
          typeName: ZodFirstPartyTypeKind.ZodRecord,
          ...processCreateParams(second)
        });
      }
    };
    ZodMap = class extends ZodType {
      get keySchema() {
        return this._def.keyType;
      }
      get valueSchema() {
        return this._def.valueType;
      }
      _parse(input) {
        const { status, ctx } = this._processInputParams(input);
        if (ctx.parsedType !== ZodParsedType.map) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: ZodParsedType.map,
            received: ctx.parsedType
          });
          return INVALID;
        }
        const keyType = this._def.keyType;
        const valueType = this._def.valueType;
        const pairs = [...ctx.data.entries()].map(([key, value], index) => {
          return {
            key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, [index, "key"])),
            value: valueType._parse(new ParseInputLazyPath(ctx, value, ctx.path, [index, "value"]))
          };
        });
        if (ctx.common.async) {
          const finalMap = /* @__PURE__ */ new Map();
          return Promise.resolve().then(async () => {
            for (const pair of pairs) {
              const key = await pair.key;
              const value = await pair.value;
              if (key.status === "aborted" || value.status === "aborted") {
                return INVALID;
              }
              if (key.status === "dirty" || value.status === "dirty") {
                status.dirty();
              }
              finalMap.set(key.value, value.value);
            }
            return { status: status.value, value: finalMap };
          });
        } else {
          const finalMap = /* @__PURE__ */ new Map();
          for (const pair of pairs) {
            const key = pair.key;
            const value = pair.value;
            if (key.status === "aborted" || value.status === "aborted") {
              return INVALID;
            }
            if (key.status === "dirty" || value.status === "dirty") {
              status.dirty();
            }
            finalMap.set(key.value, value.value);
          }
          return { status: status.value, value: finalMap };
        }
      }
    };
    ZodMap.create = (keyType, valueType, params) => {
      return new ZodMap({
        valueType,
        keyType,
        typeName: ZodFirstPartyTypeKind.ZodMap,
        ...processCreateParams(params)
      });
    };
    ZodSet = class _ZodSet extends ZodType {
      _parse(input) {
        const { status, ctx } = this._processInputParams(input);
        if (ctx.parsedType !== ZodParsedType.set) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: ZodParsedType.set,
            received: ctx.parsedType
          });
          return INVALID;
        }
        const def = this._def;
        if (def.minSize !== null) {
          if (ctx.data.size < def.minSize.value) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              minimum: def.minSize.value,
              type: "set",
              inclusive: true,
              exact: false,
              message: def.minSize.message
            });
            status.dirty();
          }
        }
        if (def.maxSize !== null) {
          if (ctx.data.size > def.maxSize.value) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              maximum: def.maxSize.value,
              type: "set",
              inclusive: true,
              exact: false,
              message: def.maxSize.message
            });
            status.dirty();
          }
        }
        const valueType = this._def.valueType;
        function finalizeSet(elements2) {
          const parsedSet = /* @__PURE__ */ new Set();
          for (const element of elements2) {
            if (element.status === "aborted")
              return INVALID;
            if (element.status === "dirty")
              status.dirty();
            parsedSet.add(element.value);
          }
          return { status: status.value, value: parsedSet };
        }
        const elements = [...ctx.data.values()].map((item, i) => valueType._parse(new ParseInputLazyPath(ctx, item, ctx.path, i)));
        if (ctx.common.async) {
          return Promise.all(elements).then((elements2) => finalizeSet(elements2));
        } else {
          return finalizeSet(elements);
        }
      }
      min(minSize, message) {
        return new _ZodSet({
          ...this._def,
          minSize: { value: minSize, message: errorUtil.toString(message) }
        });
      }
      max(maxSize, message) {
        return new _ZodSet({
          ...this._def,
          maxSize: { value: maxSize, message: errorUtil.toString(message) }
        });
      }
      size(size, message) {
        return this.min(size, message).max(size, message);
      }
      nonempty(message) {
        return this.min(1, message);
      }
    };
    ZodSet.create = (valueType, params) => {
      return new ZodSet({
        valueType,
        minSize: null,
        maxSize: null,
        typeName: ZodFirstPartyTypeKind.ZodSet,
        ...processCreateParams(params)
      });
    };
    ZodFunction = class _ZodFunction extends ZodType {
      constructor() {
        super(...arguments);
        this.validate = this.implement;
      }
      _parse(input) {
        const { ctx } = this._processInputParams(input);
        if (ctx.parsedType !== ZodParsedType.function) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: ZodParsedType.function,
            received: ctx.parsedType
          });
          return INVALID;
        }
        function makeArgsIssue(args, error) {
          return makeIssue({
            data: args,
            path: ctx.path,
            errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
            issueData: {
              code: ZodIssueCode.invalid_arguments,
              argumentsError: error
            }
          });
        }
        function makeReturnsIssue(returns, error) {
          return makeIssue({
            data: returns,
            path: ctx.path,
            errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
            issueData: {
              code: ZodIssueCode.invalid_return_type,
              returnTypeError: error
            }
          });
        }
        const params = { errorMap: ctx.common.contextualErrorMap };
        const fn = ctx.data;
        if (this._def.returns instanceof ZodPromise) {
          const me = this;
          return OK(async function(...args) {
            const error = new ZodError([]);
            const parsedArgs = await me._def.args.parseAsync(args, params).catch((e) => {
              error.addIssue(makeArgsIssue(args, e));
              throw error;
            });
            const result = await Reflect.apply(fn, this, parsedArgs);
            const parsedReturns = await me._def.returns._def.type.parseAsync(result, params).catch((e) => {
              error.addIssue(makeReturnsIssue(result, e));
              throw error;
            });
            return parsedReturns;
          });
        } else {
          const me = this;
          return OK(function(...args) {
            const parsedArgs = me._def.args.safeParse(args, params);
            if (!parsedArgs.success) {
              throw new ZodError([makeArgsIssue(args, parsedArgs.error)]);
            }
            const result = Reflect.apply(fn, this, parsedArgs.data);
            const parsedReturns = me._def.returns.safeParse(result, params);
            if (!parsedReturns.success) {
              throw new ZodError([makeReturnsIssue(result, parsedReturns.error)]);
            }
            return parsedReturns.data;
          });
        }
      }
      parameters() {
        return this._def.args;
      }
      returnType() {
        return this._def.returns;
      }
      args(...items) {
        return new _ZodFunction({
          ...this._def,
          args: ZodTuple.create(items).rest(ZodUnknown.create())
        });
      }
      returns(returnType) {
        return new _ZodFunction({
          ...this._def,
          returns: returnType
        });
      }
      implement(func) {
        const validatedFunc = this.parse(func);
        return validatedFunc;
      }
      strictImplement(func) {
        const validatedFunc = this.parse(func);
        return validatedFunc;
      }
      static create(args, returns, params) {
        return new _ZodFunction({
          args: args ? args : ZodTuple.create([]).rest(ZodUnknown.create()),
          returns: returns || ZodUnknown.create(),
          typeName: ZodFirstPartyTypeKind.ZodFunction,
          ...processCreateParams(params)
        });
      }
    };
    ZodLazy = class extends ZodType {
      get schema() {
        return this._def.getter();
      }
      _parse(input) {
        const { ctx } = this._processInputParams(input);
        const lazySchema = this._def.getter();
        return lazySchema._parse({ data: ctx.data, path: ctx.path, parent: ctx });
      }
    };
    ZodLazy.create = (getter, params) => {
      return new ZodLazy({
        getter,
        typeName: ZodFirstPartyTypeKind.ZodLazy,
        ...processCreateParams(params)
      });
    };
    ZodLiteral = class extends ZodType {
      _parse(input) {
        if (input.data !== this._def.value) {
          const ctx = this._getOrReturnCtx(input);
          addIssueToContext(ctx, {
            received: ctx.data,
            code: ZodIssueCode.invalid_literal,
            expected: this._def.value
          });
          return INVALID;
        }
        return { status: "valid", value: input.data };
      }
      get value() {
        return this._def.value;
      }
    };
    ZodLiteral.create = (value, params) => {
      return new ZodLiteral({
        value,
        typeName: ZodFirstPartyTypeKind.ZodLiteral,
        ...processCreateParams(params)
      });
    };
    ZodEnum = class _ZodEnum extends ZodType {
      _parse(input) {
        if (typeof input.data !== "string") {
          const ctx = this._getOrReturnCtx(input);
          const expectedValues = this._def.values;
          addIssueToContext(ctx, {
            expected: util.joinValues(expectedValues),
            received: ctx.parsedType,
            code: ZodIssueCode.invalid_type
          });
          return INVALID;
        }
        if (!this._cache) {
          this._cache = new Set(this._def.values);
        }
        if (!this._cache.has(input.data)) {
          const ctx = this._getOrReturnCtx(input);
          const expectedValues = this._def.values;
          addIssueToContext(ctx, {
            received: ctx.data,
            code: ZodIssueCode.invalid_enum_value,
            options: expectedValues
          });
          return INVALID;
        }
        return OK(input.data);
      }
      get options() {
        return this._def.values;
      }
      get enum() {
        const enumValues = {};
        for (const val of this._def.values) {
          enumValues[val] = val;
        }
        return enumValues;
      }
      get Values() {
        const enumValues = {};
        for (const val of this._def.values) {
          enumValues[val] = val;
        }
        return enumValues;
      }
      get Enum() {
        const enumValues = {};
        for (const val of this._def.values) {
          enumValues[val] = val;
        }
        return enumValues;
      }
      extract(values, newDef = this._def) {
        return _ZodEnum.create(values, {
          ...this._def,
          ...newDef
        });
      }
      exclude(values, newDef = this._def) {
        return _ZodEnum.create(this.options.filter((opt) => !values.includes(opt)), {
          ...this._def,
          ...newDef
        });
      }
    };
    ZodEnum.create = createZodEnum;
    ZodNativeEnum = class extends ZodType {
      _parse(input) {
        const nativeEnumValues = util.getValidEnumValues(this._def.values);
        const ctx = this._getOrReturnCtx(input);
        if (ctx.parsedType !== ZodParsedType.string && ctx.parsedType !== ZodParsedType.number) {
          const expectedValues = util.objectValues(nativeEnumValues);
          addIssueToContext(ctx, {
            expected: util.joinValues(expectedValues),
            received: ctx.parsedType,
            code: ZodIssueCode.invalid_type
          });
          return INVALID;
        }
        if (!this._cache) {
          this._cache = new Set(util.getValidEnumValues(this._def.values));
        }
        if (!this._cache.has(input.data)) {
          const expectedValues = util.objectValues(nativeEnumValues);
          addIssueToContext(ctx, {
            received: ctx.data,
            code: ZodIssueCode.invalid_enum_value,
            options: expectedValues
          });
          return INVALID;
        }
        return OK(input.data);
      }
      get enum() {
        return this._def.values;
      }
    };
    ZodNativeEnum.create = (values, params) => {
      return new ZodNativeEnum({
        values,
        typeName: ZodFirstPartyTypeKind.ZodNativeEnum,
        ...processCreateParams(params)
      });
    };
    ZodPromise = class extends ZodType {
      unwrap() {
        return this._def.type;
      }
      _parse(input) {
        const { ctx } = this._processInputParams(input);
        if (ctx.parsedType !== ZodParsedType.promise && ctx.common.async === false) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: ZodParsedType.promise,
            received: ctx.parsedType
          });
          return INVALID;
        }
        const promisified = ctx.parsedType === ZodParsedType.promise ? ctx.data : Promise.resolve(ctx.data);
        return OK(promisified.then((data) => {
          return this._def.type.parseAsync(data, {
            path: ctx.path,
            errorMap: ctx.common.contextualErrorMap
          });
        }));
      }
    };
    ZodPromise.create = (schema, params) => {
      return new ZodPromise({
        type: schema,
        typeName: ZodFirstPartyTypeKind.ZodPromise,
        ...processCreateParams(params)
      });
    };
    ZodEffects = class extends ZodType {
      innerType() {
        return this._def.schema;
      }
      sourceType() {
        return this._def.schema._def.typeName === ZodFirstPartyTypeKind.ZodEffects ? this._def.schema.sourceType() : this._def.schema;
      }
      _parse(input) {
        const { status, ctx } = this._processInputParams(input);
        const effect = this._def.effect || null;
        const checkCtx = {
          addIssue: (arg) => {
            addIssueToContext(ctx, arg);
            if (arg.fatal) {
              status.abort();
            } else {
              status.dirty();
            }
          },
          get path() {
            return ctx.path;
          }
        };
        checkCtx.addIssue = checkCtx.addIssue.bind(checkCtx);
        if (effect.type === "preprocess") {
          const processed = effect.transform(ctx.data, checkCtx);
          if (ctx.common.async) {
            return Promise.resolve(processed).then(async (processed2) => {
              if (status.value === "aborted")
                return INVALID;
              const result = await this._def.schema._parseAsync({
                data: processed2,
                path: ctx.path,
                parent: ctx
              });
              if (result.status === "aborted")
                return INVALID;
              if (result.status === "dirty")
                return DIRTY(result.value);
              if (status.value === "dirty")
                return DIRTY(result.value);
              return result;
            });
          } else {
            if (status.value === "aborted")
              return INVALID;
            const result = this._def.schema._parseSync({
              data: processed,
              path: ctx.path,
              parent: ctx
            });
            if (result.status === "aborted")
              return INVALID;
            if (result.status === "dirty")
              return DIRTY(result.value);
            if (status.value === "dirty")
              return DIRTY(result.value);
            return result;
          }
        }
        if (effect.type === "refinement") {
          const executeRefinement = (acc) => {
            const result = effect.refinement(acc, checkCtx);
            if (ctx.common.async) {
              return Promise.resolve(result);
            }
            if (result instanceof Promise) {
              throw new Error("Async refinement encountered during synchronous parse operation. Use .parseAsync instead.");
            }
            return acc;
          };
          if (ctx.common.async === false) {
            const inner = this._def.schema._parseSync({
              data: ctx.data,
              path: ctx.path,
              parent: ctx
            });
            if (inner.status === "aborted")
              return INVALID;
            if (inner.status === "dirty")
              status.dirty();
            executeRefinement(inner.value);
            return { status: status.value, value: inner.value };
          } else {
            return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((inner) => {
              if (inner.status === "aborted")
                return INVALID;
              if (inner.status === "dirty")
                status.dirty();
              return executeRefinement(inner.value).then(() => {
                return { status: status.value, value: inner.value };
              });
            });
          }
        }
        if (effect.type === "transform") {
          if (ctx.common.async === false) {
            const base = this._def.schema._parseSync({
              data: ctx.data,
              path: ctx.path,
              parent: ctx
            });
            if (!isValid(base))
              return INVALID;
            const result = effect.transform(base.value, checkCtx);
            if (result instanceof Promise) {
              throw new Error(`Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.`);
            }
            return { status: status.value, value: result };
          } else {
            return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((base) => {
              if (!isValid(base))
                return INVALID;
              return Promise.resolve(effect.transform(base.value, checkCtx)).then((result) => ({
                status: status.value,
                value: result
              }));
            });
          }
        }
        util.assertNever(effect);
      }
    };
    ZodEffects.create = (schema, effect, params) => {
      return new ZodEffects({
        schema,
        typeName: ZodFirstPartyTypeKind.ZodEffects,
        effect,
        ...processCreateParams(params)
      });
    };
    ZodEffects.createWithPreprocess = (preprocess, schema, params) => {
      return new ZodEffects({
        schema,
        effect: { type: "preprocess", transform: preprocess },
        typeName: ZodFirstPartyTypeKind.ZodEffects,
        ...processCreateParams(params)
      });
    };
    ZodOptional = class extends ZodType {
      _parse(input) {
        const parsedType = this._getType(input);
        if (parsedType === ZodParsedType.undefined) {
          return OK(void 0);
        }
        return this._def.innerType._parse(input);
      }
      unwrap() {
        return this._def.innerType;
      }
    };
    ZodOptional.create = (type, params) => {
      return new ZodOptional({
        innerType: type,
        typeName: ZodFirstPartyTypeKind.ZodOptional,
        ...processCreateParams(params)
      });
    };
    ZodNullable = class extends ZodType {
      _parse(input) {
        const parsedType = this._getType(input);
        if (parsedType === ZodParsedType.null) {
          return OK(null);
        }
        return this._def.innerType._parse(input);
      }
      unwrap() {
        return this._def.innerType;
      }
    };
    ZodNullable.create = (type, params) => {
      return new ZodNullable({
        innerType: type,
        typeName: ZodFirstPartyTypeKind.ZodNullable,
        ...processCreateParams(params)
      });
    };
    ZodDefault = class extends ZodType {
      _parse(input) {
        const { ctx } = this._processInputParams(input);
        let data = ctx.data;
        if (ctx.parsedType === ZodParsedType.undefined) {
          data = this._def.defaultValue();
        }
        return this._def.innerType._parse({
          data,
          path: ctx.path,
          parent: ctx
        });
      }
      removeDefault() {
        return this._def.innerType;
      }
    };
    ZodDefault.create = (type, params) => {
      return new ZodDefault({
        innerType: type,
        typeName: ZodFirstPartyTypeKind.ZodDefault,
        defaultValue: typeof params.default === "function" ? params.default : () => params.default,
        ...processCreateParams(params)
      });
    };
    ZodCatch = class extends ZodType {
      _parse(input) {
        const { ctx } = this._processInputParams(input);
        const newCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          }
        };
        const result = this._def.innerType._parse({
          data: newCtx.data,
          path: newCtx.path,
          parent: {
            ...newCtx
          }
        });
        if (isAsync(result)) {
          return result.then((result2) => {
            return {
              status: "valid",
              value: result2.status === "valid" ? result2.value : this._def.catchValue({
                get error() {
                  return new ZodError(newCtx.common.issues);
                },
                input: newCtx.data
              })
            };
          });
        } else {
          return {
            status: "valid",
            value: result.status === "valid" ? result.value : this._def.catchValue({
              get error() {
                return new ZodError(newCtx.common.issues);
              },
              input: newCtx.data
            })
          };
        }
      }
      removeCatch() {
        return this._def.innerType;
      }
    };
    ZodCatch.create = (type, params) => {
      return new ZodCatch({
        innerType: type,
        typeName: ZodFirstPartyTypeKind.ZodCatch,
        catchValue: typeof params.catch === "function" ? params.catch : () => params.catch,
        ...processCreateParams(params)
      });
    };
    ZodNaN = class extends ZodType {
      _parse(input) {
        const parsedType = this._getType(input);
        if (parsedType !== ZodParsedType.nan) {
          const ctx = this._getOrReturnCtx(input);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: ZodParsedType.nan,
            received: ctx.parsedType
          });
          return INVALID;
        }
        return { status: "valid", value: input.data };
      }
    };
    ZodNaN.create = (params) => {
      return new ZodNaN({
        typeName: ZodFirstPartyTypeKind.ZodNaN,
        ...processCreateParams(params)
      });
    };
    BRAND = /* @__PURE__ */ Symbol("zod_brand");
    ZodBranded = class extends ZodType {
      _parse(input) {
        const { ctx } = this._processInputParams(input);
        const data = ctx.data;
        return this._def.type._parse({
          data,
          path: ctx.path,
          parent: ctx
        });
      }
      unwrap() {
        return this._def.type;
      }
    };
    ZodPipeline = class _ZodPipeline extends ZodType {
      _parse(input) {
        const { status, ctx } = this._processInputParams(input);
        if (ctx.common.async) {
          const handleAsync = async () => {
            const inResult = await this._def.in._parseAsync({
              data: ctx.data,
              path: ctx.path,
              parent: ctx
            });
            if (inResult.status === "aborted")
              return INVALID;
            if (inResult.status === "dirty") {
              status.dirty();
              return DIRTY(inResult.value);
            } else {
              return this._def.out._parseAsync({
                data: inResult.value,
                path: ctx.path,
                parent: ctx
              });
            }
          };
          return handleAsync();
        } else {
          const inResult = this._def.in._parseSync({
            data: ctx.data,
            path: ctx.path,
            parent: ctx
          });
          if (inResult.status === "aborted")
            return INVALID;
          if (inResult.status === "dirty") {
            status.dirty();
            return {
              status: "dirty",
              value: inResult.value
            };
          } else {
            return this._def.out._parseSync({
              data: inResult.value,
              path: ctx.path,
              parent: ctx
            });
          }
        }
      }
      static create(a, b) {
        return new _ZodPipeline({
          in: a,
          out: b,
          typeName: ZodFirstPartyTypeKind.ZodPipeline
        });
      }
    };
    ZodReadonly = class extends ZodType {
      _parse(input) {
        const result = this._def.innerType._parse(input);
        const freeze = (data) => {
          if (isValid(data)) {
            data.value = Object.freeze(data.value);
          }
          return data;
        };
        return isAsync(result) ? result.then((data) => freeze(data)) : freeze(result);
      }
      unwrap() {
        return this._def.innerType;
      }
    };
    ZodReadonly.create = (type, params) => {
      return new ZodReadonly({
        innerType: type,
        typeName: ZodFirstPartyTypeKind.ZodReadonly,
        ...processCreateParams(params)
      });
    };
    late = {
      object: ZodObject.lazycreate
    };
    (function(ZodFirstPartyTypeKind2) {
      ZodFirstPartyTypeKind2["ZodString"] = "ZodString";
      ZodFirstPartyTypeKind2["ZodNumber"] = "ZodNumber";
      ZodFirstPartyTypeKind2["ZodNaN"] = "ZodNaN";
      ZodFirstPartyTypeKind2["ZodBigInt"] = "ZodBigInt";
      ZodFirstPartyTypeKind2["ZodBoolean"] = "ZodBoolean";
      ZodFirstPartyTypeKind2["ZodDate"] = "ZodDate";
      ZodFirstPartyTypeKind2["ZodSymbol"] = "ZodSymbol";
      ZodFirstPartyTypeKind2["ZodUndefined"] = "ZodUndefined";
      ZodFirstPartyTypeKind2["ZodNull"] = "ZodNull";
      ZodFirstPartyTypeKind2["ZodAny"] = "ZodAny";
      ZodFirstPartyTypeKind2["ZodUnknown"] = "ZodUnknown";
      ZodFirstPartyTypeKind2["ZodNever"] = "ZodNever";
      ZodFirstPartyTypeKind2["ZodVoid"] = "ZodVoid";
      ZodFirstPartyTypeKind2["ZodArray"] = "ZodArray";
      ZodFirstPartyTypeKind2["ZodObject"] = "ZodObject";
      ZodFirstPartyTypeKind2["ZodUnion"] = "ZodUnion";
      ZodFirstPartyTypeKind2["ZodDiscriminatedUnion"] = "ZodDiscriminatedUnion";
      ZodFirstPartyTypeKind2["ZodIntersection"] = "ZodIntersection";
      ZodFirstPartyTypeKind2["ZodTuple"] = "ZodTuple";
      ZodFirstPartyTypeKind2["ZodRecord"] = "ZodRecord";
      ZodFirstPartyTypeKind2["ZodMap"] = "ZodMap";
      ZodFirstPartyTypeKind2["ZodSet"] = "ZodSet";
      ZodFirstPartyTypeKind2["ZodFunction"] = "ZodFunction";
      ZodFirstPartyTypeKind2["ZodLazy"] = "ZodLazy";
      ZodFirstPartyTypeKind2["ZodLiteral"] = "ZodLiteral";
      ZodFirstPartyTypeKind2["ZodEnum"] = "ZodEnum";
      ZodFirstPartyTypeKind2["ZodEffects"] = "ZodEffects";
      ZodFirstPartyTypeKind2["ZodNativeEnum"] = "ZodNativeEnum";
      ZodFirstPartyTypeKind2["ZodOptional"] = "ZodOptional";
      ZodFirstPartyTypeKind2["ZodNullable"] = "ZodNullable";
      ZodFirstPartyTypeKind2["ZodDefault"] = "ZodDefault";
      ZodFirstPartyTypeKind2["ZodCatch"] = "ZodCatch";
      ZodFirstPartyTypeKind2["ZodPromise"] = "ZodPromise";
      ZodFirstPartyTypeKind2["ZodBranded"] = "ZodBranded";
      ZodFirstPartyTypeKind2["ZodPipeline"] = "ZodPipeline";
      ZodFirstPartyTypeKind2["ZodReadonly"] = "ZodReadonly";
    })(ZodFirstPartyTypeKind || (ZodFirstPartyTypeKind = {}));
    instanceOfType = (cls, params = {
      message: `Input not instance of ${cls.name}`
    }) => custom((data) => data instanceof cls, params);
    stringType = ZodString.create;
    numberType = ZodNumber.create;
    nanType = ZodNaN.create;
    bigIntType = ZodBigInt.create;
    booleanType = ZodBoolean.create;
    dateType = ZodDate.create;
    symbolType = ZodSymbol.create;
    undefinedType = ZodUndefined.create;
    nullType = ZodNull.create;
    anyType = ZodAny.create;
    unknownType = ZodUnknown.create;
    neverType = ZodNever.create;
    voidType = ZodVoid.create;
    arrayType = ZodArray.create;
    objectType = ZodObject.create;
    strictObjectType = ZodObject.strictCreate;
    unionType = ZodUnion.create;
    discriminatedUnionType = ZodDiscriminatedUnion.create;
    intersectionType = ZodIntersection.create;
    tupleType = ZodTuple.create;
    recordType = ZodRecord.create;
    mapType = ZodMap.create;
    setType = ZodSet.create;
    functionType = ZodFunction.create;
    lazyType = ZodLazy.create;
    literalType = ZodLiteral.create;
    enumType = ZodEnum.create;
    nativeEnumType = ZodNativeEnum.create;
    promiseType = ZodPromise.create;
    effectsType = ZodEffects.create;
    optionalType = ZodOptional.create;
    nullableType = ZodNullable.create;
    preprocessType = ZodEffects.createWithPreprocess;
    pipelineType = ZodPipeline.create;
    ostring = () => stringType().optional();
    onumber = () => numberType().optional();
    oboolean = () => booleanType().optional();
    coerce = {
      string: ((arg) => ZodString.create({ ...arg, coerce: true })),
      number: ((arg) => ZodNumber.create({ ...arg, coerce: true })),
      boolean: ((arg) => ZodBoolean.create({
        ...arg,
        coerce: true
      })),
      bigint: ((arg) => ZodBigInt.create({ ...arg, coerce: true })),
      date: ((arg) => ZodDate.create({ ...arg, coerce: true }))
    };
    NEVER = INVALID;
  }
});

// ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/external.js
var external_exports = {};
__export(external_exports, {
  BRAND: () => BRAND,
  DIRTY: () => DIRTY,
  EMPTY_PATH: () => EMPTY_PATH,
  INVALID: () => INVALID,
  NEVER: () => NEVER,
  OK: () => OK,
  ParseStatus: () => ParseStatus,
  Schema: () => ZodType,
  ZodAny: () => ZodAny,
  ZodArray: () => ZodArray,
  ZodBigInt: () => ZodBigInt,
  ZodBoolean: () => ZodBoolean,
  ZodBranded: () => ZodBranded,
  ZodCatch: () => ZodCatch,
  ZodDate: () => ZodDate,
  ZodDefault: () => ZodDefault,
  ZodDiscriminatedUnion: () => ZodDiscriminatedUnion,
  ZodEffects: () => ZodEffects,
  ZodEnum: () => ZodEnum,
  ZodError: () => ZodError,
  ZodFirstPartyTypeKind: () => ZodFirstPartyTypeKind,
  ZodFunction: () => ZodFunction,
  ZodIntersection: () => ZodIntersection,
  ZodIssueCode: () => ZodIssueCode,
  ZodLazy: () => ZodLazy,
  ZodLiteral: () => ZodLiteral,
  ZodMap: () => ZodMap,
  ZodNaN: () => ZodNaN,
  ZodNativeEnum: () => ZodNativeEnum,
  ZodNever: () => ZodNever,
  ZodNull: () => ZodNull,
  ZodNullable: () => ZodNullable,
  ZodNumber: () => ZodNumber,
  ZodObject: () => ZodObject,
  ZodOptional: () => ZodOptional,
  ZodParsedType: () => ZodParsedType,
  ZodPipeline: () => ZodPipeline,
  ZodPromise: () => ZodPromise,
  ZodReadonly: () => ZodReadonly,
  ZodRecord: () => ZodRecord,
  ZodSchema: () => ZodType,
  ZodSet: () => ZodSet,
  ZodString: () => ZodString,
  ZodSymbol: () => ZodSymbol,
  ZodTransformer: () => ZodEffects,
  ZodTuple: () => ZodTuple,
  ZodType: () => ZodType,
  ZodUndefined: () => ZodUndefined,
  ZodUnion: () => ZodUnion,
  ZodUnknown: () => ZodUnknown,
  ZodVoid: () => ZodVoid,
  addIssueToContext: () => addIssueToContext,
  any: () => anyType,
  array: () => arrayType,
  bigint: () => bigIntType,
  boolean: () => booleanType,
  coerce: () => coerce,
  custom: () => custom,
  date: () => dateType,
  datetimeRegex: () => datetimeRegex,
  defaultErrorMap: () => en_default,
  discriminatedUnion: () => discriminatedUnionType,
  effect: () => effectsType,
  enum: () => enumType,
  function: () => functionType,
  getErrorMap: () => getErrorMap,
  getParsedType: () => getParsedType,
  instanceof: () => instanceOfType,
  intersection: () => intersectionType,
  isAborted: () => isAborted,
  isAsync: () => isAsync,
  isDirty: () => isDirty,
  isValid: () => isValid,
  late: () => late,
  lazy: () => lazyType,
  literal: () => literalType,
  makeIssue: () => makeIssue,
  map: () => mapType,
  nan: () => nanType,
  nativeEnum: () => nativeEnumType,
  never: () => neverType,
  null: () => nullType,
  nullable: () => nullableType,
  number: () => numberType,
  object: () => objectType,
  objectUtil: () => objectUtil,
  oboolean: () => oboolean,
  onumber: () => onumber,
  optional: () => optionalType,
  ostring: () => ostring,
  pipeline: () => pipelineType,
  preprocess: () => preprocessType,
  promise: () => promiseType,
  quotelessJson: () => quotelessJson,
  record: () => recordType,
  set: () => setType,
  setErrorMap: () => setErrorMap,
  strictObject: () => strictObjectType,
  string: () => stringType,
  symbol: () => symbolType,
  transformer: () => effectsType,
  tuple: () => tupleType,
  undefined: () => undefinedType,
  union: () => unionType,
  unknown: () => unknownType,
  util: () => util,
  void: () => voidType
});
var init_external = __esm({
  "../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/external.js"() {
    "use strict";
    init_errors();
    init_parseUtil();
    init_typeAliases();
    init_util();
    init_types();
    init_ZodError();
  }
});

// ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/index.js
var init_zod = __esm({
  "../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/index.js"() {
    "use strict";
    init_external();
    init_external();
  }
});

// src/timeline/assets.ts
import { existsSync as existsSync2, readFileSync as readFileSync2 } from "fs";
import { join as join3 } from "path";
var assetKindSchema, assetEntrySchema, assetManifestSchema;
var init_assets = __esm({
  "src/timeline/assets.ts"() {
    "use strict";
    init_zod();
    assetKindSchema = external_exports.enum(["image", "gif", "video", "audio", "font"]);
    assetEntrySchema = external_exports.object({
      kind: assetKindSchema,
      file: external_exports.string().min(1),
      mime: external_exports.string().min(1),
      sha256: external_exports.string().optional(),
      bytes: external_exports.number().int().min(0).optional(),
      /** Intrinsic pixel dimensions (image / gif / video). */
      w: external_exports.number().int().positive().optional(),
      h: external_exports.number().int().positive().optional(),
      /** Intrinsic duration in seconds (audio / video / gif). */
      durationS: external_exports.number().positive().optional(),
      /** Frame count (gif). */
      frames: external_exports.number().int().positive().optional(),
      /** Whether a video file carries an audio track. */
      hasAudio: external_exports.boolean().optional(),
      /** Font face descriptors (kind "font"). */
      family: external_exports.string().min(1).optional(),
      weight: external_exports.number().int().min(1).max(1e3).optional(),
      style: external_exports.enum(["normal", "italic"]).optional(),
      /** Where the bytes came from (URL or absolute source path). */
      origin: external_exports.string().optional(),
      addedAt: external_exports.string().optional()
    }).strict();
    assetManifestSchema = external_exports.object({
      version: external_exports.literal(1),
      assets: external_exports.record(assetEntrySchema).default({})
    }).strict();
  }
});

// src/cloud/files.ts
import { createHash as createHash2 } from "crypto";
import { createReadStream, existsSync as existsSync3, mkdirSync as mkdirSync3, readFileSync as readFileSync3, statSync as statSync2, writeFileSync as writeFileSync3 } from "fs";
import { dirname as dirname2, join as join4, sep } from "path";
function sha256Hex(bytes) {
  return createHash2("sha256").update(bytes).digest("hex");
}
function sameSha(a, b) {
  if (!a || !b) return false;
  const norm = (s) => s.replace(/^sha256:/, "").toLowerCase();
  return norm(a) === norm(b);
}
function vfsLocalPath(jobDir, path) {
  const parts = path.split("/").filter((p) => p !== "" && p !== "." && p !== "..");
  if (parts.length === 0) throw new Error(`bad VFS path: ${JSON.stringify(path)}`);
  return join4(jobDir, ...parts);
}
async function pullFiles(client, jobDir, opts = {}) {
  const listing = await client.filesList();
  const byPath = new Map(listing.map((f) => [f.path, f]));
  const prefixMatched = opts.prefixes?.length ? listing.map((f) => f.path).filter((path) => opts.prefixes.some((pre) => path.startsWith(pre))) : [];
  const explicit = opts.only && opts.only.length > 0 ? opts.only : listing.map((f) => f.path);
  const wanted = [.../* @__PURE__ */ new Set([...explicit, ...prefixMatched])];
  const missing = explicit.filter((p) => !byPath.has(p));
  const pulled = [];
  const conflicts = [];
  for (const path of wanted) {
    const entry = byPath.get(path);
    if (!entry) continue;
    const dest = vfsLocalPath(jobDir, path);
    if (existsSync3(dest) && sameSha(sha256Hex(readFileSync3(dest)), entry.sha256)) {
      const f2 = {
        path,
        localPath: dest,
        bytes: statSync2(dest).size,
        skipped: true,
        conflict: false,
        updatedBy: entry.updated_by
      };
      pulled.push(f2);
      opts.onFile?.(f2);
      continue;
    }
    if (existsSync3(dest) && entry.updated_by !== "server" && opts.force !== true) {
      const f2 = {
        path,
        localPath: dest,
        bytes: statSync2(dest).size,
        skipped: true,
        conflict: true,
        updatedBy: entry.updated_by
      };
      pulled.push(f2);
      conflicts.push(f2);
      opts.onFile?.(f2);
      continue;
    }
    const got = await client.filesGet(path);
    mkdirSync3(dirname2(dest), { recursive: true });
    let bytes;
    if (got.content !== void 0) {
      const buf = Buffer.from(got.content, "utf8");
      writeFileSync3(dest, buf);
      bytes = buf.length;
      if (got.sha256 && !sameSha(sha256Hex(buf), got.sha256)) {
        throw new Error(`pulled ${path} but sha256 mismatch vs server (${got.sha256}) \u2014 refusing to trust the copy`);
      }
    } else {
      const dl = await client.download(got.downloadUrl, dest);
      bytes = dl.bytes;
      if (got.sha256 && !sameSha(sha256Hex(readFileSync3(dest)), got.sha256)) {
        throw new Error(`pulled ${path} but sha256 mismatch vs server (${got.sha256}) \u2014 refusing to trust the copy`);
      }
    }
    const f = {
      path,
      localPath: dest,
      bytes,
      skipped: false,
      conflict: false,
      updatedBy: entry.updated_by
    };
    pulled.push(f);
    opts.onFile?.(f);
  }
  return { pulled, missing, conflicts };
}
async function uploadVfsFile(client, vfsPath, localPath, contentType, opts) {
  const source = await openFileSource(localPath);
  try {
    if (shouldMultipart(source.size)) {
      const result = await uploadMultipart(client, {
        kind: "jobfile",
        source,
        contentType,
        videoId: client.cfg.videoId,
        path: vfsPath,
        sha256: opts.sha256,
        log: opts.log
      });
      if (result !== "unavailable" && result !== "oversize") return source.size;
      opts.log?.("  chunked VFS upload unavailable; using streaming single-request upload");
    }
    const presign = await client.filesPresign({
      path: vfsPath,
      contentType,
      bytes: source.size,
      sha256: opts.sha256
    });
    await client.uploadStream(presign.uploadUrl, source, contentType);
    await client.filesCommit(vfsPath);
    return source.size;
  } finally {
    await source.close();
  }
}
var INLINE_MAX_BYTES;
var init_files = __esm({
  "src/cloud/files.ts"() {
    "use strict";
    init_client();
    init_multipart();
    init_assets();
    INLINE_MAX_BYTES = 5 * 1024 * 1024;
  }
});

// src/cloud/runs.ts
function formatRunEvent(ev) {
  const p = ev.payload;
  const message = p !== null && typeof p === "object" && typeof p.message === "string" ? p.message : "";
  return message ? `[${ev.type}] ${message}` : `[${ev.type}]`;
}
async function pollRun(client, runId, opts = {}) {
  const intervalMs = opts.intervalMs ?? 5e3;
  const maxMs = opts.maxMs ?? MAX_RUN_POLL_MS;
  const nap = opts.sleepImpl ?? sleep2;
  const now = opts.now ?? Date.now;
  const start = now();
  let seen = 0;
  let lastNoise = start;
  for (; ; ) {
    const state = await client.getRun(runId);
    const fresh = state.events.length > seen;
    for (; seen < state.events.length; seen++) opts.onEvent?.(state.events[seen]);
    if (isTerminalRunStatus(state.status)) return state;
    const elapsed = now() - start;
    if (fresh) {
      lastNoise = now();
    } else if (now() - lastNoise >= RUN_POLL_HEARTBEAT_MS) {
      lastNoise = now();
      opts.onHeartbeat?.(elapsed, state.status);
    }
    if (elapsed + intervalMs >= maxMs) {
      throw new RunPollTimeoutError(runId, state.status, elapsed);
    }
    await nap(intervalMs);
  }
}
function assertRunCompleted(state, what) {
  if (state.status === "completed") return;
  const detail = state.errorMessage ?? state.errorCode ?? state.status;
  throw new Error(`${what} run ${state.id || ""} ${state.status}: ${detail}`);
}
var MAX_RUN_POLL_MS, RUN_POLL_HEARTBEAT_MS, sleep2, RunPollTimeoutError;
var init_runs = __esm({
  "src/cloud/runs.ts"() {
    "use strict";
    init_client();
    MAX_RUN_POLL_MS = 30 * 60 * 1e3;
    RUN_POLL_HEARTBEAT_MS = 30 * 1e3;
    sleep2 = (ms) => new Promise((r) => setTimeout(r, ms));
    RunPollTimeoutError = class extends Error {
      constructor(runId, lastStatus, elapsedMs) {
        super(
          `stopped waiting on run ${runId} after ${Math.round(elapsedMs / 1e3)}s (status: ${lastStatus}); the run may still finish server-side \u2014 check it with \`video-editing transcribe\``
        );
        this.runId = runId;
        this.lastStatus = lastStatus;
        this.elapsedMs = elapsedMs;
        this.name = "RunPollTimeoutError";
      }
      runId;
      lastStatus;
      elapsedMs;
    };
  }
});

// src/cloud/init.ts
import { existsSync as existsSync4, mkdirSync as mkdirSync4, readFileSync as readFileSync4, statSync as statSync3 } from "fs";
import { join as join5, parse as parsePath, resolve as resolvePath } from "path";
function sanitizeStem(name) {
  const safe = name.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return safe === "" ? "source" : safe;
}
function ingestArtifactSet(stem) {
  return [
    `transcripts/${stem}.json`,
    "takes_packed.md",
    "flags.txt",
    "word_dump.txt",
    "coverage.json",
    "probe.json",
    // What ingest measured about the source (channel layout, loudness, whether
    // the picture is log). The skill tells the agent to read this when a source
    // looks or sounds wrong, so it has to be pulled or that instruction is a
    // dead end. Absent on surfaces whose ingest does not write it — pullFiles
    // reports a missing `only` entry rather than failing.
    "analysis.json"
  ];
}
var init_init = __esm({
  "src/cloud/init.ts"() {
    "use strict";
    init_client();
    init_jobfile();
    init_multipart();
    init_files();
    init_runs();
  }
});

// src/import/bundled-manifest.ts
var BUNDLED_FFMPEG_MANIFEST;
var init_bundled_manifest = __esm({
  "src/import/bundled-manifest.ts"() {
    "use strict";
    BUNDLED_FFMPEG_MANIFEST = {
      "version": "9.0.1",
      "platforms": {
        "darwin-arm64": {
          "ffmpeg": {
            "filename": "ffmpeg",
            "sha256": "393e4c395020a1cb7cbd77fbe00599ce69d1c6466fee0dbd59d13f86a81a1611"
          },
          "ffprobe": {
            "filename": "ffprobe",
            "sha256": "7abc49fb2bdf2204f018e76dc6e0a8ae7643313bae09a9fa43e7eb12442271bc"
          }
        },
        "win32-x64": {
          "ffmpeg": {
            "filename": "ffmpeg.exe",
            "sha256": "72a489eccd008c2ec2c0a5856c5c75bc3d8bbfa90166c4566865c246445e6aa3"
          },
          "ffprobe": {
            "filename": "ffprobe.exe",
            "sha256": "19202b23c0043f15ad1b7bce2344f406fd52bd6efd8f995ce02e7392a1cec52f"
          }
        }
      }
    };
  }
});

// src/import/process.ts
import { spawn } from "child_process";
var IMPORT_BUNDLE_BOUNDARY, runProcess;
var init_process = __esm({
  "src/import/process.ts"() {
    "use strict";
    IMPORT_BUNDLE_BOUNDARY = "agentcut-import-boundary";
    runProcess = async (bin, args, options = {}) => new Promise((resolve5, reject) => {
      void IMPORT_BUNDLE_BOUNDARY;
      const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
      const stdout = [];
      const stderr = [];
      let timedOut = false;
      let settled = false;
      const timer = options.timeoutMs ? setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, options.timeoutMs) : void 0;
      child.stdout?.on("data", (chunk) => stdout.push(chunk));
      child.stderr?.on("data", (chunk) => stderr.push(chunk));
      child.on("error", (error) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        reject(error);
      });
      child.on("close", (code) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        const result = {
          code: code ?? -1,
          stdout: Buffer.concat(stdout).toString("utf8"),
          stderr: Buffer.concat(stderr).toString("utf8"),
          timedOut
        };
        if (result.code !== 0 && !options.allowFailure) {
          const suffix = timedOut ? ` timed out after ${options.timeoutMs}ms` : ` exited ${result.code}`;
          reject(
            new Error(
              `${bin}${suffix}${result.stderr ? `: ${result.stderr.slice(0, 2e3)}` : ""}`
            )
          );
          return;
        }
        resolve5(result);
      });
    });
  }
});

// src/import/materializer.ts
import { spawnSync } from "child_process";
import { createHash as createHash3, randomBytes } from "crypto";
import { createReadStream as createReadStream2, createWriteStream as createWriteStream2, existsSync as existsSync6 } from "fs";
import { chmod, mkdir, rename, rm } from "fs/promises";
import { homedir as homedir2 } from "os";
import { dirname as dirname3, join as join7, resolve as resolve2 } from "path";
import { pipeline as pipeline3 } from "stream/promises";
import { fileURLToPath } from "url";
import { createGunzip } from "zlib";
async function sha256File(path) {
  const hash = createHash3("sha256");
  await new Promise((resolvePromise, reject) => {
    const stream = createReadStream2(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolvePromise);
  });
  return hash.digest("hex");
}
async function materializeArchive(options) {
  void IMPORT_BUNDLE_BOUNDARY;
  const {
    archive,
    destination,
    expectedSha256,
    renameImpl = rename
  } = options;
  if (existsSync6(destination) && await sha256File(destination) === expectedSha256) {
    await chmod(destination, 493);
    return destination;
  }
  await rm(destination, { force: true });
  await mkdir(dirname3(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    await pipeline3(
      createReadStream2(archive),
      createGunzip(),
      createWriteStream2(temporary, { mode: 493 })
    );
    const actual = await sha256File(temporary);
    if (actual !== expectedSha256) {
      throw new Error(
        `bundled media tool checksum mismatch: expected ${expectedSha256}, got ${actual}`
      );
    }
    await chmod(temporary, 493);
    try {
      await renameImpl(temporary, destination);
    } catch (error) {
      if (!existsSync6(destination) || await sha256File(destination) !== expectedSha256) {
        throw error;
      }
    }
    await chmod(destination, 493);
    return destination;
  } finally {
    await rm(temporary, { force: true });
  }
}
function platformKey() {
  const key = `${process.platform}-${process.arch}`;
  return key in BUNDLED_FFMPEG_MANIFEST.platforms ? key : null;
}
function archiveCandidates(tool, key, moduleUrl = import.meta.url) {
  const moduleDir = dirname3(fileURLToPath(moduleUrl));
  const filename = BUNDLED_FFMPEG_MANIFEST.platforms[key][tool].filename;
  const relative = join7("ffmpeg", key, `${filename}.gz`);
  return [
    // Standalone helper: ffmpeg/ is next to upload-media.mjs.
    join7(moduleDir, relative),
    // Public package dynamic chunk: dist/ sits next to skills/.
    resolve2(moduleDir, "..", "skills", "asset-import", "scripts", relative),
    // Source execution (tsx/vitest).
    resolve2(moduleDir, "..", "..", "skills", "asset-import", "scripts", relative)
  ];
}
function cacheRoot(env) {
  const xdg = env.XDG_CACHE_HOME?.trim();
  return xdg || join7(homedir2(), ".cache");
}
function ffprobeUsable(bin, spawn2 = spawnSync) {
  const nullInput = process.platform === "win32" ? "NUL" : "/dev/null";
  const result = spawn2(
    bin,
    [
      "-v",
      "error",
      "-show_entries",
      "stream_side_data=rotation",
      "-of",
      "json",
      "-i",
      nullInput
    ],
    { encoding: "utf8" }
  );
  return !result.error && !(result.stderr ?? "").includes("No match for section");
}
function toolUsable(bin, tool, spawn2 = spawnSync) {
  if (tool === "ffprobe" && !ffprobeUsable(bin, spawn2)) return false;
  const result = spawn2(bin, ["-version"], { encoding: "utf8" });
  return !result.error && result.status === 0;
}
async function resolveMediaTool(tool, options = {}) {
  const env = options.env ?? process.env;
  const spawn2 = options.spawnSyncImpl ?? spawnSync;
  const configured = options.configured?.trim() || (tool === "ffmpeg" ? env.FFMPEG_PATH?.trim() : env.FFPROBE_PATH?.trim());
  if (configured) {
    if (!toolUsable(configured, tool, spawn2)) {
      throw new Error(`configured ${tool} is not usable: ${configured}`);
    }
    return configured;
  }
  const key = platformKey();
  if (key) {
    const manifest = BUNDLED_FFMPEG_MANIFEST.platforms[key][tool];
    const archive = archiveCandidates(tool, key, options.moduleUrl).find(existsSync6);
    if (archive) {
      try {
        const destination = join7(
          cacheRoot(env),
          "video-editing",
          "ffmpeg",
          BUNDLED_FFMPEG_MANIFEST.version,
          key,
          manifest.filename
        );
        const materialized = await materializeArchive({
          archive,
          destination,
          expectedSha256: manifest.sha256
        });
        if (toolUsable(materialized, tool, spawn2)) {
          options.log?.(`using bundled ${tool} ${BUNDLED_FFMPEG_MANIFEST.version}`);
          return materialized;
        }
        options.log?.(`bundled ${tool} could not run; trying PATH`);
      } catch (error) {
        options.log?.(
          `bundled ${tool} unavailable: ${error instanceof Error ? error.message : String(error)}; trying PATH`
        );
      }
    }
  }
  return toolUsable(tool, tool, spawn2) ? tool : null;
}
async function resolveMediaTools(options = {}) {
  const [ffmpeg, ffprobe] = await Promise.all([
    resolveMediaTool("ffmpeg", {
      configured: options.ffmpeg,
      env: options.env,
      moduleUrl: options.moduleUrl,
      spawnSyncImpl: options.spawnSyncImpl,
      log: options.log
    }),
    resolveMediaTool("ffprobe", {
      configured: options.ffprobe,
      env: options.env,
      moduleUrl: options.moduleUrl,
      spawnSyncImpl: options.spawnSyncImpl,
      log: options.log
    })
  ]);
  return ffmpeg && ffprobe ? { ffmpeg, ffprobe } : null;
}
var init_materializer = __esm({
  "src/import/materializer.ts"() {
    "use strict";
    init_bundled_manifest();
    init_process();
  }
});

// src/util.ts
var init_util2 = __esm({
  "src/util.ts"() {
    "use strict";
  }
});

// src/source-analysis.ts
function lutProfileEvidence(meta) {
  const flat = [
    meta.colorTransfer,
    meta.colorPrimaries,
    meta.colorSpace,
    ...Object.values(meta.tags ?? {})
  ].filter((text) => typeof text === "string").map((text) => text.toLowerCase().replace(/[^a-z0-9]/g, ""));
  const hit = (markers) => flat.some((text) => markers.some((marker) => text.includes(marker)));
  for (const spec of LUT_EVIDENCE) {
    if (!hit(spec.curve)) continue;
    return hit(spec.gamut) ? { profile: spec.profile } : { curveOnly: spec.profile };
  }
  return {};
}
function textNamesCurve(text) {
  const flat = text.toLowerCase().replace(/[^a-z0-9]/g, "");
  return LUT_EVIDENCE.some((spec) => spec.curve.some((marker) => flat.includes(marker)));
}
function lutNote(evidence) {
  return evidence.curveOnly !== void 0 ? ` (curve ${evidence.curveOnly} named but its gamut is unconfirmed \u2014 conversion LUT not auto-selected)` : "";
}
function detectLogProfile(meta, stats) {
  const transfer = (meta.colorTransfer ?? "").trim().toLowerCase();
  if (HDR_TRANSFERS.has(transfer)) {
    return { log: false, confidence: 1, reason: `HDR transfer (${transfer}), not log` };
  }
  const evidence = lutProfileEvidence(meta);
  if (LOG_TRANSFERS.has(transfer) || textNamesCurve(transfer)) {
    return {
      log: true,
      confidence: 1,
      reason: `color_transfer=${transfer}${lutNote(evidence)}`,
      ...evidence.profile !== void 0 ? { profile: evidence.profile } : {}
    };
  }
  const marker = findLogTagMarker(meta.tags);
  if (marker !== null) {
    return {
      log: true,
      confidence: 1,
      reason: `metadata tag names ${marker}${lutNote(evidence)}`,
      ...evidence.profile !== void 0 ? { profile: evidence.profile } : {}
    };
  }
  const range = stats.yMax - stats.yMin;
  const raisedFloor = stats.yMin > 0.05;
  const compressed = range < 0.55;
  const desaturated = stats.satMean < 0.2;
  if (raisedFloor && compressed && desaturated) {
    const confidence = Math.min(
      0.95,
      0.5 + clamp01((stats.yMin - 0.05) / 0.05) * 0.2 + clamp01((0.55 - range) / 0.15) * 0.15 + clamp01((0.2 - stats.satMean) / 0.12) * 0.1
    );
    return {
      log: true,
      confidence,
      reason: `raised black floor (${stats.yMin.toFixed(3)}), compressed range (${range.toFixed(3)}), low saturation (${stats.satMean.toFixed(3)})`
    };
  }
  const strongFloor = stats.yMin >= 0.12;
  const strongDesat = stats.satMean <= 0.1;
  if (strongFloor && strongDesat) {
    return {
      log: true,
      confidence: Math.min(
        0.9,
        0.55 + clamp01((stats.yMin - 0.12) / 0.08) * 0.2 + clamp01((0.1 - stats.satMean) / 0.08) * 0.15
      ),
      reason: `strongly raised black floor (${stats.yMin.toFixed(3)}) with near-zero saturation (${stats.satMean.toFixed(3)}); range (${range.toFixed(3)}) not required`
    };
  }
  const bandFloor = stats.yMin >= 0.08;
  const bandDesat = stats.satMean <= 0.15;
  if (raisedFloor && desaturated && !compressed && bandFloor && bandDesat) {
    return {
      log: true,
      confidence: Math.min(
        0.7,
        0.6 + clamp01((stats.yMin - 0.08) / 0.08) * 0.05 + clamp01((0.15 - stats.satMean) / 0.15) * 0.05
      ),
      reason: `raised black floor (${stats.yMin.toFixed(3)}) and low saturation (${stats.satMean.toFixed(3)}) both read as log; range (${range.toFixed(3)}) is wide, but one bright region is enough to widen it, so the range criterion is waived at reduced confidence`
    };
  }
  const missing = [
    raisedFloor ? null : `black floor ${stats.yMin.toFixed(3)} <= 0.05`,
    compressed ? null : `range ${range.toFixed(3)} >= 0.55`,
    desaturated ? null : `saturation ${stats.satMean.toFixed(3)} >= 0.20`
  ].filter((x) => x !== null);
  return { log: false, confidence: 1 - 0.25 * (3 - missing.length), reason: missing.join("; ") };
}
function findLogTagMarker(tags) {
  if (!tags) return null;
  for (const value of Object.values(tags)) {
    if (typeof value !== "string") continue;
    const flat = value.toLowerCase().replace(/[^a-z0-9]/g, "");
    for (const marker of LOG_TAG_MARKERS) {
      if (flat.includes(marker)) return marker;
    }
  }
  return null;
}
function classifyChannelMode(channels, stats) {
  if (channels <= 0 || stats.length === 0) return "unknown";
  if (channels === 1 || stats.length === 1) return "mono";
  if (channels > 2) return "multichannel";
  const left = stats[0];
  const right = stats[1];
  const loud = Math.max(left.rmsDb, right.rmsDb);
  const quiet = Math.min(left.rmsDb, right.rmsDb);
  if (!(loud > LIVE_CHANNEL_DB)) return "unknown";
  const rmsDelta = loud - quiet;
  const peakDelta = Math.abs(left.peakDb - right.peakDb);
  if (rmsDelta >= SINGLE_SIDED_DELTA_DB && quiet <= SILENT_CHANNEL_DB && peakDelta >= SINGLE_SIDED_PEAK_DELTA_DB) {
    return left.rmsDb > right.rmsDb ? "single-sided-left" : "single-sided-right";
  }
  if (rmsDelta <= DUAL_MONO_DELTA_DB) return "dual-mono";
  return "stereo";
}
function panFilterFor(mode) {
  switch (mode) {
    case "single-sided-left":
      return "pan=stereo|c0=c0|c1=c0";
    case "single-sided-right":
      return "pan=stereo|c0=c1|c1=c1";
    default:
      return "";
  }
}
function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}
function clamp01(x) {
  return clamp(x, 0, 1);
}
var HDR_TRANSFERS, LOG_TRANSFERS, LOG_TAG_MARKERS, LUT_EVIDENCE, SINGLE_SIDED_DELTA_DB, SILENT_CHANNEL_DB, LIVE_CHANNEL_DB, SINGLE_SIDED_PEAK_DELTA_DB, DUAL_MONO_DELTA_DB;
var init_source_analysis = __esm({
  "src/source-analysis.ts"() {
    "use strict";
    init_util2();
    HDR_TRANSFERS = /* @__PURE__ */ new Set(["smpte2084", "arib-std-b67"]);
    LOG_TRANSFERS = /* @__PURE__ */ new Set(["log", "log100", "log316", "log_sqrt"]);
    LOG_TAG_MARKERS = [
      "slog",
      // Sony S-Log2 / S-Log3
      "vlog",
      // Panasonic V-Log
      "clog",
      // Canon C-Log / C-Log3
      "dlog",
      // DJI D-Log
      "flog",
      // Fujifilm F-Log
      "logc",
      // ARRI LogC
      "nlog",
      // Nikon N-Log
      "cineliked",
      // Panasonic CineLike-D
      "cinelikev",
      "protuneflat"
      // GoPro Protune flat
    ];
    LUT_EVIDENCE = [
      { profile: "slog3", curve: ["slog3"], gamut: ["sgamut3cine"] },
      { profile: "clog3", curve: ["clog3", "canonlog3"], gamut: ["cinemagamut"] }
    ];
    SINGLE_SIDED_DELTA_DB = 25;
    SILENT_CHANNEL_DB = -50;
    LIVE_CHANNEL_DB = -50;
    SINGLE_SIDED_PEAK_DELTA_DB = 20;
    DUAL_MONO_DELTA_DB = 0.5;
  }
});

// src/import/silences.ts
function buildImportSilencesFile(stem, silences, preFilter) {
  return {
    version: 2,
    meta: {
      noiseDb: IMPORT_SILENCE_NOISE_DB,
      minSilence: IMPORT_SILENCE_MIN_S,
      preFilter
    },
    sources: { [stem]: silences }
  };
}
var IMPORT_SILENCE_NOISE_DB, IMPORT_SILENCE_MIN_S;
var init_silences = __esm({
  "src/import/silences.ts"() {
    "use strict";
    IMPORT_SILENCE_NOISE_DB = -36;
    IMPORT_SILENCE_MIN_S = 0.14;
  }
});

// src/import/analyze.ts
import { mkdtemp, readFile, rm as rm2 } from "fs/promises";
import { tmpdir as tmpdir2 } from "os";
import { join as join8 } from "path";
function parseImportSilences(stderr, durationS = 0) {
  const intervals = [];
  let pending = null;
  for (const line of stderr.split(/\r?\n/)) {
    const start = /silence_start:\s*(-?[0-9]+(?:\.[0-9]+)?)/.exec(line);
    if (start) {
      pending = Number(start[1]);
      continue;
    }
    const end = /silence_end:\s*(-?[0-9]+(?:\.[0-9]+)?)/.exec(line);
    if (end && pending !== null) {
      const value = Number(end[1]);
      if (value > pending) intervals.push({ start: pending, end: value });
      pending = null;
    }
  }
  if (pending !== null && durationS > pending) {
    intervals.push({ start: pending, end: durationS });
  }
  return intervals;
}
function parseAstats(stderr) {
  const channels = [];
  let current = null;
  const flush = () => {
    if (current?.rmsDb !== void 0 && current.peakDb !== void 0) {
      channels.push({ rmsDb: current.rmsDb, peakDb: current.peakDb });
    }
    current = null;
  };
  for (const raw of stderr.split(/\r?\n/)) {
    const line = raw.replace(/^\[[^\]]*\]\s*/, "").trim();
    if (/^Channel:\s*\d+$/.test(line)) {
      flush();
      current = {};
      continue;
    }
    if (line === "Overall") {
      flush();
      break;
    }
    if (!current) continue;
    const peak = /^Peak level dB:\s*(\S+)$/.exec(line);
    const rms = /^RMS level dB:\s*(\S+)$/.exec(line);
    if (peak) current.peakDb = parseDb(peak[1]);
    if (rms) current.rmsDb = parseDb(rms[1]);
  }
  flush();
  return channels;
}
function parseDb(raw) {
  const value = raw.trim().toLowerCase();
  if (value === "-inf" || value === "nan") return Number.NEGATIVE_INFINITY;
  if (value === "inf" || value === "+inf") return Number.POSITIVE_INFINITY;
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}
function parseEbur128IntegratedLufs(stderr) {
  const start = stderr.lastIndexOf("Integrated loudness:");
  const summary = start >= 0 ? stderr.slice(start) : stderr;
  const match = /\bI:\s*(-?\d+(?:\.\d+)?)\s*LUFS\b/i.exec(summary);
  if (!match) return null;
  const value = Number.parseFloat(match[1]);
  return Number.isFinite(value) ? value : null;
}
function metadataValue(line) {
  const index = line.lastIndexOf("=");
  if (index < 0) return null;
  const value = Number.parseFloat(line.slice(index + 1));
  return Number.isNaN(value) ? null : value;
}
function parseSignalStats(text) {
  const yMin = [];
  const yMax = [];
  const yMean = [];
  const satMean = [];
  let bitDepth = 8;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const value = metadataValue(line);
    if (value === null) continue;
    if (line.includes("lavfi.signalstats.YBITDEPTH")) bitDepth = Math.trunc(value);
    else if (line.includes("lavfi.signalstats.YMIN")) yMin.push(value);
    else if (line.includes("lavfi.signalstats.YMAX")) yMax.push(value);
    else if (line.includes("lavfi.signalstats.YAVG")) yMean.push(value);
    else if (line.includes("lavfi.signalstats.SATAVG")) satMean.push(value);
  }
  if (yMean.length === 0) {
    return { yMin: 0, yMax: 1, yMean: 0.5, satMean: 0.25 };
  }
  const scale = 2 ** bitDepth - 1;
  const mean = (values, fallback) => values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length / scale : fallback;
  return {
    yMin: mean(yMin, 0),
    yMax: mean(yMax, 1),
    yMean: mean(yMean, 0.5),
    satMean: mean(satMean, 0.25)
  };
}
function finiteOrNull(value) {
  return Number.isFinite(value) ? value : null;
}
async function analyzeImportSource(source, probe, ffmpeg, run = runProcess) {
  const metadataDir = await mkdtemp(join8(tmpdir2(), "agentcut-signalstats-"));
  const metadataPath = join8(metadataDir, "signalstats.txt");
  try {
    const audioPromise = probe.hasAudio ? run(
      ffmpeg,
      [
        "-nostdin",
        "-hide_banner",
        "-nostats",
        "-i",
        source,
        "-af",
        "astats=metadata=1:reset=0",
        "-vn",
        "-f",
        "null",
        "-"
      ],
      { allowFailure: true }
    ) : Promise.resolve({ code: 0, stdout: "", stderr: "", timedOut: false });
    const loudnessPromise = probe.hasAudio ? run(
      ffmpeg,
      [
        "-nostdin",
        "-hide_banner",
        "-nostats",
        "-i",
        source,
        "-filter_complex",
        "ebur128=peak=none",
        "-f",
        "null",
        "-"
      ],
      { allowFailure: true, timeoutMs: 12e4 }
    ) : Promise.resolve({ code: 0, stdout: "", stderr: "", timedOut: false });
    const fps = Math.max(0.5, Math.min(12 / Math.max(probe.durationS, 0.1), 10));
    const colorPromise = run(
      ffmpeg,
      [
        "-nostdin",
        "-hide_banner",
        "-nostats",
        "-i",
        source,
        "-vf",
        `fps=${fps.toFixed(2)},signalstats,metadata=print:file=${metadataPath}`,
        "-f",
        "null",
        "-"
      ],
      { allowFailure: true }
    );
    const [audio, loudness, color] = await Promise.all([
      audioPromise,
      loudnessPromise,
      colorPromise
    ]);
    const levels = audio.code === 0 ? parseAstats(audio.stderr) : [];
    const channels = Number(probe.audio?.channels ?? 0) || 0;
    const channelMode = classifyChannelMode(channels, levels);
    const fixFilter = panFilterFor(channelMode) || null;
    let stats = { yMin: 0, yMax: 1, yMean: 0.5, satMean: 0.25 };
    if (color.code === 0) {
      stats = parseSignalStats(await readFile(metadataPath, "utf8").catch(() => ""));
    }
    const meta = {
      colorTransfer: probe.video.color_transfer,
      colorPrimaries: probe.video.color_primaries,
      colorSpace: probe.video.color_space,
      colorRange: probe.video.color_range,
      pixFmt: probe.video.pix_fmt,
      bitsPerRawSample: probe.video.bits_per_raw_sample ? Number(probe.video.bits_per_raw_sample) : void 0,
      tags: {
        ...probe.video.tags ?? {},
        ...probe.raw.format?.tags ?? {}
      }
    };
    const verdict = detectLogProfile(meta, stats);
    return {
      version: 1,
      audio: {
        channels,
        channelLayout: probe.audio?.channel_layout ?? null,
        sampleRate: probe.audio?.sample_rate ? Number(probe.audio.sample_rate) : null,
        streams: (probe.raw.streams ?? []).filter((stream) => stream.codec_type === "audio").length,
        fixFilter,
        perChannelRmsDb: levels.map((entry) => finiteOrNull(entry.rmsDb)),
        perChannelPeakDb: levels.map((entry) => finiteOrNull(entry.peakDb)),
        integratedLufs: loudness.code === 0 ? parseEbur128IntegratedLufs(loudness.stderr) : null,
        channelMode
      },
      color: {
        ...meta,
        stats,
        logSuspected: verdict.log,
        confidence: verdict.confidence,
        reason: verdict.reason,
        ...verdict.marginal ? { logMarginal: true } : {}
      }
    };
  } finally {
    await rm2(metadataDir, { recursive: true, force: true });
  }
}
async function detectImportSilences(source, durationS, ffmpeg, fixFilter, run = runProcess) {
  const detect = `silencedetect=noise=${IMPORT_SILENCE_NOISE_DB}dB:d=${IMPORT_SILENCE_MIN_S.toFixed(3)}`;
  const result = await run(
    ffmpeg,
    [
      "-nostdin",
      "-hide_banner",
      "-nostats",
      "-i",
      source,
      "-af",
      fixFilter ? `${fixFilter},${detect}` : detect,
      "-vn",
      "-f",
      "null",
      "-"
    ],
    { allowFailure: true }
  );
  return result.code === 0 ? parseImportSilences(result.stderr, durationS) : [];
}
var init_analyze = __esm({
  "src/import/analyze.ts"() {
    "use strict";
    init_source_analysis();
    init_process();
    init_silences();
  }
});

// src/probe.ts
function rotationDegrees(stream) {
  for (const sideData of stream.side_data_list ?? []) {
    if (sideData && "rotation" in sideData) {
      const v = Number(sideData.rotation);
      return Number.isFinite(v) ? Math.trunc(v) : 0;
    }
  }
  const tags = stream.tags ?? {};
  if ("rotate" in tags) {
    const v = Number(tags.rotate);
    return Number.isFinite(v) ? Math.trunc(v) : 0;
  }
  return 0;
}
function displayedDimensions(stream) {
  const width = Math.trunc(Number(stream.width ?? 0)) || 0;
  const height = Math.trunc(Number(stream.height ?? 0)) || 0;
  const rotation = rotationDegrees(stream);
  if (Math.abs(rotation) % 180 === 90) {
    return [height, width, rotation];
  }
  return [width, height, rotation];
}
var init_probe = __esm({
  "src/probe.ts"() {
    "use strict";
  }
});

// src/import/probe.ts
import { stat } from "fs/promises";
function positive(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : void 0;
}
function parseImportProbe(raw, size) {
  const streams = raw.streams ?? [];
  const video = streams.find((stream) => stream.codec_type === "video");
  if (!video) throw new Error("no video stream found");
  const audio = streams.find((stream) => stream.codec_type === "audio");
  const [width, height, rotation] = displayedDimensions(video);
  const durationS = positive(raw.format?.duration) ?? positive(video.duration) ?? 0;
  if (!(durationS > 0)) throw new Error("source has no usable duration");
  if (!(width > 0 && height > 0)) throw new Error("source has no usable video dimensions");
  return {
    raw,
    video,
    ...audio ? { audio } : {},
    audioCodec: String(audio?.codec_name ?? "").toLowerCase(),
    durationS,
    formatName: String(raw.format?.format_name ?? "").toLowerCase(),
    hasAudio: Boolean(audio),
    height,
    rotation,
    size,
    sourceBitrate: Math.floor(size * 8 / durationS),
    videoCodec: String(video.codec_name ?? "").toLowerCase(),
    videoPixelFormat: String(video.pix_fmt ?? "").toLowerCase(),
    videoProfile: String(video.profile ?? "").toLowerCase(),
    width
  };
}
async function probeMedia(path, ffprobe, run = runProcess) {
  const result = await run(ffprobe, [
    "-v",
    "error",
    "-show_entries",
    FFPROBE_ENTRIES,
    "-of",
    "json",
    path
  ]);
  let raw;
  try {
    raw = JSON.parse(result.stdout || "{}");
  } catch (error) {
    throw new Error(
      `ffprobe returned invalid JSON for ${path}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  return parseImportProbe(raw, (await stat(path)).size);
}
function probeArtifact(probe) {
  return {
    duration_s: probe.durationS,
    width: probe.width,
    height: probe.height,
    rotation: probe.rotation
  };
}
var FFPROBE_ENTRIES;
var init_probe2 = __esm({
  "src/import/probe.ts"() {
    "use strict";
    init_probe();
    init_process();
    FFPROBE_ENTRIES = "stream=index,codec_type,codec_name,profile,width,height,r_frame_rate,avg_frame_rate,duration,color_transfer,color_primaries,color_space,color_range,pix_fmt,bits_per_raw_sample,channels,channel_layout,sample_rate:stream_tags:stream_side_data=rotation:format=duration,size,format_name:format_tags";
  }
});

// src/import/transcode.ts
import { join as join9 } from "path";
function targetDimensions(width, height) {
  const longest = Math.max(width, height);
  const scale = longest > MAX_DIMENSION ? MAX_DIMENSION / longest : 1;
  const evenUp = (value) => {
    const rounded = Math.ceil(value);
    return Math.max(2, rounded % 2 === 0 ? rounded : rounded + 1);
  };
  return { width: evenUp(width * scale), height: evenUp(height * scale) };
}
function targetBitrate(width, height) {
  const scaled = MAX_BITRATE * (width * height / (1920 * 1080));
  const clamped = Math.min(MAX_BITRATE, Math.max(MIN_BITRATE, scaled));
  return Math.ceil(clamped / 1e3) * 1e3;
}
function transcodeReason(probe, analysis) {
  if (probe.videoCodec !== "h264") {
    return `video codec ${probe.videoCodec || "unknown"} is not h264`;
  }
  const formats = probe.formatName.split(",").map((format) => format.trim());
  if (!formats.some((format) => MP4_FAMILY_FORMATS.has(format))) {
    return `container ${probe.formatName || "unknown"} is not MP4-compatible`;
  }
  if (!BROWSER_H264_PROFILES.has(probe.videoProfile)) {
    return `h264 profile ${probe.videoProfile || "unknown"} is not browser-compatible`;
  }
  if (!BROWSER_H264_PIXEL_FORMATS.has(probe.videoPixelFormat)) {
    return `pixel format ${probe.videoPixelFormat || "unknown"} is not browser-compatible`;
  }
  if (probe.hasAudio && !AUDIO_CODECS.has(probe.audioCodec)) {
    return `audio codec ${probe.audioCodec || "unknown"} is not accepted`;
  }
  if (probe.width > MAX_DIMENSION || probe.height > MAX_DIMENSION) {
    return `video dimensions ${probe.width}x${probe.height} exceed ${MAX_DIMENSION}px`;
  }
  const dimensions = targetDimensions(probe.width, probe.height);
  const bitrate = targetBitrate(dimensions.width, dimensions.height);
  if (probe.sourceBitrate > Math.max(bitrate * 1.15, MAX_BITRATE)) {
    return "source bitrate exceeds efficient upload threshold";
  }
  if (probe.rotation !== 0) return `source rotation ${probe.rotation} must be baked`;
  if (analysis.audio.fixFilter) return "single-sided audio requires channel repair";
  return null;
}
function baseTranscodeArgs(input, hasAudio) {
  return [
    "-nostdin",
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    input,
    "-map",
    "0:v:0",
    ...hasAudio ? ["-map", "0:a:0?"] : ["-an"]
  ];
}
function rateArgs(bitrate) {
  return [
    "-b:v",
    String(bitrate),
    "-maxrate",
    String(bitrate),
    "-bufsize",
    String(bitrate * 2)
  ];
}
function fullEncoderArgs(encoder, input, output, dimensions, bitrate, hasAudio, fixFilter) {
  const args = [
    ...baseTranscodeArgs(input, hasAudio),
    "-vf",
    `scale=${dimensions.width}:${dimensions.height}:flags=lanczos`,
    ...fixFilter ? ["-af", fixFilter] : [],
    "-c:v",
    encoder
  ];
  if (encoder === "h264_videotoolbox") {
    args.push("-profile:v", "high", "-pix_fmt", "yuv420p", ...rateArgs(bitrate));
  } else if (encoder === "h264_nvenc") {
    args.push(
      "-preset",
      "p4",
      "-profile:v",
      "high",
      "-pix_fmt",
      "yuv420p",
      ...rateArgs(bitrate)
    );
  } else if (encoder === "h264_qsv") {
    args.push(
      "-preset",
      "veryfast",
      "-profile:v",
      "high",
      "-pix_fmt",
      "nv12",
      ...rateArgs(bitrate)
    );
  } else if (encoder === "h264_amf") {
    args.push(
      "-quality",
      "speed",
      "-profile:v",
      "high",
      "-pix_fmt",
      "yuv420p",
      ...rateArgs(bitrate)
    );
  } else {
    args.push(
      "-preset",
      "veryfast",
      "-profile:v",
      "high",
      "-pix_fmt",
      "yuv420p",
      ...rateArgs(bitrate)
    );
  }
  args.push("-movflags", "+faststart");
  if (hasAudio) args.push("-c:a", "aac", "-b:a", "320k");
  args.push(output);
  return args;
}
function simpleEncoderArgs(encoder, input, output, dimensions, bitrate, hasAudio, fixFilter) {
  const args = [
    ...baseTranscodeArgs(input, hasAudio),
    "-vf",
    `scale=${dimensions.width}:${dimensions.height}:flags=lanczos`,
    ...fixFilter ? ["-af", fixFilter] : [],
    "-c:v",
    encoder,
    "-b:v",
    String(bitrate),
    "-movflags",
    "+faststart"
  ];
  if (hasAudio) args.push("-c:a", "aac", "-b:a", "320k");
  args.push(output);
  return args;
}
function parseAvailableHardwareEncoders(stdout, platform = process.platform, env = process.env) {
  if (env.AGENTCUT_IMPORT_HWACCEL === "0") return [];
  const defaults = platform === "darwin" ? ["h264_videotoolbox"] : platform === "win32" ? ["h264_nvenc", "h264_qsv", "h264_amf"] : [];
  const preferred = env.AGENTCUT_IMPORT_HW_ENCODERS ? env.AGENTCUT_IMPORT_HW_ENCODERS.split(",").map((item) => item.trim()).filter(
    (item) => ["h264_videotoolbox", "h264_nvenc", "h264_qsv", "h264_amf"].includes(
      item
    )
  ) : defaults;
  return preferred.filter(
    (encoder) => new RegExp(`(^|\\s)${encoder}(\\s|$)`).test(stdout)
  );
}
async function prepareVideoUpload(input, probe, analysis, ffmpeg, workDir, run = runProcess, log = () => {
}) {
  const reason = transcodeReason(probe, analysis);
  if (!reason) return { path: input, reason: "source accepted", transcoded: false };
  const output = join9(workDir, "upload.mp4");
  const dimensions = targetDimensions(probe.width, probe.height);
  const bitrate = targetBitrate(dimensions.width, dimensions.height);
  const encoderProbe = await run(
    ffmpeg,
    ["-hide_banner", "-loglevel", "error", "-encoders"],
    { allowFailure: true }
  );
  const hardware = parseAvailableHardwareEncoders(encoderProbe.stdout);
  for (const encoder of hardware) {
    log(`trying hardware H.264 transcode via ${encoder}`);
    const full = await run(
      ffmpeg,
      fullEncoderArgs(
        encoder,
        input,
        output,
        dimensions,
        bitrate,
        probe.hasAudio,
        analysis.audio.fixFilter
      ),
      { allowFailure: true }
    );
    if (full.code === 0) return { path: output, reason, transcoded: true };
    log(`hardware transcode via ${encoder} failed; retrying with simple arguments`);
    const simple = await run(
      ffmpeg,
      simpleEncoderArgs(
        encoder,
        input,
        output,
        dimensions,
        bitrate,
        probe.hasAudio,
        analysis.audio.fixFilter
      ),
      { allowFailure: true }
    );
    if (simple.code === 0) return { path: output, reason, transcoded: true };
  }
  log("using libx264 software fallback");
  await run(
    ffmpeg,
    fullEncoderArgs(
      "libx264",
      input,
      output,
      dimensions,
      bitrate,
      probe.hasAudio,
      analysis.audio.fixFilter
    )
  );
  return { path: output, reason, transcoded: true };
}
var MAX_DIMENSION, MAX_BITRATE, MIN_BITRATE, AUDIO_CODECS, MP4_FAMILY_FORMATS, BROWSER_H264_PROFILES, BROWSER_H264_PIXEL_FORMATS;
var init_transcode = __esm({
  "src/import/transcode.ts"() {
    "use strict";
    init_process();
    MAX_DIMENSION = 1920;
    MAX_BITRATE = 8e6;
    MIN_BITRATE = 15e5;
    AUDIO_CODECS = /* @__PURE__ */ new Set(["aac", "mp3", "flac", "opus", "vorbis"]);
    MP4_FAMILY_FORMATS = /* @__PURE__ */ new Set(["mov", "mp4", "m4a", "3gp", "3g2", "mj2"]);
    BROWSER_H264_PROFILES = /* @__PURE__ */ new Set(["baseline", "constrained baseline", "main", "high"]);
    BROWSER_H264_PIXEL_FORMATS = /* @__PURE__ */ new Set(["yuv420p", "yuvj420p"]);
  }
});

// src/import/pipeline.ts
import { createHash as createHash4 } from "crypto";
import { createReadStream as createReadStream3, existsSync as existsSync7 } from "fs";
import { mkdir as mkdir2, writeFile } from "fs/promises";
import { basename, extname, join as join10, parse, resolve as resolve3 } from "path";
function transcribeWaitMsFor(durationS) {
  const scaled = Number.isFinite(durationS) ? durationS * 2e3 : 0;
  return Math.min(MAX_TRANSCRIBE_WAIT_MS, Math.max(MIN_TRANSCRIBE_WAIT_MS, scaled));
}
function json(value) {
  return JSON.stringify(value, null, 2);
}
function videoContentType(path) {
  const extension = extname(path).toLowerCase();
  if (extension === ".mov") return "video/quicktime";
  if (extension === ".mkv") return "video/x-matroska";
  if (extension === ".avi") return "video/x-msvideo";
  return "video/mp4";
}
async function hashFile(path) {
  const hash = createHash4("sha256");
  await new Promise((resolvePromise, reject) => {
    const stream = createReadStream3(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolvePromise);
  });
  return hash.digest("hex");
}
async function pushInlineArtifacts(client, stem, probe, analysis, silences, jobDir) {
  const artifacts = {
    "probe.json": json(probeArtifact(probe)),
    "analysis.json": json(analysis),
    "silences.json": json(buildImportSilencesFile(stem, silences, analysis.audio.fixFilter))
  };
  for (const [path, content] of Object.entries(artifacts)) {
    await writeFile(join10(jobDir, path), content, "utf8");
    await client.filesPutInline(path, content, "application/json");
  }
}
async function transcriptionFirst(client, source, stem, probe, analysis, silences, jobDir, ffmpeg, run, log) {
  await mkdir2(join10(jobDir, "audio"), { recursive: true });
  const wavPath = join10(jobDir, "audio", `${stem}.wav`);
  await run(ffmpeg, [
    "-nostdin",
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    source,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-c:a",
    "pcm_s16le",
    wavPath
  ]);
  await pushInlineArtifacts(client, stem, probe, analysis, silences, jobDir);
  await uploadVfsFile(client, `audio/${stem}.wav`, wavPath, "audio/wav", {
    sha256: await hashFile(wavPath),
    log
  });
  return (await client.transcribeStart({
    wav_path: `audio/${stem}.wav`,
    stem,
    duration_s: probe.durationS
  })).runId;
}
async function createThumbnail(source, durationS, output, ffmpeg, run) {
  const seek = Math.max(1e-3, Math.min(durationS * 0.3, durationS - 1e-3));
  await run(
    ffmpeg,
    [
      "-nostdin",
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-ss",
      String(seek),
      "-i",
      source,
      "-frames:v",
      "1",
      "-vf",
      "scale=320:-2",
      "-q:v",
      "3",
      output
    ],
    { allowFailure: true }
  );
}
async function uploadAsset(client, videoId, path, log) {
  const source = await openFileSource(path);
  try {
    const sha256 = await hashFile(path);
    const contentType = videoContentType(path);
    const multipart = await uploadMultipart(client, {
      kind: "asset",
      source,
      contentType,
      filename: basename(path),
      videoId,
      sha256,
      log
    });
    if (multipart !== "unavailable" && multipart !== "oversize") {
      if (!multipart.assetId) throw new Error("asset multipart upload returned no asset_id");
      return { assetId: multipart.assetId, bytes: source.size, sha256 };
    }
    log("multipart unavailable; trying owner-auth streaming upload fallback");
    const asset = await client.createSourceAsset({
      contentType,
      filename: basename(path),
      videoId
    });
    await client.uploadStream(asset.uploadUrl, source, contentType);
    return { assetId: asset.assetId, bytes: source.size, sha256 };
  } finally {
    await source.close();
  }
}
async function importClientMedia(options) {
  const sourcePath = resolve3(options.sourcePath);
  let videoId = options.videoId;
  const run = options.run ?? runProcess;
  const log = (line) => options.onLog?.(line);
  try {
    if (!existsSync7(sourcePath)) throw new Error(`source not found: ${sourcePath}`);
    await mkdir2(options.jobDir, { recursive: true });
    if (options.validateOwnerAuth) await options.client.me();
    log(`probing ${basename(sourcePath)}`);
    const sourceProbe = await probeMedia(sourcePath, options.ffprobe, run);
    log("analysing audio and colour");
    const analysis = await analyzeImportSource(
      sourcePath,
      sourceProbe,
      options.ffmpeg,
      run
    );
    const silences = await detectImportSilences(
      sourcePath,
      sourceProbe.durationS,
      options.ffmpeg,
      analysis.audio.fixFilter,
      run
    );
    const rawName = parse(sourcePath).name;
    const stem = sanitizeStem(rawName);
    let projectId = options.projectId ?? "";
    if (!videoId) {
      if (!projectId) {
        if (!options.validateOwnerAuth) {
          throw new Error(
            "the import session token does not identify a project; create a fresh import session"
          );
        }
        projectId = (await options.client.createProject(options.title ?? rawName)).projectId;
      }
      const created = await options.client.createExternalVideo(projectId, {
        title: options.title ?? stem
      });
      videoId = created.videoId;
      projectId = created.projectId;
      log(`video: ${videoId}`);
    }
    if (!projectId) {
      throw new Error("project id is unavailable for the resumed video");
    }
    const client = options.client.withVideoId(videoId);
    let jobJson = jobJsonPath(options.jobDir);
    if (readJobFile(options.jobDir) === null) {
      jobJson = writeJobFile(options.jobDir, {
        video_id: videoId,
        project_id: projectId,
        api_base: options.client.cfg.base,
        stem,
        duration_s: 0,
        source_path: sourcePath
      });
    }
    let transcript = options.noTranscribe ? "skipped" : "started";
    let transcribeRunId;
    let transcriptError;
    if (!options.noTranscribe) {
      try {
        log("extracting and uploading transcription audio first");
        transcribeRunId = await transcriptionFirst(
          client,
          sourcePath,
          stem,
          sourceProbe,
          analysis,
          silences,
          options.jobDir,
          options.ffmpeg,
          run,
          log
        );
        log(`transcribe run: ${transcribeRunId}`);
      } catch (error) {
        transcript = "failed";
        transcriptError = error instanceof Error ? error.message : String(error);
        log(`transcription stage failed; continuing video upload: ${transcriptError}`);
        if (options.transcriptionOnly) throw error;
      }
    } else {
      await pushInlineArtifacts(
        client,
        stem,
        sourceProbe,
        analysis,
        silences,
        options.jobDir
      );
    }
    if (options.transcriptionOnly) {
      if (!transcribeRunId) throw new Error("transcription-only retry did not start a run");
      const state = await pollRun(client, transcribeRunId, {
        intervalMs: options.pollIntervalMs,
        maxMs: options.transcribeWaitMs ?? transcribeWaitMsFor(sourceProbe.durationS),
        onEvent: (event) => log(formatRunEvent(event)),
        onHeartbeat: (elapsedMs, status) => log(`waiting on transcribe run (${Math.round(elapsedMs / 1e3)}s, status ${status})`)
      });
      assertRunCompleted(state, "transcribe");
      transcript = "completed";
      const pulled2 = await pullFiles(client, options.jobDir, {
        only: ingestArtifactSet(stem).filter((path) => !LOCALLY_PRODUCED.has(path)),
        prefixes: ["prompts/"]
      });
      jobJson = writeJobFile(options.jobDir, {
        video_id: videoId,
        project_id: projectId,
        api_base: options.client.cfg.base,
        stem,
        duration_s: sourceProbe.durationS,
        source_path: sourcePath
      });
      return {
        sourcePath,
        video_id: videoId,
        project_id: projectId,
        stem,
        duration_s: sourceProbe.durationS,
        transcodeReason: "transcription-only",
        transcoded: false,
        uploaded_bytes: 0,
        web_url: webVideoUrl(options.client.cfg.base, projectId, videoId),
        transcript,
        transcribeRunId,
        jobDir: options.jobDir,
        jobJson,
        pulled: pulled2
      };
    }
    await createThumbnail(
      sourcePath,
      sourceProbe.durationS,
      join10(options.jobDir, "poster.jpg"),
      options.ffmpeg,
      run
    );
    log("preparing video upload");
    const prepared = await prepareVideoUpload(
      sourcePath,
      sourceProbe,
      analysis,
      options.ffmpeg,
      options.scratchDir ?? options.jobDir,
      run,
      log
    );
    const finalProbe = prepared.transcoded ? await probeMedia(prepared.path, options.ffprobe, run) : sourceProbe;
    const finalProbeContent = json({
      ...probeArtifact(finalProbe),
      rotation: prepared.transcoded ? 0 : finalProbe.rotation
    });
    await writeFile(join10(options.jobDir, "probe.json"), finalProbeContent, "utf8");
    await client.filesPutInline("probe.json", finalProbeContent, "application/json");
    log("uploading video bytes");
    const uploaded = await uploadAsset(client, videoId, prepared.path, log);
    await client.ingestClientComplete({
      stem,
      asset_id: uploaded.assetId,
      sha256: uploaded.sha256
    });
    log("video upload finalized");
    let pulled = { pulled: [], missing: [], conflicts: [] };
    if (transcribeRunId) {
      try {
        const state = await pollRun(client, transcribeRunId, {
          intervalMs: options.pollIntervalMs,
          maxMs: options.transcribeWaitMs ?? transcribeWaitMsFor(sourceProbe.durationS),
          onEvent: (event) => log(formatRunEvent(event)),
          onHeartbeat: (elapsedMs, status) => log(`waiting on transcribe run (${Math.round(elapsedMs / 1e3)}s, status ${status})`)
        });
        assertRunCompleted(state, "transcribe");
        transcript = "completed";
        pulled = await pullFiles(client, options.jobDir, {
          only: ingestArtifactSet(stem).filter((path) => !LOCALLY_PRODUCED.has(path)),
          prefixes: ["prompts/"]
        });
      } catch (error) {
        transcript = error instanceof RunPollTimeoutError ? "started" : "failed";
        transcriptError = error instanceof Error ? error.message : String(error);
        log(`transcribe ${transcript === "started" ? "still running" : "run/pull failed"} after video finalize: ${transcriptError}`);
      }
    }
    const durationS = finalProbe.durationS;
    jobJson = writeJobFile(options.jobDir, {
      video_id: videoId,
      project_id: projectId,
      api_base: options.client.cfg.base,
      stem,
      duration_s: durationS,
      source_path: sourcePath
    });
    return {
      sourcePath,
      video_id: videoId,
      project_id: projectId,
      stem,
      duration_s: durationS,
      transcodeReason: prepared.reason,
      transcoded: prepared.transcoded,
      uploaded_bytes: uploaded.bytes,
      web_url: webVideoUrl(options.client.cfg.base, projectId, videoId),
      transcript,
      ...transcribeRunId ? { transcribeRunId } : {},
      ...transcriptError ? { transcriptError } : {},
      jobDir: options.jobDir,
      jobJson,
      pulled
    };
  } catch (error) {
    throw new ImportPipelineError(
      error instanceof Error ? error.message : String(error),
      sourcePath,
      videoId,
      options.transcriptionOnly === true,
      { cause: error }
    );
  }
}
var LOCALLY_PRODUCED, MIN_TRANSCRIBE_WAIT_MS, MAX_TRANSCRIBE_WAIT_MS, ImportPipelineError;
var init_pipeline = __esm({
  "src/import/pipeline.ts"() {
    "use strict";
    init_client();
    init_files();
    init_init();
    init_jobfile();
    init_multipart();
    init_runs();
    init_analyze();
    init_silences();
    init_probe2();
    init_process();
    init_transcode();
    LOCALLY_PRODUCED = /* @__PURE__ */ new Set([
      "probe.json",
      "analysis.json",
      "silences.json"
    ]);
    MIN_TRANSCRIBE_WAIT_MS = 5 * 60 * 1e3;
    MAX_TRANSCRIBE_WAIT_MS = 20 * 60 * 1e3;
    ImportPipelineError = class extends Error {
      constructor(message, sourcePath, videoId, transcriptionOnly = false, options) {
        super(message, options);
        this.sourcePath = sourcePath;
        this.videoId = videoId;
        this.transcriptionOnly = transcriptionOnly;
        this.name = "ImportPipelineError";
      }
      sourcePath;
      videoId;
      transcriptionOnly;
    };
  }
});

// src/import/upload-media.ts
init_client();
import { mkdir as mkdir3, mkdtemp as mkdtemp2, rm as rm3, writeFile as writeFile2 } from "fs/promises";
import { join as join11, resolve as resolve4 } from "path";
import { fileURLToPath as fileURLToPath2 } from "url";

// src/import/argv.ts
import { homedir, tmpdir } from "os";
import { join } from "path";
var MAX_IMPORT_INPUTS = 4;
function defaultImportJobRoot(env = process.env, homeDir = homedir()) {
  return env.AGENTCUT_JOB_ROOT || join(homeDir, "agentcut-jobs");
}
function valueAfter(argv, index) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${argv[index]} requires a value`);
  }
  return value;
}
function parseImportArgs(argv, env = process.env) {
  const options = {
    endpoint: "",
    help: false,
    inputs: [],
    jobRoot: defaultImportJobRoot(env),
    sessionToken: "",
    transcribe: true,
    transcriptionOnly: false,
    workDir: tmpdir(),
    ...env.FFMPEG_PATH ? { ffmpeg: env.FFMPEG_PATH } : {},
    ...env.FFPROBE_PATH ? { ffprobe: env.FFPROBE_PATH } : {}
  };
  for (let index = 0; index < argv.length; ) {
    const arg = argv[index];
    if (arg === "--input") {
      options.inputs.push(valueAfter(argv, index));
      index += 2;
    } else if (arg === "--token") {
      options.sessionToken = valueAfter(argv, index);
      index += 2;
    } else if (arg === "--endpoint") {
      options.endpoint = valueAfter(argv, index);
      index += 2;
    } else if (arg === "--json-out") {
      options.jsonOut = valueAfter(argv, index);
      index += 2;
    } else if (arg === "--work-dir") {
      options.workDir = valueAfter(argv, index);
      index += 2;
    } else if (arg === "--job-root") {
      options.jobRoot = valueAfter(argv, index);
      index += 2;
    } else if (arg === "--video-id") {
      options.videoId = valueAfter(argv, index);
      index += 2;
    } else if (arg === "--ffmpeg") {
      options.ffmpeg = valueAfter(argv, index);
      index += 2;
    } else if (arg === "--ffprobe") {
      options.ffprobe = valueAfter(argv, index);
      index += 2;
    } else if (arg === "--transcribe-wait-ms") {
      const raw = Number(valueAfter(argv, index));
      if (!Number.isFinite(raw) || raw <= 0) {
        throw new Error("--transcribe-wait-ms must be a positive number of milliseconds");
      }
      options.transcribeWaitMs = raw;
      index += 2;
    } else if (arg === "--transcription-only") {
      options.transcriptionOnly = true;
      index += 1;
    } else if (arg === "--no-transcribe") {
      options.transcribe = false;
      index += 1;
    } else if (arg === "-h" || arg === "--help") {
      options.help = true;
      index += 1;
    } else if (arg.startsWith("-")) {
      throw new Error(`unknown argument: ${arg}`);
    } else {
      options.inputs.push(arg);
      index += 1;
    }
  }
  if (options.help) return options;
  if (!options.sessionToken || !options.endpoint) {
    throw new Error(
      "--token and --endpoint are mandatory; create an import session first with `video-editing import session`"
    );
  }
  if (options.inputs.length === 0) throw new Error("pass at least one input file");
  if (options.inputs.length > MAX_IMPORT_INPUTS) {
    throw new Error(
      `at most ${MAX_IMPORT_INPUTS} inputs are allowed; split them into batches of 4 with a fresh session each`
    );
  }
  if (options.transcriptionOnly && !options.videoId) {
    throw new Error("--transcription-only requires --video-id <id>");
  }
  if (options.videoId && options.inputs.length !== 1) {
    throw new Error("--video-id can resume exactly one input at a time");
  }
  return options;
}
function importUsage() {
  return `Usage:
  node upload-media.mjs --token <session-token> --endpoint <base> <file> [file...]
  node upload-media.mjs --token <session-token> --endpoint <base> --input <file> [--input <file>...]

Create the short-lived import session first with:
  video-editing import session [--title <title>] --json

Options:
  --input <path>          Input file (repeatable; bare paths also work)
  --json-out <path>      Write final JSON to a file instead of stdout
  --job-root <path>      Durable job parent (else AGENTCUT_JOB_ROOT or ~/agentcut-jobs)
  --work-dir <path>      Parent directory for disposable transcode scratch
  --video-id <id>        Resume one existing video
  --transcription-only   Retry WAV/artifacts/transcription only (requires --video-id)
  --transcribe-wait-ms <ms>  Cap on waiting for the transcribe run (default:
                         2x source duration, min 5 min, max 20 min). Past it the
                         import returns with transcript "started" \u2014 finish with
                         \`video-editing transcribe\`, which never re-uploads.
  --ffmpeg <path>        Explicit ffmpeg binary (else FFMPEG_PATH)
  --ffprobe <path>       Explicit ffprobe binary (else FFPROBE_PATH)
  --no-transcribe        Skip transcription
  -h, --help             Show this help
`;
}
function retryPlan(sourcePath, endpoint, videoId, jobRoot, transcriptionOnly = false) {
  return {
    mode: transcriptionOnly ? "transcription-only" : "video-upload",
    hint: transcriptionOnly ? "Create a fresh import session, then rerun retry.args to retry transcription for the existing video." : "Create a fresh import session, then rerun retry.args to finish uploading/finalizing the existing video.",
    args: [
      "--token",
      "<fresh-token>",
      "--endpoint",
      endpoint,
      "--job-root",
      jobRoot,
      ...videoId ? ["--video-id", videoId] : [],
      ...transcriptionOnly ? ["--transcription-only"] : [],
      sourcePath
    ]
  };
}

// src/import/batch.ts
async function runImportBatch(inputs, worker) {
  const settled = await Promise.allSettled(
    inputs.map((sourcePath, index) => worker(sourcePath, index))
  );
  return settled.map(
    (result, index) => result.status === "fulfilled" ? { ok: true, sourcePath: inputs[index], value: result.value } : { ok: false, sourcePath: inputs[index], error: result.reason }
  );
}

// src/import/job-dir.ts
init_jobfile();
init_init();
import { existsSync as existsSync5, mkdirSync as mkdirSync5, readdirSync } from "fs";
import { join as join6, parse as parsePath2, resolve } from "path";
function candidateNumber(name, baseName) {
  if (name === baseName) return 1;
  if (!name.startsWith(`${baseName}-`)) return null;
  const suffix = name.slice(baseName.length + 1);
  if (!/^[1-9]\d*$/.test(suffix)) return null;
  const n = Number(suffix);
  return n >= 2 ? n : null;
}
function selectImportJobDir(options) {
  const root = resolve(options.jobRoot);
  const stem = sanitizeStem(parsePath2(options.sourcePath).name) || "source";
  const baseName = `job_${stem}`;
  const reserved = options.reserved ?? /* @__PURE__ */ new Set();
  mkdirSync5(root, { recursive: true });
  if (options.videoId && existsSync5(root)) {
    const candidates = readdirSync(root).map((name) => ({ name, n: candidateNumber(name, baseName) })).filter((entry) => entry.n !== null).sort((a, b) => a.n - b.n);
    for (const candidate of candidates) {
      const dir = join6(root, candidate.name);
      if (reserved.has(dir)) continue;
      if (readJobFile(dir)?.video_id === options.videoId) {
        reserved.add(dir);
        return dir;
      }
    }
  }
  for (let n = 1; ; n += 1) {
    const name = n === 1 ? baseName : `${baseName}-${n}`;
    const dir = join6(root, name);
    if (reserved.has(dir)) continue;
    try {
      mkdirSync5(dir);
    } catch (err) {
      if (err.code === "EEXIST") continue;
      throw err;
    }
    reserved.add(dir);
    return dir;
  }
}

// src/import/upload-media.ts
init_materializer();
init_pipeline();

// src/import/session.ts
function projectIdFromSessionToken(token) {
  const parts = token.split(".");
  if (parts.length < 2 || !parts[1]) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8")
    );
    const value = payload.project_id ?? payload.projectId;
    return typeof value === "string" && value !== "" ? value : null;
  } catch {
    return null;
  }
}
function endpointBase(endpoint) {
  try {
    const url = new URL(endpoint);
    return `${url.origin}${url.pathname}`;
  } catch {
    return endpoint.split(/[?#]/, 1)[0] ?? endpoint;
  }
}
function projectIdFromEndpoint(endpoint) {
  try {
    const value = new URL(endpoint).searchParams.get("project_id");
    return value && value !== "" ? value : null;
  } catch {
    return null;
  }
}

// src/import/upload-media.ts
var AGENT_NEXT = "video_id is usable immediately; wait for the transcribe run before transcript/editing work; byte-dependent work (render/qa) needs the upload finalized.";
function progress(message) {
  process.stderr.write(`[agentcut-import] ${message}
`);
}
function publicResult(result) {
  return {
    sourcePath: result.sourcePath,
    video_id: result.video_id,
    project_id: result.project_id,
    job_dir: result.jobDir,
    job_json: result.jobJson,
    stem: result.stem,
    duration_s: result.duration_s,
    transcodeReason: result.transcodeReason,
    transcoded: result.transcoded,
    uploaded_bytes: result.uploaded_bytes,
    web_url: result.web_url,
    transcript: result.transcript,
    ...result.transcribeRunId ? { transcribe_run_id: result.transcribeRunId } : {},
    ...result.transcriptError ? { transcript_error: result.transcriptError } : {}
  };
}
async function runUploadMedia(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseImportArgs(argv);
  } catch (error) {
    process.stderr.write(importUsage());
    process.stderr.write(
      `${JSON.stringify({
        ok: false,
        message: error instanceof Error ? error.message : String(error)
      })}
`
    );
    return 1;
  }
  if (options.help) {
    process.stderr.write(importUsage());
    return 0;
  }
  let tools;
  try {
    tools = await resolveMediaTools({
      ffmpeg: options.ffmpeg,
      ffprobe: options.ffprobe,
      log: progress
    });
  } catch (error) {
    progress(
      `local media tools could not be used: ${error instanceof Error ? error.message : String(error)}`
    );
    tools = null;
  }
  if (!tools) {
    progress(
      "no usable ffmpeg/ffprobe found (ffprobe must support stream_side_data); fall back to the cloud import route: MCP upload_start \u2192 video_create \u2192 ingest_start (or `video-editing init` where the CLI is installed)"
    );
    process.stderr.write(
      `${JSON.stringify({
        ok: false,
        message: "local media tools unavailable; fall back to the cloud import route: MCP upload_start \u2192 video_create \u2192 ingest_start (or `video-editing init` where the CLI is installed)"
      })}
`
    );
    return 1;
  }
  const base = stripTrailingSlash(endpointBase(options.endpoint));
  const projectId = projectIdFromSessionToken(options.sessionToken) ?? projectIdFromEndpoint(options.endpoint) ?? void 0;
  const client = new CloudClient(
    { base, credential: options.sessionToken, videoId: options.videoId },
    { authToken: options.sessionToken }
  );
  const jobRoot = resolve4(options.jobRoot);
  await mkdir3(jobRoot, { recursive: true });
  await mkdir3(resolve4(options.workDir), { recursive: true });
  const runDir = await mkdtemp2(join11(resolve4(options.workDir), "agentcut-import-"));
  const usedJobDirs = /* @__PURE__ */ new Set();
  try {
    const statuses = await runImportBatch(
      options.inputs.map((input) => resolve4(input)),
      async (sourcePath, index) => {
        const jobDir = selectImportJobDir({
          jobRoot,
          sourcePath,
          ...options.videoId ? { videoId: options.videoId } : {},
          reserved: usedJobDirs
        });
        const scratchDir = join11(runDir, `scratch-${index + 1}`);
        await mkdir3(scratchDir, { recursive: true });
        progress(`[${index + 1}/${options.inputs.length}] starting ${sourcePath}`);
        const result = await importClientMedia({
          client,
          sourcePath,
          ffmpeg: tools.ffmpeg,
          ffprobe: tools.ffprobe,
          ...projectId ? { projectId } : {},
          ...options.videoId ? { videoId: options.videoId } : {},
          jobDir,
          scratchDir,
          noTranscribe: !options.transcribe,
          ...options.transcribeWaitMs !== void 0 ? { transcribeWaitMs: options.transcribeWaitMs } : {},
          transcriptionOnly: options.transcriptionOnly,
          onLog: (line) => progress(`[${index + 1}/${options.inputs.length}] ${line}`)
        });
        progress(`[${index + 1}/${options.inputs.length}] complete ${sourcePath}`);
        return result;
      }
    );
    const imports = [];
    let failures = 0;
    for (const status of statuses) {
      if (status.ok) {
        imports.push(publicResult(status.value));
        continue;
      }
      failures += 1;
      const error = status.error;
      const pipelineError = error instanceof ImportPipelineError ? error : void 0;
      const videoId = pipelineError?.videoId ?? options.videoId;
      const failure = {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
        ...videoId ? { videoId } : {},
        sourcePath: status.sourcePath,
        retry: retryPlan(
          status.sourcePath,
          options.endpoint,
          videoId,
          jobRoot,
          pipelineError?.transcriptionOnly ?? options.transcriptionOnly
        )
      };
      process.stderr.write(`${JSON.stringify(failure)}
`);
    }
    const output = {
      schemaVersion: 1,
      mode: "session-imported",
      count: imports.length,
      agentNext: AGENT_NEXT,
      imports
    };
    const rendered = `${JSON.stringify(output, null, 2)}
`;
    if (options.jsonOut) await writeFile2(resolve4(options.jsonOut), rendered, "utf8");
    else process.stdout.write(rendered);
    return failures > 0 ? 1 : 0;
  } finally {
    await rm3(runDir, { recursive: true, force: true });
  }
}
if (process.argv[1] && fileURLToPath2(import.meta.url) === resolve4(process.argv[1])) {
  process.exitCode = await runUploadMedia();
}
export {
  AGENT_NEXT,
  runUploadMedia
};
