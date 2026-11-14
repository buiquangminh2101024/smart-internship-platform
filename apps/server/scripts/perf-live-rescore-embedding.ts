import { writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import { cpus } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { Worker } from "node:worker_threads";
import { Prisma, PrismaClient } from "@prisma/client";
import { CandidateMatchProfileLoader } from "../src/modules/job-matching/candidate-match-profile.loader";
import { config } from "../src/shared/config/env";

// Bước 0 mục 3 của docs/06-backend/live-rescore/PLAN.md (0.6, AD-27): so cấu hình embedding.
//   A: model trên luồng chính (như server hiện tại);
//   B: model trong worker_threads;
//   C: luồng chính, giới hạn số luồng onnxruntime (intraOpNumThreads).
// Mỗi lần chạy: nạp model, làm nóng, rồi `--runs` lần [rảnh 3 giây → embed `--texts` văn bản hồ sơ].
// Một HTTP server nhỏ trong process này trả JSON; một worker khác gọi nó mỗi 50 ms (như
// /api/health) để đo độ trễ request khi model đang chạy. `monitorEventLoopDelay` đo luồng chính.
// Chỉ ĐỌC văn bản hồ sơ từ DB; không ghi gì. Không in văn bản hồ sơ.
//
//   npm run perf:live-rescore-embedding --workspace server -- --config=A [--batch=16] [--runs=3] [--texts=200] [--out=<file.json>]
//   npm run perf:live-rescore-embedding --workspace server -- --config=B [--threads=N]
//   npm run perf:live-rescore-embedding --workspace server -- --config=C --threads=2
//
// Nên chạy mỗi cấu hình trong một process riêng (thread pool của onnxruntime là theo session,
// nhưng tách process cho số đo sạch), khi máy không làm việc nặng khác.

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, "").split("=");
    return [key ?? "", value ?? "true"] as const;
  }),
);
const mode = (args.get("config") ?? "A").toUpperCase() as "A" | "B" | "C";
const threads = args.has("threads") ? Number(args.get("threads")) : null;
const batch = Number(args.get("batch") ?? 1);
const runs = Number(args.get("runs") ?? 3);
const textCount = Number(args.get("texts") ?? 200);
const outFile = args.get("out");
const IDLE_MS = 3_000;
const PROBE_EVERY_MS = 50;

if (mode === "C" && !threads) throw new Error("Cấu hình C cần --threads=N");
if (mode === "B" && batch !== 1) throw new Error("--batch chỉ dùng với A / C");

const serverRequire = createRequire(join(__dirname, "..", "package.json"));
const transformersUrl = pathToFileURL(serverRequire.resolve("@huggingface/transformers")).href;
const sessionOptions = threads ? { intraOpNumThreads: threads, interOpNumThreads: 1 } : undefined;

const round = (n: number) => Math.round(n * 10) / 10;
const pct = (values: number[], p: number) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))]!;
};

// ─── Văn bản hồ sơ thật (chỉ đọc) ────────────────────────────────────────────

