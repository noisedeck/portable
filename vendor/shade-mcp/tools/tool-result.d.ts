export type ToolResult = {
    content: Array<{
        type: 'text';
        text: string;
    }>;
    isError?: true;
};
/**
 * Wraps a tool payload as MCP content.
 *
 * Without `isError`, a client cannot tell "shader directory not found" from a
 * successful analysis that happened to find nothing — both arrive as plain
 * text. Whole-call failures are marked; a batch whose entries partly failed is
 * left unmarked, since the per-entry status already carries that detail.
 */
export declare function toolResult(payload: unknown): ToolResult;
//# sourceMappingURL=tool-result.d.ts.map