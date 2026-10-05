import { doc, util } from 'prettier'
import {
  getOption,
  isDocType,
  isObjectType,
  isPreserved,
  replaceDocs,
  shouldPrintTrailingComma
} from '../utils.js'

const { group, hardline, ifBreak, indent, line, softline } = doc.builders

// Mirrors `getFunctionParameters()` in prettier/src/language-js/utilities.
export function getFunctionParameters(node) {
  return [
    ...(node.this ? [node.this] : []),
    ...node.params,
    ...(node.rest ? [node.rest] : [])
  ]
}

// Nodes whose `params` are printed by `printFunctionParameters()`.
export const isFunctionLike = node => (
  Array.isArray(node?.params) &&
  !node.type.endsWith('TypeParameterDeclaration') &&
  !node.type.endsWith('TypeParameterInstantiation')
)

export const isFunctionParameter = path => (
  ['this', 'params', 'rest'].includes(path.key) && isFunctionLike(path.parent)
)

// Preserve line breaks in function parameters: if the source breaks after the
// `(`, break all of them.
function shouldBreakParameters(functionNode, options) {
  const [firstParameter] = getFunctionParameters(functionNode)
  if (!isPreserved(options, 'parameterWrap') || !firstParameter) {
    return false
  }
  // Measure from the `(`, so that breaks in type parameters don't count.
  const text = options.originalText
  const start = options.locStart(firstParameter)
  const opener = text.lastIndexOf('(', start)
  return (
    opener >= options.locStart(functionNode) &&
    util.hasNewlineInRange(text, opener, start)
  )
}

/*
Called for each function parameter. Breaking the parameter's group propagates
to the parameter list, just like the original mod did by wrapping `print()` in
`printFunctionParameters()`. This also makes stock Prettier bail out of the
last-argument expansion (`ArgExpansionBailout`) where needed.
The parameter is always wrapped in a new array, so `printFunction()` below can
find it in the doc by identity.
*/
export function printFunctionParameter(parameterDoc, path, options) {
  return shouldBreakParameters(path.parent, options)
    ? group(parameterDoc, { shouldBreak: true })
    : [parameterDoc]
}

/*
Called for function-like nodes, with a `print()` that records parameter docs.
Stock Prettier prints parameters in `printFunctionParameters()` as either

  [typeParameters, "(", indent([softline, ...printed]), trailingComma, softline, ")"]

or, when hugging the only parameter:

  [typeParameters, "(", ...printed, ")"]

where `printed` alternates between parameter docs and separators. Both are
found by identity of the first parameter doc, and swapped where Penere decides
differently whether to hug.
*/
export function printFunction(functionDoc, path, options, parameterDocs) {
  const { node } = path
  const parameters = getFunctionParameters(node)
  if (parameterDocs.length !== parameters.length || !parameters.length) {
    return functionDoc
  }

  const shouldBreak = shouldBreakParameters(node, options)
  const shouldHug = (
    !shouldBreak &&
    getOption(options, 'hugLastParameter') &&
    parameters.length > 1 &&
    shouldHugTheLastParameter(node, parameters)
  )
  if (!shouldBreak && !shouldHug && !node.typeParameters) {
    return functionDoc
  }

  const [firstDoc] = parameterDocs
  const startsWithFirst = (docs, index) => (
    docs[index] === firstDoc ||
    (docs[index] === '...' && docs[index + 1] === firstDoc)
  )

  return replaceDocs(
    functionDoc,
    printed => {
      if (!Array.isArray(printed) || printed[1] !== '(') {
        return
      }
      const [typeParametersDoc] = printed
      const isHugged = startsWithFirst(printed, 2)
      const isBroken = (
        isDocType(printed[2], 'indent') &&
        startsWithFirst(printed[2].contents, 1)
      )
      // Keep type parameters that break, e.g. as in the source, from breaking
      // the parameters, which stock Prettier prints in the same group.
      if (
        !shouldBreak &&
        !shouldHug &&
        isBroken &&
        doc.utils.willBreak(typeParametersDoc)
      ) {
        return [typeParametersDoc, group(printed.slice(1))]
      }
      if (shouldHug && isBroken) {
        return [
          typeParametersDoc,
          '(',
          ...printParameters(parameterDocs, node, () => ' '),
          ')'
        ]
      }
      if (shouldBreak && isHugged) {
        return [
          typeParametersDoc,
          '(',
          indent([
            softline,
            ...printParameters(parameterDocs, node, parameter =>
              util.isNextLineEmpty(
                options.originalText,
                options.locEnd(parameter)
              )
                ? [hardline, hardline]
                : line
            )
          ]),
          (
            !hasRestParameter(node, parameters) &&
            path.root.type !== 'NGRoot' &&
            shouldPrintTrailingComma(options, 'all')
          )
            ? ifBreak(',')
            : '',
          softline,
          ')'
        ]
      }
    },
    new Set(parameterDocs)
  )
}

function printParameters(parameterDocs, node, printSeparator) {
  const parameters = getFunctionParameters(node)
  return parameterDocs.flatMap((parameterDoc, index) => {
    const isLast = index === parameterDocs.length - 1
    return [
      isLast && node.rest ? '...' : '',
      parameterDoc,
      isLast ? '' : [',', printSeparator(parameters[index])]
    ]
  })
}

function hasRestParameter(node, parameters) {
  return !!node.rest || parameters.at(-1)?.type === 'RestElement'
}

// Allow functions to hug multiple parameters if only the last one is huggable,
// deploying the same rule as for function calls.
function shouldHugTheLastParameter(node, parameters) {
  return (
    parameters.every(parameter => !parameter.decorators?.length) &&
    isHuggableParameter(parameters.at(-1), node) &&
    parameters
      .slice(0, -1)
      .every(parameter => !isHuggableParameter(parameter, node))
  )
}

// Mirrors `shouldHugTheOnlyFunctionParameter()` in stock Prettier.
function isHuggableParameter(parameter, node) {
  const { type, typeAnnotation, left, right } = parameter
  return (
    !parameter.comments?.length && (
      type === 'ObjectPattern' ||
      type === 'ArrayPattern' || (
        type === 'Identifier' && (
          typeAnnotation?.type === 'TypeAnnotation' ||
          typeAnnotation?.type === 'TSTypeAnnotation'
        ) &&
        isObjectType(typeAnnotation.typeAnnotation)
      ) || (
        type === 'FunctionTypeParam' &&
        isObjectType(typeAnnotation) &&
        parameter !== node.rest
      ) || (
        type === 'AssignmentPattern' &&
        (left.type === 'ObjectPattern' || left.type === 'ArrayPattern') && (
          right.type === 'Identifier' ||
          (right.type === 'ObjectExpression' && !right.properties.length) ||
          (right.type === 'ArrayExpression' && !right.elements.length)
        )
      )
    )
  )
}
