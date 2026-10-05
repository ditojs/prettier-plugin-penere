import { isPreserved } from '../utils.js'
import { doc, util } from 'prettier'

const {
  addAlignmentToDoc,
  align,
  group,
  hardline,
  indent,
  lineSuffixBoundary,
  softline
} = doc.builders

export const isTemplateLiteral = node => (
  node?.type === 'TemplateLiteral' || node?.type === 'TSTemplateLiteralType'
)

const getExpressions = node =>
  node.type === 'TSTemplateLiteralType' ? node.types : node.expressions

/*
Rebuilds the interpolations of template literals, which stock Prettier prints
in `printTemplateLiteral()` as

  [lineSuffixBoundary, "`", ...[quasi, group(["${", expression, lineSuffixBoundary, "}"])], "`"]

Stock Prettier never breaks an interpolation that is on one line in the source,
and only breaks at the `${` and `}` boundaries for some expression types.
Penere always allows breaking at the boundaries, and keeps them broken if the
source breaks after `${`.
*/
export function printTemplateLiteral(templateDoc, path, options, nodeDocs) {
  const { node } = path
  const expressions = getExpressions(node)
  const expressionDocs = expressions.map(expression => nodeDocs.get(expression))
  if (
    !isPreserved(options, 'templateLiteralWrap') ||
    !expressions.length ||
    expressionDocs.some(doc => doc === undefined) ||
    // Jest `each` tables are printed differently.
    !Array.isArray(templateDoc) ||
    templateDoc[1] !== '`' ||
    templateDoc.length !== node.quasis.length + 3
  ) {
    return templateDoc
  }

  let previousIndentSize = 0
  const parts = node.quasis.map((quasi, index) => {
    const [quasiDoc] = templateDoc[index + 2]
    const text = quasi.value.raw
    // Mirrors `getTemplateLiteralExpressionIndent()` in stock Prettier.
    const indentSize = text.includes('\n')
      ? util.getIndentSize(text, options.tabWidth)
      : previousIndentSize
    previousIndentSize = indentSize
    if (index === expressions.length) {
      return [quasiDoc, '']
    }

    const expression = expressions[index]
    let expressionDoc = expressionDocs[index]
    const shouldBreak = util.hasNewlineInRange(
      options.originalText,
      options.locEnd(quasi),
      options.locStart(expression)
    )
    const line = shouldBreak ? hardline : softline
    // Unions print their own line breaks, see `printUnionType()`.
    expressionDoc =
      Array.isArray(expressionDoc) || expression.type !== 'TSUnionType'
        ? [indent([line, expressionDoc]), line]
        : shouldBreak
          ? [{ ...expressionDoc, break: true }, line]
          : expressionDoc
    expressionDoc =
      indentSize === 0 && text.endsWith('\n')
        ? align(Number.NEGATIVE_INFINITY, expressionDoc)
        : addAlignmentToDoc(expressionDoc, indentSize, options.tabWidth)
    return [
      quasiDoc,
      group(['${', expressionDoc, lineSuffixBoundary, '}'])
    ]
  })

  return [templateDoc[0], '`', ...parts, '`']
}
