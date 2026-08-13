export interface KnowledgeDocument {
    id: string;
    title: string;
    content: string;
    category: string;
    source?: string;
    tags?: string[];
}
export interface SearchResult {
    id: string;
    title: string;
    content: string;
    category: string;
    score: number;
    snippet: string;
    source?: string;
    tags?: string[];
}
export interface SearchOptions {
    limit?: number;
    category?: string;
    minScore?: number;
}
export declare class ShaderKnowledgeDB {
    private documents;
    private tfVectors;
    private documentFrequency;
    private totalDocuments;
    private indexBuilt;
    addDocument(doc: KnowledgeDocument): void;
    addDocuments(docs: KnowledgeDocument[]): void;
    buildIndex(): void;
    search(query: string, options?: SearchOptions): SearchResult[];
    extractSnippet(content: string, queryTokens: string[], snippetLength?: number): string;
    getCategories(): string[];
    getByCategory(category: string): KnowledgeDocument[];
    getStats(): {
        totalDocuments: number;
        totalTerms: number;
        indexed: boolean;
        categories: Record<string, number>;
    };
}
//# sourceMappingURL=vector-db.d.ts.map