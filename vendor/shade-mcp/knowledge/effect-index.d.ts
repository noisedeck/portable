import { type EffectDefinition } from '../formats/index.js';
export declare class EffectIndex {
    private effects;
    private initialized;
    initialize(effectsDir: string): Promise<void>;
    search(query: string, limit?: number): Array<{
        id: string;
        def: EffectDefinition;
        score: number;
    }>;
    get(effectId: string): EffectDefinition | undefined;
    list(namespace?: string): Array<{
        id: string;
        def: EffectDefinition;
    }>;
    get size(): number;
}
//# sourceMappingURL=effect-index.d.ts.map