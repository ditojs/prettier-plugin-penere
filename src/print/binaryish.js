import { doc, util } from 'prettier'
import {
  hasLeadingOwnLineComment,
  isTypeCastComment,
  printComments,
  printLeadingComments
} from '../comments.js'
import { cleanDoc } from '../doc-utils.js'
import { isPreserved } from '../utils.js'
import { shouldFlatten as shouldFlattenOperators } from '../precedence.js'
import { isAssignedValue } from './assignment.js'
import { isConditionStatement } from './condition.js'
import { hasOperandParentheses, isParenthesized } from './parentheses.js'

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

// The TypeScript and Flow operators after an expression: `!`, `as`, `satisfies`.
const isPostfixTypeOperation = node =>
  [
    'TSNonNullExpression',
    'TSAsExpression',
    'TSSatisfiesExpression',
    'AsExpression',
    'AsConstExpression',
    'SatisfiesExpression'
  ].includes(node?.type)

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
  const breakLevels = args?.breakLevels ?? {
    ...(isConditionTest(path, options) ? { ignoredLevel: 0 } : {}),
    hugs: {}
  }
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

  moveCommentsIntoParentheses(node, options)

  // PENERE: If an operand has its own parentheses in the source, the line break
  // after `(` decides whether its level breaks, like the `{` of objects, and
  // breaks between its operands don't count.
  const breaksAfterParenthesis = getBreakAfterOwnParenthesis(path, options)

  // PENERE: Expressions wrapped when they break only hug a starting operand.
  const isUnhugged = (
    isRoot &&
    isWrappedWhenBroken(path, options) &&
    !getStartingParentheses(node, options)
  )
  const ownLevel = isFlattened ? level : level + 1
  let levelBreaks
  const callPrint = prerun => {
    levelBreaks = isFlattened
      ? breakLevels
      : { ...breakLevels, hugs: { ...breakLevels.hugs } }
    if (breaksAfterParenthesis !== undefined) {
      levelBreaks.ignoredLevel = ownLevel
      levelBreaks[ownLevel] = breaksAfterParenthesis
    }
    if (isUnhugged) {
      levelBreaks.unhuggedLevel = ownLevel
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
  const isHugging = !levelBreaks[ownLevel] && levelBreaks.hugs[ownLevel]

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
  if (
    (key === 'callee' && isCallOrNewExpression(parent)) ||
    // `UnaryExpression` adds parentheses and indention when argument has comment
    (parent.type === 'UnaryExpression' && !hasComment(node)) ||
    (isMemberExpression(parent) && !parent.computed) ||
    // PENERE: Also break between the parens before `!`, `as` and `satisfies`.
    (key === 'expression' && isPostfixTypeOperation(parent)) ||
    (parent.type === 'ConditionalExpression' && key === 'test') || (
      // PENERE: Break between the parens of nested expressions that have them,
      // or get them because they break on their own: `a || (`.
      isBinaryish(parent) && (
        hasParentheses || (
          isLevelBroken(node, options) && (
            !args?.breakLevels[args.level] ||
            // `&&` in a broken `||` relies on precedence:
            !(node.operator === '&&' && parent.operator === '||')
          )
        )
      )
    )
  ) {
    // PENERE: Add parens when going multiline, unless there are parens already.
    const addParentheses = (
      (isBinaryish(parent) || parent.type === 'ConditionalExpression') &&
      !hasParentheses
    )
    // PENERE: Keep comments after `(` inside the parentheses.
    const comments =
      (
        hasParentheses &&
        !args?.prerun &&
        node.comments?.some(comment => comment.isInsideParentheses)
      )
        ? printLeadingComments(path, options)
        : ''
    if (comments) {
      node.comments = node.comments.filter(comment => !comment.leading)
    }
    if (isHugging && hasParentheses && isBinaryish(parent)) {
      // PENERE: Hug a level that stays around its broken operands: `(a && (`.
      return group([comments, ...parts])
    }
    const indented = [indent([softline, comments, ...parts]), softline]
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
    // PENERE: Line up the operands of nested expressions and of the ones that
    // start their own line: arguments, elements, statements, computed keys.
    (
      isBinaryish(parent) ||
      isCallLikeExpression(parent) ||
      parent.type === 'ArrayExpression' ||
      parent.type === 'ExpressionStatement' ||
      (key === 'property' && isMemberExpression(parent) && parent.computed)
    )
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
    isPairBroken(node, options)
  )
  // PENERE: An unbroken level hugs operands that break inside. Where it can't,
  // it breaks, unless the second of only two breaks: `a || (` looks the same.
  const isOnlyPair = (
    !(
      isBinaryish(path.parent) &&
      path.key === 'left' &&
      shouldFlatten(path.parent.operator, node.operator)
    ) &&
    !(
      isBinaryish(node.left) && shouldFlatten(node.operator, node.left.operator)
    )
  )
  const isLeftBreakingInside = (
    isBinaryish(node) &&
    !shouldFlatten(node.operator, node.left.operator) &&
    breaksInside(node, 'left', options)
  )
  const isRightBreakingInside = (
    isBinaryish(node) &&
    breaksInside(node, 'right', options)
  )
  if (level === breakLevels.unhuggedLevel) {
    breakLevels[level] ||= (
      isLeftBreakingInside ||
      (isRightBreakingInside && !isOnlyPair)
    )
  } else {
    breakLevels.hugs[level] ||= isLeftBreakingInside || isRightBreakingInside
  }
  const printArgs = { breakLevels, level, prerun }

  const wrapParts = parts => {
    if (!prerun && breakLevels[level] && parts.length > 0) {
      // Move the leading comments inside the parentheses. Trailing comments
      // stay after the expression.
      const printed = cleanDoc([printLeadingComments(path, options), ...parts])
      const printedParts = Array.isArray(printed)
        ? printed
        : printed.type === 'fill'
          ? printed.parts
          : [printed]
      node.comments = node.comments?.filter(comment => !comment.leading)
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
    // PENERE: Push the group itself, so the chain can find the leftmost operand.
    parts.push(...wrapParts([group(print('left', printArgs))]))
  }

  const shouldInline = (
    !breakLevels[level] &&
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
      // PENERE: The operators of a hugging level stay on their line: `) / h`.
      const isHugging = !breakLevels[level] && breakLevels.hugs[level]
      right = [
        lineBeforeOperator ? line : '',
        operator,
        lineBeforeOperator || isHugging ? ' ' : line,
        rightContent,
        rightSuffix
      ]
    }
  }

  // If there's only a single binary expression, we want to create a group in
  // order to avoid having a small right part like -1 be on its own line.
  const { parent } = path
  // PENERE: Group by the breaks of the level, known once its left is printed.
  const shouldBreak = (
    breakLevels[level] ||
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
  const { node, parent, key } = path
  return isBinaryish(parent) && hasWrittenParentheses(parent, key, options)
    ? hasBreakAfterParenthesis(node, options)
    : undefined
}

const hasBreakAfterParenthesis = (node, options) => {
  const text = options.originalText
  const start = options.locStart(node)
  const opener = util.skipWhitespace(text, start - 1, { backwards: true })
  return util.hasNewlineInRange(text, opener, start)
}

// Whether the operand at `key` of a binaryish node has parentheses in the
// source that it keeps.
const hasWrittenParentheses = (node, key, options) => (
  isParenthesized(node[key], options) &&
  hasOperandParentheses(node[key], node, key, options)
)

// Whether the operand at `key` of a binaryish node prints in broken
// parentheses: written ones with a break after `(`, or added ones.
function isBrokenOperand(node, key, options) {
  const operand = node[key]
  return (
    isBinaryish(operand) &&
    // Left operands of the same precedence are part of the level:
    !(key === 'left' && shouldFlatten(node.operator, operand.operator)) && (
      hasWrittenParentheses(node, key, options)
        ? hasBreakAfterParenthesis(operand, options)
        : (
            hasOperandParentheses(operand, node, key, options) ||
            !shouldFlatten(node.operator, operand.operator)
          ) &&
          isLevelBroken(operand, options)
    )
  )
}

// Whether the operand at `key` of a binaryish node breaks inside, in broken
// parentheses, or in an unbroken level of its own that has such an operand.
function breaksInside(node, key, options) {
  const operand = node[key]
  let breaks = false
  if (isBinaryish(operand)) {
    const hasOperandBreakingInside = () => (
      breaksInside(operand, 'right', options) ||
      breaksInside(operand, 'left', options)
    )
    if (key === 'left' && shouldFlatten(node.operator, operand.operator)) {
      breaks = hasOperandBreakingInside()
    } else {
      const isOperandLevelBroken = hasWrittenParentheses(node, key, options)
        ? hasBreakAfterParenthesis(operand, options)
        : isLevelBroken(operand, options)
      breaks = (
        isBrokenOperand(node, key, options) ||
        (!isOperandLevelBroken && hasOperandBreakingInside())
      )
    }
  }
  return breaks
}

// Returns 'written' or 'added' for the parentheses of a broken first operand
// that take the place of the wrapping ones, as in `(` … `) / h`, and null if
// the expression doesn't start with one or breaks after it.
export function getStartingParentheses(node, options) {
  for (let current = node; isBinaryish(current); current = current.left) {
    const { left } = current
    if (isPairBroken(current, options) || !isBinaryish(left)) {
      return null
    }
    if (!shouldFlatten(current.operator, left.operator)) {
      const isStarting = (
        isBrokenOperand(current, 'left', options) &&
        !util.hasNewlineInRange(
          options.originalText,
          getLeftOperandEnd(left, options),
          options.locEnd(node)
        )
      )
      return isStarting
        ? hasWrittenParentheses(current, 'left', options)
          ? 'written'
          : 'added'
        : null
    }
  }
  return null
}

// Whether Penere wraps the expression in parentheses when it breaks: after
// `=`, `return`, `throw` and `=>`, and in the `(` of conditions.
const isWrappedWhenBroken = (path, options) => {
  const { parent, key } = path
  return (
    ['ReturnStatement', 'ThrowStatement'].includes(parent.type) ||
    (key === 'test' && isConditionStatement(parent)) ||
    (key === 'body' && parent.type === 'ArrowFunctionExpression') || (
      isAssignedValue(path) && (
        hasLeadingOwnLineComment(options.originalText, path.node, options) ||
        !shouldInlineLogicalExpression(path.node, parent, options)
      )
    )
  )
}

// Moves the node's leading comments that follow an opening parenthesis in the
// source to the operand on its left whose `(` they follow, and marks them to
// be printed inside it: `((\n  // Comment\n  a && b\n) || c)`.
function moveCommentsIntoParentheses(node, options) {
  const comments = node.comments?.filter(
    comment => comment.leading && !comment.isInsideParentheses
  )
  if (comments?.length) {
    const text = options.originalText
    let count = 0
    const skip = index =>
      util.skipWhitespace(text, index - 1, { backwards: true })
    for (
      let index = skip(options.locStart(comments[0]));
      text[index] === '(';
      index = skip(index)
    ) {
      count++
    }
    let target = node
    for (
      let i = 1;
      i < count &&
      isBinaryish(target.left) &&
      isParenthesized(target.left, options);
      i++
    ) {
      target = target.left
    }
    if (target !== node) {
      node.comments = node.comments.filter(
        comment => !comments.includes(comment)
      )
      target.comments = [...comments, ...(target.comments ?? [])]
    }
    if (count > 0) {
      for (const comment of comments) {
        comment.isInsideParentheses = true
      }
    }
  }
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
// level, i.e. the expression and its flattened left operands.
function isLevelBroken(node, options) {
  for (let current = node; isBinaryish(current); current = current.left) {
    if (isPairBroken(current, options)) {
      return true
    }
    // Left operands of the same precedence are part of the level, also in
    // parentheses, which the printer drops, like stock Prettier.
    if (
      !isBinaryish(current.left) ||
      !shouldFlatten(current.operator, current.left.operator)
    ) {
      return false
    }
  }
  return false
}

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
// empty operands, which are kept on the operator's line. Breaks inside the
// parentheses around binaryish operands belong to them.
export function shouldBreakBinaryish(node, options) {
  return (
    !isEmptyOperand(node.right) &&
    util.hasNewlineInRange(
      options.originalText,
      getLeftOperandEnd(node.left, options),
      getRightOperandStart(node, options)
    )
  )
}

// The start of a node's right operand, at the `(` of binaryish ones.
function getRightOperandStart(node, options) {
  return isBinaryish(node.right)
    ? util.getNextNonSpaceNonCommentCharacterIndex(
        options.originalText,
        getOperatorEnd(node, options)
      )
    : options.locStart(node.right)
}

// The end of a binaryish node's operator in the source.
function getOperatorEnd(node, options) {
  const text = options.originalText
  let operator = util.getNextNonSpaceNonCommentCharacterIndex(
    text,
    getLeftOperandEnd(node.left, options)
  )
  while (text[operator] === ')') {
    operator = util.getNextNonSpaceNonCommentCharacterIndex(text, operator + 1)
  }
  return operator + node.operator.length
}

// Whether the source breaks between the node's operands, apart from breaks
// before broken parentheses, whose `(` stays on the operator's line.
function isPairBroken(node, options) {
  return (
    shouldBreakBinaryish(node, options) &&
    !isBrokenOperand(node, 'right', options)
  )
}

// The end of a left operand, after the closing parentheses around binaryish
// ones, which Penere keeps. Breaks before the parentheses that it drops count.
function getLeftOperandEnd(node, options) {
  const text = options.originalText
  let end = options.locEnd(node)
  if (isBinaryish(node)) {
    let next = util.getNextNonSpaceNonCommentCharacterIndex(text, end)
    while (text[next] === ')') {
      end = next + 1
      next = util.getNextNonSpaceNonCommentCharacterIndex(text, end)
    }
  }
  return end
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
