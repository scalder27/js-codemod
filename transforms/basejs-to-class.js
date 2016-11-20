const t = require('babel-types');

/**
 * This codemod is trying to split passed package imports
 */
module.exports = (fileInfo, {jscodeshift: j}, argOptions) => {
  const options = Object.assign({}, {quote: undefined}, argOptions);

  const ast = j(fileInfo.source);

  transformBaseJsToClass(ast, j);

  return ast.toSource({
    quote: options.quote,
  });
};

const transformBaseJsToClass = (ast, j) => {
  const baseCallExpressions = [];

  ast
    .find(j.CallExpression, {
      callee: {
        object: {
          name: 'Base',
        },
      },
    })
    .forEach(path => {
      baseCallExpressions.push(path);
    });

  baseCallExpressions.reverse().forEach(path => {
    const variableDeclarationPath = searchRecursively(path, 'VariableDeclaration', 3);

    if (variableDeclarationPath) {
      const declaration = variableDeclarationPath.node.declarations[0];
      j(variableDeclarationPath).replaceWith(
        t.exportNamedDeclaration(
          createClassDeclaration(
            declaration.id,
            createClassBody(path.node.arguments)
          ),
          []
        )
      );
    } else {
      j(path).replaceWith(
        createClassExpression(
          createClassBody(path.node.arguments)
        )
      );
    }
  });
};

const createClassBody = (args) => {
  const [methodsNode, staticMethodsNode] = args;
  const methods = methodsNode.properties.map(createClassMethod);
  const staticMethods = ((staticMethodsNode || {}).properties || []).map(createClassProperty);
  return t.classBody([
    ...methods,
    ...staticMethods,
  ]);
};

const createClassMethod = (property) => {
  if (property.value.type === 'FunctionExpression') {
    return t.classMethod(
      'method',
      property.key,
      property.value.params,
      property.value.body,
    );
  }

  return t.classProperty(
    property.key,
    property.value,
  );
};

const createClassProperty = (property) => {
  const classProperty = t.classProperty(
    t.identifier(property.key.name),
    property.value
  );

  classProperty.static = true;
  return classProperty;
};

const createClassExpression = (classBody) => t.classExpression(
  null,
  null,
  classBody,
  []
);

const createClassDeclaration = (identifier, classBody) => t.classDeclaration(
  identifier,
  null,
  classBody,
  []
);

const searchRecursively = (path, type, count) => {
  if (path && count) {
    return searchRecursively(path.parentPath, type, count - 1);
  } else if (path && path.node.type === type) {
    return path;
  } else {
    return null;
  }
};