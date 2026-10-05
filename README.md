# Penere

A [Prettier](https://prettier.io) plugin that makes it less opinionated and a
bit more expressive, by respecting your line breaks.

Penere lets you decide how code is laid out, by where you put the first line
break, and formats everything else the way Prettier does.

```js
// Written on one line, stays on one line (if it fits):
const sizes = [1, 2, 3]

// Broken after the opener, stays expanded:
const sizes = [
  1, 2, 3
]
```

## The idea

Prettier already does this for object literals with
[`objectWrap: "preserve"`](https://prettier.io/docs/options#object-wrap): if
there is a line break between `{` and the first property, the object stays
expanded. Penere applies the same rule everywhere else:

- **Break after the opener** (`[`, `(`, `{`, `<`, `${`, before the first `.` of
  a chain, …) and the construct stays expanded.
- **Join it back onto one line** and Prettier collapses it again, if it fits.

Everything you don't express this way is formatted by stock Prettier. Each rule
is an option, and `wrap: "collapse"` turns them all off, giving you exactly
stock Prettier.

## Usage

Install Prettier and the plugin:

```sh
npm install --save-dev prettier prettier-plugin-penere
```

Add the plugin to your [Prettier configuration](https://prettier.io/docs/configuration):

```js
// prettier.config.js
export default {
  plugins: ['prettier-plugin-penere']
}
```

That's all: Prettier now formats JavaScript, TypeScript, Flow and JSX with
Penere, wherever it runs, in [editors](https://prettier.io/docs/editors), on
the [command line](https://prettier.io/docs/cli), in
[pre-commit hooks](https://prettier.io/docs/precommit), or through
[eslint-plugin-prettier](https://github.com/prettier/eslint-plugin-prettier).
All options default to Penere's behavior, and can be set next to Prettier's own
options:

```js
// prettier.config.js
export default {
  plugins: ['prettier-plugin-penere'],
  semi: false,
  singleQuote: true,
  arrowParens: 'avoid',
  trailingComma: 'none',
  // Penere options:
  argumentWrap: 'collapse',
  clarifyMixedOperators: true
}
```

On the command line, without a configuration file:

```sh
npx prettier --plugin prettier-plugin-penere --write .
```

And through Prettier's API:

```js
import * as prettier from 'prettier'
import penere from 'prettier-plugin-penere'

const formatted = await prettier.format(code, {
  parser: 'babel',
  plugins: [penere]
})
```

## Options

`wrap` sets all `*Wrap` options at once, and each of them can be set on its own
to override it. They take `"preserve"` (Penere) or `"collapse"` (stock
Prettier), like Prettier's own `objectWrap`.

| Option                 | Default      | Covers                                                    |
| ---------------------- | ------------ | --------------------------------------------------------- |
| `wrap`                 | `"preserve"` | All `*Wrap` options that aren't set, and the ones below   |
| `arrayWrap`            | `wrap`       | Arrays and array patterns, tuples                         |
| `parameterWrap`        | `wrap`       | Function parameters                                       |
| `argumentWrap`         | `wrap`       | Call arguments                                            |
| `memberChainWrap`      | `wrap`       | Member chains                                             |
| `objectPatternWrap`    | `wrap`       | Destructuring patterns                                    |
| `ternaryWrap`          | `wrap`       | Conditional expressions and types                         |
| `templateLiteralWrap`  | `wrap`       | Template literal interpolations                           |
| `binaryExpressionWrap` | `wrap`       | Binary and logical expressions, and assignments of them   |
| `moduleSpecifierWrap`  | `wrap`       | Import and export specifiers                              |
| `jsxAttributeWrap`     | `wrap`       | JSX attributes                                            |
| `typeParameterWrap`    | `wrap`       | Type parameters and arguments                             |
| `unionTypeWrap`        | `wrap`       | Union types                                               |
| `mappedTypeWrap`       | `wrap`       | Keys of mapped types                                      |

The other options are not about line breaks. When they aren't set, they follow
`wrap` too: Penere's value with `"preserve"`, stock Prettier's with
`"collapse"`.

| Option                   | `"preserve"` | `"collapse"` | Covers                                                    |
| ------------------------ | ------------ | ------------ | --------------------------------------------------------- |
| `hugLastParameter`       | `true`       | `false`      | Hug the last parameter if it's the only object pattern    |
| `conciseStringArrays`    | `true`       | `false`      | Fill arrays of strings like arrays of numbers             |
| `breakComplexArrayItems` | `false`      | `true`       | Always break arrays of objects or arrays                  |
| `clarifyMixedOperators`  | `false`      | `true`       | Add parentheses to mixed operators for readability        |
| `preserveParentheses`    | `true`       | `false`      | Keep redundant parentheses from the source                |

Object literals are left to Prettier's own `objectWrap`, which already defaults
to `"preserve"`.

The examples below show the input, and the output with each value of the
option.

### `arrayWrap`

Break if the source breaks after `[`. A break between the first and second
element puts every element on its own line, otherwise elements are filled.

```js
// Input
const sizes = [
  1, 2, 3
]
const list = [
  1,
  2, 3
]

// arrayWrap: "preserve"
const sizes = [
  1, 2, 3
]
const list = [
  1,
  2,
  3
]

// arrayWrap: "collapse"
const sizes = [1, 2, 3]
const list = [1, 2, 3]
```

### `parameterWrap`

Break all parameters if the source breaks after `(`.

```js
// Input
function request(
  url, method) {}

// parameterWrap: "preserve"
function request(
  url,
  method
) {}

// parameterWrap: "collapse"
function request(url, method) {}
```

### `argumentWrap`

Break all arguments if the source breaks after `(`.

```js
// Input
test(
  foo(), bar())

// argumentWrap: "preserve"
test(
  foo(),
  bar()
)

// argumentWrap: "collapse"
test(foo(), bar())
```

### `memberChainWrap`

Expand the chain if the source breaks before a member, up to the first call.

```js
// Input
object
  .foo().bar()
expect(value)
  .toBe(true)

// memberChainWrap: "preserve"
object
  .foo()
  .bar()
expect(value)
  .toBe(true)

// memberChainWrap: "collapse"
object.foo().bar()
expect(value).toBe(true)
```

### `objectPatternWrap`

Destructuring patterns follow `objectWrap` like object literals do, and
patterns in function parameters keep their own group, so that breaking the
parameters doesn't expand them.

```js
// Input
const {
  a, b } = object

// objectPatternWrap: "preserve"
const {
  a,
  b
} = object

// objectPatternWrap: "collapse"
const { a, b } = object
```

### `ternaryWrap`

Break the conditional if the source breaks before the consequent.

```js
// Input
const value = condition
  ? a : b

// ternaryWrap: "preserve"
const value = condition
  ? a
  : b

// ternaryWrap: "collapse"
const value = condition ? a : b
```

### `templateLiteralWrap`

Interpolations may break at their `${` and `}` boundaries instead of inside the
expression, and stay broken if the source breaks after `${`.

```js
// Input
const message = `${
  pico.gray('<--')
} ${pico.bold(ctx.method)}`

// templateLiteralWrap: "preserve"
const message = `${
  pico.gray('<--')
} ${pico.bold(ctx.method)}`

// templateLiteralWrap: "collapse"
const message = `${pico.gray('<--')} ${pico.bold(ctx.method)}`
```

### `binaryExpressionWrap`

If the source breaks between any two operands, all operands on the same level
break. Nested expressions that break are wrapped in parentheses, with the
opening parenthesis on the line of the operator. Assignments, returns and arrow
function bodies wrap broken expressions in parentheses as well. Literals, empty
objects and arrays stay on the line of their operator.

```js
// Input
function isEmpty(arg) {
  return arg == null ||
    isArrayLike(arg) && arg.length === 0 || isObject(arg) && Object.keys(arg).length === 0
}
const isValid = value => value != null &&
  value !== ''

// binaryExpressionWrap: "preserve"
function isEmpty(arg) {
  return (
    arg == null ||
    isArrayLike(arg) && arg.length === 0 ||
    isObject(arg) && Object.keys(arg).length === 0
  )
}
const isValid = value => (
  value != null &&
  value !== ''
)

// binaryExpressionWrap: "collapse"
const isValid = value => value != null && value !== ''
```

```js
// binaryExpressionWrap: "preserve"
function isPlainObject(arg) {
  const ctor = arg?.constructor
  return (
    !!arg && (
      ctor && (
        ctor === Object ||
        ctor.name === 'Object'
      ) ||
      !ctor && !isModule(arg)
    )
  )
}
```

### `moduleSpecifierWrap`

Break import and export specifiers if the source breaks after `{`.

```js
// Input
import {
  a, b } from 'x'

// moduleSpecifierWrap: "preserve"
import {
  a,
  b
} from 'x'

// moduleSpecifierWrap: "collapse"
import { a, b } from 'x'
```

### `jsxAttributeWrap`

Break the attributes if the source breaks before the first one.

```jsx
// Input
const el = <Foo
  a="1" b="2" />

// jsxAttributeWrap: "preserve"
const el = (
  <Foo
    a="1"
    b="2"
  />
)

// jsxAttributeWrap: "collapse"
const el = <Foo a="1" b="2" />
```

### `typeParameterWrap`

Break type parameters and arguments if the source breaks after `<`.

```ts
// Input
type Pair<
  A, B> = [A, B]

// typeParameterWrap: "preserve"
type Pair<
  A,
  B
> = [A, B]

// typeParameterWrap: "collapse"
type Pair<A, B> = [A, B]
```

### `unionTypeWrap`

Break unions that span multiple lines in the source, including a line break
before a leading `|`.

```ts
// Input
type Method =
  | 'get' | 'post'

// unionTypeWrap: "preserve"
type Method =
  | 'get'
  | 'post'

// unionTypeWrap: "collapse"
type Method = 'get' | 'post'
```

### `mappedTypeWrap`

Only break after the `[` of a mapped type key if the source does, and hug the
brackets otherwise.

```ts
// Input, and mappedTypeWrap: "preserve"
type Hooks = {
  [key in `${'before' | 'after'}:${
    | 'find'
    | 'insert'
  }`]?: Hook
}

// mappedTypeWrap: "collapse"
type Hooks = {
  [
    key in `${'before' | 'after'}:${
      | 'find'
      | 'insert'
    }`
  ]?: Hook
}
```

### `hugLastParameter`

Hug the last parameter if it is an object or array pattern and no other
parameter is, like Prettier hugs the last argument of a call.

```js
// hugLastParameter: true
async function request(api, {
  url,
  method,
  params,
  query,
  headers,
  data,
  timeout
}) {}

// hugLastParameter: false
async function request(
  api,
  { url, method, params, query, headers, data, timeout }
) {}
```

### `conciseStringArrays`

Fill arrays of strings as many per line as fit, like Prettier does for arrays
of numbers.

```js
// conciseStringArrays: true
const keys = [
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven'
]

// conciseStringArrays: false
const keys = [
  'one',
  'two',
  'three',
  …
]
```

### `breakComplexArrayItems`

Prettier always breaks arrays with more than one element if all of them are
objects or arrays with more than one item. Penere leaves that to `arrayWrap`.

```js
// breakComplexArrayItems: false
const pairs = [{ a: 1, b: 2 }, { a: 3, b: 4 }]

// breakComplexArrayItems: true
const pairs = [
  { a: 1, b: 2 },
  { a: 3, b: 4 }
]
```

### `clarifyMixedOperators`

Prettier adds parentheses to mixed `&&` / `||`, mixed `*` / `/`, `%` within
`+` / `-`, and `??` within conditionals. Penere only keeps the ones you wrote.
Parentheses required by precedence or syntax, e.g. around `??` mixed with
`||`, are always kept.

```js
// clarifyMixedOperators: false
const a = b && c || d

// clarifyMixedOperators: true
const a = (b && c) || d
```

### `preserveParentheses`

Keep parentheses around nested binary and logical expressions that you wrote,
even if they are redundant.

```js
// preserveParentheses: true
const a = (b * c) + d

// preserveParentheses: false
const a = b * c + d
```

## Compatibility

- **Prettier `~3.9.0`.** Penere adjusts the documents Prettier builds, so it
  depends on Prettier's internals, and is released for each Prettier minor
  version. Penere has its own version number.
- **Languages:** JavaScript, TypeScript, Flow and JSX, with the `babel`,
  `babel-flow`, `babel-ts`, `flow`, `typescript`, `acorn`, `espree` and
  `meriyah` parsers. JavaScript embedded in other languages, like Vue or
  Markdown, goes through the same parsers, and is formatted by Penere too.
- `ternaryWrap` doesn't apply with `experimentalTernaries`.

## How it works

Prettier has no documented way for a plugin to change how a built-in language
is printed. Penere re-exports Prettier's JavaScript parsers under its own AST
format, so that Prettier uses Penere's printer, which wraps the built-in one.

For most rules, Penere lets Prettier print the node, and adjusts the result,
e.g. by breaking a group or swapping a layout. If the result doesn't have the
expected shape, it is left untouched, and you get stock Prettier's output.
Binary expressions are printed by Penere itself, based on Prettier's printer.

## Development

```sh
npm install
npm test
```

- `tests/fixtures/<name>/input.*` and `output.*` hold the expected Penere
  output, tested with the `babel`, `typescript` and `flow` parsers, or only
  `typescript` for `.ts` files.
- The same fixtures are formatted with `wrap: "collapse"`, which must match
  stock Prettier exactly.
- The source is formatted with Penere itself: `npm run format`.

## Badge

Show the world you're using _Penere_ →
[![code style: penere](https://img.shields.io/badge/code_style-penere-ffaa00.svg?style=flat-square)](https://github.com/ditojs/penere)

```md
[![code style: penere](https://img.shields.io/badge/code_style-penere-ffaa00.svg?style=flat-square)](https://github.com/ditojs/penere)
```

## License

MIT. Penere includes code from [Prettier](https://github.com/prettier/prettier),
© James Long and contributors.
