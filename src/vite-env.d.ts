/// <reference types="vite/client" />

interface Window {
  __LOCAL_IP__?: string;
  __LOCAL_PORT__?: number;
  __AXHUB_SHARE_HOSTS__?: {
    localHost?: string;
    lanHost?: string;
  };
  __AXHUB_MAKE_API_ORIGIN__?: string;
  __RUNTIME_ORIGIN__?: string;
  __ERROR_SYSTEM__?: {
    markReactReady: () => void;
    getErrorQueue: () => any[];
    clearErrors: () => void;
    setErrorCaptureEnabled: (enabled: boolean) => void;
    isErrorCaptureEnabled: () => boolean;
  };
}

declare module '*.png' {
  const value: string;
  export default value;
}

declare module '*.jpg' {
  const value: string;
  export default value;
}

declare module '*.jpeg' {
  const value: string;
  export default value;
}

declare module '*.svg' {
  const value: string;
  export default value;
}

declare module '*.gif' {
  const value: string;
  export default value;
}

declare module '*.wav' {
  const value: string;
  export default value;
}

declare module 'marked' {
  export const marked: any;
}
