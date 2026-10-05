import { doc, util } from 'prettier'
import { isDocType, isPreserved } from '../utils.js'

const { group } = doc.builders

const isFunctionLikeType = node =>
  [
    'FunctionDeclaration',
    'FunctionExpression',
    'ArrowFunctionExpression',
    'ClassMethod',
    'MethodDefinition',
    'ObjectMethod'
  ].includes(node?.type)

const isCallLikeExpression = node =>
  [
    'CallExpression',
    'OptionalCallExpression',
    'NewExpression',
    'ImportExpression'
  ].includes(node?.type)

/*
Adjusts the doc stock Prettier prints for `ObjectPattern`, which is either
`group(content, { shouldBreak })`, or the bare `content` when the pattern is
hugged as the only function parameter, or is the left side of an assignment.
*/
export function printObjectPattern(patternDoc, path, options) {
  if (!isPreserved(options, 'objectDestructuringWrap')) {
    return patternDoc
  }
  const { node, parent } = path
  const [firstProperty] = node.properties

  // Respect the original line break after the opening brace, the same way
  // `objectWrap: "preserve"` does for object literals.
  const shouldBreak = (
    options.objectWrap === 'preserve' &&
    !!firstProperty &&
    util.hasNewlineInRange(
      options.originalText,
      options.locStart(node),
      options.locStart(firstProperty)
    )
  )

  if (isDocType(patternDoc, 'group')) {
    return shouldBreak && !patternDoc.break
      ? { ...patternDoc, break: true }
      : patternDoc
  }

  // Keep hugged patterns in function parameters in their own group, so that
  // breaking the parameters doesn't break the pattern. And don't leave the
  // grouping to the assignment if the pattern itself needs to break.
  return (
    isFunctionLikeType(parent) ||
    isCallLikeExpression(parent) ||
    shouldBreak
  )
    ? group(patternDoc, { shouldBreak })
    : patternDoc
}
