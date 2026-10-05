import * as acorn from 'prettier/plugins/acorn'
import * as babel from 'prettier/plugins/babel'
import * as estree from 'prettier/plugins/estree'
import * as flow from 'prettier/plugins/flow'
import * as meriyah from 'prettier/plugins/meriyah'
import * as typescript from 'prettier/plugins/typescript'
import { printArray } from './print/array.js'
import {
  isAssignmentLike,
  printArrowFunction,
  printAssignment
} from './print/assignment.js'
import {
  getFunctionParameters,
  isFunctionLike,
  isFunctionParameter,
  printFunction,
  printFunctionParameter
} from './print/function-parameters.js'
import {
  isCallArgument,
  isCallLikeExpression,
  printCall
} from './print/call-expression.js'
import {
  isConditionStatement,
  printConditionStatement
} from './print/condition.js'
import { isInterface, printInterface } from './print/interface.js'
import { printMappedType } from './print/mapped-type.js'
import { printObjectPattern } from './print/object.js'
import {
  printJsxOpeningElement,
  printModuleDeclaration,
  printTypeParameters
} from './print/openers.js'
import { printBinaryishExpression } from './print/binaryish.js'
import {
  isWrapped,
  printBinaryishParentheses,
  shouldParenthesize,
  wrap
} from './print/parentheses.js'
import {
  isTemplateLiteral,
  printTemplateLiteral
} from './print/template-literal.js'
import { printTernary } from './print/ternary.js'
import { printUnionType } from './print/union-type.js'
import { isPreserved } from './utils.js'

const astFormat = 'penere-estree'
const estreePrinter = estree.printers.estree

// Prettier has no documented way to override a built-in printer: a printer is
// looked up by the `astFormat` of the parser, and the built-in `estree` one
// always wins. So we re-export every estree-producing parser under our own
// `astFormat`, and route that to a printer which wraps the built-in one.
const parsers = Object.fromEntries(
  [acorn, babel, flow, meriyah, typescript].flatMap(plugin =>
    Object.entries(plugin.parsers)
      .filter(
        ([name, parser]) => (
          parser.astFormat === 'estree' &&
          // JSON is printed by the estree printer too, but Penere's rules don't
          // apply to it.
          !name.startsWith('json')
        )
      )
      .map(([name, parser]) => [name, { ...parser, astFormat }])
  )
)

// Each printer receives the doc that stock Prettier produced for the node, and
// returns it either unchanged or adjusted.
const printers = {
  ArrayExpression: printArray,
  ArrayPattern: printArray,
  ObjectPattern: printObjectPattern,
  BinaryExpression: printBinaryishParentheses,
  LogicalExpression: printBinaryishParentheses,
  ConditionalExpression: printTernary,
  TSConditionalType: printTernary,
  ConditionalTypeAnnotation: printTernary,
  TSTupleType: printArray,
  TupleTypeAnnotation: printArray,
  TSMappedType: printMappedType,
  ImportDeclaration: printModuleDeclaration,
  ExportNamedDeclaration: printModuleDeclaration,
  JSXOpeningElement: printJsxOpeningElement,
  TSTypeParameterDeclaration: printTypeParameters,
  TSTypeParameterInstantiation: printTypeParameters,
  TypeParameterDeclaration: printTypeParameters,
  TypeParameterInstantiation: printTypeParameters,
  TSUnionType: printUnionType,
  UnionTypeAnnotation: printUnionType
}

function print(path, options, print, args) {
  const { node } = path
  const isFunction = isFunctionLike(node)
  const isCall = isCallLikeExpression(node)
  const isTemplate = isTemplateLiteral(node)
  const isAssignment = isAssignmentLike(node)
  const isInterfaceLike = isInterface(node)
  const isCondition = isConditionStatement(node)

  let doc
  if (
    isFunction ||
    isCall ||
    isTemplate ||
    isAssignment ||
    isInterfaceLike ||
    isCondition
  ) {
    // Record the docs printed for child nodes, to find parameters and
    // arguments in the doc by identity, and to rebuild interpolations.
    const childDocs = new Set()
    const parameters = isFunction ? getFunctionParameters(node) : []
    const parameterDocs = []
    const argumentDocs = new Map()
    const nodeDocs = new Map()
    doc = estreePrinter.print(
      path,
      options,
      (selector, args) => {
        const doc = print(selector, args)
        childDocs.add(doc)
        // `path.map(print, …)` calls `print(path, index)`.
        const child =
          selector === undefined || selector === path
            ? path.node
            : typeof selector === 'string'
              ? path.node[selector]
              : undefined
        if (child) {
          nodeDocs.set(child, doc)
        }
        if (selector === undefined && args === undefined) {
          if (parameters.includes(path.node) && !parameterDocs.includes(doc)) {
            parameterDocs.push(doc)
          }
          if (isCall && isCallArgument(path)) {
            const docs = argumentDocs.get(path.parent) ?? []
            argumentDocs.set(path.parent, docs)
            if (!docs.includes(doc)) {
              docs.push(doc)
            }
          }
        }
        return doc
      },
      args
    )
    doc = isFunction
      ? printArrowFunction(
          printFunction(doc, path, options, parameterDocs),
          path,
          options
        )
      : isCall
        ? printCall(doc, path, options, { argumentDocs, childDocs, nodeDocs })
        : isTemplate
          ? printTemplateLiteral(doc, path, options, nodeDocs)
          : isInterfaceLike
            ? printInterface(doc, path, options, nodeDocs)
            : isCondition
              ? printConditionStatement(doc, path, options, nodeDocs)
              : printAssignment(doc, path, options, nodeDocs)
  } else if (
    (node.type === 'BinaryExpression' || node.type === 'LogicalExpression') &&
    isPreserved(options, 'operatorWrap')
  ) {
    // Stock Prettier is only asked whether it wraps the expression in
    // parentheses, the expression itself is printed by Penere. Children aren't
    // needed for that, and printing them here would print their comments.
    const hasParentheses = shouldParenthesize(
      path,
      options,
      isWrapped(estreePrinter.print(path, options, () => '', args))
    )
    doc = printBinaryishExpression(path, options, print, args, hasParentheses)
    return hasParentheses ? wrap(doc) : doc
  } else {
    doc = estreePrinter.print(path, options, print, args)
  }

  const printer = printers[node?.type]
  if (printer) {
    doc = printer(doc, path, options)
  }
  if (isFunctionParameter(path)) {
    return printFunctionParameter(doc, path, options)
  }
  // Wrap arguments in a new array, so `printCall()` can find them by identity.
  return isCallArgument(path) ? [doc] : doc
}

