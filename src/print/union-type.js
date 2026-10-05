import { doc, util } from 'prettier'
import { isDocType, isPreserved } from '../utils.js'

const { hardline, indent } = doc.builders

// The group of `| type` parts in `printUnionType()`.
const isUnionGroup = doc => (
  isDocType(doc, 'group') &&
  Array.isArray(doc.contents) &&
  Array.isArray(doc.contents[0]) &&
  isDocType(doc.contents[0][0], 'if-break')
)

/*
Adjusts the doc stock Prettier prints for union types in `printUnionType()`,
which ends with either `group(indent([softline, printed]))` or `printed`, where
`printed` is the group of `| type` parts. Other shapes (hugged unions, unions in
parentheses or tuples) are left alone.
*/
export function printUnionType(unionDoc, path, options) {
  const { node } = path
  if (
    !isPreserved(options, 'unionTypeWrap') ||
    !spansMultipleLines(node, options)
  ) {
    return unionDoc
  }
  if (isUnionGroup(unionDoc)) {
    const broken = { ...unionDoc, break: true }
    // Keep a line break after the `?` or `:` of conditional types:
    //
    //   X extends Y
    //     ?
    //         | A
    //         | B
    //     : C
    return isConditionalBranch(path) && hasNewlineAfterOperator(node, options)
      ? indent([hardline, broken])
      : broken
  }
  const indented = isDocType(unionDoc, 'group') ? unionDoc.contents : null
  if (isDocType(indented, 'indent') && isUnionGroup(indented.contents[1])) {
    const [softline, printed] = indented.contents
    return {
      ...unionDoc,
      contents: {
        ...indented,
        contents: [softline, { ...printed, break: true }]
      }
    }
  }
  return unionDoc
}

const isConditionalBranch = path => (
  (path.key === 'trueType' || path.key === 'falseType') && (
    path.parent.type === 'TSConditionalType' ||
    path.parent.type === 'ConditionalTypeAnnotation'
  )
)

// The position of the leading `|`, which may or may not be part of the node,
// depending on the parser.
function getLeadingPipe(node, options) {
  const text = options.originalText
  const start = options.locStart(node)
  const pipe =
    text[start] === '|'
      ? start
      : util.skipWhitespace(text, start - 1, { backwards: true })
  return pipe !== false && text[pipe] === '|' ? pipe : -1
}

function hasNewlineAfterOperator(node, options) {
  const text = options.originalText
  const pipe = getLeadingPipe(node, options)
  const operator =
    pipe === -1
      ? false
      : util.skipWhitespace(text, pipe - 1, { backwards: true })
  return (
    operator !== false &&
    (text[operator] === '?' || text[operator] === ':') &&
    util.hasNewlineInRange(text, operator, pipe)
  )
}

// Whether the union spans multiple lines in the source, including a line break
// before its leading `|`:
//
//   type Method =
//     | 'get' | 'post'
function spansMultipleLines(node, options) {
  const text = options.originalText
  const pipe = getLeadingPipe(node, options)
  const start =
    pipe === -1
      ? options.locStart(node)
      : util.skipWhitespace(text, pipe - 1, { backwards: true }) || 0
  return util.hasNewlineInRange(text, start, options.locEnd(node))
}
