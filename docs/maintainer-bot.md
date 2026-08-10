# OMA Maintainer Bot

## Product boundary

OMA Maintainer Bot is a repository-local, evidence-first path from a narrowly
authorized GitHub issue to a structured Draft PR proposal. It is not a general
coding agent. In activation v1,
[`maintainer-bot.yml`](../.github/workflows/maintainer-bot.yml) is the thin
GitHub Actions control layer and `@open-multi-agent/maintainer-host` owns event
validation, durable claims, credential isolation, status, and deterministic
Draft PR writes. `@open-multi-agent/maintainer-bot` remains the real OMA
execution kernel.

The local engine never creates a branch, commits, pushes, comments, labels,
opens a pull request, marks one ready, approves, merges, closes an issue,
publishes, tags, releases, or deploys. Its strongest successful output is
`DRAFT_PR_PROPOSAL_READY`. Only a separate credential-holding host may create a
Draft PR, after calling the deterministic safe-output revalidation boundary.
The host may then acknowledge the result as `DRAFT_PR_CREATED`; that state is
never inferred from a proposal.

The workflow handles only an `issues.labeled` delivery whose exact label is
`agent-ready`. It never scans or develops all open issues, does not use
`pull_request_target`, and does not depend on a maintainer's local computer or
a long-running server.

## GitHub Actions activation flow

1. The default-branch workflow publishes or updates one BOT status comment with
   `STARTED`, Actions run URL/ID, and a freshly resolved base SHA. If an older
   claim exists, the visible STARTED notice does not replace that machine claim
   before duplicate/stale checks finish.
2. GitHub serializes runs by repository and Issue number. The job uses a
   GitHub-hosted ephemeral runner, a 45-minute timeout, pinned Node/npm
   versions, and explicit `actions: read`, `contents: write`, `issues: write`,
   and `pull-requests: write` permissions.
3. The host refetches repository, Issue, labels, material comments, timeline,
   actor permission, current default-branch SHA, trusted setting attestation,
   existing BOT state, branch, and PR metadata. It performs admission before a
   model call or repository edit.
4. A separate child receives `DEEPSEEK_API_KEY` plus a small non-secret
   environment. It receives no GitHub, npm, Actions runtime, App, SSH, or other
   write credential.
5. If OMA reaches `DRAFT_PR_PROPOSAL_READY`, a new deterministic host process
   refetches all authorization facts and calls `revalidateDraftPrSafeOutput()`
   against the actual worktree before any branch, commit, push, or PR call.
6. The writer stages exactly the reviewed files, rejects extra/untracked/
   deleted/renamed/symlinked/out-of-scope content and unsafe local Git hook,
   proxy, credential, include, filter, or URL-rewrite configuration. Writer Git
   processes disable hooks plus global/system credential configuration, use a
   deterministic branch and canonical HTTPS destination, and create at most one
   Draft PR. Every terminal path updates the single status comment and Actions
   summary.

GitHub only triggers an `issues` workflow when its workflow file exists on the
default branch. Repository Actions settings must also enable “Allow GitHub
Actions to create and approve pull requests”; activation v1 uses only the
creation half and never approves. See GitHub's
[trigger documentation](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)
and [repository Actions settings](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository?apiVersion=2022-11-28).

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

### Cross-run authority, crash, and stale semantics

`FileRunStateStore` is authoritative only inside one live engine/writer handoff.
Because GitHub-hosted runners are ephemeral, `$RUNNER_TEMP` is never the
cross-run authority. Activation v1 instead uses one identity-checked
`github-actions[bot]` status comment containing a bounded machine-readable
claim ledger, Actions run status, and deterministic branch/PR metadata. A user
comment containing the same marker is ignored. The ledger retains prior
runKeys when a later revision becomes visible and fails closed at 64 claims
instead of silently dropping idempotency history.

GitHub concurrency prevents two workflow jobs from editing the same Issue at
once. A repeated terminal runKey is a duplicate and does not invoke the model,
push, or create another PR. A lost `RUNNING` claim becomes `NEEDS_HUMAN`; the
fallback preserves its revision/runKey and automatic model-conversation resume
is forbidden. Recovery means inspecting the Actions run, ensuring the prior
work is not active, selecting a clean base or material Issue revision, removing
and reapplying authorization deliberately, and starting from a fresh model
conversation. Local checkpoints are not recovery authority.

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

DeepSeek inference is remote. The minimum relevant public-repository context —
Issue text and material comments, selected repository files/history, planned
diffs, validation evidence, and fresh-review bundle — is sent to the configured
DeepSeek API. GitHub credentials, npm credentials, Actions runtime credentials,
local private paths, and model reasoning content are not intentionally sent or
published. Do not grant `agent-ready` to an Issue or repository context that
contains material that must not cross this provider boundary.

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

`config.example.json` is a read-only fixture/canary configuration. Its
`packages/maintainer-bot` allowlist is not a production capability boundary.
The production host builds effective edit scope as trusted
`production-policy.json` allowlist intersected with the write-authorized
Issue revision's exact `targetPaths`, minus protected/manual-only paths.

`config.example.json` contains an explicit model-pricing snapshot solely for
cost-limit arithmetic. Operators must refresh those configured rates from the
current provider contract; the engine does not claim they remain current.

## gh-aw contract and actual v1 host

