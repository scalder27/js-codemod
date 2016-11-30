import fs from "fs";
import path from "path";

const defaultImportSourcesMap = new Map([
  ["jQuery", "jquery"],
  ["$", "jquery"],
  ["_", "lodash"],
]);

let dependenciesMap;
let parsedJsonFile;

export default (fileInfo, {jscodeshift: j}, argOptions) => {
  const options = Object.assign({}, {jsonFile: "./gathered_info.json"}, argOptions);
  if (!parsedJsonFile) {
    parsedJsonFile = parseJsonFile(options.jsonFile);
  }

  if (!dependenciesMap) {
    dependenciesMap = fillDependenciesMap(parsedJsonFile);
  }

  const absoluteFilePath = path.resolve(process.cwd(), fileInfo.path);
  const {shouldBeExported, shouldBeImported} = parsedJsonFile[absoluteFilePath];
  const ast = j(fileInfo.source);

  if (shouldBeExported && shouldBeExported.length > 0) {
    ast
      .find(j.VariableDeclaration, (node) => {
        return node.declarations.some(declarator => shouldBeExported.includes(declarator.id.name));
      })
      .replaceWith(wrapWithExportNamedDeclaration(j));

    ast
      .find(j.FunctionDeclaration, (node) => shouldBeExported.includes(node.id.name))
      .replaceWith(wrapWithExportNamedDeclaration(j));

    ast
      .find(j.ClassDeclaration, (node) => shouldBeExported.includes(node.id.name))
      .replaceWith(wrapWithExportNamedDeclaration(j));
  }

  if (shouldBeImported && shouldBeImported.length > 0) {
    const importsMap = new Map();
    shouldBeImported
      .filter(value => dependenciesMap.has(value) || defaultImportSourcesMap.has(value))
      .sort((a, b) => defaultImportSourcesMap.has(a) ? -1 : 1)
      .forEach(value => {
        if (dependenciesMap.has(value)) {
          const source = dependenciesMap.get(value);
          if (!importsMap.has(source)) {
            importsMap.set(source, []);
          }

          importsMap.get(source).push(value);
        } else if (defaultImportSourcesMap.has(value)) {
          const source = defaultImportSourcesMap.get(value);
          if (!importsMap.has(source)) {
            importsMap.set(source, []);
          }

          importsMap.get(source).push(value);
        }
      });

    if (importsMap.size > 0) {
      ast.find(j.Program).forEach(nodePath => {
        const importDeclarations = Array.from(importsMap).map(([ source, names ]) => {
          if (names.some(name => defaultImportSourcesMap.has(name))) {
            if (names.length > 1) {
              return j.importDeclaration(
                names.map(name => j.importSpecifier(
                  j.identifier(name),
                  j.identifier("default")
                )),
                j.stringLiteral(source)
              );
            }

            return j.importDeclaration(
              names.map(name => j.importDefaultSpecifier(
                j.identifier(name)
              )),
              j.stringLiteral(source)
            );
          }

          const relativePath = path.normalize(path.relative(absoluteFilePath, source));
          return j.importDeclaration(
            names.map(name => j.importSpecifier(
              j.identifier(name)
            )),
            j.stringLiteral(relativePath.replace(/\\/g, "/"))
          );
        });

        importDeclarations.push(j.template.statement`
        
        `);
        nodePath.node.body = importDeclarations.concat(nodePath.node.body);
      });
    }
  }

  return ast.toSource({
    quote: options.quote,
  });
};

const parseJsonFile = (jsonFile) => {
  const filePath = path.resolve(process.cwd(), jsonFile);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
};

const fillDependenciesMap = (infoFile) => {
  return Object.keys(infoFile)
    .reduce((result, key) => {
      infoFile[key].shouldBeExported.forEach(value => result.set(value, key));
      return result;
    }, new Map())
};

const wrapWithExportNamedDeclaration = j => path => {
  const comments = path.node.comments;
  path.node.comments = null;

  const exportNamedDeclaration = j.exportNamedDeclaration(path.node);
  exportNamedDeclaration.comments = comments;

  return exportNamedDeclaration;
};
