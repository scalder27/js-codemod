const _ = require('lodash/fp');
const t = require('babel-types');



const DEFAULT_OPTIONS = {
  quote: undefined,
  modulesDir: undefined,
  package: undefined,
  globalVar: undefined
};

const ASSIGN_TYPES = new Set([
  'ImportDefaultSpecifier',
  'ImportSpecifier',
  'ImportNamespaceSpecifier',

]);

/**
 * This codemod is trying to split passed package imports
 */
module.exports = (fileInfo, {jscodeshift: j}, argOptions) => {
  const options = Object.assign({}, DEFAULT_OPTIONS, argOptions);

  if (!(options.package && options.name)) {
    throw new Error('Please provide package name and globalVar options. Example: --package=jquery --globalVar=$');
  }

  const ast = j(fileInfo.source);
  const metaData = createDefaultMeta(fileInfo.path, options.package, options.name);

  const main = _.pipe([
    findPackageImports(ast, j),
    inlineImportDefaultsUsages(ast, j),
    inlineImportDefaultsUsagesForJSX(ast, j),
    transformImportDeclarations(ast, j),
  ]);

  main(metaData);

  return ast.toSource({
    quote: options.quote,
  });
};

const createDefaultMeta = (filePath, packageName, modulesDir) => ({
  filePath,
  modulesDir,
  packageName,
  identifiers: [],
});

const findIdentifiers = (ast, j) => (metaData) => {
  ast.find(j.Identifier, {
    name: metaData.globalVar
  })
    .filter(path => {
      path;
    });
};