  // ── Shell: parser ────────────────────────────────────────────────────────
  // Recursive descent over the token stream. Produces {stmts:[{op, node}]}
  // where op links the statement to the previous one (';', '&&' or '||') and
  // node is either {type:'pipeline', pipe:[{words,redirs}], bg} or a compound
  // node for if/for/while/until. Keywords count only in command position.
  function parseProgram(toks) {
    var pos = 0;

    function wordLiteral(word) {
      return word.length === 1 && word[0].quote === null ? word[0].text : null;
    }
    function expectWord(s) {
      var save = pos;
      while (toks[pos] && toks[pos].op === ';') pos++;
      var t = toks[pos];
      if (t && t.word && wordLiteral(t.word) === s) { pos++; return true; }
      pos = save;
      return false;
    }

    function parsePipelineNode() {
      var pipe = [];
      var cmd = { words: [], redirs: {} };
      var pendingRedir = null;
      function cmdEmpty() { return !cmd.words.length && !Object.keys(cmd.redirs).length; }
      loop:
      for (;;) {
        var t = toks[pos];
        if (!t) break;
        if (t.word) {
          if (pendingRedir) { cmd.redirs[pendingRedir] = t.word; pendingRedir = null; }
          else cmd.words.push(t.word);
          pos++;
          continue;
        }
        if (pendingRedir) return { error: "syntax error near unexpected token `" + t.op + "'" };
        switch (t.op) {
          case '>': pendingRedir = 'out'; pos++; break;
          case '>>': pendingRedir = 'append'; pos++; break;
          case '<': pendingRedir = 'in'; pos++; break;
          case '2>': pendingRedir = 'err'; pos++; break;
          case '2>>': pendingRedir = 'errAppend'; pos++; break;
          case '2>&1': cmd.redirs.errToOut = true; pos++; break;
          case '|':
            if (cmdEmpty()) return { error: "syntax error near unexpected token `|'" };
            pipe.push(cmd);
            cmd = { words: [], redirs: {} };
            pos++;
            break;
          default: break loop;
        }
      }
      if (pendingRedir) return { error: 'syntax error: expected redirection target' };
      if (!cmdEmpty()) pipe.push(cmd);
      else if (pipe.length) return { error: "syntax error near unexpected token `|'" };
      if (!pipe.length) return { error: "syntax error near unexpected token `" + (toks[pos] ? toks[pos].op : 'newline') + "'" };
      return { type: 'pipeline', pipe: pipe, bg: false };
    }

    function parseIf() {
      pos++;
      var cond = parseList(['then']);
      if (cond.error) return cond;
      if (!expectWord('then')) return { error: "syntax error: expected `then'" };
      var thenL = parseList(['elif', 'else', 'fi']);
      if (thenL.error) return thenL;
      var elifs = [], els = null;
      for (;;) {
        if (expectWord('elif')) {
          var c2 = parseList(['then']);
          if (c2.error) return c2;
          if (!expectWord('then')) return { error: "syntax error: expected `then'" };
          var t2 = parseList(['elif', 'else', 'fi']);
          if (t2.error) return t2;
          elifs.push({ cond: c2.stmts, then: t2.stmts });
          continue;
        }
        if (expectWord('else')) {
          var e2 = parseList(['fi']);
          if (e2.error) return e2;
          els = e2.stmts;
        }
        if (!expectWord('fi')) return { error: "syntax error: expected `fi'" };
        break;
      }
      return { type: 'if', cond: cond.stmts, then: thenL.stmts, elifs: elifs, els: els };
    }

    function parseFor() {
      pos++;
      var vt = toks[pos];
      var vname = vt && vt.word ? wordLiteral(vt.word) : null;
      if (!vname || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(vname)) return { error: 'syntax error: bad for loop variable' };
      pos++;
      var words = [];
      if (expectWord('in')) {
        while (toks[pos] && toks[pos].word) { words.push(toks[pos].word); pos++; }
      }
      if (!expectWord('do')) return { error: "syntax error: expected `do'" };
      var body = parseList(['done']);
      if (body.error) return body;
      if (!expectWord('done')) return { error: "syntax error: expected `done'" };
      return { type: 'for', varName: vname, words: words, body: body.stmts };
    }

    function parseWhileUntil(until) {
      pos++;
      var cond = parseList(['do']);
      if (cond.error) return cond;
      if (!expectWord('do')) return { error: "syntax error: expected `do'" };
      var body = parseList(['done']);
      if (body.error) return body;
      if (!expectWord('done')) return { error: "syntax error: expected `done'" };
      return { type: 'while', until: until, cond: cond.stmts, body: body.stmts };
    }

    function parseCommand() {
      var t = toks[pos];
      var kw = t && t.word ? wordLiteral(t.word) : null;
      if (kw === 'if') return parseIf();
      if (kw === 'for') return parseFor();
      if (kw === 'while') return parseWhileUntil(false);
      if (kw === 'until') return parseWhileUntil(true);
      if (kw && ['then', 'elif', 'else', 'fi', 'do', 'done'].indexOf(kw) >= 0) {
        return { error: "syntax error near unexpected token `" + kw + "'" };
      }
      return parsePipelineNode();
    }

    function parseList(stopWords) {
      var stmts = [], op = ';';
      for (;;) {
        while (toks[pos] && toks[pos].op === ';') pos++;
        var t = toks[pos];
        if (!t) break;
        if (t.word && stopWords && stopWords.indexOf(wordLiteral(t.word)) >= 0) break;
        var node = parseCommand();
        if (node.error) return node;
        stmts.push({ op: op, node: node });
        op = ';';
        var s = toks[pos];
        if (!s) break;
        if (s.op === '&') { node.bg = true; pos++; continue; }
        if (s.op === '&&' || s.op === '||') { op = s.op; pos++; continue; }
        if (s.op === ';') continue;
        if (s.word && stopWords && stopWords.indexOf(wordLiteral(s.word)) >= 0) break;
        return { error: "syntax error near unexpected token `" + (s.op || wordLiteral(s.word) || 'word') + "'" };
      }
      return { stmts: stmts };
    }

    var prog = parseList(null);
    if (prog.error) return prog;
    if (toks[pos]) return { error: "syntax error near unexpected token `" + (toks[pos].op || wordLiteral(toks[pos].word) || 'word') + "'" };
    return prog;
  }

