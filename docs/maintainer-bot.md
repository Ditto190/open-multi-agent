# OMA Maintainer Bot

## Product boundary

OMA Maintainer Bot is a repository-local, evidence-first path from a narrowly
authorized GitHub issue to a structured Draft PR proposal. It is not a general
coding agent. The GitHub or gh-aw host remains responsible for event delivery,
permission checks, isolated worktrees, secrets, concurrency, branch and Draft
PR creation, and every later GitHub lifecycle action.

The local engine never creates a branch, commits, pushes, comments, labels,
opens a pull request, marks one ready, approves, merges, closes an issue,
publishes, tags, releases, or deploys. Its strongest successful output is
`DRAFT_PR_PROPOSAL_READY`. Only a separate credential-holding host may create a
Draft PR, after calling the deterministic safe-output revalidation boundary.
The host may then acknowledge the result as `DRAFT_PR_CREATED`; that state is
never inferred from a proposal.

## Fixed execution flow

1. Deterministic admission computes the material issue revision and enforces
   Definition of Ready, manual-only classes, write-authorized `agent-ready`
   evidence, exact revision, and exact base SHA.
2. The deterministic context builder verifies a clean isolated worktree at the
   fixed base SHA and writes a versioned, hash-bound context manifest.
3. One explicit OMA `runTasks()` task performs schema-bound, read-only triage.
   The deterministic host starts no planner or implementer unless triage says
   `proceed`, reports no uncertainty or manual-risk blocker, and exactly echoes
   the authorized issue revision and acceptance criteria.
4. Only after that host check, a second explicit OMA `runTasks()` DAG executes
   read-only repository planning followed by a schema-bound implementation
   proposal. A rejected triage therefore spends no planner/implementer tokens
   and cannot reach an edit capability.
5. The host applies compare-and-swap full-content edits through the restricted
   edit capability. The model has no filesystem or shell tool.
6. The host runs every preregistered validation command as argv with
   `shell: false` and a credential-stripped environment.
7. A new OMA team and agent perform fresh-context review using only confirmed
   requirements, acceptance criteria, the final diff, validation evidence,
   bounded current-file snapshots, and relevant context. Implementer reasoning
   and conversation history are not passed to the reviewer.
8. A rejected but bounded and repairable result may run at most two repair
   loops. Repairs use `currentFiles[].contentHash` from the fresh review bundle
   for compare-and-swap, then repeat deterministic validation and fresh review.
9. Deterministic TypeScript emits a Draft PR proposal only when context is
   sufficient, every validation passes without truncation, every acceptance
   criterion passes fresh review, all paths remain in scope, and each proposed
   `afterHash` still equals the content reviewed after validation.

All model outputs use Zod schemas. A single OMA structured-output correction is
still available inside a role; task retries are disabled. Cumulative token,
configured price-based cost, wall-clock, edit-size, diff-size, context-size,
and repair-loop limits fail closed.

## Admission and state

The structured states are:

- `READY_CANDIDATE`, `NEEDS_CLARIFICATION`, `MANUAL_ONLY`, `BLOCKED`
- `AGENT_READY`, `RUNNING`
- `DRAFT_PR_PROPOSAL_READY`, `DRAFT_PR_CREATED`
- `NEEDS_HUMAN`, `FAILED`

`DRAFT_PR_PROPOSAL_READY` is intentionally separate from
`DRAFT_PR_CREATED`. The latter requires a matching host acknowledgment and
proposal hash.

Definition of Ready requires a clear problem, current and expected behavior,
verifiable acceptance criteria, target workspace and paths, explicit
out-of-scope behavior, no unresolved product or architecture decision, no
active PR/run/blocker, and fixed issue revision/base SHA. Bugs additionally
require deterministic reproduction steps or a constructible failing-test
procedure. Bounded docs, test, and single-workspace refactor tasks do not need
traditional reproduction steps when current/expected behavior, acceptance,
scope, and deterministic validation are explicit.

