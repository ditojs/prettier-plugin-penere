import { isDocType, isPreserved } from '../utils.js'
import { getStartingParentheses } from './binaryish.js'

const isBinaryish = node => (
  node?.type === 'BinaryExpression' ||
  node?.type === 'LogicalExpression'
)

/*
Adjusts the doc stock Prettier prints for the argument of `return` and `throw`
statements in `printReturnOrThrowArgument()`, which wraps binaryish arguments as

  group([ifBreak("("), indent([softline, argument]), softline, ifBreak(")")])

or, with a leading comment, as `["(", indent([hardline, argument]), hardline, ")"]`,
leaving out the parentheses if the argument starts with parentheses of its own:

  return (
    a +
    b
  ) / h

A leading comment stays inside the parentheses only if Penere adds them, so the
ones written in the source keep the wrapping that stops it from ending the
statement.
*/
export function printReturnStatement(returnDoc, path, options) {
  const { argument } = path.node
  // Stock Prettier prints `[keyword, [" ", wrapped], semicolon]`:
  const [keyword, [space, wrapped] = [], ...rest] = Array.isArray(returnDoc)
    ? returnDoc
    : []
  const [open, indented] = isDocType(wrapped, 'group')
    ? [wrapped.contents].flat()
    : Array.isArray(wrapped)
      ? wrapped
      : []
  const parentheses = (
    isPreserved(options, 'operatorWrap') &&
    isBinaryish(argument) &&
    getStartingParentheses(argument, options)
  )
  const shouldUnwrap = isDocType(open, 'if-break')
    ? open.breakContents === '(' && !!parentheses
    : open === '(' && parentheses === 'added'
  return shouldUnwrap
    ? [keyword, [space, indented.contents.at(-1)], ...rest]
    : returnDoc
}
