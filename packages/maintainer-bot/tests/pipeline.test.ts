import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import type {
  LLMAdapter,
  LLMChatOptions,
  LLMMessage,
  LLMResponse,
  LLMStreamOptions,
  StreamEvent,
} from '@open-multi-agent/core'
import { computeIssueRevision } from '../src/admission.js'
import { sha256 } from '../src/hash.js'
import { runMaintainerBot } from '../src/pipeline.js'
import { controlPlaneRequestSchema } from '../src/schema.js'
import { FileRunStateStore } from '../src/state.js'
import { authorizedRequest, BASE_SHA, ScriptedCommandRunner, testConfig } from './helpers.js'

const ORIGINAL = 'export const greeting = "."\n'
const FIXED = 'export const greeting = "!"\n'
const HELPER_ORIGINAL = 'export const helper = "."\n'

async function fixtureRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'oma-maintainer-pipeline-repo-'))
  await mkdir(join(root, '.github'), { recursive: true })
  await mkdir(join(root, 'packages/demo/src'), { recursive: true })
  await mkdir(join(root, 'packages/demo/tests'), { recursive: true })
  await writeFile(join(root, 'AGENTS.md'), '# Fixture policy\n')
  await writeFile(join(root, '.github/CONTRIBUTING.md'), '# Contributing\n')
  await writeFile(join(root, 'package.json'), JSON.stringify({ private: true, workspaces: ['packages/*'] }))
  await writeFile(join(root, 'packages/demo/package.json'), JSON.stringify({ name: '@fixture/demo' }))
  await writeFile(join(root, 'packages/demo/tsconfig.json'), '{}\n')
  await writeFile(join(root, 'packages/demo/src/greeting.ts'), ORIGINAL)
  await writeFile(join(root, 'packages/demo/src/helper.ts'), HELPER_ORIGINAL)
  await writeFile(join(root, 'packages/demo/tests/greeting.test.ts'), 'export const covered = true\n')
  return root
}

function repositoryRunner(
  root: string,
  validationExitCode = 0,
  validationMutation?: string,
): ScriptedCommandRunner {
  return new ScriptedCommandRunner(async (command, args) => {
    if (command === 'git' && args[0] === 'rev-parse') return { stdout: `${BASE_SHA}\n`, stderr: '', exitCode: 0 }
    if (command === 'git' && args[0] === 'log') return { stdout: `${BASE_SHA}\t2026-08-10T00:00:00Z\tfixture\n`, stderr: '', exitCode: 0 }
    if (command === 'git' && args[0] === 'status') {
      const content = await readFile(join(root, 'packages/demo/src/greeting.ts'), 'utf8')
      return { stdout: content === ORIGINAL ? '' : ' M packages/demo/src/greeting.ts\n', stderr: '', exitCode: 0 }
    }
    if (command === 'git' && args[0] === 'diff') {
      const current = await readFile(join(root, 'packages/demo/src/greeting.ts'), 'utf8')
      return {
        stdout: `diff --git a/packages/demo/src/greeting.ts b/packages/demo/src/greeting.ts\n-${ORIGINAL.trimEnd()}\n${current.trimEnd().split('\n').map(line => `+${line}`).join('\n')}\n`,
        stderr: '',
        exitCode: 0,
      }
    }
    if (command === 'npm') {
      if (validationMutation !== undefined) {
        await writeFile(join(root, 'packages/demo/src/greeting.ts'), validationMutation)
      }
      return {
        stdout: validationExitCode === 0 ? '1 test passed\n' : '',
        stderr: validationExitCode === 0 ? '' : '1 test failed\n',
        exitCode: validationExitCode,
      }
    }
    throw new Error(`unexpected command: ${command} ${args.join(' ')}`)
  })
}