Architecture design, major public API changes, breaking changes, broad
cross-workspace refactors, security, permissions, privacy, licenses, CI,
release/publication, dependency upgrades without fixed compatibility targets,
trackers/discussions/questions, and work without deterministic validation are
`MANUAL_ONLY`. `riskFlags` are structured control-plane evidence reviewed by
the maintainer before granting `agent-ready`; a model may suggest risk but
cannot issue or renew authorization.

The issue revision hashes material issue fields, comments, confirmed scope,
acceptance criteria, linked work, and blockers. Editing that material after
authorization makes the authorization stale. A run key hashes repository,
issue number, issue revision, and base SHA. The base SHA is included so a
maintainer can deliberately reauthorize the same issue content against a newer
base without receiving a false duplicate.

`policyVersion` does not enter the run key because it is not itself a
maintainer authorization fact. A policy change does not silently authorize a
rerun. The control plane must revalidate the issue and issue a new
revision/base authorization when a rerun is intended; the proposal and final
safe-output gate still require the exact policy and prompt versions.

### Crash and stale lease semantics

The file state store is an authoritative local idempotency and audit ledger;
it is **not authoritative crash recovery** and does not resume model
conversations or edits after process death. There is no lease renewal or
fencing-based automatic takeover in this MVP.

An active lease blocks a concurrent claim. If a `RUNNING` record loses or
exceeds its lease, a new claim does not resume it: the old record is atomically
marked `NEEDS_HUMAN` with an auditable stale reason. `failStaleRun()` is the
controlled local entry for a maintainer or outer control plane to make that
transition explicitly; it requires the exact run key/run ID and refuses an
active lease. Recovery means inspecting the isolated worktree, selecting a new
clean base or material issue revision, and issuing fresh maintainer
authorization. The same revision/base pair remains terminal and cannot be
silently retried. Recovery does not mean replaying a checkpoint.

OMA reasoning content, conversation history, telemetry, and checkpoints are
execution artifacts, not long-term repository memory and not the
cross-process authority for issue/run state.

## Context manifest and trust

Every actual model run has a persisted manifest with policy/prompt version,
issue and acceptance criteria, issue revision, base SHA, workspace map
(including the root package identity when declared),
root-to-target `AGENTS.md` chain, contribution rules, package and TypeScript
configuration, relevant docs/README/source/tests/fixtures/examples,
TypeScript/JavaScript relative-import relationships, bounded relevant Git
history and linked evidence, validation commands, and source-level SHA-256
provenance.

System policy is highest priority. Repository policies are identified
separately. Issue text, comments, commit messages, ordinary repository files,
diffs, and external material are all untrusted evidence, never instructions.
Missing target files, unresolved conflict markers, a moved base, a dirty
worktree, symlinks, required truncation/omission, byte/file limits, protected
paths, or other evidence conflicts set context sufficiency to false and route
the run to `NEEDS_HUMAN` before model edits.

`config.allowedPaths` is only the deployment-level maximum. The manifest also
records `approvedEditScopes` derived from the maintainer-authorized
`issue.targetPaths`, including whether each target is a file or directory.
Planner files, initial edits, repairs, the restricted editor, and the final
diff must pass both boundaries. A file target authorizes exactly that file; a
directory target authorizes paths below that directory.

## Tool, credential, and validation boundary

Triage, planner, and reviewer roles receive only immutable read-only evidence
tools and must read their assigned evidence at least once. Repeated reads remain
read-only but consume budget. Triage uncertainty and manual-risk arrays contain
only unresolved blockers; a safe case uses empty arrays rather than reassuring
text. The implementer also receives no write tool: it returns bounded
full-content edits with expected hashes, and deterministic host code applies
them. Every role explicitly denies built-in `bash`, file-write/edit,
delegation, and search tools. OMA `bash` is not treated as a sandbox.

The model process refuses to start when known GitHub/npm write credentials,
including credential names with host-specific prefixes, are present. Launch
the custom engine with `DEEPSEEK_API_KEY` only. Validation
subprocesses receive an environment with token/key/secret/password/cookie and
credential-like variables removed. Secret values are never written to model
context, artifacts, or command output intentionally; output redaction remains
best effort.

