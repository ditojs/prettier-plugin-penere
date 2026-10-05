import { doc, util } from 'prettier'

// Mirrors the comment printing in prettier/src/main/comments/print.js, which
// stock Prettier doesn't expose to plugins.

const { breakParent, hardline, line, lineSuffix } = doc.builders

function printComment(path, options) {
  const comment = path.node
  comment.printed = true
  return options.printer.printComment(path, options)
}

function printLeadingComment(path, options) {
  const comment = path.node
  const parts = [printComment(path, options)]
  const { printer, originalText, locStart, locEnd } = options
  if (printer.isBlockComment?.(comment)) {
    let lineBreak = ' '
    if (util.hasNewline(originalText, locEnd(comment))) {
      lineBreak = util.hasNewline(originalText, locStart(comment), {
        backwards: true
      })
        ? hardline
        : line
    }
    parts.push(lineBreak)
  } else {
    parts.push(hardline)
  }
  const index = util.skipNewline(
    originalText,
    util.skipSpaces(originalText, locEnd(comment))
  )
  if (index !== false && util.hasNewline(originalText, index)) {
    parts.push(hardline)
  }
  return parts
}

function printTrailingComment(path, options, previousComment) {
  const comment = path.node
  const printed = printComment(path, options)
  const { printer, originalText, locStart } = options
  const isBlock = printer.isBlockComment?.(comment)

  if (
    (previousComment?.hasLineSuffix && !previousComment?.isBlock) ||
    util.hasNewline(originalText, locStart(comment), { backwards: true })
  ) {
    const isLineBeforeEmpty = util.isPreviousLineEmpty(
      originalText,
      locStart(comment)
    )
    return {
      doc: lineSuffix([hardline, isLineBeforeEmpty ? hardline : '', printed]),
      isBlock,
      hasLineSuffix: true
    }
  }

  if (!isBlock || previousComment?.hasLineSuffix) {
    return {
      doc: [lineSuffix([' ', printed]), breakParent],
      isBlock,
      hasLineSuffix: true
    }
  }

  return { doc: [' ', printed], isBlock, hasLineSuffix: false }
}

function printLeadingComments(path, options) {
  const printed = options[Symbol.for('printedComments')]
  const leadingComments = new Set(
    path.node?.comments?.filter(
      comment => !printed?.has(comment) && comment.leading
    )
  )
  if (leadingComments.size === 0) {
    return ''
  }
  return path
    .map(
      ({ node: comment }) =>
        leadingComments.has(comment) ? printLeadingComment(path, options) : '',
      'comments'
    )
    .filter(Boolean)
}

function printTrailingComments(path, options) {
  const comments = path.node?.comments
  const trailingComments = new Set(
    comments?.filter(comment => comment.trailing)
  )
  const printed = options[Symbol.for('printedComments')]
  const commentsShouldPrint = new Set(
    comments?.filter(
      comment => trailingComments.has(comment) && !printed?.has(comment)
    )
  )
  if (commentsShouldPrint.size === 0) {
    return ''
  }
  const docs = []
  let printedTrailingComment
  path.each(({ node: comment }) => {
    if (!trailingComments.has(comment)) {
      return
    }
    printedTrailingComment = printTrailingComment(
      path,
      options,
      printedTrailingComment
    )
    if (commentsShouldPrint.has(comment)) {
      docs.push(printedTrailingComment.doc)
    }
  }, 'comments')
  return docs
}

export function printComments(path, printedDoc, options) {
  const leading = printLeadingComments(path, options)
  const trailing = printTrailingComments(path, options)
  return leading || trailing ? [leading, printedDoc, trailing] : printedDoc
}

export function hasLeadingOwnLineComment(text, node, options) {
  if (node?.type === 'JSXElement' || node?.type === 'JSXFragment') {
    return (
      !!node.prettierIgnore ||
      !!node.comments?.some(comment =>
        /^\s*prettier-ignore\s*$/.test(comment.value)
      )
    )
  }
  return !!node?.comments?.some(
    comment => comment.leading && util.hasNewline(text, options.locEnd(comment))
  )
}

export const isTypeCastComment = (comment, options) => (
  options.printer.isBlockComment(comment) &&
  comment.value[0] === '*' &&
  /@(?:type|satisfies)\b/.test(comment.value)
)
