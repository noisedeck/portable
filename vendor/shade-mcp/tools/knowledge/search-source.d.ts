import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
export declare const searchShaderSourceSchema: {
    query: z.ZodString;
    context_lines: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
};
export declare function registerSearchShaderSource(server: McpServer): void;
//# sourceMappingURL=search-source.d.ts.map