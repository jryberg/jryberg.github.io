  // ── vi (BusyBox-style modal editor; :w persists to browser storage) ─────
  function launchVi(args, cont) {
    var fileArg = null;
    for (var ai = 0; ai < args.length; ai++) {
      if (args[ai].charAt(0) !== '-') { fileArg = args[ai]; break; }
    }
    var path = fileArg ? normPath(fileArg) : null;
    var buf = [''];
    var newFile = true;
    if (path && fs[path]) {
      if (fs[path].type === 'dir') { addLine('vi: ' + fileArg + ': Is a directory'); lastExit = 1; return; }
      var r0 = readFile(path);
      if (r0.error) { addLine('vi: ' + fileArg + ': ' + r0.error); lastExit = 1; return; }
      buf = r0.content.split('\n');
      if (buf.length > 1 && buf[buf.length - 1] === '') buf.pop();
      if (!buf.length) buf = [''];
      newFile = false;
    }

    // Screen metrics (same probe trick as sl)
    var probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font-family:"Cascadia Code","Fira Code","JetBrains Mono",Consolas,Monaco,monospace;font-size:14px;line-height:1.4';
    probe.textContent = 'MMMMMMMMMM';
    document.body.appendChild(probe);
    var cw = probe.offsetWidth / 10 || 8.4;
    var ch = probe.offsetHeight || 20;
    document.body.removeChild(probe);
    var COLS = Math.max(40, Math.floor((window.innerWidth - 16) / cw));
    var ROWS = Math.max(10, Math.floor((window.innerHeight - 16) / ch)) - 1;   // last row = status

    var vOverlay = document.createElement('div');
    vOverlay.id = 'vi-overlay';
    var pre = document.createElement('pre');
    pre.id = 'vi-pre';
    vOverlay.appendChild(pre);
    document.body.appendChild(vOverlay);

    var pid = nextPid++;
    var proc = { pid: pid, command: 'vi' + (args.length ? ' ' + args.join(' ') : ''), startTime: new Date(), status: 'running', windowEl: vOverlay, jobId: null };
    processes[pid] = proc;
    foregroundPid = pid;
    disableTerminalInput();

    var mode = 'normal';       // normal | insert | cmd
    var cy = 0, cx = 0, top = 0;
    var pending = '';          // g, d, y, r, Z prefixes
    var cmdline = '';          // after : or /
    var cmdKind = ':';
    var message = fileArg
      ? '"' + fileArg + '"' + (newFile ? ' [New file]' : ' ' + buf.length + 'L, ' + (buf.join('\n').length + 1) + 'C')
      : '';
    var modified = false;
    var yankBuf = null;        // {lines: [...]}
    var undoStack = [];
    var lastSearch = null;

    function pushUndo() {
      undoStack.push({ buf: buf.slice(), cy: cy, cx: cx });
      if (undoStack.length > 100) undoStack.shift();
    }
    function snapshot() {
      pushUndo();
      modified = true;
    }
    function clampCursor(insertMode) {
      if (cy < 0) cy = 0;
      if (cy > buf.length - 1) cy = buf.length - 1;
      var max = Math.max(0, buf[cy].length - (insertMode ? 0 : 1));
      if (cx > max) cx = max;
      if (cx < 0) cx = 0;
    }
    function render() {
      if (cy < top) top = cy;
      if (cy >= top + ROWS) top = cy - ROWS + 1;
      pre.textContent = '';
      for (var row = 0; row < ROWS; row++) {
        var li = top + row;
        if (li < buf.length) {
          var line = buf[li].slice(0, COLS);
          if (li === cy && mode !== 'cmd') {
            var cxs = Math.min(cx, Math.max(0, line.length));
            pre.appendChild(document.createTextNode(line.slice(0, cxs)));
            var cur = document.createElement('span');
            cur.className = 'vi-inv';
            cur.textContent = line.charAt(cxs) || ' ';
            pre.appendChild(cur);
            pre.appendChild(document.createTextNode(line.slice(cxs + 1) + '\n'));
          } else {
            pre.appendChild(document.createTextNode(line + '\n'));
          }
        } else {
          var tilde = document.createElement('span');
          tilde.className = 'vi-tilde';
          tilde.textContent = '~';
          pre.appendChild(tilde);
          pre.appendChild(document.createTextNode('\n'));
        }
      }
      // status line
      if (mode === 'cmd') {
        pre.appendChild(document.createTextNode(cmdKind + cmdline));
        var cur2 = document.createElement('span');
        cur2.className = 'vi-inv';
        cur2.textContent = ' ';
        pre.appendChild(cur2);
      } else {
        var left = message || (mode === 'insert' ? '-- INSERT --' : '');
        var right = (cy + 1) + ',' + (cx + 1) + '  ' +
          (buf.length <= ROWS ? 'All' : top === 0 ? 'Top' : top + ROWS >= buf.length ? 'Bot' : Math.floor(top * 100 / (buf.length - ROWS)) + '%');
        var gap = Math.max(1, COLS - left.length - right.length - 1);
        pre.appendChild(document.createTextNode(left + ' '.repeat(gap) + right));
      }
    }
    function quit(code) {
      document.removeEventListener('keydown', keyHandler, true);
      if (vOverlay.parentNode) vOverlay.parentNode.removeChild(vOverlay);
      if (processes[pid]) delete processes[pid];
      if (foregroundPid === pid) foregroundPid = null;
      lastExit = code;
      enableTerminalInput();
      updatePrompt();
      scrollToBottom();
      if (cont) cont();
    }
    function save(target, thenQuit, force) {
      var dest = target ? normPath(target) : path;
      if (!dest) { message = 'No current filename'; return false; }
      var text = buf.join('\n') + '\n';
      var w = writeFile(dest, text);
      if (w.error) { message = "'" + (target || fileArg) + "' " + w.error; return false; }
      if (w.warn) { message = 'write error: ' + w.warn; return false; }
      if (!path) { path = dest; fileArg = target; }
      modified = false;
      message = "'" + (target || fileArg || dest) + "' " + buf.length + 'L, ' + text.length + 'C';
      if (thenQuit) quit(0);
      return true;
    }
    function splitUnescaped(s, delim) {
      var parts = [''];
      for (var si = 0; si < s.length; si++) {
        var sc = s.charAt(si);
        if (sc === '\\' && si + 1 < s.length) {
          if (s.charAt(si + 1) === delim) { parts[parts.length - 1] += delim; si++; }
          else parts[parts.length - 1] += sc;
          continue;
        }
        if (sc === delim) { parts.push(''); continue; }
        parts[parts.length - 1] += sc;
      }
      return parts;
    }
    function exSubstitute(range, delim, rest) {
      var parts = splitUnescaped(rest, delim);
      var pat = parts[0] || lastSearch;
      if (!pat) { message = 'No previous search'; return; }
      var flagsS = parts[2] || '';
      var reFlags = (flagsS.indexOf('i') >= 0 ? 'i' : '') + (flagsS.indexOf('g') >= 0 ? 'g' : '');
      var reS, gRe;
      try {
        reS = new RegExp(pat, reFlags);
        gRe = new RegExp(pat, reFlags.indexOf('g') >= 0 ? reFlags : reFlags + 'g');
      } catch (e) { message = 'Bad pattern: ' + pat; return; }
      var replS = (parts[1] || '').replace(/\$/g, '$$$$').replace(/&/g, '$$&').replace(/\\(\d)/g, '$$$1');
      var lo, hi;
      function lineNo(s) { return s === '$' ? buf.length - 1 : s === '.' ? cy : parseInt(s, 10) - 1; }
      if (!range || range === '.') { lo = hi = cy; }
      else if (range === '%') { lo = 0; hi = buf.length - 1; }
      else if (range === '$') { lo = hi = buf.length - 1; }
      else {
        var pr2 = range.split(',');
        lo = lineNo(pr2[0]);
        hi = pr2.length > 1 ? lineNo(pr2[1]) : lo;
      }
      lo = Math.max(0, lo);
      hi = Math.min(buf.length - 1, hi);
      var nSub = 0, nLines = 0;
      pushUndo();
      for (var li2 = lo; li2 <= hi; li2++) {
        var hits = buf[li2].match(gRe);
        if (!hits) continue;
        buf[li2] = buf[li2].replace(reS, replS);
        nSub += reFlags.indexOf('g') >= 0 ? hits.length : 1;
        nLines++;
        cy = li2;
      }
      if (!nSub) {
        undoStack.pop();
        message = 'Pattern not found: ' + pat;
      } else {
        modified = true;
        lastSearch = pat;
        clampCursor(false);
        message = nSub + ' substitution' + (nSub === 1 ? '' : 's') + ' on ' + nLines + ' line' + (nLines === 1 ? '' : 's');
      }
    }
    function execEx(cmd) {
      cmd = cmd.trim();
      if (cmd === '') return;
      if (/^\d+$/.test(cmd)) { cy = Math.min(buf.length - 1, Math.max(0, parseInt(cmd, 10) - 1)); cx = 0; return; }
      var sm = /^([%$.]|\d+(?:,(?:\d+|\$|\.))?)?s([^A-Za-z0-9\s])([\s\S]*)$/.exec(cmd);
      if (sm) { exSubstitute(sm[1], sm[2], sm[3]); return; }
      var m = /^w(q)?(!)?(?:\s+(.+))?$/.exec(cmd);
      if (m) { save(m[3] || null, !!m[1]); return; }
      if (cmd === 'x') { if (modified) save(null, true); else quit(0); return; }
      if (cmd === 'q') {
        if (modified) { message = 'No write since last change (:q! overrides)'; return; }
        quit(0);
        return;
      }
      if (cmd === 'q!') { quit(0); return; }
      if (cmd === 'set nu' || cmd === 'set number' || cmd.slice(0, 4) === 'set ') { message = ''; return; }
      message = ':' + cmd + ': No such command';
    }
    function doSearch(backwards) {
      if (!lastSearch) { message = 'No previous search'; return; }
      var re;
      try { re = new RegExp(lastSearch); } catch (e) { re = new RegExp(lastSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')); }
      var n = buf.length;
      for (var step = 1; step <= n; step++) {
        var li = backwards ? (cy - step + n * 2) % n : (cy + step) % n;
        var mm = re.exec(buf[li]);
        if (mm) { cy = li; cx = mm.index; message = ''; return; }
      }
      message = 'Pattern not found: ' + lastSearch;
    }
    function wordFwd() {
      var line = buf[cy];
      var i = cx;
      while (i < line.length && /\S/.test(line.charAt(i))) i++;
      while (i < line.length && /\s/.test(line.charAt(i))) i++;
      if (i >= line.length && cy < buf.length - 1) { cy++; cx = 0; }
      else cx = i;
    }
    function wordBack() {
      if (cx === 0) {
        if (cy > 0) { cy--; cx = Math.max(0, buf[cy].length - 1); }
        return;
      }
      var line = buf[cy];
      var i = cx - 1;
      while (i > 0 && /\s/.test(line.charAt(i))) i--;
      while (i > 0 && /\S/.test(line.charAt(i - 1))) i--;
      cx = i;
    }

    function keyHandler(e) {
      if (e.metaKey || (e.ctrlKey && e.key !== 'c')) return;   // keep browser shortcuts
      var key = e.key;
      if (key === 'Shift' || key === 'Control' || key === 'Alt' || key === 'CapsLock') return;
      e.preventDefault();
      e.stopPropagation();

      if (e.ctrlKey && key === 'c') {
        if (mode === 'insert') { mode = 'normal'; clampCursor(false); }
        else message = 'Type :q<Enter> to exit vi (or :q! to discard changes)';
        pending = '';
        render();
        return;
      }

      if (mode === 'cmd') {
        if (key === 'Enter') {
          mode = 'normal';
          var c = cmdline;
          cmdline = '';
          if (cmdKind === ':') execEx(c);
          else if (c !== '') { lastSearch = c; cy0Search(); }
          else doSearch(false);
          clampCursor(false);
        } else if (key === 'Escape') { mode = 'normal'; cmdline = ''; }
        else if (key === 'Backspace') {
          if (cmdline === '') mode = 'normal';
          else cmdline = cmdline.slice(0, -1);
        } else if (key.length === 1) cmdline += key;
        render();
        return;
      }
      function cy0Search() { var save = cy; doSearch(false); if (message && message.indexOf('Pattern') === 0) cy = save; }

      if (mode === 'insert') {
        if (key === 'Escape') { mode = 'normal'; cx = Math.max(0, cx - 1); clampCursor(false); }
        else if (key === 'Enter') {
          var lineI = buf[cy];
          buf.splice(cy, 1, lineI.slice(0, cx), lineI.slice(cx));
          cy++; cx = 0;
        } else if (key === 'Backspace') {
          if (cx > 0) { buf[cy] = buf[cy].slice(0, cx - 1) + buf[cy].slice(cx); cx--; }
          else if (cy > 0) {
            cx = buf[cy - 1].length;
            buf.splice(cy - 1, 2, buf[cy - 1] + buf[cy]);
            cy--;
          }
        } else if (key === 'Tab') { buf[cy] = buf[cy].slice(0, cx) + '\t' + buf[cy].slice(cx); cx++; }
        else if (key === 'ArrowLeft') { if (cx > 0) cx--; }
        else if (key === 'ArrowRight') { if (cx < buf[cy].length) cx++; }
        else if (key === 'ArrowUp') { if (cy > 0) { cy--; clampCursor(true); } }
        else if (key === 'ArrowDown') { if (cy < buf.length - 1) { cy++; clampCursor(true); } }
        else if (key.length === 1) {
          buf[cy] = buf[cy].slice(0, cx) + key + buf[cy].slice(cx);
          cx++;
          modified = true;
        }
        render();
        return;
      }

      // ── normal mode ──
      message = '';
      if (pending === 'r') {
        pending = '';
        if (key.length === 1 && buf[cy].length) {
          snapshot();
          buf[cy] = buf[cy].slice(0, cx) + key + buf[cy].slice(cx + 1);
        }
        render();
        return;
      }
      if (pending === 'g') {
        pending = '';
        if (key === 'g') { cy = 0; cx = 0; }
        render();
        return;
      }
      if (pending === 'd') {
        pending = '';
        if (key === 'd') {
          snapshot();
          yankBuf = { lines: [buf[cy]] };
          buf.splice(cy, 1);
          if (!buf.length) buf = [''];
          clampCursor(false);
        } else if (key === 'w') {
          snapshot();
          var lw = buf[cy], iw = cx;
          while (iw < lw.length && /\S/.test(lw.charAt(iw))) iw++;
          while (iw < lw.length && /\s/.test(lw.charAt(iw))) iw++;
          buf[cy] = lw.slice(0, cx) + lw.slice(iw);
          clampCursor(false);
        }
        render();
        return;
      }
      if (pending === 'y') {
        pending = '';
        if (key === 'y') { yankBuf = { lines: [buf[cy]] }; message = '1 line yanked'; }
        render();
        return;
      }
      if (pending === 'Z') {
        pending = '';
        if (key === 'Z') { if (modified) save(null, true); else quit(0); return; }
        render();
        return;
      }

      switch (key) {
        case 'h': case 'ArrowLeft': if (cx > 0) cx--; break;
        case 'l': case 'ArrowRight': cx++; clampCursor(false); break;
        case 'j': case 'ArrowDown': if (cy < buf.length - 1) cy++; clampCursor(false); break;
        case 'k': case 'ArrowUp': if (cy > 0) cy--; clampCursor(false); break;
        case '0': case 'Home': cx = 0; break;
        case '$': case 'End': cx = Math.max(0, buf[cy].length - 1); break;
        case '^': { var mnb = /\S/.exec(buf[cy]); cx = mnb ? mnb.index : 0; break; }
        case 'w': wordFwd(); clampCursor(false); break;
        case 'b': wordBack(); break;
        case 'G': cy = buf.length - 1; cx = 0; break;
        case 'g': pending = 'g'; break;
        case 'x':
          if (buf[cy].length) {
            snapshot();
            buf[cy] = buf[cy].slice(0, cx) + buf[cy].slice(cx + 1);
            clampCursor(false);
          }
          break;
        case 'd': pending = 'd'; break;
        case 'y': pending = 'y'; break;
        case 'r': pending = 'r'; break;
        case 'Z': pending = 'Z'; break;
        case 'p':
          if (yankBuf) {
            snapshot();
            for (var yp = 0; yp < yankBuf.lines.length; yp++) buf.splice(cy + 1 + yp, 0, yankBuf.lines[yp]);
            cy++; cx = 0;
          }
          break;
        case 'P':
          if (yankBuf) {
            snapshot();
            for (var yp2 = 0; yp2 < yankBuf.lines.length; yp2++) buf.splice(cy + yp2, 0, yankBuf.lines[yp2]);
            cx = 0;
          }
          break;
        case 'u': {
          var st = undoStack.pop();
          if (st) { buf = st.buf; cy = st.cy; cx = st.cx; clampCursor(false); message = 'undo'; }
          else message = 'Already at oldest change';
          break;
        }
        case 'i': pushUndo(); mode = 'insert'; break;
        case 'I': { var mI = /\S/.exec(buf[cy]); cx = mI ? mI.index : 0; pushUndo(); mode = 'insert'; break; }
        case 'a': cx = Math.min(buf[cy].length, cx + 1); pushUndo(); mode = 'insert'; break;
        case 'A': cx = buf[cy].length; pushUndo(); mode = 'insert'; break;
        case 'o': snapshot(); buf.splice(cy + 1, 0, ''); cy++; cx = 0; mode = 'insert'; break;
        case 'O': snapshot(); buf.splice(cy, 0, ''); cx = 0; mode = 'insert'; break;
        case ':': mode = 'cmd'; cmdKind = ':'; cmdline = ''; break;
        case '/': mode = 'cmd'; cmdKind = '/'; cmdline = ''; break;
        case 'n': doSearch(false); break;
        case 'N': doSearch(true); break;
        case 'PageDown': cy = Math.min(buf.length - 1, cy + ROWS); clampCursor(false); break;
        case 'PageUp': cy = Math.max(0, cy - ROWS); clampCursor(false); break;
        default: break;
      }
      render();
    }

    document.addEventListener('keydown', keyHandler, true);
    render();
    return 'async';
  }

  function execute(line) {
    var trimmed = line.trim();
    if (!trimmed) return;
    history.push(trimmed);
    historyIndex = history.length;
    persistHistory();
    runCommandLine(trimmed);
  }

  // Boot the filesystem (base image + persisted overlay from localStorage)
  bootFS();

  // Build input line
  var inputLine = document.createElement('div');
  inputLine.id = 'input-line';
  var promptSpan = document.createElement('span');
  promptSpan.appendChild(buildPrompt().cloneNode(true));
  var input = document.createElement('input');
  input.id = 'input';
  input.type = 'text';
  input.autocomplete = 'off';
  input.autocapitalize = 'off';
  input.spellcheck = false;
  var typed = document.createElement('span');
  typed.id = 'typed';
  var cursor = document.createElement('span');
  cursor.id = 'cursor';
  inputLine.appendChild(promptSpan);
  inputLine.appendChild(input);
  inputLine.appendChild(typed);
  inputLine.appendChild(cursor);

  // Append input line first so addLine can insertBefore it
  terminal.appendChild(inputLine);

  // Welcome banner
  var now = new Date();
  var loginDate = new Date(now.getTime() - 300000);
  addLine('Last login: ' + formatDate(loginDate) + ' from 192.168.1.42');
  addLine('');
  addLine(bbBanner());
  addLine("Enter 'help' for a list of built-in commands.");
  addLine('');

  function updatePrompt() {
    promptSpan.textContent = '';
    promptSpan.appendChild(buildPrompt());
  }

  function syncTyped() {
    typed.textContent = (readline && readline.password) ? '' : input.value;
  }

  // Modal line reader used by ssh (host-key confirmation, password prompts).
  // While active, Enter feeds the typed value to a callback instead of the
  // shell; password mode hides the echo, exactly like OpenSSH.
  var readline = null;
  function promptRead(promptText, opts, cb) {
    readline = { password: !!(opts && opts.password), cb: cb, text: promptText };
    promptSpan.textContent = '';
    promptSpan.appendChild(document.createTextNode(promptText));
    input.disabled = false;
    cursor.style.display = '';
    inputLine.style.display = '';
    input.value = '';
    syncTyped();
    input.focus();
    scrollToBottom();
  }
  function finishReadline(value) {
    var rl = readline;
    readline = null;
    addLine(rl.text + (rl.password || value === null ? '' : value));
    input.value = '';
    updatePrompt();
    syncTyped();
    rl.cb(value);
    scrollToBottom();
  }

  function getCompletableCommands() {
    var names = Object.keys(builtins).concat(Object.keys(applets));
    var dirs = pathDirs();
    for (var i = 0; i < dirs.length; i++) {
      var dir = fs[dirs[i]];
      if (dir && dir.type === 'dir' && dir.children) {
        for (var j = 0; j < dir.children.length; j++) {
          var child = fs[dirs[i] + '/' + dir.children[j]];
          if (child && child.executable && names.indexOf(dir.children[j]) === -1) names.push(dir.children[j]);
        }
      }
    }
    return names.sort();
  }

  function tabComplete(value) {
    var parts = value.split(/\s+/);
    var isFirst = parts.length <= 1;
    var partial = parts[parts.length - 1] || '';

    if (isFirst) {
      var cmdNames = getCompletableCommands();
      var matches = cmdNames.filter(function(c) { return c.startsWith(partial); });
      return { matches: matches, prefix: partial, isPath: false };
    }

    // Complete file/dir names
    var dirPath, namePrefix;
    var lastSlash = partial.lastIndexOf('/');
    if (lastSlash !== -1) {
      var dirPart = partial.substring(0, lastSlash) || '/';
      dirPath = resolvePath(dirPart);
      namePrefix = partial.substring(lastSlash + 1);
    } else {
      dirPath = cwd;
      namePrefix = partial;
    }

    var dir = fs[dirPath];
    if (!dir || dir.type !== 'dir' || !canRead(dirPath)) return { matches: [], prefix: partial, isPath: true };

    var matches = dir.children.filter(function(c) { return c.startsWith(namePrefix); });
    return { matches: matches, prefix: namePrefix, isPath: true, dirPath: dirPath, lastSlash: lastSlash, partial: partial };
  }

  function applyCompletion(value, result) {
    if (result.matches.length === 0) return value;
    var parts = value.split(/\s+/);

    var completed;
    if (result.matches.length === 1) {
      completed = result.matches[0];
      // Add trailing slash for directories, space for files/commands
      if (result.isPath) {
        var fullPath = (result.dirPath === '/' ? '' : result.dirPath) + '/' + completed;
        var entry = fs[fullPath];
        if (entry && entry.type === 'dir') completed += '/';
        else completed += ' ';
      } else {
        completed += ' ';
      }
    } else {
      // Fill common prefix
      var common = result.matches[0];
      for (var i = 1; i < result.matches.length; i++) {
        while (result.matches[i].indexOf(common) !== 0) {
          common = common.substring(0, common.length - 1);
        }
      }
      completed = common;
    }

    if (result.isPath && result.lastSlash !== -1) {
      completed = result.partial.substring(0, result.lastSlash + 1) + completed;
    }

    parts[parts.length - 1] = completed;
    return parts.join(' ');
  }

  terminal.addEventListener('click', function() { input.focus(); });

  input.addEventListener('input', syncTyped);

  input.addEventListener('keydown', function(e) {
    // Modal readline (ssh prompts) intercepts before everything else
    if (readline) {
      if (e.key === 'c' && e.ctrlKey) { e.preventDefault(); finishReadline(null); return; }
      if (e.key === 'Enter') { e.preventDefault(); finishReadline(input.value); return; }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Tab') { e.preventDefault(); return; }
      return;   // let the character reach the input; the input event masks it
    }
    // Ctrl+C: kill foreground process or cancel input
    if (e.key === 'c' && e.ctrlKey) {
      e.preventDefault();
      if (foregroundPid !== null) {
        killProcess(foregroundPid);
        addLine('^C');
        scrollToBottom();
      } else {
        addCommandLine(input.value + '^C');
        input.value = '';
        syncTyped();
        historyIndex = history.length;
        scrollToBottom();
      }
      return;
    }
    // Block all other input while foreground process is running
    if (foregroundPid !== null) { e.preventDefault(); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      var val = input.value;
      addCommandLine(val);
      input.value = '';
      syncTyped();
      reportCompletedJobs();
      execute(val);
      if (!readline) updatePrompt();   // don't clobber a pending ssh prompt
      scrollToBottom();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (historyIndex > 0) { historyIndex--; input.value = history[historyIndex]; syncTyped(); }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex < history.length - 1) { historyIndex++; input.value = history[historyIndex]; syncTyped(); }
      else { historyIndex = history.length; input.value = ''; syncTyped(); }
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      clearTerminal();
      scrollToBottom();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      var result = tabComplete(input.value);
      if (result.matches.length === 1) {
        input.value = applyCompletion(input.value, result);
        syncTyped();
      } else if (result.matches.length > 1) {
        // Show matches and fill common prefix
        addCommandLine(input.value);
        addLine(result.matches.join('  '));
        input.value = applyCompletion(input.value, result);
        syncTyped();
        scrollToBottom();
      }
    }
  });

  input.focus();
  window.addEventListener('focus', function() { input.focus(); });
})();
