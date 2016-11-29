import fs from "fs";
import path from "path";
import jsc from "jscodeshift";

if (!process.argv.includes("--run-in-band")) {
  throw new Error("transformations should be run with `--run-in-band` option")
}

let wasFileInfoCreated = false;

export default (file, {jscodeshift: j}, argOptions) => {
  const options = Object.assign({}, {outputDir: "./", fileName: "gathered_info.json"}, argOptions);
  const outputDir = path.resolve(process.cwd(), options.outputDir);
  const jsonFilePath = `${outputDir}/${options.fileName}`;

  if (!wasFileInfoCreated) {
    wasFileInfoCreated = true;
    fs.writeFileSync(jsonFilePath, "{}");
  }

  const ast = j(file.source);

  const hasModuleSystem = ast
      .filter(path => hasImports(path) || hasExports(path) || hasRequires(path) || hasModuleExports(path))
      .size() > 0;

  const metaData = createMeta(file.path, !hasModuleSystem);
  const body = ast.find(j.Program).get(0).node.body;
  processDependencies(body, metaData.scope);

  const processedMeta = processMetaData(metaData.scope);

  const fileInfo = JSON.parse(fs.readFileSync(jsonFilePath, "utf8"));
  const absolutFilePath = path.resolve(process.cwd(), file.path);
  fs.writeFileSync(jsonFilePath, JSON.stringify({...fileInfo, [absolutFilePath]: processedMeta}, null, 4));
  return file.source;
}

const createMeta = (filePath, global) => ({
  filePath,
  scope: createScope(global)
});

const createScope = (global = false) => ({
  global,
  declarations: new Set(),
  dependencies: new Set(),
  scopes: []
});

const processMetaData = (meta, scopeDeclarations = [], result = {shouldBeExported: [], shouldBeImported: []}) => {
  const declarations = Array.from(meta.declarations);
  const dependencies = Array.from(meta.dependencies);
  const allDeclarations = new Set([...scopeDeclarations, ...declarations]);

  if (meta.global) {
    result.shouldBeExported = [...result.shouldBeExported, ...declarations];
  }

  result.shouldBeImported = Array.from(new Set([...result.shouldBeImported, ...dependencies]))
    .filter(dependency => !allDeclarations.has(dependency) && !systemGlobals.has(dependency));

  return meta.scopes
    .reduce((result, scope) => processMetaData(scope, Array.from(allDeclarations), result), result);
};

const hasImports = (path) => jsc(path).find(jsc.ImportDeclaration).size() > 0;

const hasExports = (path) => {
  const ast = jsc(path);

  if (ast.find(jsc.ExportNamedDeclaration).size() > 0) {
    return true;
  }

  if (ast.find(jsc.ExportDefaultDeclaration).size() > 0) {
    return true;
  }

  return false
};

const hasRequires = (path) => {
  return jsc(path).find(jsc.CallExpression, (node) => (
      (node.callee.name && node.callee.name === "require") ||
      (node.callee.object && node.callee.object.name === "require")
    )).size() > 0;
};

const hasModuleExports = (path) => jsc(path).find(jsc.MemberExpression, {
  object: {
    name: "module"
  },
  property: {
    name: "exports"
  }
}).size() > 0;

const processDependencies = (node, scope) => {
  if (Array.isArray(node)) {
    node.forEach(n => processDependencies(n, scope));
  } else if (node && nodeTypesProcesser.has(node.type)) {
    nodeTypesProcesser.get(node.type)(node, scope);
  }
};

const processDeclarations = (node, scope) => {
  if (Array.isArray(node)) {
    node.forEach(n => processDeclarations(n, scope));
  } else if (node && declarationsFiller.has(node.type)) {
    declarationsFiller.get(node.type)(node, scope);
  }
};


const nodeTypesProcesser = new Map();

nodeTypesProcesser.set(jsc.VariableDeclaration.name, (node, scope) => {
  processDependencies(node.declarations, scope);
});

nodeTypesProcesser.set(jsc.VariableDeclarator.name, (node, scope) => {
  // exclude statement var a = window.a;
  if ((
      node.init &&
      node.init.type === jsc.MemberExpression.name &&
      node.init.object &&
      node.init.object.name === "window" &&
      node.init.property &&
      node.init.property.name === node.id.name
    )) {
    return;
  }

  processDependencies(node.init, scope);
  processDeclarations(node.id, scope);
});

nodeTypesProcesser.set(jsc.ImportDeclaration.name, (node, scope) => {
  processDeclarations(node.specifiers.map(sp => sp.local), scope);
});

nodeTypesProcesser.set(jsc.CallExpression.name, (node, scope) => {
  processDependencies(node.callee, scope);
  processDependencies(node.arguments, scope);
});

nodeTypesProcesser.set(jsc.MemberExpression.name, (node, scope) => {
  processDependencies(node.object, scope);
});

nodeTypesProcesser.set(jsc.Identifier.name, (node, scope) => {
  scope.dependencies.add(node.name);
});

