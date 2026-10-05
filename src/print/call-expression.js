import { doc, util } from 'prettier'
import {
  isDocType,
  isPreserved,
  replaceDocs,
  shouldPrintTrailingComma
} from '../utils.js'

const { group, hardline, ifBreak, indent, join, label, line } = doc.builders

export const isCallLikeExpression = node =>
  [
    'CallExpression',
    'OptionalCallExpression',
    'NewExpression',
    'ImportExpression'
  ].includes(node?.type)

export const isCallArgument = path => (
  path.key === 'arguments' &&
  isCallLikeExpression(path.parent)
)

const isMemberExpression = node => (
  node?.type === 'MemberExpression' ||
  node?.type === 'OptionalMemberExpression'
)

const isMemberish = node => (
  isMemberExpression(node) ||
  (node?.type === 'BindExpression' && !!node.object)
)

const isCallExpression = node => (
  node?.type === 'CallExpression' ||
  node?.type === 'OptionalCallExpression'
)

/*
Called for call-like nodes, with the docs of all call arguments printed within
the node, by call. With member chains, the node's printer also prints the
arguments of all other calls in the chain.

Stock Prettier prints arguments in `printCallArguments()` as a group of

  ["(", indent([softline, ...printedArguments]), trailingComma, softline, ")"]

or a `conditionalGroup()` for first / last argument expansion, the last state
of which is `allArgsBrokenOut()`, or `["(", ...args, ")"]` for React hooks.
`printedArguments` are `[argument, ",", line]`, except for the last one.
*/
export function printCall(
  callDoc,
  path,
  options,
  { argumentDocs, childDocs, nodeDocs }
) {
  const breakingCalls = new Map(
    [...argumentDocs]
      .filter(([call, docs]) => shouldBreakArguments(call, docs, options))
      .map(([call, docs]) => [docs[0], { call, docs }])
  )

  // `printedArguments` entries are either `[argument, ",", line]` or the bare
  // argument doc, which itself is an array (see `print()` in index.js).
  const startsWithArgument = doc => (
    breakingCalls.get(doc) ??
    (Array.isArray(doc) ? breakingCalls.get(doc[0]) : undefined)
  )

  // First expand member chains, then break arguments, also in the expanded
  // chains (`replaceDocs()` doesn't descend into replaced docs).
  if (shouldBreakMemberChain(path.node, options)) {
    callDoc = replaceDocs(
      callDoc,
      doc =>
        isMemberChain(doc)
          ? printMemberChainExpanded(doc)
          : printShortMemberChainExpanded(doc, path, options, nodeDocs),
      childDocs
    )
  }

  return replaceDocs(
    callDoc,
    doc => {
      // `conditionalGroup()`: its last state is `allArgsBrokenOut()`.
      if (doc.expandedStates) {
        const lastState = doc.expandedStates.at(-1)
        const contents = lastState.contents ?? lastState
        if (contents[0] === '(' && isDocType(contents[1], 'indent')) {
          const call = startsWithArgument(contents[1].contents[1])
          if (call) {
            return printAllArgumentsBrokenOut(call, path, options)
          }
        }
        return
      }
      const contents = isDocType(doc, 'group') ? doc.contents : doc
      if (!Array.isArray(contents) || contents[0] !== '(') {
        return
      }
      const call = isDocType(contents[1], 'indent')
        ? startsWithArgument(contents[1].contents[1])
        : // React hook calls with dependency arrays.
          startsWithArgument(contents[1])
      if (call) {
        return printAllArgumentsBrokenOut(call, path, options)
      }
    },
    childDocs
  )
}

// Preserve line breaks in call arguments: if the source breaks before the first
// argument, break all of them.
function shouldBreakArguments(call, argumentDocs, options) {
  const args = call.arguments
  const opener = (
    call.typeArguments ??
    call.typeParameters ??
    call.callee ??
    null
  )
  return (
    isPreserved(options, 'argumentWrap') &&
    argumentDocs.length === args.length &&
    args.length > 0 &&
    util.hasNewlineInRange(
      options.originalText,
      opener ? options.locEnd(opener) : options.locStart(call),
      options.locStart(args[0])
    )
  )
}

// Mirrors `allArgsBrokenOut()` in `printCallArguments()`.
function printAllArgumentsBrokenOut({ call, docs }, path, options) {
  const args = call.arguments
  const printedArguments = docs.map((argumentDoc, index) =>
    index === args.length - 1
      ? argumentDoc
      : util.isNextLineEmpty(options.originalText, options.locEnd(args[index]))
        ? [argumentDoc, ',', hardline, hardline]
        : [argumentDoc, ',', line]
  )
  const trailingComma =
    (
      path.root.type !== 'NGRoot' &&
      call.type !== 'ImportExpression' &&
      shouldPrintTrailingComma(options, 'all')
    )
      ? ifBreak(',')
      : ''
  return group(
    ['(', indent([line, ...printedArguments]), trailingComma, line, ')'],
    { shouldBreak: true }
  )
}

