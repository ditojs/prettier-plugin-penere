import { util } from 'prettier'
import { isDocType, isPreserved, replaceDocs } from '../utils.js'

/*
Adjusts the doc stock Prettier prints for `TSMappedType` in
`printTypeScriptMappedType()`, which since Prettier 3.7 wraps the key in

  group(["[", indent([softline, key, " in ", constraint, ...]), softline, "]"])

so that hard breaks in the constraint (e.g. a broken union in a template literal
type) also break the brackets. Like other openers, only break after `[` if the
source does, and hug the brackets otherwise, as Prettier did before 3.7.
*/
export function printMappedType(mappedTypeDoc, path, options) {
  const { node } = path
  if (!isPreserved(options, 'mappedTypeWrap') || !node.key) {
    return mappedTypeDoc
  }
  const text = options.originalText
  const keyStart = options.locStart(node.key)
  if (util.hasNewlineInRange(text, text.lastIndexOf('[', keyStart), keyStart)) {
    return mappedTypeDoc
  }
  let replaced = false
  return replaceDocs(mappedTypeDoc, doc => {
    if (replaced) {
      return doc
    }
    const contents = isDocType(doc, 'group') ? doc.contents : null
    if (
      Array.isArray(contents) &&
      contents.length === 4 &&
      contents[0] === '[' &&
      isDocType(contents[1], 'indent') &&
      contents[3] === ']'
    ) {
      replaced = true
      const [, ...inner] = contents[1].contents
      return ['[', ...inner, ']']
    }
  })
}