nodeTypesProcesser.set(jsc.ObjectExpression.name, (node, scope) => {
  processDependencies(node.properties, scope);
});

nodeTypesProcesser.set(jsc.Property.name, (node, scope) => {
  processDependencies(node.value, scope);
});

nodeTypesProcesser.set(jsc.FunctionExpression.name, (node, scope) => {
  const newScope = createScope();
  processDeclarations(node.params, newScope);
  processDependencies(node.body, newScope);

  scope.scopes.push(newScope);
});

nodeTypesProcesser.set(jsc.FunctionDeclaration.name, (node, scope) => {
  processDeclarations(node.id, scope);

  const newScope = createScope();
  processDeclarations(node.params, newScope);
  processDependencies(node.body, newScope);

  scope.scopes.push(newScope);
});

nodeTypesProcesser.set(jsc.BlockStatement.name, (node, scope) => {
  processDependencies(node.body, scope);
});

nodeTypesProcesser.set(jsc.ExpressionStatement.name, (node, scope) => {
  processDependencies(node.expression, scope);
});

nodeTypesProcesser.set(jsc.AssignmentExpression.name, (node, scope) => {
  processDependencies(node.left, scope);
  processDependencies(node.right, scope);
});

nodeTypesProcesser.set(jsc.LogicalExpression.name, (node, scope) => {
  processDependencies(node.left, scope);
  processDependencies(node.right, scope);
});

nodeTypesProcesser.set(jsc.BinaryExpression.name, (node, scope) => {
  processDependencies(node.left, scope);
  processDependencies(node.right, scope);
});

nodeTypesProcesser.set(jsc.NewExpression.name, (node, scope) => {
  processDependencies(node.callee, scope);
  processDependencies(node.arguments, scope);
});

nodeTypesProcesser.set(jsc.IfStatement.name, (node, scope) => {
  processDependencies(node.test, scope);
  processDependencies(node.consequent, scope);
  processDependencies(node.alternate, scope);
});

nodeTypesProcesser.set(jsc.ForInStatement.name, (node, scope) => {
  processDependencies(node.left, scope);
  processDependencies(node.right, scope);
  processDependencies(node.body, scope);
});

nodeTypesProcesser.set(jsc.TryStatement.name, (node, scope) => {
  processDependencies(node.block, scope);
  processDependencies(node.handler, scope);
  processDependencies(node.finalizer, scope);
});

nodeTypesProcesser.set(jsc.CatchClause.name, (node, scope) => {
  if (node.param) {
    scope.declarations.add(node.param.name);
  }

  processDependencies(node.body, scope);
});

nodeTypesProcesser.set(jsc.ReturnStatement.name, (node, scope) => {
  processDependencies(node.argument, scope);
});

nodeTypesProcesser.set(jsc.SwitchStatement.name, (node, scope) => {
  processDependencies(node.discriminant, scope);
  processDependencies(node.cases, scope);
});

nodeTypesProcesser.set(jsc.SwitchCase.name, (node, scope) => {
  processDependencies(node.test, scope);
  processDependencies(node.consequent, scope);
});

nodeTypesProcesser.set(jsc.UpdateExpression.name, (node, scope) => {
  processDependencies(node.argument, scope);
});

nodeTypesProcesser.set(jsc.TemplateLiteral.name, (node, scope) => {
  processDependencies(node.expressions, scope);
});


const declarationsFiller = new Map();

declarationsFiller.set(jsc.Identifier.name, (node, scope) => {
  scope.declarations.add(node.name);
});

declarationsFiller.set(jsc.ObjectPattern.name, (node, scope) => {
  processDeclarations(node.properties, scope);
});

declarationsFiller.set(jsc.Property.name, (node, scope) => {
  processDeclarations(node.value, scope);
});

declarationsFiller.set(jsc.ArrayPattern.name, (node, scope) => {
  processDeclarations(node.elements, scope);
});

declarationsFiller.set(jsc.RestElement.name, (node, scope) => {
  processDeclarations(node.argument, scope);
});

declarationsFiller.set(jsc.AssignmentPattern.name, (node, scope) => {
  processDeclarations(node.left, scope);
});

const systemGlobals = new Set([
  "undefined",
  "String",
  "Number",
  "Boolean",
  "Object",
  "Array",
  "Function",
  "Date",
  "Math",
  "NaN",
  "isNaN",
  "Infinity",
  "JSON",
  "XMLHttpRequest",
  "window",
  "document",
  "location",
  "navigator",
  "parseFloat",
  "setTimeout",
  "setInterval",
  "clearTimeout",
  "clearInterval",
  "swfobject",
  "ActiveXObject",
  "RangeError",
  "Error",
  "module",
  "require",
  "define",
  "global",
  "__dirname",
  "RegExp",
  "parseInt",
  "arguments",
  "console",
  "alert",
  "prompt",
  "confirm",
  "eval",
  "encodeURIComponent",
  "decodeURIComponent",
  "encodeURI",
  "decodeURI",
  "describe"
]);