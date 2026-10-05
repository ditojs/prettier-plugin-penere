import { doc, util } from 'prettier'
import {
  hasLeadingOwnLineComment,
  isTypeCastComment,
  printComments
} from '../comments.js'
import { cleanDoc } from '../doc-utils.js'
import { isPreserved } from '../utils.js'
import {
  getPrecedence,
  shouldFlatten as shouldFlattenOperators
} from '../precedence.js'
import { isParenthesized } from './parentheses.js'

const {
  align,
  group,
  ifBreak,
  indent,
  indentIfBreak,
  join,
  line,
  softline
} = doc.builders

/*
Mirrors `printBinaryishExpression()` in prettier/src/language-js/print/
binaryish.js, with the Penere changes marked with `PENERE:`:

- Preserve breaks between the operands of binaryish expressions, and propagate
  them to all operands on the same level (`breakLevels`), which requires
  printing the expression twice: once to collect the breaks, once to print.
- Break between parentheses of nested binaryish expressions, adding the
  parentheses when breaking.
- Inline literals, empty objects and arrays, and member expressions on them.
- Flatten mixed `*` / `/`, leaving parentheses to the author.
*/

const isBinaryish = node => (
  node?.type === 'BinaryExpression' ||
  node?.type === 'LogicalExpression' ||
  node?.type === 'NGPipeExpression'
)

const isCallExpression = node => (
  node?.type === 'CallExpression' ||
  node?.type === 'OptionalCallExpression'
)

const isCallOrNewExpression = node => (
  isCallExpression(node) ||
  node?.type === 'NewExpression'
)

const isCallLikeExpression = node => (
  isCallOrNewExpression(node) ||
  node?.type === 'ImportExpression'
)

const isMemberExpression = node => (
  node?.type === 'MemberExpression' ||
  node?.type === 'OptionalMemberExpression'
)

const isReturnOrThrowStatement = node => (
  node?.type === 'ReturnStatement' ||
  node?.type === 'ThrowStatement'
)

const isJsxElement = node => (
  node?.type === 'JSXElement' ||
  node?.type === 'JSXFragment'
)

const isObjectProperty = node => (
  node?.type === 'ObjectProperty' ||
  (node?.type === 'Property' && !node.method && node.kind === 'init')
)

const isBooleanTypeCoercion = node => (
  node.type === 'CallExpression' &&
  !node.optional &&
  node.arguments.length === 1 &&
  node.callee.type === 'Identifier' &&
  node.callee.name === 'Boolean'
)

const isLiteral = node =>
  [
    'Literal',
    'BooleanLiteral',
    'BigIntLiteral',
    'DirectiveLiteral',
    'NullLiteral',
    'NumericLiteral',
    'RegExpLiteral',
    'StringLiteral',
    'TemplateLiteral'
  ].includes(node?.type)

const hasComment = node => !!node?.comments?.length

// PENERE: Flatten mixed `*` / `/` as well.
const shouldFlatten = (parentOperator, operator) =>
  shouldFlattenOperators(parentOperator, operator, {
    flattenMixedMultiplication: true
  })

let uid = 0

