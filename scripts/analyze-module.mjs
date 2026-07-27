// 分析一个大 JS 模块的顶层声明与相互引用,为拆分做依据。
// 输出: 每个顶层声明的 [名字, 类型, 起止行], 以及哪些顶层 let/var 被哪些函数写入。
import fs from 'node:fs';
import * as espree from 'espree';

const file = process.argv[2];
const src = fs.readFileSync(file, 'utf8');
const ast = espree.parse(src, { ecmaVersion: 'latest', sourceType: 'module', loc: true });

const decls = []; // {name, kind, start, end}

function declNames(node) {
  const names = [];
  const walk = (pat) => {
    if (!pat) return;
    if (pat.type === 'Identifier') names.push(pat.name);
    else if (pat.type === 'ObjectPattern') pat.properties.forEach(p => walk(p.value ?? p.argument));
    else if (pat.type === 'ArrayPattern') pat.elements.forEach(walk);
    else if (pat.type === 'AssignmentPattern') walk(pat.left);
    else if (pat.type === 'RestElement') walk(pat.argument);
  };
  walk(node);
  return names;
}

for (const node of ast.body) {
  const loc = { start: node.loc.start.line, end: node.loc.end.line };
  let inner = node.type === 'ExportNamedDeclaration' && node.declaration ? node.declaration : node;
  if (inner.type === 'FunctionDeclaration' || inner.type === 'ClassDeclaration') {
    decls.push({ name: inner.id.name, kind: inner.type === 'ClassDeclaration' ? 'class' : 'function', ...loc });
  } else if (inner.type === 'VariableDeclaration') {
    for (const d of inner.declarations) {
      for (const name of declNames(d.id)) {
        decls.push({ name, kind: inner.kind, ...loc });
      }
    }
  } else if (node.type === 'ImportDeclaration') {
    decls.push({ name: '(import)', kind: 'import', ...loc, source: node.source.value });
  } else if (node.type === 'ExportNamedDeclaration' && !node.declaration) {
    decls.push({ name: '(export-list)', kind: 'export', ...loc });
  } else {
    decls.push({ name: `(${node.type})`, kind: 'stmt', ...loc });
  }
}

const declByName = new Map(decls.filter(d => !d.name.startsWith('(')).map(d => [d.name, d]));

// 找出每个顶层声明体内引用了哪些其它顶层名,以及对顶层 let/var 的写入。
// 简化:按行归属。扫描全文所有标识符出现(粗粒度,用正则逐个名字查太慢,这里走 AST)。
const refs = new Map();   // declName -> Set(referenced top names)
const writes = new Map(); // topVarName -> Set(writer declName)

function ownerOfLine(line) {
  // 顶层声明按 start 排序,二分找 line 所在的声明
  let lo = 0, hi = decls.length - 1, ans = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (decls[mid].start <= line) { ans = decls[mid]; lo = mid + 1; } else hi = mid - 1;
  }
  if (ans && line <= ans.end) return ans;
  return null;
}

function visit(node, report) {
  if (!node || typeof node.type !== 'string') return;
  if (node.type === 'Identifier') report(node);
  if (node.type === 'AssignmentExpression' || node.type === 'UpdateExpression') {
    const target = node.left ?? node.argument;
    if (target?.type === 'Identifier' && declByName.has(target.name)) {
      const owner = ownerOfLine(node.loc.start.line);
      const d = declByName.get(target.name);
      if ((d.kind === 'let' || d.kind === 'var') && owner && owner.name !== target.name) {
        if (!writes.has(target.name)) writes.set(target.name, new Set());
        writes.get(target.name).add(owner.name);
      }
    }
  }
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'range' || key === 'parent') continue;
    const v = node[key];
    if (Array.isArray(v)) v.forEach(c => visit(c, report));
    else if (v && typeof v.type === 'string') visit(v, report);
  }
}

visit(ast, (id) => {
  if (!declByName.has(id.name)) return;
  const owner = ownerOfLine(id.loc.start.line);
  if (!owner || owner.name === id.name) return;
  if (!refs.has(owner.name)) refs.set(owner.name, new Set());
  refs.get(owner.name).add(id.name);
});

const out = {
  file,
  totalLines: src.split('\n').length,
  decls,
  refs: Object.fromEntries([...refs].map(([k, v]) => [k, [...v]])),
  mutableTopVars: decls.filter(d => d.kind === 'let' || d.kind === 'var').map(d => d.name),
  writes: Object.fromEntries([...writes].map(([k, v]) => [k, [...v]])),
};
fs.writeFileSync(process.argv[3] || (file + '.analysis.json'), JSON.stringify(out, null, 1));
console.log(`decls=${decls.length} refs=${refs.size} mutable=${out.mutableTopVars.length} writtenVars=${writes.size}`);
