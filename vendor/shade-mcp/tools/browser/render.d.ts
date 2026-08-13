import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BrowserSession } from '../../harness/browser-session.js';
import type { RenderResult } from '../../harness/types.js';
export declare const renderEffectFrameSchema: {
    effect_id: z.ZodOptional<z.ZodString>;
    effects: z.ZodOptional<z.ZodString>;
    backend: z.ZodDefault<z.ZodEnum<{
        webgl2: "webgl2";
        webgpu: "webgpu";
    }>>;
    warmup_frames: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    capture_image: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    uniforms: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodNumber>>;
    time: z.ZodOptional<z.ZodNumber>;
    resolution: z.ZodOptional<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
};
export declare function renderEffectFrame(session: BrowserSession, effectId: string, options?: {
    warmupFrames?: number;
    captureImage?: boolean;
    uniforms?: Record<string, number>;
    time?: number;
    resolution?: [number, number];
}): Promise<RenderResult>;
export declare function registerRenderEffectFrame(server: McpServer): void;
//# sourceMappingURL=render.d.ts.map