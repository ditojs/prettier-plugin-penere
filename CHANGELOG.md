# Changelog

The changes of each release of Penere.

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
