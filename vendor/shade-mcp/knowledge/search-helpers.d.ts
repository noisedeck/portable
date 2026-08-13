import { ShaderKnowledgeDB } from './vector-db.js';
import type { KnowledgeDocument, SearchResult } from './vector-db.js';
/**
 * Get the shader knowledge database singleton.
 * Initializes from curated knowledge on first call.
 */
export declare function getShaderKnowledgeDB(): ShaderKnowledgeDB;
/**
 * Search shader knowledge with synonym expansion.
 */
export declare function searchShaderKnowledge(query: string, options?: {
    limit?: number;
    category?: string;
    minScore?: number;
}): SearchResult[];
/**
 * Get knowledge documents by topic category.
 */
export declare function getKnowledgeByTopic(topic: string): KnowledgeDocument[];
/**
 * Smart RAG retrieval for agent system prompts.
 * Returns phase-specific context with critical rules and relevant examples.
 */
export declare function retrieveForAgent(query: string, phase: 'generate' | 'fix', context?: {
    technique?: string;
    error?: string;
}): string;
//# sourceMappingURL=search-helpers.d.ts.map