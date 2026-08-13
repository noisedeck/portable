#!/usr/bin/env node
// src/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// src/config.ts
import { resolve } from "path";
var VALID_BACKENDS = ["webgl2", "webgpu"];
function parseCount(value, fallback) {
  const parsed = parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function parseDuration(value, fallback) {
  const parsed = parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
function parseBackend(value) {
  if (value && VALID_BACKENDS.includes(value)) {
    return value;
  }
  return "webgl2";
}
function getConfig() {
  const projectRoot = process.env.SHADE_PROJECT_ROOT || process.cwd();
  return {
    effectsDir: process.env.SHADE_EFFECTS_DIR || resolve(projectRoot, "effects"),
    viewerPort: parseCount(process.env.SHADE_VIEWER_PORT, 0),
    defaultBackend: parseBackend(process.env.SHADE_BACKEND),
    projectRoot,
    globalsPrefix: process.env.SHADE_GLOBALS_PREFIX || void 0,
    viewerPath: process.env.SHADE_VIEWER_PATH || void 0,
    maxBrowsers: parseCount(process.env.SHADE_MAX_BROWSERS, 1),
    timeoutMs: parseDuration(process.env.SHADE_TIMEOUT_MS, 12e4),
    aiTimeoutMs: parseDuration(process.env.SHADE_AI_TIMEOUT_MS, 12e4),
    aiModel: process.env.SHADE_AI_MODEL || void 0
  };
}

// src/harness/browser-queue.ts
var maxConcurrency = 1;
var waiting = [];
var active = 0;
function setMaxBrowsers(n) {
  maxConcurrency = Number.isFinite(n) ? Math.max(1, Math.floor(n)) : 1;
}
async function acquireBrowserSlot() {
  if (active < maxConcurrency) {
    active++;
    return;
  }
  await new Promise((resolve4) => {
    waiting.push(resolve4);
  });
}
function releaseBrowserSlot() {
  if (waiting.length > 0) {
    const next = waiting.shift();
    next();
  } else {
    active = Math.max(0, active - 1);
  }
}

// src/tools/browser/compile.ts
import { z } from "zod";

// src/harness/browser-session.ts
import { chromium } from "playwright";
import { resolve as resolve2 } from "path";

// src/harness/types.ts
var DEFAULT_GLOBALS = {
  canvasRenderer: "__shadeCanvasRenderer",
  renderingPipeline: "__shadeRenderingPipeline",
  currentBackend: "__shadeCurrentBackend",
  currentEffect: "__shadeCurrentEffect",
  setPaused: "__shadeSetPaused",
  setPausedTime: "__shadeSetPausedTime",
  frameCount: "__shadeFrameCount"
};
function globalsFromPrefix(prefix) {
  return {
    canvasRenderer: `${prefix}CanvasRenderer`,
    renderingPipeline: `${prefix}RenderingPipeline`,
    currentBackend: `${prefix}CurrentBackend`,
    currentEffect: `${prefix}CurrentEffect`,
    setPaused: `${prefix}SetPaused`,
    setPausedTime: `${prefix}SetPausedTime`,
    frameCount: `${prefix}FrameCount`
  };
}

// src/harness/server-manager.ts
import { createServer } from "http";
import { createReadStream, existsSync, realpathSync } from "fs";
import { extname, join, resolve as pathResolve, normalize, basename, relative, sep } from "path";
var httpServer = null;
var refCount = 0;
var activePort = 0;
var requestedPort = 0;
var MIME_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".json": "application/json",
  ".css": "text/css",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".wasm": "application/wasm",
  ".map": "application/json",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".xml": "application/xml",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".bin": "application/octet-stream",
  ".data": "application/octet-stream",
  ".glsl": "text/plain",
  ".wgsl": "text/plain",
  ".frag": "text/plain",
  ".vert": "text/plain",
  ".comp": "text/plain"
};
function safePath(root, relPath) {
  const rootResolved = pathResolve(root);
  const resolved = pathResolve(rootResolved, normalize(relPath));
  if (resolved !== rootResolved && !resolved.startsWith(rootResolved + sep)) return null;
  const rel = relative(rootResolved, resolved);
  if (rel && rel.split(sep).some((segment) => segment.startsWith("."))) return null;
  try {
    const realRoot = realpathSync(rootResolved);
    const realTarget = realpathSync(resolved);
    if (realTarget !== realRoot && !realTarget.startsWith(realRoot + sep)) return null;
  } catch {
  }
  return resolved;
}
function serveFile(filePath, res) {
  const ext = extname(filePath).toLowerCase();
  const mime = MIME_TYPES[ext] || "application/octet-stream";
  const stream = createReadStream(filePath);
  stream.on("error", (err) => {
    if (!res.headersSent) {
      const status = err.code === "ENOENT" ? 404 : 500;
      res.writeHead(status);
    }
    res.end();
  });
  stream.on("open", () => {
    res.writeHead(200, {
      "Content-Type": mime,
      "Cache-Control": "no-store"
    });
    stream.pipe(res);
  });
}
async function acquireServer(port, viewerRoot, effectsDir) {
  if (refCount > 0) {
    if (port !== requestedPort) {
      throw new Error(`Server already running on port ${activePort} (requested ${requestedPort}), cannot switch to ${port}`);
    }
    refCount++;
    return getServerUrl();
  }
  requestedPort = port;
  const isFlatLayout = existsSync(join(effectsDir, "definition.json")) || existsSync(join(effectsDir, "definition.js"));
  const flatEffectName = isFlatLayout ? basename(effectsDir) : null;
  const route = (req, res) => {
    let url;
    try {
      const parsedUrl = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
      url = decodeURIComponent(parsedUrl.pathname);
    } catch {
      res.writeHead(400);
      res.end("Bad Request");
      return;
    }
    if (url.startsWith("/effects/")) {
      const relPath2 = url.slice("/effects/".length);
      if (flatEffectName && relPath2.startsWith(flatEffectName + "/")) {
        const innerPath = relPath2.slice(flatEffectName.length + 1);
        const filePath3 = safePath(effectsDir, innerPath);
        if (!filePath3) {
          res.writeHead(403);
          res.end("Forbidden");
          return;
        }
        serveFile(filePath3, res);
        return;
      }
      const filePath2 = safePath(effectsDir, relPath2);
      if (!filePath2) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }
      serveFile(filePath2, res);
      return;
    }
    let relPath = url === "/" ? "index.html" : url.slice(1);
    if (relPath.endsWith("/")) {
      relPath += "index.html";
    }
    const filePath = safePath(viewerRoot, relPath);
    if (!filePath) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    serveFile(filePath, res);
  };
  httpServer = createServer((req, res) => {
    try {
      route(req, res);
    } catch {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  });
  httpServer.on("clientError", (_err, socket) => {
    if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
    else socket.destroy();
  });
  await new Promise((resolve4, reject) => {
    httpServer.listen(port, "127.0.0.1", () => {
      const addr = httpServer.address();
      activePort = typeof addr === "object" && addr ? addr.port : port;
      resolve4();
    });
    httpServer.on("error", reject);
  });
  refCount = 1;
  return getServerUrl();
}
function releaseServer() {
  if (refCount <= 0) return;
  refCount--;
  if (refCount === 0 && httpServer) {
    httpServer.close();
    httpServer = null;
    activePort = 0;
    requestedPort = 0;
  }
}
function getServerUrl() {
  return `http://127.0.0.1:${activePort}`;
}

// src/harness/live-sessions.ts
var live = /* @__PURE__ */ new Set();
function trackSession(session) {
  live.add(session);
}
function untrackSession(session) {
  live.delete(session);
}
async function closeAllSessions() {
  const sessions = [...live];
  live.clear();
  await Promise.all(sessions.map((session) => session.teardown().catch(() => {
  })));
}

// src/harness/browser-session.ts
function getBrowserLaunchOptions(headless, backend) {
  const args = ["--disable-gpu-sandbox"];
  if (backend === "webgpu") {
    args.push(
      "--enable-unsafe-webgpu",
      "--enable-features=Vulkan",
      "--enable-webgpu-developer-features",
      process.platform === "darwin" ? "--use-angle=metal" : "--use-angle=vulkan"
    );
  } else {
    if (process.platform === "darwin") {
      args.push("--use-angle=metal");
    }
  }
  if (process.env.SHADE_SWIFTSHADER === "1" || process.env.SHADE_SWIFTSHADER === "true") {
    args.push("--enable-unsafe-swiftshader");
  }
  return { headless, args };
}
var BrowserSession = class {
  options;
  viewerPath;
  /** Ceiling for every page operation this session performs. */
  timeoutMs;
  browser = null;
  context = null;
  page = null;
  globals;
  baseUrl = "";
  consoleMessages = [];
  _isSetup = false;
  _serverAcquired = false;
  _slotAcquired = false;
  constructor(opts) {
    const config2 = getConfig();
    this.globals = opts.globals ?? (config2.globalsPrefix ? globalsFromPrefix(config2.globalsPrefix) : DEFAULT_GLOBALS);
    this.viewerPath = opts.viewerPath ?? config2.viewerPath ?? "/";
    this.timeoutMs = opts.timeoutMs ?? config2.timeoutMs;
    this.options = {
      backend: opts.backend,
      // Headless by default: a visible window on every tool call is noise, and
      // launching headed fails outright wherever there is no display. Opt back
      // in with { headless: false } or SHADE_HEADLESS=0.
      headless: opts.headless ?? !(process.env.SHADE_HEADLESS === "0" || process.env.SHADE_HEADLESS === "false"),
      viewerPort: opts.viewerPort ?? config2.viewerPort,
      viewerRoot: opts.viewerRoot ?? process.env.SHADE_VIEWER_ROOT ?? resolve2(config2.projectRoot, "viewer"),
      effectsDir: opts.effectsDir ?? config2.effectsDir
    };
  }
  async setup() {
    if (this._isSetup) throw new Error("Session already set up. Call teardown() first.");
    await acquireBrowserSlot();
    this._slotAcquired = true;
    try {
      this.baseUrl = await acquireServer(this.options.viewerPort, this.options.viewerRoot, this.options.effectsDir);
      this._serverAcquired = true;
      this.browser = await chromium.launch(
        getBrowserLaunchOptions(this.options.headless, this.options.backend)
      );
      const viewportSize = process.env.CI ? { width: 256, height: 256 } : { width: 1280, height: 720 };
      this.context = await this.browser.newContext({
        viewport: viewportSize,
        ignoreHTTPSErrors: true
      });
      this.page = await this.context.newPage();
      this.page.setDefaultTimeout(this.timeoutMs);
      this.page.setDefaultNavigationTimeout(this.timeoutMs);
      this.consoleMessages = [];
      this.page.on("console", (msg) => {
        const text = msg.text();
        if (text.includes("Error") || text.includes("error") || text.includes("warning") || text.includes("[compileEffect]") || text.includes("[expand]") || text.includes("[Pipeline") || text.includes("[MCP-UNIFORM]") || msg.type() === "error" || msg.type() === "warning") {
          this.consoleMessages.push({ type: msg.type(), text });
        }
      });
      this.page.on("pageerror", (error) => {
        this.consoleMessages.push({ type: "pageerror", text: error.message });
      });
      await this.page.goto(`${this.baseUrl}${this.viewerPath}`, { waitUntil: "networkidle" });
      const rendererGlobal = this.globals.canvasRenderer;
      await this.page.waitForFunction(
        (name) => !!window[name],
        rendererGlobal,
        { timeout: this.timeoutMs }
      );
      this._isSetup = true;
      trackSession(this);
    } catch (err) {
      if (this.page) await this.page.close().catch(() => {
      });
      if (this.context) await this.context.close().catch(() => {
      });
      if (this.browser) await this.browser.close().catch(() => {
      });
      this.page = null;
      this.context = null;
      this.browser = null;
      this.releaseShared();
      throw err;
    }
  }
  /**
   * Hands back the server ref and browser slot exactly once. Tools call
   * teardown() from a finally block that also runs after a failed setup, so
   * releasing unconditionally would hand back another session's resources.
   */
  releaseShared() {
    if (this._serverAcquired) {
      releaseServer();
      this._serverAcquired = false;
    }
    if (this._slotAcquired) {
      releaseBrowserSlot();
      this._slotAcquired = false;
    }
  }
  async teardown() {
    if (this.page) {
      await this.page.close().catch(() => {
      });
      this.page = null;
    }
    if (this.context) {
      await this.context.close().catch(() => {
      });
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close().catch(() => {
      });
      this.browser = null;
    }
    this.releaseShared();
    untrackSession(this);
    this.consoleMessages = [];
    this._isSetup = false;
  }
  async setBackend(backend) {
    const targetBackend = backend === "webgpu" ? "wgsl" : "glsl";
    await this.page.evaluate(async ({ targetBackend: targetBackend2, timeout, globals }) => {
      const w = window;
      const current = typeof w[globals.currentBackend] === "function" ? w[globals.currentBackend]() : "glsl";
      if (current === targetBackend2) return;
      const renderer = w[globals.canvasRenderer];
      if (renderer && typeof renderer.switchBackend === "function") {
        await renderer.switchBackend(targetBackend2);
      } else {
        const btn = document.querySelector(`button[data-backend="${targetBackend2}"]`);
        if (btn) {
          btn.click();
        } else {
          const radio = document.querySelector(`input[name="backend"][value="${targetBackend2}"]`);
          if (radio) radio.click();
        }
      }
      const start = Date.now();
      while (Date.now() - start < timeout) {
        const nowBackend = typeof w[globals.currentBackend] === "function" ? w[globals.currentBackend]() : "glsl";
        if (nowBackend === targetBackend2) break;
        await new Promise((r) => setTimeout(r, 50));
      }
    }, { targetBackend, timeout: this.timeoutMs, globals: this.globals });
  }
  clearConsoleMessages() {
    this.consoleMessages = [];
  }
  getConsoleMessages() {
    return this.consoleMessages;
  }
  async runWithConsoleCapture(fn) {
    this.clearConsoleMessages();
    const result = await fn();
    if (this.consoleMessages.length > 0) {
      result.console_errors = this.consoleMessages.map((m) => m.text);
    }
    return result;
  }
  get backend() {
    return this.options.backend;
  }
  async selectEffect(effectId) {
    await this.page.evaluate((id) => {
      const select = document.getElementById("effect-select");
      if (select) {
        select.value = id;
        select.dispatchEvent(new Event("change"));
      }
    }, effectId);
  }
  async getEffectGlobals() {
    return await this.page.evaluate((globals) => {
      const effect = window[globals.currentEffect];
      if (!effect?.instance?.globals) return {};
      return effect.instance.globals;
    }, this.globals);
  }
  async resetUniformsToDefaults() {
    await this.page.evaluate((globals) => {
      const w = window;
      const pipeline = w[globals.renderingPipeline];
      const effect = w[globals.currentEffect];
      if (!pipeline || !effect?.instance?.globals) return;
      for (const spec of Object.values(effect.instance.globals)) {
        if (!spec.uniform) continue;
        const val = spec.default ?? spec.min ?? 0;
        if (pipeline.setUniform) {
          pipeline.setUniform(spec.uniform, val);
        } else if (pipeline.globalUniforms) {
          pipeline.globalUniforms[spec.uniform] = val;
        }
      }
    }, this.globals);
  }
};

// src/tools/resolve-effects.ts
import { readdirSync, existsSync as existsSync2, statSync } from "fs";
import { join as join2, basename as basename2, resolve as resolve3, isAbsolute, sep as sep2 } from "path";
function resolveEffectIds(args, effectsDir) {
  if (args.effects) {
    return args.effects.split(",").map((s) => s.trim()).filter(Boolean);
  }
  if (args.effect_id) {
    return [args.effect_id];
  }
  if (!existsSync2(effectsDir)) {
    throw new Error(`Effects directory not found: ${effectsDir}. Specify effect_id or set SHADE_EFFECTS_DIR.`);
  }
  if (existsSync2(join2(effectsDir, "definition.json")) || existsSync2(join2(effectsDir, "definition.js"))) {
    const dirName = basename2(effectsDir) || "effect";
    console.warn(`[shade-mcp] Auto-detected flat effect layout: ${dirName}`);
    return [dirName];
  }
  const found = [];
  try {
    const namespaces = readdirSync(effectsDir).filter((n) => !n.startsWith("."));
    for (const ns of namespaces) {
      const nsDir = join2(effectsDir, ns);
      if (!statSync(nsDir).isDirectory()) continue;
      const effects = readdirSync(nsDir).filter((n) => !n.startsWith("."));
      for (const effect of effects) {
        const effectDir = join2(nsDir, effect);
        if (!statSync(effectDir).isDirectory()) continue;
        if (existsSync2(join2(effectDir, "definition.json")) || existsSync2(join2(effectDir, "definition.js"))) {
          found.push(`${ns}/${effect}`);
        }
      }
    }
  } catch (err) {
    throw new Error(`Failed to scan effects directory: ${effectsDir}`, { cause: err });
  }
  if (found.length === 0) {
    throw new Error(`No effects found in ${effectsDir}. Specify effect_id.`);
  }
  if (found.length === 1) {
    console.warn(`[shade-mcp] Auto-detected single effect: ${found[0]}`);
    return found;
  }
  throw new Error(
    `Multiple effects found (${found.length}). Please specify effect_id or effects parameter. Available: ${found.slice(0, 10).join(", ")}${found.length > 10 ? "..." : ""}`
  );
}
function resolveEffectDir(effectId, effectsDir) {
  const dirName = basename2(effectsDir) || "effect";
  if (effectId === dirName && (existsSync2(join2(effectsDir, "definition.json")) || existsSync2(join2(effectsDir, "definition.js")))) {
    return effectsDir;
  }
  const segments = effectId.split("/");
  if (isAbsolute(effectId) || segments.some((s) => s === ".." || s === ".")) {
    throw new Error(`Invalid effect id: ${effectId}`);
  }
  const root = resolve3(effectsDir);
  const target = resolve3(effectsDir, ...segments);
  if (target !== root && !target.startsWith(root + sep2)) {
    throw new Error(`Invalid effect id: ${effectId}`);
  }
  return join2(effectsDir, ...segments);
}

// src/tools/tool-result.ts
function toolResult(payload) {
  const failed = !Array.isArray(payload) && typeof payload === "object" && payload !== null && (payload.status === "error" || typeof payload.error === "string");
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    ...failed ? { isError: true } : {}
  };
}

