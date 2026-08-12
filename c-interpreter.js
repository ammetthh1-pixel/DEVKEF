/* ══════════════════════════════════════════════════════════
   DEVKËF — Mini-interpréteur C pédagogique (v2)
   ⚠️ Ce n'est PAS un compilateur C complet, mais un interpréteur
   qui comprend réellement un sous-ensemble volontairement large
   de C, pour laisser l'étudiant coder COMME IL VEUT :
     - plusieurs fonctions (appels, y compris récursifs)
     - déclarations de variables (int/float/double/char/long x = ...;)
     - if / else if / else
     - switch / case / default / break  (avec fallthrough réel)
     - while, for, break, continue
     - expressions arithmétiques, comparaisons, && ||, littéraux 'x'
     - i++ / i--
   Non supporté : tableaux, pointeurs, structs, printf, chaînes.
   Une boucle/récursion trop longue est coupée automatiquement
   pour ne pas bloquer le navigateur.
══════════════════════════════════════════════════════════ */

class DKCError extends Error {}
class DKCReturn { constructor(v) { this.value = v; } }
class DKCBreak {}
class DKCContinue {}

const DKC_TYPES = new Set(['INT', 'FLOAT', 'DOUBLE', 'CHAR', 'LONG', 'UNSIGNED', 'VOID', 'SHORT']);
const DKC_KEYWORDS = new Set([
  'if', 'else', 'return', 'int', 'float', 'double', 'char', 'long', 'short', 'unsigned', 'void',
  'switch', 'case', 'default', 'break', 'continue', 'while', 'for'
]);

/* ── TOKENIZER ── */
function dkcTokenize(src) {
  src = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === "'") {
      let j = i + 1, val = '';
      while (j < src.length && src[j] !== "'") { val += src[j]; j++; }
      tokens.push({ t: 'CHAR', v: val });
      i = j + 1;
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      tokens.push({ t: 'NUM', v: parseFloat(src.slice(i, j)) });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      const word = src.slice(i, j);
      tokens.push({ t: DKC_KEYWORDS.has(word) ? word.toUpperCase() : 'IDENT', v: word });
      i = j;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (['==', '!=', '<=', '>=', '&&', '||', '++', '--'].includes(two)) {
      tokens.push({ t: two, v: two }); i += 2; continue;
    }
    if ('+-*/%(){};,=<>!:'.includes(c)) {
      tokens.push({ t: c, v: c }); i++; continue;
    }
    throw new DKCError('Caractère inattendu : "' + c + '"');
  }
  tokens.push({ t: 'EOF', v: null });
  return tokens;
}

