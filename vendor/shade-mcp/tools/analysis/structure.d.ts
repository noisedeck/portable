import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
export declare const checkEffectStructureSchema: {
    effect_id: z.ZodString;
};
export declare function checkEffectStructure(effectId: string): Promise<any>;
export declare function registerCheckEffectStructure(server: McpServer): void;
//# sourceMappingURL=structure.d.ts.map