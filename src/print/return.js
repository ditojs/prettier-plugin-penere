import { isDocType, isPreserved } from '../utils.js'
import { startsWithBrokenParentheses } from './binaryish.js'

const isBinaryish = node => (
  node?.type === 'BinaryExpression' ||
  node?.type === 'LogicalExpression'
)

/*
Adjusts the doc stock Prettier prints for the argument of `return` and `throw`
statements in `printReturnOrThrowArgument()`, which wraps binaryish arguments as

  group([ifBreak("("), indent([softline, argument]), softline, ifBreak(")")])

leaving out the parentheses if the argument starts with parentheses of its own:

  return (
    a +
    b
  ) / h
*/
export function printReturnStatement(returnDoc, path, options) {
  const { argument } = path.node
  // Stock Prettier prints `[keyword, [" ", wrapped], semicolon]`:
  const [keyword, [space, wrapped] = [], ...rest] = Array.isArray(returnDoc)
    ? returnDoc
    : []
  const [open, indented] = isDocType(wrapped, 'group')
    ? [wrapped.contents].flat()
    : []
  return (
    isPreserved(options, 'operatorWrap') &&
    isBinaryish(argument) &&
    startsWithBrokenParentheses(argument, options) &&
    isDocType(open, 'if-break') &&
    open.breakContents === '('
  )
    ? [keyword, [space, indented.contents.at(-1)], ...rest]
    : returnDoc
}
