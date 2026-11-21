import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import * as ts from 'typescript';
import { DefaultNamingStrategy } from 'typeorm';
import {
  DOMAIN_MAP,
  findDomainForPrefix,
  findDomainForTable,
} from './domain-map';

function listTsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === '_experimental') return [];
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listTsFiles(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

function controllerPrefixes(root: string): string[] {
  const prefixes: string[] = [];
  for (const file of listTsFiles(root)) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(
      /@Controller\(\s*['"]([^'"]+)['"]\s*\)/g,
    )) {
      prefixes.push(match[1]);
    }
  }
  return prefixes;
}

function entityTables(root: string): string[] {
  const strategy = new DefaultNamingStrategy();
  const tables: string[] = [];

  for (const file of listTsFiles(root)) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    const visit = (node: ts.Node) => {
      if (ts.isClassDeclaration(node) && node.name) {
        for (const decorator of ts.getDecorators(node) ?? []) {
          const call = decorator.expression;
          if (
            !ts.isCallExpression(call) ||
            call.expression.getText(source) !== 'Entity'
          ) {
            continue;
          }
          const [arg] = call.arguments;
          let name: string | undefined;
          if (arg && ts.isStringLiteralLike(arg)) {
            name = arg.text;
          } else if (arg && ts.isObjectLiteralExpression(arg)) {
            const prop = arg.properties.find(
              (p): p is ts.PropertyAssignment =>
                ts.isPropertyAssignment(p) && p.name.getText(source) === 'name',
            );
            if (prop && ts.isStringLiteralLike(prop.initializer)) {
              name = prop.initializer.text;
            }
          }
          tables.push(strategy.tableName(node.name.text, name));
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return tables;
}

describe('backend domain ownership', () => {
  it('has one module and one set of prefixes per domain', () => {
    const modules = DOMAIN_MAP.map((domain) => domain.module);
    const domains = DOMAIN_MAP.map((domain) => domain.domain);
    const prefixes = DOMAIN_MAP.flatMap((domain) => [
      ...domain.prefixes,
      ...domain.legacyPrefixes,
    ]);
    const tables = DOMAIN_MAP.flatMap((domain) => domain.tables);

    expect(new Set(modules).size).toBe(modules.length);
    expect(new Set(domains).size).toBe(domains.length);
    expect(new Set(prefixes).size).toBe(prefixes.length);
    expect(new Set(tables).size).toBe(tables.length);
    expect(domains).toHaveLength(7);
  });

  it('assigns every controller prefix in the compiled backend to a domain', () => {
    const prefixes = controllerPrefixes(__dirname);
    const unmapped = [...new Set(prefixes)].filter(
      (prefix) => findDomainForPrefix(prefix) === undefined,
    );
    expect(unmapped).toEqual([]);
  });

  it('assigns every entity table in the compiled backend to a domain', () => {
    const unmapped = [...new Set(entityTables(__dirname))].filter(
      (table) => findDomainForTable(table) === undefined,
    );
    expect(unmapped).toEqual([]);
  });

  it('imports the seven domain modules from AppModule', () => {
    const appModule = readFileSync(
      join(__dirname, '..', 'app.module.ts'),
      'utf8',
    );
    for (const domain of DOMAIN_MAP) {
      expect(appModule).toContain(domain.module);
    }
  });
});