/* ── PARSER : programme entier → table de fonctions ── */
function dkcParseProgram(fullSource) {
  const cleaned = fullSource.replace(/^\s*#.*$/gm, ''); // retire #include, #define...
  const tokens = dkcTokenize(cleaned);
  let pos = 0;
  const peek = () => tokens[pos];
  const peek2 = () => tokens[pos + 1];
  const next = () => tokens[pos++];
  const expect = (t) => { if (peek().t !== t) throw new DKCError(`Attendu "${t}", trouvé "${peek().v ?? peek().t}"`); return next(); };

  function consumeType() {
    if (!DKC_TYPES.has(peek().t)) throw new DKCError('Type attendu, trouvé "' + (peek().v ?? peek().t) + '"');
    while (DKC_TYPES.has(peek().t)) next();
  }

  function parseBlock() {
    expect('{');
    const stmts = [];
    while (peek().t !== '}') stmts.push(parseStmt());
    expect('}');
    return { k: 'block', body: stmts };
  }

  function parseStmt() {
    const p = peek();
    if (p.t === 'IF') return parseIf();
    if (p.t === 'SWITCH') return parseSwitch();
    if (p.t === 'WHILE') return parseWhile();
    if (p.t === 'FOR') return parseFor();
    if (p.t === 'BREAK') { next(); expect(';'); return { k: 'break' }; }
    if (p.t === 'CONTINUE') { next(); expect(';'); return { k: 'continue' }; }
    if (p.t === 'RETURN') {
      next();
      const e = peek().t === ';' ? null : parseExpr();
      expect(';');
      return { k: 'return', expr: e };
    }
    if (p.t === '{') return parseBlock();
    if (DKC_TYPES.has(p.t)) {
      consumeType();
      const name = expect('IDENT').v;
      let init = null;
      if (peek().t === '=') { next(); init = parseExpr(); }
      expect(';');
      return { k: 'decl', name, init };
    }
    if (p.t === 'IDENT' && peek2() && peek2().t === '=') {
      const name = next().v; next();
      const e = parseExpr();
      expect(';');
      return { k: 'assign', name, expr: e };
    }
    if (p.t === 'IDENT' && peek2() && (peek2().t === '++' || peek2().t === '--')) {
      const name = next().v;
      const op = next().t === '++' ? '+' : '-';
      expect(';');
      return { k: 'assign', name, expr: { k: 'bin', op, l: { k: 'var', name }, r: { k: 'num', v: 1 } } };
    }
    const e = parseExpr();
    expect(';');
    return { k: 'exprstmt', expr: e };
  }

  function parseIf() {
    expect('IF'); expect('(');
    const cond = parseExpr();
    expect(')');
    const thenB = peek().t === '{' ? parseBlock() : { k: 'block', body: [parseStmt()] };
    let elseB = null;
    if (peek().t === 'ELSE') {
      next();
      elseB = peek().t === 'IF' ? { k: 'block', body: [parseIf()] } : (peek().t === '{' ? parseBlock() : { k: 'block', body: [parseStmt()] });
    }
    return { k: 'if', cond, then: thenB, else: elseB };
  }

  function parseSwitch() {
    expect('SWITCH'); expect('(');
    const disc = parseExpr();
    expect(')'); expect('{');
    const cases = [];
    while (peek().t !== '}') {
      if (peek().t === 'CASE') {
        next();
        const val = peek().t === 'CHAR' ? { k: 'char', v: next().v } : { k: 'num', v: next().v };
        expect(':');
        const stmts = [];
        while (!['CASE', 'DEFAULT', '}'].includes(peek().t)) stmts.push(parseStmt());
        cases.push({ test: val, stmts });
      } else if (peek().t === 'DEFAULT') {
        next(); expect(':');
        const stmts = [];
        while (!['CASE', 'DEFAULT', '}'].includes(peek().t)) stmts.push(parseStmt());
        cases.push({ test: null, stmts });
      } else {
        throw new DKCError('Attendu "case" ou "default" dans un switch');
      }
    }
    expect('}');
    return { k: 'switch', disc, cases };
  }

  function parseWhile() {
    expect('WHILE'); expect('(');
    const cond = parseExpr();
    expect(')');
    const body = peek().t === '{' ? parseBlock() : { k: 'block', body: [parseStmt()] };
    return { k: 'while', cond, body };
  }

  function parseForClause(allowDecl) {
    if (peek().t === ';' || peek().t === ')') return null;
    if (allowDecl && DKC_TYPES.has(peek().t)) {
      consumeType();
      const name = expect('IDENT').v;
      let init = null;
      if (peek().t === '=') { next(); init = parseExpr(); }
      return { k: 'decl', name, init };
    }
    const name = expect('IDENT').v;
    if (peek().t === '=') { next(); return { k: 'assign', name, expr: parseExpr() }; }
    if (peek().t === '++') { next(); return { k: 'assign', name, expr: { k: 'bin', op: '+', l: { k: 'var', name }, r: { k: 'num', v: 1 } } }; }
    if (peek().t === '--') { next(); return { k: 'assign', name, expr: { k: 'bin', op: '-', l: { k: 'var', name }, r: { k: 'num', v: 1 } } }; }
    throw new DKCError('Clause de boucle invalide');
  }

  function parseFor() {
    expect('FOR'); expect('(');
    const init = parseForClause(true);
    expect(';');
    const cond = peek().t === ';' ? null : parseExpr();
    expect(';');
    const update = parseForClause(false);
    expect(')');
    const body = peek().t === '{' ? parseBlock() : { k: 'block', body: [parseStmt()] };
    return { k: 'for', init, cond, update, body };
  }

  // Expressions par précédence croissante
  function parseExpr() { return parseOr(); }
  function parseOr() { let l = parseAnd(); while (peek().t === '||') { next(); l = { k: 'bin', op: '||', l, r: parseAnd() }; } return l; }
  function parseAnd() { let l = parseEq(); while (peek().t === '&&') { next(); l = { k: 'bin', op: '&&', l, r: parseEq() }; } return l; }
  function parseEq() { let l = parseRel(); while (['==', '!='].includes(peek().t)) { const op = next().t; l = { k: 'bin', op, l, r: parseRel() }; } return l; }
  function parseRel() { let l = parseAdd(); while (['<', '>', '<=', '>='].includes(peek().t)) { const op = next().t; l = { k: 'bin', op, l, r: parseAdd() }; } return l; }
  function parseAdd() { let l = parseMul(); while (['+', '-'].includes(peek().t)) { const op = next().t; l = { k: 'bin', op, l, r: parseMul() }; } return l; }
  function parseMul() { let l = parseUnary(); while (['*', '/', '%'].includes(peek().t)) { const op = next().t; l = { k: 'bin', op, l, r: parseUnary() }; } return l; }
  function parseUnary() {
    if (peek().t === '-' || peek().t === '!') { const op = next().t; return { k: 'un', op, e: parseUnary() }; }
    return parsePrimary();
  }
  function parsePrimary() {
    const p = peek();
    if (p.t === 'NUM') { next(); return { k: 'num', v: p.v }; }
    if (p.t === 'CHAR') { next(); return { k: 'char', v: p.v }; }
    if (p.t === 'IDENT') {
      next();
      if (peek().t === '(') {
        next();
        const args = [];
        if (peek().t !== ')') {
          args.push(parseExpr());
          while (peek().t === ',') { next(); args.push(parseExpr()); }
        }
        expect(')');
        return { k: 'call', name: p.v, args };
      }
      return { k: 'var', name: p.v };
    }
    if (p.t === '(') { next(); const e = parseExpr(); expect(')'); return e; }
    throw new DKCError('Expression invalide près de "' + (p.v ?? p.t) + '"');
  }

  // ── Programme = liste de fonctions ──
  const funcs = {};
  while (peek().t !== 'EOF') {
    consumeType();
    const name = expect('IDENT').v;
    expect('(');
    const params = [];
    if (peek().t !== ')') {
      while (true) {
        consumeType();
        params.push(expect('IDENT').v);
        if (peek().t === ',') { next(); continue; }
        break;
      }
    }
    expect(')');
    const body = parseBlock();
    funcs[name] = { params, body };
  }
  return funcs;
}

/* ── ÉVALUATEUR ── */
function dkcEval(node, env, ctx) {
  switch (node.k) {
    case 'num': return node.v;
    case 'char': return node.v;
    case 'var':
      if (!(node.name in env)) throw new DKCError('Variable inconnue : ' + node.name);
      return env[node.name];
    case 'call': {
      const argVals = node.args.map(a => dkcEval(a, env, ctx));
      return dkcCallFunction(ctx.funcs, node.name, argVals, ctx.depth + 1, ctx.budget);
    }
    case 'un':
      if (node.op === '-') return -dkcEval(node.e, env, ctx);
      if (node.op === '!') return dkcEval(node.e, env, ctx) ? 0 : 1;
      break;
    case 'bin': {
      const l = dkcEval(node.l, env, ctx), r = dkcEval(node.r, env, ctx);
      switch (node.op) {
        case '+': return l + r; case '-': return l - r; case '*': return l * r;
        case '/': if (r === 0) throw new DKCError('Division par zéro'); return l / r;
        case '%': return l % r;
        case '==': return l === r ? 1 : 0; case '!=': return l !== r ? 1 : 0;
        case '<': return l < r ? 1 : 0; case '>': return l > r ? 1 : 0;
        case '<=': return l <= r ? 1 : 0; case '>=': return l >= r ? 1 : 0;
        case '&&': return (l && r) ? 1 : 0; case '||': return (l || r) ? 1 : 0;
      }
    }
  }
  throw new DKCError('Nœud non supporté : ' + node.k);
}

function dkcStep(ctx) {
  ctx.budget.steps++;
  if (ctx.budget.steps > ctx.budget.limit) throw new DKCError('Trop d\u2019itérations — boucle infinie probable.');
}

function dkcExec(block, env, ctx) {
  for (const stmt of block.body) {
    switch (stmt.k) {
      case 'decl': env[stmt.name] = stmt.init ? dkcEval(stmt.init, env, ctx) : 0; break;
      case 'assign': env[stmt.name] = dkcEval(stmt.expr, env, ctx); break;
      case 'exprstmt': dkcEval(stmt.expr, env, ctx); break;
      case 'return': throw new DKCReturn(stmt.expr ? dkcEval(stmt.expr, env, ctx) : undefined);
      case 'break': throw new DKCBreak();
      case 'continue': throw new DKCContinue();
      case 'if':
        if (dkcEval(stmt.cond, env, ctx)) dkcExec(stmt.then, env, ctx);
        else if (stmt.else) dkcExec(stmt.else, env, ctx);
        break;
      case 'block': dkcExec(stmt, env, ctx); break;
      case 'switch': {
        const val = dkcEval(stmt.disc, env, ctx);
        let startIdx = stmt.cases.findIndex(c => c.test !== null && dkcEval(c.test, env, ctx) === val);
        if (startIdx === -1) startIdx = stmt.cases.findIndex(c => c.test === null);
        if (startIdx !== -1) {
          try {
            for (let i = startIdx; i < stmt.cases.length; i++) {
              dkcExec({ k: 'block', body: stmt.cases[i].stmts }, env, ctx);
            }
          } catch (e) { if (!(e instanceof DKCBreak)) throw e; }
        }
        break;
      }
      case 'while':
        while (dkcEval(stmt.cond, env, ctx)) {
          dkcStep(ctx);
          try { dkcExec(stmt.body, env, ctx); }
          catch (e) { if (e instanceof DKCBreak) break; if (!(e instanceof DKCContinue)) throw e; }
        }
        break;
      case 'for': {
        if (stmt.init) dkcExec({ k: 'block', body: [stmt.init] }, env, ctx);
        while (stmt.cond ? dkcEval(stmt.cond, env, ctx) : true) {
          dkcStep(ctx);
          try { dkcExec(stmt.body, env, ctx); }
          catch (e) { if (e instanceof DKCBreak) break; if (!(e instanceof DKCContinue)) throw e; }
          if (stmt.update) dkcExec({ k: 'block', body: [stmt.update] }, env, ctx);
        }
        break;
      }
    }
  }
}

function dkcCallFunction(funcs, name, args, depth, budget) {
  if (depth > 300) throw new DKCError('Trop d\u2019appels imbriqués (récursion infinie ?)');
  const fn = funcs[name];
  if (!fn) throw new DKCError('Fonction inconnue : ' + name + '()');
  const env = {};
  fn.params.forEach((p, i) => { env[p] = args[i]; });
  const ctx = { funcs, depth, budget };
  try {
    dkcExec(fn.body, env, ctx);
  } catch (e) {
    if (e instanceof DKCReturn) return e.value;
    throw e;
  }
  return undefined;
}

/* ── POINT D'ENTRÉE : appelé par le composant calculatrice ── */
function dkcRunCalculer(fullSource, a, op, b) {
  const funcs = dkcParseProgram(fullSource);
  if (!funcs.calculer) throw new DKCError('Fonction "calculer" introuvable. Vérifie sa signature.');
  const budget = { steps: 0, limit: 300000 };
  const result = dkcCallFunction(funcs, 'calculer', [a, op, b], 0, budget);
  if (result === undefined) throw new DKCError('La fonction ne retourne rien pour ce cas (return manquant).');
  return result;
}
