export type Backend = 'webgl2' | 'webgpu';
export interface Config {
    effectsDir: string;
    viewerPort: number;
    defaultBackend: Backend;
    projectRoot: string;
    globalsPrefix: string | undefined;
    viewerPath: string | undefined;
    maxBrowsers: number;
    timeoutMs: number;
    aiTimeoutMs: number;
    aiModel: string | undefined;
}
export declare function getConfig(): Config;
//# sourceMappingURL=config.d.ts.map