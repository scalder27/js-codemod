/**
 * remove
 * if (typeof module === "object" && module.exports) {
 *    module.exports = SomeControl;
 * }
 **/
export default (file, {jscodeshift: j}, argOptions) => {
  const options = Object.assign({}, argOptions);
  const ast = j(file.source);

  ast.find(j.IfStatement)
    .filter(isIfShouldBeRemoved(j))
    .remove();

  return ast.toSource({
    quote: options.quote,
  });
}

const isIfShouldBeRemoved = j => path => {
  const testNode = path.node.test;
  return (
    testNode &&
    testNode.type === j.LogicalExpression.name &&
    testNode.operator === "&&" &&
    memberExpressionMatches(j, testNode.right) &&
    binaryExpressionMatches(j, testNode.left)
  );
};

const unaryExpressionMatches = (j, node) => (
  node &&
  node.type === j.UnaryExpression.name &&
  node.operator === "typeof" &&
  identifierMatches(j, node.argument, "module")
);

const binaryExpressionMatches = (j, node) => (
  node &&
  node.type === j.BinaryExpression.name &&
  unaryExpressionMatches(j, node.left) &&
  node.right &&
  node.right.type === j.Literal.name &&
  node.right.value === "object"
);

const identifierMatches = (j, node, name) => (
  node &&
  node.type === j.Identifier.name &&
  node.name === name
);

const memberExpressionMatches = (j, node) => (
  node &&
  node.type === j.MemberExpression.name &&
  identifierMatches(j, node.object, "module") &&
  identifierMatches(j, node.property, "exports")
);