import type { IncomingMessage, ServerResponse } from 'node:http';
import { type PreviewBridgeHub } from './previewBridge.ts';
export declare const AXHUB_PREVIEW_MCP_PATH = "/api/mcp/axhub-preview";
export declare const AXHUB_PREVIEW_MCP_TOKEN_HEADER = "x-axhub-preview-mcp-token";
export declare const AXHUB_PREVIEW_BRIDGE_CLIENT_ID_HEADER = "x-axhub-preview-bridge-client-id";
export declare const AXHUB_PREVIEW_VOICE_TOOLS_HEADER = "x-axhub-preview-voice-tools";
export interface AxhubPreviewMcpOptions {
    token: string;
    bridgeHub: Pick<PreviewBridgeHub, 'sendCommand'>;
    captureOutputRoot?: string;
}
export declare function createAxhubPreviewMcpToken(): string;
export declare function isAxhubPreviewMcpRequest(requestUrl: string): boolean;
export declare function handleAxhubPreviewMcp(req: IncomingMessage, res: ServerResponse, options: AxhubPreviewMcpOptions): Promise<boolean>;