Validation commands come only from trusted configuration. Issue or model text
cannot choose an executable, argv, cwd, or timeout. All registered commands
run, results and skipped checks are recorded, and failed or truncated evidence
blocks proposal eligibility. The current-file repair snapshots are non-symlink
regular files, path checked, per-file bounded, and capped at 180 KB total.

## CLI and artifacts

Build first, then use one of three commands:

```bash
node packages/maintainer-bot/dist/cli.js admit \
  --request request.json

node packages/maintainer-bot/dist/cli.js dry-run \
  --request request.json \
  --config packages/maintainer-bot/config/config.example.json

DEEPSEEK_API_KEY=... node packages/maintainer-bot/dist/cli.js run \
  --request request.json \
  --config config.json \
  --state-dir /outside/repository/state \
  --artifact-dir /outside/repository/artifacts \
  --run-id host-event-id
```

State and artifact directories must stay outside the isolated repository;
otherwise their files would correctly fail the clean-diff gate. A full run
persists `<runKey>.context.json` and, only after every gate passes,
`<runKey>.draft-pr-proposal.json`. The proposal includes issue/revision/base,
acceptance criteria, files and reasons, all validation commands/results,
skipped checks, model/prompt/policy versions, risks, fresh review, context hash,
and its own proposal hash.

`config.example.json` contains an explicit model-pricing snapshot solely for
cost-limit arithmetic. Operators must refresh those configured rates from the
current provider contract; the engine does not claim they remain current.

## gh-aw / GitHub host adapter

[`config/gh-aw-adapter.example.json`](../packages/maintainer-bot/config/gh-aw-adapter.example.json)
is a repository-owned custom-engine contract, not an invented gh-aw workflow
schema. It keeps trigger/permission assertions, credential isolation, engine
command, immutable pin policy, host revalidation fields, and prohibited
actions auditable and replaceable. The example deliberately contains
`REQUIRED_IMMUTABLE_COMMIT_SHA`; `ghAwAdapterDefinitionSchema` rejects it until
an operator replaces it with a reviewed 40-character commit SHA.

Before a credential-holding host creates a Draft PR, it must call
`revalidateDraftPrSafeOutput()` with the exact repository root and command
runner that will be used for the host action. The public gate first rechecks
current agent-ready authorization, issue revision/base, manifest and proposal
hashes, path scope, validation set/results, policy/prompt versions, reviewer
approval of every authorized criterion, and the matching authoritative
`DRAFT_PR_PROPOSAL_READY` run record. It then checks the actual worktree: `HEAD`
must equal the proposal base SHA, the complete changed-path set must exactly
equal `proposal.changedFiles`, and every current regular file SHA-256 must equal
its reviewed `afterHash`. Extra untracked files, deletions, renames, protected
or out-of-scope changes, changed `HEAD`, or content drift fail closed. The gate
performs no network request. Draft PR creation remains a separate deterministic
host action, and no authorization here extends to Ready, approval, merge,
close, release, publish, tag, or deploy.

The adapter boundary and schemas are locally tested. This MVP does not deep
fork gh-aw and has not been run end-to-end against a live gh-aw version or
GitHub write token; the exact gh-aw wrapper and permission configuration remain
an activation risk to verify in a separate authorized environment.

## Verification and activation gaps

Unit/integration tests use mock OMA adapters and do not need API keys. The
fixture dry-run is read-only. A live DeepSeek canary is intentionally not part
of default tests and every activation record must state whether it ran. For the
MVP acceptance run, a credential-isolated, single-file fixture completed
`AGENT_READY` through edit, deterministic validation, fresh approval, proposal
creation, and the actual-worktree safe-output gate. The canary passed two
registered validations and all three acceptance criteria; it performed no
GitHub write. A live GitHub canary must use a disposable repository or
supervised Draft PR and requires separate authorization; this package itself
still must not receive the write token.
