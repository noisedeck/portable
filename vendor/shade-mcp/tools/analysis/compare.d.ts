import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
export declare const compareShadersSchema: {
    effect_id: z.ZodString;
};
export declare function extractFunctionNames(source: string, lang: 'glsl' | 'wgsl'): string[];
export declare function stripComments(source: string): string;
export declare function extractUniforms(source: string, lang: 'glsl' | 'wgsl'): string[];
export declare function compareShaders(effectId: string): Promise<any>;
export declare function registerCompareShaders(server: McpServer): void;
//# sourceMappingURL=compare.d.ts.map