/*
- `BinaryExpression`
- `LogicalExpression`
- `NGPipeExpression`(Angular)

`hasParentheses` tells whether the expression is wrapped in parentheses.
*/
export function printBinaryishExpression(
  path,
  options,
  print,
  args,
  hasParentheses
) {
  const { node, parent, grandparent, key } = path
  const isInsideParenthesis = (
    key !== 'body' && (
      parent.type === 'IfStatement' ||
      parent.type === 'WhileStatement' ||
      parent.type === 'SwitchStatement' ||
      parent.type === 'DoWhileStatement' ||
      // PENERE: Respect breaks in assignments, variable declarations, returns
      // and calls.
      parent.type === 'AssignmentExpression' ||
      parent.type === 'VariableDeclarator' ||
      parent.type === 'ReturnStatement' ||
      isCallExpression(parent)
    )
  )
  const isHackPipeline = (
    node.operator === '|>' &&
    path.root.extra?.__isUsingHackPipeline
  )

  // PENERE: Collect the breaks of all operands on the same level.
  // PENERE: In conditions, the line break after `(` decides whether the top
  // level breaks, see `conditionWrap`, like the one after `{` for objects.
  const breakLevels = (
    args?.breakLevels ??
    (isConditionTest(path, options) ? { ignoredLevel: 0 } : {})
  )
  const level = args?.level ?? 0
  const prerun = args?.prerun ?? false
  const isRoot = args?.level === undefined
  const isFlattened = (
    isRoot || (
      isBinaryish(parent) &&
      !isParenthesized(node, options) &&
      shouldFlatten(parent.operator, node.operator)
    )
  )

  // PENERE: If an operand has its own parentheses in the source, the line break
  // after `(` decides whether its level breaks, like the `{` of objects, and
  // breaks between its operands don't count.
  const breaksAfterParenthesis = getBreakAfterOwnParenthesis(path, options)

  const callPrint = prerun => {
    const levelBreaks = isFlattened ? breakLevels : { ...breakLevels }
    const ownLevel = isFlattened ? level : level + 1
    if (breaksAfterParenthesis !== undefined) {
      levelBreaks.ignoredLevel = ownLevel
      levelBreaks[ownLevel] = breaksAfterParenthesis
    }
    return printBinaryishExpressions(
      path,
      options,
      print,
      /* isNested */ false,
      isInsideParenthesis,
      levelBreaks,
      ownLevel,
      prerun
    )
  }

  if (isRoot) {
    // Call twice, once to set up all values of `breakLevels`, the second time
    // to actually print the document.
    callPrint(true)
  }
  const parts = callPrint(prerun)

  if (isInsideParenthesis && !isCallExpression(parent)) {
    return parts
  }

  if (isHackPipeline) {
    return group(parts)
  }

  // Break between the parens in unaries or in a member or specific call
  // expression, i.e.
  //
  //   (
  //     a &&
  //     b &&
  //     c
  //   ).call()
  // PENERE: Mixed logical operands that break between their own operands are
  // wrapped in parentheses like other nested binaryish expressions:
  //
  //   a || (
  //     b &&
  //     c
  //   )
  const isBrokenMixedLogical = (
    isMixedLogical(node, parent) &&
    isLevelBroken(node, options)
  )

  if (
    (key === 'callee' && isCallOrNewExpression(parent)) ||
    // `UnaryExpression` adds parentheses and indention when argument has comment
    (parent.type === 'UnaryExpression' && !hasComment(node)) ||
    (isMemberExpression(parent) && !parent.computed) ||
    // PENERE: Break between parens of binaryish expressions as well unless they
    // are of the same type and precedence does not dictate otherwise. But if
    // the original code has parens, preserve those.
    (parent.type === 'ConditionalExpression' && key === 'test') || (
      isBinaryish(parent) && (
        parent.type !== node.type ||
        isParenthesized(node, options) ||
        getPrecedence(parent.operator) > getPrecedence(node.operator) ||
        isBrokenMixedLogical || (
          node.type === 'BinaryExpression' &&
          getPrecedence(parent.operator) < getPrecedence(node.operator) &&
          shouldBreakBinaryish(node, options) &&
          !shouldBreakBinaryish(parent, options)
        )
      )
    )
  ) {
    // PENERE: Add parens when going multiline, unless there are parens already.
    const addParentheses = (
      (isBinaryish(parent) || parent.type === 'ConditionalExpression') &&
      !hasParentheses
    )
    const indented = [indent([softline, ...parts]), softline]
    return group(
      addParentheses ? [ifBreak('('), ...indented, ifBreak(')')] : indented
    )
  }

  // Avoid indenting sub-expressions in some cases where the first sub-expression
  // is already indented accordingly. We should indent sub-expressions where the
  // first case isn't indented.
  const shouldNotIndent = (
    isReturnOrThrowStatement(parent) || (
      parent.type === 'JSXExpressionContainer' &&
      grandparent.type === 'JSXAttribute'
    ) ||
    (node.operator !== '|' && parent.type === 'JsExpressionRoot') || (
      node.type !== 'NGPipeExpression' && (
        (parent.type === 'NGRoot' && options.parser === '__ng_binding') || (
          parent.type === 'NGMicrosyntaxExpression' &&
          grandparent.type === 'NGMicrosyntax' &&
          grandparent.body.length === 1
        )
      )
    ) ||
    (node === parent.body && parent.type === 'ArrowFunctionExpression') ||
    (node !== parent.body && parent.type === 'ForStatement') ||
    // PENERE: Never indent binaryish expressions inside conditionals.
    parent.type === 'ConditionalExpression' ||
    parent.type === 'TemplateLiteral' ||
    (key === 'argument' && parent.type === 'UnaryExpression') ||
    (key === 'arguments' && isBooleanTypeCoercion(parent))
  )

  const shouldIndentIfInlining = (
    parent.type === 'AssignmentExpression' ||
    parent.type === 'VariableDeclarator' ||
    parent.type === 'ClassProperty' ||
    parent.type === 'PropertyDefinition' ||
    parent.type === 'TSAbstractPropertyDefinition' ||
    parent.type === 'ClassPrivateProperty' ||
    isObjectProperty(parent)
  )

  const samePrecedenceSubExpression = (
    isBinaryish(node.left) &&
    shouldFlatten(node.operator, node.left.operator)
  )

  const shouldInline = shouldInlineLogicalExpression(node, parent, options)
  if (
    shouldNotIndent ||
    (shouldInline && !samePrecedenceSubExpression) ||
    (!shouldInline && shouldIndentIfInlining)
  ) {
    return group(parts)
  }

  if (parts.length === 0) {
    return ''
  }

  // If the right part is a JSX node, we include it in a separate group to
  // prevent it breaking the whole chain, so we can print the expression like:
  //
  //   foo && bar && (
  //     <Foo>
  //       <Bar />
  //     </Foo>
  //   )
  const hasJsx = isJsxElement(node.right)

  const firstGroupIndex = parts.findIndex(
    part => (
      typeof part !== 'string' &&
      !Array.isArray(part) &&
      part.type === 'group'
    )
  )

  // Separate the leftmost expression, possibly with its leading comments.
  const headParts = parts.slice(
    0,
    firstGroupIndex === -1 ? 1 : firstGroupIndex + 1
  )

  const rest = parts.slice(headParts.length, hasJsx ? -1 : undefined)

  const groupId = Symbol('logicalChain-' + ++uid)

  const chain = group(
    // PENERE: Don't indent if the parent is binaryish or a call expression,
    // since we now break between parens of logical expressions as well.
    isBinaryish(parent) || isCallLikeExpression(parent)
      ? parts
      : [
          // Don't include the initial expression in the indentation level. The
          // first item is guaranteed to be the first left-most expression.
          ...headParts,
          indent(rest)
        ],
    { id: groupId }
  )

  if (!hasJsx) {
    return chain
  }

  const jsxPart = parts.at(-1)
  return group([chain, indentIfBreak(jsxPart, { groupId })])
}