describe('maintainer-bot vertical pipeline', () => {
  it('refuses the actual model environment when it contains a host-prefixed GitHub credential', async () => {
    const repoRoot = await fixtureRepo()
    const adapter = new PipelineAdapter('approve')
    await expect(runMaintainerBot({
      repoRoot,
      artifactDir: await mkdtemp(join(tmpdir(), 'oma-artifacts-')),
      request: authorizedRequest(),
      config: testConfig(),
      runner: repositoryRunner(repoRoot),
      stateStore: new FileRunStateStore(await mkdtemp(join(tmpdir(), 'oma-state-'))),
      runId: 'run-credential-isolation',
      adapter,
      env: {
        PATH: '/usr/bin',
        CODEX_GITHUB_PERSONAL_ACCESS_TOKEN: 'must-not-leak',
      },
      requireEvidenceToolCalls: false,
    })).rejects.toThrow(/CODEX_GITHUB_PERSONAL_ACCESS_TOKEN/)
    expect(adapter.roles).toEqual([])
    expect(await readFile(join(repoRoot, 'packages/demo/src/greeting.ts'), 'utf8')).toBe(ORIGINAL)
  })

  it('produces only a local Draft PR proposal after admission, edit, validation, and fresh review', async () => {
    const repoRoot = await fixtureRepo()
    const stateDir = await mkdtemp(join(tmpdir(), 'oma-maintainer-pipeline-state-'))
    const artifactDir = await mkdtemp(join(tmpdir(), 'oma-maintainer-pipeline-artifacts-'))
    const adapter = new PipelineAdapter('approve')
    const result = await runMaintainerBot({
      repoRoot,
      artifactDir,
      request: authorizedRequest(),
      config: testConfig(),
      runner: repositoryRunner(repoRoot),
      stateStore: new FileRunStateStore(stateDir),
      runId: 'run-success',
      adapter,
      env: { PATH: '/usr/bin' },
      requireEvidenceToolCalls: false,
      now: () => new Date('2026-08-10T03:00:00.000Z'),
    })
    expect(result.status).toBe('DRAFT_PR_PROPOSAL_READY')
    if (result.status !== 'DRAFT_PR_PROPOSAL_READY') throw new Error('expected proposal')
    expect(result.proposal).toMatchObject({ kind: 'draft_pr', eligibleForHostWrite: true })
    expect(result.record.status).toBe('DRAFT_PR_PROPOSAL_READY')
    expect(result.reviewBundle.diff).toContain('+export const greeting = "!"')
    expect(await readFile(join(repoRoot, 'packages/demo/src/greeting.ts'), 'utf8')).toBe(FIXED)
    expect(adapter.roles).toEqual(['triage', 'planner', 'implementer', 'reviewer'])
    expect(result.proposal.validationResults.every(validation => validation.success)).toBe(true)
  })

  it('does not call a model or modify files without agent-ready authorization', async () => {
    const repoRoot = await fixtureRepo()
    const adapter = new PipelineAdapter('approve')
    const result = await runMaintainerBot({
      repoRoot,
      artifactDir: await mkdtemp(join(tmpdir(), 'oma-artifacts-')),
      request: authorizedRequest({}, { authorization: null }),
      config: testConfig(),
      runner: repositoryRunner(repoRoot),
      stateStore: new FileRunStateStore(await mkdtemp(join(tmpdir(), 'oma-state-'))),
      runId: 'run-no-auth',
      adapter,
      env: { PATH: '/usr/bin' },
    })
    expect(result.status).toBe('READY_CANDIDATE')
    expect(adapter.roles).toEqual([])
    expect(await readFile(join(repoRoot, 'packages/demo/src/greeting.ts'), 'utf8')).toBe(ORIGINAL)
  })

  it('records bounded schema-validated triage reasons without editing files', async () => {
    const repoRoot = await fixtureRepo()
    const adapter = new PipelineAdapter('approve', 'packages/demo/src/greeting.ts', {
      uncertainties: ['The target behavior conflicts with one acceptance criterion.'],
      manualRiskSignals: ['The request appears to require a public API decision.'],
    })
    const result = await runMaintainerBot({
      repoRoot,
      artifactDir: await mkdtemp(join(tmpdir(), 'oma-artifacts-')),
      request: authorizedRequest(),
      config: testConfig(),
      runner: repositoryRunner(repoRoot),
      stateStore: new FileRunStateStore(await mkdtemp(join(tmpdir(), 'oma-state-'))),
      runId: 'run-triage-block',
      adapter,
      env: { PATH: '/usr/bin' },
      requireEvidenceToolCalls: false,
    })
    expect(result.status).toBe('NEEDS_HUMAN')
    expect(result.detail).toContain('uncertainty=The target behavior conflicts')
    expect(result.detail).toContain('manual-risk=The request appears')
    expect(adapter.roles).toEqual(['triage'])
    expect(await readFile(join(repoRoot, 'packages/demo/src/greeting.ts'), 'utf8')).toBe(ORIGINAL)
  })

  it('invalidates an edited issue before context or model execution', async () => {
    const repoRoot = await fixtureRepo()
    const original = authorizedRequest()
    const editedIssue = { ...original.issue, title: 'Edited after authorization', updatedAt: '2026-08-10T04:00:00Z' }
    expect(computeIssueRevision(editedIssue)).not.toBe(original.authorization?.issueRevision)
    const request = controlPlaneRequestSchema.parse({ ...original, issue: editedIssue })
    const adapter = new PipelineAdapter('approve')
    const result = await runMaintainerBot({
      repoRoot,
      artifactDir: await mkdtemp(join(tmpdir(), 'oma-artifacts-')),
      request,
      config: testConfig(),
      runner: repositoryRunner(repoRoot),
      stateStore: new FileRunStateStore(await mkdtemp(join(tmpdir(), 'oma-state-'))),
      runId: 'run-stale',
      adapter,
      env: { PATH: '/usr/bin' },
    })
    expect(result.status).toBe('BLOCKED')
    expect(adapter.roles).toEqual([])
  })

  it('routes failed validation and reviewer rejection to NEEDS_HUMAN without a proposal', async () => {
    const repoRoot = await fixtureRepo()
    const result = await runMaintainerBot({
      repoRoot,
      artifactDir: await mkdtemp(join(tmpdir(), 'oma-artifacts-')),
      request: authorizedRequest(),
      config: testConfig(),
      runner: repositoryRunner(repoRoot, 1),
      stateStore: new FileRunStateStore(await mkdtemp(join(tmpdir(), 'oma-state-'))),
      runId: 'run-failed-validation',
      adapter: new PipelineAdapter('reject'),
      env: { PATH: '/usr/bin' },
      requireEvidenceToolCalls: false,
    })
    expect(result.status).toBe('NEEDS_HUMAN')
    expect(result).not.toHaveProperty('proposal')
    expect(result.detail).toMatch(/Validation failed/)
  })

  it('does not produce an eligible proposal when validation changes a reviewed file', async () => {
    const repoRoot = await fixtureRepo()
    const result = await runMaintainerBot({
      repoRoot,
      artifactDir: await mkdtemp(join(tmpdir(), 'oma-artifacts-')),
      request: authorizedRequest(),
      config: testConfig(),
      runner: repositoryRunner(repoRoot, 0, 'export const greeting = "validation-drift"\n'),
      stateStore: new FileRunStateStore(await mkdtemp(join(tmpdir(), 'oma-state-'))),
      runId: 'run-validation-mutated-file',
      adapter: new PipelineAdapter('approve'),
      env: { PATH: '/usr/bin' },
      requireEvidenceToolCalls: false,
    })
    expect(result.status).toBe('FAILED')
    expect(result).not.toHaveProperty('proposal')
    expect(result.detail).toMatch(/afterHash differs from the fresh review snapshot/)
  })

  it('rejects a model plan that widens beyond the maintainer-approved target file', async () => {
    const repoRoot = await fixtureRepo()
    const result = await runMaintainerBot({
      repoRoot,
      artifactDir: await mkdtemp(join(tmpdir(), 'oma-artifacts-')),
      request: authorizedRequest(),
      config: testConfig({ allowedPaths: ['packages/demo'] }),
      runner: repositoryRunner(repoRoot),
      stateStore: new FileRunStateStore(await mkdtemp(join(tmpdir(), 'oma-state-'))),
      runId: 'run-scope-widening',
      adapter: new PipelineAdapter('approve', 'packages/demo/src/helper.ts'),
      env: { PATH: '/usr/bin' },
      requireEvidenceToolCalls: false,
    })
    expect(result.status).toBe('NEEDS_HUMAN')
    expect(result.detail).toMatch(/maintainer-approved issue scope/)
    expect(await readFile(join(repoRoot, 'packages/demo/src/helper.ts'), 'utf8')).toBe(HELPER_ORIGINAL)
    expect(await readFile(join(repoRoot, 'packages/demo/src/greeting.ts'), 'utf8')).toBe(ORIGINAL)
  })

  it('deduplicates a revision before a second model mutation', async () => {
    const repoRoot = await fixtureRepo()
    const stateDir = await mkdtemp(join(tmpdir(), 'oma-state-'))
    const store = new FileRunStateStore(stateDir)
    const request = authorizedRequest()
    const firstAdapter = new PipelineAdapter('approve')
    const common = {
      repoRoot,
      artifactDir: await mkdtemp(join(tmpdir(), 'oma-artifacts-')),
      request,
      config: testConfig(),
      runner: repositoryRunner(repoRoot),
      stateStore: store,
      env: { PATH: '/usr/bin' },
      requireEvidenceToolCalls: false,
    }
    const first = await runMaintainerBot({ ...common, runId: 'run-first', adapter: firstAdapter })
    expect(first.status).toBe('DRAFT_PR_PROPOSAL_READY')
    const secondAdapter = new PipelineAdapter('approve')
    const second = await runMaintainerBot({ ...common, runId: 'run-second', adapter: secondAdapter })
    expect(second).toMatchObject({ duplicate: true, status: 'DRAFT_PR_PROPOSAL_READY' })
    expect(secondAdapter.roles).toEqual([])
  })

  it('repairs with the currentHash read from the fresh review bundle', async () => {
    const repoRoot = await fixtureRepo()
    const adapter = new ToolReadingRepairAdapter()
    const result = await runMaintainerBot({
      repoRoot,
      artifactDir: await mkdtemp(join(tmpdir(), 'oma-artifacts-')),
      request: authorizedRequest(),
      config: testConfig(),
      runner: repositoryRunner(repoRoot),
      stateStore: new FileRunStateStore(await mkdtemp(join(tmpdir(), 'oma-state-'))),
      runId: 'run-repair-current-hash',
      adapter,
      env: { PATH: '/usr/bin' },
    })
    expect(result.status).toBe('DRAFT_PR_PROPOSAL_READY')
    expect(adapter.repairExpectedHash).toBe(sha256(FIXED))
    expect(await readFile(join(repoRoot, 'packages/demo/src/greeting.ts'), 'utf8'))
      .toBe(`// reviewer-requested repair\n${FIXED}`)
  })
})

