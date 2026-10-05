import { doc, util } from 'prettier'
import { isPreserved, replaceDocs } from '../utils.js'

const { group, indent, softline } = doc.builders

const keywords = {
  IfStatement: 'if (',
  WhileStatement: ' (',
  DoWhileStatement: 'while ('
}

export const isConditionStatement = node => !!keywords[node?.type]

/*
Adjusts how stock Prettier prints the conditions of `if`, `while` and
`do … while` statements in `printIfOrWhileConditionOrWithStatementObject()`,
as either

  group([indent([softline, condition]), softline])

or, since Prettier 3.7, inlined, e.g. `if (!(`. If the source breaks after `(`,
don't hug the condition, so that it breaks after `(` when its content breaks:

  if (
    !(
      a ||
      b
    )
  ) {
*/
export function printConditionStatement(statementDoc, path, options, nodeDocs) {
  const { node } = path
  const conditionDoc = nodeDocs.get(node.test)
  if (!isPreserved(options, 'conditionWrap') || conditionDoc === undefined) {
    return statementDoc
  }
  const text = options.originalText
  const opener = text.indexOf(
    '(',
    node.type === 'DoWhileStatement'
      ? options.locEnd(node.body)
      : options.locStart(node)
  )
  if (
    opener === -1 ||
    !util.hasNewlineInRange(text, opener, options.locStart(node.test))
  ) {
    return statementDoc
  }

  const keyword = keywords[node.type]
  let found = false
  return replaceDocs(statementDoc, printed => {
    if (found || !Array.isArray(printed)) {
      return found ? printed : undefined
    }
    const index = printed.indexOf(keyword)
    if (index === -1 || printed[index + 2] !== ')') {
      return
    }
    // Only inlined conditions are hugged, grouped ones break with their
    // content already.
    if (printed[index + 1] !== conditionDoc) {
      return
    }
    found = true
    return [
      ...printed.slice(0, index + 1),
      group([indent([softline, conditionDoc]), softline]),
      ...printed.slice(index + 2)
    ]
  })
}
