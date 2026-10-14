import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, test } from 'node:test'
import * as prettier from 'prettier'
import penere from '../src/index.js'

const readme = fs.readFileSync(
  path.join(import.meta.dirname, '../README.md'),
  'utf8'
)

// The examples in the README are written in this style:
const baseOptions = {
  semi: false,
  singleQuote: true,
  arrowParens: 'avoid',
  trailingComma: 'none',
  plugins: [penere]
}

for (const section of readme.split(/^### `/m).slice(1)) {
  const name = section.slice(0, section.indexOf('`'))
  describe(`README: ${name}`, () => {
    for (const [, lang, code] of section.matchAll(
      /```(js|jsx|ts)\n([\s\S]*?)```/g
    )) {
      const parser = lang === 'ts' ? 'typescript' : 'babel'
      let input
      // The parts of an example are labeled `// Input`, `// Input, and
      // option: value` or `// option: value`:
      for (const part of code.split(/^(?=\/\/ (?:Input|\w+: ))/m)) {
        const [label, ...lines] = part.split('\n')
        const body = lines.join('\n').trim()
        const [, isInput, option, value] = (
          /^\/\/ (Input)?(?:, and )?(?:(\w+): (.+))?$/.exec(label) ?? []
        )
        if (isInput) {
          input = body
        }
        // Without an input, the output is checked to be stable. Shortened
        // outputs can't be checked.
        if (option && !body.includes('…')) {
          const source = input ?? body
          test(`${option}: ${value}`, async () => {
            const output = await prettier.format(source, {
              ...baseOptions,
              parser,
              [option]: JSON.parse(value)
            })
            assert.equal(output.trim(), body)
          })
        }
      }
    }
  })
}