async function loadTexts(): Promise<string[]> {
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT c."id" FROM candidates c
      WHERE EXISTS (SELECT 1 FROM candidate_skills cs WHERE cs."candidateId" = c."id")
      ORDER BY md5(c."id") LIMIT ${textCount}
    `);
    const profiles = await new CandidateMatchProfileLoader({ prisma }).loadMany(rows.map((r) => r.id));
    return [...profiles.values()].map((p) => p.matchText).filter((text) => text.trim() !== "");
  } finally {
    await prisma.$disconnect();
  }
}

// ─── Model: luồng chính (A, C) hoặc worker (B) ────────────────────────────────

type Embedder = { embed(texts: string[]): Promise<number>; close(): Promise<void> };

async function mainThreadEmbedder(): Promise<Embedder> {
  const module = (await import(transformersUrl)) as {
    env: { cacheDir: string | null };
    pipeline: (task: string, model: string, options?: unknown) => Promise<(input: string | string[], o: unknown) => Promise<{ dims: number[] }>>;
  };
  if (config.EMBEDDING_MODEL_CACHE_DIR) module.env.cacheDir = config.EMBEDDING_MODEL_CACHE_DIR;
  const extractor = await module.pipeline(
    "feature-extraction",
    config.EMBEDDING_MODEL_ID,
    sessionOptions ? { session_options: sessionOptions } : undefined,
  );
  return {
    async embed(texts) {
      const output = await extractor(texts.length === 1 ? texts[0]! : texts, { pooling: "mean", normalize: true });
      return output.dims[0] ?? 1;
    },
    async close() {},
  };
}

const MODEL_WORKER = `
const { parentPort, workerData } = require("node:worker_threads");
(async () => {
  const m = await import(workerData.transformersUrl);
  if (workerData.cacheDir) m.env.cacheDir = workerData.cacheDir;
  const extractor = await m.pipeline("feature-extraction", workerData.modelId,
    workerData.sessionOptions ? { session_options: workerData.sessionOptions } : undefined);
  parentPort.postMessage({ type: "ready" });
  parentPort.on("message", async (msg) => {
    const out = await extractor(msg.texts.length === 1 ? msg.texts[0] : msg.texts, { pooling: "mean", normalize: true });
    // Gửi vector về như server thật sẽ cần (384 số mỗi văn bản).
    parentPort.postMessage({ type: "done", id: msg.id, data: Array.from(out.data) });
  });
})().catch((e) => parentPort.postMessage({ type: "error", message: String(e && e.stack || e) }));
`;

async function workerEmbedder(): Promise<Embedder> {
  const worker = new Worker(MODEL_WORKER, {
    eval: true,
    workerData: { transformersUrl, modelId: config.EMBEDDING_MODEL_ID, cacheDir: config.EMBEDDING_MODEL_CACHE_DIR, sessionOptions },
  });
  const pending = new Map<number, (n: number) => void>();
  let nextId = 0;
  await new Promise<void>((resolve, reject) => {
    worker.on("message", (msg: { type: string; id?: number; data?: number[]; message?: string }) => {
      if (msg.type === "ready") resolve();
      else if (msg.type === "error") reject(new Error(msg.message));
      else if (msg.type === "done") {
        pending.get(msg.id!)?.((msg.data?.length ?? 0) / 384);
        pending.delete(msg.id!);
      }
    });
    worker.on("error", reject);
  });
  return {
    embed(texts) {
      const id = nextId++;
      return new Promise((resolve) => {
        pending.set(id, resolve);
        worker.postMessage({ id, texts });
      });
    },
    async close() {
      await worker.terminate();
    },
  };
}

// ─── Đầu dò HTTP: server ở luồng chính, client ở worker riêng ─────────────────

const PROBE_WORKER = `
const { parentPort, workerData } = require("node:worker_threads");
const http = require("node:http");
const agent = new http.Agent({ keepAlive: true, maxSockets: 4 });
const samples = [];
let running = true;
function probe() {
  if (!running) return;
  const start = Date.now();
  const t0 = process.hrtime.bigint();
  const req = http.get({ host: "127.0.0.1", port: workerData.port, path: "/health", agent }, (res) => {
    res.resume();
    res.on("end", () => samples.push([start, Number(process.hrtime.bigint() - t0) / 1e6]));
  });
  req.on("error", () => samples.push([start, -1]));
  setTimeout(probe, workerData.everyMs);
}
probe();
parentPort.on("message", (msg) => {
  if (msg === "collect") { running = false; setTimeout(() => parentPort.postMessage(samples), 2000); }
});
`;

async function startProbe(): Promise<{ server: Server; collect: () => Promise<Array<[number, number]>> }> {
  const server = createServer((_req, res) => {
    res.setHeader("content-type", "application/json");
    res.end('{"status":"ok"}');
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const worker = new Worker(PROBE_WORKER, { eval: true, workerData: { port, everyMs: PROBE_EVERY_MS } });
  return {
    server,
    collect: () =>
      new Promise((resolve) => {
        worker.once("message", async (samples: Array<[number, number]>) => {
          await worker.terminate();
          resolve(samples);
        });
        worker.postMessage("collect");
      }),
  };
}

// ─── Chạy ─────────────────────────────────────────────────────────────────────

interface Phase {
  kind: "idle" | "load";
  run: number;
  from: number;
  to: number;
  eld: { p50: number; p99: number; max: number };
  totalMs?: number;
}

async function main(): Promise<void> {
  const label = `${mode}${threads ? `-t${threads}` : ""}${batch > 1 ? `-b${batch}` : ""}`;
  console.log(`Cấu hình ${label}: ${cpus().length} luồng CPU logic; model ${config.EMBEDDING_MODEL_ID}`);
  const texts = await loadTexts();
  console.log(`Đã đọc ${texts.length} văn bản hồ sơ (độ dài trung vị ${pct(texts.map((t) => t.length), 50)} ký tự).`);

  const loadStart = performance.now();
  const embedder = mode === "B" ? await workerEmbedder() : await mainThreadEmbedder();
  console.log(`Nạp model: ${round(performance.now() - loadStart)} ms`);
  for (const text of texts.slice(0, 5)) await embedder.embed([text]); // làm nóng

  const probe = await startProbe();
  const histogram = monitorEventLoopDelay({ resolution: 10 });
  const phases: Phase[] = [];
  const eldNow = () => ({
    p50: round(histogram.percentile(50) / 1e6),
    p99: round(histogram.percentile(99) / 1e6),
    max: round(histogram.max / 1e6),
  });

  for (let run = 1; run <= runs; run += 1) {
    histogram.reset();
    histogram.enable();
    let from = Date.now();
    await new Promise((resolve) => setTimeout(resolve, IDLE_MS));
    histogram.disable();
    phases.push({ kind: "idle", run, from, to: Date.now(), eld: eldNow() });

    histogram.reset();
    histogram.enable();
    from = Date.now();
    const start = performance.now();
    let embedded = 0;
    for (let i = 0; i < texts.length; i += batch) embedded += await embedder.embed(texts.slice(i, i + batch));
    const totalMs = performance.now() - start;
    histogram.disable();
    phases.push({ kind: "load", run, from, to: Date.now(), eld: eldNow(), totalMs: round(totalMs) });
    console.log(`  lần ${run}: ${embedded} văn bản trong ${round(totalMs)} ms (${round(totalMs / embedded)} ms / văn bản)`);
  }

  const samples = await probe.collect();
  probe.server.close();
  await embedder.close();

  const latency = (phase: Phase) => samples.filter(([at]) => at >= phase.from && at <= phase.to).map(([, ms]) => ms).filter((ms) => ms >= 0);
  const summarize = (kind: Phase["kind"]) => {
    const ps = phases.filter((p) => p.kind === kind);
    const lat = ps.flatMap(latency);
    return {
      totalMs: kind === "load" ? round(pct(ps.map((p) => p.totalMs!), 50)) : undefined,
      eldP50: round(pct(ps.map((p) => p.eld.p50), 50)),
      eldP99: round(pct(ps.map((p) => p.eld.p99), 50)),
      eldMax: round(Math.max(...ps.map((p) => p.eld.max))),
      httpP50: round(pct(lat, 50)),
      httpP95: round(pct(lat, 95)),
      httpMax: round(lat.length ? Math.max(...lat) : 0),
      httpSamples: lat.length,
    };
  };
  const idle = summarize("idle");
  const load = summarize("load");
  console.log(
    `KẾT QUẢ ${label}: tổng ${load.totalMs} ms / ${texts.length} văn bản (trung vị ${runs} lần) · ` +
      `event loop p50 ${load.eldP50} / p99 ${load.eldP99} / max ${load.eldMax} ms · ` +
      `HTTP p50 ${load.httpP50} / p95 ${load.httpP95} / max ${load.httpMax} ms ` +
      `(lúc rảnh: p50 ${idle.httpP50} / p95 ${idle.httpP95} ms; event loop p99 ${idle.eldP99} ms)`,
  );
  if (outFile) {
    writeFileSync(outFile, JSON.stringify({ label, cpus: cpus().length, texts: texts.length, runs, idle, load, phases }, null, 2));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