// For binary expressions to be consistent, we need to group subsequent
// operators with the same precedence level under a single group. Otherwise they
// will be nested such that some of them break onto new lines but not all.
// Operators with the same precedence level should either all break or not.
// Because we group them by precedence level and the AST is structured based on
// precedence level, things are naturally broken up correctly, i.e. `&&` is
// broken before `+`.
function printBinaryishExpressions(
  path,
  options,
  print,
  isNested,
  isInsideParenthesis,
  breakLevels,
  level,
  prerun
) {
  const { node } = path

  // PENERE: Break all operands on this level if the source breaks any of them.
  breakLevels[level] ||= (
    level !== breakLevels.ignoredLevel &&
    isBinaryish(node) &&
    shouldBreakBinaryish(node, options)
  )
  const enforceBreak = breakLevels[level]
  const printArgs = { breakLevels, level, prerun }

  const wrapParts = parts => {
    if (!prerun && enforceBreak && parts.length > 0) {
      // Move the comments inside the parentheses.
      const printed = cleanDoc(printComments(path, parts, options))
      const printedParts = Array.isArray(printed)
        ? printed
        : printed.type === 'fill'
          ? printed.parts
          : [printed]
      delete node.comments
      return [group(printedParts, { shouldBreak: true })]
    }
    return parts
  }

  // Simply print the node normally.
  if (!isBinaryish(node)) {
    return wrapParts([group(print())])
  }

  /** @type{Doc[]} */
  let parts = []

  // We treat BinaryExpression and LogicalExpression nodes the same.

  // Put all operators with the same precedence level in the same group. The
  // reason we only need to do this with the `left` expression is because given
  // an expression like `1 + 2 - 3`, it is always parsed like `((1 + 2) - 3)`,
  // meaning the `left` side is where the rest of the expression will exist.
  // Binary expressions on the right side mean they have a difference precedence
  // level and should be treated as a separate group, so print them normally.
  // (This doesn't hold for the `**` operator, which is unique in that it is
  // right-associative.)
  if (shouldFlatten(node.operator, node.left.operator)) {
    // Flatten them out by recursively calling this function.
    parts = path.call(
      () =>
        printBinaryishExpressions(
          path,
          options,
          print,
          /* isNested */ true,
          isInsideParenthesis,
          breakLevels,
          level,
          prerun
        ),
      'left'
    )
  } else {
    parts.push(wrapParts([group(print('left', printArgs))]))
  }

  const shouldInline = (
    !enforceBreak &&
    shouldInlineLogicalExpression(node, path.parent, options)
  )
  const rightNodeToCheckComments =
    node.right.type === 'ChainExpression' ? node.right.expression : node.right
  const lineBeforeOperator = (
    (
      node.type === 'NGPipeExpression' ||
      node.operator === '|>' ||
      isVueFilterSequenceExpression(path, options)
    ) &&
    !hasLeadingOwnLineComment(
      options.originalText,
      rightNodeToCheckComments,
      options
    )
  )
  const hasTypeCastComment = !!rightNodeToCheckComments.comments?.some(
    comment => comment.leading && isTypeCastComment(comment, options)
  )
  const commentBeforeOperator = (
    !hasTypeCastComment &&
    hasLeadingOwnLineComment(
      options.originalText,
      rightNodeToCheckComments,
      options
    )
  )

  const operator = node.type === 'NGPipeExpression' ? '|' : node.operator
  const rightSuffix =
    node.type === 'NGPipeExpression' && node.arguments.length > 0
      ? group(
          indent([
            softline,
            ': ',
            join(
              [line, ': '],
              path.map(() => align(2, group(print())), 'arguments')
            )
          ])
        )
      : ''

  /** @type {Doc} */
  let right
  if (shouldInline) {
    const rightContent = print('right', printArgs)
    right = [
      operator,
      hasLeadingOwnLineComment(
        options.originalText,
        rightNodeToCheckComments,
        options
      )
        ? indent([line, rightContent, rightSuffix])
        : [' ', rightContent, rightSuffix]
    ]
  } else {
    const isHackPipeline = (
      operator === '|>' &&
      path.root.extra?.__isUsingHackPipeline
    )
    const rightContent = isHackPipeline
      ? path.call(
          () =>
            printBinaryishExpressions(
              path,
              options,
              print,
              /* isNested */ true,
              isInsideParenthesis,
              breakLevels,
              level,
              prerun
            ),
          'right'
        )
      : print('right', printArgs)
    if (options.experimentalOperatorPosition === 'start') {
      let comment = ''
      if (commentBeforeOperator) {
        if (Array.isArray(rightContent)) {
          comment = rightContent[0]
          rightContent.shift()
        } else if (rightContent?.type === 'label') {
          comment = rightContent.contents[0]
          rightContent.contents.shift()
        }
      }
      right = [line, comment, operator, ' ', rightContent, rightSuffix]
    } else if (
      !lineBeforeOperator && (
        isBreakingParenthesizedGroup(rightContent) ||
        isEmptyOperand(node.right)
      )
    ) {
      // PENERE: Keep the opening parenthesis of broken operands, and empty
      // operands on the line of the operator: `a && (`, `a ?? ''`.
      right = [operator, ' ', rightContent, rightSuffix]
    } else {
      right = [
        lineBeforeOperator ? line : '',
        operator,
        lineBeforeOperator ? ' ' : line,
        rightContent,
        rightSuffix
      ]
    }
  }

  // If there's only a single binary expression, we want to create a group in
  // order to avoid having a small right part like -1 be on its own line.
  const { parent } = path
  // PENERE: Take `enforceBreak` into account when deciding whether to group.
  const shouldBreak = (
    enforceBreak ||
    !!node.left.comments?.some(
      comment => comment.trailing && !options.printer.isBlockComment(comment)
    )
  )
  const shouldGroup = (
    shouldBreak || (
      !(isInsideParenthesis && isBinaryish(node)) &&
      parent.type !== node.type &&
      node.left.type !== node.type &&
      node.right.type !== node.type
    )
  )
  if (shouldGroup) {
    right = group(right, { shouldBreak })
  }

  if (options.experimentalOperatorPosition === 'start') {
    parts.push(shouldInline || commentBeforeOperator ? ' ' : '', right)
  } else {
    parts.push(lineBeforeOperator ? '' : ' ', right)
  }

  // The root comments are already printed, but we need to manually print the
  // other ones since we don't call the normal print on BinaryExpression, only
  // for the left and right parts
  if (isNested && hasComment(node)) {
    const printed = cleanDoc(printComments(path, parts, options))
    if (printed.type === 'fill') {
      return printed.parts
    }
    return Array.isArray(printed) ? printed : [printed]
  }

  return parts
}

