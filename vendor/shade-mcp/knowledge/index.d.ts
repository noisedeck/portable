export { EffectIndex } from './effect-index.js';
export { GlslIndex } from './glsl-index.js';
export { ShaderKnowledgeDB } from './vector-db.js';
export type { KnowledgeDocument, SearchResult, SearchOptions } from './vector-db.js';
export { getSharedEffectIndex, invalidateSharedEffectIndex } from './shared-instances.js';
export { expandQueryWithSynonyms, TECHNIQUE_SYNONYMS, CURATED_KNOWLEDGE } from './shader-knowledge.js';
export { searchShaderKnowledge, retrieveForAgent, getShaderKnowledgeDB, getKnowledgeByTopic, } from './search-helpers.js';
export { retrieveLoopSafeExamples, searchByLoopPattern } from './loop-safe-examples.js';
export { INNATE_SHADER_KNOWLEDGE, CRITICAL_RULES } from './innate-knowledge.js';
export { DSL_CRITICAL_RULES, DSL_SCAFFOLDING_PATTERNS, DSL_REFERENCE } from './dsl-knowledge.js';
export { EFFECT_CATALOG } from './effect-catalog.js';
export { EFFECT_DEFINITION_REFERENCE, EFFECT_DEFINITION_DEEP, EFFECT_ANATOMY_KNOWLEDGE, REQUIRED_PATTERNS, } from './effect-definition.js';
export { GLSL_REFERENCE, GLSL_RECIPES } from './glsl-reference.js';
export { AGENT_WORKFLOW_KNOWLEDGE, COMPACT_SHADER_KNOWLEDGE } from './workflow-knowledge.js';
export { DSL_EXEMPLAR_PATTERNS, DSL_EXEMPLAR_PROGRAMS, searchExemplars } from './dsl-exemplars.js';
export type { ExemplarProgram } from './dsl-exemplars.js';
export { RESEARCH_KNOWLEDGE, PLAN_KNOWLEDGE, GENERATE_KNOWLEDGE, VALIDATE_KNOWLEDGE, FIX_KNOWLEDGE, FULL_SHADER_KNOWLEDGE, DSL_RESEARCH_KNOWLEDGE, DSL_PLAN_KNOWLEDGE, DSL_GENERATE_KNOWLEDGE, DSL_FIX_KNOWLEDGE, } from './state-bundles.js';
//# sourceMappingURL=index.d.ts.map