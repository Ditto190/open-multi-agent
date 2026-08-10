import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { evaluateAdmission } from '../src/admission.js'
import { buildContextManifest } from '../src/context.js'
import { hashJson, sha256 } from '../src/hash.js'
import { authorizedRequest, BASE_SHA, ScriptedCommandRunner, testConfig } from './helpers.js'

async function contextRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'oma-maintainer-context-'))
  await mkdir(join(root, '.github'), { recursive: true })
  await mkdir(join(root, 'docs'), { recursive: true })
  await mkdir(join(root, 'packages/demo/src'), { recursive: true })
  await mkdir(join(root, 'packages/demo/tests'), { recursive: true })
  await writeFile(join(root, 'AGENTS.md'), '# Root policy\n')
  await writeFile(join(root, '.github/CONTRIBUTING.md'), '# Contributing\n')
  await writeFile(join(root, 'package.json'), JSON.stringify({
    name: 'fixture-root',
    private: true,
    workspaces: ['packages/*'],
  }))
  await writeFile(join(root, 'packages/demo/AGENTS.md'), '# Demo policy\n')
  await writeFile(join(root, 'packages/demo/package.json'), JSON.stringify({ name: '@fixture/demo' }))
  await writeFile(join(root, 'packages/demo/tsconfig.json'), '{}\n')
  await writeFile(join(root, 'packages/demo/README.md'), '# Greeting fixture\n')
  await writeFile(join(root, 'packages/demo/src/helper.ts'), 'export const punctuation = "!"\n')
  await writeFile(
    join(root, 'packages/demo/src/greeting.ts'),
    'import { punctuation } from "./helper.js"\nexport const greeting = `Hello${punctuation}`\n',
  )
  await writeFile(join(root, 'packages/demo/tests/greeting.test.ts'), 'import { greeting } from "../src/greeting.js"\n')
  await writeFile(join(root, 'docs/greeting.md'), '# Greeting output\nThe greeting uses punctuation.\n')
  return root
}

function contextRunner(options: { head?: string; status?: string } = {}): ScriptedCommandRunner {
  return new ScriptedCommandRunner((_command, args) => {
    if (args[0] === 'rev-parse') return { stdout: `${options.head ?? BASE_SHA}\n`, stderr: '', exitCode: 0 }
    if (args[0] === 'status') return { stdout: options.status ?? '', stderr: '', exitCode: 0 }
    if (args[0] === 'log') {
      return { stdout: `${BASE_SHA}\t2026-08-10T00:00:00Z\tfix greeting\n`, stderr: '', exitCode: 0 }
    }
    throw new Error(`unexpected command: ${args.join(' ')}`)
  })
}

describe('versioned repository context manifest', () => {
  it('captures policy chain, workspace evidence, imports, history, hashes, and trust', async () => {
    const repoRoot = await contextRepo()
    const request = authorizedRequest()
    const admission = evaluateAdmission(request)
    const manifest = await buildContextManifest({
      repoRoot,
      request,
      admission,
      config: testConfig(),
      runner: contextRunner(),
      now: () => new Date('2026-08-10T01:00:00.000Z'),
    })
    expect(manifest.sufficiency).toMatchObject({ sufficient: true, errors: [] })
    expect(manifest.approvedEditScopes).toEqual([
      { path: 'packages/demo/src/greeting.ts', kind: 'file' },
    ])
    expect(manifest.sources.map(source => source.locator)).toEqual(expect.arrayContaining([
      'AGENTS.md',
      'packages/demo/AGENTS.md',
      '.github/CONTRIBUTING.md',
      'packages/demo/package.json',
      'packages/demo/src/greeting.ts',
      'packages/demo/tests/greeting.test.ts',
    ]))
    expect(manifest.retrieval.importRelations).toContainEqual({
      from: 'packages/demo/src/greeting.ts',
      to: 'packages/demo/src/helper.ts',
    })
    const workspaceMap = manifest.sources.find(item => item.id === 'workspace-map')!
    expect(JSON.parse(workspaceMap.content)).toMatchObject({
      rootPackage: { name: 'fixture-root', path: '.' },
      rootWorkspaces: ['packages/*'],
    })
    const source = manifest.sources.find(item => item.locator === 'packages/demo/src/greeting.ts')!
    expect(source.trust).toBe('untrusted-evidence')
    expect(source.contentHash).toBe(sha256(source.content))
    expect(manifest.sources.find(item => item.locator === 'packages/demo/AGENTS.md')?.trust)
      .toBe('repository-policy')
    const { manifestHash, ...withoutHash } = manifest
    expect(manifestHash).toBe(hashJson(withoutHash))
  })

  it('fails closed when HEAD moves or the isolated worktree is dirty', async () => {
    const repoRoot = await contextRepo()
    const request = authorizedRequest()
    const manifest = await buildContextManifest({
      repoRoot,
      request,
      admission: evaluateAdmission(request),
      config: testConfig(),
      runner: contextRunner({ head: 'b'.repeat(40), status: ' M packages/demo/src/greeting.ts\n' }),
    })
    expect(manifest.sufficiency.sufficient).toBe(false)
    expect(manifest.sufficiency.errors.join(' ')).toMatch(/does not match fixed base SHA/)
    expect(manifest.sufficiency.errors.join(' ')).toMatch(/not clean/)
  })

  it('fails closed when the issue targets a protected path', async () => {
    const repoRoot = await contextRepo()
    await mkdir(join(repoRoot, '.github/workflows'), { recursive: true })
    await writeFile(join(repoRoot, '.github/workflows/ci.yml'), 'name: CI\n')
    const request = authorizedRequest({
      targetWorkspaces: ['repository'],
      targetPaths: ['.github/workflows/ci.yml'],
    })
    const manifest = await buildContextManifest({
      repoRoot,
      request,
      admission: evaluateAdmission(request),
      config: testConfig({ allowedPaths: ['.github'] }),
      runner: contextRunner(),
    })
    expect(manifest.sufficiency.sufficient).toBe(false)
    expect(manifest.sufficiency.errors.join(' ')).toMatch(/protected/)
  })

  it('fails closed rather than omitting required context under a tight limit', async () => {
    const repoRoot = await contextRepo()
    const request = authorizedRequest({ targetPaths: ['packages/demo/src'] })
    const manifest = await buildContextManifest({
      repoRoot,
      request,
      admission: evaluateAdmission(request),
      config: testConfig({ context: {
        maxFiles: 2,
        maxBytes: 500_000,
        maxBytesPerFile: 100_000,
        maxHistoryEntries: 5,
      } }),
      runner: contextRunner(),
    })
    expect(manifest.sufficiency.sufficient).toBe(false)
    expect(manifest.sufficiency.errors.join(' ')).toMatch(/Required target or policy files exceed/)
  })

  it('fails closed on unresolved conflict markers in required context', async () => {
    const repoRoot = await contextRepo()
    await writeFile(
      join(repoRoot, 'packages/demo/src/greeting.ts'),
      '<<<<<<< ours\nexport const greeting = "!"\n=======\nexport const greeting = "."\n>>>>>>> theirs\n',
    )
    const request = authorizedRequest()
    const manifest = await buildContextManifest({
      repoRoot,
      request,
      admission: evaluateAdmission(request),
      config: testConfig(),
      runner: contextRunner(),
    })
    expect(manifest.sufficiency.sufficient).toBe(false)
    expect(manifest.sufficiency.errors.join(' ')).toMatch(/unresolved conflict markers/)
  })
})
