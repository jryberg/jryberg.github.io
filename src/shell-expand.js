  // ── Shell: expansion ($VAR, ${VAR}, $?, $(cmd), $((math)), ~, globs) ─────
  function evalArith(expr) {
    var s = expr.replace(/\$?[A-Za-z_][A-Za-z0-9_]*/g, function(nm) {
      var v = parseFloat(env[nm.charAt(0) === '$' ? nm.slice(1) : nm]);
      return isNaN(v) ? '0' : String(v);
    });
    if (!/^[\d+\-*/%()\s.<>=!&|?:]*$/.test(s)) return null;
    try {
      var val = Function('"use strict"; return (' + s + ');')();
      if (typeof val === 'boolean') val = val ? 1 : 0;
      if (typeof val !== 'number' || !isFinite(val)) return null;
      return String(Math.trunc(val));
    } catch (e) { return null; }
  }
  function expandVars(text) {
    var out = '', i = 0, m;
    while (i < text.length) {
      if (text[i] === '`') {
        var bt = text.indexOf('`', i + 1);
        if (bt > 0) {
          out += captureRun(text.slice(i + 1, bt)).replace(/\n+$/, '');
          i = bt + 1;
          continue;
        }
      }
      if (text[i] === '$') {
        if (text[i + 1] === '(') {
          var depth = 0, j2 = i + 1;
          while (j2 < text.length) {
            if (text[j2] === '(') depth++;
            else if (text[j2] === ')') { depth--; if (!depth) { j2++; break; } }
            j2++;
          }
          if (text[i + 2] === '(' && text.slice(j2 - 2, j2) === '))') {
            var av = evalArith(text.slice(i + 3, j2 - 2));
            if (av === null) { termWrite('sh: arithmetic syntax error\n'); av = '0'; }
            out += av;
          } else {
            out += captureRun(text.slice(i + 2, j2 - 1)).replace(/\n+$/, '');
          }
          i = j2;
          continue;
        }
        if (text[i + 1] === '?') { out += String(lastExit); i += 2; continue; }
        if (text[i + 1] === '$') { out += String(shellPid); i += 2; continue; }
        if (text[i + 1] === '{') {
          var j = text.indexOf('}', i);
          if (j > 0) { out += env[text.slice(i + 2, j)] || ''; i = j + 1; continue; }
        }
        m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(i + 1));
        if (m) { out += env[m[0]] !== undefined ? env[m[0]] : ''; i += 1 + m[0].length; continue; }
      }
      out += text[i]; i++;
    }
    return out;
  }
  function globToRegExp(pat) {
    var re = '^';
    for (var i = 0; i < pat.length; i++) {
      var c = pat[i];
      if (c === '*') re += '[^/]*';
      else if (c === '?') re += '[^/]';
      else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
    return new RegExp(re + '$');
  }
  function expandGlobWord(word) {
    var slash = word.lastIndexOf('/');
    var dirPart = slash >= 0 ? word.slice(0, slash + 1) : '';
    var pat = word.slice(slash + 1);
    if (/[*?]/.test(dirPart) || !/[*?]/.test(pat)) return null;
    var dirPath = dirPart ? normPath(dirPart) : cwd;
    var dir = fs[dirPath];
    if (!dir || dir.type !== 'dir' || !canRead(dirPath)) return null;
    var re;
    try { re = globToRegExp(pat); } catch (e) { return null; }
    var out = [];
    var names = dir.children.slice().sort();
    for (var i = 0; i < names.length; i++) {
      if (names[i].charAt(0) === '.' && pat.charAt(0) !== '.') continue;
      if (re.test(names[i])) out.push(dirPart + names[i]);
    }
    return out.length ? out : null;
  }
  function expandWord(word) {
    // Build fields: quoted segments never split; whitespace in the expansion
    // of unquoted segments ($VAR, $(cmd)) splits the word into fields.
    var parts = [''], hadQuoted = false, mayGlob = false;
    for (var i = 0; i < word.length; i++) {
      var s = word[i];
      if (s.quote !== null) {
        hadQuoted = true;
        parts[parts.length - 1] += s.quote === "'" ? s.text : expandVars(s.text);
        continue;
      }
      var t = expandVars(s.text);
      if (i === 0 && (t === '~' || t.slice(0, 2) === '~/')) t = env.HOME + t.slice(1);
      if (/[*?]/.test(t)) mayGlob = true;
      var pieces = t.split(/[ \t\n]+/);
      parts[parts.length - 1] += pieces[0];
      for (var p = 1; p < pieces.length; p++) parts.push(pieces[p]);
    }
    var fields = parts.filter(function(f) { return f !== ''; });
    if (!fields.length) return hadQuoted ? [''] : [];
    var out = [];
    for (var f = 0; f < fields.length; f++) {
      var g = mayGlob && /[*?]/.test(fields[f]) ? expandGlobWord(fields[f]) : null;
      if (g) out = out.concat(g);
      else out.push(fields[f]);
    }
    return out;
  }

