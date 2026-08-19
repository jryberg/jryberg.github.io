  // ── Applets: text processing ─────────────────────────────────────────────
  function gatherInput(ctx, operands) {
    var files = operands && operands.length ? operands : ['-'];
    var text = '', code = 0;
    for (var i = 0; i < files.length; i++) {
      if (files[i] === '-') { text += ctx.stdin; continue; }
      var r = readFile(normPath(files[i]));
      if (r.error) { ctx.error(files[i] + ': ' + r.error); code = 1; continue; }
      text += r.content;
    }
    return { text: text, code: code };
  }
  function toLines(text) {
    var l = String(text).split('\n');
    if (l.length && l[l.length - 1] === '') l.pop();
    return l;
  }
  function unescapeC(s) {
    return s.replace(/\\([nrtvfab\\e0])/g, function(_, c) {
      return { n: '\n', r: '\r', t: '\t', v: '\v', f: '\f', a: '\x07', b: '\b', e: '\x1b', '0': '\0', '\\': '\\' }[c];
    });
  }

  defineApplets({
    echo: function(ctx) {
      var i = 0, nl = true, esc = false;
      while (i < ctx.args.length && /^-[neE]+$/.test(ctx.args[i])) {
        if (ctx.args[i].indexOf('n') >= 0) nl = false;
        if (ctx.args[i].indexOf('e') >= 0) esc = true;
        if (ctx.args[i].indexOf('E') >= 0) esc = false;
        i++;
      }
      var s = ctx.args.slice(i).join(' ');
      if (esc) s = unescapeC(s);
      ctx.out(s + (nl ? '\n' : ''));
      return 0;
    },
    printf: function(ctx) {
      if (!ctx.args.length) { ctx.error('usage: printf FORMAT [ARG]...'); return 1; }
      var fmt = unescapeC(ctx.args[0]);
      var args = ctx.args.slice(1), ai = 0;
      var out = fmt.replace(/%[-0-9.]*[sdixXoc%]/g, function(spec) {
        if (spec === '%%') return '%';
        var a = ai < args.length ? args[ai++] : '';
        var kind = spec.charAt(spec.length - 1);
        if (kind === 's' || kind === 'c') return kind === 'c' ? String(a).charAt(0) : String(a);
        var n = parseInt(a, 10) || 0;
        if (kind === 'x') return n.toString(16);
        if (kind === 'X') return n.toString(16).toUpperCase();
        if (kind === 'o') return n.toString(8);
        return String(n);
      });
      ctx.out(out);
      return 0;
    },
    grep: function(ctx) {
      var flags = {}, pattern = null, files = [];
      for (var i = 0; i < ctx.args.length; i++) {
        var a = ctx.args[i];
        if (a.charAt(0) === '-' && a.length > 1 && pattern === null && a !== '-') {
          for (var j = 1; j < a.length; j++) flags[a.charAt(j)] = true;
        } else if (pattern === null) pattern = a;
        else files.push(a);
      }
      if (pattern === null) { ctx.err('grep: missing pattern'); return 2; }
      var re;
      try { re = new RegExp(flags.F ? pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : pattern, flags.i ? 'i' : ''); }
      catch (e) { ctx.err('grep: bad regex'); return 2; }
      var srcs = files.length ? files : ['-'];
      var matched = 0, code = 0;
      for (var s = 0; s < srcs.length; s++) {
        var text, label = srcs[s];
        if (srcs[s] === '-') text = ctx.stdin;
        else {
          var r = readFile(normPath(srcs[s]));
          if (r.error) { ctx.err('grep: ' + srcs[s] + ': ' + r.error); code = 2; continue; }
          text = r.content;
        }
        var lines = toLines(text), count = 0;
        for (var ln = 0; ln < lines.length; ln++) {
          var hit = re.test(lines[ln]);
          if (hit !== !!flags.v) {
            matched++; count++;
            if (flags.q) return 0;
            if (!flags.c && !flags.l) {
              var outLine = lines[ln];
              if (ctx.tty && !flags.v) outLine = outLine.replace(new RegExp(re.source, re.flags + 'g'), function(m0) { return m0 ? '\x1b[1;31m' + m0 + '\x1b[0m' : m0; });
              ctx.println((srcs.length > 1 ? label + ':' : '') + (flags.n ? (ln + 1) + ':' : '') + outLine);
            }
          }
        }
        if (flags.c) ctx.println((srcs.length > 1 ? label + ':' : '') + count);
        if (flags.l && count) ctx.println(label);
      }
      if (code) return code;
      return matched ? 0 : 1;
    },
    sed: function(ctx) {
      var quiet = false, scripts = [], files = [];
      for (var i = 0; i < ctx.args.length; i++) {
        var a = ctx.args[i];
        if (a === '-n') quiet = true;
        else if (a === '-e') scripts.push(ctx.args[++i]);
        else if (a.charAt(0) === '-' && a.length > 1) { ctx.error('unsupported option ' + a); return 1; }
        else if (!scripts.length) scripts.push(a);
        else files.push(a);
      }
      if (!scripts.length) { ctx.error('missing script'); return 1; }
      var cmds = [];
      for (var s = 0; s < scripts.length; s++) {
        var sc = scripts[s];
        var m = /^(\d+)?s(.)((?:\\.|[^\\])*?)\2((?:\\.|[^\\])*?)\2([gip]*)$/.exec(sc);
        if (m) {
          var reFlags = (m[5].indexOf('g') >= 0 ? 'g' : '') + (m[5].indexOf('i') >= 0 ? 'i' : '');
          var re2;
          try { re2 = new RegExp(m[3], reFlags); } catch (e) { ctx.error('bad regex in substitution'); return 1; }
          cmds.push({ kind: 's', addr: m[1] ? parseInt(m[1], 10) : null, re: re2, repl: m[4].replace(/\$/g, '$$$$').replace(/&/g, '$$&').replace(/\\(\d)/g, '$$$1'), print: m[5].indexOf('p') >= 0 });
          continue;
        }
        m = /^(\d+|\$)?d$/.exec(sc);
        if (m) { cmds.push({ kind: 'd', addr: m[1] || null }); continue; }
        m = /^(\d+|\$)?p$/.exec(sc);
        if (m) { cmds.push({ kind: 'p', addr: m[1] || null }); continue; }
        m = /^(\d+)q$/.exec(sc);
        if (m) { cmds.push({ kind: 'q', addr: parseInt(m[1], 10) }); continue; }
        ctx.error('unsupported sed command: ' + sc);
        return 1;
      }
      var g = gatherInput(ctx, files);
      var lines = toLines(g.text);
      for (var ln = 0; ln < lines.length; ln++) {
        var line = lines[ln], deleted = false, extraPrint = false;
        for (var c = 0; c < cmds.length; c++) {
          var cmd = cmds[c];
          var addrHit = cmd.addr === null || cmd.addr === undefined ? true :
            (cmd.addr === '$' ? ln === lines.length - 1 : ln + 1 === Number(cmd.addr));
          if (!addrHit) continue;
          if (cmd.kind === 'd') { deleted = true; break; }
          if (cmd.kind === 'p') extraPrint = true;
          if (cmd.kind === 's') {
            var before = line;
            line = line.replace(cmd.re, cmd.repl);
            if (cmd.print && line !== before) extraPrint = true;
          }
          if (cmd.kind === 'q' && ln + 1 >= cmd.addr) { if (!quiet && !deleted) ctx.println(line); return g.code; }
        }
        if (deleted) continue;
        if (!quiet) ctx.println(line);
        if (extraPrint) ctx.println(line);
      }
      return g.code;
    },
    head: function(ctx) {
      var n = 10, bytes = null, files = [];
      for (var i = 0; i < ctx.args.length; i++) {
        var a = ctx.args[i];
        if (a === '-n') n = parseInt(ctx.args[++i], 10);
        else if (/^-n\d+$/.test(a)) n = parseInt(a.slice(2), 10);
        else if (/^-\d+$/.test(a)) n = parseInt(a.slice(1), 10);
        else if (a === '-c') bytes = parseInt(ctx.args[++i], 10);
        else files.push(a);
      }
      var g = gatherInput(ctx, files);
      if (bytes !== null) ctx.out(g.text.slice(0, bytes));
      else {
        var lines = toLines(g.text).slice(0, n);
        if (lines.length) ctx.out(lines.join('\n') + '\n');
      }
      return g.code;
    },
    tail: function(ctx) {
      var n = 10, files = [];
      for (var i = 0; i < ctx.args.length; i++) {
        var a = ctx.args[i];
        if (a === '-n') n = parseInt(String(ctx.args[++i]).replace('+', ''), 10);
        else if (/^-n\d+$/.test(a)) n = parseInt(a.slice(2), 10);
        else if (/^-\d+$/.test(a)) n = parseInt(a.slice(1), 10);
        else if (a === '-f') { /* no live follow in a buffer */ }
        else files.push(a);
      }
      var g = gatherInput(ctx, files);
      var lines = toLines(g.text).slice(-n);
      if (lines.length) ctx.out(lines.join('\n') + '\n');
      return g.code;
    },
    wc: function(ctx) {
      var p = parseFlags(ctx.args, 'lwc');
      var showAll = !p.flags.l && !p.flags.w && !p.flags.c;
      var files = p.operands.length ? p.operands : ['-'];
      var tot = { l: 0, w: 0, c: 0 }, code = 0;
      function report(t, label) {
        var l = toLines(t).length;
        var w = (t.match(/\S+/g) || []).length;
        var c = t.length;
        tot.l += l; tot.w += w; tot.c += c;
        var cols = [];
        if (showAll || p.flags.l) cols.push(String(l).padStart(7));
        if (showAll || p.flags.w) cols.push(String(w).padStart(7));
        if (showAll || p.flags.c) cols.push(String(c).padStart(7));
        ctx.println(cols.join('') + (label ? ' ' + label : ''));
      }
      for (var i = 0; i < files.length; i++) {
        if (files[i] === '-') { report(ctx.stdin, files.length > 1 ? '-' : ''); continue; }
        var r = readFile(normPath(files[i]));
        if (r.error) { ctx.error(files[i] + ': ' + r.error); code = 1; continue; }
        report(r.content, files[i]);
      }
      if (files.length > 1) {
        var cols = [];
        if (showAll || p.flags.l) cols.push(String(tot.l).padStart(7));
        if (showAll || p.flags.w) cols.push(String(tot.w).padStart(7));
        if (showAll || p.flags.c) cols.push(String(tot.c).padStart(7));
        ctx.println(cols.join('') + ' total');
      }
      return code;
    },
    sort: function(ctx) {
      var p = parseFlags(ctx.args, 'rnu');
      var g = gatherInput(ctx, p.operands);
      var lines = toLines(g.text);
      lines.sort(p.flags.n
        ? function(a, b) { return (parseFloat(a) || 0) - (parseFloat(b) || 0); }
        : function(a, b) { return a < b ? -1 : a > b ? 1 : 0; });
      if (p.flags.r) lines.reverse();
      if (p.flags.u) lines = lines.filter(function(l, i) { return i === 0 || l !== lines[i - 1]; });
      if (lines.length) ctx.out(lines.join('\n') + '\n');
      return g.code;
    },
    uniq: function(ctx) {
      var p = parseFlags(ctx.args, 'cdi');
      var g = gatherInput(ctx, p.operands);
      var lines = toLines(g.text);
      var groups = [];
      for (var i = 0; i < lines.length; i++) {
        var prev = groups[groups.length - 1];
        var same = prev && (p.flags.i ? prev.line.toLowerCase() === lines[i].toLowerCase() : prev.line === lines[i]);
        if (same) prev.n++;
        else groups.push({ line: lines[i], n: 1 });
      }
      groups.forEach(function(gr) {
        if (p.flags.d && gr.n < 2) return;
        ctx.println(p.flags.c ? String(gr.n).padStart(7) + ' ' + gr.line : gr.line);
      });
      return g.code;
    },
    cut: function(ctx) {
      var delim = '\t', fields = null, chars = null, files = [];
      for (var i = 0; i < ctx.args.length; i++) {
        var a = ctx.args[i];
        if (a === '-d') delim = ctx.args[++i] || '\t';
        else if (a.slice(0, 2) === '-d') delim = a.slice(2);
        else if (a === '-f') fields = ctx.args[++i];
        else if (a.slice(0, 2) === '-f') fields = a.slice(2);
        else if (a === '-c') chars = ctx.args[++i];
        else if (a.slice(0, 2) === '-c') chars = a.slice(2);
        else files.push(a);
      }
      if (!fields && !chars) { ctx.error('expected -f or -c'); return 1; }
      function parseList(spec, max) {
        var keep = {};
        spec.split(',').forEach(function(part) {
          var m = /^(\d*)-(\d*)$/.exec(part);
          if (m) {
            var lo = m[1] ? parseInt(m[1], 10) : 1;
            var hi = m[2] ? parseInt(m[2], 10) : max;
            for (var k = lo; k <= Math.min(hi, max); k++) keep[k] = true;
          } else if (/^\d+$/.test(part)) keep[parseInt(part, 10)] = true;
        });
        return keep;
      }
      var g = gatherInput(ctx, files);
      toLines(g.text).forEach(function(line) {
        if (chars) {
          var keepC = parseList(chars, line.length);
          var outC = '';
          for (var c = 1; c <= line.length; c++) if (keepC[c]) outC += line.charAt(c - 1);
          ctx.println(outC);
        } else {
          if (line.indexOf(delim) < 0) { ctx.println(line); return; }
          var parts = line.split(delim);
          var keepF = parseList(fields, parts.length);
          ctx.println(parts.filter(function(_, ix) { return keepF[ix + 1]; }).join(delim));
        }
      });
      return g.code;
    },
    tr: function(ctx) {
      var del = false, sets = [];
      for (var i = 0; i < ctx.args.length; i++) {
        if (ctx.args[i] === '-d') del = true;
        else if (ctx.args[i] === '-s') { /* squeeze unsupported, treated as copy */ }
        else sets.push(ctx.args[i]);
      }
      function expandSet(s) {
        s = unescapeC(s)
          .replace(/\[:upper:\]/g, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
          .replace(/\[:lower:\]/g, 'abcdefghijklmnopqrstuvwxyz')
          .replace(/\[:digit:\]/g, '0123456789')
          .replace(/\[:space:\]/g, ' \t\n');
        var out = '';
        for (var k = 0; k < s.length; k++) {
          if (s[k + 1] === '-' && s[k + 2] && s[k + 2] !== '-') {
            for (var c = s.charCodeAt(k); c <= s.charCodeAt(k + 2); c++) out += String.fromCharCode(c);
            k += 2;
          } else out += s[k];
        }
        return out;
      }
      if (!sets.length) { ctx.error('missing operand'); return 1; }
      var s1 = expandSet(sets[0]);
      var s2 = sets[1] !== undefined ? expandSet(sets[1]) : '';
      var out = '';
      for (var j = 0; j < ctx.stdin.length; j++) {
        var ch = ctx.stdin.charAt(j);
        var ix = s1.indexOf(ch);
        if (ix < 0) { out += ch; continue; }
        if (del) continue;
        out += ix < s2.length ? s2.charAt(ix) : (s2 ? s2.charAt(s2.length - 1) : ch);
      }
      ctx.out(out);
      return 0;
    },
    rev: function(ctx) {
      var g = gatherInput(ctx, ctx.args);
      toLines(g.text).forEach(function(l) { ctx.println(l.split('').reverse().join('')); });
      return g.code;
    },
    tac: function(ctx) {
      var g = gatherInput(ctx, ctx.args);
      var lines = toLines(g.text).reverse();
      if (lines.length) ctx.out(lines.join('\n') + '\n');
      return g.code;
    },
    nl: function(ctx) {
      var p = parseFlags(ctx.args, 'b');
      var g = gatherInput(ctx, p.operands.filter(function(o) { return o !== 'a'; }));
      var n = 1;
      toLines(g.text).forEach(function(l) {
        if (l.trim() === '') ctx.println('');
        else ctx.println(String(n++).padStart(6) + '\t' + l);
      });
      return g.code;
    },
    seq: function(ctx) {
      var a = ctx.args.map(Number);
      var first = 1, incr = 1, last;
      if (a.length === 1) last = a[0];
      else if (a.length === 2) { first = a[0]; last = a[1]; }
      else if (a.length === 3) { first = a[0]; incr = a[1]; last = a[2]; }
      else { ctx.error('usage: seq [FIRST [INC]] LAST'); return 1; }
      if (a.some(isNaN) || incr === 0) { ctx.error('invalid number'); return 1; }
      var guard = 0;
      if (incr > 0) for (var v = first; v <= last && guard++ < 100000; v += incr) ctx.println(String(v));
      else for (var w = first; w >= last && guard++ < 100000; w += incr) ctx.println(String(w));
      return 0;
    },
    xargs: function(ctx) {
      var cmd = ctx.args.length ? ctx.args.slice() : ['echo'];
      var tokens = (ctx.stdin.match(/\S+/g) || []);
      var res = runSimple(cmd.concat(tokens), '', { tty: ctx.tty });
      ctx.out(res.stdout);
      if (res.stderr) ctx.err(res.stderr.replace(/\n$/, ''));
      return res.code;
    },
    test: function(ctx) { return evalTest(ctx.args) ? 0 : 1; },
    '[': function(ctx) {
      var a = ctx.args.slice();
      if (a[a.length - 1] !== ']') { ctx.err('sh: [: missing ]'); return 2; }
      a.pop();
      return evalTest(a) ? 0 : 1;
    },
    base64: function(ctx) {
      var p = parseFlags(ctx.args, 'dw');
      var g = gatherInput(ctx, p.operands);
      try {
        if (p.flags.d) ctx.out(decodeURIComponent(escape(atob(g.text.replace(/\s+/g, '')))));
        else {
          var b = btoa(unescape(encodeURIComponent(g.text)));
          for (var i = 0; i < b.length; i += 76) ctx.println(b.slice(i, i + 76));
        }
      } catch (e) { ctx.error('invalid input'); return 1; }
      return g.code;
    },
    more: function(ctx) {
      var g = gatherInput(ctx, ctx.args);
      ctx.out(g.text);
      return g.code;
    },
    less: function(ctx) {
      var g = gatherInput(ctx, ctx.args);
      ctx.out(g.text);
      return g.code;
    },
    strings: function(ctx) {
      var g = gatherInput(ctx, ctx.args);
      (g.text.match(/[\x20-\x7e]{4,}/g) || []).forEach(function(s) { ctx.println(s); });
      return g.code;
    },
    'true': function() { return 0; },
    'false': function() { return 1; }
  });

