# Changelog

The changes of each release of Penere.

## 0.6.0 (2026-11-26)

### Behaviour changes

- `operatorWrap` lines up broken array elements, call arguments, statements and computed keys without parentheses or indentation, which takes back the parentheses around array elements from 0.5.2.
- Broken `&&` operands of a broken `||` line up with the others, relying on precedence, instead of getting parentheses. Nested expressions that mix other operators get parentheses when they break.
- Parentheses whose level doesn't break hug it, also when operands inside break: `(a && (` … `) && b)`.
- An unbroken level keeps its operators on the lines around operands that break in parentheses, anywhere in the chain: `) / h`, `2 + (` … `) + 1`.

### Fixes

- Formatting Penere's output again leaves it unchanged, also with comments after `(`, parentheses on the left like `(a + b) - c`, and `preserveParentheses: false`. Line breaks for width alone can still take a second run.
- Parentheses that `||` needs inside `&&` are kept when a comment follows `(` under the `typescript` parser.
- Trailing comments of broken expressions stay where they're written.

## 0.5.2 (2026-11-25)

### Behaviour changes

- `operatorWrap` wraps broken array elements in parentheses, like assignments, returns and arrow function bodies.

### Fixes

- The operator and operand after the `)` of a broken operand stay on its line unless the source breaks there, as in `(` … `) / h`, and the expression isn't wrapped in a second pair of parentheses.

## 0.5.1 (2026-11-25)

### Fixes

- The second operand of a broken logical or binary chain is indented like the others.
- Chains in parentheses before `!`, `as` and `satisfies` break between the parentheses, like before `.`, instead of hugging them.

## 0.5.0 (2026-11-04)

### Behaviour changes

- `argumentWrap` and `parameterWrap` keep the rows of arguments and parameters as written, like `arrayWrap` keeps the rows of elements. If the first row has only one argument or parameter, every one goes on its own line, as before.

## 0.4.0 (2026-10-05)

### Breaking changes

- Options are renamed after what they cover in code: `heritageWrap` to `extendsWrap`, `objectPatternWrap` to `objectDestructuringWrap`, `moduleSpecifierWrap` to `importExportWrap`, and `binaryExpressionWrap` to `operatorWrap`.

## 0.3.2 (2026-10-05)

### Fixes

- Only the line break after `(` decides whether parenthesized operands of binary and logical expressions break, so removing it brings them back onto one line, like objects.

## 0.3.1 (2026-10-05)

### Fixes

- Only the line break after `(` decides whether conditions of `if`, `while` and `do … while` break, so removing it brings them back onto one line, like objects.

## 0.3.0 (2026-10-05)

### Behaviour changes

- `conditionWrap` breaks conditions of `if`, `while` and `do … while` between their operands when the source breaks after `(`.
- `&&` operands of `||` are wrapped in parentheses when they break between their own operands.

## 0.2.0 (2026-10-05)

### New

- `conditionWrap` breaks after `if (` when the source does, instead of hugging `!(`.
- `heritageWrap` keeps line breaks before `extends` and between the extended types of interfaces.

### Fixes

- Line breaks after `?` and `:` before unions in conditional types are kept.
- JSON is left to stock Prettier, and unions in template literal types stay on one line.

## 0.1.0 (2026-10-05)

The first release, porting the mods of the Penere fork of Prettier to a plugin on stock Prettier 3.9, as `*Wrap` options, with `wrap: "collapse"` for stock Prettier's behaviour. New in the plugin are `moduleSpecifierWrap`, `jsxAttributeWrap` and `typeParameterWrap`, and member chains, function parameters and call arguments only respond to line breaks after their opener.
