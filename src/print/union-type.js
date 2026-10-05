import { util } from 'prettier'
import { isDocType, isPreserved } from '../utils.js'

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
    return { ...unionDoc, break: true }
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

// Whether the union spans multiple lines in the source, including a line break
// before its leading `|`:
//
//   type Method =
//     | 'get' | 'post'
function spansMultipleLines(node, options) {
  const text = options.originalText
  let start = options.locStart(node)
  // The leading `|` may or may not be part of the node, depending on the parser.
  const pipe =
    text[start] === '|'
      ? start
      : util.skipWhitespace(text, start - 1, { backwards: true })
  if (pipe !== false && text[pipe] === '|') {
    start = util.skipWhitespace(text, pipe - 1, { backwards: true }) || 0
  }
  return util.hasNewlineInRange(text, start, options.locEnd(node))
}
