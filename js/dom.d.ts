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
    placeAtExit: (inside: boolean | 'before', speed?: number) => unknown;
    replayAfterMenu: () => unknown;
    exitHint: () => { shown: boolean; text: string; how: string; slow: boolean; fast: boolean; modal: boolean; feed: string[] };
    teleport: (s: number, lane?: number) => unknown;
    probe: (ms?: number) => Promise<unknown>;
    forceWeather: (on?: boolean) => unknown;
    view: (mode?: string) => unknown;
    startAt: (meters: number, viewMode?: string) => unknown;
    G?: unknown;
  };
}
