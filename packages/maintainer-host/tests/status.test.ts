import { describe, expect, it } from 'vitest'
import {
  decideClaim,
  findTrustedStatusComment,
  mergeStatusMetadata,
  parseStatusComment,
  renderStatusComment,
} from '../src/status.js'
import { sanitizePublicLine } from '../src/public-output.js'
import { botComment, REPOSITORY } from './helpers.js'

function metadata(overrides: Record<string, unknown> = {}) {
  return {
    version: 1 as const,
    repository: REPOSITORY,
    issueNumber: 488,
    status: 'RUNNING' as const,
    claimId: '100.1',
    actionsRunId: 100,
    runUrl: 'https://github.com/open-multi-agent/open-multi-agent/actions/runs/100',
    baseSha: 'a'.repeat(40),
    issueRevision: 'b'.repeat(64),
    runKey: 'c'.repeat(64),
    branch: 'agent/issue-488-bbbbbbbbbbbb',
    pullRequestUrl: null,
    updatedAt: '2026-08-10T17:43:00Z',
    ...overrides,
  }
}

describe('single trusted BOT status comment', () => {
  it('round-trips machine metadata and ignores a user-forged marker', () => {
    const body = renderStatusComment(metadata(), 'Running deterministic checks.')
    expect(parseStatusComment(body)).toMatchObject({ status: 'RUNNING', runKey: 'c'.repeat(64) })
    const forged = { ...botComment(1, body), user: { id: 99, login: 'attacker', type: 'User' } }
    const trusted = botComment(2, body)
    expect(findTrustedStatusComment([forged, trusted], REPOSITORY, 488)?.comment.id).toBe(2)
  })

  it('rejects duplicate trusted comments and marker injection', () => {
    const body = renderStatusComment(metadata(), 'Safe detail.')
    expect(() => findTrustedStatusComment([botComment(1, body), botComment(2, body)], REPOSITORY, 488))
      .toThrow(/More than one trusted/)
    expect(sanitizePublicLine('secret=abc /Users/jack/private <!-- marker -->')).not.toContain('/Users/jack')
    expect(sanitizePublicLine('secret=abc /Users/jack/private <!-- marker -->')).not.toContain('<!--')
    const mismatched = renderStatusComment(metadata({ repository: 'other/repository' }), 'Wrong Issue.')
    expect(() => findTrustedStatusComment([botComment(3, mismatched)], REPOSITORY, 488))
      .toThrow(/different repository or Issue/)
  })

  it('handles claimed, concurrent, duplicate, stale, and fresh-revision reruns deterministically', () => {
    expect(decideClaim({ existing: null, candidate: metadata(), existingRunActive: false }).kind).toBe('claimed')
    expect(decideClaim({
      existing: metadata({ claimId: '99.1', actionsRunId: 99 }),
      candidate: metadata(),
      existingRunActive: true,
    }).kind).toBe('concurrent')
    expect(decideClaim({
      existing: metadata({ claimId: '99.1', actionsRunId: 99 }),
      candidate: metadata(),
      existingRunActive: false,
    }).kind).toBe('stale-needs-human')
    expect(decideClaim({
      existing: metadata({ status: 'DRAFT_PR_CREATED', claimId: '99.1', actionsRunId: 99 }),
      candidate: metadata(),
      existingRunActive: false,
    }).kind).toBe('duplicate')
    expect(decideClaim({
      existing: metadata({ status: 'NEEDS_HUMAN', runKey: 'd'.repeat(64), claimId: '99.1', actionsRunId: 99 }),
      candidate: metadata(),
      existingRunActive: false,
    }).kind).toBe('claimed')
  })

  it('retains terminal run keys when a later candidate becomes the visible status', () => {
    const first = metadata({ status: 'DRAFT_PR_CREATED', claimId: '99.1', actionsRunId: 99 })
    const later = metadata({
      status: 'RUNNING',
      claimId: '100.1',
      actionsRunId: 100,
      issueRevision: 'd'.repeat(64),
      runKey: 'e'.repeat(64),
    })
    const merged = mergeStatusMetadata(first, later)
    expect(merged.claims).toHaveLength(2)
    expect(decideClaim({
      existing: merged,
      candidate: metadata({ claimId: '101.1', actionsRunId: 101 }),
      existingRunActive: false,
    }).kind).toBe('duplicate')
  })
})
