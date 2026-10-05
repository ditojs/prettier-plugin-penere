import { util } from 'prettier'
import { doc } from 'prettier'
import { isDocType, isPreserved } from '../utils.js'
import { isWrapped } from './parentheses.js'

const { group, indent, softline } = doc.builders

const testProperties = {
  ConditionalExpression: ['test'],
  TSConditionalType: ['checkType', 'extendsType'],
  ConditionalTypeAnnotation: ['checkType', 'extendsType']
}

const consequentProperties = {
  ConditionalExpression: 'consequent',
  TSConditionalType: 'trueType',
  ConditionalTypeAnnotation: 'trueType'
}

/*
Adjusts the doc stock Prettier prints for conditional expressions and types in
`printTernaryOld()`. Only the outermost conditional of a chain is grouped:

  group([test, indent(parts), softline | ""])

possibly wrapped in `group([indent([softline, result]), softline])`, and in
parentheses `["(", doc, ")"]`.
*/
export function printTernary(ternaryDoc, path, options) {
  const { node, parent } = path
  if (
    !isPreserved(options, 'ternaryWrap') ||
    options.experimentalTernaries
  ) {
    return ternaryDoc
  }
  const consequent = node[consequentProperties[node.type]]
  // Only the outermost conditional of a chain is grouped.
  const isOutermost = (
    parent.type !== node.type ||
    testProperties[node.type].some(property => parent[property] === node)
  )
  // Break if the consequent is moved to a new line in the source.
  const shouldBreak = (
    isOutermost &&
    !!consequent &&
    util.hasNewlineInRange(
      options.originalText,
      options.locStart(node),
      options.locStart(consequent)
    )
  )
  const printed = shouldBreak
    ? (breakTernaryGroup(ternaryDoc) ?? ternaryDoc)
    : ternaryDoc
  // Indent conditional expressions in parentheses, e.g. as operands:
  //
  //   a || (
  //     b
  //       ? c
  //       : d
  //   )
  return (
    node.type === 'ConditionalExpression' &&
    Array.isArray(printed) &&
    isWrapped(printed)
  )
    ? ['(', group([indent([softline, printed[1]]), softline]), ')']
    : printed
}

function breakTernaryGroup(doc) {
  if (
    Array.isArray(doc) &&
    doc.length === 3 &&
    doc[0] === '(' &&
    doc[2] === ')'
  ) {
    const inner = breakTernaryGroup(doc[1])
    return inner && ['(', inner, ')']
  }
  if (!isDocType(doc, 'group') || !Array.isArray(doc.contents)) {
    return
  }
  const { contents } = doc
  // `group([indent([softline, result]), softline])`
  if (contents.length === 2 && isDocType(contents[0], 'indent')) {
    const [softline, result] = contents[0].contents
    const inner = breakTernaryGroup(result)
    return (
      inner && {
        ...doc,
        contents: [{ ...contents[0], contents: [softline, inner] }, contents[1]]
      }
    )
  }
  // `group([test, indent(parts), softline | ""])`
  return contents.length === 3 ? { ...doc, break: true } : undefined
}
