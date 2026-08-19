  // ── ssh (interactive OpenSSH-style client) ───────────────────────────────
  function launchSsh(args, cont) {
    var o = parseSshArgs(args);

    // Failures reachable before any prompt resolve synchronously, so the outer
    // command list ('ssh bad && echo') continues normally with $? set.
    if (!o.host) {
      addLine('usage: ssh [-v] [-p port] [-i identity] [-l login_name] [user@]hostname [command]');
      lastExit = 255; return;
    }
    var target = resolveHost(o.host);
    if (!target && isIP(o.host)) { addLine('ssh: connect to host ' + o.host + ' port ' + o.port + ': Connection refused'); lastExit = 255; return; }
    if (!target) { addLine('ssh: Could not resolve hostname ' + o.host + ': Name or service not known'); lastExit = 255; return; }
    if (!target.ssh) { addLine('ssh: connect to host ' + o.host + ' port ' + o.port + ': Connection refused'); lastExit = 255; return; }

    var srv = target.ssh;
    var out = addLine;
    sshVerbose(o, target, out);
    var runCmd = o.cmd.length ? o.cmd.join(' ') : null;

    // Terminal outcomes that must resume the outer command list now.
    function finish(code) { lastExit = code; if (cont) cont(); }

    function afterAuth() {
      if (o.verbose) out('debug1: Entering interactive session.');
      if (runCmd) {
        runCommandLine(runCmd);   // ssh host command → run remotely, then close
        finish(lastExit);
        return;
      }
      // interactive login: push a session frame; logout resumes the outer list
      var frame = {
        user: o.user, host: srv.host, connectedVia: o.host,
        prevHostEnv: env.HOSTNAME, prevCwd: cwd, prevPrevDir: prevDir, cont: cont
      };
      env.HOSTNAME = srv.host;
      if (srv.motd) srv.motd.forEach(out);
      else {
        out('Linux ' + srv.host + ' 6.1.0-37-amd64 #1 SMP x86_64');
        out('');
      }
      var last = new Date(Date.now() - (600000 + Math.floor(Math.random() * 6e8)));
      out('Last login: ' + formatDate(last) + ' from ' + NET.ip);
      sessions.push(frame);
      lastExit = 0;
      updatePrompt();
      scrollToBottom();
    }

    function tryKnownHost(next) {
      if (knownHostHas(srv.host) || knownHostHas(o.host)) { next(); return; }
      var fp = hostFingerprint(srv.host);
      out('The authenticity of host \'' + o.host + ' (' + target.ip + ')\' can\'t be established.');
      out('ED25519 key fingerprint is ' + fp + '.');
      out('This key is not known by any other names.');
      promptRead('Are you sure you want to continue connecting (yes/no/[fingerprint])? ', {}, function(ans) {
        if (ans === null) { addLine(''); return finish(130); }
        ans = (ans || '').trim();
        if (ans === 'yes' || ans === fp) {
          addKnownHost(srv.host);
          addLine("Warning: Permanently added '" + o.host + "' (ED25519) to the list of known hosts.");
          next();
        } else if (ans === 'no' || ans === '') {
          addLine('Host key verification failed.');
          finish(255);
        } else {
          addLine('Please type \'yes\', \'no\' or the fingerprint: (assuming no)');
          addLine('Host key verification failed.');
          finish(255);
        }
      });
    }

    function doAuth() {
      // sshd Banner (pre-authentication), shown before any password prompt
      if (srv.banner) srv.banner.forEach(out);
      if (srv.auth === 'key') {
        if (o.verbose) {
          out('debug1: Authentications that can continue: publickey,password');
          out('debug1: Next authentication method: publickey');
          out('debug1: Offering public key: ' + (o.ident || HOME + '/.ssh/id_ed25519') + ' ED25519');
          out('debug1: Server accepts key');
          out('debug1: Authentication succeeded (publickey).');
        }
        afterAuth();
        return;
      }
      // password auth, up to 3 tries
      if (srv.banner && o.verbose) out('debug1: Next authentication method: password');
      var tries = 0;
      function ask() {
        promptRead(o.user + '@' + o.host + "'s password: ", { password: true }, function(pw) {
          if (pw === null) { addLine(''); return finish(130); }
          if (pw === srv.password) { afterAuth(); return; }
          tries++;
          if (tries >= 3) {
            addLine(o.user + '@' + o.host + ': Permission denied (publickey,password).');
            return finish(255);
          }
          addLine('Permission denied, please try again.');
          ask();
        });
      }
      ask();
    }

    tryKnownHost(doAuth);
    return 'async';
  }