// src/tools/browser/compile.ts
var compileEffectSchema = {
  effect_id: z.string().optional().describe('Single effect ID (e.g., "synth/noise")'),
  effects: z.string().optional().describe("CSV of effect IDs"),
  backend: z.enum(["webgl2", "webgpu"]).default("webgl2").describe("Rendering backend")
};
async function compileEffect(session, effectId) {
  return session.runWithConsoleCapture(async () => {
    const page = session.page;
    await session.setBackend(session.backend);
    await page.evaluate((id) => {
      const select = document.getElementById("effect-select");
      if (select) {
        select.value = id;
        select.dispatchEvent(new Event("change"));
      }
    }, effectId);
    const result = await page.evaluate(({ timeout, globals }) => {
      return new Promise((resolve4) => {
        const start = Date.now();
        const poll = () => {
          const status = document.getElementById("status");
          const text = (status?.textContent || "").toLowerCase();
          const pipeline = window[globals.renderingPipeline];
          if (text.includes("error") || text.includes("failed")) {
            const passes = pipeline?.graph?.passes?.map((p, i) => ({
              id: p.name || `pass_${i}`,
              status: "error"
            })) || [];
            resolve4({ status: "error", passes, message: status?.textContent || "Compilation failed" });
            return;
          }
          if (text.includes("loaded") || text.includes("compiled") || text.includes("ready")) {
            const passes = pipeline?.graph?.passes?.map((p, i) => ({
              id: p.name || `pass_${i}`,
              status: "ok"
            })) || [{ id: "main", status: "ok" }];
            resolve4({ status: "ok", passes, message: "Compiled successfully" });
            return;
          }
          if (Date.now() - start > timeout) {
            resolve4({ status: "error", passes: [], message: "Compile timeout" });
            return;
          }
          setTimeout(poll, 50);
        };
        poll();
      });
    }, { timeout: session.timeoutMs, globals: session.globals });
    return { ...result, backend: session.backend };
  });
}
function registerCompileEffect(server2) {
  server2.tool(
    "compileEffect",
    "Compile shader effect and return pass-level diagnostics. Supports glob/CSV batch.",
    compileEffectSchema,
    async (args) => {
      const config2 = getConfig();
      const session = new BrowserSession({ backend: args.backend });
      try {
        await session.setup();
        const effectIds = resolveEffectIds(args, config2.effectsDir);
        const results = [];
        for (const id of effectIds) {
          try {
            results.push({ effect_id: id, ...await compileEffect(session, id) });
          } catch (err) {
            results.push({ effect_id: id, status: "error", error: err instanceof Error ? err.message : String(err) });
          }
        }
        return toolResult(results.length === 1 ? results[0] : results);
      } finally {
        await session.teardown();
      }
    }
  );
}

// src/tools/browser/render.ts
import { z as z2 } from "zod";
var renderEffectFrameSchema = {
  effect_id: z2.string().optional().describe('Single effect ID (e.g., "synth/noise")'),
  effects: z2.string().optional().describe("CSV of effect IDs"),
  backend: z2.enum(["webgl2", "webgpu"]).default("webgl2").describe("Rendering backend"),
  warmup_frames: z2.number().optional().default(10).describe("Frames to wait before capture"),
  capture_image: z2.boolean().optional().default(false).describe("Capture PNG data URI"),
  uniforms: z2.record(z2.string(), z2.number()).optional().describe("Uniform overrides"),
  time: z2.number().optional().describe("Pause and render at specific time value (seconds)"),
  resolution: z2.tuple([z2.number(), z2.number()]).optional().describe("Viewport resolution [width, height]")
};
async function renderEffectFrame(session, effectId, options = {}) {
  return session.runWithConsoleCapture(async () => {
    const page = session.page;
    await session.setBackend(session.backend);
    if (options.resolution) {
      await page.setViewportSize({ width: options.resolution[0], height: options.resolution[1] });
    }
    await page.evaluate((id) => {
      const select = document.getElementById("effect-select");
      if (select) {
        select.value = id;
        select.dispatchEvent(new Event("change"));
      }
    }, effectId);
    await page.waitForFunction(() => {
      const s = document.getElementById("status");
      const t = (s?.textContent || "").toLowerCase();
      return t.includes("loaded") || t.includes("compiled") || t.includes("ready") || t.includes("error");
    }, { timeout: session.timeoutMs });
    if (options.uniforms) {
      await page.evaluate(({ unis, globals }) => {
        const pipeline = window[globals.renderingPipeline];
        if (!pipeline) return;
        for (const [k, v] of Object.entries(unis)) {
          if (pipeline.setUniform) pipeline.setUniform(k, v);
          else if (pipeline.globalUniforms) pipeline.globalUniforms[k] = v;
        }
      }, { unis: options.uniforms, globals: session.globals });
    }
    if (options.time !== void 0) {
      await page.evaluate(({ time, globals }) => {
        const w = window;
        if (w[globals.setPaused]) w[globals.setPaused](true);
        if (w[globals.setPausedTime]) w[globals.setPausedTime](time);
      }, { time: options.time, globals: session.globals });
    }
    const warmup = options.warmupFrames ?? 10;
    await page.evaluate(({ frames, globals }) => {
      return new Promise((resolve4) => {
        const start = window[globals.frameCount] || 0;
        const poll = () => {
          const current = window[globals.frameCount] || 0;
          if (current - start >= frames) resolve4();
          else requestAnimationFrame(poll);
        };
        poll();
      });
    }, { frames: warmup, globals: session.globals });
    const result = await page.evaluate(({ captureImage, globals }) => {
      const renderer = window[globals.canvasRenderer];
      const pipeline = window[globals.renderingPipeline];
      if (!renderer || !pipeline) return { status: "error", backend: "unknown", error: "No renderer" };
      const canvas = renderer.canvas;
      const gl = pipeline.backend?.gl;
      let pixels = null;
      let width = canvas.width, height = canvas.height;
      if (gl) {
        pixels = new Uint8Array(width * height * 4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      }
      if (!pixels) return { status: "error", backend: "unknown", error: "Failed to read pixels" };
      const pixelCount = width * height;
      const stride = Math.max(1, Math.floor(pixelCount / 1e3));
      let sumR = 0, sumG = 0, sumB = 0, sumA = 0;
      let sumR2 = 0, sumG2 = 0, sumB2 = 0;
      let samples = 0;
      const colorSet = /* @__PURE__ */ new Set();
      for (let i = 0; i < pixelCount; i += stride) {
        const idx = i * 4;
        const r = pixels[idx] / 255, g = pixels[idx + 1] / 255, b = pixels[idx + 2] / 255, a = pixels[idx + 3] / 255;
        sumR += r;
        sumG += g;
        sumB += b;
        sumA += a;
        sumR2 += r * r;
        sumG2 += g * g;
        sumB2 += b * b;
        colorSet.add(`${pixels[idx]},${pixels[idx + 1]},${pixels[idx + 2]}`);
        samples++;
      }
      const meanR = sumR / samples, meanG = sumG / samples, meanB = sumB / samples;
      const stdR = Math.sqrt(sumR2 / samples - meanR * meanR);
      const stdG = Math.sqrt(sumG2 / samples - meanG * meanG);
      const stdB = Math.sqrt(sumB2 / samples - meanB * meanB);
      const luma = 0.299 * meanR + 0.587 * meanG + 0.114 * meanB;
      let lumaVar = 0;
      for (let i = 0; i < pixelCount; i += stride) {
        const idx = i * 4;
        const l = 0.299 * pixels[idx] / 255 + 0.587 * pixels[idx + 1] / 255 + 0.114 * pixels[idx + 2] / 255;
        lumaVar += (l - luma) * (l - luma);
      }
      lumaVar /= samples;
      const isAllZero = meanR === 0 && meanG === 0 && meanB === 0;
      const isAllTransparent = sumA / samples < 0.01;
      const isBlank = lumaVar < 1e-4;
      const isMono = colorSet.size <= 1;
      let imageUri = null;
      if (captureImage) {
        const tmpCanvas = document.createElement("canvas");
        tmpCanvas.width = width;
        tmpCanvas.height = height;
        const ctx = tmpCanvas.getContext("2d");
        const imgData = ctx.createImageData(width, height);
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const srcIdx = ((height - 1 - y) * width + x) * 4;
            const dstIdx = (y * width + x) * 4;
            imgData.data[dstIdx] = pixels[srcIdx];
            imgData.data[dstIdx + 1] = pixels[srcIdx + 1];
            imgData.data[dstIdx + 2] = pixels[srcIdx + 2];
            imgData.data[dstIdx + 3] = pixels[srcIdx + 3];
          }
        }
        ctx.putImageData(imgData, 0, 0);
        imageUri = tmpCanvas.toDataURL("image/png");
      }
      return {
        status: "ok",
        backend: pipeline.backend?.getName?.() || "unknown",
        frame: { image_uri: imageUri, width, height },
        metrics: {
          mean_rgb: [meanR, meanG, meanB],
          mean_alpha: sumA / samples,
          std_rgb: [stdR, stdG, stdB],
          luma_variance: lumaVar,
          unique_sampled_colors: colorSet.size,
          is_all_zero: isAllZero,
          is_all_transparent: isAllTransparent,
          is_essentially_blank: isBlank,
          is_monochrome: isMono
        }
      };
    }, { captureImage: options.captureImage ?? false, globals: session.globals });
    if (options.time !== void 0) {
      await page.evaluate((globals) => {
        const w = window;
        if (w[globals.setPaused]) w[globals.setPaused](false);
      }, session.globals);
    }
    return result;
  });
}
function registerRenderEffectFrame(server2) {
  server2.tool(
    "renderEffectFrame",
    "Render single frame, compute image metrics (mean RGB, variance, monochrome/blank detection), optional PNG capture.",
    renderEffectFrameSchema,
    async (args) => {
      const config2 = getConfig();
      const effectIds = resolveEffectIds(args, config2.effectsDir);
      const session = new BrowserSession({ backend: args.backend });
      try {
        await session.setup();
        const results = [];
        for (const id of effectIds) {
          try {
            results.push({ effect_id: id, ...await renderEffectFrame(session, id, {
              warmupFrames: args.warmup_frames,
              captureImage: args.capture_image,
              uniforms: args.uniforms,
              time: args.time,
              resolution: args.resolution
            }) });
          } catch (err) {
            results.push({ effect_id: id, status: "error", error: err instanceof Error ? err.message : String(err) });
          }
        }
        return toolResult(results.length === 1 ? results[0] : results);
      } finally {
        await session.teardown();
      }
    }
  );
}

// src/tools/browser/describe.ts
import { z as z3 } from "zod";

