import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import * as prettier from 'prettier'
import penere from '../src/index.js'

// Random expressions with random line breaks and parentheses, in the contexts
// that `operatorWrap` treats differently. Penere has to print each one so that
// formatting it again changes nothing, and without changing what it means.
// Line breaks for width aren't covered: a parenthesized operand that only
// breaks for width can take a second run to settle.

const names = [
  'alpha',
  'beta',
  'gamma',
  'isReady',
  'hasValue',
  'count',
  'item.value',
  'getWidth()',
  'options.size'
]
const operators = ['&&', '||', '+', '*', '/', '-', '===', '??']
const contexts = [
  expression => `function f() {\n  return ${expression}\n}\n`,
  expression => `const value = ${expression}\n`,
  expression => `const list = [\n  first,\n  ${expression},\n  last\n]\n`,
  expression => `call(first, ${expression})\n`,
  expression => `${expression}\n`,
  expression => `const f = x => ${expression}\n`,
  expression => `if (${expression}) {\n  run()\n}\n`
]

function createRandom(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
}

function createExpression(random, depth) {
  const pick = list => list[Math.floor(random() * list.length)]
  const space = () =>
    random() < 0.35
      ? '\n' + '  '.repeat(Math.floor(random() * 4))
      : ' '
  if (depth === 0 || random() < 0.25) {
    return pick(names)
  }
  const operator = pick(operators)
  const operands = Array.from(
    { length: 2 + Math.floor(random() * 3) },
    () => createExpression(random, depth - 1)
  )
  const expression = operands.join(space() + operator + space())
  return random() < 0.35 ? `(${space()}${expression}${space()})` : expression
}

const variants = {
  'babel': { parser: 'babel' },
  'typescript': { parser: 'typescript' },
  'preserveParentheses: false': { parser: 'babel', preserveParentheses: false },
  'clarifyMixedOperators: true': {
    parser: 'babel',
    clarifyMixedOperators: true
  }
}

describe('random expressions', () => {
  for (const [name, variant] of Object.entries(variants)) {
    const options = {
      ...variant,
      semi: false,
      singleQuote: true,
      printWidth: 1000,
      plugins: [penere]
    }
    test(name, async () => {
      const random = createRandom(1)
      for (let i = 0; i < 300; i++) {
        const context = contexts[Math.floor(random() * contexts.length)]
        const input = context(createExpression(random, 3))
        // Mixing `??` with `&&` or `||` without parentheses doesn't parse:
        const output = await prettier.format(input, options).catch(() => null)
        if (output) {
          assert.equal(await prettier.format(output, options), output, input)
          assert.equal(
            await prettier.format(output, { parser: options.parser }),
            await prettier.format(input, { parser: options.parser }),
            input
          )
        }
      }
    })
  }
})
