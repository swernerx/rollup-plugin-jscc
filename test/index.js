'use strict'

const plugin = require('../')
const expect = require('expect')
const path   = require('path')
const fs     = require('fs')

process.chdir(__dirname)

// Helpers ================================================

function concat (name, subdir) {
  let file = path
      .join(__dirname, subdir || 'expected', name)
      .replace(/\\/g, '/')

  if (!path.extname(file)) file += '.js'
  return file
}

function getexpect (file) {
  return fs.readFileSync(concat(file), 'utf8')
}

function generate (file, opts) {
  const inFile = concat(file, 'fixtures')
  const result = plugin(opts).load(inFile)

  return result && (result.code || result).replace(/[ \t]*$/gm, '')
}

function testFile (file, opts, save) {
  const expected = getexpect(file)
  const result = generate(file, opts)

  expect(result).toBeA('string')
  if (save) fs.writeFileSync(concat(`${file}_out.js`), result || '')

  expect(result).toBe(expected)
}

function testStr (file, expected, opts) {
  const result = generate(file, opts)

  expect(result).toContain(expected)
}

// The suites =============================================

describe('rollup-plugin-jscc', function () {

  it('by default uses JavaScript comments to start directives', function () {
    testStr('defaults', '/* Hello World */')
  })

  it('predefined variable `_FILE` is the relative path of the current file', function () {
    testFile('def-file-var')
  })

  it('predefined variable `_VERSION` from package.json in the current path', function () {
    const version = require('../package.json').version
    testStr('def-version-var', `@version ${version}`)
  })

  it('allows to define custom variables with the `values` option', function () {
    testFile('custom-vars', {
      values: {
        _ZERO: 0,
        _MYBOOL: false,
        _MYSTRING: 'foo',
        _INFINITY: 1 / 0,
        _NAN: parseInt('@', 10),
        _NULL: null,
        _UNDEF: undefined
      }
    })
  })

  it('directives ends at the end of the line or the first unquoted `//`', function () {
    testStr('directive-ending', 'true\n')
  })

  it('support conditional comments with the `#if _VAR` syntax', function () {
    testStr('if-cc-directive', 'true\n', {
      values: { _TRUE: true }
    })
  })
})


describe('Compile-time variables', function () {

  it('can be defined within the code by `#set`', function () {
    testStr('var-inline-var', 'true\nfoo\n')
  })

  it('can be defined within the code with JS expressions', function () {
    testStr('var-inline-expr', 'true\nfoo\n')
  })

  it('can be used for simple substitution in the code', function () {
    testStr('var-code-replace', 'true==1\n"foo"')
  })

  it('defaults to `undefined` if no value is given', function () {
    testStr('var-default-value', 'true')
  })

  it('can be changed anywhere in the code', function () {
    testStr('var-changes', 'true\nfalse')
  })

  it('`#unset` removes defined variables', function () {
    testStr('var-unset', 'true\n', { values: { _TRUE: true } })
  })

  it('`$` is used to paste jscc variable values', function () {
    testStr('var-paste', 'truetrue\n', { values: { _TRUE: true } })
  })

  it('varnames as function-like macros (C-like)', function () {
    testFile('var-macros')
  })

  it('syntax errors in expressions throws during the evaluation', function () {
    expect(function () { generate('var-eval-error') }).toThrow()
  })

  it('not defined vars are replaced with `undefined` during the evaluation', function () {
    testStr('var-eval-not-defined', 'true\n')
  })

  it('other runtime errors throws (like accesing props of undefined)', function () {
    expect(function () { generate('var-eval-prop-undef') }).toThrow(/\bundefined\b/)
  })
})


describe('Conditional compilation', function () {

  it('supports `#else`', function () {
    testStr('cc-else', 'true\n')
  })

  it('and the `#elif` directive', function () {
    testStr('cc-elif', 'true\n')
  })

  it('have `#ifset` for testing variable existence (even undefined values)', function () {
    testStr('cc-ifset', 'true\n')
  })

  it('and `#ifnset` for testing not defined variables', function () {
    testStr('cc-ifnset', 'true\n')
  })

  it('blocks can be nested', function () {
    testStr('cc-nested', '\ntrue\ntrue\ntrue\n')
  })

  it('you can throw an exception with custom message through `#error`', function () {
    expect(function () { generate('cc-error') }).toThrow(/boom!/)
  })

  it('unclosed conditional blocks throws an exception', function () {
    expect(function () { generate('cc-unclosed') }).toThrow(/Unexpected end of file/)
  })

  it('unbalanced blocks throws, too', function () {
    expect(function () { generate('cc-unbalanced') }).toThrow(/Unexpected #/)
  })

  it('can use multiline comments by closing the comment after `//`', function () {
    testFile('cc-hide-ml-cmts')
  })

  it('using multiline comments `/**/` allows hide content', function () {
    testFile('cc-hide-content')
  })

})


describe('HTML processing', function () {

  it('can be done including ".html" (whatever) in extensions', function () {
    testFile('html-vars-js.html', {
      extensions: ['html'],
      values: { _TITLE: 'My App' }
    })
  })

  it('can handle html comments including "<!--" in `prefixes`', function () {
    testFile('html-vars.html', {
      extensions: ['html'],
      prefixes: '<!--',
      values: { _TITLE: 'My App' }
    })
  })

})


describe('Options:', function () {

  it('default preprocess only files with extensions in [.js, .jsx, .tag]', function () {
    const result = generate('html-vars.html')
    expect(result).toBe(null)
  })

  it('`extensions`="*" (as string) must include all the files', function () {
    const result = generate('html-vars.html', {
      extensions: '*'
    })
    expect(result).toBeA('string')
  })

  it('special files are always ignored (filename starting with `\\0`)', function () {
    const result = generate('\0defaults')
    expect(result).toBe(null)
  })

  it('`exclude` avoids file preprocessing from given paths', function () {
    const result = generate('defaults', {
      exclude: ['**/fixtures/**']
    })
    expect(result).toBe(null)
  })

  it('`include` limit the preprocess to certain paths', function () {
    const result = generate('defaults', {
      include: ['**/fixtures/**']
    })
    expect(result).toBeA('string')
  })

  it('`keepLines` preserve line-endings (keep line count w/o sourceMaps)', function () {
    const types = require('./fixtures/_types.js')
    testFile('htmlparser', { values: { _T: types }, keepLines: true })
  })

})


describe('Examples:', function () {

  it('Simple replacement', function () {
    testFile('ex-simple-replacement')
  })

  it('Object and properties', function () {
    testFile('ex-object-properties')
  })

  it('Using _FILE and dates', function () {
    const result = generate('ex-file-and-date')
    expect(result).toMatch(/date\.js\s+Date: 20\d{2}-\d{2}-\d{2}\n/)
  })

  it('Hidden blocks (and process.env.*)', function () {
    testFile('ex-hidden-blocks', {}, true)
  })

})
