import { doc, util } from 'prettier'
import { isDocType, isPreserved, replaceDocs } from '../utils.js'

const { hardline, indent } = doc.builders

export const isInterface = node => (
  node?.type === 'TSInterfaceDeclaration' ||
  node?.type === 'InterfaceDeclaration'
)

/*
Adjusts how stock Prettier prints the `extends` clause of interfaces in
`printHeritageClauses()`, which is either, for multiple extended types:

  [line, comments, ..., "extends", group(indent([line, join([",", line], types)]))]

or, for a single one, `[" ", ["extends ", comments, type]]`.

Like other openers, keep a line break before `extends`, and if the source
breaks between the extended types, put each of them on its own line:

  interface Schema<$Item>
    extends BaseSchema<$Item>,
      SchemaAffixMixin<$Item> {}
*/
export function printInterface(interfaceDoc, path, options, nodeDocs) {
  const { node } = path
  const types = node.extends ?? []
  const typeDocs = types.map(type => nodeDocs.get(type))
  if (
    !isPreserved(options, 'heritageWrap') ||
    !types.length ||
    typeDocs.some(typeDoc => typeDoc === undefined)
  ) {
    return interfaceDoc
  }

  const text = options.originalText
  const before = node.typeParameters ?? node.id
  const keyword = text.indexOf('extends', options.locEnd(before))
  const breakBefore = (
    keyword !== -1 &&
    util.hasNewlineInRange(text, options.locEnd(before), keyword)
  )
  const breakTypes = (
    types.length > 1 &&
    util.hasNewlineInRange(
      text,
      options.locEnd(types[0]),
      options.locStart(types[1])
    )
  )
  if (!breakBefore && !breakTypes) {
    return interfaceDoc
  }

  const [firstDoc, ...restDocs] = typeDocs
  let found = false
  return replaceDocs(interfaceDoc, printed => {
    if (found || !Array.isArray(printed)) {
      return found ? printed : undefined
    }
    // Multiple types: `[line, comments, ..., "extends", group(...)]`
    if (
      printed.length === 5 &&
      printed[3] === 'extends' &&
      isDocType(printed[0], 'line') &&
      !printed[1]
    ) {
      found = true
      return [
        breakBefore ? hardline : printed[0],
        printed[1],
        printed[2],
        'extends',
        breakTypes
          ? [
              ' ',
              firstDoc,
              indent(restDocs.flatMap(typeDoc => [',', hardline, typeDoc]))
            ]
          : printed[4]
      ]
    }
    // A single type: `[" ", ["extends ", comments, type]]`
    if (
      breakBefore &&
      printed.length === 2 &&
      printed[0] === ' ' &&
      Array.isArray(printed[1]) &&
      printed[1][0] === 'extends ' &&
      !printed[1][1]
    ) {
      found = true
      return indent([hardline, printed[1]])
    }
  })
}