const category = 'Penere'

const wrapChoices = [
  {
    value: 'preserve',
    description: (
      'Keep the construct expanded if there is a line break after its opener ' +
      'in the source.'
    )
  },
  {
    value: 'collapse',
    description: 'Format it like stock Prettier, ignoring the source.'
  }
]

// The `*Wrap` options, like Prettier's own `objectWrap`. They have no default,
// so that `wrap` applies to all that aren't set. The other options have no
// default either, see `getOption()`.
const wrapOptions = {
  arrayWrap: (
    'Arrays: break if the source breaks after `[`, and keep the rows of ' +
    'elements, or put every element on its own line if the first row has ' +
    'only one.'
  ),
  parameterWrap: 'Function parameters: break if the source breaks after `(`.',
  conditionWrap: (
    'Conditions of `if`, `while` and `do … while`: break if the source ' +
    'breaks after `(`.'
  ),
  argumentWrap: 'Call arguments: break if the source breaks after `(`.',
  memberChainWrap:
    'Member chains: expand if the source breaks before the first call.',
  objectDestructuringWrap: (
    'Object destructuring: follow `objectWrap`, and keep destructured ' +
    'parameters in their own group.'
  ),
  ternaryWrap:
    'Conditionals: break if the source breaks before the consequent.',
  templateLiteralWrap: (
    'Template literal interpolations: allow breaking at `${` and `}`, and ' +
    'keep them broken if the source breaks after `${`.'
  ),
  operatorWrap: (
    'Operators: break all operands on the same level if the source breaks ' +
    'any of them, and wrap broken nested expressions in parentheses.'
  ),
  importExportWrap:
    'Named imports and exports: break if the source breaks after `{`.',
  jsxAttributeWrap:
    'JSX attributes: break if the source breaks before the first one.',
  typeParameterWrap:
    'Type parameters and arguments: break if the source breaks after `<`.',
  extendsWrap: (
    'Interface `extends` clauses: keep a line break before `extends`, and ' +
    'put each extended type on its own line if the source breaks between them.'
  ),
  unionTypeWrap:
    'Union types: break if they span multiple lines in the source.',
  mappedTypeWrap: (
    'Mapped type keys: only break after `[` if the source does, and hug the ' +
    'brackets otherwise.'
  )
}

const options = {
  wrap: {
    category,
    type: 'choice',
    default: 'preserve',
    description: (
      'How to handle line breaks in the source, for all `*Wrap` options ' +
      'that are not set.'
    ),
    choices: wrapChoices
  },
  ...Object.fromEntries(
    Object.entries(wrapOptions).map(([name, description]) => [
      name,
      { category, type: 'choice', description, choices: wrapChoices }
    ])
  ),
  hugLastParameter: {
    category,
    type: 'boolean',
    description: (
      'Hug the last function parameter if it is an object or array pattern ' +
      'and no other parameter is, like the last argument of a call.'
    )
  },
  conciseStringArrays: {
    category,
    type: 'boolean',
    description:
      'Fill arrays of strings as many per line as fit, like arrays of numbers.'
  },
  breakComplexArrayItems: {
    category,
    type: 'boolean',
    description: (
      'Always break arrays of more than one object or array (stock Prettier ' +
      'behavior).'
    )
  },
  clarifyMixedOperators: {
    category,
    type: 'boolean',
    description: (
      'Add parentheses to mixed `&&` / `||`, `*` / `/`, to `%` within `+` / ' +
      '`-`, and to `??` within conditionals (stock Prettier behavior). ' +
      'Otherwise, only the ones in the source are kept.'
    )
  },
  preserveParentheses: {
    category,
    type: 'boolean',
    description: (
      'Keep parentheses around nested binary and logical expressions from ' +
      'the source, even if they are redundant.'
    )
  }
}

export default {
  parsers,
  printers: { [astFormat]: { ...estreePrinter, print } },
  options
}
