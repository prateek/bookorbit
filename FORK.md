# Downstream fork

`prateek/bookorbit` is a downstream fork of [bookorbit/bookorbit](https://github.com/bookorbit/bookorbit) that carries Prateek's changes on top of upstream releases and deploys them to his own instance. Keep the divergence small: when upstream ships an equivalent of a change we carry, take theirs and drop ours.

## Model

- `downstream`, the default branch, is an upstream release tag plus our commits. It is rebased onto each new release, never merged, and every deploy comes from it.
- `main` is a mirror of upstream `main` with nothing of ours on it. It moves only when a release syncs it.
- Each of our commits is either upstreamable or fork-only:
  - An upstreamable commit is one logical change with its tests and nothing fork-specific, so it cherry-picks onto upstream as it stands.
  - A fork-only commit, such as this file or the fork workflow, uses the `fork` scope (`docs(fork):`, `ci(fork):`) and stays here.
- Fold a fix into the commit it fixes with `git commit --fixup=<sha>` and `git rebase --autosquash <base>`, then push the rewritten branch with `git push --force-with-lease`.
- A schema change and its generated migration share one commit; see [Migrations](#migrations).

## Cut a release

A release is `downstream` rebased onto the newest upstream release tag and tagged `v<upstream-version>-prateek.<n>`, where `<n>` starts at 1 for each upstream version and increments for each later release on the same one.

A clone needs the `upstream` remote (`git remote add upstream https://github.com/bookorbit/bookorbit.git`) and `git config rerere.enabled true`. rerere keeps conflict resolutions per clone and replays them in later rebases.

1. Sync the mirror with `gh repo sync prateek/bookorbit --branch main --force`, naming `main` every time: the command hard-resets whichever branch it targets. Done when `origin/main` matches `upstream/main`. When upstream has rewritten history, `gh repo sync` merges instead; point the mirror at upstream directly with `gh api -X PATCH repos/prateek/bookorbit/git/refs/heads/main -f sha=$(git rev-parse upstream/main) -F force=true`.
2. Run `git fetch upstream --tags` and pick the newest upstream release tag, for example `v3.1.0`. To ship upstream fixes that no release carries yet, use `upstream/main` as the base and keep the newest release's version in the tag.
3. On `downstream`, run `git rebase v3.1.0` and review each resolution rerere replays. If upstream added migrations since the old base, complete [Migrations](#migrations) before moving on. Done when `git log --oneline v3.1.0..downstream` lists exactly our commits.
4. Push with `git push --force-with-lease origin downstream`. Done when the Fork workflow's checks pass on that commit.
5. Tag `v3.1.0-prateek.1` on `downstream` and push the tag. Done when the Fork workflow's run summary shows the published `ghcr.io/prateek/bookorbit:3.1.0-prateek.1@sha256:...` reference, which `ghcr.io/prateek/bookorbit:release` now also points to.
6. Deploy with the infra runbook: `APP_IMAGE` follows the moving `release` tag, which step 5 moves to the new image, and the upgrade is `docker compose pull && docker compose up -d`. Done when the app is healthy and the [skipped-migration check](#skipped-migration-check) prints nothing.

## Migrations

drizzle's own migrator applies a journal entry only when its `when` is newer than the newest `created_at` in `drizzle.__drizzle_migrations`, so an upstream migration stamped earlier than one of ours that production already ran would be skipped. `server/src/scripts/migrate.ts` closes that gap before drizzle runs:

- `reconcileMigrationLedgerTimestamps` resets each applied row's `created_at` to the journal `when` of the migration with the same hash.
- `applyOutOfOrderMigrations` applies, in journal order and in one transaction, every journal entry missing from the ledger whose `when` is not newer than the newest applied one. It logs `[db.migrate_out_of_order]`.
- After drizzle runs, `findSkippedMigrations` exits 1 if any journal entry is still missing, and the app does not start.

Once production has run one of our migrations, it is append-only: fix it with a new migration. Our migrations share a commit with their schema change.

When a rebase brings in upstream migrations:

1. Order the journal: resolve `server/src/db/migrations/meta/_journal.json` with upstream's entries first and ours after, renumbering ours (`idx`, `tag`, and the SQL file names).
2. Keep the journal increasing: if an incoming upstream `when` is newer than ours, set ours to the newest upstream `when` plus 1, 2, 3 ms and so on, keeping their order. Upstream's `server/src/db/migration-journal.test.ts` checks this. The hashes do not change, so production only re-stamps its rows.
3. Rebuild our snapshot: delete our `meta/*_snapshot.json` files, build the shared types (`pnpm --filter @bookorbit/types build`), run `pnpm db:generate tmp` in `server/`, then delete the generated `tmp` SQL file and its journal entry and rename its snapshot to our last migration's number. Done when a second `pnpm db:generate` in `server/` reports no schema changes.

When upstream moves to a drizzle version that applies migrations by name, drop `applyOutOfOrderMigrations` and step 2.

### Skipped-migration check

The startup guard runs this check on every start. To run it by hand after a deploy, compare hashes, which `created_at` rewrites cannot hide:

```sh
docker exec bookorbit-app sh -c 'cd /app/migrations && node -e "for (const e of require(\"./meta/_journal.json\").entries) console.log(e.tag)" | while read t; do sha256sum "$t.sql" | cut -d" " -f1; done' | sort > /tmp/journal
docker exec bookorbit-db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "select hash from drizzle.__drizzle_migrations"' | sort > /tmp/applied
comm -23 /tmp/journal /tmp/applied
```

Each printed line is a migration production never applied.

## Send a change upstream

Cherry-pick the upstreamable commit onto upstream `main` in a branch named `BO-<issue>-<short-description>` (upstream CI enforces the name and checks that the issue exists), then open the PR against `bookorbit/bookorbit`. Once upstream merges it, the next rebase drops our copy or stops on a conflict that upstream's version settles.

## GitHub Actions

`.github/workflows/fork.yml` is the fork's only active workflow. It checks pushes and PRs to `downstream`, publishes images from `v*-prateek.*` tags, and builds an unpublished image on a manual run. Before any push, the image job starts the built image against an empty PostgreSQL and fails unless every migration applies and `/api/v1/health` answers. Each push to `downstream` also disables every other workflow, since upstream's fail without upstream's secrets or publish upstream builds under this fork. Fork CI changes go in `fork.yml`.

## Recovery

Release tags pin every shipped state. After a bad force push to `downstream`, take the previous SHA from the [Activity page](https://github.com/prateek/bookorbit/activity) and point the branch back:

```sh
gh api -X PATCH repos/prateek/bookorbit/git/refs/heads/downstream -f sha=<previous-sha> -F force=true
```

Bring upstream in only through a release. GitHub's Sync fork button on `downstream` merges upstream in or discards our commits.
