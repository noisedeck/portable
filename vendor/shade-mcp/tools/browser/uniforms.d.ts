import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BrowserSession } from '../../harness/browser-session.js';
export declare const testUniformResponsivenessSchema: {
    effect_id: z.ZodOptional<z.ZodString>;
    effects: z.ZodOptional<z.ZodString>;
    backend: z.ZodDefault<z.ZodEnum<{
        webgl2: "webgl2";
        webgpu: "webgpu";
    }>>;
};
export declare function testUniformResponsiveness(session: BrowserSession, effectId: string): Promise<any>;
export declare function registerTestUniformResponsiveness(server: McpServer): void;
//# sourceMappingURL=uniforms.d.ts.map