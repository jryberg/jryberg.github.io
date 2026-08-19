  // ── awk (a practical subset) ─────────────────────────────────────────────
  // Supports: BEGIN/END rules, /regex/ and expression patterns, print/printf,
  // if/else, next/exit, assignments (= += -= *= /= %=), ++/--, arithmetic,
  // comparisons, ~ !~, && || !, ?:, string concatenation, $0..$NF, NR NF FS
  // OFS ORS, -F/-v/-f, and length/substr/index/toupper/tolower/int/sqrt/sprintf.
  function awkLex(src) {
    var toks = [], i = 0, n = src.length, prev = null;
    function push(t) { toks.push(t); prev = t; }
    while (i < n) {
      var c = src[i];
      if (c === '\\' && src[i + 1] === '\n') { i += 2; continue; }
      if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
      if (c === '\n' || c === ';') { push({ t: 'nl' }); i++; continue; }
      if (c === '#') { while (i < n && src[i] !== '\n') i++; continue; }
      if (c === '"') {
        var s = '', j = i + 1;
        while (j < n && src[j] !== '"') {
          if (src[j] === '\\' && j + 1 < n) {
            var e2 = src[j + 1];
            s += e2 === 'n' ? '\n' : e2 === 't' ? '\t' : e2;
            j += 2;
          } else { s += src[j]; j++; }
        }
        if (j >= n) throw { message: 'awk: unterminated string' };
        push({ t: 'str', v: s });
        i = j + 1;
        continue;
      }
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
        var m3 = /^[0-9]*\.?[0-9]+(?:[eE][+-]?[0-9]+)?/.exec(src.slice(i));
        push({ t: 'num', v: parseFloat(m3[0]) });
        i += m3[0].length;
        continue;
      }
      if (/[A-Za-z_]/.test(c)) {
        var m4 = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
        push({ t: 'ident', v: m4[0] });
        i += m4[0].length;
        continue;
      }
      if (c === '/') {
        var pv = prev && prev.t === 'op' ? prev.v : null;
        var operandBefore = prev && (prev.t === 'num' || prev.t === 'str' || prev.t === 'ident' ||
          pv === ')' || pv === '++' || pv === '--');
        if (!operandBefore) {
          var j4 = i + 1, re4 = '';
          while (j4 < n && src[j4] !== '/' && src[j4] !== '\n') {
            if (src[j4] === '\\') { re4 += src[j4] + (src[j4 + 1] || ''); j4 += 2; }
            else { re4 += src[j4]; j4++; }
          }
          if (src[j4] !== '/') throw { message: 'awk: unterminated regex' };
          push({ t: 'regex', v: re4 });
          i = j4 + 1;
          continue;
        }
      }
      var two = src.slice(i, i + 2);
      if (['&&', '||', '==', '!=', '<=', '>=', '++', '--', '+=', '-=', '*=', '/=', '%=', '!~'].indexOf(two) >= 0) {
        push({ t: 'op', v: two });
        i += 2;
        continue;
      }
      if ('{}(),$<>=+-*/%!~?:'.indexOf(c) >= 0) { push({ t: 'op', v: c }); i++; continue; }
      throw { message: "awk: unexpected character '" + c + "'" };
    }
    return toks;
  }

  function awkParse(src) {
    var toks = awkLex(src), pos = 0;
    function peek() { return toks[pos]; }
    function isOp(v) { var t = toks[pos]; return t && t.t === 'op' && t.v === v; }
    function expectOp(v) { if (!isOp(v)) throw { message: "awk: expected '" + v + "'" }; pos++; }
    function eatNl() { while (toks[pos] && toks[pos].t === 'nl') pos++; }

    function parsePrimary() {
      var t = peek();
      if (!t) throw { message: 'awk: unexpected end of program' };
      if (t.t === 'num') { pos++; return { k: 'num', v: t.v }; }
      if (t.t === 'str') { pos++; return { k: 'str', v: t.v }; }
      if (t.t === 'regex') { pos++; return { k: 'regex', v: t.v }; }
      if (t.t === 'op' && t.v === '(') { pos++; var e = parseExpr(); expectOp(')'); return e; }
      if (t.t === 'op' && t.v === '$') { pos++; return { k: 'field', e: parsePrimary() }; }
      if (t.t === 'ident') {
        pos++;
        if (isOp('(')) {
          pos++;
          var args = [];
          if (!isOp(')')) {
            args.push(parseExpr());
            while (isOp(',')) { pos++; args.push(parseExpr()); }
          }
          expectOp(')');
          return { k: 'call', name: t.v, args: args };
        }
        if (isOp('++') || isOp('--')) { var o = toks[pos++].v; return { k: 'post', op: o, name: t.v }; }
        return { k: 'var', name: t.v };
      }
      throw { message: 'awk: syntax error' };
    }
    function parseUnary() {
      if (isOp('!')) { pos++; return { k: 'not', e: parseUnary() }; }
      if (isOp('-')) { pos++; return { k: 'neg', e: parseUnary() }; }
      if (isOp('+')) { pos++; return parseUnary(); }
      if (isOp('++') || isOp('--')) {
        var o = toks[pos++].v;
        var t2 = toks[pos++];
        if (!t2 || t2.t !== 'ident') throw { message: 'awk: syntax error' };
        return { k: 'pre', op: o, name: t2.v };
      }
      return parsePrimary();
    }
    function parseMul() {
      var e = parseUnary();
      while (isOp('*') || isOp('/') || isOp('%')) {
        var o = toks[pos++].v;
        e = { k: 'bin', op: o, a: e, b: parseUnary() };
      }
      return e;
    }
    function parseAdd() {
      var e = parseMul();
      while (isOp('+') || isOp('-')) {
        var o = toks[pos++].v;
        e = { k: 'bin', op: o, a: e, b: parseMul() };
      }
      return e;
    }
    function parseConcat() {
      var e = parseAdd();
      for (;;) {
        var t = peek();
        if (t && (t.t === 'num' || t.t === 'str' || t.t === 'ident' ||
            (t.t === 'op' && (t.v === '$' || t.v === '(')))) {
          e = { k: 'concat', a: e, b: parseAdd() };
          continue;
        }
        break;
      }
      return e;
    }
    function parseRel() {
      var e = parseConcat();
      var t = peek();
      if (t && t.t === 'op' && ['==', '!=', '<', '<=', '>', '>='].indexOf(t.v) >= 0) {
        pos++;
        return { k: 'rel', op: t.v, a: e, b: parseConcat() };
      }
      return e;
    }
    function parseMatch() {
      var e = parseRel();
      while (isOp('~') || isOp('!~')) {
        var o = toks[pos++].v;
        e = { k: 'match', op: o, a: e, b: parseRel() };
      }
      return e;
    }
    function parseAnd() {
      var e = parseMatch();
      while (isOp('&&')) { pos++; e = { k: 'and', a: e, b: parseMatch() }; }
      return e;
    }
    function parseOr() {
      var e = parseAnd();
      while (isOp('||')) { pos++; e = { k: 'or', a: e, b: parseAnd() }; }
      return e;
    }
    function parseTernary() {
      var e = parseOr();
      if (isOp('?')) {
        pos++;
        var a = parseTernary();
        expectOp(':');
        return { k: 'tern', cond: e, a: a, b: parseTernary() };
      }
      return e;
    }
    function parseExpr() {
      var t = toks[pos], t2 = toks[pos + 1];
      if (t && t.t === 'ident' && t2 && t2.t === 'op' && ['=', '+=', '-=', '*=', '/=', '%='].indexOf(t2.v) >= 0) {
        pos += 2;
        return { k: 'assign', name: t.v, op: t2.v, e: parseExpr() };
      }
      return parseTernary();
    }

    function parseStmt() {
      var t = peek();
      if (!t) throw { message: 'awk: unexpected end of program' };
      if (t.t === 'op' && t.v === '{') return parseBlock();
      if (t.t === 'ident') {
        if (t.v === 'print' || t.v === 'printf') {
          pos++;
          var args = [];
          if (peek() && peek().t !== 'nl' && !isOp('}')) {
            args.push(parseExpr());
            while (isOp(',')) { pos++; args.push(parseExpr()); }
          }
          return { k: t.v, args: args };
        }
        if (t.v === 'if') {
          pos++;
          expectOp('(');
          var c3 = parseExpr();
          expectOp(')');
          eatNl();
          var thenS = parseStmt();
          var elseS = null;
          var save2 = pos;
          eatNl();
          if (peek() && peek().t === 'ident' && peek().v === 'else') { pos++; eatNl(); elseS = parseStmt(); }
          else pos = save2;
          return { k: 'if', cond: c3, then: thenS, els: elseS };
        }
        if (t.v === 'next') { pos++; return { k: 'next' }; }
        if (t.v === 'exit') { pos++; return { k: 'exit' }; }
        if (t.v === 'for' || t.v === 'while' || t.v === 'do' || t.v === 'getline' || t.v === 'function' || t.v === 'delete') {
          throw { message: "awk: '" + t.v + "' is not supported by this emulator" };
        }
      }
      return { k: 'expr', e: parseExpr() };
    }
    function parseBlock() {
      expectOp('{');
      var stmts = [];
      for (;;) {
        eatNl();
        if (isOp('}')) { pos++; break; }
        if (!peek()) throw { message: "awk: expected '}'" };
        stmts.push(parseStmt());
      }
      return { k: 'block', stmts: stmts };
    }

    var rules = [];
    for (;;) {
      eatNl();
      if (!peek()) break;
      var t3 = peek();
      if (t3.t === 'ident' && (t3.v === 'BEGIN' || t3.v === 'END')) {
        pos++;
        eatNl();
        rules.push({ kind: t3.v, action: parseBlock() });
        continue;
      }
      if (isOp('{')) {
        rules.push({ kind: 'main', pattern: null, action: parseBlock() });
        continue;
      }
      var pat = parseExpr();
      if (isOp('{')) rules.push({ kind: 'main', pattern: pat, action: parseBlock() });
      else rules.push({ kind: 'main', pattern: pat, action: null });
    }
    return rules;
  }

  function awkRun(rules, input, ctx, initVars, fsInit) {
    var vars = { FS: fsInit || ' ', OFS: ' ', ORS: '\n', NR: 0, NF: 0 };
    for (var k in initVars) vars[k] = initVars[k];
    var fields = [''];
    var exited = false, nexted = false;
    function looksNum(v) {
      return typeof v === 'number' || (v !== '' && /^\s*-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?\s*$/.test(v));
    }
    function num(v) { var n2 = parseFloat(v); return isNaN(n2) ? 0 : n2; }
    function truthy(v) { return typeof v === 'number' ? v !== 0 : v !== ''; }
    function toStr(v) {
      if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(parseFloat(v.toFixed(6)));
      return String(v);
    }
    function getField(i2) { return fields[i2] !== undefined ? fields[i2] : ''; }
    function splitLine(line) {
      fields = [line];
      var fsv = String(vars.FS);
      var parts;
      if (fsv === ' ') parts = line.trim() === '' ? [] : line.trim().split(/[ \t]+/);
      else if (fsv.length === 1) parts = line.split(fsv);
      else {
        try { parts = line.split(new RegExp(fsv)); } catch (e) { parts = line.split(fsv); }
      }
      for (var f2 = 0; f2 < parts.length; f2++) fields[f2 + 1] = parts[f2];
      fields.length = parts.length + 1;
      vars.NF = parts.length;
    }
    function reTest(pat, s4) {
      try { return new RegExp(pat).test(s4); } catch (er) { return false; }
    }
    function compare(a, b, op) {
      if (looksNum(a) && looksNum(b)) { a = num(a); b = num(b); }
      else { a = toStr(a); b = toStr(b); }
      switch (op) {
        case '==': return a === b;
        case '!=': return a !== b;
        case '<': return a < b;
        case '<=': return a <= b;
        case '>': return a > b;
        case '>=': return a >= b;
      }
      return false;
    }
    function awkSprintf(a) {
      var fmt = toStr(a.length ? a[0] : ''), ai = 1;
      return fmt.replace(/%[-+ 0-9.]*[sdifxXoc%]/g, function(spec) {
        if (spec === '%%') return '%';
        var v3 = ai < a.length ? a[ai++] : '';
        var kind = spec.charAt(spec.length - 1);
        if (kind === 's') return toStr(v3);
        if (kind === 'c') return toStr(v3).charAt(0) || String.fromCharCode(num(v3));
        if (kind === 'f') {
          var pm = /\.(\d+)/.exec(spec);
          return num(v3).toFixed(pm ? +pm[1] : 6);
        }
        if (kind === 'x') return Math.trunc(num(v3)).toString(16);
        if (kind === 'X') return Math.trunc(num(v3)).toString(16).toUpperCase();
        if (kind === 'o') return Math.trunc(num(v3)).toString(8);
        return String(Math.trunc(num(v3)));
      });
    }
    function callFn(name, a) {
      switch (name) {
        case 'length': return a.length ? toStr(a[0]).length : getField(0).length;
        case 'substr': {
          var st = Math.max(0, Math.trunc(num(a[1])) - 1);
          return a.length > 2 ? toStr(a[0]).slice(st, st + Math.trunc(num(a[2]))) : toStr(a[0]).slice(st);
        }
        case 'index': return toStr(a[0]).indexOf(toStr(a[1])) + 1;
        case 'toupper': return toStr(a[0]).toUpperCase();
        case 'tolower': return toStr(a[0]).toLowerCase();
        case 'int': return Math.trunc(num(a[0]));
        case 'sqrt': return Math.sqrt(num(a[0]));
        case 'sprintf': return awkSprintf(a);
      }
      throw { message: 'awk: calling undefined function ' + name };
    }
    function evalE(e) {
      switch (e.k) {
        case 'num': return e.v;
        case 'str': return e.v;
        case 'regex': return reTest(e.v, getField(0)) ? 1 : 0;
        case 'var': return vars[e.name] !== undefined ? vars[e.name] : '';
        case 'field': return getField(Math.trunc(num(evalE(e.e))));
        case 'assign': {
          var cur = vars[e.name] !== undefined ? vars[e.name] : '';
          var v2 = evalE(e.e);
          if (e.op === '=') vars[e.name] = v2;
          else if (e.op === '+=') vars[e.name] = num(cur) + num(v2);
          else if (e.op === '-=') vars[e.name] = num(cur) - num(v2);
          else if (e.op === '*=') vars[e.name] = num(cur) * num(v2);
          else if (e.op === '/=') vars[e.name] = num(cur) / num(v2);
          else if (e.op === '%=') vars[e.name] = num(cur) % num(v2);
          return vars[e.name];
        }
        case 'post': {
          var old = num(vars[e.name]);
          vars[e.name] = old + (e.op === '++' ? 1 : -1);
          return old;
        }
        case 'pre': {
          var nv = num(vars[e.name]) + (e.op === '++' ? 1 : -1);
          vars[e.name] = nv;
          return nv;
        }
        case 'not': return truthy(evalE(e.e)) ? 0 : 1;
        case 'neg': return -num(evalE(e.e));
        case 'bin': {
          var a2 = num(evalE(e.a)), b2 = num(evalE(e.b));
          if (e.op === '+') return a2 + b2;
          if (e.op === '-') return a2 - b2;
          if (e.op === '*') return a2 * b2;
          if (e.op === '/') return b2 === 0 ? 0 : a2 / b2;
          return b2 === 0 ? 0 : a2 % b2;
        }
        case 'concat': return toStr(evalE(e.a)) + toStr(evalE(e.b));
        case 'rel': return compare(evalE(e.a), evalE(e.b), e.op) ? 1 : 0;
        case 'match': {
          var s3 = toStr(evalE(e.a));
          var p3 = e.b.k === 'regex' ? e.b.v : toStr(evalE(e.b));
          var hit = reTest(p3, s3);
          return (e.op === '~' ? hit : !hit) ? 1 : 0;
        }
        case 'and': return truthy(evalE(e.a)) && truthy(evalE(e.b)) ? 1 : 0;
        case 'or': return truthy(evalE(e.a)) || truthy(evalE(e.b)) ? 1 : 0;
        case 'tern': return truthy(evalE(e.cond)) ? evalE(e.a) : evalE(e.b);
        case 'call': return callFn(e.name, e.args.map(evalE));
      }
      return '';
    }
    function execS(st) {
      if (!st || exited || nexted) return;
      switch (st.k) {
        case 'block':
          for (var s5 = 0; s5 < st.stmts.length; s5++) {
            execS(st.stmts[s5]);
            if (exited || nexted) return;
          }
          return;
        case 'print': {
          var out2 = st.args.length
            ? st.args.map(function(a3) { return toStr(evalE(a3)); }).join(toStr(vars.OFS))
            : getField(0);
          ctx.out(out2 + toStr(vars.ORS));
          return;
        }
        case 'printf': ctx.out(awkSprintf(st.args.map(evalE))); return;
        case 'if': if (truthy(evalE(st.cond))) execS(st.then); else execS(st.els); return;
        case 'next': nexted = true; return;
        case 'exit': exited = true; return;
        case 'expr': evalE(st.e); return;
      }
    }
    rules.forEach(function(r5) { if (r5.kind === 'BEGIN' && !exited) execS(r5.action); });
    if (!exited) {
      var lines5 = toLines(input);
      for (var li5 = 0; li5 < lines5.length && !exited; li5++) {
        vars.NR = li5 + 1;
        splitLine(lines5[li5]);
        nexted = false;
        for (var r6 = 0; r6 < rules.length && !exited && !nexted; r6++) {
          if (rules[r6].kind !== 'main') continue;
          if (rules[r6].pattern && !truthy(evalE(rules[r6].pattern))) continue;
          if (rules[r6].action) execS(rules[r6].action);
          else ctx.println(getField(0));
        }
      }
    }
    exited = false;
    nexted = false;
    rules.forEach(function(r7) { if (r7.kind === 'END' && !exited) execS(r7.action); });
    return 0;
  }

  defineApplets({
    awk: function(ctx) {
      var fsOpt = null, assigns = {}, progSrc = null, files = [];
      for (var i = 0; i < ctx.args.length; i++) {
        var a = ctx.args[i];
        if (progSrc === null && a === '-F') fsOpt = ctx.args[++i];
        else if (progSrc === null && a.length > 2 && a.slice(0, 2) === '-F') fsOpt = a.slice(2);
        else if (progSrc === null && a === '-v') {
          var kv = ctx.args[++i] || '';
          var eq2 = kv.indexOf('=');
          if (eq2 > 0) assigns[kv.slice(0, eq2)] = kv.slice(eq2 + 1);
        } else if (progSrc === null && a === '-f') {
          var pf = readFile(normPath(ctx.args[++i] || ''));
          if (pf.error) { ctx.error((ctx.args[i] || '') + ': ' + pf.error); return 2; }
          progSrc = pf.content;
        } else if (progSrc === null) progSrc = a;
        else files.push(a);
      }
      if (progSrc === null) { ctx.err('usage: awk [-F SEP] [-v VAR=VAL] PROGRAM [FILE]...'); return 2; }
      var rules;
      try { rules = awkParse(progSrc); }
      catch (e) { ctx.err(e && e.message ? e.message : 'awk: syntax error'); return 2; }
      var g = gatherInput(ctx, files);
      try { awkRun(rules, g.text, ctx, assigns, fsOpt); }
      catch (e2) { ctx.err(e2 && e2.message ? e2.message : 'awk: runtime error'); return 2; }
      return g.code;
    },
    chown: function(ctx) {
      var p = parseFlags(ctx.args, 'Rv');
      if (p.operands.length < 2) { ctx.error('missing operand'); return 1; }
      var spec = p.operands[0].split(/[:.]/);
      var user = spec[0], group = spec[1];
      var code = 0;
      for (var i = 1; i < p.operands.length; i++) {
        var path = normPath(p.operands[i]);
        var e = fs[path];
        if (!e) { ctx.error(p.operands[i] + ': No such file or directory'); code = 1; continue; }
        // only root may give files away; guest may only "chown" own files to guest
        if (e.owner !== 'guest' || (user && user !== 'guest') || (group && group !== 'guest')) {
          ctx.error("changing ownership of '" + p.operands[i] + "': Operation not permitted");
          code = 1;
          continue;
        }
        if (user) e.owner = user;
        if (group) e.group = group;
        markDirty(path);
        persistFS();
      }
      return code;
    },
    chgrp: function(ctx) {
      var p = parseFlags(ctx.args, 'Rv');
      if (p.operands.length < 2) { ctx.error('missing operand'); return 1; }
      var group = p.operands[0];
      var code = 0;
      for (var i = 1; i < p.operands.length; i++) {
        var path = normPath(p.operands[i]);
        var e = fs[path];
        if (!e) { ctx.error(p.operands[i] + ': No such file or directory'); code = 1; continue; }
        // guest belongs only to group 'guest'
        if (e.owner !== 'guest' || group !== 'guest') {
          ctx.error("changing group of '" + p.operands[i] + "': Operation not permitted");
          code = 1;
          continue;
        }
        e.group = group;
        markDirty(path);
        persistFS();
      }
      return code;
    }
  });

  function evalTest(a) {
    if (!a.length) return false;
    if (a[0] === '!') return !evalTest(a.slice(1));
    if (a.length === 1) return a[0] !== '';
    if (a.length === 2) {
      var path = normPath(a[1]);
      var e = fs[path];
      switch (a[0]) {
        case '-e': return !!e;
        case '-f': return !!e && e.type === 'file';
        case '-d': return !!e && e.type === 'dir';
        case '-s': return !!e && e.type === 'file' && (e.content || '').length > 0;
        case '-r': return !!e && canRead(path);
        case '-w': return !!e && canWritePath(path);
        case '-x': return !!e && (e.type === 'dir' || !!e.executable);
        case '-z': return a[1] === '';
        case '-n': return a[1] !== '';
        default: return false;
      }
    }
    if (a.length === 3) {
      var x = a[0], op = a[1], y = a[2];
      switch (op) {
        case '=': case '==': return x === y;
        case '!=': return x !== y;
        case '-eq': return parseInt(x, 10) === parseInt(y, 10);
        case '-ne': return parseInt(x, 10) !== parseInt(y, 10);
        case '-gt': return parseInt(x, 10) > parseInt(y, 10);
        case '-ge': return parseInt(x, 10) >= parseInt(y, 10);
        case '-lt': return parseInt(x, 10) < parseInt(y, 10);
        case '-le': return parseInt(x, 10) <= parseInt(y, 10);
        default: return false;
      }
    }
    return false;
  }

