# OMA Maintainer Host

This private workspace is the deterministic GitHub Actions activation and
Draft PR writer for `@open-multi-agent/maintainer-bot`. The OMA engine remains
credential-free with respect to GitHub and npm; this host launches it in a
separate allowlisted environment and obtains the GitHub token only in distinct
prepare/finalize processes.

The GitHub-native activation entry point is
[`.github/workflows/maintainer-bot.yml`](../../.github/workflows/maintainer-bot.yml).
It handles only an exact `issues.labeled` / `agent-ready` event, checks out the
fixed default-branch SHA without persisted credentials, runs the OMA engine in
a secret-minimized child, and invokes the writer only after final safe-output
revalidation. The host never marks a PR ready, approves, merges, closes,
releases, publishes, tags, or deploys.

Eligible production runs also require the trusted repository variable
`OMA_MAINTAINER_BOT_PR_CREATION_ENABLED=true`, set only after an administrator
verifies the corresponding Actions repository setting. The variable is an
attestation, not a credential; absence stops before model execution.

The production policy is
[`config/production-policy.json`](config/production-policy.json). It is not an
Issue-controlled config and is separate from the maintainer-bot fixture
configuration. Operational behavior and activation steps are documented in
[`docs/maintainer-bot.md`](../../docs/maintainer-bot.md).

All host tests use a fake GitHub implementation and scripted OMA adapter. They
perform no network write and require neither `GITHUB_TOKEN` nor
`DEEPSEEK_API_KEY`.

```bash
npm run lint -w @open-multi-agent/maintainer-host
npm run test -w @open-multi-agent/maintainer-host
npm run build -w @open-multi-agent/maintainer-host
```
