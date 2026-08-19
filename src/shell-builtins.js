  // ── Shell built-ins ──────────────────────────────────────────────────────
  var builtins = {
    cd: function(ctx) {
      var target = ctx.args[0] || env.HOME;
      var path = target === '-' ? prevDir : normPath(target);
      var e = fs[path];
      if (!e) { ctx.err("sh: cd: can't cd to " + target + ': No such file or directory'); return 2; }
      if (e.type !== 'dir') { ctx.err("sh: cd: can't cd to " + target + ': Not a directory'); return 2; }
      if (!canRead(path)) { ctx.err("sh: cd: can't cd to " + target + ': Permission denied'); return 2; }
      if (target === '-') ctx.println(path);
      prevDir = cwd;
      cwd = path;
      env.OLDPWD = env.PWD;
      env.PWD = path;
      return 0;
    },
    export: function(ctx) {
      if (!ctx.args.length) {
        Object.keys(env).sort().forEach(function(k) { ctx.println('export ' + k + "='" + env[k] + "'"); });
        return 0;
      }
      for (var i = 0; i < ctx.args.length; i++) {
        var a = ctx.args[i], eq = a.indexOf('=');
        if (eq > 0) env[a.slice(0, eq)] = a.slice(eq + 1);
      }
      return 0;
    },
    unset: function(ctx) {
      for (var i = 0; i < ctx.args.length; i++) delete env[ctx.args[i]];
      return 0;
    },
    'source': function(ctx) {
      if (!ctx.args.length) { ctx.err('sh: source: filename argument required'); return 2; }
      var r = readFile(normPath(ctx.args[0]));
      if (r.error) { ctx.err('sh: source: ' + ctx.args[0] + ': ' + r.error); return 1; }
      runScript(r.content);
      return lastExit;
    },
    type: function(ctx) {
      var code = 0;
      for (var i = 0; i < ctx.args.length; i++) {
        var nm = ctx.args[i];
        if (builtins[nm]) ctx.println(nm + ' is a shell builtin');
        else if (applets[nm]) ctx.println(nm + ' is /bin/' + nm);
        else {
          var rx = resolveFromPath(nm);
          if (rx) ctx.println(nm + ' is ' + rx.path);
          else { ctx.err('sh: type: ' + nm + ': not found'); code = 1; }
        }
      }
      return code;
    },
    umask: function(ctx) { ctx.println('0022'); return 0; },
    history: function(ctx) {
      if (ctx.args[0] === '-c') {
        history = [];
        historyIndex = 0;
        persistHistory();
        return 0;
      }
      for (var i = 0; i < history.length; i++) {
        ctx.println('  ' + String(i + 1).padStart(4) + '  ' + history[i]);
      }
      return 0;
    },
    help: function(ctx) {
      ctx.println(bbBanner());
      ctx.println('Built-in commands:');
      ctx.println('------------------');
      ctx.println('\t' + Object.keys(builtins).sort().join(', '));
      ctx.println('');
      ctx.println("Type `busybox' to list the available applets. Everything you change");
      ctx.println('on disk is persisted in this browser; `fsreset -f` reformats it.');
      return 0;
    },
    fsreset: function(ctx) {
      if (ctx.args[0] !== '-f') {
        ctx.println('fsreset: restore the disk to the factory image, discarding every');
        ctx.println('change stored in this browser. Run `fsreset -f` to confirm.');
        return 1;
      }
      try { localStorage.removeItem(FS_KEY); } catch (e) { /* ignore */ }
      overlay = {};
      bootFS();
      prevDir = cwd = env.PWD = env.OLDPWD = HOME;
      ctx.println('mke2fs 1.47.0 (5-Feb-2023)');
      ctx.println('/dev/vda1 contains a ext4 file system');
      ctx.println('Filesystem restored to factory image.');
      return 0;
    },
    exit: function(ctx) { return logout(ctx); },
    logout: function(ctx) { return logout(ctx); }
  };

  function logout(ctx) {
    if (sessions.length) {
      var frame = sessions.pop();
      env.HOSTNAME = frame.prevHostEnv;
      cwd = frame.prevCwd;
      prevDir = frame.prevPrevDir;
      ctx.println('logout');
      ctx.println('Connection to ' + frame.connectedVia + ' closed.');
      var cont = frame.cont;
      if (cont) setTimeout(function() { lastExit = 0; cont(); }, 0);
      return 0;
    }
    ctx.println('logout');
    ctx.println('Connection to securit.se closed.');
    input.disabled = true;
    cursor.style.display = 'none';
    return 0;
  }

  function bbBanner() {
    return 'BusyBox v' + BB_VERSION + ' (' + BB_BUILD + ') built-in shell (ash)';
  }

