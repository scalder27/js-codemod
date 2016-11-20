const _ = require('lodash/fp');
const CHAIN_METHOD = 'chain';
const ALIAS_TO_REPLACE = new Map([
  ['contains', 'includes'],
]);


/**
 * This codemod is trying to find out any usages of underscore or lodash, including global '_',
 * and then replacing all of them with inlined methods and split imports.
 */
module.exports = (fileInfo, {jscodeshift: j}, argOptions) => {
  const options = Object.assign({}, {quote: undefined}, argOptions);

  const ast = j(fileInfo.source);
  const metaData = createDefaultMeta(fileInfo.path);

  const main = _.pipe([
    findUnderscoreAndLodashImports(ast, j),
    fillMetaWithImportIdentifierNames(ast, j),
    transformCallExpressionsAndAddMethods(ast, j),
    injectLodashImportExpressions(ast, j),
  ]);

  main(metaData);
  return ast.toSource({quote: options.quote});
};

const transformCallExpressionsAndAddMethods = (ast, j) => (metaData) => {
  ast
    .find(j.CallExpression, node => (
      node.callee.object &&
      metaData.defaultIdentifiers.has(node.callee.object.name)
    ))
    .forEach(path => {
      const methodName = path.node.callee.property.name;
      metaData.methodIdentifiers.add(methodName);

      j(path).replaceWith(
        j.callExpression(
          j.identifier(methodName),
          path.node.arguments
        )
      );
    });

  return metaData;
};

const fillMetaWithImportIdentifierNames = (ast, j) => (metaData) => {
  metaData.imports.forEach(path => {
    path.node.specifiers.forEach(sp => {
      if (sp.imported && sp.imported.name === sp.local.name) {
        metaData.methodIdentifiers.add(sp.local.name);
      } else {
        metaData.defaultIdentifiers.add(sp.local.name);
      }
    });
  });

  return metaData;
};

const findUnderscoreAndLodashImports = (ast, j) => (metaData) => {
  metaData.imports = ast.find(j.ImportDeclaration)
    .filter(path => {
      const sourceValue = path.node.source.value;
      return sourceValue === 'underscore' || sourceValue === 'lodash';
    });

  return metaData;
};

const injectLodashImportExpressions = (ast, j) => (metaData) => {
  const importExpressions = [];

  if (metaData.methodIdentifiers.size === 0) {
    return metaData;
  }

  if (metaData.methodIdentifiers.has(CHAIN_METHOD)) {
    metaData.methodIdentifiers.delete(CHAIN_METHOD);

    console.warn(`
        ${metaData.filePath}
        This file has the chain method. It's dangerous to use chain split import,
        because of each method, used in chain, should be imported explicitly.
      `);

    const importExpression = createNamedImport(j, CHAIN_METHOD, 'lodash');
    importExpressions.push(importExpression);
  }

  for (const method of metaData.methodIdentifiers) {
    const source = ALIAS_TO_REPLACE.has(method) ? ALIAS_TO_REPLACE.get(method) : method;
    const importExpression = createDefaultImport(j, method, `lodash/${source}`);
    importExpressions.push(importExpression);
  }

  if (metaData.imports.size() > 0) {
    metaData.imports.forEach((path, index) => {
      if (index === 0) {
        j(path).replaceWith(importExpressions);
      } else {
        j(path).remove();
      }
    });
  } else {
    ast.find(j.Program).forEach(path => {
      if (path.value.body[0].comments) {
        importExpressions[0].comments = path.value.body[0].comments;
        path.value.body[0].comments = null;
      }

      path.value.body = importExpressions.concat(path.value.body);
    });
  }
};

const createDefaultMeta = (filePath) => ({
  filePath,
  defaultIdentifiers: new Set('_'),
  methodIdentifiers: new Set(),
  imports: [],
});

const createDefaultImport = (j, identifier, source) => j.importDeclaration(
  [
    j.importDefaultSpecifier(
      j.identifier(identifier)
    ),
  ],
  j.stringLiteral(source)
);

const createNamedImport = (j, identifier, source) => j.importDeclaration(
  [
    j.importSpecifier(
      j.identifier(identifier),
      j.identifier(identifier),
    ),
  ],
  j.stringLiteral(source)
);