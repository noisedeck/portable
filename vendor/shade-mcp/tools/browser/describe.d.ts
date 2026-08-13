import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BrowserSession } from '../../harness/browser-session.js';
export declare const describeEffectFrameSchema: {
    effect_id: z.ZodOptional<z.ZodString>;
    effects: z.ZodOptional<z.ZodString>;
    prompt: z.ZodString;
    backend: z.ZodDefault<z.ZodEnum<{
        webgl2: "webgl2";
        webgpu: "webgpu";
    }>>;
    capture_image: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
};
export declare function describeEffectFrame(session: BrowserSession, effectId: string, prompt: string, options?: {
    captureImage?: boolean;
}): Promise<any>;
export declare function registerDescribeEffectFrame(server: McpServer): void;
//# sourceMappingURL=describe.d.ts.map