[`config/gh-aw-adapter.example.json`](../packages/maintainer-bot/config/gh-aw-adapter.example.json)
is a repository-owned future custom-engine contract, not an invented gh-aw workflow
schema. It keeps trigger/permission assertions, credential isolation, engine
command, immutable pin policy, host revalidation fields, and prohibited
actions auditable and replaceable. The example deliberately contains
`REQUIRED_IMMUTABLE_COMMIT_SHA`; `ghAwAdapterDefinitionSchema` rejects it until
an operator replaces it with a reviewed 40-character commit SHA.

Activation v1 does not depend on an unverified gh-aw workflow schema. The
runnable path is the repository-owned GitHub Actions workflow plus
`@open-multi-agent/maintainer-host`; the adapter contract remains available for
a later host replacement.

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
fork gh-aw and has not been run end-to-end against a live gh-aw version.

## Status and operations

The Issue's single BOT comment and Actions job summary use these public states:

- `STARTED`: the label delivery is visible and deterministic checks are starting.
- `RUNNING`: fixed revision/base, permission, DoR, scope, duplicate, and setting-attestation checks passed; the isolated engine is running.
- `NEEDS_CLARIFICATION`: the strict Issue template or Definition of Ready is incomplete or conflicting.
- `MANUAL_ONLY`: policy classifies the work as architecture, security, permissions, privacy, license, CI/release, broad API/refactor, uncontrolled dependency, or otherwise human-only.
- `NEEDS_HUMAN`: stale/crashed state, drift, setting, conflicting branch/PR, or safety gate requires intervention.
- `FAILED`: infrastructure or engine failure produced no eligible Draft PR.
- `DRAFT_PR_CREATED`: exactly one open Draft PR exists; human review remains required.

To configure activation without exposing a value:

1. Add or rotate an Actions repository secret named `DEEPSEEK_API_KEY` under
   **Settings → Secrets and variables → Actions**. Never put the value in an
   Issue, workflow, repository file, log, artifact, or comment.
2. Under **Settings → Actions → General → Workflow permissions**, enable the
   repository option allowing GitHub Actions to create pull requests. Do not
   enable or change it as a side effect of a code deployment.
3. After an administrator verifies that setting, add a repository Actions
   variable named `OMA_MAINTAINER_BOT_PR_CREATION_ENABLED` with the exact value
   `true`. The host checks this trusted non-secret attestation before model
   execution and again before writing; a missing, empty, or different value
   fails closed. Remove or change the variable before disabling the setting.
4. Keep the workflow's explicit permissions and branch protections under human
   review. The default workflow permission may remain read-only because this
   workflow declares its required scopes explicitly.

The REST endpoint that reads this repository setting requires repository
`Administration: read`, which workflow `GITHUB_TOKEN` cannot request. v1
therefore does not introduce an administration-capable token merely to inspect
the setting. The operator attestation is the minimum safe pre-model gate; the
actual Draft PR API remains the final capability check. See GitHub's
[Actions permissions API](https://docs.github.com/en/rest/actions/permissions?apiVersion=2022-11-28).

At the implementation audit on 2026-08-11, the repository API reported
`default_workflow_permissions: read` and PR creation disabled. No setting or
secret was changed by implementation work. The explicit workflow permissions
are compatible with the read default, but disabled PR creation is a deliberate
activation blocker until a separately authorized operator step. Secret presence
and the attestation variable were not inspected or configured.

To disable the bot, disable the workflow in GitHub Actions for an immediate
operational stop, or merge a trusted policy change setting `enabled` to
`false`. The latter may still allow the trigger to publish a disabled terminal
status, but never runs the model or writer. For key rotation, replace the
Actions secret, verify no run is active, and revoke the old provider key; runs
never persist the key in state or artifacts.

`GITHUB_TOKEN`-authenticated writes do not recursively trigger most new
workflow runs. Therefore a Draft PR created by v1 should not be assumed to have
automatically started the repository's ordinary `pull_request` CI; the trusted
pre-PR validation registry is mandatory, and maintainers must inspect the PR's
actual checks. This recursion behavior is documented in GitHub's
[`GITHUB_TOKEN` security reference](https://docs.github.com/en/actions/concepts/security/github_token).

## Verification and first live canary

Unit/integration tests use a mocked GitHub client and scripted OMA adapters and
need no key. The synthetic #488-style path proves that
`packages/create-oma-app/tests/runtime.test.ts` becomes an exact one-file scope,
runs both `OMA_MODEL=ambient-model` and unset focused tests, and receives the
trusted create-oma-app lint/test/template checks. Default tests make no GitHub
write and no live provider call.

A first live canary is a separate, explicitly authorized operation:

1. Confirm Issue #488 is open and `agent-ready` is absent; inspect its material
   revision rather than reusing an old authorization.
2. Configure/verify the DeepSeek secret, repository PR-creation setting, and
   exact attestation variable.
3. Verify the workflow exists on `main`, its action/runtime pins and production
   policy are reviewed, and no conflicting BOT branch/PR/run exists.
4. Reapply `agent-ready` once with a write/maintain/admin actor and observe
   STARTED/RUNNING plus run URL, ID, revision, and base SHA.
5. Verify only `packages/create-oma-app/tests/runtime.test.ts` changed, every
   registered validation passed without truncation, and exactly one Draft PR
   was created and linked.
6. Repeating the same authorization must reuse the terminal runKey/PR and must
   not create a second branch, push, or PR.
7. Confirm no Ready, approval, merge, close, release, publish, tag, or deploy
   action occurred.

Do not perform these steps during ordinary local implementation or testing.