// src/ai/provider.ts
import { readFileSync } from "fs";
import { join as join3 } from "path";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
var DEFAULT_ANTHROPIC_MODEL = "claude-opus-5";
var DEFAULT_OPENAI_MODEL = "gpt-5.2";
var DEFAULT_MAX_TOKENS = 2e3;
function aiClientOptions() {
  return { timeout: getConfig().aiTimeoutMs, maxRetries: 1 };
}
function readKeyFile(projectRoot, filename) {
  try {
    const key = readFileSync(join3(projectRoot, filename), "utf-8").trim();
    return key || null;
  } catch {
    return null;
  }
}
function getAIProvider(options) {
  const model = getConfig().aiModel;
  const anthropicEnv = process.env.ANTHROPIC_API_KEY;
  if (anthropicEnv) {
    return { provider: "anthropic", apiKey: anthropicEnv, model: model ?? DEFAULT_ANTHROPIC_MODEL };
  }
  const openaiEnv = process.env.OPENAI_API_KEY;
  if (openaiEnv) {
    return { provider: "openai", apiKey: openaiEnv, model: model ?? DEFAULT_OPENAI_MODEL };
  }
  const anthropicKey = readKeyFile(options.projectRoot, ".anthropic");
  if (anthropicKey) {
    return { provider: "anthropic", apiKey: anthropicKey, model: model ?? DEFAULT_ANTHROPIC_MODEL };
  }
  const openaiKey = readKeyFile(options.projectRoot, ".openai");
  if (openaiKey) {
    return { provider: "openai", apiKey: openaiKey, model: model ?? DEFAULT_OPENAI_MODEL };
  }
  return null;
}
async function callAI(options) {
  if (options.ai.provider === "anthropic") {
    return callAnthropic(options);
  }
  return callOpenAI(options);
}
async function callAnthropic(options) {
  const client = new Anthropic({ apiKey: options.ai.apiKey, ...aiClientOptions() });
  const content = options.userContent.map((block) => {
    if (block.type === "image_url" && block.image_url) {
      const url = block.image_url.url;
      const match = url.match(/^data:(image\/\w+);base64,(.+)$/);
      if (match) {
        return {
          type: "image",
          source: { type: "base64", media_type: match[1], data: match[2] }
        };
      }
    }
    return { type: "text", text: block.text || "" };
  });
  let system = options.system;
  if (options.jsonMode) {
    system += "\n\nIMPORTANT: Respond with valid JSON only. No markdown, no explanation.";
  }
  const response = await client.messages.create({
    model: options.ai.model,
    max_tokens: options.maxTokens || DEFAULT_MAX_TOKENS,
    system,
    messages: [{ role: "user", content }]
  });
  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock && "text" in textBlock ? textBlock.text : null;
}
async function callOpenAI(options) {
  const client = new OpenAI({ apiKey: options.ai.apiKey, ...aiClientOptions() });
  const messages = [
    { role: "system", content: options.system },
    { role: "user", content: options.userContent.map((block) => {
      if (block.type === "image_url" && block.image_url) {
        return { type: "image_url", image_url: { url: block.image_url.url } };
      }
      return { type: "text", text: block.text || "" };
    }) }
  ];
  const response = await client.chat.completions.create({
    model: options.ai.model,
    max_tokens: options.maxTokens || DEFAULT_MAX_TOKENS,
    messages,
    ...options.jsonMode ? { response_format: { type: "json_object" } } : {}
  });
  return response.choices[0]?.message?.content || null;
}
var NO_AI_KEY_MESSAGE = "No AI API key found. Set ANTHROPIC_API_KEY or OPENAI_API_KEY, or create .anthropic/.openai file in project root.";

// src/tools/browser/describe.ts
var describeEffectFrameSchema = {
  effect_id: z3.string().optional().describe('Single effect ID (e.g., "synth/noise")'),
  effects: z3.string().optional().describe("CSV of effect IDs"),
  prompt: z3.string().describe("Analysis prompt for the AI vision model"),
  backend: z3.enum(["webgl2", "webgpu"]).default("webgl2").describe("Rendering backend"),
  capture_image: z3.boolean().optional().default(false).describe("Return the rendered PNG data URI alongside the description")
};
async function describeEffectFrame(session, effectId, prompt, options = {}) {
  const config2 = getConfig();
  const ai = getAIProvider({ projectRoot: config2.projectRoot });
  if (!ai) return { status: "error", error: NO_AI_KEY_MESSAGE };
  const renderResult = await renderEffectFrame(session, effectId, { captureImage: true });
  if (renderResult.status === "error" || !renderResult.frame?.image_uri) {
    const reason = renderResult.error;
    return { status: "error", error: reason ? `Failed to render frame: ${reason}` : "Failed to render frame" };
  }
  const vision = await callAI({
    system: "You are an expert shader effect analyzer. Describe shader visuals precisely. Respond with JSON: {description, tags, notes}",
    userContent: [
      { type: "text", text: prompt },
      { type: "image_url", image_url: { url: renderResult.frame.image_uri } }
    ],
    maxTokens: 1500,
    jsonMode: true,
    ai
  });
  let parsed = null;
  if (vision) {
    try {
      const raw = JSON.parse(vision);
      parsed = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : { description: typeof raw === "string" ? raw : vision, tags: [], notes: null };
    } catch {
      parsed = { description: vision, tags: [], notes: null };
    }
  }
  return {
    status: "ok",
    ...options.captureImage ? { frame: { image_uri: renderResult.frame.image_uri } } : {},
    vision: parsed
  };
}
function registerDescribeEffectFrame(server2) {
  server2.tool(
    "describeEffectFrame",
    "Render frame + AI vision analysis. User provides analysis prompt.",
    describeEffectFrameSchema,
    async (args) => {
      const config2 = getConfig();
      const effectIds = resolveEffectIds(args, config2.effectsDir);
      const session = new BrowserSession({ backend: args.backend });
      try {
        await session.setup();
        const results = [];
        for (const id of effectIds) {
          try {
            results.push({ effect_id: id, ...await describeEffectFrame(session, id, args.prompt, { captureImage: args.capture_image }) });
          } catch (err) {
            results.push({ effect_id: id, status: "error", error: err instanceof Error ? err.message : String(err) });
          }
        }
        return toolResult(results.length === 1 ? results[0] : results);
      } finally {
        await session.teardown();
      }
    }
  );
}

// src/tools/browser/benchmark.ts
import { z as z4 } from "zod";
var benchmarkEffectFPSSchema = {
  effect_id: z4.string().optional().describe('Single effect ID (e.g., "synth/noise")'),
  effects: z4.string().optional().describe("CSV of effect IDs"),
  backend: z4.enum(["webgl2", "webgpu"]).default("webgl2").describe("Rendering backend"),
  target_fps: z4.number().optional().default(60).describe("Target FPS"),
  duration_seconds: z4.number().optional().default(5).describe("Benchmark duration in seconds"),
  resolution: z4.tuple([z4.number(), z4.number()]).optional().describe("Viewport resolution [width, height]")
};
async function benchmarkEffectFPS(session, effectId, options = {}) {
  const targetFps = options.targetFps ?? 60;
  const duration = options.durationSeconds ?? 5;
  return session.runWithConsoleCapture(async () => {
    const page = session.page;
    await session.setBackend(session.backend);
    if (options.resolution) {
      await page.setViewportSize({ width: options.resolution[0], height: options.resolution[1] });
    }
    await page.evaluate((id) => {
      const select = document.getElementById("effect-select");
      if (select) {
        select.value = id;
        select.dispatchEvent(new Event("change"));
      }
    }, effectId);
    await page.waitForFunction(() => {
      const s = document.getElementById("status");
      const t = (s?.textContent || "").toLowerCase();
      return t.includes("loaded") || t.includes("compiled") || t.includes("ready") || t.includes("error");
    }, { timeout: session.timeoutMs });
    const result = await page.evaluate(({ duration: duration2 }) => {
      return new Promise((resolve4) => {
        const frameTimes = [];
        let lastTime = performance.now();
        let running = true;
        function onFrame() {
          if (!running) return;
          const now = performance.now();
          frameTimes.push(now - lastTime);
          lastTime = now;
          requestAnimationFrame(onFrame);
        }
        requestAnimationFrame(onFrame);
        setTimeout(() => {
          running = false;
          const frameCount = frameTimes.length;
          const totalMs = frameTimes.reduce((a, b) => a + b, 0);
          const fps = frameCount / (totalMs / 1e3);
          const avgFrameTime = totalMs / Math.max(frameCount, 1);
          let minFrameTime = Infinity, maxFrameTime = 0;
          for (const t of frameTimes) {
            if (t < minFrameTime) minFrameTime = t;
            if (t > maxFrameTime) maxFrameTime = t;
          }
          let sumSq = 0;
          for (const t of frameTimes) sumSq += (t - avgFrameTime) ** 2;
          const jitter = frameCount > 1 ? Math.sqrt(sumSq / (frameCount - 1)) : 0;
          resolve4({
            frame_count: frameCount,
            achieved_fps: Math.round(fps * 100) / 100,
            avg_frame_time_ms: Math.round(avgFrameTime * 100) / 100,
            min_frame_time_ms: Math.round((minFrameTime === Infinity ? 0 : minFrameTime) * 100) / 100,
            max_frame_time_ms: Math.round(maxFrameTime * 100) / 100,
            jitter_ms: Math.round(jitter * 100) / 100
          });
        }, duration2 * 1e3);
      });
    }, { duration });
    const backend = session.backend;
    return {
      status: "ok",
      backend,
      achieved_fps: result.achieved_fps,
      meets_target: result.achieved_fps >= targetFps,
      stats: {
        frame_count: result.frame_count,
        avg_frame_time_ms: result.avg_frame_time_ms,
        jitter_ms: result.jitter_ms,
        min_frame_time_ms: result.min_frame_time_ms,
        max_frame_time_ms: result.max_frame_time_ms
      }
    };
  });
}
function registerBenchmarkEffectFPS(server2) {
  server2.tool(
    "benchmarkEffectFPS",
    "Measure achieved FPS, jitter, frame timing stats against a target framerate.",
    benchmarkEffectFPSSchema,
    async (args) => {
      const config2 = getConfig();
      const effectIds = resolveEffectIds(args, config2.effectsDir);
      const session = new BrowserSession({ backend: args.backend });
      try {
        await session.setup();
        const results = [];
        for (const id of effectIds) {
          try {
            results.push({ effect_id: id, ...await benchmarkEffectFPS(session, id, {
              targetFps: args.target_fps,
              durationSeconds: args.duration_seconds,
              resolution: args.resolution
            }) });
          } catch (err) {
            results.push({ effect_id: id, status: "error", error: err instanceof Error ? err.message : String(err) });
          }
        }
        return toolResult(results.length === 1 ? results[0] : results);
      } finally {
        await session.teardown();
      }
    }
  );
}

// src/tools/browser/uniforms.ts
import { z as z5 } from "zod";
var testUniformResponsivenessSchema = {
  effect_id: z5.string().optional().describe('Single effect ID (e.g., "synth/noise")'),
  effects: z5.string().optional().describe("CSV of effect IDs"),
  backend: z5.enum(["webgl2", "webgpu"]).default("webgl2").describe("Rendering backend")
};
async function testUniformResponsiveness(session, effectId) {
  return session.runWithConsoleCapture(async () => {
    const page = session.page;
    await session.setBackend(session.backend);
    await page.evaluate((id) => {
      const select = document.getElementById("effect-select");
      if (select) {
        select.value = id;
        select.dispatchEvent(new Event("change"));
      }
    }, effectId);
    await page.waitForFunction(() => {
      const s = document.getElementById("status");
      const t = (s?.textContent || "").toLowerCase();
      return t.includes("loaded") || t.includes("compiled") || t.includes("ready");
    }, { timeout: session.timeoutMs });
    await page.evaluate((globals) => {
      const w = window;
      if (w[globals.setPaused]) w[globals.setPaused](true);
      if (w[globals.setPausedTime]) w[globals.setPausedTime](0);
    }, session.globals);
    const result = await page.evaluate((globals) => {
      const w = window;
      const pipeline = w[globals.renderingPipeline];
      const effect = w[globals.currentEffect];
      if (!pipeline || !effect?.instance?.globals) {
        return { status: "error", tested_uniforms: [], details: "No effect loaded" };
      }
      const renderer = w[globals.canvasRenderer];
      const gl = pipeline.backend?.gl;
      function captureMetrics() {
        if (!renderer || !gl) return null;
        renderer.render(0);
        const canvas = renderer.canvas;
        const width = canvas.width, height = canvas.height;
        const pixels = new Uint8Array(width * height * 4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        const count = width * height;
        let sumR = 0, sumG = 0, sumB = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          sumR += pixels[i] / 255;
          sumG += pixels[i + 1] / 255;
          sumB += pixels[i + 2] / 255;
        }
        return [sumR / count, sumG / count, sumB / count];
      }
      const baseline = captureMetrics();
      if (!baseline) return { status: "error", tested_uniforms: [], details: "Failed to capture baseline" };
      const effectGlobals = effect.instance.globals;
      const tested = [];
      let anyResponded = false;
      for (const [name, spec] of Object.entries(effectGlobals)) {
        if (!spec.uniform) continue;
        if (spec.type === "boolean" || spec.type === "button") continue;
        if (typeof spec.min !== "number" || typeof spec.max !== "number" || spec.min === spec.max) continue;
        const defaultVal = spec.default ?? spec.min;
        const range = spec.max - spec.min;
        let testVal = defaultVal === spec.min ? spec.min + range * 0.75 : spec.min + range * 0.25;
        if (spec.type === "int") testVal = Math.round(testVal);
        if (pipeline.setUniform) pipeline.setUniform(spec.uniform, testVal);
        else if (pipeline.globalUniforms) pipeline.globalUniforms[spec.uniform] = testVal;
        const testMetrics = captureMetrics();
        if (testMetrics) {
          const lumaDiff = Math.abs(
            (testMetrics[0] + testMetrics[1] + testMetrics[2]) / 3 - (baseline[0] + baseline[1] + baseline[2]) / 3
          );
          const maxChannelDiff = Math.max(
            Math.abs(testMetrics[0] - baseline[0]),
            Math.abs(testMetrics[1] - baseline[1]),
            Math.abs(testMetrics[2] - baseline[2])
          );
          if (lumaDiff > 2e-3 || maxChannelDiff > 2e-3) {
            anyResponded = true;
            tested.push(`${name}:pass`);
          } else {
            tested.push(`${name}:fail`);
          }
        } else {
          tested.push(`${name}:error`);
        }
        if (pipeline.setUniform) pipeline.setUniform(spec.uniform, defaultVal);
        else if (pipeline.globalUniforms) pipeline.globalUniforms[spec.uniform] = defaultVal;
      }
      return {
        status: anyResponded ? "ok" : tested.length === 0 ? "skipped" : "error",
        tested_uniforms: tested,
        details: anyResponded ? "Uniforms affect output" : tested.length === 0 ? "No testable uniforms" : "No uniforms affected output"
      };
    }, session.globals);
    await page.evaluate((globals) => {
      const w = window;
      if (w[globals.setPaused]) w[globals.setPaused](false);
    }, session.globals);
    return result;
  });
}
function registerTestUniformResponsiveness(server2) {
  server2.tool(
    "testUniformResponsiveness",
    "For each uniform: render baseline, modify value, compare output. Returns per-uniform pass/fail.",
    testUniformResponsivenessSchema,
    async (args) => {
      const config2 = getConfig();
      const effectIds = resolveEffectIds(args, config2.effectsDir);
      const session = new BrowserSession({ backend: args.backend });
      try {
        await session.setup();
        const results = [];
        for (const id of effectIds) {
          try {
            results.push({ effect_id: id, ...await testUniformResponsiveness(session, id) });
          } catch (err) {
            results.push({ effect_id: id, status: "error", error: err instanceof Error ? err.message : String(err) });
          }
        }
        return toolResult(results.length === 1 ? results[0] : results);
      } finally {
        await session.teardown();
      }
    }
  );
}

