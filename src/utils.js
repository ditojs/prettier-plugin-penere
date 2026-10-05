// Whether a `*Wrap` option is set to preserve the line breaks of the source,
// falling back to the `wrap` option.
export const isPreserved = (options, name) => (
  (options[name] ?? options.wrap ?? 'preserve') ===
  'preserve'
)

// The Penere and stock Prettier values of the other options, used when they
// are not set, depending on the `wrap` option.
const defaults = {
  hugLastParameter: [true, false],
  conciseStringArrays: [true, false],
  breakComplexArrayItems: [false, true],
  clarifyMixedOperators: [false, true],
  preserveParentheses: [true, false]
}

export const getOption = (options, name) => (
  options[name] ??
  defaults[name][isPreserved(options, 'wrap') ? 0 : 1]
)

export const isDocType = (doc, type) => doc?.type === type

export const hasComment = (node, filter) => !!node?.comments?.some(filter)

export const isLineComment = (comment, options) =>
  !options.printer.isBlockComment(comment)

export const isStringLiteral = node => (
  node?.type === 'StringLiteral' ||
  (node?.type === 'Literal' && typeof node.value === 'string')
)

export const isObjectType = node =>
  ['ObjectTypeAnnotation', 'TSTypeLiteral', 'TSMappedType'].includes(
    node?.type
  )

// Mirrors `shouldPrintTrailingComma()` in stock Prettier.
export const shouldPrintTrailingComma = (options, level = 'es5') => (
  (options.trailingComma === 'es5' && level === 'es5') ||
  (options.trailingComma === 'all' && (level === 'all' || level === 'es5'))
)

const childKeys = ['contents', 'parts', 'breakContents', 'flatContents']

/**
 * Returns a copy of `doc` where every sub-doc for which `replace()` returns a
 * doc is swapped for it. Unlike `doc.utils.mapDoc()`, untouched sub-docs keep
 * their identity, and shared sub-docs (e.g. in `conditionalGroup()` states)
 * are replaced consistently. Docs in `skip` are not descended into.
 */
export function replaceDocs(doc, replace, skip = new Set()) {
  const cache = new Map()
  const visit = doc => {
    if (!doc || typeof doc !== 'object' || skip.has(doc)) {
      return doc
    }
    if (cache.has(doc)) {
      return cache.get(doc)
    }
    let result = replace(doc)
    if (result === undefined) {
      result = doc
      if (Array.isArray(doc)) {
        const mapped = doc.map(visit)
        if (mapped.some((child, index) => child !== doc[index])) {
          result = mapped
        }
      } else {
        const changes = {}
        for (const key of childKeys) {
          if (key in doc) {
            const mapped = visit(doc[key])
            if (mapped !== doc[key]) {
              changes[key] = mapped
            }
          }
        }
        if (doc.expandedStates) {
          const mapped = doc.expandedStates.map(visit)
          if (
            mapped.some((child, index) => child !== doc.expandedStates[index])
          ) {
            // A group's contents are its first expanded state.
            changes.expandedStates = mapped
            changes.contents = mapped[0]
          }
        }
        if (Object.keys(changes).length) {
          result = { ...doc, ...changes }
        }
      }
    }
    cache.set(doc, result)
    return result
  }
  return visit(doc)
}
