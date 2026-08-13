import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
export declare const analyzeEffectSchema: {
    effect_id: z.ZodString;
};
export declare function registerAnalyzeEffect(server: McpServer): void;
//# sourceMappingURL=analyze-effect.d.ts.map