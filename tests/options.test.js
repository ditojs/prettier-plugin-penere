import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as prettier from 'prettier'
import penere from '../src/index.js'

const format = async (input, options) =>
  (
    await prettier.format(input, {
      parser: 'babel',
      plugins: [penere],
      ...options
    })
  ).trim()

const input = 'const a = [\n  1, 2\n]\nfoo(\n  a, b\n)'

test('`wrap` applies to all `*Wrap` options that are not set', async () => {
  assert.equal(
    await format(input),
    'const a = [\n  1, 2,\n];\nfoo(\n  a,\n  b,\n);'
  )
  assert.equal(
    await format(input, { wrap: 'collapse' }),
    'const a = [1, 2];\nfoo(a, b);'
  )
})

test('`*Wrap` options override `wrap`', async () => {
  assert.equal(
    await format(input, { wrap: 'collapse', arrayWrap: 'preserve' }),
    'const a = [\n  1, 2,\n];\nfoo(a, b);'
  )
  assert.equal(
    await format(input, { argumentWrap: 'collapse' }),
    'const a = [\n  1, 2,\n];\nfoo(a, b);'
  )
})