// src/tools/browser/passthrough.ts
import { z as z6 } from "zod";
var testNoPassthroughSchema = {
  effect_id: z6.string().optional().describe('Single effect ID (e.g., "synth/noise")'),
  effects: z6.string().optional().describe("CSV of effect IDs"),
  backend: z6.enum(["webgl2", "webgpu"]).default("webgl2").describe("Rendering backend")
};
async function testNoPassthrough(session, effectId) {
  return session.runWithConsoleCapture(async () => {
    const page = session.page;
    await session.setBackend(session.backend);
    await page.evaluate((id) => {
      const select = document.getElementById("effect-select");
      if (select) {
        select.value = id;
        select.dispatchEvent(new Event("change"));
      }
    }, effectId);
    await page.waitForFunction(() => {
      const s = document.getElementById("status");
      const t = (s?.textContent || "").toLowerCase();
      return t.includes("loaded") || t.includes("compiled") || t.includes("ready") || t.includes("error");
    }, { timeout: session.timeoutMs });
    const result = await page.evaluate((globals) => {
      const w = window;
      const pipeline = w[globals.renderingPipeline];
      const effect = w[globals.currentEffect];
      if (!pipeline || !effect) return { status: "error", isFilterEffect: false, similarity: null, details: "No effect loaded" };
      const renderer = w[globals.canvasRenderer];
      const gl = pipeline.backend?.gl;
      if (!renderer || !gl) return { status: "error", isFilterEffect: false, similarity: null, details: "No GL context" };
      const passes = pipeline.graph?.passes || [];
      const isFilter = passes.some((p) => {
        const inputs = p.inputs || {};
        return Object.values(inputs).some((v) => String(v).includes("input"));
      });
      if (!isFilter) return { status: "skipped", isFilterEffect: false, similarity: null, details: "Not a filter effect" };
      const canvas = renderer.canvas;
      const width = canvas.width, height = canvas.height;
      renderer.render(0);
      const pixels0 = new Uint8Array(width * height * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels0);
      renderer.render(1);
      const pixels1 = new Uint8Array(width * height * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels1);
      const pixelCount = width * height;
      const stride = Math.max(1, Math.floor(pixelCount / 1e3));
      let diffSum = 0, samples = 0;
      const colors = /* @__PURE__ */ new Set();
      for (let i = 0; i < pixelCount; i += stride) {
        const idx = i * 4;
        diffSum += Math.abs(pixels0[idx] - pixels1[idx]) + Math.abs(pixels0[idx + 1] - pixels1[idx + 1]) + Math.abs(pixels0[idx + 2] - pixels1[idx + 2]);
        colors.add(`${pixels0[idx]},${pixels0[idx + 1]},${pixels0[idx + 2]}`);
        samples++;
      }
      const temporalDiff = diffSum / (samples * 3 * 255);
      const uniqueColors = colors.size;
      const isModifying = temporalDiff > 0.01 || uniqueColors > 5;
      return {
        status: isModifying ? "ok" : "passthrough",
        isFilterEffect: true,
        temporalDiff,
        uniqueColors,
        details: isModifying ? "Effect modifies input" : "Effect may be passing through unchanged"
      };
    }, session.globals);
    return result;
  });
}
function registerTestNoPassthrough(server2) {
  server2.tool(
    "testNoPassthrough",
    "Verify filter effects actually modify their input (>1% pixel difference).",
    testNoPassthroughSchema,
    async (args) => {
      const config2 = getConfig();
      const effectIds = resolveEffectIds(args, config2.effectsDir);
      const session = new BrowserSession({ backend: args.backend });
      try {
        await session.setup();
        const results = [];
        for (const id of effectIds) {
          try {
            results.push({ effect_id: id, ...await testNoPassthrough(session, id) });
          } catch (err) {
            results.push({ effect_id: id, status: "error", error: err instanceof Error ? err.message : String(err) });
          }
        }
        return toolResult(results.length === 1 ? results[0] : results);
      } finally {
        await session.teardown();
      }
    }
  );
}

// src/tools/browser/parity.ts
import { z as z7 } from "zod";
var testPixelParitySchema = {
  effect_id: z7.string().optional().describe('Single effect ID (e.g., "synth/noise")'),
  effects: z7.string().optional().describe("CSV of effect IDs"),
  epsilon: z7.number().optional().default(1).describe("Allowed per-channel difference (0-255)"),
  seed: z7.number().optional().default(42).describe("Random seed for reproducible noise")
};
async function waitReady(session) {
  await session.page.waitForFunction((globals) => {
    const w = window;
    const p = w[globals.renderingPipeline];
    if (!p || p.isCompiling) return false;
    return !!(p.graph && p.graph.passes && p.graph.passes.length > 0);
  }, session.globals, { timeout: session.timeoutMs, polling: 50 });
}
async function warmUp(session, frames = 6) {
  const start = await session.page.evaluate((globals) => {
    const w = window;
    if (w[globals.setPaused]) w[globals.setPaused](false);
    return w[globals.frameCount] || 0;
  }, session.globals);
  await session.page.waitForFunction(
    ({ globals, target }) => (window[globals.frameCount] || 0) >= target,
    { globals: session.globals, target: start + frames },
    { timeout: 3e4, polling: 30 }
  );
}
async function captureSurface(session, seed) {
  return await session.page.evaluate(async ({ globals, seed: seed2 }) => {
    const w = window;
    if (w[globals.setPaused]) w[globals.setPaused](true);
    if (w[globals.setPausedTime]) w[globals.setPausedTime](0);
    const p = w[globals.renderingPipeline];
    if (!p) return null;
    if (p.globalUniforms) p.globalUniforms.seed = seed2;
    for (const pass of p.graph?.passes || []) if (pass.uniforms) pass.uniforms.seed = seed2;
    const r = w[globals.canvasRenderer];
    const b = p.backend;
    if (!r || !b || !b.readPixels || !b.textures) return null;
    const surf = p.graph?.renderSurface;
    if (!surf) return null;
    const readSurface = async () => {
      const candidates = ["global_" + surf + "_read"];
      try {
        const nodes = [];
        for (const k of b.textures.keys()) if (/node_\d+_out/.test(k)) nodes.push(k);
        nodes.sort((a, c) => parseInt(a.match(/node_(\d+)/)[1], 10) - parseInt(c.match(/node_(\d+)/)[1], 10));
        if (nodes.length) candidates.push(nodes[nodes.length - 1]);
      } catch (e) {
      }
      for (const id of candidates) {
        try {
          const px2 = await b.readPixels(id);
          if (px2 && px2.width && px2.height && px2.data) return px2;
        } catch (e) {
        }
      }
      return null;
    };
    let px = null;
    for (let attempt = 0; attempt < 6 && !px; attempt++) {
      r.render(0);
      r.render(0);
      px = await readSurface();
      if (!px) await new Promise((res) => setTimeout(res, 80));
    }
    if (!px) return null;
    let data = px.data;
    if (!b.gl) {
      const flipped = new Uint8Array(px.width * px.height * 4);
      const rowBytes = px.width * 4;
      for (let y = 0; y < px.height; y++) {
        flipped.set(data.subarray((px.height - 1 - y) * rowBytes, (px.height - y) * rowBytes), y * rowBytes);
      }
      data = flipped;
    }
    return { data: Array.from(data), width: px.width, height: px.height };
  }, { globals: session.globals, seed });
}
async function testPixelParity(session, effectId, options = {}) {
  const epsilon = options.epsilon ?? 1;
  const seed = options.seed ?? 42;
  await session.setBackend("webgl2");
  await session.selectEffect(effectId);
  await waitReady(session);
  await warmUp(session);
  const glslPixels = await captureSurface(session, seed);
  if (!glslPixels) {
    return { status: "error", maxDiff: 0, meanDiff: 0, mismatchCount: 0, mismatchPercent: 0, resolution: [0, 0], details: "Failed to capture WebGL2" };
  }
  await session.setBackend("webgpu");
  await session.selectEffect(effectId);
  await waitReady(session);
  await warmUp(session);
  const wgslPixels = await captureSurface(session, seed);
  await session.page.evaluate((globals) => {
    const w2 = window;
    if (w2[globals.setPaused]) w2[globals.setPaused](false);
  }, session.globals);
  if (!wgslPixels) {
    return { status: "error", maxDiff: 0, meanDiff: 0, mismatchCount: 0, mismatchPercent: 0, resolution: [glslPixels.width, glslPixels.height], details: "Failed to capture WebGPU" };
  }
  if (glslPixels.width !== wgslPixels.width || glslPixels.height !== wgslPixels.height) {
    return {
      status: "error",
      maxDiff: 0,
      meanDiff: 0,
      mismatchCount: 0,
      mismatchPercent: 0,
      resolution: [glslPixels.width, glslPixels.height],
      details: `Capture size mismatch: glsl ${glslPixels.width}x${glslPixels.height} vs wgsl ${wgslPixels.width}x${wgslPixels.height}`
    };
  }
  let maxDiff = 0;
  let totalDiff = 0;
  let mismatchCount = 0;
  const totalChannels = glslPixels.data.length;
  for (let i = 0; i < totalChannels; i++) {
    const diff = Math.abs(glslPixels.data[i] - wgslPixels.data[i]);
    if (diff > maxDiff) maxDiff = diff;
    totalDiff += diff;
    if (diff > epsilon) mismatchCount++;
  }
  const meanDiff = totalDiff / totalChannels;
  const mismatchPercent = mismatchCount / totalChannels * 100;
  const w = glslPixels.width, h = glslPixels.height;
  function checkSolid(pixels, label) {
    const n = pixels.width * pixels.height;
    let rS = 0, gS = 0, bS = 0;
    for (let i = 0; i < pixels.data.length; i += 4) {
      rS += pixels.data[i];
      gS += pixels.data[i + 1];
      bS += pixels.data[i + 2];
    }
    const rM = rS / n, gM = gS / n, bM = bS / n;
    let rV = 0, gV = 0, bV = 0;
    for (let i = 0; i < pixels.data.length; i += 4) {
      rV += (pixels.data[i] - rM) ** 2;
      gV += (pixels.data[i + 1] - gM) ** 2;
      bV += (pixels.data[i + 2] - bM) ** 2;
    }
    rV /= n;
    gV /= n;
    bV /= n;
    const isSolid = rV < 5 && gV < 5 && bV < 5;
    return { label, isSolid, variance: [Math.round(rV), Math.round(gV), Math.round(bV)], mean: [Math.round(rM), Math.round(gM), Math.round(bM)] };
  }
  const glslSolid = checkSolid(glslPixels, "glsl");
  const wgslSolid = checkSolid(wgslPixels, "wgsl");
  let yFlipMismatch = 0;
  let yFlipTotalDiff = 0;
  const rowBytes = w * 4;
  for (let y = 0; y < h; y++) {
    const glslRow = y;
    const wgslFlippedRow = h - 1 - y;
    for (let x = 0; x < rowBytes; x++) {
      const diff = Math.abs(glslPixels.data[glslRow * rowBytes + x] - wgslPixels.data[wgslFlippedRow * rowBytes + x]);
      yFlipTotalDiff += diff;
      if (diff > epsilon) yFlipMismatch++;
    }
  }
  const yFlipPercent = yFlipMismatch / totalChannels * 100;
  const yFlipMeanDiff = yFlipTotalDiff / totalChannels;
  const yFlipRatio = meanDiff > 0 ? yFlipMeanDiff / meanDiff : 1;
  const isYFlipped = meanDiff > 2 && // there is a real difference to explain
  yFlipMeanDiff < meanDiff && // flipping must actually help
  yFlipRatio < 0.7;
  const isCleanYFlip = meanDiff > 2 && yFlipRatio < 0.25;
  const issues = [];
  if (glslSolid.isSolid) issues.push(`GLSL SOLID COLOR (mean=${glslSolid.mean})`);
  if (wgslSolid.isSolid) issues.push(`WGSL SOLID COLOR (mean=${wgslSolid.mean})`);
  if (isYFlipped) {
    issues.push(
      `${isCleanYFlip ? "Y-FLIP" : "PARTIAL Y-FLIP"} DETECTED (flipped meanDiff=${yFlipMeanDiff.toFixed(2)} vs normal meanDiff=${meanDiff.toFixed(2)}, ratio=${yFlipRatio.toFixed(2)}, flip mismatch=${yFlipPercent.toFixed(1)}% vs normal=${mismatchPercent.toFixed(1)}%)`
    );
  }
  const status = mismatchPercent < 1 ? "ok" : "mismatch";
  return {
    status,
    maxDiff,
    meanDiff: Math.round(meanDiff * 100) / 100,
    mismatchCount,
    mismatchPercent: Math.round(mismatchPercent * 100) / 100,
    resolution: [w, h],
    glslSolid: glslSolid.isSolid,
    wgslSolid: wgslSolid.isSolid,
    glslVariance: glslSolid.variance,
    wgslVariance: wgslSolid.variance,
    yFlipDetected: isYFlipped,
    yFlipCleanFlip: isCleanYFlip,
    yFlipMismatchPercent: Math.round(yFlipPercent * 100) / 100,
    yFlipMeanDiff: Math.round(yFlipMeanDiff * 100) / 100,
    yFlipRatio: Math.round(yFlipRatio * 1e3) / 1e3,
    issues,
    details: issues.length > 0 ? issues.join("; ") : mismatchPercent < 1 ? `Pixel parity OK (maxDiff=${maxDiff}, meanDiff=${meanDiff.toFixed(2)})` : `Pixel mismatch: ${mismatchPercent.toFixed(1)}% channels differ by >${epsilon}`
  };
}
function registerTestPixelParity(server2) {
  server2.tool(
    "testPixelParity",
    "Render on both WebGL2 and WebGPU, compare pixel-by-pixel within epsilon tolerance.",
    testPixelParitySchema,
    async (args) => {
      const config2 = getConfig();
      const effectIds = resolveEffectIds(args, config2.effectsDir);
      const session = new BrowserSession({ backend: "webgl2" });
      try {
        await session.setup();
        const results = [];
        for (const id of effectIds) {
          try {
            results.push({ effect_id: id, ...await testPixelParity(session, id, { epsilon: args.epsilon, seed: args.seed }) });
          } catch (err) {
            results.push({ effect_id: id, status: "error", error: err instanceof Error ? err.message : String(err) });
          }
        }
        return toolResult(results.length === 1 ? results[0] : results);
      } finally {
        await session.teardown();
      }
    }
  );
}

