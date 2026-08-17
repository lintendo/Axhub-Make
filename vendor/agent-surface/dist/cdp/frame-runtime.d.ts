import type { HostDomProfile } from "../types.js";
import type { CdpSession } from "./session.js";
import type { InjectionEntry } from "./injection.js";
export declare const FRAME_RUNTIME_KEY = "__AXHUB_AGENT_SURFACE__";
export declare const FRAME_RUNTIME_VERSION = 25;
export interface FrameRuntimeResult {
    ok: boolean;
    code: string;
    message?: string;
    entryId?: string;
}
export declare function evaluateFrameRuntime(session: Pick<CdpSession, "command">, expression: string): Promise<FrameRuntimeResult>;
export declare function activateFrameEntryExpression(entryId: string): string;
export declare function frameRuntimeStatusExpression(): string;
export declare function deactivateFrameEntryExpression(): string;
export declare function buildFrameRuntimeSource(inputEntries: InjectionEntry[], inputProfile: HostDomProfile): string;
