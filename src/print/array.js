import { doc, util } from 'prettier'
import {
  getOption,
  hasComment,
  isDocType,
  isLineComment,
  isPreserved,
  isStringLiteral
} from '../utils.js'

const { fill, hardline, ifBreak, line } = doc.builders

/*
Adjusts the doc stock Prettier prints for:
- `ArrayExpression`
- `ArrayPattern`
- `TSTupleType`(TypeScript)
- `TupleTypeAnnotation`(Flow)

Expected shape (see `printArray()` in prettier/src/language-js/print/array.js):

  [
    group(["[", indent([softline, elements, danglingComments]), softline, "]"]),
    optionalToken,
    typeAnnotation,
  ]

where `elements` is either `[parts, trailingComma]`, with `parts` alternating
between elements and `[",", line, softline | ""]` separators, or a `fill()` of
`[element, ","]` and separator lines for concisely printed arrays. If the shape
doesn't match, the doc is returned unchanged, falling back to stock Prettier.
*/
export function printArray(arrayDoc, path, options) {
  const { node } = path
  const elements = node.elementTypes ?? node.elements
  const [group, ...rest] = Array.isArray(arrayDoc) ? arrayDoc : []
  const [open, indent, ...close] = isDocType(group, 'group')
    ? group.contents
    : []
  const [softline, content, dangling] = isDocType(indent, 'indent')
    ? indent.contents
    : []
  if (!elements?.length || open !== '[' || !content) {
    return arrayDoc
  }

  const isFill = isDocType(content, 'fill')
  const isList = Array.isArray(content) && Array.isArray(content[0])
  if (!isFill && !isList) {
    return arrayDoc
  }

  const { originalText: text, locStart, locEnd } = options
  const hasNewlineBetween = (a, b) =>
    util.hasNewlineInRange(text, a ? locEnd(a) : locStart(node), locStart(b))

  // Respect the original line break before the first and between the first and
  // second element.
  const [firstElement, secondElement] = elements
  const firstBreak = (
    isPreserved(options, 'arrayWrap') &&
    !!firstElement &&
    hasNewlineBetween(null, firstElement)
  )
  const secondBreak = (
    firstBreak &&
    !!secondElement &&
    hasNewlineBetween(firstElement, secondElement)
  )
  const breakAfter = index => {
    const element = elements[index]
    const next = elements[index + 1]
    return (
      secondBreak ||
      (firstBreak && !!element && !!next && hasNewlineBetween(element, next))
    )
  }

  const shouldBreak = (
    firstBreak ||
    // Stock Prettier also breaks arrays with more than one element, if all are
    // objects or arrays with more than one item. Its other reason to break is a
    // dangling line comment, which we need to keep.
    (
      getOption(options, 'breakComplexArrayItems')
        ? group.break
        : hasComment(
            node,
            comment => (
              !comment.leading &&
              !comment.trailing &&
              isLineComment(comment, options)
            )
          )
    )
  )

  const elementsDoc = isFill
    ? printFill(content.parts, breakAfter)
    : shouldPrintStringsConcisely(node, options)
      ? printFill(listToFillParts(content, group.id, path, options), breakAfter)
      : printList(content, breakAfter)

  return [
    {
      ...group,
      break: shouldBreak,
      contents: [
        open,
        { ...indent, contents: [softline, elementsDoc, dangling] },
        ...close
      ]
    },
    ...rest
  ]
}

function printList([parts, trailingComma], breakAfter) {
  return [
    parts.map((part, index) =>
      // Separators are at odd indices: `[",", line, softline | ""]`.
      index % 2 === 1 && breakAfter((index - 1) / 2)
        ? [part[0], hardline, ...part.slice(2)]
        : part
    ),
    trailingComma
  ]
}

function printFill(parts, breakAfter) {
  return fill(
    parts.map((part, index) =>
      // Separators are at odd indices, and only plain `line`s may be upgraded.
      index % 2 === 1 && isDocType(part, 'line') && breakAfter((index - 1) / 2)
        ? hardline
        : part
    )
  )
}

// Converts the parts of a list-printed array into those of a concisely printed
// one, mirroring `printArrayElementsConcisely()` in stock Prettier.
function listToFillParts([parts, trailingComma], groupId, path, options) {
  const elements = path.node.elements
  const lastComma = isDocType(trailingComma, 'if-break')
    ? ifBreak(',', '', { groupId })
    : trailingComma
  return parts.map((part, index) => {
    if (index % 2 === 0) {
      const isLast = index === parts.length - 1
      return [part, isLast ? lastComma : ',']
    }
    const [, , emptyLine] = part
    const next = elements[(index + 1) / 2]
    return emptyLine
      ? [hardline, hardline]
      : hasComment(
            next,
            comment => comment.leading && isLineComment(comment, options)
          )
        ? hardline
        : line
  })
}

// Stock Prettier fills arrays of numbers concisely. Treat strings the same way,
// under the same conditions.
function shouldPrintStringsConcisely(node, options) {
  return (
    getOption(options, 'conciseStringArrays') &&
    node.type === 'ArrayExpression' &&
    node.elements.every(
      element => (
        isStringLiteral(element) &&
        !hasComment(
          element,
          comment => (
            comment.trailing &&
            isLineComment(comment, options) &&
            !util.hasNewline(options.originalText, options.locStart(comment), {
              backwards: true
            })
          )
        )
      )
    )
  )
}
