export const EXTERNAL_RUN_STATES = ["queued", "running", "succeeded", "failed", "cancelled", "interrupted", "busy"] as const;
export type ExternalRunState = (typeof EXTERNAL_RUN_STATES)[number];

export interface ExternalRunnerConnection {
  id: number;
  name: string;
  baseUrl: string;
  allowPrivateAddress: boolean;
  enabled: boolean;
}

export interface ExternalRunnerJob {
  id: string;
  label: string;
  canStart: boolean;
  canCancel: boolean;
  schedule: string | null;
}

export interface ExternalRunnerDescription {
  protocolVersion: 1;
  instanceId: string;
  name: string;
  jobs: ExternalRunnerJob[];
}

export interface ExternalRun {
  id: string;
  jobId: string;
  origin: "manual" | "schedule" | "external";
  state: ExternalRunState;
  startedAt: string;
  finishedAt: string | null;
  phase: string | null;
  counters: Record<string, number>;
  message: string | null;
  childRunIds: string[];
  importStatus: "unconfirmed";
}

export interface ExternalRunPage {
  items: ExternalRun[];
  nextCursor: string | null;
}

export interface ExternalRunEvents {
  items: Array<{ id: string; timestamp: string; level: "info" | "warning" | "error"; message: string }>;
  nextCursor: string | null;
}
