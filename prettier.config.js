// @ts-check

/**
 * @type {import('prettier').Config}
 */
export default {
  plugins: ['./src/index.js'],
  printWidth: 80,
  semi: false,
  singleQuote: true,
  quoteProps: 'consistent',
  arrowParens: 'avoid',
  trailingComma: 'none'
}
