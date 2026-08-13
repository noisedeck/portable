import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BrowserSession } from '../../harness/browser-session.js';
import type { ParityResult } from '../../harness/types.js';
export declare const testPixelParitySchema: {
    effect_id: z.ZodOptional<z.ZodString>;
    effects: z.ZodOptional<z.ZodString>;
    epsilon: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    seed: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
};
export declare function testPixelParity(session: BrowserSession, effectId: string, options?: {
    epsilon?: number;
    seed?: number;
}): Promise<ParityResult>;
export declare function registerTestPixelParity(server: McpServer): void;
//# sourceMappingURL=parity.d.ts.map