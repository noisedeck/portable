import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
export declare const checkAlgEquivSchema: {
    effect_id: z.ZodString;
};
export declare function checkAlgEquiv(effectId: string): Promise<any>;
export declare function registerCheckAlgEquiv(server: McpServer): void;
//# sourceMappingURL=alg-equiv.d.ts.map