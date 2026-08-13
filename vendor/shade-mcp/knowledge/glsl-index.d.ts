interface GlslSearchResult {
    effectId: string;
    file: string;
    lineNumber: number;
    matchLine: string;
    context: string;
}
export declare class GlslIndex {
    private files;
    private initialized;
    initialize(effectsDir: string): Promise<void>;
    search(query: string, contextLines?: number, limit?: number): GlslSearchResult[];
    get size(): number;
}
export {};
//# sourceMappingURL=glsl-index.d.ts.map