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

or, since Prettier 3.7, inlined, e.g. `if (!(`. Like other openers, keep the
condition broken if the source breaks after `(`, which also breaks binaryish
conditions between their operands:

  if (
    a &&
    !b
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
    const condition = printed[index + 1]
    const isGrouped = (
      condition?.type === 'group' &&
      condition.contents?.[0]?.type === 'indent' &&
      condition.contents[0].contents?.[1] === conditionDoc
    )
    if (condition !== conditionDoc && !isGrouped) {
      return
    }
    found = true
    return [
      ...printed.slice(0, index + 1),
      isGrouped
        ? { ...condition, break: true }
        : group([indent([softline, conditionDoc]), softline], {
            shouldBreak: true
          }),
      ...printed.slice(index + 2)
    ]
  })
}
