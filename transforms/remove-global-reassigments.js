/**
 * remove
 * var SomeControl = window.SomeControl;
 * var SomeControl = window.SomeControl || SomeControl
 * **/
export default (file, {jscodeshift: j}, argOptions) => {
  const options = Object.assign({}, argOptions);
  const ast = j(file.source);

  ast.find(j.VariableDeclarator)
    .filter(isVariableDeclaratorMatchReassignment(j))
    .closest(j.VariableDeclaration)
    .remove();

  return ast.toSource({
    quote: options.quote,
  });
}

const isVariableDeclaratorMatchReassignment = (j) => path => {
  const name = path.node.id.name;
  const initNode = path.node.init;

  return (
    isMemberExpressionMatchReassignment(j, name, initNode) ||
    isLogicalExpressionMatchReassignment(j, name, initNode)
  );
};

const isIdentifierMatch = (j, name, node) => (
  node &&
  node.type === j.Identifier.name &&
  node.name === name
);

const isLiteralMatch = (j, name, node) => (
  node &&
  node.type === j.Literal.name &&
  node.value === name
);

const isMemberExpressionMatchReassignment = (j, name, node) => (
  node &&
  node.type === j.MemberExpression.name &&
  isIdentifierMatch(j, "window", node.object) &&
  isIdentifierMatch(j, name, node.property)
);

const isLogicalExpressionMatchReassignment = (j, name, node) => (
  node &&
  node.type === j.LogicalExpression.name &&
  node.operator === "||" &&
  isMemberExpressionMatchReassignment(j, name, node.left) &&
  (
    isIdentifierMatch(j, name, node.right) ||
    isLiteralMatch(j, null, node.right)
  )
);