const isMemberChain = doc => isDocType(doc, 'label') && doc.label?.memberChain

// Stock Prettier labels member chains, with either `group(expanded)` or
// `[breakParent | "", conditionalGroup([oneLine, expanded])]` as contents.
function printMemberChainExpanded(memberChainDoc) {
  const [, conditional] = Array.isArray(memberChainDoc.contents)
    ? memberChainDoc.contents
    : []
  return conditional?.expandedStates?.length === 2
    ? { ...memberChainDoc, contents: group(conditional.expandedStates[1]) }
    : memberChainDoc
}

// Mirrors the traversal in stock Prettier's `printMemberChain()`: the nodes of
// the chain, from its head to the outermost call. Calls are only part of the
// chain if their callee is, so the head of `expect(a).toBe(b)` is `expect(a)`.
function getMemberChainNodes(node) {
  const nodes = [node]
  let current = node.callee
  while (current) {
    if (
      isCallExpression(current) &&
      (isMemberish(current.callee) || isCallExpression(current.callee))
    ) {
      nodes.unshift(current)
      current = current.callee
    } else if (isMemberish(current)) {
      nodes.unshift(current)
      current = current.object
    } else if (current.type === 'ChainExpression') {
      current = current.expression
    } else if (current.type === 'TSNonNullExpression') {
      nodes.unshift(current)
      current = current.expression
    } else {
      nodes.unshift(current)
      current = null
    }
  }
  return nodes
}

/*
Chains with no more than 2 groups (3 if the first two are merged) are printed by
stock Prettier as `group(oneLine)`, where `oneLine` holds the printed nodes of
each group, without ever printing the expanded form. Recognize it by the head of
the chain, and build the expanded form here, mirroring `printMemberChain()`.
*/
function printShortMemberChainExpanded(doc, path, options, nodeDocs) {
  const groups = isDocType(doc, 'group') ? doc.contents : null
  const nodes = getMemberChainNodes(path.node)
  if (
    !Array.isArray(groups) ||
    groups.length < 2 ||
    !groups.every(Array.isArray) ||
    groups[0][0] !== nodeDocs.get(nodes[0]) ||
    groups.flat().length !== nodes.length
  ) {
    return
  }
  const merged = shouldMergeFirstGroup(groups, nodes, path, options) ? 2 : 1
  if (groups.length <= merged) {
    return
  }
  return label(
    { memberChain: true },
    group([
      ...groups.slice(0, merged),
      indent([hardline, join(hardline, groups.slice(merged))])
    ])
  )
}

// Mirrors `shouldMerge` in stock Prettier's `printMemberChain()`.
function shouldMergeFirstGroup(groups, nodes, path, options) {
  const firstGroupLength = groups[0].length
  const secondGroupHead = nodes[firstGroupLength]
  if (secondGroupHead.comments?.length) {
    return false
  }
  const isFactory = name => /^[A-Z]|^[$_]+$/.test(name)
  const hasComputed = !!secondGroupHead.computed
  if (firstGroupLength === 1) {
    const [head] = nodes
    const statement =
      path.parent.type === 'ChainExpression' ? path.grandparent : path.parent
    return (
      head.type === 'ThisExpression' || (
        head.type === 'Identifier' && (
          isFactory(head.name) || (
            statement.type === 'ExpressionStatement' &&
            head.name.length <= options.tabWidth
          ) ||
          hasComputed
        )
      )
    )
  }
  const last = nodes[firstGroupLength - 1]
  return (
    isMemberExpression(last) &&
    last.property?.type === 'Identifier' &&
    (isFactory(last.property.name) || hasComputed)
  )
}

/*
Respect the original line break after the first line of a member chain: the
chain is expanded if the source breaks right before any member up to the first
call, e.g.

  object
    .foo()
    .bar()

*/
function shouldBreakMemberChain(node, options) {
  if (
    !isPreserved(options, 'memberChainWrap') ||
    !isMemberish(node.callee)
  ) {
    return false
  }
  // The members from the head of the chain up to the first call.
  const nodes = getMemberChainNodes(node)
  const firstCallIndex = nodes.findIndex(
    (node, index) => index > 0 && isCallExpression(node)
  )
  return nodes
    .slice(1, firstCallIndex)
    .some(member => hasNewlineBeforeMember(member, options))
}

// Only look at the whitespace right before the `.`, `?.` or `[`, so that line
// breaks inside the head, e.g. `(\n  await foo()\n).trim()`, don't count.
function hasNewlineBeforeMember(member, options) {
  if (!isMemberExpression(member) || !member.property) {
    return false
  }
  const text = options.originalText
  let opener = text.lastIndexOf(
    member.computed ? '[' : '.',
    options.locStart(member.property)
  )
  if (text[opener - 1] === '?') {
    opener--
  }
  const previous = util.skipWhitespace(text, opener - 1, { backwards: true })
  return previous !== false && util.hasNewlineInRange(text, previous, opener)
}
