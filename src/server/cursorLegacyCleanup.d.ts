export declare const LEGACY_CURSOR_COMPANION_LABEL = "im.axhub.cursor.make-companion";
export declare const LEGACY_CURSOR_WINDOWS_TASK_NAME = "Axhub Make Cursor Companion";
interface LegacyCleanupFileSystem {
    access(filePath: string): Promise<void>;
    remove(filePath: string, options?: {
        force?: boolean;
        recursive?: boolean;
    }): Promise<void>;
}
interface LegacyCleanupContext {
    platform?: NodeJS.Platform | string;
    homeDir?: string;
    env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
    userId?: string;
    fileSystem?: LegacyCleanupFileSystem;
    run?: (command: string, args: string[]) => Promise<unknown>;
}
export declare function removeLegacyCursorIntegration(context?: LegacyCleanupContext): Promise<{
    removed: boolean;
}>;
export {};