// If an operand of a binaryish expression has parentheses of its own in the
// source, returns whether the source breaks after the opening one, and
// `undefined` otherwise. The parentheses that Penere prints around whole
// expressions, e.g. `= (` and `return (`, don't count.
function getBreakAfterOwnParenthesis(path, options) {
  const { node, parent } = path
  if (!isBinaryish(parent) || !isParenthesized(node, options)) {
    return undefined
  }
  const text = options.originalText
  const start = options.locStart(node)
  const opener = util.skipWhitespace(text, start - 1, { backwards: true })
  return util.hasNewlineInRange(text, opener, start)
}

// Whether the expression is the condition of an `if`, `while` or `do … while`
// statement, the breaks of which are handled by `conditionWrap`.
const isConditionTest = (path, options) => (
  path.key === 'test' &&
  ['IfStatement', 'WhileStatement', 'DoWhileStatement'].includes(
    path.parent.type
  ) &&
  isPreserved(options, 'conditionWrap')
)

// Whether the source breaks between any of the operands of the expression's
// level, i.e. the expression and its flattened left operands. Unlike
// `shouldBreakBinaryish()`, breaks after the opening parenthesis of a right
// operand don't count, e.g. in `a && (\n  b || c\n)`.
function isLevelBroken(node, options) {
  const text = options.originalText
  for (let current = node; isBinaryish(current); current = current.left) {
    const operator = util.getNextNonSpaceNonCommentCharacterIndex(
      text,
      options.locEnd(current.left)
    )
    const right = util.getNextNonSpaceNonCommentCharacterIndex(
      text,
      operator + current.operator.length
    )
    if (
      !isEmptyLiteral(current.right) &&
      util.hasNewlineInRange(text, options.locEnd(current.left), right)
    ) {
      return true
    }
    if (
      !isBinaryish(current.left) ||
      isParenthesized(current.left, options) ||
      !shouldFlatten(current.operator, current.left.operator)
    ) {
      return false
    }
  }
  return false
}

