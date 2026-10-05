import { doc, util } from 'prettier'
import { hasLeadingOwnLineComment } from '../comments.js'
import { isDocType, isPreserved, replaceDocs } from '../utils.js'
import { shouldInlineLogicalExpression } from './binaryish.js'

const {
  conditionalGroup,
  group,
  hardline,
  ifBreak,
  indent,
  indentIfBreak,
  line,
  lineSuffixBoundary,
  softline
} = doc.builders

const rightPropertyNames = {
  AssignmentExpression: 'right',
  VariableDeclarator: 'init',
  ClassProperty: 'value',
  ClassPrivateProperty: 'value',
  ClassAccessorProperty: 'value',
  PropertyDefinition: 'value',
  AccessorProperty: 'value',
  TSAbstractPropertyDefinition: 'value',
  TSAbstractAccessorProperty: 'value',
  ObjectProperty: 'value',
  Property: 'value'
}

export const isAssignmentLike = node => (
  !!rightPropertyNames[node?.type] &&
  !(node.type === 'Property' && (node.method || node.kind !== 'init'))
)

const isBinaryish = node => (
  node?.type === 'BinaryExpression' ||
  node?.type === 'LogicalExpression'
)

/*
Adjusts the doc stock Prettier prints in `printAssignment()` for assignments
with binaryish right-hand sides, where the layout is one of:

  break-after-operator:       group([group(left), operator, group(indent([line, right]))])
  never-break-after-operator: group([group(left), operator, " ", right])
  fluid:                      group([group(left), operator, group(indent(line)), lineSuffixBoundary, indentIfBreak(right)])
  break-lhs:                  group([left, operator, " ", group(right)])

Penere decides differently whether to break after the operator, as it inlines
other operands (see `shouldInlineLogicalExpression()`), and wraps broken
right-hand sides in parentheses:

  const value = (
    a &&
    b
  )
*/
export function printAssignment(assignmentDoc, path, options, nodeDocs) {
  const { node } = path
  const rightNode = node[rightPropertyNames[node.type]]
  const rightDoc = nodeDocs.get(rightNode)
  if (
    !isPreserved(options, 'operatorWrap') ||
    !isBinaryish(rightNode) ||
    rightDoc === undefined
  ) {
    return assignmentDoc
  }

  return replaceDocs(assignmentDoc, printed => {
    const layout = getLayout(printed, rightDoc)
    if (!layout || layout === 'break-lhs') {
      // `break-lhs` is chosen before considering the right-hand side.
      return
    }
    const [leftDoc, operator] = printed.contents
    const shouldBreakAfterOperator = (
      hasLeadingOwnLineComment(options.originalText, rightNode, options) ||
      !shouldInlineLogicalExpression(rightNode, node, options)
    )

    if (shouldBreakAfterOperator) {
      return group([
        leftDoc,
        operator,
        group([
          ifBreak(' (', ' '),
          indent([softline, rightDoc]),
          softline,
          ifBreak(')')
        ])
      ])
    }
    if (layout === 'fluid') {
      return printFluidWithParentheses(printed, leftDoc, operator, rightDoc)
    }
    if (layout !== 'break-after-operator') {
      return printed
    }
    // Stock Prettier breaks after the operator for operands it doesn't inline,
    // but Penere does: choose the layout stock Prettier chooses next.
    if (
      !doc.utils.canBreak(leftDoc) &&
      isObjectPropertyWithShortKey(node, leftDoc, options)
    ) {
      return group([leftDoc, operator, ' ', rightDoc])
    }
    const groupId = Symbol('assignment')
    return printFluidWithParentheses(
      group([
        leftDoc,
        operator,
        group(indent(line), { id: groupId }),
        lineSuffixBoundary,
        indentIfBreak(rightDoc, { groupId })
      ]),
      leftDoc,
      operator,
      rightDoc
    )
  })
}

// Print on one line if it fits, and wrap the right-hand side in parentheses
// otherwise, instead of breaking after the operator.
function printFluidWithParentheses(fluidDoc, leftDoc, operator, rightDoc) {
  return conditionalGroup([
    fluidDoc,
    group([
      leftDoc,
      operator,
      group([' (', indent([hardline, rightDoc]), hardline, ')'])
    ])
  ])
}

function getLayout(printed, rightDoc) {
  const contents = isDocType(printed, 'group') ? printed.contents : null
  if (!Array.isArray(contents)) {
    return null
  }
  const [, , third, fourth, fifth] = contents
  if (
    contents.length === 3 &&
    isDocType(third, 'group') &&
    isDocType(third.contents, 'indent') &&
    third.contents.contents[1] === rightDoc
  ) {
    return 'break-after-operator'
  }
  if (contents.length === 4 && third === ' ') {
    return fourth === rightDoc
      ? 'never-break-after-operator'
      : isDocType(fourth, 'group') && fourth.contents === rightDoc
        ? 'break-lhs'
        : null
  }
  if (
    contents.length === 5 &&
    isDocType(fifth, 'indent-if-break') &&
    fifth.contents === rightDoc
  ) {
    return 'fluid'
  }
  return null
}

// Mirrors `isObjectPropertyWithShortKey()` in stock Prettier.
function isObjectPropertyWithShortKey(node, keyDoc, options) {
  if (
    !(node.type === 'ObjectProperty' || node.type === 'Property') ||
    node.computed
  ) {
    return false
  }
  const printed = isDocType(keyDoc, 'group') ? keyDoc.contents : keyDoc
  return (
    typeof printed === 'string' &&
    util.getStringWidth(printed) < options.tabWidth + 3
  )
}

/*
Adjusts the doc stock Prettier prints for arrow functions with binaryish bodies
in `printArrowFunction()`:

  group([group(signatures), " =>", group(body) | indentIfBreak(body), ...])

wrapping broken bodies in parentheses:

  const isValid = value => (
    a &&
    b
  )
*/
export function printArrowFunction(arrowDoc, path, options) {
  const { node } = path
  if (
    !isPreserved(options, 'operatorWrap') ||
    node.type !== 'ArrowFunctionExpression' ||
    !isBinaryish(node.body)
  ) {
    return arrowDoc
  }
  let replaced = false
  return replaceDocs(arrowDoc, printed => {
    const contents = isDocType(printed, 'group') ? printed.contents : null
    if (replaced || !Array.isArray(contents) || contents[1] !== ' =>') {
      return replaced ? printed : undefined
    }
    const body = contents[2]
    if (!isDocType(body, 'group') && !isDocType(body, 'indent-if-break')) {
      return
    }
    replaced = true
    return {
      ...printed,
      contents: [
        ...contents.slice(0, 2),
        {
          ...body,
          contents: group([
            ifBreak(' ('),
            body.contents,
            softline,
            ifBreak(')')
          ])
        },
        ...contents.slice(3)
      ]
    }
  })
}
