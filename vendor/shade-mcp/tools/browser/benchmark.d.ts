import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BrowserSession } from '../../harness/browser-session.js';
import type { BenchmarkResult } from '../../harness/types.js';
export declare const benchmarkEffectFPSSchema: {
    effect_id: z.ZodOptional<z.ZodString>;
    effects: z.ZodOptional<z.ZodString>;
    backend: z.ZodDefault<z.ZodEnum<{
        webgl2: "webgl2";
        webgpu: "webgpu";
    }>>;
    target_fps: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    duration_seconds: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    resolution: z.ZodOptional<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
};
export declare function benchmarkEffectFPS(session: BrowserSession, effectId: string, options?: {
    targetFps?: number;
    durationSeconds?: number;
    resolution?: [number, number];
}): Promise<BenchmarkResult>;
export declare function registerBenchmarkEffectFPS(server: McpServer): void;
//# sourceMappingURL=benchmark.d.ts.map