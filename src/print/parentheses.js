import { util } from 'prettier'
import {
  getPrecedence,
  isBitwiseOperator,
  isMixedMultiplication,
  shouldFlatten
} from '../precedence.js'
import { getOption, getPreviousCodeIndex, isDocType } from '../utils.js'

const isBinaryish = node => (
  node?.type === 'BinaryExpression' ||
  node?.type === 'LogicalExpression'
)

/*
Classifies the parentheses stock Prettier puts around a binaryish expression
nested in another one (see the `BinaryExpression` case in
prettier/src/language-js/parentheses/needs-parentheses.js), as either:
- 'required': needed for precedence or syntax,
- 'clarifying': added for readability (mixed `&&` / `||`, `%` in `+` / `-`,
  mixed `*` / `/`),
- 'stock': other parentheses stock Prettier adds, which Penere keeps,
- null: none.
*/
function getStockParentheses(node, parent, key) {
  const { operator } = node
  const parentOperator = parent.operator

  if (
    node.type === 'LogicalExpression' &&
    parent.type === 'LogicalExpression'
  ) {
    return parentOperator === operator
      ? null
      : // Mixing `??` with `&&` or `||` is a syntax error without parentheses,
        // and `||` in `&&` changes its meaning.
        (
            operator === '??' ||
            parentOperator === '??' ||
            getPrecedence(parentOperator) > getPrecedence(operator)
          )
        ? 'required'
        : 'clarifying'
  }

  const precedence = getPrecedence(operator)
  const parentPrecedence = getPrecedence(parentOperator)
  if (
    parentPrecedence > precedence ||
    (key === 'right' && parentPrecedence === precedence)
  ) {
    return 'required'
  }
  if (
    parentPrecedence === precedence &&
    !shouldFlatten(parentOperator, operator)
  ) {
    return isMixedMultiplication(parentOperator, operator)
      ? 'clarifying'
      : 'stock'
  }
  if (
    parentPrecedence < precedence &&
    operator === '%' &&
    (parentOperator === '+' || parentOperator === '-')
  ) {
    return 'clarifying'
  }
  return isBitwiseOperator(parentOperator) ? 'stock' : null
}

// Returns undefined for cases not handled here.
function getParentheses(node, parent, key) {
  // Stock Prettier wraps `??` in conditionals, e.g. `(a ?? b) ? c : d`.
  if (parent.type === 'ConditionalExpression') {
    return node.operator === '??' ? 'clarifying' : undefined
  }
  if (
    !isBinaryish(parent) ||
    (key !== 'left' && key !== 'right') ||
    parent.operator === '|>' ||
    !getPrecedence(node.operator) ||
    !getPrecedence(parent.operator)
  ) {
    return undefined
  }
  return getStockParentheses(node, parent, key)
}

// Whether the node was wrapped in parentheses in the source.
export function isParenthesized(node, options) {
  if (node.extra?.parenthesized) {
    return true
  }
  const text = options.originalText
  const before = getPreviousCodeIndex(text, options.locStart(node), options)
  const after = util.getNextNonSpaceNonCommentCharacterIndex(
    text,
    options.locEnd(node)
  )
  return text[before] === '(' && text[after] === ')'
}

// Stock Prettier wraps the doc as `["(", doc, ")"]`, also inside labels.
export const isWrapped = doc =>
  isDocType(doc, 'label')
    ? isWrapped(doc.contents)
    : Array.isArray(doc) && doc.length === 3 && doc[0] === '(' && doc[2] === ')'

export const unwrap = doc =>
  isDocType(doc, 'label') ? { ...doc, contents: unwrap(doc.contents) } : doc[1]

export const wrap = doc =>
  isDocType(doc, 'label')
    ? { ...doc, contents: wrap(doc.contents) }
    : ['(', doc, ')']

/*
Decides whether a binaryish expression nested in another one, or `??` in a
conditional, is wrapped in parentheses, given whether stock Prettier wraps it:
- `clarifyMixedOperators`: add the clarifying parentheses stock Prettier adds,
  instead of only keeping the ones from the source.
- `preserveParentheses`: keep parentheses from the source, even if redundant.
*/
export function shouldParenthesize(path, options, isStockWrapped) {
  const { node, parent, key } = path
  const stock = getParentheses(node, parent, key)
  if (stock === undefined || !!stock !== isStockWrapped) {
    // Not a case we handle, or not what we expect: leave it to stock Prettier.
    return isStockWrapped
  }
  return shouldKeepParentheses(stock, node, options)
}

// Whether an operand of a binaryish expression prints in parentheses, by the
// same rules as `shouldParenthesize()`, without asking stock Prettier.
export const hasOperandParentheses = (node, parent, key, options) =>
  shouldKeepParentheses(getParentheses(node, parent, key), node, options)

const shouldKeepParentheses = (stock, node, options) => (
  stock === 'required' ||
  stock === 'stock' ||
  (stock === 'clarifying' && getOption(options, 'clarifyMixedOperators')) || (
    getOption(options, 'preserveParentheses') &&
    isParenthesized(node, options)
  )
)

export function printBinaryishParentheses(binaryishDoc, path, options) {
  const isStockWrapped = isWrapped(binaryishDoc)
  const shouldWrap = shouldParenthesize(path, options, isStockWrapped)
  return shouldWrap === isStockWrapped
    ? binaryishDoc
    : shouldWrap
      ? wrap(binaryishDoc)
      : unwrap(binaryishDoc)
}
