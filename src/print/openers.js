import { doc, util } from 'prettier'
import {
  isDocType,
  isPreserved,
  replaceDocs,
  shouldPrintTrailingComma
} from '../utils.js'

const { group, ifBreak, indent, line, softline } = doc.builders

/*
Rules that break after an opener (`{`, `<`) if the source does, the same way
`objectWrap: "preserve"` does for object literals.
*/

// Breaks the first group in `printed` whose contents start with `opener`.
function breakGroup(printed, opener) {
  let found = false
  return replaceDocs(printed, printedDoc => {
    if (found) {
      return printedDoc
    }
    if (
      isDocType(printedDoc, 'group') &&
      Array.isArray(printedDoc.contents) &&
      printedDoc.contents[0] === opener
    ) {
      found = true
      return { ...printedDoc, break: true }
    }
  })
}

const hasNewlineAfter = (text, opener, start, end) => {
  const index = text.lastIndexOf(opener, end)
  return index >= start && util.hasNewlineInRange(text, index, end)
}

/*
Import and export specifiers, printed by stock Prettier in
`printModuleSpecifiers()` either as

  group(["{", indent([line, ...specifiers]), ifBreak(","), line, "}"])

or, for a single specifier, as `["{", " ", specifier, " ", "}"]`.
*/
export function printModuleDeclaration(declarationDoc, path, options) {
  const { node } = path
  const specifiers = node.specifiers?.filter(
    specifier => (
      specifier.type === 'ImportSpecifier' ||
      specifier.type === 'ExportSpecifier'
    )
  )
  if (
    !isPreserved(options, 'importExportWrap') ||
    !specifiers?.length ||
    !hasNewlineAfter(
      options.originalText,
      '{',
      options.locStart(node),
      options.locStart(specifiers[0])
    )
  ) {
    return declarationDoc
  }
  const broken = breakGroup(declarationDoc, '{')
  if (broken !== declarationDoc) {
    return broken
  }
  // A single specifier: `["{", spacing, specifier, spacing, "}"]`.
  let found = false
  return replaceDocs(declarationDoc, printed => {
    if (found) {
      return printed
    }
    if (
      Array.isArray(printed) &&
      printed.length === 5 &&
      printed[0] === '{' &&
      printed[4] === '}'
    ) {
      found = true
      const spacing = options.bracketSpacing ? line : softline
      return group(
        [
          '{',
          indent([spacing, printed[2]]),
          shouldPrintTrailingComma(options) ? ifBreak(',') : '',
          spacing,
          '}'
        ],
        { shouldBreak: true }
      )
    }
  })
}

/*
JSX attributes, printed by stock Prettier in `printJsxOpeningElement()` as

  group(["<", name, typeArguments, indent([line, ...attributes]), ..., ">"])
*/
export function printJsxOpeningElement(elementDoc, path, options) {
  const { node } = path
  const [firstAttribute] = node.attributes ?? []
  const nameNode = node.typeArguments ?? node.typeParameters ?? node.name
  if (
    !isPreserved(options, 'jsxAttributeWrap') ||
    !firstAttribute ||
    !util.hasNewlineInRange(
      options.originalText,
      options.locEnd(nameNode),
      options.locStart(firstAttribute)
    )
  ) {
    return elementDoc
  }
  return breakGroup(elementDoc, '<')
}

/*
Type parameters and arguments, printed by stock Prettier in
`printTypeParameters()` as

  group(["<", indent([softline, ...params]), trailingComma, softline, ">"])

or, for a single simple one, as `["<", param, ">"]`.
*/
export function printTypeParameters(parametersDoc, path, options) {
  const { node } = path
  const [firstParameter] = node.params ?? []
  if (
    !isPreserved(options, 'typeParameterWrap') ||
    !firstParameter ||
    !hasNewlineAfter(
      options.originalText,
      '<',
      options.locStart(node),
      options.locStart(firstParameter)
    )
  ) {
    return parametersDoc
  }
  const broken = breakGroup(parametersDoc, '<')
  if (broken !== parametersDoc) {
    return broken
  }
  // A single simple parameter: `["<", param, ">"]`.
  if (
    Array.isArray(parametersDoc) &&
    parametersDoc.length === 3 &&
    parametersDoc[0] === '<' &&
    parametersDoc[2] === '>'
  ) {
    return group(['<', indent([softline, parametersDoc[1]]), softline, '>'], {
      shouldBreak: true
    })
  }
  return parametersDoc
}