// src/tools/browser/dsl.ts
import { z as z8 } from "zod";
var runDslProgramSchema = {
  dsl: z8.string().describe("DSL program string"),
  backend: z8.enum(["webgl2", "webgpu"]).default("webgl2").describe("Rendering backend"),
  warmup_frames: z8.number().optional().default(10).describe("Frames to wait"),
  capture_image: z8.boolean().optional().default(false).describe("Capture PNG data URI"),
  uniforms: z8.record(z8.string(), z8.number()).optional().describe("Uniform overrides")
};
async function runDslProgram(session, dsl, options = {}) {
  return session.runWithConsoleCapture(async () => {
    const page = session.page;
    await session.setBackend(session.backend);
    const compileResult = await page.evaluate(({ dsl: dsl2, timeout, globals }) => {
      return new Promise((resolve4) => {
        const editor = document.getElementById("dsl-editor");
        const runBtn = document.getElementById("dsl-run-btn");
        if (editor && runBtn) {
          editor.value = dsl2;
          editor.dispatchEvent(new Event("input"));
          runBtn.click();
        } else {
          const renderer = window[globals.canvasRenderer];
          if (renderer?.compile) {
            renderer.compile(dsl2).then(() => {
              resolve4({ status: "ok", message: "Compiled via renderer" });
            }).catch((err) => {
              resolve4({ status: "error", message: err?.message || String(err) });
            });
            return;
          }
          resolve4({ status: "error", message: "No DSL editor or renderer found" });
          return;
        }
        const start = Date.now();
        const poll = () => {
          const status = document.getElementById("status");
          const text = (status?.textContent || "").toLowerCase();
          if (text.includes("error") || text.includes("failed")) {
            resolve4({ status: "error", message: status?.textContent });
            return;
          }
          if (text.includes("loaded") || text.includes("compiled") || text.includes("ready")) {
            resolve4({ status: "ok", message: "Compiled" });
            return;
          }
          if (Date.now() - start > timeout) {
            resolve4({ status: "error", message: "Compile timeout" });
            return;
          }
          setTimeout(poll, 50);
        };
        poll();
      });
    }, { dsl, timeout: session.timeoutMs, globals: session.globals });
    if (compileResult.status === "error") {
      return { status: "error", error: compileResult.message };
    }
    if (options.uniforms) {
      await page.evaluate(({ unis, globals }) => {
        const pipeline = window[globals.renderingPipeline];
        if (!pipeline) return;
        for (const [k, v] of Object.entries(unis)) {
          if (pipeline.setUniform) pipeline.setUniform(k, v);
          else if (pipeline.globalUniforms) pipeline.globalUniforms[k] = v;
        }
      }, { unis: options.uniforms, globals: session.globals });
    }
    const warmup = options.warmupFrames ?? 10;
    await page.evaluate(({ frames, globals }) => {
      return new Promise((resolve4) => {
        const start = window[globals.frameCount] || 0;
        const poll = () => {
          if ((window[globals.frameCount] || 0) - start >= frames) resolve4();
          else requestAnimationFrame(poll);
        };
        poll();
      });
    }, { frames: warmup, globals: session.globals });
    const result = await page.evaluate(({ captureImage, globals }) => {
      const renderer = window[globals.canvasRenderer];
      const pipeline = window[globals.renderingPipeline];
      if (!renderer || !pipeline) return { status: "error", error: "No renderer" };
      const canvas = renderer.canvas;
      const gl = pipeline.backend?.gl;
      if (!gl) return { status: "error", error: "No GL context" };
      const width = canvas.width, height = canvas.height;
      const pixels = new Uint8Array(width * height * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      const count = width * height;
      const stride = Math.max(1, Math.floor(count / 1e3));
      let sumR = 0, sumG = 0, sumB = 0, samples = 0;
      const colors = /* @__PURE__ */ new Set();
      for (let i = 0; i < count; i += stride) {
        const idx = i * 4;
        sumR += pixels[idx] / 255;
        sumG += pixels[idx + 1] / 255;
        sumB += pixels[idx + 2] / 255;
        colors.add(`${pixels[idx]},${pixels[idx + 1]},${pixels[idx + 2]}`);
        samples++;
      }
      const meanR = sumR / samples, meanG = sumG / samples, meanB = sumB / samples;
      let imageUri = null;
      if (captureImage) {
        const tmp = document.createElement("canvas");
        tmp.width = width;
        tmp.height = height;
        const ctx = tmp.getContext("2d");
        const imgData = ctx.createImageData(width, height);
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const src = ((height - 1 - y) * width + x) * 4;
            const dst = (y * width + x) * 4;
            imgData.data[dst] = pixels[src];
            imgData.data[dst + 1] = pixels[src + 1];
            imgData.data[dst + 2] = pixels[src + 2];
            imgData.data[dst + 3] = pixels[src + 3];
          }
        }
        ctx.putImageData(imgData, 0, 0);
        imageUri = tmp.toDataURL("image/png");
      }
      return {
        status: "ok",
        backend: pipeline.backend?.getName?.() || "unknown",
        frame: { width, height, image_uri: imageUri },
        metrics: {
          mean_rgb: [meanR, meanG, meanB],
          unique_sampled_colors: colors.size,
          is_all_zero: meanR === 0 && meanG === 0 && meanB === 0,
          is_monochrome: colors.size <= 1
        }
      };
    }, { captureImage: options.captureImage ?? false, globals: session.globals });
    return result;
  });
}
function registerRunDslProgram(server2) {
  server2.tool(
    "runDslProgram",
    "Compile and execute arbitrary DSL code without pre-defined effect files. Returns metrics + pass status.",
    runDslProgramSchema,
    async (args) => {
      const session = new BrowserSession({ backend: args.backend });
      try {
        await session.setup();
        const result = await runDslProgram(session, args.dsl, {
          warmupFrames: args.warmup_frames,
          captureImage: args.capture_image,
          uniforms: args.uniforms
        });
        return toolResult(result);
      } finally {
        await session.teardown();
      }
    }
  );
}

// src/tools/analysis/structure.ts
import { z as z10 } from "zod";
import { readFileSync as readFileSync5, readdirSync as readdirSync3, existsSync as existsSync5 } from "fs";
import { join as join6 } from "path";

// src/formats/index.ts
import { existsSync as existsSync3, readFileSync as readFileSync3 } from "fs";
import { join as join4 } from "path";

// src/formats/definition-json.ts
function parseDefinitionJson(json, effectDir) {
  const globals = {};
  const rawGlobals = json.globals || {};
  for (const [key, spec] of Object.entries(rawGlobals)) {
    globals[key] = {
      name: key,
      type: spec.type || "float",
      uniform: spec.uniform || key,
      default: spec.default,
      min: spec.min,
      max: spec.max,
      step: spec.step,
      choices: spec.choices,
      control: spec.control
    };
  }
  const rawPasses = json.passes || [];
  const passes = rawPasses.map((p) => ({
    name: p.name,
    program: p.program || "main",
    type: p.type,
    inputs: p.inputs,
    outputs: p.outputs
  }));
  return {
    func: json.func,
    name: json.name,
    namespace: json.namespace,
    description: json.description,
    starter: json.starter,
    tags: json.tags,
    globals,
    passes,
    format: "json",
    effectDir
  };
}

