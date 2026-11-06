interface ImportMeta {
  env?: { DEV?: boolean };
}

interface Window {
  webkitAudioContext?: typeof AudioContext;
  __bajaj?: {
    snapshot: () => unknown;
    ride: (ms?: number) => Promise<unknown>;
    setKeys: (partial: Record<string, boolean>) => void;
    frame: () => string;
    errors: string[];
  };
}
