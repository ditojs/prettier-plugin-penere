import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import * as prettier from 'prettier'
import penere from '../src/index.js'

const format = async (input, options) =>
  (
    await prettier.format(input, {
      parser: 'babel',
      plugins: [penere],
      ...options
    })
  )
    .trim()

const clarify = { clarifyMixedOperators: true }
const strip = { preserveParentheses: false }

// [input, default output, `clarifyMixedOperators` output,
//  `preserveParentheses: false` output]
const cases = [
  ['a && b || c', 'a && b || c;', '(a && b) || c;', 'a && b || c;'],
  ['(a && b) || c', '(a && b) || c;', '(a && b) || c;', 'a && b || c;'],
  ['a ?? (b || c)', 'a ?? (b || c);', 'a ?? (b || c);', 'a ?? (b || c);'],
  ['x % 2 + 1', 'x % 2 + 1;', '(x % 2) + 1;', 'x % 2 + 1;'],
  ['(x % 2) === 0', '(x % 2) === 0;', '(x % 2) === 0;', 'x % 2 === 0;'],
  ['(a * b) + c', '(a * b) + c;', '(a * b) + c;', 'a * b + c;'],
  ['a * (b + c)', 'a * (b + c);', 'a * (b + c);', 'a * (b + c);'],
  ['a * b % c', '(a * b) % c;', '(a * b) % c;', '(a * b) % c;'],
  ['a | b & c', 'a | (b & c);', 'a | (b & c);', 'a | (b & c);']
]

describe('parentheses', () => {
  for (const [input, expected, clarified, stripped] of cases) {
    test(input, async () => {
      assert.equal(await format(input), expected)
      assert.equal(await format(input, clarify), clarified)
      assert.equal(await format(input, strip), stripped)
    })
  }
})
