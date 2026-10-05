import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, test } from 'node:test'
import * as prettier from 'prettier'
import penere from '../src/index.js'

const fixturesDir = path.join(import.meta.dirname, 'fixtures')

// Fixtures whose mods are ported. The others are skipped until they are.
const ported = new Set([
  'array',
  'jsx-attributes',
  'module-specifiers',
  'type-parameters',
  'union-type',
  'assignment',
  'binaryish',
  'call-arguments',
  'function-parameters',
  'heritage',
  'mapped-type',
  'member-chain',
  'object',
  'template-literal',
  'template-literal-ts',
  'ternary'
])

// `wrap: 'collapse'` turns every Penere behavior off.
const stockOptions = { wrap: 'collapse' }

// Fixtures that flow can't parse (top-level await).
const noFlow = new Set(['assignment', 'binaryish'])

const fixtures = fs.readdirSync(fixturesDir).map(name => {
  const dir = path.join(fixturesDir, name)
  const files = fs.readdirSync(dir)
  const read = prefix =>
    fs.readFileSync(
      path.join(
        dir,
        files.find(file => file.startsWith(prefix))
      ),
      'utf8'
    )
  const parsers = files.includes('input.ts')
    ? ['typescript']
    : ['babel', 'typescript', ...(noFlow.has(name) ? [] : ['flow'])]
  return { name, input: read('input.'), output: read('output.'), parsers }
})

const format = (input, options) =>
  prettier.format(input, { plugins: [penere], ...options })

describe('penere output', () => {
  for (const { name, input, output, parsers } of fixtures) {
    for (const parser of parsers) {
      test(`${name} (${parser})`, { skip: !ported.has(name) }, async () => {
        assert.equal(await format(input, { parser }), output)
      })
    }
  }
})

describe('stock options match stock prettier', () => {
  for (const { name, input, parsers } of fixtures) {
    for (const parser of parsers) {
      test(`${name} (${parser})`, async () => {
        assert.equal(
          await format(input, { parser, ...stockOptions }),
          await prettier.format(input, { parser })
        )
      })
    }
  }
})