// src/formats/definition-js.ts
import { readFileSync as readFileSync2 } from "fs";
function parseDefinitionJs(filePath, effectDir) {
  const source = readFileSync2(filePath, "utf-8");
  const func = extractString(source, /func\s*[:=]\s*['"](\w+)['"]/) || "unknown";
  const name = extractQuotedValue(source, "name");
  const namespace = extractString(source, /namespace\s*[:=]\s*['"](\w+)['"]/);
  const description = extractQuotedValue(source, "description");
  const starter = /starter\s*[:=]\s*true/.test(source) ? true : /starter\s*[:=]\s*false/.test(source) ? false : void 0;
  const tagsMatch = source.match(/tags\s*[:=]\s*\[([^\]]+)\]/);
  const tags = tagsMatch ? tagsMatch[1].split(",").map((t) => t.trim().replace(/['"]/g, "")).filter(Boolean) : void 0;
  const passes = [];
  const passRegex = /program:\s*['"](\w+)['"]/g;
  let match;
  while ((match = passRegex.exec(source)) !== null) {
    passes.push({ program: match[1] });
  }
  if (passes.length === 0) {
    passes.push({ program: "main" });
  }
  const globals = {};
  const globalsKey = source.match(/globals\s*[:=]\s*\{/);
  const globalsText = globalsKey ? balancedBraceSlice(source, globalsKey.index + globalsKey[0].length - 1) : null;
  if (globalsText) {
    const body = globalsText.slice(1, -1);
    const keyRegex = /(\w+)\s*:\s*\{/g;
    let kMatch;
    while ((kMatch = keyRegex.exec(body)) !== null) {
      const name2 = kMatch[1];
      const blockStart = kMatch.index + kMatch[0].length - 1;
      const block = balancedBraceSlice(body, blockStart);
      if (!block) continue;
      keyRegex.lastIndex = blockStart + block.length;
      const ownFields = stripNestedObjects(block);
      const uniform = extractString(ownFields, /uniform:\s*['"](\w+)['"]/);
      if (!uniform) continue;
      const type = extractString(ownFields, /type:\s*['"](\w+)['"]/) || "float";
      const min = extractNumber(ownFields, /min:\s*([-\d.]+)/);
      const max = extractNumber(ownFields, /max:\s*([-\d.]+)/);
      const step = extractNumber(ownFields, /step:\s*([-\d.]+)/);
      const defaultVal = extractNumber(ownFields, /default:\s*([-\d.]+)/);
      globals[name2] = {
        name: name2,
        type,
        uniform,
        ...defaultVal !== void 0 && { default: defaultVal },
        ...min !== void 0 && { min },
        ...max !== void 0 && { max },
        ...step !== void 0 && { step }
      };
    }
  }
  return {
    func,
    name,
    namespace,
    description,
    starter,
    tags,
    globals,
    passes,
    format: "js",
    effectDir
  };
}
function extractString(source, regex) {
  const match = source.match(regex);
  return match ? match[1] : void 0;
}
function extractQuotedValue(source, key) {
  const re = new RegExp(`\\b${key}\\s*[:=]\\s*(['"])((?:\\\\.|[^\\\\\\r\\n])*?)\\1`);
  const match = source.match(re);
  return match ? match[2].replace(/\\(['"\\])/g, "$1") : void 0;
}
function balancedBraceSlice(s, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < s.length; i++) {
    const ch = s[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return s.slice(openIndex, i + 1);
    }
  }
  return null;
}
function stripNestedObjects(block) {
  let depth = 0;
  let out = "";
  for (let i = 0; i < block.length; i++) {
    const ch = block[i];
    if (ch === "{") {
      depth++;
      if (depth <= 1) out += ch;
    } else if (ch === "}") {
      if (depth <= 1) out += ch;
      depth--;
    } else if (depth <= 1) {
      out += ch;
    }
  }
  return out;
}
function extractNumber(source, regex) {
  const match = source.match(regex);
  return match ? parseFloat(match[1]) : void 0;
}

// src/formats/index.ts
function loadEffectDefinition(effectDir) {
  const jsonPath = join4(effectDir, "definition.json");
  if (existsSync3(jsonPath)) {
    const raw = JSON.parse(readFileSync3(jsonPath, "utf-8"));
    return parseDefinitionJson(raw, effectDir);
  }
  const jsPath = join4(effectDir, "definition.js");
  if (existsSync3(jsPath)) {
    return parseDefinitionJs(jsPath, effectDir);
  }
  throw new Error(`No definition.json or definition.js found in ${effectDir}`);
}

// src/tools/analysis/compare.ts
import { z as z9 } from "zod";
import { readFileSync as readFileSync4, readdirSync as readdirSync2, existsSync as existsSync4 } from "fs";
import { join as join5, basename as basename3 } from "path";
var compareShadersSchema = {
  effect_id: z9.string().describe('Effect ID (e.g., "synth/noise")')
};
function extractFunctionNames(source, lang) {
  const stripped = stripComments(source);
  const names = [];
  if (lang === "glsl") {
    const regex = /\b(?:void|bool|u?int|float|[biu]?vec[234]|mat[234](?:x[234])?|[iu]?sampler\w*)\s+(\w+)\s*\(/g;
    let match;
    while ((match = regex.exec(stripped)) !== null) {
      names.push(match[1]);
    }
  } else {
    const regex = /fn\s+(\w+)\s*\(/g;
    let match;
    while ((match = regex.exec(stripped)) !== null) {
      names.push(match[1]);
    }
  }
  return names;
}
function stripComments(source) {
  source = source.replace(/\/\/.*$/gm, "");
  source = source.replace(/\/\*[\s\S]*?\*\//g, "");
  return source;
}
function extractUniforms(source, lang) {
  const stripped = stripComments(source);
  const uniforms = [];
  if (lang === "glsl") {
    const regex = /uniform[ \t]+\w+[ \t]+(\w+)/g;
    let match;
    while ((match = regex.exec(stripped)) !== null) {
      uniforms.push(match[1]);
    }
  } else {
    const regex = /@group\(\d+\)\s+@binding\(\d+\)\s+var<uniform>\s+(\w+)/g;
    let match;
    while ((match = regex.exec(stripped)) !== null) {
      uniforms.push(match[1]);
    }
  }
  return uniforms;
}
async function compareShaders(effectId) {
  const config2 = getConfig();
  const effectDir = resolveEffectDir(effectId, config2.effectsDir);
  const glslDir = join5(effectDir, "glsl");
  const wgslDir = join5(effectDir, "wgsl");
  const results = [];
  const glslFiles = existsSync4(glslDir) ? readdirSync2(glslDir).filter((f) => f.endsWith(".glsl")) : [];
  const wgslFiles = existsSync4(wgslDir) ? readdirSync2(wgslDir).filter((f) => f.endsWith(".wgsl")) : [];
  const wgslMap = new Map(wgslFiles.map((f) => [basename3(f, ".wgsl"), f]));
  for (const gf of glslFiles) {
    const program = basename3(gf, ".glsl");
    const wf = wgslMap.get(program);
    const glslSource = readFileSync4(join5(glslDir, gf), "utf-8");
    const glslFunctions = extractFunctionNames(glslSource, "glsl");
    const glslUniforms = extractUniforms(glslSource, "glsl");
    const glslLines = glslSource.split("\n").length;
    if (wf) {
      const wgslSource = readFileSync4(join5(wgslDir, wf), "utf-8");
      const wgslFunctions = extractFunctionNames(wgslSource, "wgsl");
      const wgslUniforms = extractUniforms(wgslSource, "wgsl");
      const wgslLines = wgslSource.split("\n").length;
      results.push({
        program,
        glsl: { lines: glslLines, functions: glslFunctions, uniforms: glslUniforms },
        wgsl: { lines: wgslLines, functions: wgslFunctions, uniforms: wgslUniforms },
        lineDiff: Math.abs(glslLines - wgslLines),
        functionCountDiff: Math.abs(glslFunctions.length - wgslFunctions.length)
      });
      wgslMap.delete(program);
    } else {
      results.push({
        program,
        glsl: { lines: glslLines, functions: glslFunctions, uniforms: glslUniforms },
        wgsl: null,
        note: "No WGSL counterpart"
      });
    }
  }
  for (const [program, wf] of wgslMap) {
    const wgslSource = readFileSync4(join5(wgslDir, wf), "utf-8");
    results.push({
      program,
      glsl: null,
      wgsl: {
        lines: wgslSource.split("\n").length,
        functions: extractFunctionNames(wgslSource, "wgsl"),
        uniforms: extractUniforms(wgslSource, "wgsl")
      },
      note: "No GLSL counterpart"
    });
  }
  return {
    status: "ok",
    programs: results,
    summary: `${results.length} programs compared`
  };
}
function registerCompareShaders(server2) {
  server2.tool(
    "compareShaders",
    "Static structural comparison: function names, uniform declarations, line counts. No AI needed.",
    compareShadersSchema,
    async (args) => {
      const result = await compareShaders(args.effect_id);
      return toolResult(result);
    }
  );
}

// src/tools/analysis/structure.ts
var GLSL_RESERVED = /* @__PURE__ */ new Set([
  // Type qualifiers
  "const",
  "uniform",
  "in",
  "out",
  "inout",
  "centroid",
  "flat",
  "smooth",
  "layout",
  "invariant",
  "highp",
  "mediump",
  "lowp",
  "precision",
  // Types
  "void",
  "bool",
  "int",
  "uint",
  "float",
  "vec2",
  "vec3",
  "vec4",
  "bvec2",
  "bvec3",
  "bvec4",
  "ivec2",
  "ivec3",
  "ivec4",
  "uvec2",
  "uvec3",
  "uvec4",
  "mat2",
  "mat3",
  "mat4",
  "sampler2D",
  "sampler3D",
  "samplerCube",
  // Control flow
  "if",
  "else",
  "for",
  "while",
  "do",
  "switch",
  "case",
  "default",
  "break",
  "continue",
  "return",
  "discard",
  "struct",
  "true",
  "false"
]);
var GLSL_BUILTINS = /* @__PURE__ */ new Set([
  // Trig
  "sin",
  "cos",
  "tan",
  "asin",
  "acos",
  "atan",
  // Exponential
  "pow",
  "exp",
  "log",
  "exp2",
  "log2",
  "sqrt",
  "inversesqrt",
  // Common
  "abs",
  "sign",
  "floor",
  "ceil",
  "fract",
  "mod",
  "min",
  "max",
  "clamp",
  "mix",
  "step",
  "smoothstep",
  // Geometric
  "length",
  "distance",
  "dot",
  "cross",
  "normalize",
  "faceforward",
  "reflect",
  "refract",
  // Texture
  "texture",
  "texelFetch",
  "textureSize",
  // Derivative
  "dFdx",
  "dFdy",
  "fwidth"
]);
var checkEffectStructureSchema = {
  effect_id: z10.string().describe('Effect ID (e.g., "synth/noise")')
};
function checkCamelCase(name) {
  return /^[a-z][a-zA-Z0-9]*$/.test(name);
}
async function checkEffectStructure(effectId) {
  const config2 = getConfig();
  const effectDir = resolveEffectDir(effectId, config2.effectsDir);
  if (!existsSync5(effectDir)) {
    return { status: "error", error: `Effect directory not found: ${effectDir}` };
  }
  const issues = {
    unusedFiles: [],
    namingIssues: [],
    nameCollisions: [],
    leakedInternalUniforms: [],
    missingDescription: false,
    structuralParityIssues: [],
    requiredUniformIssues: [],
    multiPass: false,
    passCount: 0
  };
  let def;
  try {
    def = loadEffectDefinition(effectDir);
  } catch (err) {
    return { status: "error", error: `Failed to parse definition: ${err.message}` };
  }
  issues.missingDescription = !def.description;
  issues.passCount = def.passes.length;
  issues.multiPass = def.passes.length > 1;
  if (def.func && !checkCamelCase(def.func)) {
    issues.namingIssues.push({ type: "func", name: def.func, reason: "Must be camelCase" });
  }
  const INTERNAL = /* @__PURE__ */ new Set(["channels", "time", "resolution", "mouse"]);
  for (const [name, spec] of Object.entries(def.globals || {})) {
    if (!checkCamelCase(name)) {
      issues.namingIssues.push({ type: "global", name, reason: "Must be camelCase" });
    }
    if (INTERNAL.has(spec.uniform || name)) {
      issues.leakedInternalUniforms.push(name);
    }
  }
  const glslDir = join6(effectDir, "glsl");
  const wgslDir = join6(effectDir, "wgsl");
  const glslFiles = existsSync5(glslDir) ? readdirSync3(glslDir).filter(
    (f) => f.endsWith(".glsl") || f.endsWith(".frag") || f.endsWith(".vert")
  ) : [];
  const wgslFiles = existsSync5(wgslDir) ? readdirSync3(wgslDir).filter((f) => f.endsWith(".wgsl")) : [];
  function programName(filename) {
    return filename.replace(/\.(glsl|frag|vert|wgsl)$/, "");
  }
  const referencedPrograms = new Set(def.passes.map((p) => p.program));
  for (const f of glslFiles) {
    if (!referencedPrograms.has(programName(f))) {
      issues.unusedFiles.push(`glsl/${f}`);
    }
  }
  for (const f of wgslFiles) {
    if (!referencedPrograms.has(programName(f))) {
      issues.unusedFiles.push(`wgsl/${f}`);
    }
  }
  const glslPrograms = new Set(glslFiles.map((f) => programName(f)));
  const wgslPrograms = new Set(wgslFiles.map((f) => programName(f)));
  for (const p of glslPrograms) {
    if (!wgslPrograms.has(p)) {
      issues.structuralParityIssues.push({ type: "missing_wgsl", program: p, message: `GLSL program "${p}" has no WGSL counterpart` });
    }
  }
  for (const p of wgslPrograms) {
    if (!glslPrograms.has(p)) {
      issues.structuralParityIssues.push({ type: "missing_glsl", program: p, message: `WGSL program "${p}" has no GLSL counterpart` });
    }
  }
  for (const gf of glslFiles) {
    const source = readFileSync5(join6(glslDir, gf), "utf-8");
    const uniforms = extractUniforms(source, "glsl");
    const functions = extractFunctionNames(source, "glsl");
    const functionSet = new Set(functions);
    for (const u of uniforms) {
      if (functionSet.has(u)) {
        issues.nameCollisions.push({
          type: "uniform_function",
          name: u,
          file: `glsl/${gf}`,
          message: `Uniform "${u}" collides with function "${u}()" in same file`
        });
      }
      if (GLSL_RESERVED.has(u)) {
        issues.nameCollisions.push({
          type: "reserved_word",
          name: u,
          file: `glsl/${gf}`,
          message: `Uniform "${u}" is a GLSL reserved word`
        });
      }
      if (GLSL_BUILTINS.has(u)) {
        issues.nameCollisions.push({
          type: "builtin_shadow",
          name: u,
          file: `glsl/${gf}`,
          message: `Uniform "${u}" shadows GLSL built-in function "${u}()"`
        });
      }
    }
  }
  const hasIssues = issues.unusedFiles.length > 0 || issues.namingIssues.length > 0 || issues.nameCollisions.length > 0 || issues.leakedInternalUniforms.length > 0 || issues.missingDescription || issues.structuralParityIssues.length > 0;
  return { ...issues, status: hasIssues ? "warning" : "ok" };
}
function registerCheckEffectStructure(server2) {
  server2.tool(
    "checkEffectStructure",
    "Detect unused files, broken references, naming violations, leaked/undefined uniforms, missing descriptions, structural parity issues, and GLSL name collisions (uniform vs function, reserved words, built-in shadowing).",
    checkEffectStructureSchema,
    async (args) => {
      const result = await checkEffectStructure(args.effect_id);
      return toolResult(result);
    }
  );
}

// src/tools/analysis/alg-equiv.ts
import { z as z11 } from "zod";
import { readFileSync as readFileSync6, readdirSync as readdirSync4, existsSync as existsSync6 } from "fs";
import { join as join7, basename as basename5 } from "path";
var checkAlgEquivSchema = {
  effect_id: z11.string().describe('Effect ID (e.g., "synth/noise")')
};
async function checkAlgEquiv(effectId) {
  const config2 = getConfig();
  const ai = getAIProvider({ projectRoot: config2.projectRoot });
  if (!ai) return { status: "error", error: NO_AI_KEY_MESSAGE };
  const effectDir = resolveEffectDir(effectId, config2.effectsDir);
  const glslDir = join7(effectDir, "glsl");
  const wgslDir = join7(effectDir, "wgsl");
  if (!existsSync6(glslDir) || !existsSync6(wgslDir)) {
    return { status: "error", error: "Missing glsl/ or wgsl/ directory" };
  }
  const glslFiles = readdirSync4(glslDir).filter((f) => f.endsWith(".glsl"));
  const wgslFiles = readdirSync4(wgslDir).filter((f) => f.endsWith(".wgsl"));
  const pairs = [];
  const unmatchedGlsl = [];
  const unmatchedWgsl = [];
  const wgslMap = new Map(wgslFiles.map((f) => [basename5(f, ".wgsl"), f]));
  for (const gf of glslFiles) {
    const name = basename5(gf, ".glsl");
    const wf = wgslMap.get(name);
    if (wf) {
      pairs.push({
        program: name,
        glsl: readFileSync6(join7(glslDir, gf), "utf-8"),
        wgsl: readFileSync6(join7(wgslDir, wf), "utf-8")
      });
      wgslMap.delete(name);
    } else {
      unmatchedGlsl.push(name);
    }
  }
  for (const name of wgslMap.keys()) {
    unmatchedWgsl.push(name);
  }
  if (pairs.length === 0) {
    return { status: "error", error: "No matching GLSL/WGSL pairs found" };
  }
  let defContext = "";
  try {
    const defPath = existsSync6(join7(effectDir, "definition.json")) ? join7(effectDir, "definition.json") : join7(effectDir, "definition.js");
    defContext = readFileSync6(defPath, "utf-8").slice(0, 1e3);
  } catch (err) {
    console.warn(`[shade-mcp] no definition context for ${effectId}: ${err instanceof Error ? err.message : String(err)}`);
  }
  const results = [];
  for (const pair of pairs) {
    const response = await callAI({
      system: 'You are an expert shader programmer. Compare GLSL and WGSL shader implementations for algorithmic equivalence. Ignore syntax differences. Respond with JSON: {parity: "equivalent"|"divergent", confidence: "high"|"medium"|"low", notes: string, concerns: string[]}',
      userContent: [
        { type: "text", text: `Effect definition context:
${defContext}

GLSL (${pair.program}.glsl):
${pair.glsl}

WGSL (${pair.program}.wgsl):
${pair.wgsl}

Are these algorithmically equivalent?` }
      ],
      maxTokens: 1500,
      jsonMode: true,
      ai
    });
    let parsed = { parity: "error", notes: "Failed to analyze" };
    if (response) {
      try {
        parsed = JSON.parse(response);
      } catch {
        parsed = { parity: "error", notes: response };
      }
    }
    results.push({ ...parsed, program: pair.program });
  }
  const divergent = results.filter((r) => r.parity === "divergent").length;
  const status = divergent > 0 ? "divergent" : "ok";
  return {
    status,
    pairs: results,
    unmatchedGlsl: unmatchedGlsl.length > 0 ? unmatchedGlsl : void 0,
    unmatchedWgsl: unmatchedWgsl.length > 0 ? unmatchedWgsl : void 0,
    summary: `${results.length} pairs analyzed: ${results.length - divergent} equivalent, ${divergent} divergent`
  };
}
function registerCheckAlgEquiv(server2) {
  server2.tool(
    "checkAlgEquiv",
    "AI semantic comparison of GLSL/WGSL pairs. Flags truly divergent algorithms, ignores syntax differences.",
    checkAlgEquivSchema,
    async (args) => {
      const result = await checkAlgEquiv(args.effect_id);
      return toolResult(result);
    }
  );
}

// src/tools/analysis/branching.ts
import { z as z12 } from "zod";
import { readFileSync as readFileSync7, readdirSync as readdirSync5, existsSync as existsSync7 } from "fs";
import { join as join8 } from "path";
var analyzeBranchingSchema = {
  effect_id: z12.string().describe('Effect ID (e.g., "synth/noise")'),
  backend: z12.enum(["webgl2", "webgpu"]).default("webgl2").describe("Which shader language to analyze")
};
async function analyzeBranching(effectId, backend) {
  const config2 = getConfig();
  const ai = getAIProvider({ projectRoot: config2.projectRoot });
  if (!ai) return { status: "error", error: NO_AI_KEY_MESSAGE };
  const effectDir = resolveEffectDir(effectId, config2.effectsDir);
  const shaderDir = join8(effectDir, backend === "webgpu" ? "wgsl" : "glsl");
  const ext = backend === "webgpu" ? ".wgsl" : ".glsl";
  if (!existsSync7(shaderDir)) {
    return { status: "error", error: `Shader directory not found: ${shaderDir}` };
  }
  const files = readdirSync5(shaderDir).filter((f) => f.endsWith(ext));
  if (files.length === 0) {
    return { status: "error", error: "No shader files found" };
  }
  const sources = files.map((f) => ({
    file: f,
    source: readFileSync7(join8(shaderDir, f), "utf-8")
  }));
  let defContext = "";
  try {
    const defPath = existsSync7(join8(effectDir, "definition.json")) ? join8(effectDir, "definition.json") : join8(effectDir, "definition.js");
    defContext = readFileSync7(defPath, "utf-8").slice(0, 1e3);
  } catch (err) {
    console.warn(`[shade-mcp] no definition context for ${effectId}: ${err instanceof Error ? err.message : String(err)}`);
  }
  const shaderText = sources.map((s) => `--- ${s.file} ---
${s.source}`).join("\n\n");
  const response = await callAI({
    system: "You are a senior GPU shader developer. Identify UNNECESSARY branching in shader code that could be flattened for better GPU performance. Focus on simple if/else over uniforms, not complex algorithms. Severity: high (inner loops), medium (per-fragment), low (negligible). Respond with JSON: {shaders: [{file, opportunities: [{location, description, severity}], notes}], summary}",
    userContent: [
      { type: "text", text: `Effect definition:
${defContext}

Shader sources:
${shaderText}

Identify unnecessary branching.` }
    ],
    maxTokens: 3e3,
    jsonMode: true,
    ai
  });
  let parsed = { shaders: [], summary: "Failed to analyze" };
  if (response) {
    try {
      parsed = JSON.parse(response);
    } catch {
      parsed = { shaders: [], summary: response };
    }
  }
  const totalOpportunities = parsed.shaders?.reduce(
    (sum, s) => sum + (s.opportunities?.length || 0),
    0
  ) || 0;
  return {
    ...parsed,
    status: totalOpportunities >= 2 ? "warning" : "ok"
  };
}
function registerAnalyzeBranching(server2) {
  server2.tool(
    "analyzeBranching",
    "AI analysis of unnecessary shader branching with optimization suggestions.",
    analyzeBranchingSchema,
    async (args) => {
      const result = await analyzeBranching(args.effect_id, args.backend);
      return toolResult(result);
    }
  );
}

// src/tools/knowledge/search-effects.ts
import { z as z13 } from "zod";

// src/knowledge/effect-index.ts
import { readdir, stat } from "fs/promises";
import { existsSync as existsSync8 } from "fs";
import { join as join9 } from "path";
var EffectIndex = class {
  effects = /* @__PURE__ */ new Map();
  initialized = false;
  async initialize(effectsDir) {
    if (this.initialized) return;
    if (!existsSync8(effectsDir)) return;
    const entries = await readdir(effectsDir);
    for (const ns of entries) {
      const nsDir = join9(effectsDir, ns);
      if (!(await stat(nsDir)).isDirectory()) continue;
      const effects = await readdir(nsDir);
      for (const effect of effects) {
        const effectDir = join9(nsDir, effect);
        if (!(await stat(effectDir)).isDirectory()) continue;
        try {
          const def = loadEffectDefinition(effectDir);
          const id = `${ns}/${effect}`;
          this.effects.set(id, { ...def, namespace: ns });
        } catch (err) {
          console.warn(`[shade-mcp] skipping unparseable effect ${ns}/${effect}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
    this.initialized = true;
  }
  search(query, limit = 10) {
    const lower = query.toLowerCase();
    const keywords = lower.split(/\s+/).filter((k) => k.length > 1);
    const results = [];
    for (const [id, def] of this.effects) {
      let score = 0;
      if (id.toLowerCase().includes(lower)) score += 20;
      for (const kw of keywords) {
        if (id.toLowerCase().includes(kw)) score += 8;
        if (def.name?.toLowerCase().includes(kw)) score += 15;
        if (def.description?.toLowerCase().includes(kw)) score += 5;
        if (def.tags?.some((t) => t.toLowerCase().includes(kw))) score += 8;
        if (def.namespace?.toLowerCase().includes(kw)) score += 12;
      }
      if (score > 0) {
        results.push({ id, def, score });
      }
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }
  get(effectId) {
    return this.effects.get(effectId);
  }
  list(namespace) {
    const results = [];
    for (const [id, def] of this.effects) {
      if (namespace && def.namespace !== namespace) continue;
      results.push({ id, def });
    }
    return results;
  }
  get size() {
    return this.effects.size;
  }
};

// src/knowledge/shared-instances.ts
var INDEX_TTL_MS = 5e3;
var effectIndex = null;
var builtAt = 0;
var building = null;
async function getSharedEffectIndex() {
  if (effectIndex && Date.now() - builtAt < INDEX_TTL_MS) return effectIndex;
  if (building) return building;
  building = (async () => {
    const index = new EffectIndex();
    await index.initialize(getConfig().effectsDir);
    effectIndex = index;
    builtAt = Date.now();
    return index;
  })();
  try {
    return await building;
  } finally {
    building = null;
  }
}
function invalidateSharedEffectIndex() {
  effectIndex = null;
  builtAt = 0;
}

// src/knowledge/shader-knowledge.ts
var TECHNIQUE_SYNONYMS = {
  noise: ["perlin", "simplex", "value noise", "fbm", "fractal", "organic", "procedural"],
  voronoi: ["cellular", "worley", "cell noise", "cells", "diagram"],
  kaleidoscope: ["mirror", "symmetry", "radial", "polar", "reflection"],
  blur: ["gaussian", "smooth", "bokeh", "defocus", "bloom"],
  distortion: ["warp", "twist", "bend", "deform", "displace"],
  feedback: ["delay", "echo", "trail", "persistence", "accumulate"],
  particle: ["points", "agent", "emit", "flow", "swarm"],
  gradient: ["ramp", "color ramp", "palette", "colormap", "interpolation", "blend", "mix"],
  sdf: ["signed distance", "distance field", "raymarching", "shapes"],
  glitch: ["digital", "error", "artifact", "corruption", "databend"],
  wave: ["sine", "cosine", "oscillation", "ripple", "interference"],
  pattern: ["tiling", "grid", "mosaic", "tessellation", "repeat"],
  color: ["hue", "saturation", "brightness", "hsv", "hsl", "palette", "rgb", "mix", "lerp"],
  "3d": ["tunnel", "perspective", "raymarching", "volumetric"],
  edge: ["sobel", "contour", "outline", "detection"],
  film: ["grain", "halftone", "dither", "scanline", "retro"],
  fbm: ["fractal brownian motion", "octaves", "layered noise", "turbulence"],
  simplex: ["perlin", "gradient noise", "coherent noise"],
  polar: ["radial", "angle", "atan", "circular", "spiral"],
  geometric: ["shapes", "sdf", "distance field", "circle", "polygon", "grid"],
  spiral: ["vortex", "swirl", "rotation", "twist"],
  animation: ["time", "motion", "movement", "animate", "loop", "sin", "cos", "TAU"],
  flow: ["curl", "vector field", "advection", "fluid", "stream"],
  warp: ["distort", "displacement", "domain warping", "deform"],
  rainbow: ["spectrum", "hsv rotation", "hue cycle", "chromatic"],
  filter: ["post-process", "image effect", "inputTex", "texture"],
  synth: ["generator", "procedural", "synthesizer"]
};
function expandQueryWithSynonyms(query) {
  const lower = query.toLowerCase();
  const expanded = [query];
  for (const [key, synonyms] of Object.entries(TECHNIQUE_SYNONYMS)) {
    if (lower.includes(key)) {
      expanded.push(...synonyms);
    }
    for (const syn of synonyms) {
      if (lower.includes(syn)) {
        expanded.push(key);
        break;
      }
    }
  }
  return expanded.join(" ");
}
var CURATED_KNOWLEDGE = [
  {
    id: "dsl-basics",
    title: "DSL Basics",
    content: "The shader DSL uses function chaining: search namespace, call effect function with args, write to output buffer (o0), render. Example: search synth\\nnoise(seed: 1).write(o0)\\nrender(o0)",
    category: "dsl",
    tags: ["dsl", "syntax", "basics"]
  },
  {
    id: "effect-definition-format",
    title: "Effect Definition Format",
    content: "Effects are defined as definition.json or definition.js files in namespace directories. They specify func (camelCase name), namespace, description, globals (uniforms with type/min/max/default), and passes (shader programs with inputs/outputs).",
    category: "effect-definition",
    tags: ["definition", "format", "structure"]
  },
  {
    id: "glsl-uniforms",
    title: "GLSL Uniform Wiring",
    content: "Uniforms in GLSL shaders must be declared with matching names from the globals section. Common system uniforms: resolution (vec2), time (float), aspect (float). Custom uniforms use the uniform field from globals.",
    category: "glsl",
    tags: ["glsl", "uniforms", "wiring"]
  },
  {
    id: "noise-techniques",
    title: "Noise Generation Techniques",
    content: "Common noise types: Perlin (smooth gradient noise), Simplex (improved Perlin), Voronoi/Worley (cellular patterns), Value noise (interpolated random), FBM (fractal Brownian motion, layered octaves). Use timeCircle pattern for seamless looping: vec2 tc = vec2(cos(time*TAU), sin(time*TAU)) * radius.",
    category: "technique",
    tags: ["noise", "perlin", "simplex", "voronoi", "fbm"]
  },
  {
    id: "sdf-techniques",
    title: "Signed Distance Field Techniques",
    content: "SDFs define shapes by distance to surface. Common operations: union (min), intersection (max), subtraction, smooth blend (smin). Raymarching steps along ray, checking SDF distance. Common shapes: sphere, box, torus, cylinder.",
    category: "technique",
    tags: ["sdf", "raymarching", "distance field", "shapes"]
  },
  {
    id: "color-manipulation",
    title: "Color Manipulation",
    content: "HSV conversion: rgb2hsv/hsv2rgb. Color grading: lift/gamma/gain, temperature/tint. Palette generation: cosine gradient (a + b*cos(2*PI*(c*t+d))). Tone mapping: ACES, Reinhard. Blending modes: multiply, screen, overlay, soft light.",
    category: "technique",
    tags: ["color", "hsv", "palette", "grading", "blend"]
  },
  {
    id: "domain-warping",
    title: "Domain Warping",
    content: "Domain warping deforms UV coordinates before sampling: warpedUV = uv + noise(uv) * amount. Layered warping: apply noise multiple times. Feedback warping: use previous frame as warp source. Creates organic, fluid patterns.",
    category: "technique",
    tags: ["warp", "distortion", "domain", "organic"]
  },
  {
    id: "filter-effects",
    title: "Filter Effect Patterns",
    content: "Filter effects process an input texture (inputTex). They receive the previous pass output and modify it. Common filters: blur (gaussian kernel), sharpen, edge detection (Sobel), color grading, distortion. Must declare inputTex in pass inputs.",
    category: "effect-pattern",
    tags: ["filter", "input", "processing", "post-processing"]
  },
  {
    id: "compute-shaders",
    title: "Compute Shader Patterns",
    content: 'Compute shaders run on GPU without rasterization. Used for GPGPU tasks: particle simulation, cellular automata, physics. Declare pass type as "compute" or "gpgpu". Access storage buffers and textures directly.',
    category: "technique",
    tags: ["compute", "gpgpu", "simulation", "particles"]
  },
  {
    id: "animation-patterns",
    title: "Seamless Animation Patterns",
    content: "For seamless looping: use timeCircle (cos/sin of time*TAU*radius). Avoid raw time in noise - use periodic functions. The Bleuje pattern: t = fract(time), animate properties with sin/cos of t*TAU. Integer transitions with floor(t) for discrete changes.",
    category: "technique",
    tags: ["animation", "loop", "seamless", "time"]
  },
  {
    id: "pipeline-architecture",
    title: "Rendering Pipeline Architecture",
    content: "The rendering pipeline processes passes sequentially. Each pass has inputs (textures from previous passes or external sources), outputs (render targets), and a shader program. The pipeline manages texture allocation, uniform propagation, and frame timing.",
    category: "pipeline",
    tags: ["pipeline", "architecture", "rendering", "passes"]
  },
  {
    id: "common-errors",
    title: "Common Shader Errors",
    content: "Blank output: missing write to output color, wrong output variable name. Static animation: time not connected or not used. Monochrome: using single channel without color mapping. Compilation error: type mismatches, undeclared variables, missing precision qualifiers.",
    category: "errors",
    tags: ["errors", "debug", "troubleshooting", "fix"]
  }
];

// src/tools/knowledge/search-effects.ts
var searchEffectsSchema = {
  query: z13.string().describe("Search query - concept, algorithm, tag, or visual style"),
  limit: z13.number().optional().default(10).describe("Maximum results")
};
function registerSearchEffects(server2) {
  server2.tool(
    "searchEffects",
    "Search effect library by concept, tag, algorithm, or visual style. Synonym expansion.",
    searchEffectsSchema,
    async (args) => {
      const index = await getSharedEffectIndex();
      const expanded = expandQueryWithSynonyms(args.query);
      const results = index.search(expanded, args.limit);
      const output = {
        query: args.query,
        results: results.map((r) => ({
          id: r.id,
          description: r.def.description || "",
          tags: r.def.tags || [],
          score: r.score
        })),
        total: results.length
      };
      return toolResult(output);
    }
  );
}

// src/tools/knowledge/analyze-effect.ts
import { z as z14 } from "zod";
import { readFileSync as readFileSync8, readdirSync as readdirSync6, existsSync as existsSync9 } from "fs";
import { join as join10 } from "path";
var analyzeEffectSchema = {
  effect_id: z14.string().describe('Effect ID (e.g., "synth/noise")')
};
function registerAnalyzeEffect(server2) {
  server2.tool(
    "analyzeEffect",
    "Deep-dive into an effect: full definition, shader source, uniforms, passes.",
    analyzeEffectSchema,
    async (args) => {
      const config2 = getConfig();
      const effectDir = resolveEffectDir(args.effect_id, config2.effectsDir);
      if (!existsSync9(effectDir)) {
        return toolResult({ error: `Effect not found: ${args.effect_id}` });
      }
      let def;
      try {
        def = loadEffectDefinition(effectDir);
      } catch (err) {
        return toolResult({ error: err.message });
      }
      const shaders = {};
      const glslDir = join10(effectDir, "glsl");
      const wgslDir = join10(effectDir, "wgsl");
      if (existsSync9(glslDir)) {
        for (const f of readdirSync6(glslDir).filter((f2) => f2.endsWith(".glsl"))) {
          shaders[`glsl/${f}`] = readFileSync8(join10(glslDir, f), "utf-8");
        }
      }
      if (existsSync9(wgslDir)) {
        for (const f of readdirSync6(wgslDir).filter((f2) => f2.endsWith(".wgsl"))) {
          shaders[`wgsl/${f}`] = readFileSync8(join10(wgslDir, f), "utf-8");
        }
      }
      const output = {
        effectId: args.effect_id,
        name: def.name,
        description: def.description,
        namespace: def.namespace,
        tags: def.tags || [],
        globals: def.globals,
        passes: def.passes,
        format: def.format,
        shaders
      };
      return toolResult(output);
    }
  );
}

// src/tools/knowledge/search-source.ts
import { z as z15 } from "zod";

// src/knowledge/glsl-index.ts
import { readdir as readdir2, readFile, stat as stat2 } from "fs/promises";
import { existsSync as existsSync10 } from "fs";
import { join as join11 } from "path";
var GlslIndex = class {
  files = /* @__PURE__ */ new Map();
  initialized = false;
  async initialize(effectsDir) {
    if (this.initialized) return;
    if (!existsSync10(effectsDir)) return;
    const namespaces = await readdir2(effectsDir);
    for (const ns of namespaces) {
      const nsDir = join11(effectsDir, ns);
      if (!(await stat2(nsDir)).isDirectory()) continue;
      const effects = await readdir2(nsDir);
      for (const effect of effects) {
        const effectDir = join11(nsDir, effect);
        if (!(await stat2(effectDir)).isDirectory()) continue;
        const glslDir = join11(effectDir, "glsl");
        if (!existsSync10(glslDir)) continue;
        const glslFiles = (await readdir2(glslDir)).filter((f) => f.endsWith(".glsl"));
        for (const gf of glslFiles) {
          const filePath = join11(glslDir, gf);
          const content = await readFile(filePath, "utf-8");
          const effectId = `${ns}/${effect}`;
          this.files.set(`${effectId}/${gf}`, { effectId, content, file: gf });
        }
      }
    }
    this.initialized = true;
  }
  search(query, contextLines = 5, limit = 10) {
    let regex;
    try {
      regex = new RegExp(query, "gi");
    } catch {
      regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    }
    const results = [];
    for (const [, entry] of this.files) {
      const lines = entry.content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (!regex.test(lines[i])) continue;
        regex.lastIndex = 0;
        const start = Math.max(0, i - contextLines);
        const end = Math.min(lines.length, i + contextLines + 1);
        const contextArr = lines.slice(start, end).map((line, idx) => {
          const lineNum = start + idx + 1;
          const marker = lineNum === i + 1 ? ">>>" : "   ";
          return `${marker} ${lineNum}: ${line}`;
        });
        results.push({
          effectId: entry.effectId,
          file: entry.file,
          lineNumber: i + 1,
          matchLine: lines[i].trim(),
          context: contextArr.join("\n")
        });
        i += contextLines;
        if (results.length >= limit) return results;
      }
    }
    return results;
  }
  get size() {
    return this.files.size;
  }
};

// src/tools/knowledge/search-source.ts
var glslIndex = null;
async function getGlslIndex() {
  if (!glslIndex) {
    glslIndex = new GlslIndex();
    await glslIndex.initialize(getConfig().effectsDir);
  }
  return glslIndex;
}
var searchShaderSourceSchema = {
  query: z15.string().describe("Regex search pattern"),
  context_lines: z15.number().optional().default(5).describe("Lines of context around match"),
  limit: z15.number().optional().default(10).describe("Maximum results")
};
function registerSearchShaderSource(server2) {
  server2.tool(
    "searchShaderSource",
    "Regex search through GLSL source code across all effects. Returns matching snippets with context.",
    searchShaderSourceSchema,
    async (args) => {
      const index = await getGlslIndex();
      const results = index.search(args.query, args.context_lines, args.limit);
      const output = {
        query: args.query,
        matchCount: results.length,
        results: results.map((r) => ({
          effectId: r.effectId,
          file: r.file,
          lineNumber: r.lineNumber,
          matchLine: r.matchLine,
          context: r.context
        }))
      };
      return toolResult(output);
    }
  );
}

// src/tools/knowledge/search-knowledge.ts
import { z as z16 } from "zod";

// src/knowledge/vector-db.ts
var STOP_WORDS = /* @__PURE__ */ new Set([
  "a",
  "an",
  "the",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "can",
  "shall",
  "to",
  "of",
  "in",
  "for",
  "on",
  "with",
  "at",
  "by",
  "from",
  "as",
  "into",
  "through",
  "during",
  "before",
  "after",
  "above",
  "below",
  "between",
  "out",
  "off",
  "over",
  "under",
  "again",
  "further",
  "then",
  "once",
  "here",
  "there",
  "when",
  "where",
  "why",
  "how",
  "all",
  "each",
  "every",
  "both",
  "few",
  "more",
  "most",
  "other",
  "some",
  "such",
  "no",
  "nor",
  "not",
  "only",
  "own",
  "same",
  "so",
  "than",
  "too",
  "very",
  "and",
  "but",
  "or",
  "if",
  "it",
  "its",
  "this",
  "that",
  "these",
  "those",
  "i",
  "me",
  "my",
  "we",
  "us",
  "you",
  "your",
  "he",
  "him",
  "his",
  "she",
  "her",
  "they",
  "them",
  "their",
  "what",
  "which",
  "who",
  "whom"
]);
function tokenize(text) {
  return text.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}
function termFrequency(tokens) {
  const freq = /* @__PURE__ */ new Map();
  for (const t of tokens) {
    freq.set(t, (freq.get(t) || 0) + 1);
  }
  const len = tokens.length || 1;
  for (const [k, v] of freq) {
    freq.set(k, v / len);
  }
  return freq;
}
function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (const [k, v] of a) {
    dot += v * (b.get(k) || 0);
    normA += v * v;
  }
  for (const [, v] of b) {
    normB += v * v;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
var ShaderKnowledgeDB = class {
  documents = /* @__PURE__ */ new Map();
  tfVectors = /* @__PURE__ */ new Map();
  documentFrequency = /* @__PURE__ */ new Map();
  totalDocuments = 0;
  indexBuilt = false;
  addDocument(doc) {
    this.documents.set(doc.id, doc);
    this.indexBuilt = false;
  }
  addDocuments(docs) {
    for (const doc of docs) {
      this.documents.set(doc.id, doc);
    }
    this.indexBuilt = false;
  }
  buildIndex() {
    this.documentFrequency.clear();
    this.tfVectors.clear();
    this.totalDocuments = this.documents.size;
    for (const [id, doc] of this.documents) {
      const text = `${doc.title} ${doc.content} ${(doc.tags || []).join(" ")}`;
      const tokens = tokenize(text);
      const tf = termFrequency(tokens);
      this.tfVectors.set(id, tf);
      for (const term of tf.keys()) {
        this.documentFrequency.set(term, (this.documentFrequency.get(term) || 0) + 1);
      }
    }
    for (const [id, tf] of this.tfVectors) {
      const tfidf = /* @__PURE__ */ new Map();
      for (const [term, tfVal] of tf) {
        const df = this.documentFrequency.get(term) || 0;
        const idf = Math.log((this.totalDocuments + 1) / (df + 1)) + 1;
        tfidf.set(term, tfVal * idf);
      }
      this.tfVectors.set(id, tfidf);
    }
    this.indexBuilt = true;
  }
  search(query, options = {}) {
    if (!this.indexBuilt) this.buildIndex();
    const { limit = 10, category, minScore = 0.05 } = options;
    const queryTokens = tokenize(query);
    const queryTf = termFrequency(queryTokens);
    const queryVec = /* @__PURE__ */ new Map();
    for (const [term, tfVal] of queryTf) {
      const df = this.documentFrequency.get(term) || 0;
      const idf = Math.log((this.totalDocuments + 1) / (df + 1)) + 1;
      queryVec.set(term, tfVal * idf);
    }
    const results = [];
    for (const [id, docVec] of this.tfVectors) {
      const doc = this.documents.get(id);
      if (category && doc.category !== category) continue;
      const score = cosineSimilarity(queryVec, docVec);
      if (score >= minScore) {
        results.push({
          id: doc.id,
          title: doc.title,
          content: doc.content,
          category: doc.category,
          score: Math.round(score * 1e3) / 1e3,
          snippet: this.extractSnippet(doc.content, queryTokens),
          source: doc.source,
          tags: doc.tags
        });
      }
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }
  extractSnippet(content, queryTokens, snippetLength = 200) {
    const lower = content.toLowerCase();
    let bestStart = 0;
    let bestScore = 0;
    const words = content.split(/\s+/);
    for (let i = 0; i < words.length; i++) {
      let score = 0;
      const windowEnd = Math.min(i + 30, words.length);
      for (let j = i; j < windowEnd; j++) {
        const w = words[j].toLowerCase().replace(/[^\w]/g, "");
        if (queryTokens.includes(w)) score++;
      }
      if (score > bestScore) {
        bestScore = score;
        bestStart = content.indexOf(words[i]);
      }
    }
    const start = Math.max(0, bestStart);
    const end = Math.min(content.length, start + snippetLength);
    let snippet = content.slice(start, end).trim();
    if (start > 0) snippet = "..." + snippet;
    if (end < content.length) snippet += "...";
    return snippet;
  }
  getCategories() {
    const cats = /* @__PURE__ */ new Set();
    for (const doc of this.documents.values()) {
      cats.add(doc.category);
    }
    return Array.from(cats);
  }
  getByCategory(category) {
    return Array.from(this.documents.values()).filter((doc) => doc.category === category);
  }
  getStats() {
    const categoryCounts = {};
    for (const doc of this.documents.values()) {
      const cat = doc.category || "uncategorized";
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    }
    return {
      totalDocuments: this.documents.size,
      totalTerms: this.documentFrequency.size,
      indexed: this.indexBuilt,
      categories: categoryCounts
    };
  }
};

// src/tools/knowledge/search-knowledge.ts
var db = null;
function getDB() {
  if (!db) {
    db = new ShaderKnowledgeDB();
    db.addDocuments(CURATED_KNOWLEDGE);
    db.buildIndex();
  }
  return db;
}
var searchShaderKnowledgeSchema = {
  query: z16.string().describe("Natural language query"),
  category: z16.string().optional().describe("Filter by category (dsl, glsl, technique, errors, etc.)"),
  limit: z16.number().optional().default(5).describe("Maximum results")
};
function registerSearchShaderKnowledge(server2) {
  server2.tool(
    "searchShaderKnowledge",
    "Semantic search over curated shader documentation: DSL grammar, GLSL techniques, effect patterns, common errors.",
    searchShaderKnowledgeSchema,
    async (args) => {
      const database = getDB();
      const expanded = expandQueryWithSynonyms(args.query);
      const results = database.search(expanded, {
        limit: args.limit,
        category: args.category,
        minScore: 0.05
      });
      const output = {
        query: args.query,
        category: args.category || "all",
        matchCount: results.length,
        databaseStats: database.getStats(),
        results: results.map((r, i) => ({
          title: r.title,
          category: r.category,
          score: r.score,
          snippet: r.snippet,
          tags: r.tags,
          content: i < 3 ? r.content : void 0
        }))
      };
      return toolResult(output);
    }
  );
}

// src/tools/utility/list-effects.ts
import { z as z17 } from "zod";
var listEffectsSchema = {
  namespace: z17.string().optional().describe("Filter by namespace")
};
function registerListEffects(server2) {
  server2.tool(
    "listEffects",
    "List all effects, optionally filtered by namespace.",
    listEffectsSchema,
    async (args) => {
      const index = await getSharedEffectIndex();
      const effects = index.list(args.namespace);
      const output = {
        namespace: args.namespace || "all",
        count: effects.length,
        effects: effects.map((e) => ({
          id: e.id,
          name: e.def.name || e.def.func,
          description: e.def.description || "",
          tags: e.def.tags || [],
          passes: e.def.passes.length
        }))
      };
      return toolResult(output);
    }
  );
}

// src/tools/utility/generate-manifest.ts
import { readdirSync as readdirSync7, readFileSync as readFileSync9, writeFileSync, existsSync as existsSync11, statSync as statSync2 } from "fs";
import { join as join12 } from "path";
var generateManifestSchema = {};
var DESCRIPTION_RE = /description[:\s=]+"((?:[^"\\]|\\.)*)"|description[:\s=]+'((?:[^'\\]|\\.)*)'/;
var EXTERNAL_TEXTURE_RE = /externalTexture[:\s=]+"((?:[^"\\]|\\.)*)"|externalTexture[:\s=]+'((?:[^'\\]|\\.)*)'/;
var EXTERNAL_MESH_RE = /externalMesh[:\s=]+"((?:[^"\\]|\\.)*)"|externalMesh[:\s=]+'((?:[^'\\]|\\.)*)'/;
var TAGS_RE = /\btags\s*[:=]\s*\[([^\]]*)\]/;
var TEX_SURFACE_RE = /\btex\s*[:=]\s*\{[^}]*type\s*[:=]\s*["']surface["']/s;
var PIPELINE_INPUTS = /* @__PURE__ */ new Set([
  "inputTex",
  "inputTex3d",
  "inputXyz",
  "inputVel",
  "inputRgba",
  "o0",
  "o1",
  "o2",
  "o3",
  "o4",
  "o5",
  "o6",
  "o7"
]);
var AGENT_STATE_SURFACES = /* @__PURE__ */ new Set([
  "global_xyz0",
  "global_vel0",
  "global_rgba0"
]);
function readDefinition(effectDir) {
  const defFile = join12(effectDir, "definition.js");
  if (!existsSync11(defFile)) return null;
  try {
    return readFileSync9(defFile, "utf-8");
  } catch {
    return null;
  }
}
function extractMatch(content, re) {
  const m = content.match(re);
  if (!m) return null;
  const raw = m[1] !== void 0 ? m[1] : m[2];
  if (!raw) return null;
  return raw.replace(/\\"/g, '"').replace(/\\'/g, "'");
}
function extractTags(content) {
  const m = content.match(TAGS_RE);
  if (!m) return null;
  const tags = [];
  for (const tm of m[1].matchAll(/["']([^"']+)["']/g)) {
    tags.push(tm[1]);
  }
  return tags.length ? tags : null;
}
function isStarterEffect(content) {
  if (/\bstarter\s*[:=]\s*true\b/.test(content)) return true;
  if (/\bstarter\s*[:=]\s*false\b/.test(content)) return false;
  const passesMatch = content.match(/passes\s*[=:]\s*\[/);
  if (!passesMatch) return true;
  const texturesMatch = content.match(/textures\s*[:=]\s*\{[\s\S]*?\}/);
  let definesAgentSurfaces = false;
  if (texturesMatch) {
    for (const surface of AGENT_STATE_SURFACES) {
      if (texturesMatch[0].includes(surface)) {
        definesAgentSurfaces = true;
        break;
      }
    }
  }
  const inputsSections = content.matchAll(/inputs:\s*\{[\s\S]*?\}/g);
  for (const inputsMatch of inputsSections) {
    const inputs = inputsMatch[0];
    for (const pipelineInput of PIPELINE_INPUTS) {
      const pattern = new RegExp(`:\\s*["']${pipelineInput}["']`);
      if (pattern.test(inputs)) return false;
    }
    if (!definesAgentSurfaces) {
      for (const surface of AGENT_STATE_SURFACES) {
        const pattern = new RegExp(`:\\s*["']${surface}["']`);
        if (pattern.test(inputs)) return false;
      }
    }
  }
  return true;
}
function scanShaders(effectDir) {
  const result = { glsl: {}, wgsl: {} };
  const glslDir = join12(effectDir, "glsl");
  if (existsSync11(glslDir)) {
    for (const name of readdirSync7(glslDir)) {
      if (!statSync2(join12(glslDir, name)).isFile()) continue;
      if (name.endsWith(".glsl")) {
        result.glsl[name.slice(0, -5)] = "combined";
      } else if (name.endsWith(".vert")) {
        const stem = name.slice(0, -5);
        if (!(stem in result.glsl)) result.glsl[stem] = {};
        if (typeof result.glsl[stem] === "object") result.glsl[stem].v = 1;
      } else if (name.endsWith(".frag")) {
        const stem = name.slice(0, -5);
        if (!(stem in result.glsl)) result.glsl[stem] = {};
        if (typeof result.glsl[stem] === "object") result.glsl[stem].f = 1;
      }
    }
  }
  const wgslDir = join12(effectDir, "wgsl");
  if (existsSync11(wgslDir)) {
    for (const name of readdirSync7(wgslDir)) {
      if (!statSync2(join12(wgslDir, name)).isFile()) continue;
      if (name.endsWith(".wgsl")) {
        result.wgsl[name.slice(0, -5)] = 1;
      }
    }
  }
  if (!Object.keys(result.glsl).length) delete result.glsl;
  if (!Object.keys(result.wgsl).length) delete result.wgsl;
  return result;
}
function sortKeys(obj) {
  if (Array.isArray(obj)) return obj.map(sortKeys);
  if (obj && typeof obj === "object") {
    const sorted = {};
    for (const key of Object.keys(obj).sort()) sorted[key] = sortKeys(obj[key]);
    return sorted;
  }
  return obj;
}
function registerGenerateManifest(server2) {
  server2.tool(
    "generateManifest",
    "Rebuild effect manifest by scanning effects directory.",
    generateManifestSchema,
    async () => {
      const config2 = getConfig();
      const effectsDir = config2.effectsDir;
      if (!existsSync11(effectsDir)) {
        return toolResult({ error: `Effects directory not found: ${effectsDir}` });
      }
      const manifest = {};
      const namespaces = readdirSync7(effectsDir).sort();
      for (const ns of namespaces) {
        const nsDir = join12(effectsDir, ns);
        if (!statSync2(nsDir).isDirectory()) continue;
        const entries = readdirSync7(nsDir).sort();
        for (const entry of entries) {
          const effectDir = join12(nsDir, entry);
          if (!statSync2(effectDir).isDirectory()) continue;
          const content = readDefinition(effectDir);
          if (!content) continue;
          const effectId = `${ns}/${entry}`;
          const effectManifest = scanShaders(effectDir);
          const description = extractMatch(content, DESCRIPTION_RE);
          if (description) effectManifest.description = description;
          const externalTexture = extractMatch(content, EXTERNAL_TEXTURE_RE);
          if (externalTexture) effectManifest.externalTexture = externalTexture;
          const externalMesh = extractMatch(content, EXTERNAL_MESH_RE);
          if (externalMesh) effectManifest.externalMesh = externalMesh;
          if (TEX_SURFACE_RE.test(content)) effectManifest.hasTex = true;
          effectManifest.starter = isStarterEffect(content);
          const tags = extractTags(content);
          if (tags) effectManifest.tags = tags;
          manifest[effectId] = effectManifest;
        }
      }
      const manifestPath = join12(effectsDir, "manifest.json");
      writeFileSync(manifestPath, JSON.stringify(sortKeys(manifest)));
      invalidateSharedEffectIndex();
      return toolResult({
        status: "ok",
        path: manifestPath,
        effectCount: Object.keys(manifest).length
      });
    }
  );
}

// src/version.ts
import { createRequire } from "module";
var require2 = createRequire(import.meta.url);
var pkg = require2("../package.json");
var VERSION = pkg.version;

// src/index.ts
var config = getConfig();
setMaxBrowsers(config.maxBrowsers);
var server = new McpServer({
  name: "shade-mcp",
  version: VERSION
});
registerCompileEffect(server);
registerRenderEffectFrame(server);
registerDescribeEffectFrame(server);
registerBenchmarkEffectFPS(server);
registerTestUniformResponsiveness(server);
registerTestNoPassthrough(server);
registerTestPixelParity(server);
registerRunDslProgram(server);
registerCheckEffectStructure(server);
registerCheckAlgEquiv(server);
registerCompareShaders(server);
registerAnalyzeBranching(server);
registerSearchEffects(server);
registerAnalyzeEffect(server);
registerSearchShaderSource(server);
registerSearchShaderKnowledge(server);
registerListEffects(server);
registerGenerateManifest(server);
var shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  await closeAllSessions();
  await server.close().catch(() => {
  });
  process.exit(0);
}
process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});
var transport = new StdioServerTransport();
await server.connect(transport);
//# sourceMappingURL=index.js.map