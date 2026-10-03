export interface FramePolicyResult {
    ok: boolean;
    code: "frame-policy-allowed" | "frame-policy-blocked" | "frame-policy-unknown";
    message?: string;
}
export declare function inspectFramePolicy(headers: Headers): FramePolicyResult;
