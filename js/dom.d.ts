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
    feed: (text: string, tone?: string, level?: number) => { count: number; texts: string[] };
    placeAtExit: (inside: boolean | 'before') => unknown;
    armExit: () => unknown;
    replayAfterMenu: () => unknown;
    exitHint: () => { shown: boolean; text: string; how: string; armed: boolean; button: string; modal: boolean; feed: string[] };
  };
}
