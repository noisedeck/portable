import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
export declare const searchEffectsSchema: {
    query: z.ZodString;
    limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
};
export declare function registerSearchEffects(server: McpServer): void;
//# sourceMappingURL=search-effects.d.ts.map