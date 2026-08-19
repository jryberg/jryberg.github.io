  // ── Shell: tokenizer ─────────────────────────────────────────────────────
  // Tokens are operators ({op:'|'}) or words: lists of {text, quote} segments
  // where quote is null (expandable), "'" (literal) or '"' (vars expand).
  function tokenize(line) {
    var toks = [], i = 0, n = line.length, cur = null;
    function seg(text, quote) {
      if (!cur) cur = { word: [] };
      cur.word.push({ text: text, quote: quote });
    }
    function flush() { if (cur) { toks.push(cur); cur = null; } }
    while (i < n) {
      var c = line[i];
      if (c === ' ' || c === '\t' || c === '\r') { flush(); i++; continue; }
      if (c === '\n') { flush(); toks.push({ op: ';' }); i++; continue; }
      if (c === '#' && !cur) { while (i < n && line[i] !== '\n') i++; continue; }
      if (c === "'") {
        var j = line.indexOf("'", i + 1);
        if (j < 0) return { error: 'syntax error: unterminated quoted string' };
        seg(line.slice(i + 1, j), "'");
        i = j + 1; continue;
      }
      if (c === '"') {
        var buf = '', k = i + 1, closed = false;
        while (k < n) {
          var d = line[k];
          if (d === '\\' && k + 1 < n && '"\\$`'.indexOf(line[k + 1]) >= 0) { buf += line[k + 1]; k += 2; continue; }
          if (d === '"') { closed = true; break; }
          buf += d; k++;
        }
        if (!closed) return { error: 'syntax error: unterminated quoted string' };
        seg(buf, '"');
        i = k + 1; continue;
      }
      if (c === '\\' && i + 1 < n) { seg(line[i + 1], "'"); i += 2; continue; }
      if (c === '&' && line[i + 1] === '&') { flush(); toks.push({ op: '&&' }); i += 2; continue; }
      if (c === '|' && line[i + 1] === '|') { flush(); toks.push({ op: '||' }); i += 2; continue; }
      if (c === '|') { flush(); toks.push({ op: '|' }); i++; continue; }
      if (c === ';') { flush(); toks.push({ op: ';' }); i++; continue; }
      if (c === '&') { flush(); toks.push({ op: '&' }); i++; continue; }
      if (c === '2' && !cur && line[i + 1] === '>') {
        if (line[i + 2] === '>') { toks.push({ op: '2>>' }); i += 3; continue; }
        if (line[i + 2] === '&' && line[i + 3] === '1') { toks.push({ op: '2>&1' }); i += 4; continue; }
        toks.push({ op: '2>' }); i += 2; continue;
      }
      if (c === '>') {
        flush();
        if (line[i + 1] === '>') { toks.push({ op: '>>' }); i += 2; } else { toks.push({ op: '>' }); i++; }
        continue;
      }
      if (c === '<') { flush(); toks.push({ op: '<' }); i++; continue; }
      var run = '';
      while (i < n) {
        var pc = line[i];
        if (pc === '$' && line[i + 1] === '(') {
          // keep $( ... ) — and $(( ... )) — intact inside the word, spaces and all
          var depth = 0, k2 = i + 1;
          while (k2 < n) {
            if (line[k2] === '(') depth++;
            else if (line[k2] === ')') { depth--; if (!depth) { k2++; break; } }
            k2++;
          }
          run += line.slice(i, k2);
          i = k2;
          continue;
        }
        if (pc === '`') {
          var k3 = line.indexOf('`', i + 1);
          k3 = k3 < 0 ? n : k3 + 1;
          run += line.slice(i, k3);
          i = k3;
          continue;
        }
        if (' \t\n\r\'"\\|&;<>'.indexOf(pc) >= 0) break;
        run += pc;
        i++;
      }
      seg(run, null);
    }
    flush();
    return { toks: toks };
  }

