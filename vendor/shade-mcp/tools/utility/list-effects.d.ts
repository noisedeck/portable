import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
export declare const listEffectsSchema: {
    namespace: z.ZodOptional<z.ZodString>;
};
export declare function registerListEffects(server: McpServer): void;
//# sourceMappingURL=list-effects.d.ts.map