class PipelineAdapter implements LLMAdapter {
  readonly name = 'pipeline-adapter'
  readonly roles: string[] = []
  private sequence = 0

  constructor(
    private readonly reviewVerdict: 'approve' | 'reject',
    private readonly editPath = 'packages/demo/src/greeting.ts',
    private readonly triageBlock?: {
      readonly uncertainties: string[]
      readonly manualRiskSignals: string[]
    },
  ) {}

  async chat(_messages: LLMMessage[], options: LLMChatOptions): Promise<LLMResponse> {
    const role = roleFor(options.systemPrompt ?? '')
    this.roles.push(role)
    this.sequence += 1
    return {
      id: `pipeline-${this.sequence}`,
      content: [{ type: 'text', text: JSON.stringify(this.response(role)) }],
      model: options.model,
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 5 },
    }
  }

  async *stream(messages: LLMMessage[], options: LLMStreamOptions): AsyncIterable<StreamEvent> {
    yield { type: 'done', data: await this.chat(messages, options) }
  }

  private response(role: string): unknown {
    const issue = authorizedRequest().issue
    if (role === 'triage') return {
      verdict: this.triageBlock === undefined ? 'proceed' : 'needs_human',
      confirmedIssueRevision: authorizedRequest().authorization!.issueRevision,
      confirmedAcceptanceCriteria: issue.acceptanceCriteria,
      uncertainties: this.triageBlock?.uncertainties ?? [],
      manualRiskSignals: this.triageBlock?.manualRiskSignals ?? [],
    }
    if (role === 'planner') return {
      summary: 'Fix the bounded greeting implementation.', acceptanceCriteria: issue.acceptanceCriteria,
      files: [{ path: this.editPath, reason: 'The incorrect output is implemented here.' }],
      validationCommandIds: ['fixture-test'], risks: [], unresolvedQuestions: [],
    }
    if (role === 'implementer') return {
      summary: 'Fix deterministic greeting punctuation.', risks: [], assumptions: [],
      edits: [{
        path: this.editPath,
        expectedHash: sha256(this.editPath.endsWith('helper.ts') ? HELPER_ORIGINAL : ORIGINAL),
        content: this.editPath.endsWith('helper.ts') ? 'export const helper = "!"\n' : FIXED,
        reason: 'Return the accepted exclamation mark.',
      }],
    }
    if (role === 'reviewer' && this.reviewVerdict === 'approve') return {
      verdict: 'approve', repairable: false, issues: [],
      acceptanceResults: issue.acceptanceCriteria.map(criterion => ({
        criterion, status: 'pass', evidence: 'Final diff and deterministic validation prove the criterion.',
      })),
      rationale: ['The bounded final diff satisfies the issue.'],
    }
    return {
      verdict: 'reject', repairable: false, issues: ['Deterministic validation failed.'],
      acceptanceResults: issue.acceptanceCriteria.map(criterion => ({
        criterion, status: 'unknown', evidence: 'The failed validation prevents confirmation.',
      })),
      rationale: ['A human must inspect the failed command.'],
    }
  }
}

