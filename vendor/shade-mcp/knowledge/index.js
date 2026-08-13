// src/knowledge/effect-index.ts
import { readdir, stat } from "fs/promises";
import { existsSync as existsSync2 } from "fs";
import { join as join2 } from "path";

// src/formats/index.ts
import { existsSync, readFileSync as readFileSync2 } from "fs";
import { join } from "path";

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
import { readFileSync } from "fs";
function parseDefinitionJs(filePath, effectDir) {
  const source = readFileSync(filePath, "utf-8");
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
  const jsonPath = join(effectDir, "definition.json");
  if (existsSync(jsonPath)) {
    const raw = JSON.parse(readFileSync2(jsonPath, "utf-8"));
    return parseDefinitionJson(raw, effectDir);
  }
  const jsPath = join(effectDir, "definition.js");
  if (existsSync(jsPath)) {
    return parseDefinitionJs(jsPath, effectDir);
  }
  throw new Error(`No definition.json or definition.js found in ${effectDir}`);
}

// src/knowledge/effect-index.ts
var EffectIndex = class {
  effects = /* @__PURE__ */ new Map();
  initialized = false;
  async initialize(effectsDir) {
    if (this.initialized) return;
    if (!existsSync2(effectsDir)) return;
    const entries = await readdir(effectsDir);
    for (const ns of entries) {
      const nsDir = join2(effectsDir, ns);
      if (!(await stat(nsDir)).isDirectory()) continue;
      const effects = await readdir(nsDir);
      for (const effect of effects) {
        const effectDir = join2(nsDir, effect);
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

// src/knowledge/glsl-index.ts
import { readdir as readdir2, readFile, stat as stat2 } from "fs/promises";
import { existsSync as existsSync3 } from "fs";
import { join as join3 } from "path";
var GlslIndex = class {
  files = /* @__PURE__ */ new Map();
  initialized = false;
  async initialize(effectsDir) {
    if (this.initialized) return;
    if (!existsSync3(effectsDir)) return;
    const namespaces = await readdir2(effectsDir);
    for (const ns of namespaces) {
      const nsDir = join3(effectsDir, ns);
      if (!(await stat2(nsDir)).isDirectory()) continue;
      const effects = await readdir2(nsDir);
      for (const effect of effects) {
        const effectDir = join3(nsDir, effect);
        if (!(await stat2(effectDir)).isDirectory()) continue;
        const glslDir = join3(effectDir, "glsl");
        if (!existsSync3(glslDir)) continue;
        const glslFiles = (await readdir2(glslDir)).filter((f) => f.endsWith(".glsl"));
        for (const gf of glslFiles) {
          const filePath = join3(glslDir, gf);
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

// src/knowledge/innate-knowledge.ts
var INNATE_SHADER_KNOWLEDGE = `## NOISEMAKER SHADER SYSTEM - INNATE KNOWLEDGE

### CURRENT CAPABILITIES - SINGLE-PASS EFFECTS
You excel at: procedural noise, color palettes, animated patterns, domain warping, kaleidoscope, fractals, basic 3D perspective (grids, tunnels, starfields).
Possible but not your forte: complex raymarching/SDF scenes - you can try, results may vary.
NAMESPACE CONSTRAINT: NEVER use synth3d, filter3d, or points namespaces - these require multi-pass rendering not supported in current UI. Stick to synth/filter/mixer.
If user asks for particles or 3D volumes, explain the namespace limitation and offer single-pass alternatives.

## NOISE ANIMATION - THE TIMECIRCLE PATTERN

When animating noise, ALWAYS use the timeCircle pattern:

\`\`\`glsl
// STANDARD LOOPING NOISE SETUP - copy this exactly
float t = time * TAU;
vec2 timeCircle = vec2(cos(t), sin(t));

// Use timeCircle in noise coordinates:
float n = noise(uv * scale + timeCircle * 0.5);

// Or for 4D noise:
float n = noise4D(vec4(uv * scale, timeCircle));
\`\`\`

This is the ONLY pattern for animated noise. There are no alternatives.

### THE LAWS (NEVER VIOLATE)
1. **ALL animation MUST use sin() or cos() or periodicValue()**: These are the ONLY functions where both VALUE and DERIVATIVE loop. No linear time, no fract(), no mod().
2. **ALL noise with time MUST use circle-sampling**: \`vec2(cos(time*TAU), sin(time*TAU))\` as noise coordinates.
3. **Your effects = USER namespace**: DSL must be \`search user\\nyourEffect().write(o0)\\nrender(o0)\`
4. **Uniforms must match**: Every uniform in definition.js \u2194 declared in GLSL. Types: float\u2192float, vec3\u2192vec3, boolean\u2192bool
5. **fragColor required**: Must set \`out vec4 fragColor\` or output is black.

##  WILL IT LOOP - CRITICAL ANIMATION RULES

**This is THE most important section. Master it completely.**

### Core Definition
Treat \`time\` as **1-periodic** on **[0, 1]**: \`t=1\` must be IDENTICAL to \`t=0\`.
All time-driven values must be continuous across the boundary, and should be smooth enough that there is NO visible "pop" at the seam.

### The Mental Model (Bleuje Pattern)
"A periodic function plus an offset/delay, where **everything** uses the same loopable time basis and each element varies via an offset."
- Reference: https://bleuje.com/tutorial2/

### WHY LOOPS FAIL - The Derivative Rule
Matching value(0) == value(1) is **NOT ENOUGH**!
The **velocity/derivative** must ALSO be continuous:
- value(0) == value(1)  \u2190 position matches
- value'(0) == value'(1) \u2190 velocity matches (no "hard reset" feel)

**sin() and cos() are the ONLY functions where both VALUE and DERIVATIVE loop perfectly.**
No linear time, no fract(), no mod(), no smoothstep(), no custom easing.

### HARD REQUIREMENTS (Verify ALL Before Shipping)

1. **SEAM EQUALITY + DERIVATIVE CONTINUITY**
   - For EVERY animated scalar/vector: value(0) == value(1) AND value'(0) == value'(1)
   - If the value controls motion, the seam must not create a visible kink
   - Prefer smooth periodic functions (sin/cos families) over piecewise or modulo-based waveforms

2. **ROTATION MUST COMPLETE INTEGER TURNS**
   - Rotations must complete N full turns where N is an integer (1, 2, 3...)
   - Pattern: \`angle = float(N) * TAU * time\`
   - Examples: \`angle = TAU * time\` (1 turn), \`angle = 2.0 * TAU * time\` (2 turns)

3. **TRANSLATION MUST RETURN EXACTLY TO START**
   - Moving elements must return to starting point at t=1
   - Use circular motion: \`pos = start + radius * vec2(cos(TAU * time), sin(TAU * time))\`
   - Or oscillation: \`pos = start + dir * (amplitude * sin(TAU * time))\`

4. **USE TAU FOR PERIODIC MAPPING**
   - Any mapping from loop time to an angle must use TAU (2\u03C0), not \u03C0 or degrees
   - "Turns per loop" converts as: \`turns * TAU\`

5. **NOISE MUST USE TIMECIRCLE**
   - For animated noise, use the timeCircle pattern:
     \`\`\`glsl
     float t = time * TAU;
     vec2 tc = vec2(cos(t), sin(t));
     float n = noise(uv * scale + tc * 0.5);  // or noise4D(vec4(uv, tc))
     \`\`\`
   - Reference: https://bleuje.com/tutorial3/

### APPROVED LOOPING TECHNIQUES

**1. Periodic Function + Offset (Core Bleuje Pattern)**
Choose a 1-periodic function of time (period 1 in t \u2208 [0,1]), then apply an offset per-object:
\`\`\`glsl
float phase = time - offset;  // offset creates delay
float value = 0.5 + 0.5 * sin(phase * TAU);  // smooth 0\u21921\u21920
\`\`\`

**2. Looping Noise via Circle (Bleuje Tutorial 3)**
\`\`\`glsl
vec2 tc = vec2(cos(TAU * time), sin(TAU * time));
float n = noise4D(vec4(uv * scale, tc));
\`\`\`

### CORE HELPER FUNCTIONS (copy exactly)
\`\`\`glsl
#define TAU 6.28318530717958647692

float normalizedSine(float x) {
    return 0.5 + 0.5 * sin(x);
}

// The Bleuje periodic value: normalized_sine((time - offset) * TAU)
// Returns 0\u21921\u21920 smoothly over the loop
float periodicValue(float t, float offset) {
    return normalizedSine((t - offset) * TAU);
}

// Rotation with integer turns - N MUST be int
float loopedAngle(float t, float offsetTurns, int N, float angle0) {
    return angle0 + TAU * (offsetTurns + float(N) * t);
}

// Translation on circle - cyclesN MUST be int
vec2 loopedCircle(vec2 start, float t, float radius, float offsetTurns, int cyclesN) {
    float phase = offsetTurns + float(cyclesN) * t;
    return start + radius * vec2(cos(TAU * phase), sin(TAU * phase));
}

// Linear-looking oscillation - cyclesN MUST be int
vec2 loopedOscillate(vec2 start, vec2 dir, float t, float amp, float offsetTurns, int cyclesN) {
    float phase = offsetTurns + float(cyclesN) * t;
    return start + dir * (amp * sin(TAU * phase));
}

// Looping noise via time-circle (4D required for spatial variation)
float loopedNoise(vec2 p, float t, float scale, float offset, float speed) {
    float phase = (t * speed) + offset;
    vec2 tc = vec2(cos(TAU * phase), sin(TAU * phase));
    return noise4D(vec4(p * scale, tc));  // or simplex4D
}
\`\`\`

### ANIMATION PRIMITIVES - USE ONLY THESE

\`\`\`glsl
// For any animated value, use these patterns:
float t = time * TAU;

float pulse = 0.5 + 0.5 * sin(t);     // Smooth 0\u21921\u21920
float wave = sin(t);                   // Smooth -1\u21921\u2192-1
float angle = t;                       // Full rotation (1 turn)
float angle2 = t * 2.0;                // 2 full rotations
vec2 circular = vec2(cos(t), sin(t)); // Circular motion

// For noise: always use timeCircle
vec2 timeCircle = vec2(cos(t), sin(t));
float n = noise(uv * scale + timeCircle * 0.5);
\`\`\`

###  AGENT PRE-SHIP CHECKLIST

**You MUST perform LINE-BY-LINE verification in your thinking before calling create_effect.**

For EVERY line that contains "time", "t", or animation:

\`\`\`
Line [N]: [code]
  - Contains time? [yes/no]
  - Wrapped in sin/cos? [yes/no]
  - Has * TAU? [yes/no]
  - Multiplier is integer? [yes/no/N/A]
  VERDICT: [SAFE/UNSAFE - fix if unsafe]
\`\`\`

Then verify the global checks:
- [ ] **SEAM CHECK**: Does value(0) == value(1) for EVERY animated value?
- [ ] **DERIVATIVE CHECK**: Does value'(0) == value'(1)? (velocity matches at seam)
- [ ] **ROTATION CHECK**: Is every rotation N * TAU * time where N is INTEGER?
- [ ] **TRANSLATION CHECK**: Does every moving element return to start at t=1?
- [ ] **NOISE CHECK**: Is noise time-sampled via circle, NOT line?
- [ ] **BANNED PATTERN CHECK**: No fract(time), mod(time), uv+time, time*speed outside sin/cos?

**IF ANY CHECK FAILS, THE LOOP IS BROKEN. FIX IT BEFORE SHIPPING.**

### GLSL TEMPLATE (ALWAYS USE)
\`\`\`glsl
#version 300 es
precision highp float;
uniform float time;      // 0\u21921 looping
uniform vec2 resolution;
uniform float myUniform; // your customs
out vec4 fragColor;
#define TAU 6.28318530718

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    float t = time * TAU;
    // YOUR CODE HERE
    fragColor = vec4(color, 1.0);
}
\`\`\`

### FILTER TEMPLATE (when processing input)
\`\`\`glsl
uniform sampler2D inputTex;
void main() {
    ivec2 sz = textureSize(inputTex, 0);
    vec2 uv = gl_FragCoord.xy / vec2(sz);
    vec4 c = texture(inputTex, uv);
    fragColor = c;
}
\`\`\`

### NOISE FUNCTIONS (copy exactly)
\`\`\`glsl
float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p) {
    vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),
               mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
float fbm(vec2 p, int oct) {
    float v=0., a=.5;
    for(int i=0;i<oct;i++) { v+=a*noise(p); p*=2.; a*=.5; }
    return v;
}
\`\`\`

### VORONOI (copy exactly)
\`\`\`glsl
float voronoi(vec2 p, float jitter) {
    vec2 n = floor(p), f = fract(p);
    float d = 8.;
    for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++) {
        vec2 g = vec2(x,y);
        vec2 o = hash2(n+g) * jitter;
        d = min(d, length(g+o-f));
    }
    return d;
}
\`\`\`

### COLOR TECHNIQUES
\`\`\`glsl
// Palette interpolation
vec3 pal(float t,vec3 a,vec3 b,vec3 c,vec3 d){return a+b*cos(TAU*(c*t+d));}

// HSV\u2192RGB
vec3 hsv2rgb(vec3 c){vec4 K=vec4(1.,2./3.,1./3.,3.);vec3 p=abs(fract(c.xxx+K.xyz)*6.-K.www);return c.z*mix(K.xxx,clamp(p-K.xxx,0.,1.),c.y);}

// Rainbow cycle: hsv2rgb(vec3(time + uv.x, 1., 1.))
\`\`\`

### EFFECT TYPES & DSL PATTERNS
| Type | What it does | DSL Pattern |
|------|--------------|-------------|
| synth | Generates image from nothing | \`synth().write(o0); render(o0)\` |
| filter | Transforms input image | \`noise().filter().write(o0)\` |
| mixer | Blends multiple inputs | \`a.blend(b).write(o0)\` |
| feedback | Uses previous frame | reads from \`prev\` texture |

### UNIFORM WIRING
\`\`\`javascript
// definition.js format
globals: {
  speed: { type: "float", default: 1.0, min: 0.1, max: 5.0, uniform: "speed" },
  color1: { type: "vec3", default: [1,0.5,0], uniform: "color1" },
  octaves: { type: "int", default: 4, min: 1, max: 8, uniform: "octaves" }
}
\`\`\`

### COMMON MISTAKES \u2192 FIXES
| Symptom | Cause | Fix |
|---------|-------|-----|
| Black output | fragColor not set | Add \`fragColor = vec4(result, 1.0);\` |
| Jumping animation | Raw time usage | Use \`sin(time*TAU)\` not \`time\` |
| "Unknown effect" | Wrong namespace | Use \`search user\` in DSL |
| Static/frozen | No time in shader | Add \`time*TAU\` somewhere |
| Monochrome | No color mixing | Use \`mix(c1,c2,val)\` or HSV |
| Uniform ignored | Name mismatch | Match GLSL name to uniform: field |

### TOOL SEQUENCE (ALWAYS THIS ORDER)
1. \`create_effect(name, glsl, uniforms)\` \u2192 creates your effect
2. \`compile_dsl("search user\\nname().write(o0)\\nrender(o0)")\` \u2192 tests it
3. \`validate_effect()\` \u2192 checks output isn't blank/static

### QUICK REFERENCE
- Aspect ratio: \`resolution.x/resolution.y\`
- Center coords: \`uv - 0.5\` or \`(uv - 0.5) * vec2(aspect, 1.0)\`
- Polar: \`float a = atan(p.y, p.x); float r = length(p);\`
- Rotation: \`mat2(cos(a),-sin(a),sin(a),cos(a)) * p\`
- SDF circle: \`length(p) - radius\`
- Smooth edge: \`smoothstep(edge-blur, edge+blur, d)\`
`;
var CRITICAL_RULES = {
  generate: `
## CRITICAL RULES FOR SHADER GENERATION

###  THE DERIVATIVE RULE - WHY LOOPS FAIL

Matching value(0) == value(1) is **NOT ENOUGH**! The **velocity/derivative** must ALSO match:
- value(0) == value(1)   \u2190 position matches
- value'(0) == value'(1) \u2190 velocity matches (smooth motion through boundary)

If velocity doesn't match \u2192 **HARD RESET** at t\u22480.999 even if values match!
This is why fract(), mod(), smoothstep(), and linear time ALL fail - they have derivative discontinuities.

### THE BLEUJE PATTERN (Approved Looping Method)

Use a periodic function + offset. Mental model: "everything uses the same loopable time basis, each element varies via an offset."

**CORE HELPERS (copy exactly):**
\`\`\`glsl
const float TAU = 6.28318530717958647692;

float normalizedSine(float x) {
    return 0.5 + 0.5 * sin(x);
}

// The Bleuje periodic value: normalized_sine((time - offset) * TAU)
float periodicValue(float time, float offset) {
    return normalizedSine((time - offset) * TAU);
}
\`\`\`

### HARD REQUIREMENTS

1. **SEAM + DERIVATIVE**: value(0)==value(1) AND value'(0)==value'(1). sin/cos/periodicValue satisfy both.

2. **ROTATION**: Integer turns only
   - \`angle = angle0 + TAU * (offsetTurns + float(N) * time)\` where N is INTEGER

3. **TRANSLATION**: Oscillate or circle, never linear
   - Circle: \`start + radius * vec2(cos(TAU*phase), sin(TAU*phase))\`
   - Linear-looking: \`start + dir * (amplitude * sin(TAU*phase))\`

4. **NOISE**: Circle-sample (Bleuje tutorial 3)
   - \`vec2 tc = vec2(cos(TAU*time), sin(TAU*time)); noise4D(vec4(uv, tc));\`

\`\`\`glsl
//  CORRECT - smooth value AND velocity through boundary
float t = time * TAU;
float wave = sin(t);                              // Value AND derivative match
float pulse = 0.5 + 0.5 * sin(t);                // Normalized 0\u21921\u21920
vec2 circular = vec2(cos(t), sin(t)) * radius;   // Circular motion

// Multiple speeds - ALL integers!
float slow = sin(t);           // 1 cycle
float fast = sin(t * 2.0);     // 2 cycles
float faster = sin(t * 3.0);   // 3 cycles

// Animated noise - use timeCircle:
vec2 timeCircle = vec2(cos(t), sin(t));
float n = noise(uv * scale + timeCircle * 0.5);
\`\`\`

### Animation Checklist
- [ ] Using sin(time * TAU) or cos(time * TAU)?
- [ ] Cycle multipliers are integers (1, 2, 3...)?
- [ ] Noise uses timeCircle in coordinates?

### User Effect Namespace
Your created effects live in USER namespace, not synth/filter/etc.
\`\`\`
search user
myEffectName().write(o0)
render(o0)
\`\`\`

### Required GLSL Structure
\`\`\`glsl
#version 300 es
precision highp float;
precision highp int;

uniform float time;        // 0\u21921 looping - use sin(time*TAU)!
uniform vec2 resolution;
// Your custom uniforms here

out vec4 fragColor;

#define TAU 6.28318530718

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    float t = time * TAU;  // Convert to radians for sin/cos
    // ALL animation must use sin(t) or cos(t)!
    fragColor = vec4(color, 1.0);
}
\`\`\`
`,
  fix: `
##  COMMON FIXES

### "Unknown effect" Error
Your effect lives in USER namespace:
\`\`\`
search user          \u2190 REQUIRED for your effects
yourEffectName().write(o0)
render(o0)
\`\`\`

### Blank/Black Output
1. Check fragColor is being set
2. Check values aren't all 0.0
3. Add: \`fragColor = vec4(uv, 0.5, 1.0);\` to debug

### No Animation / Static
Replace raw \`time\` with \`sin(time * TAU)\`:
\`\`\`glsl
//  Static or jumping
float x = uv.x + time;

//  Smooth animation
float x = uv.x + sin(time * TAU) * 0.5;
\`\`\`

### Monochrome / No Color
Add color mixing:
\`\`\`glsl
vec3 color1 = vec3(1.0, 0.5, 0.0);  // orange
vec3 color2 = vec3(0.0, 0.5, 1.0);  // blue
vec3 finalColor = mix(color1, color2, value);
\`\`\`
`
};

// src/knowledge/search-helpers.ts
var dbInstance = null;
function getShaderKnowledgeDB() {
  if (!dbInstance) {
    dbInstance = new ShaderKnowledgeDB();
    dbInstance.addDocuments(CURATED_KNOWLEDGE);
    dbInstance.buildIndex();
  }
  return dbInstance;
}
function searchShaderKnowledge(query, options = {}) {
  const db = getShaderKnowledgeDB();
  const expandedQuery = expandQueryWithSynonyms(query);
  return db.search(expandedQuery, options);
}
function getKnowledgeByTopic(topic) {
  const db = getShaderKnowledgeDB();
  return db.getByCategory(topic);
}
function extractCodeBlocks(text) {
  const codeBlocks = [];
  const glslRegex = /```glsl\s*([\s\S]*?)```/gi;
  let match;
  while ((match = glslRegex.exec(text)) !== null) {
    if (match[1].trim().length > 20) codeBlocks.push(match[1].trim());
  }
  const genericRegex = /```\s*([\s\S]*?)```/gi;
  while ((match = genericRegex.exec(text)) !== null) {
    const code = match[1].trim();
    if ((code.includes("vec") || code.includes("float") || code.includes("fragColor")) && code.length > 20 && !codeBlocks.includes(code)) {
      codeBlocks.push(code);
    }
  }
  return codeBlocks;
}
function extractUniformsSummary(content) {
  const uniformsMatch = content.match(/globals["\s:]+\{([\s\S]*?)\}/i);
  if (!uniformsMatch) return "";
  const uniformsSection = uniformsMatch[1];
  const uniforms = [];
  const uniformPattern = /"?(\w+)"?\s*:\s*\{\s*"?type"?\s*:\s*"?(\w+)"?/g;
  let match;
  while ((match = uniformPattern.exec(uniformsSection)) !== null) {
    uniforms.push(`${match[1]}: ${match[2]}`);
  }
  return uniforms.length > 0 ? `Uniforms: ${uniforms.join(", ")}` : "";
}
function retrieveForAgent(query, phase, context = {}) {
  const db = getShaderKnowledgeDB();
  let result = CRITICAL_RULES[phase] || "";
  const expandedQuery = expandQueryWithSynonyms(query);
  let searchQuery = expandedQuery;
  if (context.technique) searchQuery += ` ${context.technique}`;
  if (context.error) searchQuery += ` fix ${context.error}`;
  const categoryBoosts = phase === "generate" ? { effect: 1.5, glsl: 1.3, technique: 1.2 } : { errors: 1.5, documentation: 1.2, glsl: 1.1 };
  const rawResults = db.search(searchQuery, { limit: 8, minScore: 0.03 });
  const boostedResults = rawResults.map((r) => ({ ...r, boostedScore: r.score * (categoryBoosts[r.category] || 1) })).sort((a, b) => b.boostedScore - a.boostedScore).slice(0, 4);
  if (boostedResults.length === 0) return result;
  result += "\n## RELEVANT EXAMPLES & PATTERNS\n\n";
  for (const r of boostedResults) {
    result += `### ${r.title || r.id} (${r.category})
`;
    const uniforms = extractUniformsSummary(r.content);
    if (uniforms) result += `${uniforms}
`;
    const dslMatch = r.content.match(/## Usage in DSL\s*```\s*([\s\S]*?)```/i);
    if (dslMatch) result += `DSL: \`${dslMatch[1].trim().replace(/\n/g, " \u2192 ")}\`
`;
    const codeBlocks = extractCodeBlocks(r.content);
    if (codeBlocks.length > 0) {
      result += `\`\`\`glsl
${codeBlocks.slice(0, 2).join("\n\n")}
\`\`\`
`;
    } else {
      const paragraphs = r.content.split(/\n\n+/).filter(
        (p) => p.length > 30 && !p.startsWith("#") && !p.startsWith("```")
      );
      if (paragraphs.length > 0) result += `${paragraphs[0].substring(0, 400)}
`;
    }
    result += "\n";
  }
  return result;
}

// src/knowledge/loop-safe-examples.ts
var LOOPING_EXAMPLES = [
  {
    name: "Animated Pulse Ring",
    technique: "basic",
    description: "Expanding ring with sin(time*TAU) animation",
    code: `#version 300 es
precision highp float;
uniform float time;
uniform vec2 resolution;
out vec4 fragColor;

#define TAU 6.283185307179586

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 center = uv - 0.5;
    float dist = length(center);

    // Animation: sin(time * TAU) loops perfectly [0->1->0]
    float t = time * TAU;
    float pulse = 0.5 + 0.5 * sin(t);  // 0->1->0 smoothly

    // Ring expands/contracts with pulse
    float ring = smoothstep(0.02, 0.0, abs(dist - pulse * 0.4));

    vec3 color = vec3(0.2, 0.8, 1.0) * ring;
    fragColor = vec4(color, 1.0);
}`
  },
  {
    name: "Rotating Gradient",
    technique: "rotation",
    description: "Full rotation using integer turn count",
    code: `#version 300 es
precision highp float;
uniform float time;
uniform vec2 resolution;
uniform float speed;
out vec4 fragColor;

#define TAU 6.283185307179586

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 center = uv - 0.5;

    // Get angle and rotate it
    float angle = atan(center.y, center.x);

    // CORRECT: Integer rotations (1 full turn per loop)
    // speed should be 1, 2, 3, etc for seamless loop
    float rotation = time * TAU * floor(speed);
    angle += rotation;

    // Create gradient based on rotated angle
    float gradient = 0.5 + 0.5 * sin(angle * 3.0);

    vec3 color = mix(vec3(1.0, 0.3, 0.5), vec3(0.3, 0.5, 1.0), gradient);
    fragColor = vec4(color, 1.0);
}`
  },
  {
    name: "Oscillating Noise",
    technique: "noise",
    description: "Noise with time-circle sampling (Bleuje method)",
    code: `#version 300 es
precision highp float;
uniform float time;
uniform vec2 resolution;
uniform float scale;
out vec4 fragColor;

#define TAU 6.283185307179586

// Simple hash for noise
float hash(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
}

float noise3D(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    return mix(
        mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
            mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
        mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
            mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
        f.z
    );
}

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    float t = time * TAU;

    // TIME-CIRCLE: Map time to a circle for looping noise
    // This is the Bleuje tutorial 3 technique
    float timeX = cos(t);  // x on unit circle
    float timeY = sin(t);  // y on unit circle

    // Sample 3D noise: xy = spatial, z = time-circle
    float n = noise3D(vec3(uv * scale, timeX * 0.5));
    n += 0.5 * noise3D(vec3(uv * scale * 2.0, timeY * 0.5));
    n = n * 0.5 + 0.5;

    vec3 color = vec3(n * 0.8, n * 0.5, n);
    fragColor = vec4(color, 1.0);
}`
  },
  {
    name: "Plasma Wave",
    technique: "wave",
    description: "Classic plasma with proper sin/cos animation",
    code: `#version 300 es
precision highp float;
uniform float time;
uniform vec2 resolution;
uniform float scale;
out vec4 fragColor;

#define TAU 6.283185307179586

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    float t = time * TAU;

    // All wave components use sin/cos with time*TAU
    float v = 0.0;
    v += sin(uv.x * scale + t);
    v += sin(uv.y * scale + t * 0.5);  // 0.5 is fine inside sin()
    v += sin((uv.x + uv.y) * scale * 0.5 + t);
    v += sin(length(uv - 0.5) * scale * 2.0 - t);

    v = v * 0.25 + 0.5;  // Normalize to 0-1

    // Color palette using cos (also loops perfectly)
    vec3 color = 0.5 + 0.5 * cos(TAU * (v + vec3(0.0, 0.33, 0.67)));

    fragColor = vec4(color, 1.0);
}`
  },
  {
    name: "Breathing Circle",
    technique: "scale",
    description: "Pulsing scale with periodicValue helper",
    code: `#version 300 es
precision highp float;
uniform float time;
uniform vec2 resolution;
out vec4 fragColor;

#define TAU 6.283185307179586

// Bleuje periodicValue: returns 0->1->0 smoothly over one loop
float periodicValue(float t, float offset) {
    return 0.5 + 0.5 * sin((t - offset) * TAU);
}

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 center = uv - 0.5;
    float dist = length(center);

    // Three circles with offset phases (Bleuje pattern)
    float c1 = smoothstep(0.02, 0.0, abs(dist - 0.1 - periodicValue(time, 0.0) * 0.2));
    float c2 = smoothstep(0.02, 0.0, abs(dist - 0.15 - periodicValue(time, 0.33) * 0.15));
    float c3 = smoothstep(0.02, 0.0, abs(dist - 0.2 - periodicValue(time, 0.66) * 0.1));

    vec3 color = vec3(c1, c2, c3);
    fragColor = vec4(color, 1.0);
}`
  }
];
function retrieveLoopSafeExamples(technique = "", limit = 2) {
  let examples = LOOPING_EXAMPLES;
  if (technique) {
    const techLower = technique.toLowerCase();
    examples = LOOPING_EXAMPLES.filter(
      (e) => e.technique.includes(techLower) || e.description.toLowerCase().includes(techLower) || e.code.toLowerCase().includes(techLower)
    );
    if (examples.length === 0) {
      examples = LOOPING_EXAMPLES;
    }
  }
  examples = examples.slice(0, limit);
  if (examples.length === 0) {
    return "";
  }
  let result = "## COMPLETE LOOPING SHADER EXAMPLES\n\n";
  result += "Copy these patterns exactly. They loop seamlessly.\n\n";
  for (const ex of examples) {
    result += `### ${ex.name}
`;
    result += `${ex.description}
`;
    result += "```glsl\n" + ex.code + "\n```\n\n";
  }
  return result;
}
function searchByLoopPattern(pattern, limit = 10, getDocuments) {
  const results = [];
  for (const doc of getDocuments()) {
    const tags = doc.tags || [];
    let matches = false;
    if (pattern === "loop-safe") {
      matches = tags.includes("loop-safe");
    } else if (pattern === "loop-unsafe") {
      matches = tags.includes("loop-unsafe");
    } else {
      matches = true;
    }
    if (matches) results.push(doc);
    if (results.length >= limit) break;
  }
  return results;
}

// src/knowledge/dsl-knowledge.ts
var DSL_CRITICAL_RULES = `## MANDATORY WORKFLOW - DO NOT SKIP STEPS

### STEP 1: create_effect (MUST DO FIRST)

Call create_effect with your shader code:
\`\`\`javascript
create_effect({
  name: "myEffectName",  // remember this name!
  glsl: "#version 300 es\\nprecision highp float;\\n...",
  uniforms: { speed: {type: "float", default: 1.0} }
})
\`\`\`

### STEP 2: compile_dsl (ONLY AFTER STEP 1 SUCCEEDS)

Use the EXACT SAME NAME from Step 1:
\`\`\`javascript
compile_dsl({
  dsl: "search user\\nmyEffectName().write(o0)\\nrender(o0)"
})
\`\`\`

IMPORTANT: "search user" is MANDATORY - your effect is in the USER namespace!
IMPORTANT: The effect name must EXACTLY match what you used in create_effect!

### STEP 3: validate_effect

Check if the output looks correct.

## \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

### IF YOU SEE "Unknown effect" ERROR

This means ONE of:
1. You called compile_dsl BEFORE create_effect
2. create_effect FAILED (check for GLSL errors)
3. Effect name in DSL doesn't match create_effect name
4. You forgot "search user" in the DSL

### CORRECT DSL PATTERN FOR YOUR EFFECTS

\`\`\`
search user
yourEffectName().write(o0)
render(o0)
\`\`\`

### WRONG - USING WRONG NAMESPACE

\`\`\`
search synth
yourEffectName().write(o0)  <-- WRONG! Your effect isn't in synth!
render(o0)
\`\`\`

### WRONG - PUTTING GLSL IN DSL

DSL is NOT GLSL. Never put shader code in compile_dsl:
\`\`\`
vec2 uv = gl_FragCoord.xy / resolution;  <-- WRONG! This is GLSL, not DSL!
\`\`\`

### VALID BUILT-IN DSL FUNCTIONS (these exist in synth/filter/etc)

**GENERATORS (synth) - start chains:**
noise, fractal, voronoi, cell, polygon, solid, shape, curl, ca

**FILTERS (filter) - extend chains:**
blur, warp, bloom, posterize, edge, vignette, grain, rotate, scale

**YOUR EFFECTS (user) - ONLY after create_effect:**
yourCustomEffect (whatever name you gave it)

### DSL ERROR CODES AND FIXES

| Error Code | Meaning | Fix |
|------------|---------|-----|
| **S001** | Unknown effect | Did you create_effect first? Is the name exact? Did you use "search user"? |
| **S005** | Illegal chain | Generator in middle of chain. Generators must be first. |
| **S006** | Missing write() | Add \`.write(o0)\` at end of chain |

### PARAMETER NAMES - USE analyze_effect TO DISCOVER

**Problem: "Starter chain missing write()"**
Fix: Add .write(o0): \`noise().write(o0)\`

**Problem: Using effect path instead of function name**
Fix: Use \`noise()\` not \`synth/noise()\`

**Problem: Using GLSL in DSL**
Fix: DSL is high-level: \`noise().write(o0)\` not \`vec2 uv = ...\`

### Parameter Syntax in DSL

**Named parameters:** \`noise(xScale: 50, ridges: true, seed: 42)\`
**Surface references:** \`read(o0)\`, \`read3d(vol0)\`, \`read3d(geo0)\`
**Enum values (unquoted):** \`colorMode: rgb\`, \`blendMode: multiply\`
`;
var DSL_SCAFFOLDING_PATTERNS = `## DSL Scaffolding Patterns

When generating a DSL program, the structure depends on the EFFECT TYPE.

### Effect Type Detection

1. **STARTER?** No input needed (synth/* effects)
2. **Has tex: param?** Mixer-type, needs two inputs
3. **3D effect?** Needs render3d() at end
4. **POINTS effect?** MUST wrap with pointsEmit/pointsRender

### SCAFFOLDING: Starter (synth/)
\`\`\`
search synth
myEffect(param1: value).write(o0)
render(o0)
\`\`\`

### SCAFFOLDING: Filter (filter/)
\`\`\`
search synth, filter
noise(ridges: true).myFilter(param1: value).write(o0)
render(o0)
\`\`\`

### SCAFFOLDING: Mixer (mixer/)
\`\`\`
search synth, mixer
noise(seed: 1, ridges: true).write(o0)
gradient().myMixer(tex: read(o0), blend: 0.5).write(o1)
render(o1)
\`\`\`

### SCAFFOLDING: Points (points/) - CRITICAL
\`\`\`
search points, synth, render
noise().pointsEmit().myPointsEffect(param: 1.0).pointsRender().write(o0)
render(o0)
\`\`\`

### SCAFFOLDING: Loop (feedback)
\`\`\`
search synth, filter
noise(ridges: true).loopBegin(alpha: 95).warp().loopEnd().write(o0)
render(o0)
\`\`\`

### SCAFFOLDING: 3D Generator (synth3d/)
\`\`\`
search synth3d, filter3d, render
myEffect3d(volumeSize: x32).render3d().write(o0)
render(o0)
\`\`\`

### SCAFFOLDING: User-Created Effect (user/) - MOST COMMON
\`\`\`
search user
myCustomEffect().write(o0)
render(o0)
\`\`\`

NOTE: ALL effects created with create_effect go in the 'user' namespace.
The DSL MUST use 'search user' to find them!

### Search Directive by Namespace

| Namespace | Search Directive |
|-----------|------------------|
| **user** | **\`search user\`** (YOUR created effects!) |
| synth | \`search synth\` |
| filter | \`search synth, filter\` |
| mixer | \`search synth, mixer\` |
| points | \`search points, synth, render\` |
| synth3d | \`search synth3d, filter3d, render\` |

### CRITICAL RULES

1. Points effects ALWAYS get pointsEmit/pointsRender wrapper
2. 3D effects ALWAYS end with render3d()
3. Filters ALWAYS chain from a generator (never standalone)
4. Mixers ALWAYS need tex: read(surface) param
5. Always use noise() as the default starter (with ridges: true)`;
var DSL_REFERENCE = `## Polymorphic DSL Grammar

Structure: \`SearchDirective Statement* RenderDirective\`

### Required Components

1. **SearchDirective** (first line): \`search <namespace1>, <namespace2>, ...\`
2. **Statements**: Effect chains ending with \`.write(surface)\`
3. **RenderDirective** (last line): \`render(o0)\`

### Namespaces

| Namespace | Type | Purpose |
|-----------|------|---------|
| synth | Starter | 2D generators |
| filter | Processor | 2D transforms |
| mixer | Combiner | Blend two sources |
| points | Simulation | Agent/particle behaviors |
| render | Utility | pointsEmit, pointsRender, loops |
| synth3d | Starter | 3D volumetric generators |
| filter3d | Processor | 3D volumetric transforms |

### Parameter Syntax

- Numbers: \`4.0\`, \`10\`, \`-0.5\`
- Texture reads: \`read(o0)\`, \`read3d(vol0)\`
- Enums: \`rainbow\`, \`multiply\`, \`circle\`

### Surface References

- \`o0\`-\`o7\`: 2D surfaces
- \`vol0\`-\`vol7\`: 3D volumes
- \`geo0\`-\`geo7\`: 3D geometry
- \`read(surface)\`: Read previous frame
- \`write(surface)\`: Write to surface

### CRITICAL RULES

1. Namespaces are NOT functions - NEVER call \`synth()\` or \`filter()\`
2. Every chain MUST end with \`.write(surface)\`
3. Search directive is MANDATORY first line
4. render() is MANDATORY last line
5. Use YOUR effect name from create_effect, not library names`;

// src/knowledge/effect-catalog.ts
var EFFECT_CATALOG = `## Effect Catalog

**IMPORTANT: Do NOT guess parameter names.** Copy parameter names exactly from the example programs below or from the exemplar programs. If you don't see an example of an effect being used with parameters, use it with NO parameters and let the defaults work.

### SYNTH (Generators) - Start chains, create images from nothing
noise, fractal, julia, mandelbrot, newton, cell, perlin, curl, gabor, gradient,
media, mnca, modPattern, osc2d, pattern, polygon, rd, roll, ca, scope, shape,
solid, spectrum, subdivide, testPattern

### SYNTH3D (3D Volume Generators) - Use with render3d()
noise3d, fractal3d, cell3d, flythrough3d, shape3d, rd3d, ca3d

### FILTER (Processors) - Chain after generators
adjust, bc, bloom, blur, bulge, celShading, cf, channel, chroma, chromaticAberration,
clouds, colorspace, corrupt, crt, degauss, deriv, dither, edge, emboss, feedback,
fibers, flipMirror, fxaa, glowingEdge, glyphMap, grade, grain, grime, historicPalette,
hs, inv, lens, lensWarp, lightLeak, lighting, lowPoly, motionBlur, normalMap,
normalize, octaveWarp, osd, outline, palette, pinch, pixelSort, pixels, polar,
posterize, prismaticAberration, reindex, repeat, reverb, ridge, rot, scale,
scanlineError, scratches, scroll, seamless, sharpen, simpleAberration, sine, skew,
smooth, smoothstep, snow, sobel, spatter, spiral, spookyTicker, step, strayHair,
tetraColorArray, tetraCosine, text, texture, thresh, tile, tint, translate, tunnel,
vaseline, vignette, warp, waves, wobble, wormhole, zoomBlur

### FILTER3D (3D Volume Processors)
flow3d

### POINTS (Particle Systems) - Use with pointsEmit()/pointsRender()
flow, physical, flock, attractor, life, hydraulic, dla, physarum, lenia

### RENDER (Pipeline Utilities)
render3d, renderLit3d, pointsEmit, pointsRender, pointsBillboardRender,
loopBegin, loopEnd, meshLoader, meshRender

### MIXER (Two-input blending) - Require tex: read(oN) parameter
blendMode, alphaMask, applyMode, cellSplit, centerMask, distortion, focusBlur,
patternMix, shadow, shapeMask, split, thresholdMix, uvRemap

### CLASSIC EFFECTS (classicNoisedeck namespace)
background, bitEffects, caustic, cellNoise, cellRefract, coalesce, colorLab,
composite, depthOfField, displaceMixer, effects, fractal, glitch, kaleido,
lensDistortion, moodscape, noise, noise3d, palette, pattern, quadTap, refract,
shapeMixer, shapes, shapes3d, splat, tunnel, warp

### CLASSIC EFFECTS (classicNoisemaker namespace)
kaleido, refract

### Parameter Examples (REAL, VERIFIED from working programs)
\`\`\`
noise(noiseType: 10, octaves: 2, xScale: 75, yScale: 75, ridges: true, colorMode: 6, hueRotation: 45, hueRange: 25, kaleido: 1, palette: afterimage)
shapes(loopAAmp: 50, loopAOffset: 60, loopAScale: 21, loopBAmp: 42, loopBOffset: 120, loopBScale: 54, palette: netOfGems, wrap: true)
cellNoise(scale: 75, cellScale: 87, cellSmooth: 11, cellVariation: 50, colorMode: 0, palette: royal)
fractal(fractalType: 0, zoomAmt: 0, rotation: 0, speed: 30, offsetX: 70, offsetY: 50, iterations: 50, colorMode: 4, palette: dealerHat)
pattern(patternType: 1, scale: 80, rotation: 0, lineWidth: 100, animation: 0, speed: 1, color1: #ffea31, color2: #000000)
solid(color: #000)
polygon(radius: 0.7, fgAlpha: 0.1, bgAlpha: 0)
text(text: "hello", font: "Audiowide", size: 0.09, posX: 0.375, color: #ffffff)
pointsEmit(stateSize: x64, attrition: 2.63)
physical(gravity: 0, energy: 0.98, drag: 0.125)
pointsRender(density: 100, inputIntensity: 20)
pointsBillboardRender(tex: read(o0), pointSize: 40, sizeVariation: 50, rotationVariation: 50)
loopBegin(alpha: 95, intensity: 95)
warp()
bloom(taps: 15)
blur(radiusX: 5)
vignette()
lens(displacement: -0.5)
chromaticAberration(aberrationAmt: 25)
coalesce(tex: read(o0), blendMode: 8, mixAmt: -51, refractAAmt: 0, refractBAmt: 71)
blendMode(tex: read(o0), mode: multiply)
lensDistortion(aberrationAmt: 100, distortion: -48, opacity: 12, shape: 0, tint: #b42f2d, vignetteAmt: -46)
colorLab(colorMode: 2, dither: 0, hueRange: 100, hueRotation: 0, levels: 2, palette: seventiesShirt)
effects(effect: 4, effectAmt: 2, flip: 0, offsetX: 0, offsetY: 0, rotation: 0, scaleAmt: 100)
posterize(levels: 6)
outline()
colorspace()
hs(rotation: 120, hueRange: 40)
bc()
\`\`\`
`;

// src/knowledge/effect-definition.ts
var EFFECT_DEFINITION_REFERENCE = `## Effect Definition Specification

Effects are JavaScript modules exporting an Effect instance.

### Minimal Structure

\`\`\`javascript
import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "MyEffect",           // Human-readable name
  namespace: "synth",         // Pipeline namespace
  func: "myEffect",           // DSL function name
  tags: ["noise"],            // Searchable tags
  description: "...",

  globals: {
    myParam: {
      type: "float",
      default: 1.0,
      uniform: "myParam",
      min: 0.0, max: 10.0,
      ui: { label: "My Parameter", control: "slider" }
    }
  },

  passes: [{
    name: "main",
    program: "myShader",      // Maps to glsl/myShader.glsl
    inputs: {},               // For starters: empty
    outputs: { fragColor: "outputTex" }
  }]
})
\`\`\`

### Uniform Types

| Type | GLSL | Default Format |
|------|------|----------------|
| float | float | Number: \`1.0\` |
| int | int | Number: \`4\` |
| boolean | bool | Boolean: \`false\` |
| vec2 | vec2 | **Array**: \`[0.5, 0.5]\` |
| vec3 | vec3 | **Array**: \`[1.0, 0.0, 0.5]\` |
| vec4 | vec4 | **Array**: \`[1.0, 0.0, 0.5, 1.0]\` |

**CRITICAL: vec defaults MUST be arrays, NOT objects!**

### Uniform Properties

\`\`\`javascript
myUniform: {
  type: "float",
  default: 1.0,
  uniform: "myUniform",       // GLSL uniform name
  min: 0.0, max: 10.0,
  step: 0.1,
  choices: { opt1: 0, opt2: 1 },  // For dropdowns
  ui: {
    label: "Display Name",
    control: "slider",        // slider, checkbox, dropdown, button, color
    category: "transform",    // Group controls (camelCase only!)
    enabledBy: "otherUniform"
  }
}
\`\`\`

### Multi-Pass Effects

\`\`\`javascript
textures: {
  _temp: { width: "input", height: "input", format: "rgba8unorm" }
},
passes: [
  { name: "pass1", program: "blur1", inputs: { inputTex: "inputTex" }, outputs: { fragColor: "_temp" } },
  { name: "pass2", program: "blur2", inputs: { inputTex: "_temp" }, outputs: { fragColor: "outputTex" } }
]
\`\`\``;
var EFFECT_DEFINITION_DEEP = `## Effect Definition - Guru Level

### The Three Data Flows

1. **Uniform Flow** (CPU \u2192 GPU): globals \u2192 GLSL uniforms
2. **Texture Flow** (GPU \u2192 GPU): passes inputs/outputs
3. **Pass Execution**: Sequential shader programs

### Reserved Texture Names

| Name | Direction | Purpose |
|------|-----------|---------|
| inputTex | Read | Input from chain |
| outputTex | Write | Output to chain |
| inputTex3d | Read | 3D volume input |
| outputTex3d | Write | 3D volume output |
| inputGeo | Read | Geometry buffer |

### Effect Types by I/O Pattern

**STARTER (synth/):** passes[].inputs = {} (empty)
**FILTER (filter/):** passes[].inputs = { inputTex: "inputTex" }
**MIXER (mixer/):** Has tex: { type: "surface" } in globals

### Special Pass Properties

- \`repeat: "iterations"\` - Run pass N times
- \`pingpong: ["_a", "_b"]\` - Swap textures each iteration
- \`drawBuffers: 2\` - Multiple render targets
- \`drawMode: "points"\` - Particle rendering
- \`blend: true\` - Additive blending`;
var EFFECT_ANATOMY_KNOWLEDGE = `## Effect Anatomy - Deep Knowledge

### Namespace Roles (300+ Library Effects)

| Namespace | Role | DSL Pattern |
|-----------|------|-------------|
| synth/ | Starters | \`noise().write(o0)\` |
| filter/ | Processors | \`noise().blur().write(o0)\` |
| mixer/ | Blenders | \`a.write(o0)\\nb.mixer(tex:read(o0)).write(o1)\` |
| points/ | Agents | \`noise().pointsEmit().flow().pointsRender().write(o0)\` |
| render/ | Pipeline | Wrappers: pointsEmit, render3d, loops |
| synth3d/ | 3D volumes | \`noise3d().render3d().write(o0)\` |

### Common Uniform Patterns

**Animation:** \`speed: { type: "int", default: 0, min: -5, max: 5 }\`
**Scale:** \`xScale: { type: "float", default: 75, min: 1, max: 100 }\`
**Seed:** \`seed: { type: "int", default: 1, min: 1, max: 100 }\`
**Toggle:** \`ridges: { type: "boolean", default: false }\`
**Color:** \`tint: { type: "vec3", default: [1.0, 1.0, 1.0], ui: { control: "color" } }\`

### Multi-Pass Pattern (bloom)

\`\`\`javascript
textures: {
  _bright: { width: "input", height: "input", format: "rgba16float" },
  _bloom: { width: "input", height: "input", format: "rgba16float" }
},
passes: [
  { name: "bright", program: "bright", inputs: { inputTex: "inputTex" }, outputs: { fragColor: "_bright" } },
  { name: "blur", program: "blur", inputs: { inputTex: "_bright" }, outputs: { fragColor: "_bloom" } },
  { name: "final", program: "composite", inputs: { inputTex: "inputTex", bloomTex: "_bloom" }, outputs: { fragColor: "outputTex" } }
]
\`\`\`

### Points/Agents State Textures

- \`global_xyz\`: [x, y, heading, alive]
- \`global_vel\`: [vx, vy, age, seed]
- \`global_rgba\`: [r, g, b, a]

### What Makes a "Good" Effect

1. 2-6 meaningful uniforms
2. Smooth animation (sin/cos of time*TAU)
3. Wrap/seed controls
4. Proper min/max ranges
5. Visible uniform changes`;
var REQUIRED_PATTERNS = `## REQUIRED Patterns

### GLSL Requirements

| Requirement | Correct Pattern |
|-------------|-----------------|
| Aspect ratio | \`#define aspectRatio (resolution.x / resolution.y)\` |
| Animated UV offset | \`uv + vec2(sin(time * TAU), cos(time * TAU))\` |
| Animated noise | \`noise(pos + vec2(sin(time * TAU), cos(time * TAU)) * 0.5)\` |
| Uniform declaration | All uniforms in definition.js must be declared in GLSL |

### DSL Requirements

| Requirement | Correct Pattern |
|-------------|-----------------|
| Generator call | \`noise().write(o0)\` |
| Search directive | First line: \`search synth\` |
| Render call | Last line: \`render(o0)\` |

### Definition Requirements

| Requirement | Correct Pattern |
|-------------|-----------------|
| Vec2 defaults | \`default: [0.5, 0.5]\` (array format) |
| Custom uniforms | Always add 2-6 uniforms |
| Category format | \`category: "colorGrading"\` (camelCase) |`;

// src/knowledge/glsl-reference.ts
var GLSL_REFERENCE = `## GLSL Shader Format

### Required Structure

\`\`\`glsl
#version 300 es
precision highp float;
precision highp int;

uniform float time;           // 0\u21921 looping! Use sin(time * TAU)
uniform vec2 resolution;

uniform float myParam;        // Your custom uniforms

out vec4 fragColor;

#define PI 3.14159265359
#define TAU 6.28318530718
#define aspectRatio (resolution.x / resolution.y)

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    float t = time * TAU;     // Convert to radians
    vec3 color = vec3(uv, 0.5 + 0.5 * sin(t));
    fragColor = vec4(color, 1.0);
}
\`\`\`

##  WILL IT LOOP - SEAMLESS ANIMATION RULES

**This is THE most critical section for animation. Master it completely.**

### Core Definition

Treat \`time\` as **1-periodic** on **[0, 1]**: \`t=1\` must be IDENTICAL to \`t=0\`.
All time-driven values must be continuous across the boundary with NO visible "pop" at the seam.

The approved mental model (\xC9tienne Jacob / Bleuje): "A periodic function plus an offset/delay, where **everything** uses the same loopable time basis and each element varies via an offset."

Reference: [bleuje.com/tutorial2](https://bleuje.com/tutorial2/) and [bleuje.com/tutorial3](https://bleuje.com/tutorial3/)

### THE DERIVATIVE RULE (Why Loops Fail)

**Matching value(0) == value(1) is NOT ENOUGH!**
The **velocity/derivative** must ALSO match, or you get a "hard reset" at t\u22480.999.

**sin() and cos() are the ONLY functions where both VALUE and DERIVATIVE loop perfectly.**
No linear time, no fract(), no mod(), no smoothstep(), no custom easing.

### HARD REQUIREMENTS (Verify ALL Before Shipping)

1. **SEAM EQUALITY + DERIVATIVE CONTINUITY**
   - For EVERY animated value: value(0) == value(1) AND value'(0) == value'(1)
   - sin/cos satisfy BOTH conditions automatically
   - If the value controls motion, the seam must not create a visible kink

2. **ROTATION = INTEGER TURNS**
   - Canonical form: \`angle(t) = angle0 + (offset * TAU) + (N * TAU * time)\`
   - N MUST be INTEGER (1, 2, 3). Non-integer N = incomplete turn = seam!
   -  \`angle = TAU * time\` (1 turn)  \`angle = 2.0 * TAU * time\` (2 turns)
   -  \`angle = 1.5 * TAU * time\` (BROKEN - 1.5 turns = incomplete!)

3. **TRANSLATION = CLOSED LOOP**
   - Must return to EXACT starting point at t=1
   - Circle: \`start + radius * vec2(cos(TAU * phase), sin(TAU * phase))\`
   - Oscillation: \`start + dir * (amplitude * sin(TAU * phase))\`
   - Pattern: \`pos = start + radius * vec2(cos(TAU*time), sin(TAU*time))\`

4. **NOISE = TIMECIRCLE PATTERN** (Bleuje Tutorial 3)
   - Map time to a circle, sample noise at that point:
   - \`vec2 tc = vec2(cos(TAU*time), sin(TAU*time)); noise(uv + tc*0.5);\`

### THE BLEUJE PATTERN - Periodic Function + Offset

The "Bleuje pattern" (from shader artist \xC9tienne Jacob) is the approved method:
**periodicValue(time, offset)** = a periodic function evaluated at (time - offset)

\`\`\`glsl
// THE BLEUJE PATTERN - copy this exactly:
#define TAU 6.28318530717958647692

float normalizedSine(float x) {
    return 0.5 + 0.5 * sin(x);
}

float periodicValue(float time, float offset) {
    return normalizedSine((time - offset) * TAU);  // Returns 0\u21921\u21920 smoothly
}

// With offset, different objects animate at different phases:
float wave1 = periodicValue(time, 0.0);   // Starts at 0.5, rises
float wave2 = periodicValue(time, 0.25);  // Starts at 1.0, falls
float wave3 = periodicValue(time, 0.5);   // Starts at 0.5, falls
float wave4 = periodicValue(time, 0.75);  // Starts at 0.0, rises
\`\`\`

###  CORRECT Animation Examples

\`\`\`glsl
float t = time * TAU;
float wave = sin(t);                              // Smooth loop
float pulse = 0.5 + 0.5 * sin(t);                // Normalized 0\u21921\u21920
float oscillate = amplitude * sin(t);            // Oscillation
vec2 circular = radius * vec2(cos(t), sin(t));   // Circle motion

// Multiple speeds - ALL MUST BE INTEGERS!
float slow = sin(t);           // 1 cycle
float fast = sin(t * 2.0);     // 2 cycles
float faster = sin(t * 3.0);   // 3 cycles

// Integer rotation
float angle = TAU * time;        // 1 full turn
float angle = 2.0 * TAU * time;  // 2 full turns

// Looping noise - time on a circle:
vec2 tc = vec2(cos(t), sin(t));
float n = noise4D(vec4(uv * scale, tc));
\`\`\`

### Animation Primitives (use these for all animation)

\`\`\`glsl
float t = time * TAU;                    // Convert to radians first
float pulse = 0.5 + 0.5 * sin(t);       // Smooth 0\u21921\u21920
float wave = sin(t);                     // Smooth -1\u21921\u2192-1
float angle = t * 2.0;                   // 2 full rotations
vec2 circular = vec2(cos(t), sin(t));   // Circular motion
vec2 timeCircle = vec2(cos(t), sin(t)); // For noise animation
float n = noise(uv * scale + timeCircle * 0.5);  // Animated noise
\`\`\`

### Looping Helpers (copy exactly)

\`\`\`glsl
// Rotation: N MUST be integer
float loopedAngle(float time, float offsetTurns, int N, float angle0) {
    return angle0 + TAU * (offsetTurns + float(N) * time);
}

// Translation on circle: cyclesN MUST be integer
vec2 loopedCircle(vec2 start, float time, float radius, float offsetTurns, int cyclesN) {
    float phase = offsetTurns + float(cyclesN) * time;
    return start + radius * vec2(cos(TAU * phase), sin(TAU * phase));
}

// Linear-looking oscillation: cyclesN MUST be integer
vec2 loopedOscillate(vec2 start, vec2 dir, float time, float amp, float offsetTurns, int cyclesN) {
    float phase = offsetTurns + float(cyclesN) * time;
    return start + dir * (amp * sin(TAU * phase));
}

// Looping noise via time-circle (4D noise required for spatial variation)
float loopedNoise(vec2 p, float time, float scale, float offset, float speed) {
    float phase = (time * speed) + offset;
    vec2 tc = vec2(cos(TAU * phase), sin(TAU * phase));
    return noise4D(vec4(p * scale, tc));  // or simplex4D
}

// Looped scalar (brightness, scale, alpha, etc.)
float loopedScalar(float base, float time, float offset, float amp, int cyclesN) {
    float phase = offset + float(cyclesN) * time;
    return base + amp * sin(TAU * phase);
}
\`\`\`

### Animation Checklist

**Verify your shader uses these patterns:**

- [ ] Animation uses sin(time * TAU) or cos(time * TAU)
- [ ] Cycle multipliers are integers (1, 2, 3...)
- [ ] Rotation completes full turns: angle = N * TAU * time
- [ ] Noise uses timeCircle: vec2(cos(t), sin(t)) in coordinates

### Stable Hash (for seeded loops)
\`\`\`glsl
uint hash_u32(uint x) {
    x ^= x >> 16u;
    x *= 0x7FEB352Du;
    x ^= x >> 15u;
    x *= 0x846CA68Bu;
    x ^= x >> 16u;
    return x;
}

float hash01(uint x) {
    return float(hash_u32(x) & 0x00FFFFFFu) / float(0x01000000u);
}
\`\`\`

### Filter Shader (with input)

\`\`\`glsl
uniform sampler2D inputTex;

void main() {
    ivec2 texSize = textureSize(inputTex, 0);
    vec2 uv = gl_FragCoord.xy / vec2(texSize);
    vec4 color = texture(inputTex, uv);
    fragColor = color;
}
\`\`\`

### Hash/Random
\`\`\`glsl
float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
\`\`\`

### Value Noise
\`\`\`glsl
float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i), b = hash(i + vec2(1,0));
    float c = hash(i + vec2(0,1)), d = hash(i + vec2(1,1));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
\`\`\`

### FBM
\`\`\`glsl
float fbm(vec2 p, int octaves) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < octaves; i++) {
        v += a * noise(p); p *= 2.0; a *= 0.5;
    }
    return v;
}
\`\`\`

### Color Palette
\`\`\`glsl
vec3 palette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
    return a + b * cos(TAU * (c * t + d));
}
\`\`\`

### HSV to RGB
\`\`\`glsl
vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}
\`\`\`

### Distance Field Shapes

\`\`\`glsl
float sdCircle(vec2 p, float r) { return length(p) - r; }
float sdBox(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
\`\`\`

### Rotation
\`\`\`glsl
vec2 rotate2D(vec2 st, float a) {
    st -= 0.5;
    st = mat2(cos(a), -sin(a), sin(a), cos(a)) * st;
    return st + 0.5;
}
\`\`\`

### Wrap Modes
\`\`\`glsl
if(wrap==0) uv = abs(mod(uv+1.,2.)-1.);  // mirror
else if(wrap==1) uv = fract(uv);          // repeat
else uv = clamp(uv, 0., 1.);              // clamp
\`\`\`

### PCG Random (high quality)
\`\`\`glsl
uvec3 pcg(uvec3 v) {
    v = v*1664525u+1013904223u;
    v.x+=v.y*v.z; v.y+=v.z*v.x; v.z+=v.x*v.y;
    v^=v>>16u;
    v.x+=v.y*v.z; v.y+=v.z*v.x; v.z+=v.x*v.y;
    return v;
}
\`\`\`

### Luminance
\`\`\`glsl
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
\`\`\``;
var GLSL_RECIPES = `## GLSL Recipes

### Animated Plasma
\`\`\`glsl
float t = time * TAU * speed;
float v = sin(uv.x * scale + t) + sin(uv.y * scale + t);
v += sin((uv.x + uv.y) * scale + t) + sin(length(uv - 0.5) * scale * 2.0 + t);
vec3 col = 0.5 + 0.5 * cos(TAU * (v * 0.25 + vec3(0.0, 0.33, 0.67)));
\`\`\`

### Raymarched Sphere
\`\`\`glsl
float sdSphere(vec3 p, float r) { return length(p) - r; }
vec3 calcNormal(vec3 p) {
    vec2 e = vec2(0.001, 0.0);
    return normalize(vec3(
        sdSphere(p+e.xyy,1.0)-sdSphere(p-e.xyy,1.0),
        sdSphere(p+e.yxy,1.0)-sdSphere(p-e.yxy,1.0),
        sdSphere(p+e.yyx,1.0)-sdSphere(p-e.yyx,1.0)
    ));
}
\`\`\`

### Kaleidoscope
\`\`\`glsl
vec2 c = (gl_FragCoord.xy - resolution * 0.5) / min(resolution.x, resolution.y);
float a = atan(c.y, c.x);
float r = length(c);
float seg = TAU / float(segments);
a = mod(a, seg);
if (mod(floor(atan(c.y, c.x) / seg), 2.0) > 0.5) a = seg - a;
vec2 transformed = vec2(cos(a), sin(a)) * r;
\`\`\`

### Voronoi
\`\`\`glsl
vec2 cell = floor(uv * cellCount);
float minDist = 10.0;
for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
        vec2 n = cell + vec2(x, y);
        vec2 pt = n + hash(n) * jitter;
        minDist = min(minDist, distance(uv * cellCount, pt));
    }
}
\`\`\`

### Domain Warping
\`\`\`glsl
vec2 warp = uv + 0.1 * vec2(
    noise(uv * 4.0 + seed),
    noise(uv * 4.0 + seed + 100.0)
);
float n = noise(warp * 8.0);
\`\`\`

### 3D Perspective Grid (Synthwave/Vaporwave Flyover)
Classic 80s aesthetic with perspective grid floor and gradient sky.
\`\`\`glsl
// Horizon line splits screen
float horizon = 0.4;
float t = time * TAU;

// Sky gradient (top portion)
if (uv.y > horizon) {
    float skyT = (uv.y - horizon) / (1.0 - horizon);
    vec3 skyBot = vec3(0.8, 0.2, 0.6);  // Hot pink
    vec3 skyTop = vec3(0.1, 0.0, 0.2);  // Deep purple
    color = mix(skyBot, skyTop, skyT);
} else {
    // Perspective grid (bottom portion)
    float z = horizon / (horizon - uv.y);  // Perspective depth
    float x = (uv.x - 0.5) * z;            // Perspective X
    z += t * speed;                        // Animation

    // Grid lines
    float gridX = abs(fract(x * gridScale) - 0.5);
    float gridZ = abs(fract(z * gridScale) - 0.5);
    float grid = min(gridX, gridZ);
    grid = smoothstep(0.02, 0.05, grid);

    // Grid color with depth fade
    vec3 gridColor = vec3(0.0, 1.0, 1.0);  // Cyan
    float fade = 1.0 / (1.0 + z * 0.1);    // Fade with depth
    color = mix(gridColor, vec3(0.0), grid) * fade;
}
\`\`\`

### Sun/Circle with Glow
\`\`\`glsl
vec2 center = vec2(0.5, horizon);
float dist = length(uv - center);
float sun = smoothstep(sunRadius + 0.02, sunRadius, dist);
float glow = exp(-dist * 3.0) * 0.5;
vec3 sunColor = vec3(1.0, 0.3, 0.5);
color += sunColor * (sun + glow);
\`\`\`

### Scanlines Effect
\`\`\`glsl
float scanline = sin(uv.y * resolution.y * 0.5) * 0.5 + 0.5;
color *= 0.8 + 0.2 * scanline;
\`\`\`

## PROVEN LOOPING IMPLEMENTATIONS FROM NOISEMAKER

These are **real, working implementations** from the Noisemaker effect library.
**STUDY THESE PATTERNS - they show exactly how to create seamless loops.**

### EXAMPLE 1: synth/noise - Periodic Function with Time Blend

**Technique:** Use a periodic function to blend noise values over time.
The noise lattice itself doesn't animate - instead, \`periodicFunction(time)\`
modulates the blend parameter, creating smooth cyclic variation.

\`\`\`glsl
// From synth/noise - the periodicFunction approach
float periodicFunction(float p) {
    // Maps p (0..1) to a cosine wave (0..1), creating smooth looping
    return (cos(p * TAU) + 1.0) * 0.5;  // 0\u21921\u21920 as p goes 0\u21921
}

// In main():
float t = time + spatialOffset(st);  // time plus spatial variation
float blend = periodicFunction(t) * amplitude;  // Smoothly loops!

// Use blend as parameter in noise evaluation
vec3 color = multires(st, freq, octaves, seed, blend);
\`\`\`

**Key insight:** The noise function is stationary - only the \`blend\` parameter
oscillates via \`periodicFunction(time)\`. The noise coordinates stay fixed.

### EXAMPLE 2: synth/perlin - Two Approaches for Different Dimensions

**2D Mode: Rotating Gradient Angles**
The gradient vectors at each lattice point rotate with time, keeping the
noise structure coherent while creating smooth animation.

\`\`\`glsl
// From synth/perlin (2D mode) - gradients rotate with time
float grid2D(vec2 st, vec2 cell, float timeAngle, float channelOffset) {
    // Base gradient angle from hash
    float angle = prng(vec3(cell + float(seed), 1.0)).r * TAU;

    // KEY: Add time as rotation - completes INTEGER turns over time 0\u21921
    angle += timeAngle + channelOffset * TAU;  // timeAngle = time * TAU

    vec2 gradient = vec2(cos(angle), sin(angle));
    vec2 dist = st - cell;
    return dot(gradient, dist);
}

// Usage: timeAngle = time * TAU
float n = noise2D(st, time * TAU, 0.0);  // Loops perfectly
\`\`\`

**3D Mode: Periodic Z-Axis**
Sample a 3D noise volume where the Z-axis wraps at a defined period.
Time maps linearly to Z, which wraps seamlessly.

\`\`\`glsl
// From synth/perlin (3D mode) - periodic z-axis
const float Z_PERIOD = 4.0;  // Period length in z-axis lattice units

float wrapZ(float z) {
    return mod(z, Z_PERIOD);  // Z coordinates wrap for seamless tiling
}

float noise3D(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);

    // Wrap z indices for periodicity
    float iz0 = wrapZ(i.z);
    float iz1 = wrapZ(i.z + 1.0);

    // Sample corners with wrapped z
    float n000 = dot(grad3(vec3(i.xy, iz0) + vec3(0,0,0)), f - vec3(0,0,0));
    // ... etc for all 8 corners
}

// Usage: time 0\u21921 maps to z 0\u2192Z_PERIOD, which wraps seamlessly
float z = time * Z_PERIOD;  // or time / TAU * Z_PERIOD
float n = noise3D(vec3(uv * scale, z));
\`\`\`

**Key insight:** The noise volume has periodicity built into the Z dimension.
When time reaches 1.0, z wraps to 0.0 identically.

### EXAMPLE 3: filter/tunnel - Integer Speed for Perfect Loops

**Technique:** When speed is an INTEGER, the tunnel advances by exactly N cells,
ending at the same position it started. Non-integer speed creates seams.

\`\`\`glsl
// From filter/tunnel - integer speed requirement
void main() {
    vec2 centered = uv - 0.5;
    float a = atan(centered.y, centered.x);
    float r = length(centered);

    // Tunnel coordinates
    vec2 tunnelCoords = smod(vec2(
        0.3 / r + time * speed,           // speed MUST BE INTEGER for loop!
        a / PI + time * -tunnelRotation   // tunnelRotation MUST BE INTEGER!
    ), 1.0);

    fragColor = texture(inputTex, tunnelCoords);
}
\`\`\`

**Why it works:**
- If \`speed = 1\`, the tunnel advances by exactly 1.0 in UV space
- \`smod(x, 1.0)\` wraps, so position at t=1 equals position at t=0
- If \`speed = 1.5\`, it advances by 1.5 - the remainder creates a visible seam!

**The rule:** Any uniform that multiplies time in a modular space MUST be INTEGER.

### EXAMPLE 4: synth/osc2d - The Bleuje periodicValue Pattern

**Technique:** Two-stage periodic evaluation from \xC9tienne Jacob's tutorials.
This creates complex-looking motion that loops perfectly.

\`\`\`glsl
// From synth/osc2d - the periodicValue pattern
float periodicValue(float t, float v) {
    // Bleuje pattern: periodic function evaluated at (time - offset)
    return (sin((t - v) * TAU) + 1.0) * 0.5;  // Returns 0\u21921\u21920 smoothly
}

// Two-stage periodic for complex motion:
// 1. Sample noise to get per-pixel offset values
float timeNoise = tilingNoise1D(spatialPos, freq, float(seed) + 12345.0);
float valueNoise = tilingNoise1D(spatialPos, freq, float(seed));

// 2. First periodic: time with timeNoise offset, scaled by speed
float scaledTime = periodicValue(time, timeNoise) * speed;

// 3. Second periodic: scaledTime with valueNoise offset
float val = periodicValue(scaledTime, valueNoise);
\`\`\`

**Why it works:**
- \`periodicValue(time, offset)\` is periodic in \`time\` for any fixed \`offset\`
- Nesting two periodic functions is still periodic
- Each pixel has different offsets, so motion appears complex but loops perfectly

##  SUMMARY: Three Proven Looping Strategies

| Strategy | When to Use | Example |
|----------|-------------|---------|
| **periodicFunction(time) as blend** | Animating noise smoothly | synth/noise |
| **Rotating gradients with time*TAU** | 2D periodic noise | synth/perlin 2D |
| **Periodic Z-axis with mod wrapping** | 3D periodic noise | synth/perlin 3D |
| **Integer multiplier for modular coords** | Tunnels, scrolling grids | filter/tunnel |
| **periodicValue(time, offset)** | Complex motion with offsets | synth/osc2d, Bleuje tutorials |

**Use one of these proven looping patterns.**`;

// src/knowledge/workflow-knowledge.ts
var AGENT_WORKFLOW_KNOWLEDGE = `## SHADER AGENT MINDSET

You are crafting visual art within a sophisticated rendering pipeline.

### MANDATORY TOOL SEQUENCE

**STEP 1: create_effect** \u2192 Creates your shader in USER namespace
**STEP 2: compile_dsl** \u2192 Uses your effect (MUST use "search user"!)
**STEP 3: validate_effect** \u2192 Checks visual output

NEVER call compile_dsl before create_effect.
ALWAYS use "search user" in DSL for your effects.

### THE PIPELINE PHILOSOPHY

**Surfaces are Sacred**: \`o0\`-\`o7\` belong to the USER's composition graph.
Effects requiring internal buffers MUST use private textures (prefix with \`_\` or \`global_\`).

**One Way Only**: Never add alternative syntax or aliases. Consistency is sacred.

### VALIDATION DECISION TREE

\`\`\`
1. compile_dsl (verify it compiles)  \u2500\u2500error\u2500\u2500\u25B6 Fix DSL syntax
       \u2502 ok
       \u25BC
2. validate_effect (check metrics)   \u2500\u2500fails\u2500\u2500\u25B6 Fix shader logic
       \u2502 pass
       \u25BC
3. Visual check with user
\`\`\`

### METRICS THAT MATTER

| Metric | Good | Bad | Meaning |
|--------|------|-----|---------|
| isBlank | false | true | Outputs nothing |
| isMonochrome | false | true | All pixels same hue |
| isAnimated | true | false | No movement |
| uniqueColors | > 50 | < 10 | Color variety |

### THE THREE LANGUAGES (NEVER CONFUSE)

| Context | Language | Example |
|---------|----------|---------|
| load_effect | Effect Path | \`"synth/noise"\` |
| compile_dsl | DSL | \`noise().blur().write(o0)\` |
| create_effect glsl | GLSL | \`vec2 uv = gl_FragCoord.xy / resolution;\` |

**DSL is NOT GLSL. GLSL is NOT DSL. Never mix them.**

### EFFECT TYPE SCAFFOLDING

ALL your effects go in USER namespace. Always use "search user":

| Type | DSL Pattern |
|------|-------------|
| STARTER | \`search user\\nmyEffect().write(o0)\\nrender(o0)\` |
| FILTER | \`search user, synth\\nnoise().myFilter().write(o0)\\nrender(o0)\` |
| MIXER | \`search user, synth\\nnoise().write(o0)\\ngradient().myMixer(tex: read(o0)).write(o1)\\nrender(o1)\` |

### COMMON FAILURES AND FIXES

| Symptom | Cause | Fix |
|---------|-------|-----|
| Unknown effect | Missing "search user" | Add "search user" to DSL |
| Unknown effect | create_effect not called | Call create_effect first |
| All black | No output | Check fragColor assignment |
| No animation | Using time directly | Use sin(time * TAU) |
| Controls don't work | Missing uniform | Add to globals |

### THE HONEST DEVELOPER PLEDGE

- Never claim success without validation
- Never disable tests to hide problems
- Trust metrics over intuition
- Ask the user when uncertain`;
var COMPACT_SHADER_KNOWLEDGE = `## Shader Quick Reference

### DSL IS NOT GLSL

**DSL (compile_dsl):**
\`\`\`
search user
myEffect().write(o0)
render(o0)
\`\`\`

**GLSL (create_effect glsl param):**
\`\`\`glsl
#version 300 es
precision highp float;
void main() { fragColor = vec4(1.0); }
\`\`\`

### SEARCH TOOLS - Use the Library!

- **search_shader_knowledge** - ASK THE GURU! Query docs, patterns, errors
- search_effects - Find by name/tags
- search_shader_source - Find GLSL patterns
- analyze_effect - Get full shader code

**When confused, use search_shader_knowledge first!**
Query: "how to animate", "effect definition format", "common errors"

### DSL Scaffolding

**STARTER:** \`search user\\nmyEffect().write(o0)\\nrender(o0)\`
**FILTER:** \`search user, synth\\nnoise().myFilter().write(o0)\\nrender(o0)\`
**MIXER:** \`search user, synth\\nnoise().write(o0)\\ngradient().myMixer(tex: read(o0)).write(o1)\\nrender(o1)\`
**POINTS:** \`search user, points, synth, render\\nnoise().pointsEmit().myBehavior().pointsRender().write(o0)\\nrender(o0)\`

### GLSL Template

\`\`\`glsl
#version 300 es
precision highp float;
uniform float time;
uniform vec2 resolution;
out vec4 fragColor;
#define TAU 6.28318530718
#define aspectRatio (resolution.x / resolution.y)

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    float t = time * TAU;
    fragColor = vec4(uv, 0.5 + 0.5 * sin(t), 1.0);
}
\`\`\`

### Animation (CRITICAL - WILL IT LOOP?)
**ONLY use sin()/cos()/periodicValue()** - these are the ONLY functions where both value AND derivative loop.

**APPROVED:**
- \`sin(time * TAU)\`, \`cos(time * TAU)\`
- \`periodicValue(time, offset)\` = \`0.5 + 0.5 * sin((time - offset) * TAU)\`
- Integer rotation: \`N * TAU * time\` where N is INTEGER
- Animated noise: \`vec2 tc = vec2(cos(TAU*time), sin(TAU*time)); noise(uv + tc*0.5)\`

### Key Patterns

**PCG Random:** \`uvec3 pcg(uvec3 v) {...}\`
**Rotation:** \`mat2(cos(a),-sin(a),sin(a),cos(a))\`
**Wrap:** \`mirror: abs(mod(uv+1,2)-1)\`, \`repeat: fract(uv)\``;

// src/knowledge/dsl-exemplars.ts
var DSL_EXEMPLAR_PATTERNS = `
## Canonical DSL Scaffolding Patterns

These patterns are MANDATORY \u2014 always follow them for the given effect type.

### Points (particle systems)
\`\`\`
search points, synth, render
noise().pointsEmit().physical().pointsRender().write(o0)
render(o0)
\`\`\`

### Billboard Particles (textured particles)
\`\`\`
search points, synth, render
polygon(radius: 0.7, fgAlpha: 0.1, bgAlpha: 0).write(o0)
noise(ridges: true)
  .pointsEmit(stateSize: x64)
  .physical()
  .pointsBillboardRender(tex: read(o0), pointSize: 40, sizeVariation: 50, rotationVariation: 50)
  .write(o1)
render(o1)
\`\`\`

### Feedback Loop
\`\`\`
search synth, filter, render
noise(ridges: true)
  .loopBegin(alpha: 95, intensity: 95)
  .warp()
  .loopEnd()
  .write(o0)
render(o0)
\`\`\`

### 3D Volumetric
\`\`\`
search synth3d, filter3d, render
noise3d(volumeSize: x32).write3d(vol0, geo0)
read3d(vol0, geo0).render3d().write(o0)
render(o0)
\`\`\`

### Mixer (two-source blend)
\`\`\`
search synth, mixer
noise(seed: 1).write(o0)
gradient().blendMode(tex: read(o0), mode: multiply).write(o1)
render(o1)
\`\`\`

### Simple Starter
\`\`\`
search synth
noise(octaves: 4, ridges: true).write(o0)
render(o0)
\`\`\`

### Filter Chain
\`\`\`
search synth, filter
noise(ridges: true).blur(radiusX: 5).bloom(taps: 15).vignette().write(o0)
render(o0)
\`\`\`

### RULES
1. Points effects ALWAYS get pointsEmit()/pointsRender() wrapper
2. Billboard particles need a sprite on a SEPARATE surface
3. 3D effects ALWAYS end with render3d()
4. Filters ALWAYS chain from a generator (never standalone)
5. Mixers ALWAYS need tex: read(surface) param
6. Feedback loops use loopBegin()/loopEnd() with filter effects inside
7. Always use noise() as the default starter (with ridges: true for visual interest)
`;
var DSL_EXEMPLAR_PROGRAMS = [
  // ── Basics (all 8) ──────────────────────────────────────────────────────
  {
    name: "background",
    dsl: "search classicNoisedeck\n\nbackground(backgroundType: 10, rotation: 0, opacity: 100, color1: #000000, color2: #ffffff).write(o0)\nrender(o0)",
    tags: ["classic", "basics", "background", "simple"],
    description: "Simple background generator with two-color gradient"
  },
  {
    name: "bit effects",
    dsl: "search classicNoisedeck\n\nbitEffects(loopAmp: 50, formula: 0, n: 1, colorScheme: 20, interp: 0, scale: 75, rotation: 0, maskFormula: 10, tiles: 5, complexity: 57, maskColorScheme: 1, baseHueRange: 50, hueRotation: 180, hueRange: 25).write(o0)\nrender(o0)",
    tags: ["classic", "basics", "bitEffects", "simple", "math-art"],
    description: "Bit manipulation math art with masked formula patterns and custom color scheme"
  },
  {
    name: "cell noise",
    dsl: "search classicNoisedeck\n\ncellNoise(scale: 75, cellScale: 87, cellSmooth: 11, cellVariation: 50, loopAmp: 1, colorMode: 0, palette: 0, cyclePalette: 1, rotatePalette: 0, repeatPalette: 1, paletteMode: 4).write(o0)\nrender(o0)",
    tags: ["classic", "basics", "cellNoise", "simple", "voronoi"],
    description: "Voronoi cell noise with smoothed cell boundaries and cycling palette"
  },
  {
    name: "fractal",
    dsl: "search classicNoisedeck\n\nfractal(fractalType: 0, zoomAmt: 0, rotation: 0, speed: 30, offsetX: 70, offsetY: 50, centerX: 0, centerY: 0, iterations: 50, colorMode: 4, palette: dealerHat, cyclePalette: 0, rotatePalette: 0, hueRange: 100, levels: 0, backgroundColor: #000000, backgroundOpacity: 100, cutoff: 0).write(o0)\nrender(o0)",
    tags: ["classic", "basics", "fractal", "simple", "mandelbrot"],
    description: "Mandelbrot fractal with dealerHat palette and animated zoom"
  },
  {
    name: "noise",
    dsl: "search classicNoisedeck\n\nnoise(noiseType: 10, octaves: 2, xScale: 75, yScale: 75, ridges: false, wrap: true, refractMode: 2, refractAmt: 0, loopOffset: 300, loopScale: 75, loopAmp: 25, kaleido: 1, metric: 0, colorMode: 6, hueRotation: 179, hueRange: 25, palette: afterimage, cyclePalette: 1, rotatePalette: 0, repeatPalette: 1, paletteMode: 3).write(o0)\nrender(o0)",
    tags: ["classic", "basics", "noise", "simple"],
    description: "Multi-octave noise with wrapping, afterimage palette, and HSV color rotation"
  },
  {
    name: "noise 3d",
    dsl: "search classicNoisedeck\n\nnoise3d(noiseType: 12, ridges: false, colorMode: 6).write(o0)\nrender(o0)",
    tags: ["classic", "basics", "noise3d", "simple", "3d"],
    description: "3D noise generator with HSV color mode"
  },
  {
    name: "pattern",
    dsl: "search classicNoisedeck\n\npattern(patternType: 1, scale: 80, skewAmt: 0, rotation: 0, lineWidth: 100, animation: 0, speed: 1, sharpness: 100, color1: #ffea31, color2: #000000).write(o0)\nrender(o0)",
    tags: ["classic", "basics", "pattern", "simple", "geometric"],
    description: "Dot pattern generator with yellow-black color scheme"
  },
  {
    name: "shapes",
    dsl: "search classicNoisedeck\n\nshapes(loopAOffset: 40, loopBOffset: 30, loopAScale: 1, loopBScale: 1, loopAAmp: 50, loopBAmp: 50, wrap: true, palette: sulphur, cyclePalette: 1, rotatePalette: 0, repeatPalette: 1).write(o0)\nrender(o0)",
    tags: ["classic", "basics", "shapes", "simple", "lissajous"],
    description: "Lissajous shapes with dual loop oscillators and sulphur palette"
  },
  // ── Classic (curated ~35) ───────────────────────────────────────────────
  {
    name: "1980s shmoos",
    dsl: "search classicNoisedeck\n\nshapes(loopAAmp: -32, loopAOffset: 200, loopAScale: 69, loopBAmp: -19, loopBOffset: 330, loopBScale: 47, palette: netOfGems, wrap: true, cyclePalette: 0, rotatePalette: 0).write(o0)\nshapes(loopAAmp: 32, loopAOffset: 200, loopAScale: 86, loopBAmp: -24, loopBOffset: 210, loopBScale: 18, palette: seventiesShirt, wrap: true, cyclePalette: 0, rotatePalette: 0).coalesce(tex: read(o0), blendMode: 6, mixAmt: 2, refractAAmt: 0, refractBAmt: 0).colorLab(colorMode: 2, dither: 0, hueRange: 100, hueRotation: 0, levels: 2, palette: seventiesShirt).palette(ampB: 43, ampG: 35, ampR: 91, freq: 4, offsetB: 17, offsetG: 66, offsetR: 90, phaseB: 100, phaseG: 33, phaseR: 58, paletteType: 0).write(o1)\nrender(o1)",
    tags: ["classic", "multi-chain", "shapes", "coalesce", "colorLab", "palette"],
    description: "Two shapes generators blended with coalesce, posterized with colorLab and custom palette remap"
  },
  {
    name: "acid rinse",
    dsl: "search classicNoisedeck\n\nnoise(hueRange: 75, hueRotation: 59, loopAmp: 29, octaves: 6, refractAmt: 35, ridges: true, noiseType: 10, colorMode: 6, kaleido: 1, xScale: 81, yScale: 81).write(o0)\nnoise(hueRange: 12, hueRotation: 28, loopAmp: 85, refractAmt: 33, ridges: false, wrap: false, xScale: 89, yScale: 92, noiseType: 2, colorMode: 6, kaleido: 1, octaves: 1).coalesce(tex: read(o0), blendMode: 8, mixAmt: 100, refractAAmt: 0, refractBAmt: 42).effects(effect: 4, effectAmt: 2, flip: 0, offsetX: 0, offsetY: 0, rotation: 0, scaleAmt: 100).lensDistortion(aberrationAmt: 100, blendMode: 0, hueRange: 100, hueRotation: 0, blendMode: 1, modulate: true, passthru: 57, opacity: 0, loopAmp: 0, distortion: 0).write(o1)\nrender(o1)",
    tags: ["classic", "multi-chain", "noise", "coalesce", "lens", "chromatic-aberration", "effects"],
    description: "Two noise generators coalesced with mirror effects and full chromatic aberration"
  },
  {
    name: "alien snowflake",
    dsl: "search classicNoisedeck\n\nnoise(hueRotation: 45, kaleido: 7, metric: 0, palette: solaris, wrap: true, noiseType: 2, colorMode: 4, xScale: 89, yScale: 89, octaves: 1).write(o0)\nnoise(hueRotation: 45, kaleido: 7, metric: 0, palette: solaris, wrap: true, noiseType: 2, colorMode: 4, xScale: 51, yScale: 51, octaves: 1).coalesce(tex: read(o0), blendMode: 5, mixAmt: -27, refractAAmt: 0, refractBAmt: 0).lensDistortion(aberrationAmt: 48, blendMode: 0, hueRange: 0, hueRotation: 0, blendMode: 1, modulate: true, passthru: 71, opacity: 0, loopAmp: 0, distortion: 0).write(o1)\nrender(o1)",
    tags: ["classic", "multi-chain", "noise", "kaleido", "lens", "coalesce"],
    description: "Two kaleido noise layers at different scales blended with lens distortion modulation"
  },
  {
    name: "and it burns, burns, burns",
    dsl: "search classicNoisedeck\n\nnoise(hueRange: 35, hueRotation: 80, loopAmp: 33, octaves: 6, refractAmt: 63, ridges: true, noiseType: 10, colorMode: 6, kaleido: 1, xScale: 97, yScale: 97).write(o0)\ncellNoise(colorMode: 0, loopAmp: 5, palette: royal, scale: 21, cellScale: 75, cellSmooth: 0, cellVariation: 0, cyclePalette: 1, rotatePalette: 0).coalesce(tex: read(o0), blendMode: 7, mixAmt: -15, refractAAmt: 0, refractBAmt: 39).lensDistortion(aberrationAmt: 0, distortion: -48, loopAmp: 54, loopScale: 94, opacity: 12, shape: 0, tint: #b42f2d, vignetteAmt: -46).write(o1)\nrender(o1)",
    tags: ["classic", "multi-chain", "noise", "cellNoise", "coalesce", "lens", "vignette"],
    description: "Ridged noise blended with cell noise, barrel distortion and warm-tinted vignette"
  },
  {
    name: "bitmaskception",
    dsl: "search classicNoisedeck\n\nbitEffects(baseHueRange: 30, colorScheme: 2, complexity: 34, formula: 20, hueRange: 0, hueRotation: 82, loopAmp: 79, tiles: 4, maskFormula: 20, maskColorScheme: 2).write(o0)\nbitEffects(baseHueRange: 95, colorScheme: 2, complexity: 50, formula: 11, hueRange: 12, hueRotation: 92, loopAmp: 31, tiles: 30, maskFormula: 11, maskColorScheme: 2).coalesce(tex: read(o0), blendMode: 11, mixAmt: 19, refractAAmt: 7, refractBAmt: 0).effects(effect: 100, effectAmt: 9, flip: 0, offsetX: 0, offsetY: 0, rotation: 0, scaleAmt: 100).write(o1)\nrender(o1)",
    tags: ["classic", "multi-chain", "bitEffects", "coalesce", "effects", "math-art"],
    description: "Two bit manipulation formulas coalesced with pixelation effects"
  },
  {
    name: "beautiful garbage",
    dsl: "search classicNoisedeck\n\nnoise(hueRange: 17, hueRotation: 52, loopAmp: 30, refractAmt: 43, ridges: false, wrap: true, xScale: 92, yScale: 90, noiseType: 3, colorMode: 6, kaleido: 1, octaves: 1).write(o0)\nnoise(hueRange: 27, hueRotation: 55, loopAmp: 34, refractAmt: 36, ridges: false, wrap: false, xScale: 94, yScale: 88, noiseType: 10, colorMode: 6, kaleido: 1, octaves: 1).coalesce(tex: read(o0), blendMode: 15, mixAmt: -60, refractAAmt: 67, refractBAmt: 21).lensDistortion(aberrationAmt: 28, distortion: -45, loopAmp: -100, loopScale: 73, opacity: 33, shape: 2, tint: #b39c4d, vignetteAmt: -100).lensDistortion(aberrationAmt: 80, blendMode: 0, hueRange: 77, hueRotation: 36, blendMode: 1, modulate: true, passthru: 91, opacity: 0, loopAmp: 0, distortion: 0).write(o1)\nrender(o1)",
    tags: ["classic", "multi-chain", "noise", "coalesce", "lens", "refraction", "vignette", "dual-lens"],
    description: "Two noise generators with heavy refraction, dual lens distortion with vignette and chromatic aberration"
  },
  {
    name: "blue kaleido",
    dsl: "search classicNoisedeck\n\nnoise(hueRange: 6, hueRotation: 62, loopAmp: -60, loopOffset: 80, loopScale: 17, refractAmt: 23, wrap: true, noiseType: 10, colorMode: 6, kaleido: 1, xScale: 30, yScale: 30, octaves: 1).kaleido(direction: 2, effectWidth: 5, kaleido: 5, kernel: 0, loopAmp: 4, loopOffset: 30, loopScale: 11, metric: 0, wrap: true).write(o1)\nrender(o1)",
    tags: ["classic", "noise", "kaleido", "filter"],
    description: "Noise generator piped through kaleido filter for five-fold symmetry pattern"
  },
  {
    name: "candy crystal cloud",
    dsl: "search classicNoisedeck\n\nnoise(hueRange: 98, hueRotation: 48, loopAmp: 9, loopOffset: 300, loopScale: 71, refractAmt: 37, wrap: true, noiseType: 3, colorMode: 6, kaleido: 1, xScale: 89, yScale: 89, octaves: 1).write(o0)\nnoise(hueRange: 49, hueRotation: 75, loopAmp: -2, loopOffset: 300, loopScale: 100, refractAmt: 71, wrap: true, noiseType: 0, colorMode: 6, kaleido: 1, xScale: 86, yScale: 86, octaves: 1).coalesce(tex: read(o0), blendMode: 12, mixAmt: 8, refractAAmt: 57, refractBAmt: 40).lensDistortion(aberrationAmt: 0, distortion: 0, loopAmp: 0, loopScale: 100, opacity: 30, shape: 0, tint: #c038ff, vignetteAmt: 0).refract().write(o1)\nrender(o1)",
    tags: ["classic", "multi-chain", "noise", "coalesce", "lens", "refraction"],
    description: "Two noise types coalesced with mutual refraction, purple tint overlay and refract filter"
  },
  {
    name: "chromatic liquid",
    dsl: "search classicNoisedeck\n\ncellNoise(colorMode: 1, loopAmp: 4, palette: justGreen, scale: 75, cellScale: 75, cellSmooth: 50, cellVariation: 0, cyclePalette: 1, rotatePalette: 0).write(o0)\nnoise(hueRange: 33, hueRotation: 82, loopAmp: 98, octaves: 1, refractAmt: 0, ridges: false, noiseType: 10, colorMode: 6, kaleido: 1, xScale: 74, yScale: 74).coalesce(tex: read(o0), blendMode: 15, mixAmt: 13, refractAAmt: 100, refractBAmt: 0).lensDistortion(aberrationAmt: 0, distortion: -35, loopAmp: 10, loopScale: 71, opacity: 34, shape: 0, tint: #ae5647, vignetteAmt: -60).lensDistortion(aberrationAmt: 69, blendMode: 0, hueRange: 100, hueRotation: 0, blendMode: 1, modulate: true, passthru: 52, opacity: 0, loopAmp: 0, distortion: 0).write(o1)\nrender(o1)",
    tags: ["classic", "multi-chain", "cellNoise", "noise", "coalesce", "lens", "dual-lens", "chromatic-aberration"],
    description: "Cell noise and smooth noise coalesced with full refraction, barrel distortion and chromatic aberration"
  },
  {
    name: "circuits of time",
    dsl: "search classicNoisedeck\n\nnoise(hueRange: 23, hueRotation: 26, loopAmp: 19, refractAmt: 100, ridges: true, wrap: false, xScale: 95, yScale: 92, noiseType: 3, colorMode: 6, kaleido: 1, octaves: 1).write(o0)\nnoise(hueRange: 46, hueRotation: 65, loopAmp: 21, refractAmt: 100, ridges: true, wrap: false, xScale: 99, yScale: 95, noiseType: 3, colorMode: 6, kaleido: 1, octaves: 1).coalesce(tex: read(o0), blendMode: 11, mixAmt: 49, refractAAmt: 100, refractBAmt: 100).lensDistortion(aberrationAmt: 16, distortion: -20, loopAmp: 0, loopScale: 60, opacity: 17, shape: 0, tint: #4986bc, vignetteAmt: -100).write(o1)\nrender(o1)",
    tags: ["classic", "multi-chain", "noise", "coalesce", "refraction", "lens", "vignette"],
    description: "Two ridged noise generators with max refraction coalesced, blue-tinted vignette with barrel distortion"
  },
  {
    name: "cool crystals",
    dsl: "search classicNoisedeck\n\ncellNoise(colorMode: 1, loopAmp: 20, palette: santaCruz, scale: 90, cellScale: 75, cellSmooth: 0, cellVariation: 0, cyclePalette: 1, rotatePalette: 0).write(o0)\ncellNoise(colorMode: 2, loopAmp: 20, palette: tungsten, scale: 90, cellScale: 75, cellSmooth: 0, cellVariation: 0, cyclePalette: 1, rotatePalette: 0).coalesce(tex: read(o0), blendMode: 7, mixAmt: -61, refractAAmt: 46, refractBAmt: 25).lensDistortion(aberrationAmt: 30, distortion: -40, loopAmp: 10, loopScale: 71, opacity: 61, shape: 0, tint: #4052ba, vignetteAmt: -100).lensDistortion(aberrationAmt: 100, blendMode: 0, hueRange: 39, hueRotation: 16, blendMode: 1, modulate: true, passthru: 60, opacity: 0, loopAmp: 0, distortion: 0).write(o1)\nrender(o1)",
    tags: ["classic", "multi-chain", "cellNoise", "coalesce", "lens", "dual-lens", "vignette"],
    description: "Two cell noise layers with different palettes coalesced with refraction, dual lens distortion and blue vignette"
  },
  {
    name: "cutout hearts",
    dsl: "search classicNoisedeck\n\npattern(color1: #000000, color2: #ff00f7, rotation: 25, scale: 97, skewAmt: 2, patternType: 3, speed: 1, animation: 0).write(o0)\nnoise(hueRange: 24, hueRotation: 60, loopAmp: 18, refractAmt: 77, ridges: false, wrap: true, xScale: 93, yScale: 67, noiseType: 3, colorMode: 6, kaleido: 1, octaves: 1).composite(tex: read(o0), blendMode: 1, inputColor: #000000, mixAmt: 0, range: 80).palette(ampB: 47, ampG: 2, ampR: 79, freq: 2, offsetB: 89, offsetG: 44, offsetR: 72, phaseB: 43, phaseG: 59, phaseR: 29, paletteType: 0).lensDistortion(aberrationAmt: 73, blendMode: 0, hueRange: 0, hueRotation: 77, blendMode: 1, modulate: false, passthru: 50, opacity: 0, loopAmp: 0, distortion: 0).write(o1)\nrender(o1)",
    tags: ["classic", "multi-chain", "pattern", "noise", "composite", "palette", "lens"],
    description: "Heart pattern composited with refracted noise, custom RGB palette remap and chromatic aberration"
  },
  {
    name: "cyber soup",
    dsl: "search classicNoisedeck\n\npattern(color1: #4a88fb, color2: #000000, rotation: 111, scale: 61, skewAmt: 0, patternType: 2, speed: 1, animation: 4).write(o0)\nnoise(hueRange: 20, hueRotation: 58, loopAmp: 78, loopOffset: 300, loopScale: 100, refractAmt: 68, wrap: true, noiseType: 3, colorMode: 6, kaleido: 1, xScale: 81, yScale: 81, octaves: 1).composite(tex: read(o0), blendMode: 2, inputColor: #000000, mixAmt: 4, range: 71).colorLab(colorMode: 2, dither: 0, hueRange: 154, hueRotation: 0, levels: 0, palette: eventHorizon).write(o1)\nrender(o1)",
    tags: ["classic", "multi-chain", "pattern", "noise", "composite", "colorLab"],
    description: "Grid pattern composited with refracted noise, remapped through eventHorizon palette"
  },
  {
    name: "double chess",
    dsl: "search classicNoisedeck\n\npattern(color1: #6272e7, color2: #f98a35, rotation: 45, scale: 96, skewAmt: 0, patternType: 0, speed: 1, animation: 2).write(o0)\npattern(color1: #da8b56, color2: #520e28, rotation: 180, scale: 86, skewAmt: 0, patternType: 0, speed: 1, animation: 2).coalesce(tex: read(o0), blendMode: 8, mixAmt: -52).write(o1)\nrender(o1)",
    tags: ["classic", "multi-chain", "pattern", "coalesce", "mixer"],
    description: "Two animated checkerboard patterns at different rotations blended together"
  },
  {
    name: "double mask",
    dsl: "search classicNoisedeck\n\nbitEffects(baseHueRange: 76, colorScheme: 0, complexity: 100, formula: 10, hueRange: 55, hueRotation: 94, loopAmp: 45, tiles: 10, maskFormula: 10, maskColorScheme: 0).write(o0)\nbitEffects(baseHueRange: 99, colorScheme: 2, complexity: 1, formula: 10, hueRange: 100, hueRotation: 7, loopAmp: 100, tiles: 1, maskFormula: 10, maskColorScheme: 2).coalesce(tex: read(o0), blendMode: 11, mixAmt: 1, refractAAmt: 0, refractBAmt: 0).write(o1)\nrender(o1)",
    tags: ["classic", "multi-chain", "bitEffects", "coalesce", "math-art"],
    description: "Two bit effect formulas with different tile scales blended for layered mathematical patterns"
  },
  {
    name: "dramatic pattern",
    dsl: "search classicNoisedeck\n\npattern(color1: #ffffff, color2: #000000, rotation: 142, scale: 98, skewAmt: 12, patternType: 8, speed: 1, animation: 0).write(o0)\ncellNoise(loopAmp: 7, palette: brushedMetal, scale: 79, cellScale: 75, cellSmooth: 50, cellVariation: 0, cyclePalette: 0, rotatePalette: 0).coalesce(tex: read(o0), blendMode: 13, mixAmt: 60, refractAAmt: 1, refractBAmt: 100).lensDistortion(aberrationAmt: 27, distortion: -31, loopAmp: -59, loopScale: 60, opacity: 34, shape: 0, tint: #5849bc, vignetteAmt: -37).write(o1)\nrender(o1)",
    tags: ["classic", "multi-chain", "pattern", "cellNoise", "coalesce", "lens", "refraction"],
    description: "Skewed geometric pattern blended with cell noise using heavy refraction and purple vignette"
  },
  {
    name: "entranced",
    dsl: "search classicNoisedeck\n\nshapes(loopAAmp: -21, loopAOffset: 410, loopAScale: 21, loopBAmp: 38, loopBOffset: 80, loopBScale: 78, palette: solaris, wrap: true, cyclePalette: 0, rotatePalette: 0).write(o0)\nshapes(loopAAmp: -67, loopAOffset: 410, loopAScale: 57, loopBAmp: 92, loopBOffset: 80, loopBScale: 1, palette: solaris, wrap: true, cyclePalette: 0, rotatePalette: 0).composite(tex: read(o0), blendMode: 3).colorLab(colorMode: 2, dither: 0, hueRange: 90, hueRotation: 0, levels: 0, palette: sulphur).write(o1)\nrender(o1)",
    tags: ["classic", "multi-chain", "shapes", "composite", "colorLab"],
    description: "Two shapes generators composited and remapped through sulphur palette for warm tones"
  },
  {
    name: "flashy fractal",
    dsl: "search classicNoisedeck\n\nfractal(centerX: 12, centerY: -57, fractalType: 0, offsetX: 35, offsetY: 59, palette: royal, rotation: 0, speed: 2, zoomAmt: 33, cyclePalette: 0, rotatePalette: 0).write(o0)\nfractal(centerX: 0, centerY: -4, fractalType: 1, offsetX: 31, offsetY: 0, palette: royal, rotation: 0, speed: 81, symmetry: 5, zoomAmt: 0, cyclePalette: 0, rotatePalette: 0).coalesce(tex: read(o0), blendMode: 13, mixAmt: 2, refractAAmt: 47, refractBAmt: 61).lensDistortion(aberrationAmt: 0, distortion: 6, loopAmp: -14, loopScale: 88, opacity: 81, shape: 0, tint: #487b9d, vignetteAmt: 72).effects(effect: 4, effectAmt: 0, flip: 15, offsetX: 0, offsetY: 0, rotation: 0, scaleAmt: 100).write(o1)\nrender(o1)",
    tags: ["classic", "multi-chain", "fractal", "coalesce", "lens", "effects"],
    description: "Two fractal types (Mandelbrot + symmetry) coalesced with refraction, tinted vignette and mirror"
  },
  {
    name: "fractal wave wash",
    dsl: "search classicNoisedeck\n\nfractal(centerX: 21, centerY: -37, fractalType: 0, offsetX: 73, offsetY: 52, palette: blueSkies, rotation: 127, speed: 75, zoomAmt: 91, cyclePalette: 0, rotatePalette: 0).write(o0)\nfractal(centerX: 21, centerY: 0, fractalType: 0, offsetX: 13, offsetY: 69, palette: blueSkies, rotation: 0, speed: 75, zoomAmt: 83, cyclePalette: 1, rotatePalette: 0).coalesce(tex: read(o0), blendMode: 100, mixAmt: -13, refractAAmt: 0, refractBAmt: 15).lensDistortion(aberrationAmt: 91, blendMode: 0, hueRange: 100, hueRotation: 0, blendMode: 1, modulate: true, passthru: 42, opacity: 0, loopAmp: 0, distortion: 0).write(o1)\nrender(o1)",
    tags: ["classic", "multi-chain", "fractal", "coalesce", "lens", "chromatic-aberration"],
    description: "Two deep-zoom Mandelbrot fractals blended with high chromatic aberration modulation"
  },
  {
    name: "glitched grid",
    dsl: "search classicNoisedeck\n\nnoise(hueRange: 0, hueRotation: 45, loopAmp: 79, refractAmt: 100, ridges: false, wrap: true, xScale: 100, yScale: 99, noiseType: 3, colorMode: 6, kaleido: 1, octaves: 1).write(o0)\npattern(color1: #8480ff, color2: #000000, rotation: 104, scale: 71, skewAmt: 1, patternType: 2, speed: 1, animation: 4).coalesce(tex: read(o0), blendMode: 17, mixAmt: 100, refractAAmt: 0, refractBAmt: 100).lensDistortion(aberrationAmt: 22, distortion: 56, loopAmp: -20, loopScale: 60, opacity: 4, shape: 6, tint: #494abc, vignetteAmt: -69).write(o1)\nrender(o1)",
    tags: ["classic", "multi-chain", "noise", "pattern", "coalesce", "lens", "refraction"],
    description: "Refracted noise blended with animated grid pattern, pincushion distortion and purple vignette"
  },
  {
    name: "glitchy melted candy",
    dsl: "search classicNoisedeck\n\nnoise(palette: cottonCandy, refractAmt: 34, ridges: false, noiseType: 10, colorMode: 4, kaleido: 1, xScale: 2, yScale: 2, octaves: 1).write(o0)\nnoise(palette: cottonCandy, refractAmt: 62, ridges: false, noiseType: 10, colorMode: 4, kaleido: 1, xScale: 3, yScale: 3, octaves: 1).composite(tex: read(o0), blendMode: 113).glitch(aberrationAmt: 32, distortion: 96, glitchiness: 6, scanlinesAmt: 69, vignetteAmt: 49, xChonk: 88, yChonk: 8).write(o1)\nrender(o1)",
    tags: ["classic", "multi-chain", "noise", "composite", "glitch"],
    description: "Two low-scale noise layers composited with heavy glitch effect including scanlines and distortion"
  },
  {
    name: "golden rings",
    dsl: "search classicNoisedeck\n\nnoise(hueRange: 15, hueRotation: 47, loopAmp: 61, refractAmt: 8, ridges: true, wrap: true, xScale: 100, yScale: 89, noiseType: 0, colorMode: 6, kaleido: 1, octaves: 1).write(o0)\nshapes(loopAAmp: 100, loopAOffset: 10, loopAScale: 81, loopBAmp: -38, loopBOffset: 400, loopBScale: 75, palette: tungsten, wrap: true, cyclePalette: 0, rotatePalette: 0).coalesce(tex: read(o0), blendMode: 15, mixAmt: 19, refractAAmt: 45, refractBAmt: 0).lensDistortion(aberrationAmt: 60, distortion: -57, loopAmp: -8, loopScale: 55, opacity: 0, shape: 0, tint: #5ad2f2, vignetteAmt: 100).refract().write(o1)\nrender(o1)",
    tags: ["classic", "multi-chain", "noise", "shapes", "coalesce", "lens", "refraction"],
    description: "Noise and shapes generators coalesced with refraction, barrel distortion and refract filter"
  },
  {
    name: "hallucinogrid",
    dsl: "search classicNoisedeck\n\npattern(color1: #00ffd5, color2: #000000, rotation: 130, scale: 75, skewAmt: 0, patternType: 2, speed: 1, animation: 4).write(o0)\nnoise(hueRange: 21, hueRotation: 43, loopAmp: 100, refractAmt: 100, ridges: true, wrap: true, xScale: 99, yScale: 97, noiseType: 3, colorMode: 6, kaleido: 1, octaves: 1).coalesce(tex: read(o0), blendMode: 9, mixAmt: -56, refractAAmt: 27, refractBAmt: 29).lensDistortion(aberrationAmt: 100, distortion: -64, loopAmp: -10, loopScale: 62, opacity: 11, shape: 0, tint: #75c5c7, vignetteAmt: -100).write(o1)\nrender(o1)",
    tags: ["classic", "multi-chain", "pattern", "noise", "coalesce", "lens", "chromatic-aberration", "vignette"],
    description: "Cyan animated grid blended with ridged refracted noise, full chromatic aberration and barrel distortion"
  },
  {
    name: "holo-transmission",
    dsl: "search classicNoisedeck\n\nnoise(hueRange: 9, hueRotation: 15, loopAmp: 73, loopOffset: 300, loopScale: 29, refractAmt: 71, wrap: true, noiseType: 3, colorMode: 6, kaleido: 1, xScale: 74, yScale: 74, octaves: 1).write(o0)\nbitEffects(colorScheme: 5, formula: 0, interp: 0, loopAmp: 34, n: 1, rotation: 0, scale: 88).glitch(aberrationAmt: 14).effects(effectAmt: 84, effect: 0).write(o1)\nrender(o1)",
    tags: ["classic", "multi-chain", "noise", "bitEffects", "glitch", "effects"],
    description: "Noise and bit effects on separate chains with glitch filter and zoom effects"
  },
  {
    name: "holographic noodles",
    dsl: "search classicNoisedeck\n\nnoise(hueRange: 9, hueRotation: 32, loopAmp: 17, refractAmt: 22, ridges: true, wrap: true, xScale: 90, yScale: 90, noiseType: 3, colorMode: 6, kaleido: 1, octaves: 1).write(o0)\nnoise(hueRange: 9, hueRotation: 67, loopAmp: 25, refractAmt: 0, ridges: true, wrap: true, xScale: 60, yScale: 60, noiseType: 3, colorMode: 6, kaleido: 1, octaves: 1).coalesce(tex: read(o0), blendMode: 9, mixAmt: 48, refractAAmt: 14, refractBAmt: 3).lensDistortion(aberrationAmt: 70, blendMode: 0, hueRange: 50, hueRotation: 34, blendMode: 1, modulate: false, passthru: 44, opacity: 0, loopAmp: 0, distortion: 0).refract().write(o1)\nrender(o1)",
    tags: ["classic", "multi-chain", "noise", "coalesce", "lens", "refraction", "chromatic-aberration"],
    description: "Two ridged noise generators at different scales coalesced with chromatic aberration and refract filter"
  },
  {
    name: "illuminatus",
    dsl: "search classicNoisedeck\n\nshapes(loopAAmp: -22, loopAOffset: 410, loopAScale: 100, loopBAmp: 63, loopBOffset: 20, loopBScale: 61, palette: solaris, wrap: true, cyclePalette: 0, rotatePalette: 0).write(o0)\nshapes(loopAAmp: 50, loopAOffset: 410, loopAScale: 20, loopBAmp: 98, loopBOffset: 20, loopBScale: 1, palette: solaris, wrap: true, cyclePalette: 0, rotatePalette: 0).composite(tex: read(o0), blendMode: 3).colorLab(brightness: 4, colorMode: 2, dither: 0, hueRange: 200, hueRotation: 0, levels: 0, palette: sulphur, saturation: -6).write(o1)\nrender(o1)",
    tags: ["classic", "multi-chain", "shapes", "composite", "colorLab"],
    description: "Two shapes oscillators composited with wide hue range colorLab remap and desaturation"
  },
  {
    name: "kaleido-singularity",
    dsl: "search classicNoisedeck\n\nnoise(hueRotation: 81, kaleido: 3, metric: 4, palette: eventHorizon, wrap: true, noiseType: 3, colorMode: 4, xScale: 81, yScale: 81, octaves: 1).coalesce(tex: read(o0), blendMode: 9, mixAmt: -100, refractAAmt: 100, refractBAmt: 0).glitch(aberrationAmt: 33, distortion: -62, glitchiness: 6, scanlinesAmt: 46, vignetteAmt: -57, xChonk: 100, yChonk: 75).write(o1)\nrender(o1)",
    tags: ["classic", "noise", "kaleido", "coalesce", "glitch"],
    description: "Kaleido noise with self-refraction coalesce and heavy glitch scanline effects"
  },
  {
    name: "kaleidopalooze",
    dsl: "search classicNoisedeck\n\nnoise(hueRotation: 0, kaleido: 7, metric: 0, wrap: true, palette: royal, noiseType: 2, colorMode: 4, xScale: 52, yScale: 52, octaves: 1).write(o0)\nnoise(hueRange: 66, hueRotation: 36, loopAmp: 46, refractAmt: 68, ridges: true, wrap: false, xScale: 88, yScale: 94, noiseType: 3, colorMode: 6, kaleido: 1, octaves: 1).coalesce(tex: read(o0), blendMode: 12, mixAmt: -19, refractAAmt: 0, refractBAmt: 40).kaleido(direction: 2, effectWidth: 3, kaleido: 7, kernel: 0, loopAmp: -10, loopOffset: 10, loopScale: 100, metric: 0, wrap: true).kaleido(direction: 2, effectWidth: 3, kaleido: 7, kernel: 0, loopAmp: 10, loopOffset: 10, loopScale: 86, metric: 0, wrap: true).write(o1)\nrender(o1)",
    tags: ["classic", "multi-chain", "noise", "coalesce", "kaleido", "dual-kaleido"],
    description: "Two noise generators coalesced through dual kaleido filters for seven-fold nested symmetry"
  },
  {
    name: "liquid flame",
    dsl: "search classicNoisedeck\n\nnoise(hueRange: 23, hueRotation: 76, loopAmp: 11, loopOffset: 210, loopScale: 50, refractAmt: 34, wrap: true, noiseType: 3, colorMode: 6, kaleido: 1, xScale: 92, yScale: 92, octaves: 1).write(o0)\nnoise(hueRange: 11, hueRotation: 76, loopAmp: 58, loopOffset: 210, loopScale: 100, refractAmt: 51, wrap: true, noiseType: 3, colorMode: 6, kaleido: 1, xScale: 78, yScale: 78, octaves: 1).coalesce(tex: read(o0), blendMode: 17, mixAmt: -4, refractAAmt: 57, refractBAmt: 40).lensDistortion(aberrationAmt: 0, distortion: 21, loopAmp: -3, loopScale: 99, opacity: 39, shape: 0, tint: #ca7907, vignetteAmt: -21).refract().write(o1)\nrender(o1)",
    tags: ["classic", "multi-chain", "noise", "coalesce", "lens", "refraction"],
    description: "Two warm-hued noise generators coalesced with mutual refraction, amber tint and refract filter"
  },
  {
    name: "liquid ice",
    dsl: "search classicNoisedeck\n\ncellNoise(colorMode: 1, loopAmp: 19, palette: jester, scale: 88, cellScale: 75, cellSmooth: 50, cellVariation: 0, cyclePalette: 1, rotatePalette: 0).write(o0)\ncellNoise(colorMode: 2, loopAmp: 8, palette: neptune, scale: 92, cellScale: 75, cellSmooth: 0, cellVariation: 0, cyclePalette: 1, rotatePalette: 0).coalesce(tex: read(o0), blendMode: 0, mixAmt: -50, refractAAmt: 61, refractBAmt: 34).lensDistortion(aberrationAmt: 30, distortion: -32, loopAmp: 15, loopScale: 73, opacity: 59, shape: 0, tint: #5e9e96, vignetteAmt: -100).refract().write(o1)\nrender(o1)",
    tags: ["classic", "multi-chain", "cellNoise", "coalesce", "lens", "refraction", "vignette"],
    description: "Two cell noise generators with jester and neptune palettes, refraction blend with teal vignette"
  },
  {
    name: "liquid infinity",
    dsl: "search classicNoisedeck\n\nnoise(hueRange: 67, hueRotation: 9, loopAmp: 89, refractAmt: 100, ridges: true, wrap: true, xScale: 94, yScale: 97, noiseType: 3, colorMode: 6, kaleido: 1, octaves: 1).write(o0)\nnoise(hueRange: 66, hueRotation: 20, loopAmp: 82, refractAmt: 100, ridges: true, wrap: true, xScale: 94, yScale: 97, noiseType: 3, colorMode: 6, kaleido: 1, octaves: 1).coalesce(tex: read(o0), blendMode: 11, mixAmt: 55, refractAAmt: 100, refractBAmt: 100).lensDistortion(aberrationAmt: 20, distortion: -41, loopAmp: -10, loopScale: 60, opacity: 18, shape: 0, tint: #4950bc, vignetteAmt: -61).write(o1)\nrender(o1)",
    tags: ["classic", "multi-chain", "noise", "coalesce", "refraction", "lens", "vignette"],
    description: "Two max-refraction ridged noise generators coalesced with full mutual refraction and blue vignette"
  },
  {
    name: "maelstrom",
    dsl: "search classicNoisedeck\n\nfractal(centerX: 0, centerY: 0, fractalType: 0, offsetX: 40, offsetY: 58, palette: grayscale, rotation: 183, speed: 33, zoomAmt: 0, cyclePalette: 0, rotatePalette: 0).write(o0)\nnoise(hueRange: 26, hueRotation: 81, loopAmp: 100, refractAmt: 73, ridges: true, wrap: true, xScale: 95, yScale: 96, noiseType: 3, colorMode: 6, kaleido: 1, octaves: 1).coalesce(tex: read(o0), blendMode: 10, mixAmt: 100, refractAAmt: 0, refractBAmt: 51).lensDistortion(aberrationAmt: 41, distortion: 23, loopAmp: 48, loopScale: 24, opacity: 14, shape: 0, tint: #935343, vignetteAmt: -47).write(o1)\nrender(o1)",
    tags: ["classic", "multi-chain", "fractal", "noise", "coalesce", "lens"],
    description: "Grayscale Mandelbrot fractal blended with ridged refracted noise, warm-tinted lens distortion"
  },
  {
    name: "melt",
    dsl: "search classicNoisedeck\n\nnoise(hueRange: 17, hueRotation: 21, loopAmp: -27, loopOffset: 210, loopScale: 84, refractAmt: 88, wrap: true, noiseType: 3, colorMode: 6, kaleido: 1, xScale: 85, yScale: 85, octaves: 1).write(o0)\ncellNoise(colorMode: 1, loopAmp: 5, palette: blueSkies, scale: 69, cellScale: 75, cellSmooth: 0, cellVariation: 0, cyclePalette: 0, rotatePalette: 0).composite(tex: read(o0), blendMode: 1, inputColor: #000000, mixAmt: 46, range: 44).lensDistortion(aberrationAmt: 65, blendMode: 0, hueRange: 38, hueRotation: 0, blendMode: 0, modulate: false, passthru: 61, opacity: 0, loopAmp: 0, distortion: 0).refract().write(o1)\nrender(o1)",
    tags: ["classic", "multi-chain", "noise", "cellNoise", "composite", "lens", "refraction"],
    description: "Refracted noise composited with blue cell noise, chromatic aberration and refract filter"
  },
  {
    name: "oil cloud",
    dsl: "search classicNoisedeck\n\nnoise(hueRange: 100, hueRotation: 25, loopAmp: 100, octaves: 4, refractAmt: 5, ridges: true, noiseType: 10, colorMode: 6, kaleido: 1, xScale: 81, yScale: 81).write(o0)\nnoise(hueRange: 93, hueRotation: 25, loopAmp: 100, octaves: 1, refractAmt: 5, ridges: false, noiseType: 10, colorMode: 6, kaleido: 1, xScale: 81, yScale: 81).coalesce(tex: read(o0), blendMode: 5, mixAmt: 32, refractAAmt: 0, refractBAmt: 0).refract().refract().write(o1)\nrender(o1)",
    tags: ["classic", "multi-chain", "noise", "coalesce", "refraction", "double-refract"],
    description: "Two full-spectrum noise generators coalesced and double-refracted for iridescent oil effect"
  },
  {
    name: "prismatic cloud",
    dsl: "search classicNoisedeck\n\nnoise(hueRange: 37, hueRotation: 0, loopAmp: 26, octaves: 5, refractAmt: 100, ridges: false, noiseType: 10, colorMode: 6, kaleido: 1, xScale: 98, yScale: 98).write(o0)\nnoise(hueRange: 100, hueRotation: 28, loopAmp: 98, refractAmt: 0, ridges: false, wrap: false, xScale: 98, yScale: 98, noiseType: 2, colorMode: 6, kaleido: 1, octaves: 1).coalesce(tex: read(o0), blendMode: 8, mixAmt: -72, refractAAmt: 0, refractBAmt: 100).lensDistortion(aberrationAmt: 0, distortion: -22, loopAmp: 10, loopScale: 71, opacity: 0, shape: 2, tint: #8a47ae, vignetteAmt: -73).lensDistortion(aberrationAmt: 100, blendMode: 0, hueRange: 12, hueRotation: 15, blendMode: 1, modulate: false, passthru: 76, opacity: 0, loopAmp: 0, distortion: 0).write(o1)\nrender(o1)",
    tags: ["classic", "multi-chain", "noise", "coalesce", "lens", "dual-lens", "chromatic-aberration", "vignette"],
    description: "Multi-octave noise with full refraction coalesced, dual lens distortion with vignette and chromatic aberration"
  },
  {
    name: "prismatic goop",
    dsl: "search classicNoisedeck\n\npattern(color1: #ffffff, color2: #000000, rotation: 0, scale: 95, skewAmt: 8, patternType: 0, speed: 1, animation: 2).write(o0)\nnoise(hueRange: 25, hueRotation: 52, loopAmp: 53, refractAmt: 76, ridges: true, wrap: true, xScale: 95, yScale: 82, noiseType: 3, colorMode: 6, kaleido: 1, octaves: 1).coalesce(tex: read(o0), blendMode: 10, mixAmt: 43, refractAAmt: 10, refractBAmt: 0).lensDistortion(aberrationAmt: 100, blendMode: 0, hueRange: 71, hueRotation: 0, blendMode: 1, modulate: true, passthru: 47, opacity: 0, loopAmp: 0, distortion: 0).effects(effect: 4, effectAmt: 0, flip: 2, offsetX: 0, offsetY: 0, rotation: 59, scaleAmt: 146).write(o1)\nrender(o1)",
    tags: ["classic", "multi-chain", "pattern", "noise", "coalesce", "lens", "effects", "chromatic-aberration"],
    description: "Animated checkerboard coalesced with refracted noise, full chromatic aberration and rotated mirror"
  },
  {
    name: "pure reflection",
    dsl: "search classicNoisedeck\n\nshapes(loopAAmp: -28, loopAOffset: 30, loopAScale: 97, loopBAmp: 82, loopBOffset: 30, loopBScale: 7, wrap: true, palette: columbia, cyclePalette: 0, rotatePalette: 0).write(o0)\nshapes(loopAAmp: 43, loopAOffset: 210, loopAScale: 63, loopBAmp: -53, loopBOffset: 30, loopBScale: 71, wrap: true, palette: vibrant, cyclePalette: 0, rotatePalette: 0).composite(tex: read(o0), blendMode: 1, inputColor: #341cd4, mixAmt: 43, range: 30).refract().colorLab(colorMode: 2, dither: 0, hueRange: 200, hueRotation: 0, levels: 0, palette: sulphur).write(o1)\nrender(o1)",
    tags: ["classic", "multi-chain", "shapes", "composite", "refraction", "colorLab"],
    description: "Two shapes generators with different palettes composited with blue tint, refracted and color-remapped"
  },
  {
    name: "satin touch",
    dsl: "search classicNoisedeck\n\nnoise(hueRange: 7, hueRotation: 73, loopAmp: 52, refractAmt: 80, ridges: false, wrap: true, xScale: 89, yScale: 93, noiseType: 10, colorMode: 6, kaleido: 1, octaves: 1).write(o0)\nnoise(hueRange: 38, hueRotation: 63, loopAmp: 46, octaves: 5, refractAmt: 83, ridges: true, noiseType: 10, colorMode: 6, kaleido: 1, xScale: 100, yScale: 100).coalesce(tex: read(o0), blendMode: 10, mixAmt: 100, refractAAmt: 24, refractBAmt: 10).colorLab(colorMode: 3, dither: 0, hueRange: 105, hueRotation: 55, levels: 0, palette: sulphur).colorLab(colorMode: 2, dither: 0, hueRange: 100, hueRotation: 88, levels: 0, palette: toxic).write(o1)\nrender(o1)",
    tags: ["classic", "multi-chain", "noise", "coalesce", "colorLab", "dual-colorLab"],
    description: "Two refracted noise generators coalesced with dual colorLab remapping through sulphur and toxic palettes"
  },
  {
    name: "see you in prism",
    dsl: "search classicNoisedeck\n\nnoise(hueRange: 18, hueRotation: 20, loopAmp: -30, loopOffset: 20, loopScale: 81, refractAmt: 94, wrap: true, noiseType: 3, colorMode: 6, kaleido: 1, xScale: 100, yScale: 100, octaves: 1).write(o0)\ncellNoise(colorMode: 2, loopAmp: 0, palette: royal, scale: 84, cellScale: 75, cellSmooth: 0, cellVariation: 0, cyclePalette: 1, rotatePalette: 0).composite(tex: read(o0), blendMode: 1, inputColor: #8f8f8f, mixAmt: 0, range: 54).lensDistortion(aberrationAmt: 100, distortion: -67, loopAmp: 83, loopScale: 39, opacity: 33, shape: 6, tint: #412036, vignetteAmt: -46).refract().write(o1)\nrender(o1)",
    tags: ["classic", "multi-chain", "noise", "cellNoise", "composite", "lens", "refraction"],
    description: "Refracted noise composited with royal cell noise, strong barrel distortion with diamond vignette and refract"
  },
  {
    name: "digital camo",
    dsl: "search classicNoisedeck\n\nnoise(hueRange: 3, hueRotation: 59, loopAmp: 22, loopOffset: 210, loopScale: 52, refractAmt: 35, wrap: true, noiseType: 0, colorMode: 6, kaleido: 1, xScale: 22, yScale: 22, octaves: 1).effects(effect: 100, effectAmt: 9, flip: 0, offsetX: 0, offsetY: 0, rotation: 0, scaleAmt: 100).write(o1)\nrender(o1)",
    tags: ["classic", "noise", "effects", "pixelate", "filter"],
    description: "Low-scale noise with refraction pixelated into digital camouflage pattern"
  },
  {
    name: "edgy fractal",
    dsl: "search classicNoisedeck\n\nfractal(centerX: 0, centerY: 0, fractalType: 1, offsetX: 0, offsetY: 0, palette: vibrant, rotation: 0, speed: 51, symmetry: 4, zoomAmt: 0, cyclePalette: 0, rotatePalette: 0).write(o0)\nrender(o0)",
    tags: ["classic", "fractal", "simple", "symmetry"],
    description: "Symmetry fractal with four-fold rotation and vibrant palette"
  },
  {
    name: "cyberfall",
    dsl: "search classicNoisedeck\n\nbitEffects(colorScheme: 11, formula: 0, interp: 0, loopAmp: 100, n: 1, rotation: 45, scale: 84).write(o0)\nrender(o0)",
    tags: ["classic", "bitEffects", "simple", "math-art"],
    description: "Rotated bit manipulation formula with high animation speed"
  },
  // ── Modern Synth (generators) ─────────────────────────────────────────
  {
    name: "simple noise",
    dsl: "search synth\n\nnoise(octaves: 4, ridges: true).write(o0)\nrender(o0)",
    tags: ["synth", "noise", "simple", "starter"],
    description: "Basic ridged multi-octave noise \u2014 the default go-to starter"
  },
  {
    name: "perlin landscape",
    dsl: "search synth\n\nperlin(scale: 50, octaves: 3, ridges: true).write(o0)\nrender(o0)",
    tags: ["synth", "perlin", "simple", "noise"],
    description: "Perlin noise with ridges and moderate scale for organic landscapes"
  },
  {
    name: "warped perlin",
    dsl: "search synth\n\nperlin(scale: 40, octaves: 2, warpIterations: 3, warpScale: 60, warpIntensity: 70).write(o0)\nrender(o0)",
    tags: ["synth", "perlin", "warp", "domain-warping"],
    description: "Domain-warped perlin noise creating fluid organic distortions"
  },
  {
    name: "cell noise mono",
    dsl: "search synth\n\ncell(scale: 50, cellScale: 80, cellSmooth: 30).write(o0)\nrender(o0)",
    tags: ["synth", "cell", "voronoi", "simple"],
    description: "Smooth voronoi cell noise at medium scale"
  },
  {
    name: "curl flow",
    dsl: "search synth\n\ncurl(scale: 20, octaves: 3, ridges: true, intensity: 0.8).write(o0)\nrender(o0)",
    tags: ["synth", "curl", "flow", "vector-field"],
    description: "Curl noise with ridges for flowing vector field patterns"
  },
  {
    name: "julia set",
    dsl: "search synth\n\njulia(poi: douadyRabbit, iterations: 300, outputMode: smoothIteration).write(o0)\nrender(o0)",
    tags: ["synth", "julia", "fractal", "complex"],
    description: "Julia set fractal at the Douady rabbit point of interest"
  },
  {
    name: "animated julia",
    dsl: "search synth\n\njulia(poi: manual, cReal: -0.7, cImag: 0.4, cPath: cardioid, cSpeed: 0.3).write(o0)\nrender(o0)",
    tags: ["synth", "julia", "fractal", "animated"],
    description: "Julia set with c-parameter animating along cardioid path"
  },
  {
    name: "mandelbrot deep zoom",
    dsl: "search synth\n\nmandelbrot(poi: seahorseValley, iterations: 500, zoomSpeed: 0.5, outputMode: smoothIteration).write(o0)\nrender(o0)",
    tags: ["synth", "mandelbrot", "fractal", "zoom"],
    description: "Deep-zooming Mandelbrot at Seahorse Valley with smooth coloring"
  },
  {
    name: "fractal explorer",
    dsl: "search synth\n\nfractal(type: burningShip, power: 2, iterations: 200, zoom: 1.5).write(o0)\nrender(o0)",
    tags: ["synth", "fractal", "burningShip", "explorer"],
    description: "Burning ship fractal variant"
  },
  {
    name: "gabor texture",
    dsl: "search synth\n\ngabor(scale: 50, orientation: 45, bandwidth: 50, density: 5).write(o0)\nrender(o0)",
    tags: ["synth", "gabor", "texture", "oriented"],
    description: "Gabor noise with oriented bandwidth for directional textures"
  },
  {
    name: "color gradient",
    dsl: "search synth\n\ngradient(gradientType: radial, color1: #ff0044, color2: #4400ff, color3: #00ff88, color4: #ffaa00).write(o0)\nrender(o0)",
    tags: ["synth", "gradient", "color", "simple"],
    description: "Radial four-color gradient generator"
  },
  {
    name: "oscillator stripes",
    dsl: "search synth\n\nosc2d(oscType: sine, freq: 8, speed: 2, rotation: 30).write(o0)\nrender(o0)",
    tags: ["synth", "osc2d", "geometric", "oscillator"],
    description: "2D sine wave oscillator with angled rotation"
  },
  {
    name: "polygon sprite",
    dsl: "search synth\n\npolygon(sides: 6, radius: 0.6, smooth: 0.02, fgColor: #ffffff, bgColor: #000000, bgAlpha: 0).write(o0)\nrender(o0)",
    tags: ["synth", "polygon", "geometric", "shape"],
    description: "Hexagonal polygon with transparent background for compositing"
  },
  {
    name: "shape morphing",
    dsl: "search synth\n\nshape(loopAOffset: dodecahedron, loopBOffset: icosahedron, loopAScale: 50, loopBScale: 30, wrap: true).write(o0)\nrender(o0)",
    tags: ["synth", "shape", "morphing", "lissajous"],
    description: "Animated shape morph between dodecahedron and icosahedron projections"
  },
  {
    name: "reaction diffusion",
    dsl: "search synth\n\nrd(iterations: 16, colorMode: gradient).write(o0)\nrender(o0)",
    tags: ["synth", "rd", "reaction-diffusion", "simulation"],
    description: "Reaction-diffusion simulation with gradient coloring"
  },
  {
    name: "cellular automaton",
    dsl: "search synth\n\nca(ruleIndex: 4, stateSize: x64, speed: 2).write(o0)\nrender(o0)",
    tags: ["synth", "ca", "cellular-automata", "simulation"],
    description: "2D cellular automaton with larger state buffer"
  },
  {
    name: "multi-neighborhood ca",
    dsl: "search synth\n\nmnca(ruleIndex: 4, stateSize: x16, speed: 2).write(o0)\nrender(o0)",
    tags: ["synth", "mnca", "cellular-automata", "simulation"],
    description: "Multi-neighborhood cellular automaton \u2014 complex emergent patterns"
  },
  {
    name: "mod pattern grid",
    dsl: "search synth\n\nmodPattern(shape1: circle, scale1: 12, shape2: square, scale2: 8, blend: 0.5, speed: 1).write(o0)\nrender(o0)",
    tags: ["synth", "modPattern", "geometric", "pattern"],
    description: "Modular arithmetic pattern with blended circle and square grids"
  },
  {
    name: "pattern stripes",
    dsl: "search synth\n\npattern(type: stripes, scale: 80, rotation: 45, smoothness: 0.05, speed: 1).write(o0)\nrender(o0)",
    tags: ["synth", "pattern", "geometric", "stripes"],
    description: "Angled stripe pattern with smooth edges"
  },
  {
    name: "subdivide tiles",
    dsl: "search synth\n\nsubdivide(depth: 6, density: 80, fill: quad, outline: 2).write(o0)\nrender(o0)",
    tags: ["synth", "subdivide", "geometric", "tiling"],
    description: "Recursive subdivision tiling with outlined quads"
  },
  {
    name: "solid color",
    dsl: "search synth\n\nsolid(color: #1a1a2e).write(o0)\nrender(o0)",
    tags: ["synth", "solid", "simple", "color"],
    description: "Solid color \u2014 useful as a base for filter chains"
  },
  // ── Filter Chains ─────────────────────────────────────────────────────
  {
    name: "noise with bloom",
    dsl: "search synth, filter\n\nnoise(ridges: true, octaves: 3)\n  .bloom(taps: 15)\n  .vignette()\n  .write(o0)\nrender(o0)",
    tags: ["filter", "bloom", "vignette", "post-processing"],
    description: "Ridged noise with bloom glow and vignette darkening"
  },
  {
    name: "chromatic noise",
    dsl: "search synth, filter\n\nnoise(colorMode: mono, ridges: true)\n  .chromaticAberration()\n  .write(o0)\nrender(o0)",
    tags: ["filter", "chromaticAberration", "color-split"],
    description: "Monochrome noise with RGB channel separation"
  },
  {
    name: "prismatic noise",
    dsl: "search synth, filter\n\nnoise(ridges: true, colorMode: mono)\n  .prismaticAberration(modulate: true)\n  .write(o0)\nrender(o0)",
    tags: ["filter", "prismaticAberration", "rainbow"],
    description: "Monochrome noise with prismatic rainbow aberration"
  },
  {
    name: "lit terrain",
    dsl: "search synth, filter\n\nnoise(ridges: true)\n  .lighting(normalStrength: 2)\n  .write(o0)\nrender(o0)",
    tags: ["filter", "lighting", "normals", "3d-look"],
    description: "Noise as a heightmap with dynamic lighting for 3D terrain look"
  },
  {
    name: "cloud layer",
    dsl: "search synth, filter\n\nsolid(color: #2d78f0)\n  .clouds(scale: 0.55)\n  .write(o0)\nrender(o0)",
    tags: ["filter", "clouds", "sky", "atmosphere"],
    description: "Procedural cloud layer over solid blue sky"
  },
  {
    name: "fiber texture",
    dsl: "search synth, filter\n\nsolid(color: #000000)\n  .fibers(density: 1)\n  .write(o0)\nrender(o0)",
    tags: ["filter", "fibers", "texture", "overlay"],
    description: "Fiber texture overlay on black background"
  },
  {
    name: "scratched surface",
    dsl: "search synth, filter\n\nsolid(color: #2b2b2b)\n  .scratches()\n  .write(o0)\nrender(o0)",
    tags: ["filter", "scratches", "texture", "grunge"],
    description: "Dark surface with scratch texture overlay"
  },
  {
    name: "grime layer",
    dsl: "search synth, filter\n\nsolid(color: #ffffff)\n  .grime(strength: 1)\n  .write(o0)\nrender(o0)",
    tags: ["filter", "grime", "texture", "grunge"],
    description: "Grime texture on white for aging/weathering effects"
  },
  {
    name: "spattered ink",
    dsl: "search synth, filter\n\nsolid(color: #d4d4d4)\n  .spatter(density: 1)\n  .write(o0)\nrender(o0)",
    tags: ["filter", "spatter", "texture", "ink"],
    description: "Ink spatter effect on light background"
  },
  {
    name: "historic palette remap",
    dsl: "search synth, filter\n\nnoise(ridges: true, colorMode: mono)\n  .historicPalette()\n  .write(o0)\nrender(o0)",
    tags: ["filter", "historicPalette", "color", "remap"],
    description: "Monochrome noise remapped through a historic color palette"
  },
  {
    name: "tinted noise",
    dsl: "search synth, filter\n\nnoise(ridges: true, colorMode: mono)\n  .tint(color: #ff0000, alpha: 0.5, mode: overlay)\n  .write(o0)\nrender(o0)",
    tags: ["filter", "tint", "color", "overlay"],
    description: "Monochrome noise with red tint overlay"
  },
  {
    name: "oklab color",
    dsl: "search synth, filter\n\nnoise(ridges: true)\n  .colorspace(mode: oklab)\n  .write(o0)\nrender(o0)",
    tags: ["filter", "colorspace", "oklab", "color"],
    description: "Noise processed in perceptual oklab color space"
  },
  {
    name: "hsv adjust",
    dsl: "search synth, filter\n\nperlin(scale: 75, octaves: 2)\n  .adjust(mode: hsv, rotation: 120, hueRange: 40)\n  .write(o0)\nrender(o0)",
    tags: ["filter", "adjust", "hsv", "color"],
    description: "Perlin noise with HSV hue rotation and range adjustment"
  },
  {
    name: "tetra color array",
    dsl: "search synth, filter\n\nnoise()\n  .tetraColorArray(smoothness: 0)\n  .write(o0)\nrender(o0)",
    tags: ["filter", "tetraColorArray", "color", "quantize"],
    description: "Noise quantized to tetrahedral color array"
  },
  {
    name: "tetra cosine",
    dsl: "search synth, filter\n\nnoise()\n  .tetraCosine()\n  .write(o0)\nrender(o0)",
    tags: ["filter", "tetraCosine", "color", "palette"],
    description: "Noise remapped through cosine-based tetrahedral palette"
  },
  {
    name: "cell smoothstep",
    dsl: "search synth, filter\n\ncell()\n  .smoothstep(edge1: 0.51)\n  .write(o0)\nrender(o0)",
    tags: ["filter", "smoothstep", "threshold", "cell"],
    description: "Cell noise with smoothstep threshold for clean contours"
  },
  {
    name: "sharpened pattern",
    dsl: "search synth, filter\n\npattern(type: dots, smoothness: 0.04)\n  .sharpen(amount: 5)\n  .write(o0)\nrender(o0)",
    tags: ["filter", "sharpen", "pattern", "crisp"],
    description: "Dot pattern with heavy sharpening for crisp edges"
  },
  {
    name: "smooth blur",
    dsl: "search synth, filter\n\nmodPattern()\n  .smooth(type: blur, radius: 4)\n  .write(o0)\nrender(o0)",
    tags: ["filter", "smooth", "blur", "modPattern"],
    description: "Mod pattern with smoothing blur applied"
  },
  {
    name: "spooky ticker",
    dsl: "search synth, filter\n\nperlin()\n  .spookyTicker()\n  .write(o0)\nrender(o0)",
    tags: ["filter", "spookyTicker", "text", "overlay"],
    description: "Perlin noise with scrolling spooky ticker text overlay"
  },
  {
    name: "text overlay",
    dsl: "search synth, filter\n\nperlin(scale: 100)\n  .text()\n  .write(o0)\nrender(o0)",
    tags: ["filter", "text", "overlay", "typography"],
    description: "Perlin noise with text overlay"
  },
  {
    name: "hair strands",
    dsl: "search synth, filter\n\nperlin(scale: 100)\n  .strayHair()\n  .write(o0)\nrender(o0)",
    tags: ["filter", "strayHair", "texture", "overlay"],
    description: "Perlin texture with stray hair overlay for analog feel"
  },
  {
    name: "paper texture",
    dsl: "search synth, filter\n\nsolid(color: #d1d1d1)\n  .texture(alpha: 0.75)\n  .write(o0)\nrender(o0)",
    tags: ["filter", "texture", "paper", "material"],
    description: "Light gray with paper texture overlay"
  },
  {
    name: "simple aberration",
    dsl: "search synth, filter\n\nnoise(ridges: true, colorMode: mono)\n  .simpleAberration()\n  .write(o0)\nrender(o0)",
    tags: ["filter", "simpleAberration", "color-split", "analog"],
    description: "Monochrome noise with simple chromatic aberration"
  },
  {
    name: "barrel distort",
    dsl: "search synth, filter\n\nperlin(scale: 40, octaves: 2)\n  .lens(displacement: 0.5)\n  .write(o0)\nrender(o0)",
    tags: ["filter", "lens", "distortion", "barrel"],
    description: "Perlin noise with barrel lens distortion"
  },
  {
    name: "bulge warp",
    dsl: "search synth, filter\n\ncurl(scale: 20)\n  .bulge()\n  .write(o0)\nrender(o0)",
    tags: ["filter", "bulge", "distortion", "warp"],
    description: "Curl noise with center bulge distortion"
  },
  {
    name: "degaussed signal",
    dsl: "search synth, filter\n\nosc2d(freq: 12, speed: 3)\n  .degauss()\n  .write(o0)\nrender(o0)",
    tags: ["filter", "degauss", "analog", "crt"],
    description: "Oscillator signal with degauss magnetic distortion"
  },
  {
    name: "heavy filter chain",
    dsl: "search synth, filter\n\nnoise(ridges: true, octaves: 3)\n  .blur(radiusX: 3)\n  .bloom(taps: 10)\n  .chromaticAberration()\n  .vignette()\n  .grain()\n  .write(o0)\nrender(o0)",
    tags: ["filter", "chain", "post-processing", "cinematic"],
    description: "Noise through a cinematic post-processing chain: blur, bloom, aberration, vignette, grain"
  },
  {
    name: "scrolling noise",
    dsl: "search synth, filter\n\nnoise(ridges: true)\n  .scroll(speedX: 1, speedY: 0.5)\n  .write(o0)\nrender(o0)",
    tags: ["filter", "scroll", "motion", "translate"],
    description: "Ridged noise with continuous scrolling motion"
  },
  {
    name: "skewed curl",
    dsl: "search synth, filter\n\ncurl(scale: 15, octaves: 2)\n  .skew(wrap: repeat)\n  .write(o0)\nrender(o0)",
    tags: ["filter", "skew", "distortion", "curl"],
    description: "Curl noise with perspective skew transformation"
  },
  {
    name: "cinematic grade",
    dsl: "search synth, filter\n\nnoise(ridges: true, octaves: 3)\n  .grade(preset: cinematic)\n  .write(o0)\nrender(o0)",
    tags: ["filter", "grade", "lut", "cinematic", "color-grading"],
    description: "Noise with cinematic LUT color grading applied"
  },
  {
    name: "noir grade",
    dsl: "search synth, filter\n\nperlin(scale: 40, octaves: 2, ridges: true)\n  .grade(preset: noir)\n  .vignette()\n  .write(o0)\nrender(o0)",
    tags: ["filter", "grade", "noir", "lut", "moody"],
    description: "Perlin noise with noir LUT grading and vignette"
  },
  {
    name: "retro dither",
    dsl: "search synth, filter\n\nnoise(ridges: true)\n  .dither(type: bayer4x4, palette: commodore64)\n  .write(o0)\nrender(o0)",
    tags: ["filter", "dither", "retro", "commodore64", "pixel-art"],
    description: "Noise dithered with Bayer matrix into Commodore 64 palette"
  },
  {
    name: "pico8 dither",
    dsl: "search synth, filter\n\ncell(scale: 60)\n  .dither(type: bayer8x8, palette: pico8, matrixScale: 3)\n  .write(o0)\nrender(o0)",
    tags: ["filter", "dither", "retro", "pico8"],
    description: "Cell noise dithered into PICO-8 palette for retro game look"
  },
  {
    name: "cel shaded",
    dsl: "search synth, filter\n\nperlin(scale: 40, octaves: 2)\n  .celShading(levels: 4, edgeWidth: 2, edgeThreshold: 0.15)\n  .write(o0)\nrender(o0)",
    tags: ["filter", "celShading", "cartoon", "toon", "edge"],
    description: "Perlin noise with cel-shading: quantized levels and edge outlines"
  },
  {
    name: "data corruption",
    dsl: "search synth, filter\n\nnoise(ridges: true)\n  .corrupt(intensity: 60, bandHeight: 15, sort: 40, channelShift: 30)\n  .write(o0)\nrender(o0)",
    tags: ["filter", "corrupt", "glitch", "databend"],
    description: "Noise with data corruption glitch: banding, sorting, channel shift"
  },
  {
    name: "crt monitor",
    dsl: "search synth, filter\n\nosc2d(freq: 6, speed: 2)\n  .crt(speed: 1)\n  .write(o0)\nrender(o0)",
    tags: ["filter", "crt", "retro", "monitor", "scanlines"],
    description: "Oscillator output through CRT monitor simulation"
  },
  {
    name: "octave warp",
    dsl: "search synth, filter\n\nnoise(ridges: true, octaves: 2)\n  .octaveWarp(freq: 3, octaves: 4, displacement: 0.3)\n  .write(o0)\nrender(o0)",
    tags: ["filter", "octaveWarp", "domain-warping", "organic"],
    description: "Noise domain-warped through multi-octave displacement"
  },
  {
    name: "tiled noise",
    dsl: "search synth, filter\n\nnoise(ridges: true)\n  .tile(symmetry: rotate4, scale: 0.5, repeat: 3)\n  .write(o0)\nrender(o0)",
    tags: ["filter", "tile", "symmetry", "repeat", "pattern"],
    description: "Noise tiled with 4-fold rotational symmetry"
  },
  {
    name: "seamless tile",
    dsl: "search synth, filter\n\nperlin(scale: 30, octaves: 3)\n  .seamless(blend: 0.2, repeat: 2)\n  .write(o0)\nrender(o0)",
    tags: ["filter", "seamless", "tiling", "repeatable"],
    description: "Perlin noise made seamlessly tileable"
  },
  {
    name: "repeated grid",
    dsl: "search synth, filter\n\npolygon(sides: 5, radius: 0.3, bgAlpha: 0)\n  .repeat(x: 4, y: 4)\n  .write(o0)\nrender(o0)",
    tags: ["filter", "repeat", "grid", "polygon"],
    description: "Pentagon polygon repeated in a 4x4 grid"
  },
  {
    name: "polar vortex",
    dsl: "search synth, filter\n\nnoise(ridges: true, octaves: 2)\n  .polar(mode: vortex, scale: 1.5, speed: 1)\n  .write(o0)\nrender(o0)",
    tags: ["filter", "polar", "vortex", "distortion"],
    description: "Noise transformed through spinning polar vortex"
  },
  {
    name: "pixel mosaic",
    dsl: "search synth, filter\n\nnoise(ridges: true, octaves: 3)\n  .pixels(size: 16)\n  .write(o0)\nrender(o0)",
    tags: ["filter", "pixels", "mosaic", "pixelate"],
    description: "Noise pixelated into 16px mosaic blocks"
  },
  {
    name: "edge detection",
    dsl: "search synth, filter\n\ncell(scale: 50)\n  .edge(kernel: bold, amount: 200, invert: on)\n  .write(o0)\nrender(o0)",
    tags: ["filter", "edge", "detection", "outline"],
    description: "Cell noise with bold inverted edge detection"
  },
  {
    name: "posterized steps",
    dsl: "search synth, filter\n\nperlin(scale: 50, octaves: 3)\n  .posterize(levels: 6)\n  .write(o0)\nrender(o0)",
    tags: ["filter", "posterize", "quantize", "levels"],
    description: "Perlin noise posterized to 6 discrete levels"
  },
  {
    name: "feedback self-refract",
    dsl: "search synth, filter\n\nnoise(ridges: true)\n  .feedback(blendMode: overlay, mix: 50, refractAAmt: 30, aberration: 20)\n  .write(o0)\nrender(o0)",
    tags: ["filter", "feedback", "self-refract", "chromatic"],
    description: "Noise with overlay feedback, self-refraction and aberration"
  },
  {
    name: "warp distortion",
    dsl: "search synth, filter\n\ncell(scale: 40, cellSmooth: 50)\n  .warp(strength: 60, scale: 2)\n  .write(o0)\nrender(o0)",
    tags: ["filter", "warp", "distortion", "organic"],
    description: "Cell noise warped with noise-based distortion"
  },
  {
    name: "pixel sort glitch",
    dsl: "search synth, filter\n\nnoise(ridges: true, octaves: 2)\n  .pixelSort()\n  .write(o0)\nrender(o0)",
    tags: ["filter", "pixelSort", "glitch", "sort"],
    description: "Noise with pixel sorting glitch effect"
  },
  {
    name: "ukiyo-e palette",
    dsl: "search synth, filter\n\nperlin(scale: 30, octaves: 2, colorMode: mono)\n  .historicPalette(index: ukiyoe)\n  .write(o0)\nrender(o0)",
    tags: ["filter", "historicPalette", "ukiyoe", "japanese"],
    description: "Perlin noise through ukiyo-e woodblock print palette"
  },
  {
    name: "pop art palette",
    dsl: "search synth, filter\n\nnoise(ridges: true, colorMode: mono)\n  .historicPalette(index: popArt, repeat: 2)\n  .write(o0)\nrender(o0)",
    tags: ["filter", "historicPalette", "popArt", "bold"],
    description: "Ridged noise through pop art palette with double repeat"
  },
  {
    name: "cosine palette remap",
    dsl: "search synth, filter\n\nnoise(ridges: true, colorMode: mono)\n  .palette(index: brushedMetal)\n  .write(o0)\nrender(o0)",
    tags: ["filter", "palette", "cosine", "color-remap"],
    description: "Monochrome noise remapped through brushedMetal cosine palette"
  },
  {
    name: "embossed noise",
    dsl: "search synth, filter\n\nnoise(ridges: true, octaves: 3)\n  .emboss()\n  .write(o0)\nrender(o0)",
    tags: ["filter", "emboss", "relief", "3d-look"],
    description: "Noise with emboss filter for raised relief appearance"
  },
  {
    name: "sobel outlines",
    dsl: "search synth, filter\n\ncell(scale: 50)\n  .sobel()\n  .write(o0)\nrender(o0)",
    tags: ["filter", "sobel", "edge", "outline"],
    description: "Cell noise with Sobel edge detection for clean outlines"
  },
  {
    name: "grainy film",
    dsl: "search synth, filter\n\nperlin(scale: 40, octaves: 2)\n  .grade(preset: warmFilm)\n  .grain(alpha: 0.3)\n  .write(o0)\nrender(o0)",
    tags: ["filter", "grain", "film", "grade", "analog"],
    description: "Perlin with warm film grading and grain for analog feel"
  },
  // ── Mixer Programs ────────────────────────────────────────────────────
  {
    name: "blend multiply",
    dsl: "search synth, mixer\n\nnoise(ridges: true, colorMode: mono)\n  .write(o0)\n\nperlin()\n  .blendMode(tex: read(o0), mode: phoenix)\n  .write(o1)\nrender(o1)",
    tags: ["mixer", "blendMode", "phoenix", "two-source"],
    description: "Perlin blended with monochrome noise using phoenix blend mode"
  },
  {
    name: "apply brightness",
    dsl: "search synth, mixer\n\nnoise(seed: 1, ridges: true)\n  .write(o0)\n\nperlin()\n  .applyMode(tex: read(o0))\n  .write(o1)\nrender(o1)",
    tags: ["mixer", "applyMode", "brightness", "two-source"],
    description: "Apply brightness from ridged noise onto perlin noise"
  },
  {
    name: "alpha masked polygon",
    dsl: "search synth, mixer\n\npolygon(smooth: 0, bgAlpha: 0)\n  .write(o0)\n\nnoise(xScale: 100, yScale: 100)\n  .alphaMask(tex: read(o0))\n  .write(o1)\nrender(o1)",
    tags: ["mixer", "alphaMask", "polygon", "masking"],
    description: "Noise masked by polygon alpha channel for shaped cutout"
  },
  {
    name: "center vignette blend",
    dsl: "search synth, mixer\n\nnoise(ridges: true, colorMode: mono)\n  .write(o0)\n\nnoise(ridges: true)\n  .centerMask(tex: read(o0), mix: -75)\n  .write(o1)\nrender(o1)",
    tags: ["mixer", "centerMask", "vignette", "blend"],
    description: "Color noise centered with monochrome noise at edges via distance mask"
  },
  {
    name: "cell split noise",
    dsl: "search synth, mixer\n\nsolid(color: #000000)\n  .write(o0)\n\nnoise()\n  .cellSplit(tex: read(o0), invert: sourceB)\n  .write(o1)\nrender(o1)",
    tags: ["mixer", "cellSplit", "voronoi", "masking"],
    description: "Noise split into voronoi cell regions against black"
  },
  {
    name: "distortion refract",
    dsl: "search synth, mixer\n\ncell()\n  .write(o0)\n\nnoise(ridges: true)\n  .distortion(tex: read(o0))\n  .write(o1)\nrender(o1)",
    tags: ["mixer", "distortion", "refract", "displacement"],
    description: "Noise refracted through cell noise displacement map"
  },
  {
    name: "pattern stripe mix",
    dsl: "search synth, mixer\n\nnoise(ridges: true, colorMode: mono)\n  .write(o0)\n\nnoise(ridges: true)\n  .patternMix(tex: read(o0))\n  .write(o1)\nrender(o1)",
    tags: ["mixer", "patternMix", "stripes", "geometric-blend"],
    description: "Two noise sources mixed through geometric stripe pattern"
  },
  {
    name: "drop shadow",
    dsl: "search synth, mixer\n\nnoise(xScale: 100, yScale: 100)\n  .write(o0)\n\nnoise(ridges: true, colorMode: mono)\n  .shadow(tex: read(o0))\n  .write(o1)\nrender(o1)",
    tags: ["mixer", "shadow", "drop-shadow", "compositing"],
    description: "Monochrome noise casting shadow onto colored noise background"
  },
  {
    name: "shape masked noise",
    dsl: "search synth, mixer\n\nnoise(ridges: true, colorMode: mono)\n  .write(o0)\n\nnoise(ridges: true)\n  .shapeMask(tex: read(o0))\n  .write(o1)\nrender(o1)",
    tags: ["mixer", "shapeMask", "circle", "masking"],
    description: "Noise composited inside and outside a circular shape mask"
  },
  {
    name: "soft split wipe",
    dsl: "search synth, mixer\n\nnoise(ridges: true, colorMode: mono)\n  .write(o0)\n\nnoise(seed: 2, ridges: true)\n  .split(tex: read(o0), softness: 1)\n  .write(o1)\nrender(o1)",
    tags: ["mixer", "split", "wipe", "transition"],
    description: "Soft split wipe between two noise sources"
  },
  {
    name: "threshold mask",
    dsl: "search synth, mixer\n\nnoise()\n  .write(o0)\n\nsolid(color: #000000)\n  .thresholdMix(tex: read(o0))\n  .write(o1)\nrender(o1)",
    tags: ["mixer", "thresholdMix", "threshold", "masking"],
    description: "Noise thresholded against solid black for binary mask effect"
  },
  {
    name: "uv remap",
    dsl: "search synth, mixer\n\npattern()\n  .write(o0)\n\nnoise(ridges: true)\n  .uvRemap(tex: read(o0), scale: 25)\n  .write(o1)\nrender(o1)",
    tags: ["mixer", "uvRemap", "displacement", "distortion"],
    description: "Noise UV coordinates remapped using pattern color channels"
  },
  // ── Points / Particle Systems ─────────────────────────────────────────
  {
    name: "basic flow field",
    dsl: "search points, synth, render\n\nnoise(ridges: true)\n  .pointsEmit(stateSize: x256)\n  .flow(behavior: obedient, stride: 10)\n  .pointsRender(density: 50, intensity: 75)\n  .write(o0)\nrender(o0)",
    tags: ["points", "flow", "field", "agents"],
    description: "Agent-based flow field following noise luminosity gradients"
  },
  {
    name: "crosshatch flow",
    dsl: "search points, synth, render\n\nperlin(scale: 50, octaves: 2)\n  .pointsEmit(stateSize: x512)\n  .flow(behavior: crosshatch, stride: 15)\n  .pointsRender(density: 60, intensity: 80)\n  .write(o0)\nrender(o0)",
    tags: ["points", "flow", "crosshatch", "drawing"],
    description: "Crosshatch drawing style flow field from perlin noise"
  },
  {
    name: "physical particles",
    dsl: "search points, synth, render\n\nnoise(ridges: true)\n  .pointsEmit(stateSize: x256)\n  .physical(gravity: 0.05, energy: 0.5, drag: 0.15)\n  .pointsRender(density: 50)\n  .write(o0)\nrender(o0)",
    tags: ["points", "physical", "gravity", "particles"],
    description: "Physics-based particles with gravity and drag"
  },
  {
    name: "zero-g particles",
    dsl: "search points, synth, render\n\nnoise(ridges: true)\n  .pointsEmit(stateSize: x512, attrition: 2)\n  .physical(gravity: 0, energy: 0.98, drag: 0.05, wander: 0.5)\n  .pointsRender(density: 80, intensity: 90)\n  .write(o0)\nrender(o0)",
    tags: ["points", "physical", "zero-gravity", "drift"],
    description: "Drifting zero-gravity particles with high energy and wandering"
  },
  {
    name: "flocking boids",
    dsl: "search points, synth, render\n\ncell()\n  .pointsEmit(stateSize: x256)\n  .flock(separation: 2, alignment: 1, cohesion: 1)\n  .pointsRender(density: 40)\n  .write(o0)\nrender(o0)",
    tags: ["points", "flock", "boids", "swarm"],
    description: "Boids flocking simulation with cell noise input"
  },
  {
    name: "lorenz attractor",
    dsl: "search points, synth, render\n\nnoise()\n  .pointsEmit(stateSize: x1024)\n  .attractor(attractor: lorenz, speed: 0.5)\n  .pointsRender(viewMode: ortho, density: 80, intensity: 95)\n  .write(o0)\nrender(o0)",
    tags: ["points", "attractor", "lorenz", "chaos", "3d-view"],
    description: "Lorenz strange attractor with 3D orthographic view"
  },
  {
    name: "physarum slime",
    dsl: "search points, synth, render\n\nnoise()\n  .pointsEmit(stateSize: x512)\n  .physarum(moveSpeed: 1.5, turnSpeed: 1, deposit: 0.5, decay: 0.1)\n  .pointsRender(density: 60, intensity: 85)\n  .write(o0)\nrender(o0)",
    tags: ["points", "physarum", "slime-mold", "simulation"],
    description: "Physarum slime mold agent simulation with trail deposits"
  },
  {
    name: "particle life",
    dsl: "search points, synth, render\n\nnoise()\n  .pointsEmit(stateSize: x512)\n  .life(typeCount: 6, attractionScale: 1, friction: 0.1)\n  .pointsRender(density: 50)\n  .write(o0)\nrender(o0)",
    tags: ["points", "life", "attraction", "emergent"],
    description: "Particle life with 6 types attracting and repelling each other"
  },
  {
    name: "dla crystal growth",
    dsl: "search points, synth, render\n\nnoise()\n  .pointsEmit(stateSize: x256)\n  .dla(stride: 15, deposit: 10, decay: 0.25)\n  .pointsRender(density: 50, intensity: 90)\n  .write(o0)\nrender(o0)",
    tags: ["points", "dla", "crystal", "aggregation"],
    description: "Diffusion-limited aggregation for crystal-like growth patterns"
  },
  {
    name: "hydraulic erosion",
    dsl: "search points, synth, render\n\nperlin(scale: 30, octaves: 3)\n  .pointsEmit(stateSize: x512)\n  .hydraulic(stride: 10)\n  .pointsRender(density: 60, intensity: 85)\n  .write(o0)\nrender(o0)",
    tags: ["points", "hydraulic", "erosion", "terrain"],
    description: "Hydraulic erosion flow on perlin terrain heightmap"
  },
  {
    name: "lenia artificial life",
    dsl: "search points, synth, render\n\nnoise()\n  .pointsEmit(stateSize: x512)\n  .lenia(muK: 25, sigmaK: 5, muG: 0.25, sigmaG: 0.15)\n  .pointsRender(density: 60, intensity: 85)\n  .write(o0)\nrender(o0)",
    tags: ["points", "lenia", "artificial-life", "continuous-ca"],
    description: "Particle Lenia continuous artificial life simulation"
  },
  {
    name: "billboard sprites",
    dsl: "search points, synth, render\n\npolygon(radius: 0.7, fgAlpha: 0.1, bgAlpha: 0)\n  .write(o0)\n\nnoise(ridges: true)\n  .pointsEmit(stateSize: x64)\n  .physical(gravity: 0, energy: 0.98, drag: 0.125)\n  .pointsBillboardRender(tex: read(o0), shapeMode: texture, pointSize: 40, sizeVariation: 50)\n  .write(o1)\nrender(o1)",
    tags: ["points", "billboard", "sprites", "textured-particles"],
    description: "Textured billboard particles using polygon as sprite source"
  },
  {
    name: "star particles",
    dsl: "search points, synth, render\n\nnoise(ridges: true)\n  .pointsEmit(stateSize: x256, layout: ring)\n  .physical(gravity: 0, energy: 0.9, wander: 0.5)\n  .pointsBillboardRender(shapeMode: star, pointSize: 12, sizeVariation: 80)\n  .write(o0)\nrender(o0)",
    tags: ["points", "billboard", "star", "ring-layout"],
    description: "Star-shaped billboard particles emitted in a ring layout"
  },
  // ── Feedback Loops ────────────────────────────────────────────────────
  {
    name: "warp feedback",
    dsl: "search synth, filter, render\n\nnoise(ridges: true)\n  .loopBegin(alpha: 95, intensity: 95)\n  .warp()\n  .loopEnd()\n  .write(o0)\nrender(o0)",
    tags: ["feedback", "loop", "warp", "accumulator"],
    description: "Classic warp feedback loop \u2014 noise warps its own previous frame"
  },
  {
    name: "blur feedback",
    dsl: "search synth, filter, render\n\ncurl(scale: 20, ridges: true)\n  .loopBegin(alpha: 90, intensity: 90)\n  .blur(radiusX: 2)\n  .warp()\n  .loopEnd()\n  .write(o0)\nrender(o0)",
    tags: ["feedback", "loop", "blur", "warp", "dreamy"],
    description: "Curl noise with blur and warp feedback for dreamy smearing effect"
  },
  {
    name: "edge feedback",
    dsl: "search synth, filter, render\n\nperlin(scale: 40, octaves: 2)\n  .loopBegin(alpha: 92, intensity: 88)\n  .edge()\n  .bloom(taps: 8)\n  .loopEnd()\n  .write(o0)\nrender(o0)",
    tags: ["feedback", "loop", "edge", "bloom", "glow"],
    description: "Perlin noise with edge detection and bloom in feedback loop"
  },
  // ── 3D Volumetric ─────────────────────────────────────────────────────
  {
    name: "3d noise volume",
    dsl: "search synth3d, filter3d, render\n\nnoise3d(volumeSize: x64, octaves: 2, ridges: true)\n  .render3d()\n  .write(o0)\nrender(o0)",
    tags: ["3d", "noise3d", "volume", "raymarching"],
    description: "3D ridged noise volume rendered with raymarching"
  },
  {
    name: "3d lit noise",
    dsl: "search synth3d, filter3d, render\n\nnoise3d()\n  .renderLit3d(specularIntensity: 2, shininess: 256)\n  .write(o0)\nrender(o0)",
    tags: ["3d", "noise3d", "lit", "phong"],
    description: "3D noise volume with specular Phong lighting"
  },
  {
    name: "3d fractal",
    dsl: "search synth3d, filter3d, render\n\nfractal3d(volumeSize: x64, type: mandelbulb, power: 8, iterations: 10)\n  .render3d()\n  .write(o0)\nrender(o0)",
    tags: ["3d", "fractal3d", "mandelbulb", "fractal"],
    description: "3D Mandelbulb fractal volume raymarched at 64^3 resolution"
  },
  {
    name: "3d flythrough",
    dsl: "search synth3d, filter3d, render\n\nflythrough3d(type: mandelbulb, power: 8, speed: 0.2)\n  .render3d()\n  .write(o0)\nrender(o0)",
    tags: ["3d", "flythrough3d", "mandelbulb", "camera"],
    description: "Mandelbulb fractal flythrough with camera-relative volume"
  },
  {
    name: "3d cell noise",
    dsl: "search synth3d, filter3d, render\n\ncell3d(volumeSize: x64, metric: sphere, scale: 10, colorMode: rgb)\n  .render3d()\n  .write(o0)\nrender(o0)",
    tags: ["3d", "cell3d", "voronoi", "volume"],
    description: "3D voronoi cell noise volume in RGB color mode"
  },
  {
    name: "3d shape morph",
    dsl: "search synth3d, filter3d, render\n\nshape3d(loopAOffset: dodecahedron, loopBOffset: sphere, speedA: -2, speedB: 2)\n  .render3d(threshold: 0.75)\n  .write(o0)\nrender(o0)",
    tags: ["3d", "shape3d", "morph", "polyhedra"],
    description: "3D shape morph between dodecahedron and sphere"
  },
  {
    name: "3d cellular automata",
    dsl: "search synth3d, filter3d, render\n\nca3d(ruleIndex: diamoeba, volumeSize: x32)\n  .render3d()\n  .write(o0)\nrender(o0)",
    tags: ["3d", "ca3d", "cellular-automata", "simulation"],
    description: "3D diamoeba cellular automaton rendered as volume"
  },
  {
    name: "3d reaction diffusion",
    dsl: "search synth3d, filter3d, render\n\nrd3d(volumeSize: x32, iterations: 16, colorMode: gradient)\n  .render3d()\n  .write(o0)\nrender(o0)",
    tags: ["3d", "rd3d", "reaction-diffusion", "simulation"],
    description: "3D reaction-diffusion with gradient coloring"
  },
  {
    name: "3d flow field",
    dsl: "search synth3d, filter3d, render\n\nnoise3d(volumeSize: x32)\n  .flow3d(behavior: obedient, stride: 1, density: 20)\n  .render3d()\n  .write(o0)\nrender(o0)",
    tags: ["3d", "flow3d", "filter3d", "agents"],
    description: "3D agent-based flow field inside a noise volume"
  },
  // ── Combined / Multi-Chain (Modern Namespace) ─────────────────────────
  {
    name: "noise + filter + mixer",
    dsl: "search synth, filter, mixer\n\nnoise(ridges: true, octaves: 3)\n  .bloom(taps: 10)\n  .write(o0)\n\nperlin(scale: 40, octaves: 2)\n  .blendMode(tex: read(o0), mode: screen)\n  .vignette()\n  .write(o1)\nrender(o1)",
    tags: ["combined", "mixer", "filter", "blendMode", "screen"],
    description: "Bloomed noise and perlin screen-blended with vignette"
  },
  {
    name: "flow on cell noise",
    dsl: "search points, synth, render\n\ncell(scale: 60, cellSmooth: 20)\n  .pointsEmit(stateSize: x512)\n  .flow(behavior: meandering, stride: 12)\n  .pointsRender(density: 70, intensity: 85)\n  .write(o0)\nrender(o0)",
    tags: ["combined", "points", "flow", "cell", "meandering"],
    description: "Meandering flow agents tracing cell noise gradients"
  },
  {
    name: "feedback into mixer",
    dsl: "search synth, filter, mixer, render\n\nnoise(ridges: true)\n  .loopBegin(alpha: 90, intensity: 90)\n  .warp()\n  .loopEnd()\n  .write(o0)\n\nperlin(scale: 30)\n  .blendMode(tex: read(o0), mode: overlay)\n  .write(o1)\nrender(o1)",
    tags: ["combined", "feedback", "mixer", "overlay"],
    description: "Warp feedback loop blended with perlin via overlay"
  },
  {
    name: "distorted shapes",
    dsl: "search synth, mixer\n\nshape(loopAOffset: icosahedron, loopBOffset: torus, wrap: true)\n  .write(o0)\n\nnoise(ridges: true)\n  .distortion(tex: read(o0), mode: refract, intensity: 70)\n  .write(o1)\nrender(o1)",
    tags: ["combined", "mixer", "distortion", "shape", "refract"],
    description: "Noise refracted through shape morph displacement"
  },
  {
    name: "lit 3d with bloom",
    dsl: "search synth3d, filter3d, filter, render\n\nnoise3d(octaves: 2, ridges: true)\n  .renderLit3d(specularIntensity: 1.5, shininess: 128)\n  .bloom(taps: 12)\n  .vignette()\n  .write(o0)\nrender(o0)",
    tags: ["combined", "3d", "lighting", "bloom", "post-processing"],
    description: "3D lit noise volume with bloom and vignette post-processing"
  }
];
function searchExemplars(query, maxResults = 5) {
  const tokens = query.toLowerCase().split(/[\s,]+/).filter((t) => t.length > 1);
  if (tokens.length === 0) return DSL_EXEMPLAR_PROGRAMS.slice(0, maxResults);
  const scored = DSL_EXEMPLAR_PROGRAMS.map((program) => {
    const searchText = [
      program.name,
      ...program.tags,
      program.description
    ].join(" ").toLowerCase();
    let score = 0;
    for (const token of tokens) {
      if (program.tags.some((tag) => tag === token)) {
        score += 3;
      }
      if (program.name.toLowerCase().includes(token)) {
        score += 2;
      }
      if (searchText.includes(token)) {
        score += 1;
      }
    }
    return { program, score };
  });
  return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, maxResults).map((s) => s.program);
}

// src/knowledge/state-bundles.ts
var RESEARCH_KNOWLEDGE = `
## RESEARCH PHASE EXPERTISE
You are finding templates and understanding what effects can do.

**USE search_shader_knowledge** when you need to understand DSL syntax, effect patterns, or GLSL techniques.
Query: "how to structure a filter effect", "noise function patterns", etc.

${EFFECT_CATALOG}

${COMPACT_SHADER_KNOWLEDGE}
`;
var PLAN_KNOWLEDGE = `
## PLAN PHASE EXPERTISE
You create the effect specification. You are an expert in DSL and Effect Definition format.
You do NOT write GLSL shader code - you prescribe what the GENERATE phase should implement.

${DSL_CRITICAL_RULES}

${DSL_SCAFFOLDING_PATTERNS}

${DSL_REFERENCE}

${EFFECT_DEFINITION_REFERENCE}

${EFFECT_DEFINITION_DEEP}

### Your Output: Effect Specification JSON
{
  "effectName": "camelCaseName",
  "namespace": "synth|filter|points|render|mixer",
  "templateEffectId": "namespace/effectName or null",
  "definitionSpec": {
    "globals": { /* uniform definitions */ }
  },
  "shaderDirectives": {
    "technique": "noise|fractal|voronoi|geometric|flow",
    "colorStrategy": "palette|hsv-rotation|grayscale",
    "animationApproach": "What moves and how",
    "uniformUsage": { "uniformName": "How to use in shader" }
  },
  "dslProgram": "search namespace\\neffectName().write(o0)\\nrender(o0)"
}
`;
var GENERATE_KNOWLEDGE = `
## GENERATE PHASE EXPERTISE
You implement the shader code. You are an expert in GLSL and uniform wiring.
You follow the specification from the PLAN phase exactly.

${GLSL_REFERENCE}

${GLSL_RECIPES}

${REQUIRED_PATTERNS}

### Uniform Wiring Rules
1. Every uniform in definition.js MUST be declared in GLSL
2. Types must match: float\u2192float, int\u2192int, boolean\u2192bool, vec2\u2192vec2, vec3\u2192vec3, vec4\u2192vec4
3. Standard uniforms (always available): time, resolution
4. For filters: uniform sampler2D inputTex;

## \u{1F6D1}\u{1F6D1}\u{1F6D1} NOISE LOOPING - READ BEFORE CODING \u{1F6D1}\u{1F6D1}\u{1F6D1}

**For animated noise, ALWAYS use the timeCircle pattern.**

### ANIMATED NOISE PATTERN (use this exactly):
\`\`\`glsl
float t = time * TAU;
vec2 timeCircle = vec2(cos(t), sin(t));
float n = noise(uv * scale + timeCircle * 0.5);
\`\`\`

This is the only pattern for animated noise. There are no alternatives.

###  SEAMLESS LOOPING - HARD REQUIREMENTS

**Time is 1-periodic on [0,1]. The loop must be INVISIBLE - no pop, no stutter, no hard reset.**

**THE DERIVATIVE RULE (WHY LOOPS FAIL):**
Matching value(0) == value(1) is NOT ENOUGH! The **velocity/derivative** must ALSO match:
- value(0) == value(1)  \u2190 position matches
- value'(0) == value'(1) \u2190 velocity matches (smooth motion through boundary)

If velocity doesn't match, you get a "hard reset" feel at t\u22480.999 even though values match.
This is why fract(), mod(), smoothstep(), and linear time ALL fail - they have derivative discontinuities.

**THE BLEUJE PATTERN (Approved Looping Method):**
Use a periodic function + offset. The mental model: "everything uses the same loopable time basis, each element varies via an offset."

\`\`\`glsl
// Core looping helpers - COPY THESE EXACTLY
const float TAU = 6.28318530717958647692;

float normalizedSine(float x) {
    return 0.5 + 0.5 * sin(x);
}

// The Bleuje periodic value pattern: normalized_sine((time - offset) * TAU)
float periodicValue(float time, float offset) {
    return normalizedSine((time - offset) * TAU);
}
\`\`\`

**HARD REQUIREMENTS - VERIFY BEFORE SHIPPING:**

1. **SEAM EQUALITY + DERIVATIVE CONTINUITY**
   - value(0) == value(1) AND value'(0) == value'(1)
   - sin() and cos() satisfy BOTH conditions

2. **ROTATION**: \`angle = float(N) * TAU * time\` where N is integer (1, 2, 3...)

3. **TRANSLATION**: Use circular or oscillating motion
   - Circular: \`pos = start + radius * vec2(cos(TAU * time), sin(TAU * time))\`
   - Oscillation: \`pos = start + dir * (amplitude * sin(TAU * time))\`

4. **NOISE**: Use timeCircle pattern
   - \`vec2 tc = vec2(cos(TAU*time), sin(TAU*time)); noise(uv + tc*0.5);\`

**APPROVED HELPER FUNCTIONS (copy exactly):**
\`\`\`glsl
// Rotation: N MUST be integer
float loopedAngle(float time, float offsetTurns, int rotationsN, float angle0) {
    return angle0 + TAU * (offsetTurns + float(rotationsN) * time);
}

// Translation on circle: cyclesN MUST be integer
vec2 loopedTranslateCircle(vec2 start, float time, float radius, float offsetTurns, int cyclesN) {
    float phase = offsetTurns + float(cyclesN) * time;
    return start + radius * vec2(cos(TAU * phase), sin(TAU * phase));
}

// Linear-looking motion that loops (sine oscillation): cyclesN MUST be integer
vec2 loopedTranslateLine(vec2 start, vec2 dirUnit, float time, float amplitude, float offsetTurns, int cyclesN) {
    float phase = offsetTurns + float(cyclesN) * time;
    float d = sin(TAU * phase);  // smooth, returns to 0 at t=0 and t=1
    return start + dirUnit * (amplitude * d);
}

// Looping noise via time-circle (4D simplex)
float loopedNoise4D(vec2 p, float time, float spatialScale, float offsetTurns, float speedTurns) {
    float phase = (time * speedTurns) + offsetTurns;
    vec2 tc = vec2(cos(TAU * phase), sin(TAU * phase));
    return simplexNoise4D(vec4(p * spatialScale, tc));
}

// Stable hash for seeded offsets
uint hash_u32(uint x) {
    x ^= x >> 16u; x *= 0x7FEB352Du;
    x ^= x >> 15u; x *= 0x846CA68Bu;
    x ^= x >> 16u; return x;
}
float hash01(uint x) { return float(hash_u32(x) & 0x00FFFFFFu) / float(0x01000000u); }

// Looped scalar with noise-driven offset (full Bleuje pattern)
float loopedScalar(float time, float speed, uint baseSeed, float valueNoise) {
    uint timeSeed = baseSeed + 0x9E3779B1u;
    float timeNoise = hash01(timeSeed);
    float scaledTime = periodicValue(time, timeNoise) * speed;
    return periodicValue(scaledTime, valueNoise);
}
\`\`\`

**Animation primitives (use these for all animation):**
\`\`\`glsl
float t = time * TAU;
float pulse = 0.5 + 0.5 * sin(t);        // Smooth 0\u21921\u21920
float wave = sin(t);                      // Smooth -1\u21921\u2192-1
float angle = t * 2.0;                    // 2 full rotations
vec2 timeCircle = vec2(cos(t), sin(t));  // For noise animation
float n = noise(uv * scale + timeCircle * 0.5);  // Animated noise
\`\`\`

##  WILL IT LOOP - MANDATORY VERIFICATION

**Treat time as 1-periodic on [0,1]: t=1 must be IDENTICAL to t=0**
**All time-driven values must be continuous across the boundary with no visible "pop" at the seam.**

### Core Principle: Periodic Function + Offset
The approved mental model (from \xC9tienne Jacob aka Bleuje):
- "A periodic function plus an offset/delay, where everything uses the same loopable time basis and each element varies via an offset."

### Hard Requirements (VERIFY ALL BEFORE SHIPPING):

1. **SEAM EQUALITY + DERIVATIVE CONTINUITY**
   - For EVERY animated scalar/vector: value(0) == value(1)
   - The seam must be smooth: use periodic functions (sin/cos families)
   - Use sin() or cos() for all time-based animation

2. **ROTATION = INTEGER TURNS**
   - Canonical form: \`angle(t) = angle0 + (offset * TAU) + (N * TAU * time)\`
   - N MUST be an INTEGER (1, 2, 3). Complete turns only.

3. **TRANSLATION = CLOSED LOOP**
   - Must return to EXACT starting point at t=1
   - Circle path: \`pos = start + radius * vec2(cos(TAU * phase), sin(TAU * phase))\`
   - Oscillation: \`pos = start + dir * (amplitude * sin(TAU * phase))\`

4. **NOISE = CIRCLE-SAMPLED (Bleuje Tutorial 3)**
   - Map time to a circle, sample noise at that point:
   \`\`\`glsl
   vec2 tc = vec2(cos(TAU * time), sin(TAU * time));
   float n = noise4D(vec4(uv * scale, tc));
   \`\`\`
   - For spatially-varying looping noise, use 4D noise (2 dims for time-circle, 2 for space)

### PRE-SHIP CHECKLIST (MANDATORY):
- [ ] Is ALL time-based animation using sin(), cos(), or periodicValue()?
- [ ] Are ALL cycle/rotation counts INTEGERS? (1, 2, 3)
- [ ] Is noise sampled on a time-circle?
- [ ] Does the derivative (velocity) also loop? (sin/cos guarantee this)
- [ ] Have you verified value(0) == value(1) for EVERY animated channel?
`;
var VALIDATE_KNOWLEDGE = `
## VALIDATE PHASE EXPERTISE
You verify the effect package is complete and correct.

### Validation Checklist
1. All uniforms in definition.js are declared in GLSL
2. All uniforms in GLSL exist in definition.js globals
3. DSL program uses correct scaffolding pattern for effect type
4. Animation uses sin(time*TAU) or cos(time*TAU), never raw time
5. Filter effects chain from a generator
6. Mixer effects have tex: read(surface) parameter
`;
var FIX_KNOWLEDGE = `
## FIX PHASE EXPERTISE
You diagnose and fix specific issues. Focus on the problem, don't rebuild from scratch.

### CRITICAL: "Unknown effect" Error

If you see "Unknown effect: '<name>'" in compile_dsl error:

1. **Did create_effect succeed?** Check the previous tool result.
2. **Is the DSL using 'search user'?** Your effect is in USER namespace!
3. **Is the name EXACT?** Case-sensitive, character-for-character match.

FIX: Ensure your DSL looks like:
\`\`\`
search user
yourEffectName().write(o0)
render(o0)
\`\`\`

### Common Issues and Fixes
- **Unknown effect**: Check DSL has "search user" and name matches create_effect
- isMonochrome: Add color with mix(color1, color2, value) or HSV rotation
- isStatic: Add animation with sin(time * TAU) or cos(time * TAU)
- uniformMismatch: Ensure GLSL declares all definition.js uniforms
- compilationError: Fix GLSL syntax errors

${REQUIRED_PATTERNS}

### Fix Guidelines
- Modify ONLY what's broken
- Don't restructure working code
- Test after each fix with validate_effect
`;
var DSL_RESEARCH_KNOWLEDGE = `
## DSL RESEARCH PHASE
You are finding effects and example programs to compose a DSL program.

${EFFECT_CATALOG}

${DSL_REFERENCE}
`;
var DSL_PLAN_KNOWLEDGE = `
## DSL PLAN PHASE
You design the chain architecture for a DSL program.

${DSL_REFERENCE}

${DSL_SCAFFOLDING_PATTERNS}

${DSL_EXEMPLAR_PATTERNS}
`;
var DSL_GENERATE_KNOWLEDGE = `
## DSL GENERATE PHASE
You emit a DSL program string from the plan.

${DSL_CRITICAL_RULES}

${DSL_SCAFFOLDING_PATTERNS}

${DSL_EXEMPLAR_PATTERNS}
`;
var DSL_FIX_KNOWLEDGE = `
## DSL FIX PHASE
You fix issues with a DSL program.

${DSL_CRITICAL_RULES}

${DSL_SCAFFOLDING_PATTERNS}
`;
var FULL_SHADER_KNOWLEDGE = `
${AGENT_WORKFLOW_KNOWLEDGE}

${DSL_CRITICAL_RULES}

${DSL_SCAFFOLDING_PATTERNS}

${DSL_REFERENCE}

${EFFECT_CATALOG}

${EFFECT_DEFINITION_REFERENCE}

${EFFECT_DEFINITION_DEEP}

${GLSL_REFERENCE}

${GLSL_RECIPES}

${EFFECT_ANATOMY_KNOWLEDGE}

${REQUIRED_PATTERNS}
`;
export {
  AGENT_WORKFLOW_KNOWLEDGE,
  COMPACT_SHADER_KNOWLEDGE,
  CRITICAL_RULES,
  CURATED_KNOWLEDGE,
  DSL_CRITICAL_RULES,
  DSL_EXEMPLAR_PATTERNS,
  DSL_EXEMPLAR_PROGRAMS,
  DSL_FIX_KNOWLEDGE,
  DSL_GENERATE_KNOWLEDGE,
  DSL_PLAN_KNOWLEDGE,
  DSL_REFERENCE,
  DSL_RESEARCH_KNOWLEDGE,
  DSL_SCAFFOLDING_PATTERNS,
  EFFECT_ANATOMY_KNOWLEDGE,
  EFFECT_CATALOG,
  EFFECT_DEFINITION_DEEP,
  EFFECT_DEFINITION_REFERENCE,
  EffectIndex,
  FIX_KNOWLEDGE,
  FULL_SHADER_KNOWLEDGE,
  GENERATE_KNOWLEDGE,
  GLSL_RECIPES,
  GLSL_REFERENCE,
  GlslIndex,
  INNATE_SHADER_KNOWLEDGE,
  PLAN_KNOWLEDGE,
  REQUIRED_PATTERNS,
  RESEARCH_KNOWLEDGE,
  ShaderKnowledgeDB,
  TECHNIQUE_SYNONYMS,
  VALIDATE_KNOWLEDGE,
  expandQueryWithSynonyms,
  getKnowledgeByTopic,
  getShaderKnowledgeDB,
  getSharedEffectIndex,
  invalidateSharedEffectIndex,
  retrieveForAgent,
  retrieveLoopSafeExamples,
  searchByLoopPattern,
  searchExemplars,
  searchShaderKnowledge
};
//# sourceMappingURL=index.js.map