import { javascript } from '@codemirror/lang-javascript'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { basicSetup } from 'codemirror'
import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent
} from 'lz-string'
import pkg from '../package.json'
import {
  format as formatCode,
  getPenereOptions,
  prettierVersion
} from './format.js'

const sample = `// Break after an opener and it stays expanded, join it and it collapses.
const sizes = [
  1, 2, 3
]

const isSameShape = (
  (
    isPlainObject(before) &&
    isPlainObject(after)
  ) || (
    isArray(before) &&
    isArray(after) &&
    before.length === after.length
  )
)

if (
  data && !isEmptySchema(schema)) {
  load(data)
}

async function request(api, { url, method, params, query, headers, data }) {}

object
  .foo().bar()

test(
  foo(), bar())
`

// The Prettier options shown in the sidebar, with their defaults.
const prettierOptions = {
  parser: {
    type: 'choice',
    default: 'babel',
    choices: ['babel', 'typescript', 'flow']
  },
  printWidth: { type: 'int', default: 80 },
  semi: { type: 'boolean', default: true },
  singleQuote: { type: 'boolean', default: false },
  trailingComma: {
    type: 'choice',
    default: 'all',
    choices: ['all', 'es5', 'none']
  },
  arrowParens: {
    type: 'choice',
    default: 'always',
    choices: ['always', 'avoid']
  },
  bracketSpacing: { type: 'boolean', default: true },
  objectWrap: {
    type: 'choice',
    default: 'preserve',
    choices: ['preserve', 'collapse']
  }
}

// Penere's options, from the plugin itself. Most have no default, as they
// follow `wrap` when not set.
const penereOptions = Object.fromEntries(
  (await getPenereOptions()).map(option => [option.name, option])
)

const state = loadState()

// Editors

const theme = EditorView.theme({
  '&': { height: '100%', fontSize: '13px' },
  '.cm-scroller': { fontFamily: 'var(--mono)' }
})

const createEditor = (parent, { readOnly = false, onChange } = {}) =>
  new EditorView({
    parent,
    state: EditorState.create({
      doc: '',
      extensions: [
        basicSetup,
        javascript({ jsx: true, typescript: true }),
        theme,
        EditorState.readOnly.of(readOnly),
        onChange
          ? EditorView.updateListener.of(update => {
              if (update.docChanged) {
                onChange(update.state.doc.toString())
              }
            })
          : []
      ]
    })
  })

const setText = (view, text) =>
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: text }
  })

const input = createEditor(document.getElementById('input'), {
  onChange: code => {
    state.code = code
    scheduleFormat()
  }
})
const output = createEditor(document.getElementById('output'), {
  readOnly: true
})
const stock = createEditor(document.getElementById('stock'), {
  readOnly: true
})
setText(input, state.code)

// Options

function renderOptions() {
  renderControls(document.getElementById('prettier-options'), prettierOptions)
  renderControls(document.getElementById('penere-options'), penereOptions)
  document.getElementById('compare').checked = state.compare
  document.getElementById('stock-pane').hidden = !state.compare
}

function renderControls(container, definitions) {
  container.replaceChildren(
    ...Object.entries(definitions).map(([name, definition]) =>
      renderControl(name, definition)
    )
  )
}

function renderControl(name, {
  type,
  default: defaultValue,
  choices,
  description
}) {
  const label = document.createElement('label')
  label.title = description ?? ''
  const text = document.createElement('span')
  text.textContent = name
  label.append(text)
  const value = state.options[name]
  let control
  if (type === 'int') {
    control = document.createElement('input')
    control.type = 'number'
    control.min = 0
    control.value = value ?? defaultValue
    control.addEventListener('input', () =>
      setOption(name, Number(control.value) || defaultValue)
    )
  } else {
    // Booleans and choices are both selects, so that options without a default
    // can be left unset, and follow `wrap`.
    const values =
      type === 'boolean'
        ? [true, false]
        : choices.map(choice => choice.value ?? choice)
    control = document.createElement('select')
    const entries =
      defaultValue === undefined
        ? [
            ['', 'default (follows wrap)'],
            ...values.map(v => [String(v), String(v)])
          ]
        : values.map(v => [String(v), String(v)])
    control.append(
      ...entries.map(([optionValue, optionText]) => {
        const option = document.createElement('option')
        option.value = optionValue
        option.textContent = optionText
        return option
      })
    )
    control.value = String(value ?? defaultValue ?? '')
    control.addEventListener('change', () => {
      const selected = control.value
      setOption(
        name,
        selected === ''
          ? undefined
          : type === 'boolean'
            ? selected === 'true'
            : selected
      )
    })
  }
  label.append(control)
  return label
}

function setOption(name, value) {
  if (value === undefined) {
    delete state.options[name]
  } else {
    state.options[name] = value
  }
  scheduleFormat()
}

document.getElementById('compare').addEventListener('change', event => {
  state.compare = event.target.checked
  document.getElementById('stock-pane').hidden = !state.compare
  scheduleFormat()
})

document.getElementById('reset').addEventListener('click', () => {
  state.options = {}
  renderOptions()
  scheduleFormat()
})

document.getElementById('share').addEventListener('click', async event => {
  saveState()
  await navigator.clipboard?.writeText(location.href)
  event.target.textContent = 'Copied'
  setTimeout(() => (event.target.textContent = 'Copy link'), 1500)
})

document.getElementById('versions').textContent = `Penere ${
  pkg.version
} · Prettier ${prettierVersion}`

// Formatting

let timer
function scheduleFormat() {
  clearTimeout(timer)
  timer = setTimeout(format, 150)
}

async function format() {
  saveState()
  const options = {
    ...Object.fromEntries(
      Object.entries(prettierOptions).map(([name, { default: value }]) => [
        name,
        value
      ])
    ),
    ...state.options
  }
  setText(output, await formatCode(state.code, options))
  if (state.compare) {
    setText(stock, await formatCode(state.code, options, { stock: true }))
  }
}

// State, kept in the URL hash, so that it can be shared.

function loadState() {
  try {
    const hash = location.hash.slice(1)
    if (hash) {
      const parsed = JSON.parse(decompressFromEncodedURIComponent(hash))
      return { code: sample, options: {}, compare: true, ...parsed }
    }
  } catch {
    // Fall back to the defaults.
  }
  return { code: sample, options: {}, compare: true }
}

function saveState() {
  history.replaceState(
    null,
    '',
    `#${compressToEncodedURIComponent(JSON.stringify(state))}`
  )
}

renderOptions()
format()
