// Mirrors `getPrecedence()`, `shouldFlatten()` and `isBitwiseOperator()` in
// prettier/src/language-js/utilities.
const PRECEDENCE = new Map(
  [
    ['|>'],
    ['??'],
    ['||'],
    ['&&'],
    ['|'],
    ['^'],
    ['&'],
    ['==', '===', '!=', '!=='],
    ['<', '>', '<=', '>=', 'in', 'instanceof'],
    ['>>', '<<', '>>>'],
    ['+', '-'],
    ['*', '/', '%'],
    ['**']
  ].flatMap((operators, index) => operators.map(operator => [operator, index]))
)

export const getPrecedence = operator => PRECEDENCE.get(operator)

const equalityOperators = new Set(['==', '!=', '===', '!=='])
const multiplicativeOperators = new Set(['*', '/', '%'])
const bitshiftOperators = new Set(['>>', '>>>', '<<'])

export const isBitwiseOperator = operator => (
  bitshiftOperators.has(operator) ||
  ['|', '^', '&'].includes(operator)
)

// `x * y / z` and `x / y * z`, which stock Prettier doesn't flatten, but adds
// parentheses to: `(x * y) / z`.
export const isMixedMultiplication = (parentOperator, operator) => (
  operator !== parentOperator &&
  operator !== '%' &&
  parentOperator !== '%' &&
  multiplicativeOperators.has(operator) &&
  multiplicativeOperators.has(parentOperator)
)

/**
 * Whether `nodeOperator` can be printed in the same chain as `parentOperator`
 * without parentheses. With `flattenMixedMultiplication`, `x * y / z` is
 * flattened as well, instead of becoming `(x * y) / z`.
 */
export function shouldFlatten(
  parentOperator,
  operator,
  { flattenMixedMultiplication = false } = {}
) {
  return !(
    getPrecedence(operator) !== getPrecedence(parentOperator) ||
    // `x ** y ** z` --> `x ** (y ** z)`
    parentOperator === '**' || (
      // `x == y == z` --> `(x == y) == z`
      equalityOperators.has(parentOperator) &&
      equalityOperators.has(operator)
    ) ||
    // `x * y % z` --> `(x * y) % z`
    (operator === '%' && multiplicativeOperators.has(parentOperator)) ||
    (parentOperator === '%' && multiplicativeOperators.has(operator)) || (
      !flattenMixedMultiplication &&
      isMixedMultiplication(parentOperator, operator)
    ) ||
    // `x << y << z` --> `(x << y) << z`
    (bitshiftOperators.has(parentOperator) && bitshiftOperators.has(operator))
  )
}
