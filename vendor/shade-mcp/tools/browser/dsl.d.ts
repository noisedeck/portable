import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BrowserSession } from '../../harness/browser-session.js';
export declare const runDslProgramSchema: {
    dsl: z.ZodString;
    backend: z.ZodDefault<z.ZodEnum<{
        webgl2: "webgl2";
        webgpu: "webgpu";
    }>>;
    warmup_frames: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    capture_image: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    uniforms: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodNumber>>;
};
export declare function runDslProgram(session: BrowserSession, dsl: string, options?: {
    warmupFrames?: number;
    captureImage?: boolean;
    uniforms?: Record<string, number>;
}): Promise<any>;
export declare function registerRunDslProgram(server: McpServer): void;
//# sourceMappingURL=dsl.d.ts.map