function roleFor(prompt: string): string {
  if (prompt.includes('read-only issue triage verifier')) return 'triage'
  if (prompt.includes('read-only repository planner')) return 'planner'
  if (prompt.includes('You are the implementer')) return 'implementer'
  if (prompt.includes('independent fresh-context reviewer')) return 'reviewer'
  if (prompt.includes('repair implementer round')) return 'repair'
  throw new Error(`unknown role: ${prompt.slice(0, 100)}`)
}

class ToolReadingRepairAdapter implements LLMAdapter {
  readonly name = 'tool-reading-repair-adapter'
  repairExpectedHash: string | undefined
  private sequence = 0
  private reviewRound = 0

  async chat(messages: LLMMessage[], options: LLMChatOptions): Promise<LLMResponse> {
    const role = roleFor(options.systemPrompt ?? '')
    this.sequence += 1
    const toolName = role === 'reviewer' || role === 'repair'
      ? 'read_final_review_bundle'
      : 'read_context_manifest'
    if (!JSON.stringify(messages).includes('tool_result')) {
      return {
        id: `tool-${this.sequence}`,
        content: [{ type: 'tool_use', id: `call-${this.sequence}`, name: toolName, input: {} }],
        model: options.model,
        stop_reason: 'tool_use',
        usage: { input_tokens: 2, output_tokens: 1 },
      }
    }

    const issue = authorizedRequest().issue
    let output: unknown
    if (role === 'triage') {
      output = {
        verdict: 'proceed',
        confirmedIssueRevision: authorizedRequest().authorization!.issueRevision,
        confirmedAcceptanceCriteria: issue.acceptanceCriteria,
        uncertainties: [], manualRiskSignals: [],
      }
    } else if (role === 'planner') {
      output = {
        summary: 'Fix the greeting and validate the reviewer-requested repair.',
        acceptanceCriteria: issue.acceptanceCriteria,
        files: [{ path: 'packages/demo/src/greeting.ts', reason: 'The bounded defect and repair are localized here.' }],
        validationCommandIds: ['fixture-test'], risks: [], unresolvedQuestions: [],
      }
    } else if (role === 'implementer') {
      output = {
        summary: 'Apply the initial punctuation fix.', risks: [], assumptions: [],
        edits: [{
          path: 'packages/demo/src/greeting.ts', expectedHash: sha256(ORIGINAL), content: FIXED,
          reason: 'Correct the punctuation.',
        }],
      }
    } else if (role === 'repair') {
      const snapshot = findReviewBundle(messages).currentFiles.find(
        file => file.path === 'packages/demo/src/greeting.ts',
      )
      if (snapshot === undefined) throw new Error('repair adapter did not receive current file snapshot')
      this.repairExpectedHash = snapshot.contentHash
      output = {
        summary: 'Apply the bounded reviewer-requested repair.', risks: [], assumptions: [],
        edits: [{
          path: snapshot.path,
          expectedHash: snapshot.contentHash,
          content: `// reviewer-requested repair\n${snapshot.content}`,
          reason: 'Address the concrete fresh-review issue.',
        }],
      }
    } else {
      this.reviewRound += 1
      output = this.reviewRound === 1
        ? {
            verdict: 'reject', repairable: true,
            issues: ['Add the bounded reviewer-requested source comment.'],
            acceptanceResults: issue.acceptanceCriteria.map(criterion => ({
              criterion, status: 'fail', evidence: 'The first diff needs one bounded repair.',
            })),
            rationale: ['One in-scope source edit can resolve the review issue.'],
          }
        : {
            verdict: 'approve', repairable: false, issues: [],
            acceptanceResults: issue.acceptanceCriteria.map(criterion => ({
              criterion, status: 'pass', evidence: 'The repaired diff and validation evidence satisfy the criterion.',
            })),
            rationale: ['The repaired diff is bounded and fully validated.'],
          }
    }
    return {
      id: `final-${this.sequence}`,
      content: [{ type: 'text', text: JSON.stringify(output) }],
      model: options.model,
      stop_reason: 'end_turn',
      usage: { input_tokens: 4, output_tokens: 2 },
    }
  }

  async *stream(messages: LLMMessage[], options: LLMStreamOptions): AsyncIterable<StreamEvent> {
    yield { type: 'done', data: await this.chat(messages, options) }
  }
}

function findReviewBundle(messages: LLMMessage[]): {
  currentFiles: Array<{ path: string; contentHash: string; content: string }>
} {
  const found = findObject(messages, value => Array.isArray(value['currentFiles']))
  if (found === undefined) throw new Error('review bundle was not present in tool result messages')
  return found as { currentFiles: Array<{ path: string; contentHash: string; content: string }> }
}

function findObject(
  value: unknown,
  predicate: (value: Record<string, unknown>) => boolean,
): Record<string, unknown> | undefined {
  if (typeof value === 'string') {
    try {
      return findObject(JSON.parse(value), predicate)
    } catch {
      return undefined
    }
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findObject(item, predicate)
      if (found !== undefined) return found
    }
    return undefined
  }
  if (value === null || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  if (predicate(record)) return record
  for (const item of Object.values(record)) {
    const found = findObject(item, predicate)
    if (found !== undefined) return found
  }
  return undefined
}
