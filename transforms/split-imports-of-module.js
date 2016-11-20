const _ = require('lodash/fp');
const t = require('babel-types');

/**
 * This codemod is trying to split passed package imports
 */
module.exports = (fileInfo, {jscodeshift: j}, argOptions) => {
  const options = Object.assign({}, {quote: undefined, modulesDir: undefined}, argOptions);
  const packageName = options.package;

  if (!packageName) {
    throw new Error('Please provide package name which should be split. Example: --package=react-router');
  }

  const ast = j(fileInfo.source);
  const metaData = createDefaultMeta(fileInfo.path, packageName, options.modulesDir);

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
  imports: [],
  importSpecifiers: new Map(),
  importDefaultSpecifiers: new Set(),
});

const findPackageImports = (ast, j) => (metaData) => {
  const imports = ast.find(j.ImportDeclaration, {
    source: {
      value: metaData.packageName,
    },
  });

  imports.forEach(path => {
    path.node.specifiers.forEach(sp => {
      if (t.isImportSpecifier(sp) && sp.imported.name !== 'default') {
        metaData.importSpecifiers.set(sp.local.name, sp.imported.name);
      } else {
        metaData.importDefaultSpecifiers.add(sp.local.name);
      }
    });
  });

  metaData.imports = imports;
  return metaData;
};

const inlineImportDefaultsUsages = (ast, j) => (metaData) => {
  ast
    .find(j.CallExpression, ({callee}) => callee && callee.object && metaData.importDefaultSpecifiers.has(callee.object.name))
    .forEach(path => {
      const methodName = path.node.callee.property.name;
      metaData.importSpecifiers.set(methodName, methodName);

      j(path).replaceWith(
        j.callExpression(
          j.identifier(methodName),
          path.node.arguments
        )
      );
    });

  return metaData;
};

const inlineImportDefaultsUsagesForJSX = (ast, j) => (metaData) => {
  ast
    .find(j.JSXMemberExpression, node => (
      node.object &&
      metaData.importDefaultSpecifiers.has(node.object.name)
    ))
    .forEach(path => {
      const methodName = path.node.property.name;
      metaData.importSpecifiers.set(methodName, methodName);

      j(path).replaceWith(t.JSXIdentifier(methodName));
    });

  return metaData;
};

const transformImportDeclarations = (ast, j) => (metaData) => {
  const importDeclarations = Array.from(metaData.importSpecifiers)
    .map(([packageName, moduleName]) => {
      let source;

      if (metaData.modulesDir) {
        source = `${metaData.packageName}/${metaData.modulesDir}/${moduleName}`;
      } else {
        source = `${metaData.packageName}/${moduleName}`;
      }

      return createImportDefault(packageName, source);
    });

  if (importDeclarations.length === 0) {
    return metaData;
  }

  metaData.imports.forEach((path, index) => {
    const ast = j(path);
    if (index === 0) {
      ast.replaceWith(importDeclarations);
    } else {
      ast.remove();
    }
  });

  return metaData;
};

const createImportDefault = (name, source) => t.ImportDeclaration(
  [
    t.ImportDefaultSpecifier(
      t.Identifier(name)
    ),
  ],
  t.StringLiteral(source)
);