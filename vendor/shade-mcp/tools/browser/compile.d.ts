import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BrowserSession } from '../../harness/browser-session.js';
import type { CompileResult } from '../../harness/types.js';
export declare const compileEffectSchema: {
    effect_id: z.ZodOptional<z.ZodString>;
    effects: z.ZodOptional<z.ZodString>;
    backend: z.ZodDefault<z.ZodEnum<{
        webgl2: "webgl2";
        webgpu: "webgpu";
    }>>;
};
export declare function compileEffect(session: BrowserSession, effectId: string): Promise<CompileResult>;
export declare function registerCompileEffect(server: McpServer): void;
//# sourceMappingURL=compile.d.ts.map