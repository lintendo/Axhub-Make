import type { CdpSocket } from "../cdp/session.js";
import { listTargets, type CdpTarget } from "../cdp/targets.js";
import { readQoderWorkDevToolsActivePort } from "../hosts/qoderwork/index.js";
export interface QoderWorkProjectSelectionOptions {
    targetPath: string;
    appPath?: string;
    platform: NodeJS.Platform;
    fetchImpl?: typeof fetch;
    WebSocketImpl?: new (url: string) => CdpSocket;
    delay?: (milliseconds: number) => Promise<void>;
}
interface QoderWorkProjectSelectionDependencies {
    readActivePort?: typeof readQoderWorkDevToolsActivePort;
    listTargetsImpl?: typeof listTargets;
    evaluateImpl?: (target: CdpTarget, expression: string, options: QoderWorkProjectSelectionOptions) => Promise<unknown>;
    openFolderMenuImpl?: (target: CdpTarget, options: QoderWorkProjectSelectionOptions) => Promise<void>;
}
export declare function buildQoderWorkRecentFolderSeedExpression(targetPath: string): string;
export declare function buildQoderWorkFolderSelectExpression(targetPath: string): string;
export declare function synchronizeQoderWorkProject(options: QoderWorkProjectSelectionOptions, dependencies?: QoderWorkProjectSelectionDependencies): Promise<void>;
export {};