// Whether the operand is a logical expression nested in one with a lower
// precedence, e.g. `a && b` in `a && b || c`, where parentheses are optional.
// Operands with a lower precedence, e.g. `b || c` in `a && (b || c)`, require
// parentheses and get them like other nested binaryish expressions.
const isMixedLogical = (node, parent) => (
  node?.type === 'LogicalExpression' &&
  parent?.type === 'LogicalExpression' &&
  getPrecedence(node.operator) > getPrecedence(parent.operator)
)

// Whether the doc is a group that breaks between parentheses, as printed above:
// `group([ifBreak("("), indent([softline, ...]), softline, ifBreak(")")])`, or
// `["(", group([indent([softline, ...]), softline]), ")"]`.
function isBreakingParenthesizedGroup(printedDoc) {
  const parenthesized = (
    Array.isArray(printedDoc) &&
    printedDoc.length === 3 &&
    printedDoc[0] === '(' &&
    printedDoc[2] === ')'
  )
  const groupDoc = parenthesized ? printedDoc[1] : printedDoc
  const contents = groupDoc?.type === 'group' ? groupDoc.contents : null
  const [first] = Array.isArray(contents) ? contents : []
  return (
    (
      parenthesized
        ? first?.type === 'indent' || first?.type === 'indent-if-break'
        : first?.type === 'if-break' && first.breakContents === '('
    ) &&
    doc.utils.willBreak(groupDoc)
  )
}

