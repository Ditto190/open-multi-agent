# OMA Maintainer Bot

This private workspace is an evidence-first `agent-ready` Issue → Draft PR
**proposal** bot for this repository. It dogfoods `OpenMultiAgent.runTasks()`
with DeepSeek V4 Flash, but it is deliberately not a general coding agent and
contains no GitHub writer.

The behavior, operations, and threat boundary are documented in
[`docs/maintainer-bot.md`](../../docs/maintainer-bot.md).

## Read-only fixture

From a clean isolated worktree after building the workspace:

```bash
npm run build -w @open-multi-agent/maintainer-bot
node packages/maintainer-bot/dist/cli.js dry-run \
  --request packages/maintainer-bot/fixtures/ready-doc-issue.json \
  --config packages/maintainer-bot/config/config.example.json
```

The fixture resolves `$HEAD` and `$ISSUE_REVISION` locally, evaluates the
admission gate, and builds the versioned context manifest. It performs no model
call, state write, repository edit, validation command, or GitHub action.

## Tests

```bash
npm run lint -w @open-multi-agent/maintainer-bot
npm run test -w @open-multi-agent/maintainer-bot
npm run build -w @open-multi-agent/maintainer-bot
```

Unit and integration tests use scripted adapters and require no API key.
