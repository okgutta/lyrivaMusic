export type UpdatePhase = "idle" | "checking" | "available" | "downloading" | "ready" | "error";

export interface UpdateState {
  phase: UpdatePhase;
  currentVersion: string;
  latestVersion?: string;
  notes?: string;
  releaseUrl?: string;
  progress?: number;
  error?: string;
  loaderUpdateRequired?: boolean;
}

export interface UpdateBridge {
  getState(): UpdateState;
  subscribe(listener: (state: UpdateState) => void): () => void;
  check(): Promise<void>;
  download(): Promise<void>;
  reload(): void;
  markHealthy(version: string): void;
}

declare global {
  interface Window {
    __LYRIVA_UPDATER__?: UpdateBridge;
  }
}
