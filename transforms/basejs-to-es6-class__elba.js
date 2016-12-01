export default function transformer(file, api) {
  const j = api.jscodeshift;
  const {expression, statement, statements} = j.template;

  function variableDeclaratorToClassDeclaration(x) {
    return callExpressionToClassDeclaration(x.id, x.init)
  }

  function callExpressionToClassDeclaration(nameIdentifier, x) {
    const parentIdentifier = getParent(x.callee);
    const mixinIdentifiers = getMixins(x.callee);
    const extendsExpression = getExtendsExpression(parentIdentifier, mixinIdentifiers);
    const bodyMembers = getBodyMembers(x.arguments, nameIdentifier);
    const classDeclaration = j.classDeclaration(nameIdentifier, j.classBody(bodyMembers), extendsExpression);
    const staticClasses = getStaticClasses(x.arguments, nameIdentifier);
    return [classDeclaration].concat(staticClasses);
  }

  // x - MemberExpression
  // Parent.extend or Parent.preImplement(Mixin).extend
  function getParent(x) {
    if (x.property.name !== "extend") {
      throw new Error("Can't find extend call. Actual is " + x.property.name);
    }

    // Parent.extend
    if (x.object.type === j.Identifier.name
      || x.object.type === j.MemberExpression.name) {
      return x.object;
    }

    // Parent.preImplement(Mixin).extend
    if (x.object.type === j.CallExpression.name) {
      return x.object.callee.object;
    }

    throw new Error("Unknown object type " + x.object.type);
  }

  // x - MemberExpression
  // Parent.extend or Parent.preImplement(Mixin).extend
  function getMixins(x) {
    if (x.property.name !== "extend") {
      throw new Error("Can't find extend call. Actual is " + x.property.name);
    }

    // Parent.extend
    if (x.object.type === j.Identifier.name
      || x.object.type === j.MemberExpression.name) {
      return [];
    }

    // Parent.preImplement(Mixin).extend
    if (x.object.type === j.CallExpression.name) {
      if (x.object.callee.property.name !== "preImplement") {
        throw new Error(`Can't find preImplement. Actual is ${x.object.callee.property.name}`);
      }

      return x.object.arguments;
    }

    throw new Error("Unknown object type " + x.object.type);
  }

  function getExtendsExpression(parent, mixins) {
    if (mixins.length == 0) {
      return parent.name === "Base" ? null : parent;
    }

    return mixins.reduce((exp, m) => j.callExpression(m, [exp ? exp : parent]), null);
  }

  // desc = [ObjectExpression, ObjectExpression?]
  function getBodyMembers(descs, classNameIdentifier) {
    if (descs.length > 2) {
      throw new Error("Too many descs");
    }

    var prototypeProps = descs[0].properties.flatMap(p => propToMember(p, false, classNameIdentifier));
    var staticProps = descs.length == 2
      ? descs[1].properties.flatMap(p => propToMember(p, true, classNameIdentifier)).filter(x => x !== null)
      : [];
    return prototypeProps.concat(staticProps);
  }

  function propToMember(x, isStatic, classNameIdentifier) {
    var isStaticClassDeclaration = isStatic
      && x.value.type === j.CallExpression.name
      && x.value.callee.type === j.MemberExpression.name
      && x.value.callee.property.name == "extend";
    var nameIdentifier = x.key;
    if (!isStaticClassDeclaration && (x.value.type === j.Literal.name
      || x.value.type === j.MemberExpression.name
      || x.value.type === j.NewExpression.name
      || x.value.type === j.BinaryExpression.name
      || x.value.type === j.ObjectExpression.name
      || x.value.type === j.ArrayExpression.name
      || x.value.type === j.UnaryExpression.name
      || x.value.type === j.ConditionalExpression.name
      || x.value.type === j.CallExpression.name)) {
      var self = isStatic ? classNameIdentifier : j.thisExpression();
      var privateId = j.memberExpression(self, j.identifier(`___${nameIdentifier.name}`));
      var ternary = j.conditionalExpression(j.binaryExpression("===", privateId, j.identifier("undefined")),
        j.assignmentExpression("=", privateId, x.value),
        privateId);
      var result = [j.methodDefinition("get",
        nameIdentifier,
        j.functionExpression(null,
          [],
          j.blockStatement([j.returnStatement(ternary)])),
        isStatic)];
      if (x.value.type === j.Literal.name
        || x.value.type === j.ArrayExpression.name
        || x.value.type === j.UnaryExpression.name) {
        result.push(j.methodDefinition("set",
          nameIdentifier,
          j.functionExpression(null,
            [j.identifier("value")],
            j.blockStatement([j.assignmentStatement("=", privateId, j.identifier("value"))])),
          isStatic));
      }
      return result;
    }

    if (x.value.type === j.FunctionExpression.name) {
      var kind = nameIdentifier.name === "constructor" ? "constructor" : "method";
      return [j.methodDefinition(kind,
        nameIdentifier,
        j.functionExpression(null,
          x.value.params,
          replaceBaseCall(kind, nameIdentifier, x.value.body)),
        isStatic)];
    }

    if (isStaticClassDeclaration) {
      var staticClassNameIdentifier = j.identifier(classNameIdentifier.name + nameIdentifier.name);
      return [j.methodDefinition("get",
        nameIdentifier,
        j.functionExpression(null,
          [],
          j.blockStatement([j.returnStatement(staticClassNameIdentifier)])),
        isStatic)];
    }

    throw new Error("Unknown prop type " + x.value.type);
  }

  function replaceBaseCall(kind, nameIdentifier, blockStatement) {
    var replaced = blockStatement.body
      .map(s => {
        if (s.type !== j.ExpressionStatement.name
          || s.expression.type !== j.CallExpression.name
          || s.expression.callee.type !== j.MemberExpression.name) {
          return s;
        }

        if (s.expression.callee.object.type !== j.ThisExpression.name
          || s.expression.callee.property.name !== "base") {
          return s;
        }

        var superIdentifier = j.identifier("super");
        var callee = kind === "constructor"
          ? superIdentifier
          : j.memberExpression(superIdentifier, nameIdentifier);

        return j.expressionStatement(j.callExpression(callee, s.expression.arguments));
      });
    return j.blockStatement(replaced);
  }

  function getStaticClasses(descs, classNameIdentifier) {
    if (descs.length < 2) {
      return [];
    }

    return descs[1].properties
      .filter(p => p.value.type === j.CallExpression.name)
      .filter(p => p.value.callee.type !== j.MemberExpression.name
      || p.value.callee.property.name !== "getter")
      .flatMap(p => callExpressionToClassDeclaration(j.identifier(classNameIdentifier.name + p.key.name), p.value));
  }

  return j(file.source)
    .find(j.VariableDeclaration)
    .filter(v => v.parent.name === "program")
    .replaceWith(
      v => {
        if (v.node.declarations[0].init.type !== j.CallExpression.name
          || v.node.declarations[0].init.callee.type === j.FunctionExpression.name) {
          return v.node;
        }
        return v.node.declarations.flatMap(variableDeclaratorToClassDeclaration);
      }
    )
    .toSource();
};

Array.prototype.flatMap = function (lambda) {
  return Array.prototype.concat.apply([], this.map(lambda));
};