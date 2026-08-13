/**
 * Loop-safe shader examples and retrieval functions.
 *
 * Extracted from shade's server/shader-knowledge/vector-db/index.js.
 * Curated, complete, working looping shader examples that demonstrate
 * correct animation techniques.
 */
import type { KnowledgeDocument } from './vector-db.js';
/**
 * Retrieve loop-safe shader examples for GENERATE phase.
 * Returns COMPLETE, WORKING shader examples that demonstrate correct looping.
 *
 * These are curated, minimal examples -- not extracted from indexed docs.
 *
 * @param technique - Optional technique filter (e.g., 'noise', 'rotation')
 * @param limit - Maximum examples to return
 * @returns Formatted GLSL examples for system prompt injection
 */
export declare function retrieveLoopSafeExamples(technique?: string, limit?: number): string;
/**
 * Search for shaders by looping pattern.
 *
 * Unlike the shade original which accesses db.documents directly,
 * this version accepts a getDocuments callback to avoid coupling
 * to the DB singleton.
 *
 * @param pattern - Pattern type to search for
 * @param limit - Maximum results
 * @param getDocuments - Callback that yields documents to search
 * @returns Matching documents
 */
export declare function searchByLoopPattern(pattern: 'loop-safe' | 'loop-unsafe' | 'all', limit: number | undefined, getDocuments: () => Iterable<KnowledgeDocument>): KnowledgeDocument[];
//# sourceMappingURL=loop-safe-examples.d.ts.map