import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
export declare const analyzeBranchingSchema: {
    effect_id: z.ZodString;
    backend: z.ZodDefault<z.ZodEnum<{
        webgl2: "webgl2";
        webgpu: "webgpu";
    }>>;
};
export declare function analyzeBranching(effectId: string, backend: string): Promise<any>;
export declare function registerAnalyzeBranching(server: McpServer): void;
//# sourceMappingURL=branching.d.ts.map