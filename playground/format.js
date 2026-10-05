import * as prettier from 'prettier/standalone'
import * as acorn from 'prettier/plugins/acorn'
import * as babel from 'prettier/plugins/babel'
import * as estree from 'prettier/plugins/estree'
import * as flow from 'prettier/plugins/flow'
import * as typescript from 'prettier/plugins/typescript'
import penere from '../src/index.js'

// Formatting with and without Penere, in the browser, through Prettier's
// standalone build.

const stockPlugins = [acorn, babel, estree, flow, typescript]
const penerePlugins = [...stockPlugins, penere]

export const prettierVersion = prettier.version

export async function format(code, options, { stock = false } = {}) {
  try {
    return await prettier.format(code, {
      ...options,
      plugins: stock ? stockPlugins : penerePlugins
    })
  } catch (error) {
    return error.message
  }
}

// Penere's options, as described by the plugin itself.
export async function getPenereOptions() {
  const { options } = await prettier.getSupportInfo({ plugins: penerePlugins })
  return options.filter(option => option.category === 'Penere')
}