// PENERE: Preserve breaks between the left and right operands, except before
// empty literals, which are kept on the operator's line.
export function shouldBreakBinaryish(node, options) {
  return (
    !isEmptyLiteral(node.right) &&
    util.hasNewlineInRange(
      options.originalText,
      options.locEnd(node.left),
      options.locStart(node.right)
    )
  )
}

// Empty literals, that never cause breaks before them.
const isEmptyLiteral = node => (
  (isLiteral(node) && node.value === '') ||
  (node.type === 'ObjectExpression' && node.properties.length === 0) ||
  (node.type === 'ArrayExpression' && node.elements.length === 0)
)

// Empty operands, that are kept on the line of the operator.
const isEmptyOperand = node => (
  isEmptyLiteral(node) || (
    node.type === 'TemplateLiteral' &&
    node.expressions.length === 0 &&
    node.quasis[0]?.value.raw === ''
  )
)

export function shouldInlineLogicalExpression(node, parent, options) {
  if (
    node.type !== 'LogicalExpression' &&
    // PENERE: Inline binary expressions too, except in conditionals.
    !(
      node.type === 'BinaryExpression' &&
      parent?.type !== 'ConditionalExpression'
    )
  ) {
    return false
  }

  // PENERE: Don't inline what breaks in the source.
  if (shouldBreakBinaryish(node, options)) {
    return false
  }

  const { right } = node
  return (
    // PENERE: Inline literals, and also empty objects and arrays.
    isLiteral(right) ||
    right.type === 'ObjectExpression' ||
    right.type === 'ArrayExpression' || ( // PENERE: Inline member expressions on object and array literals.
      right.type === 'MemberExpression' &&
      right.property.type === 'Identifier' &&
      ['ObjectExpression', 'ArrayExpression'].includes(right.object.type)
    ) ||
    isJsxElement(right)
  )
}

const isBitwiseOrExpression = node => (
  node.type === 'BinaryExpression' &&
  node.operator === '|'
)

function isVueFilterSequenceExpression(path, options) {
  return (
    (
      options.parser === '__vue_expression' ||
      options.parser === '__vue_ts_expression'
    ) &&
    isBitwiseOrExpression(path.node) &&
    !path.hasAncestor(
      node => !isBitwiseOrExpression(node) && node.type !== 'JsExpressionRoot'
    )
  )
}
