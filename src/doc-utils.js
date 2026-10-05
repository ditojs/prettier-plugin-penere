import { doc } from 'prettier'

// Mirrors `cleanDoc()` in prettier/src/document/utilities, which stock
// Prettier doesn't expose to plugins.
function cleanDocFn(doc) {
  if (Array.isArray(doc)) {
    // Flat array, concat strings
    const parts = []
    for (const part of doc) {
      if (!part) {
        continue
      }
      const [currentPart, ...restParts] = Array.isArray(part) ? part : [part]
      if (typeof currentPart === 'string' && typeof parts.at(-1) === 'string') {
        parts[parts.length - 1] += currentPart
      } else {
        parts.push(currentPart)
      }
      parts.push(...restParts)
    }
    return parts.length === 0 ? '' : parts.length === 1 ? parts[0] : parts
  }
  switch (doc?.type) {
    case 'fill':
      if (doc.parts.every(part => part === '')) {
        return ''
      }
      if (doc.parts.length === 1) {
        return doc.parts[0]
      }
      break
    case 'group':
      if (!doc.contents && !doc.id && !doc.break && !doc.expandedStates) {
        return ''
      }
      if (
        doc.contents.type === 'group' &&
        doc.contents.id === doc.id &&
        doc.contents.break === doc.break &&
        doc.contents.expandedStates === doc.expandedStates
      ) {
        return doc.contents
      }
      break
    case 'align':
    case 'indent':
    case 'indent-if-break':
    case 'line-suffix':
      if (!doc.contents) {
        return ''
      }
      break
    case 'if-break':
      if (!doc.flatContents && !doc.breakContents) {
        return ''
      }
      break
  }
  return doc
}

export const cleanDoc = printedDoc => doc.utils.mapDoc(printedDoc, cleanDocFn)
