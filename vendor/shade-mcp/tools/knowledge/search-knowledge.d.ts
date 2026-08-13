import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
export declare const searchShaderKnowledgeSchema: {
    query: z.ZodString;
    category: z.ZodOptional<z.ZodString>;
    limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
};
export declare function registerSearchShaderKnowledge(server: McpServer): void;
//# sourceMappingURL=search-knowledge.d.ts.map