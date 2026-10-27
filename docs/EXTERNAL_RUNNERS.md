# External runners

External tools under **Tools > External tools** lets an operator monitor and start configured jobs in a separate service. BookOrbit does not execute shell commands, manage source accounts, or schedule these jobs. The indexer plugin API is unchanged.

## Configure BookOrbit

Set `EXTERNAL_RUNNER_ENCRYPTION_KEY` to a stable 32-byte key encoded as 64 hex characters. For example, generate it with `openssl rand -hex 32` and put it in the server's private environment. Keep it in backups. Rotating it requires saving connection tokens again.

After applying the generated database migration, sign in with `ManageLibraries` to use the page and `ManageAppSettings` to create, edit or remove connections. Every connection belongs to its creator; access to a library does not expose another user's runner, logs, or credentials. This first version does not share connections across users.

Add the runner's base URL and bearer token. Use HTTPS across untrusted networks. Explicit private-network opt-in permits HTTP only to a literal private or loopback IP address. Hostnames require HTTPS. Changing the URL or private-network policy requires entering the token again. BookOrbit rejects redirects, checks destination addresses on connection, limits requests to 15 seconds and responses to 512 KiB, and validates every response. Never expose an unauthenticated runner or give BookOrbit a Docker socket.

Disabling or removing a connection affects only BookOrbit access. It does not stop the backend, its schedules, or an accepted execution. The page polls while active; completion notifications are in-page toasts, not a background alert service. History remains authoritative at the runner. Unreachable runners retain last-known results with their last-check time.

## Protocol v1

Paths below are relative to the configured base URL. Every request carries `Authorization: Bearer <token>`. JSON responses use camelCase. Shared response types are in `packages/types/src/external-runner.ts`; server validation is in `server/src/modules/external-runner/runner-protocol.ts`.

| Method and path                            | Contract                                                                                 |
| ------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `GET /capabilities`                        | `protocolVersion: 1`, stable `instanceId`, display `name`, and up to 100 configured jobs |
| `GET /runs?limit=25&cursor=...`            | `{items: ExternalRun[], nextCursor: string                                               | null}` |
| `GET /runs/:id`                            | One `ExternalRun`                                                                        |
| `GET /runs/:id/events?limit=25&cursor=...` | Bounded event page with `id`, ISO `timestamp`, `level`, and redacted `message`           |
| `POST /runs`                               | `{jobId, idempotencyKey}`; respond `202` with the durable run                            |
| `POST /runs/:id/cancel`                    | Optional, `{idempotencyKey}`; respond `202` with current run state                       |

Jobs contain `id`, `label`, `canStart`, `canCancel`, and nullable schedule text. They are configured by the backend operator; no arbitrary commands or argument forms cross this boundary. IDs use letters, digits, underscores and hyphens, at most 100 characters. Cursors are opaque to the client, at most 512 characters from letters, digits, underscores, dots, colons and hyphens. Pages contain at most 100 entries.

A run carries its ID and job ID, origin (`manual`, `schedule`, `external`), state (`queued`, `running`, `succeeded`, `failed`, `cancelled`, `interrupted`, `busy`), start/end timestamps, nullable phase/message, bounded nonnegative integer counters, child run IDs, and `importStatus: "unconfirmed"`. Event messages are at most 2,000 characters. Never include cookies, credentials, source payloads or raw command lines in returned messages.

The runner must persist acceptance before starting work. Repeating a request key returns the original execution, including after completion or restart. A key is scoped to the runner instance and must not be reused for another job. A distinct request while unavailable for work returns `409`; that does not imply it was queued. `busy` is also a terminal outcome for a scheduled attempt that lost an external lock. Persist the instance ID and execution store together.

Cancellation acceptance is not cancellation completion. Advertise it only when the runner can stop work safely and reconcile interruption after restart. Losing network contact never proves a job stopped. The UI retains a start key after an uncertain response for retries within that page session; after a page reload, inspect history before starting another execution.

The service must observe scheduled and operator-started jobs too, through the same execution wrapper or explicit reporting. It must not manufacture parent-child relationships from nearby timestamps. Retaining or pruning durable execution history is an external service policy.

## Other tools

A FanFicFare wrapper can expose a job such as `update-saved-stories` with the same protocol. Its CLI process supervision, per-story outcome parsing, URL list, source credentials and canonical EPUBs belong outside BookOrbit. No FanFicFare adapter is included in this change; the generic client is tested with independent backend identities. Calibre GUI plugin compatibility is not implied.

Artifact delivery and import reconciliation are separate work. A successful run may have held output, or a delivered file may not yet be indexed. Do not overwrite reader-owned files or drop duplicate editions to simulate update support.

## Validation

- Server contract/authorization: `pnpm --filter server exec vitest run src/modules/external-runner/external-runner.integration.test.ts`.
- Real persistence: apply migrations to a disposable PostgreSQL database, then set `RUNNER_TEST_DATABASE_URL` and run `pnpm --filter server exec vitest run src/modules/external-runner/runner.repository.integration.test.ts`.
- UI state and retry behavior: `pnpm --filter client exec vitest run src/features/external-runner/composables/useExternalRunners.spec.ts`.
