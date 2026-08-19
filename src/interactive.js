  // ── Interactive launchers (standalone commands at the tty) ───────────────
  function runInteractive(name, args, cont) {
    if (name === 'sl') {
      var proc = runSL(args);
      if (proc) proc.onExit = function() { lastExit = 0; if (cont) cont(); };
      return 'async';
    }
    if (name === 'vi') return launchVi(args, cont);
    if (name === 'sleep') return runSleep(args, cont);
    if (name === 'ping') return runPing(args, cont);
    if (name === 'yes') return runYes(args, cont);
    if (name === 'ssh') return launchSsh(args, cont);
  }

  // Drunken-bishop randomart, seeded from the key bytes (stable per key).
  function randomArt(bytes, header, footer) {
    var W = 17, H = 9, x = 8, y = 4, i, grid = [];
    for (i = 0; i < H; i++) { grid.push([]); for (var c = 0; c < W; c++) grid[i].push(0); }
    var startX = x, startY = y;
    for (var b = 0; b < bytes.length; b++) {
      var byte = bytes[b];
      for (var s = 0; s < 4; s++) {
        var d = byte & 3; byte >>= 2;
        x += (d & 1) ? 1 : -1; y += (d & 2) ? 1 : -1;
        x = Math.max(0, Math.min(W - 1, x)); y = Math.max(0, Math.min(H - 1, y));
        grid[y][x]++;
      }
    }
    var sym = ' .o+=*BOX@%&#/^';
    var lines = [header];
    for (i = 0; i < H; i++) {
      var row = '|';
      for (var j = 0; j < W; j++) {
        if (i === startY && j === startX) row += 'S';
        else if (i === y && j === x) row += 'E';
        else row += sym.charAt(Math.min(grid[i][j], sym.length - 1));
      }
      lines.push(row + '|');
    }
    lines.push(footer);
    return lines;
  }

  function httpGet(url) {
    var m = /^(?:(https?):\/\/)?([^\/:]+)(?::(\d+))?(\/[^\s]*)?$/.exec(url);
    if (!m) return { error: 'invalid' };
    var host = m[2], path = m[4] || '/';
    var target = resolveHost(host);
    if (!target && !isIP(host)) return { error: 'resolve', host: host };
    var ip = target ? target.ip : host;
    var body;
    if (target && target.ssh && target.ssh.host === 'rainbow') {
      body = 'Rainbow demo server 🌈\nNothing to see here but good vibes.\n';
    } else {
      body = '<!DOCTYPE html>\n<html lang="en">\n<head><meta charset="UTF-8">\n<title>guest@securit:~$</title></head>\n<body>\n<!-- securit.se — a terminal in your browser. You are looking at it. -->\n</body>\n</html>\n';
    }
    return { host: host, ip: ip, path: path, body: body, status: 200, ctype: 'text/html' };
  }

  defineApplets({
    ssh: function(ctx) {
      var o = parseSshArgs(ctx.args);
      if (!o.host) { ctx.err('usage: ssh [-v] [-p port] [-i identity] [-l login_name] [user@]hostname [command]'); return 255; }
      var target = resolveHost(o.host);
      if (!target && isIP(o.host)) { ctx.err('ssh: connect to host ' + o.host + ' port ' + o.port + ': Connection refused'); return 255; }
      if (!target) { ctx.err('ssh: Could not resolve hostname ' + o.host + ': Name or service not known'); return 255; }
      if (!target.ssh) { ctx.err('ssh: connect to host ' + o.host + ' port ' + o.port + ': Connection refused'); return 255; }
      if (target.ssh.auth === 'password') { ctx.err(o.user + '@' + o.host + ': Permission denied (publickey,password).'); return 255; }
      if (!o.cmd.length) { ctx.err('ssh: no tty present and no askpass program specified'); return 255; }
      ctx.out(captureRun(o.cmd.join(' ')));
      return lastExit;
    },
    'ssh-keygen': function(ctx) {
      var type = 'ed25519', bits = 256, file = null, comment = curUser() + '@' + curHost(), showFp = false;
      for (var i = 0; i < ctx.args.length; i++) {
        var a = ctx.args[i];
        if (a === '-t') type = ctx.args[++i];
        else if (a === '-b') bits = parseInt(ctx.args[++i], 10) || bits;
        else if (a === '-f') file = ctx.args[++i];
        else if (a === '-C') comment = ctx.args[++i];
        else if (a === '-N') i++;
        else if (a === '-l') showFp = true;
        else if (a === '-q') { /* quiet */ }
      }
      if (type === 'rsa' && bits === 256) bits = 3072;
      var priv = file || (HOME + '/.ssh/id_' + type);
      if (showFp) {
        var pube = fs[priv + '.pub'] || fs[priv];
        if (!pube) { ctx.error(priv + ': No such file or directory'); return 1; }
        ctx.println(bits + ' ' + hostFingerprint('user:' + comment) + ' ' + comment + ' (' + type.toUpperCase() + ')');
        return 0;
      }
      ctx.println('Generating public/private ' + type + ' key pair.');
      ensureDir(HOME + '/.ssh');
      if (fs[HOME + '/.ssh']) { fs[HOME + '/.ssh'].mode = 'drwx------'; markDirty(HOME + '/.ssh'); }
      var blob = hostKeyBlob('user:' + comment);
      var w1 = writeFile(priv, '-----BEGIN OPENSSH PRIVATE KEY-----\n' + b64(seededBytes('priv:' + comment, 96)) + '\n-----END OPENSSH PRIVATE KEY-----\n');
      if (w1.error) { ctx.error(priv + ': ' + w1.error); return 1; }
      if (fs[priv]) { fs[priv].mode = '-rw-------'; markDirty(priv); }
      var pubLine = 'ssh-' + type + ' ' + blob + ' ' + comment + '\n';
      writeFile(priv + '.pub', pubLine);
      persistFS();
      ctx.println('Your identification has been saved in ' + priv);
      ctx.println('Your public key has been saved in ' + priv + '.pub');
      ctx.println('The key fingerprint is:');
      ctx.println(hostFingerprint('user:' + comment) + ' ' + comment);
      ctx.println("The key's randomart image is:");
      var hdr = ('+--[' + type.toUpperCase() + ' ' + bits + ']--+');
      hdr = hdr.length >= 19 ? hdr.slice(0, 19) : hdr.slice(0, -4) + '-'.repeat(19 - hdr.length) + hdr.slice(-4);
      randomArt(seededBytes('art:' + comment, 32), hdr, '+----[SHA256]-----+').forEach(function(l) { ctx.println(l); });
      return 0;
    },
    scp: function(ctx) {
      var p = parseFlags(ctx.args, 'rpqv');
      if (p.operands.length < 2) { ctx.err('usage: scp [-r] source ... target'); return 1; }
      function strip(spec) {
        var at = spec.indexOf('@'), col = spec.indexOf(':');
        if (col > 0 && (at < 0 || col > at)) {
          var host = spec.slice(at + 1, col);
          var t = resolveHost(host);
          if (!t || !t.ssh) return { error: host };
          return { path: spec.slice(col + 1) || '.' , remote: true };
        }
        return { path: spec };
      }
      var dst = strip(p.operands[p.operands.length - 1]);
      if (dst.error) { ctx.err('ssh: Could not resolve hostname ' + dst.error + ': Name or service not known'); return 1; }
      var code = 0;
      for (var i = 0; i < p.operands.length - 1; i++) {
        var src = strip(p.operands[i]);
        if (src.error) { ctx.err('ssh: Could not resolve hostname ' + src.error + ': Name or service not known'); code = 1; continue; }
        var r = copyNode({ error: function(s) { ctx.err('scp: ' + s); } }, normPath(src.path), normPath(dst.path), p.flags.r, src.path);
        if (r === 0) ctx.println(baseName(src.path) + '                              100%  ' + String(entrySize(fs[normPath(src.path)] || { content: '' })).padStart(4) + '     1.2MB/s   00:00');
        else code = 1;
      }
      return code;
    },
    ifconfig: function(ctx) {
      ctx.println(NET.iface + ': flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500');
      ctx.println('        inet ' + NET.ip + '  netmask ' + NET.mask + '  broadcast ' + NET.bcast);
      ctx.println('        ether ' + NET.mac + '  txqueuelen 1000  (Ethernet)');
      ctx.println('        RX packets 184213  bytes 201847362 (192.5 MiB)');
      ctx.println('        TX packets 97412  bytes 12048213 (11.4 MiB)');
      ctx.println('');
      ctx.println('lo: flags=73<UP,LOOPBACK,RUNNING>  mtu 65536');
      ctx.println('        inet 127.0.0.1  netmask 255.0.0.0');
      ctx.println('        loop  txqueuelen 1000  (Local Loopback)');
      return 0;
    },
    ip: function(ctx) {
      var sub = (ctx.args[0] || 'addr');
      if (sub === 'a' || sub === 'addr' || sub === 'address') {
        ctx.println('1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN group default qlen 1000');
        ctx.println('    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00');
        ctx.println('    inet 127.0.0.1/8 scope host lo');
        ctx.println('2: ' + NET.iface + ': <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP group default qlen 1000');
        ctx.println('    link/ether ' + NET.mac + ' brd ff:ff:ff:ff:ff:ff');
        ctx.println('    inet ' + NET.ip + '/' + NET.cidr + ' brd ' + NET.bcast + ' scope global dynamic ' + NET.iface);
        return 0;
      }
      if (sub === 'r' || sub === 'route') {
        ctx.println('default via ' + NET.gw + ' dev ' + NET.iface + ' proto dhcp metric 100');
        ctx.println('192.168.1.0/24 dev ' + NET.iface + ' proto kernel scope link src ' + NET.ip + ' metric 100');
        return 0;
      }
      if (sub === 'l' || sub === 'link') {
        ctx.println('1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN mode DEFAULT group default qlen 1000');
        ctx.println('    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00');
        ctx.println('2: ' + NET.iface + ': <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP mode DEFAULT group default qlen 1000');
        ctx.println('    link/ether ' + NET.mac + ' brd ff:ff:ff:ff:ff:ff');
        return 0;
      }
      if (sub === 'help' || sub === '-h' || sub === '--help') return bbShowHelp('ip', ctx);
      ctx.err('Object "' + sub + '" is unknown, try "ip help".');
      return 1;
    },
    ping: function(ctx) {
      var count = null, host = null;
      for (var i = 0; i < ctx.args.length; i++) {
        var a = ctx.args[i];
        if (a === '-c') count = parseInt(ctx.args[++i], 10);
        else if (a === '-w' || a === '-W' || a === '-i' || a === '-s') i++;
        else if (a.charAt(0) !== '-') host = a;
      }
      if (!host) { ctx.err('ping: usage error: Destination address required'); return 1; }
      var target = resolveHost(host);
      if (!target && !isIP(host)) { ctx.err('ping: bad address \'' + host + '\''); return 1; }
      var ip = target ? target.ip : host;
      var n = count && count > 0 ? Math.min(count, 20) : 4;
      ctx.println('PING ' + host + ' (' + ip + '): 56 data bytes');
      var times = [];
      for (var s = 0; s < n; s++) {
        var t = +(0.03 + Math.random() * (ip === '127.0.0.1' ? 0.05 : 8)).toFixed(3);
        times.push(t);
        ctx.println('64 bytes from ' + ip + ': seq=' + s + ' ttl=64 time=' + t.toFixed(3) + ' ms');
      }
      var min = Math.min.apply(null, times), max = Math.max.apply(null, times);
      var avg = times.reduce(function(x, y) { return x + y; }, 0) / times.length;
      ctx.println('');
      ctx.println('--- ' + host + ' ping statistics ---');
      ctx.println(n + ' packets transmitted, ' + n + ' packets received, 0% packet loss');
      ctx.println('round-trip min/avg/max = ' + min.toFixed(3) + '/' + avg.toFixed(3) + '/' + max.toFixed(3) + ' ms');
      return 0;
    },
    traceroute: function(ctx) {
      var host = ctx.args.filter(function(a) { return a.charAt(0) !== '-'; })[0];
      if (!host) { ctx.err('traceroute: bad address'); return 1; }
      var target = resolveHost(host);
      if (!target && !isIP(host)) { ctx.err('traceroute: bad address \'' + host + '\''); return 1; }
      var ip = target ? target.ip : host;
      ctx.println('traceroute to ' + host + ' (' + ip + '), 30 hops max, 60 byte packets');
      if (ip === '127.0.0.1' || ip === NET.ip) {
        ctx.println(' 1  ' + host + ' (' + ip + ')  0.042 ms  0.031 ms  0.028 ms');
        return 0;
      }
      ctx.println(' 1  ' + NET.gw + ' (' + NET.gw + ')  1.204 ms  1.118 ms  1.093 ms');
      ctx.println(' 2  ' + ip + ' (' + ip + ')  ' + (2 + Math.random() * 6).toFixed(3) + ' ms  ' + (2 + Math.random() * 6).toFixed(3) + ' ms  ' + (2 + Math.random() * 6).toFixed(3) + ' ms');
      return 0;
    },
    nslookup: function(ctx) {
      var host = ctx.args.filter(function(a) { return a.charAt(0) !== '-'; })[0];
      if (!host) { ctx.err('nslookup: missing host'); return 1; }
      ctx.println('Server:\t\t' + NET.dns);
      ctx.println('Address:\t' + NET.dns + '#53');
      ctx.println('');
      if (isIP(host)) {
        var rev = null;
        for (var k in HOSTS) { if (HOSTS[k].ip === host && !HOSTS[k].alias) { rev = k; break; } }
        if (rev) { ctx.println(host.split('.').reverse().join('.') + '.in-addr.arpa\tname = ' + rev + '.'); return 0; }
        ctx.println('** server can\'t find ' + host + ': NXDOMAIN');
        return 1;
      }
      var target = resolveHost(host);
      if (!target) { ctx.println('** server can\'t find ' + host + ': NXDOMAIN'); return 1; }
      ctx.println('Name:\t' + host);
      ctx.println('Address: ' + target.ip);
      return 0;
    },
    host: function(ctx) {
      var name = ctx.args.filter(function(a) { return a.charAt(0) !== '-'; })[0];
      if (!name) { ctx.err('Usage: host [-v] hostname'); return 1; }
      if (isIP(name)) {
        var rev = null;
        for (var k in HOSTS) { if (HOSTS[k].ip === name && !HOSTS[k].alias) { rev = k; break; } }
        if (rev) ctx.println(name.split('.').reverse().join('.') + '.in-addr.arpa domain name pointer ' + rev + '.');
        else { ctx.println('Host ' + name + ' not found: 3(NXDOMAIN)'); return 1; }
        return 0;
      }
      var target = resolveHost(name);
      if (!target) { ctx.println('Host ' + name + ' not found: 3(NXDOMAIN)'); return 1; }
      ctx.println(name + ' has address ' + target.ip);
      return 0;
    },
    dig: function(ctx) {
      var name = ctx.args.filter(function(a) { return a.charAt(0) !== '-' && a.charAt(0) !== '@'; })[0];
      if (!name) { ctx.err('dig: missing name'); return 1; }
      var target = resolveHost(name);
      ctx.println('; <<>> DiG 9.18.24 <<>> ' + name);
      ctx.println(';; global options: +cmd');
      ctx.println(';; Got answer:');
      ctx.println(';; ->>HEADER<<- opcode: QUERY, status: ' + (target ? 'NOERROR' : 'NXDOMAIN') + ', id: ' + (12000 + (name.length * 137) % 50000));
      ctx.println('');
      ctx.println(';; QUESTION SECTION:');
      ctx.println(';' + name + '.\t\t\tIN\tA');
      if (target) {
        ctx.println('');
        ctx.println(';; ANSWER SECTION:');
        ctx.println(name + '.\t\t300\tIN\tA\t' + target.ip);
      }
      ctx.println('');
      ctx.println(';; Query time: 0 msec');
      ctx.println(';; SERVER: ' + NET.dns + '#53(' + NET.dns + ')');
      return target ? 0 : 1;
    },
    netstat: function(ctx) {
      var p = parseFlags(ctx.args, 'tulnprea');
      if (p.flags.r) {
        ctx.println('Kernel IP routing table');
        ctx.println('Destination     Gateway         Genmask         Flags   MSS Window  irtt Iface');
        ctx.println('0.0.0.0         ' + NET.gw + '     0.0.0.0         UG        0 0          0 ' + NET.iface);
        ctx.println('192.168.1.0     0.0.0.0         255.255.255.0   U         0 0          0 ' + NET.iface);
        return 0;
      }
      ctx.println('Active Internet connections (' + (p.flags.a ? 'servers and established' : 'w/o servers') + ')');
      ctx.println('Proto Recv-Q Send-Q Local Address           Foreign Address         State');
      ctx.println('tcp        0      0 0.0.0.0:22              0.0.0.0:*               LISTEN');
      ctx.println('tcp        0      0 ' + NET.ip + ':22          ' + NET.gw + ':52134       ESTABLISHED');
      ctx.println('tcp6       0      0 :::22                   :::*                    LISTEN');
      return 0;
    },
    ss: function(ctx) {
      ctx.println('State      Recv-Q Send-Q  Local Address:Port    Peer Address:Port');
      ctx.println('LISTEN     0      128           0.0.0.0:22           0.0.0.0:*');
      ctx.println('ESTAB      0      0        ' + NET.ip + ':22         ' + NET.gw + ':52134');
      ctx.println('LISTEN     0      128              [::]:22              [::]:*');
      return 0;
    },
    arp: function(ctx) {
      ctx.println('Address                  HWtype  HWaddress           Flags Mask            Iface');
      ctx.println(NET.gw.padEnd(24) + ' ether   52:54:00:12:34:56   C                     ' + NET.iface);
      return 0;
    },
    route: function(ctx) {
      ctx.println('Kernel IP routing table');
      ctx.println('Destination     Gateway         Genmask         Flags Metric Ref    Use Iface');
      ctx.println('default         ' + NET.gw + '     0.0.0.0         UG    100    0        0 ' + NET.iface);
      ctx.println('192.168.1.0     0.0.0.0         255.255.255.0   U     100    0        0 ' + NET.iface);
      return 0;
    },
    wget: function(ctx) {
      var out = null, quiet = false, urls = [];
      for (var i = 0; i < ctx.args.length; i++) {
        var a = ctx.args[i];
        if (a === '-O') out = ctx.args[++i];
        else if (a === '-q') quiet = true;
        else if (a.charAt(0) !== '-') urls.push(a);
      }
      if (!urls.length) { ctx.err('wget: missing URL'); return 1; }
      var code = 0;
      for (var u = 0; u < urls.length; u++) {
        var r = httpGet(urls[u]);
        if (r.error === 'resolve') { ctx.err('wget: bad address \'' + r.host + '\''); code = 1; continue; }
        if (r.error) { ctx.err('wget: not an http or ftp url: ' + urls[u]); code = 1; continue; }
        var fname = out || baseName(r.path) === '' || r.path === '/' ? (out || 'index.html') : baseName(r.path);
        if (!quiet) {
          ctx.err('Connecting to ' + r.host + ' (' + r.ip + ':80)... connected.');
          ctx.err('HTTP request sent, awaiting response... 200 OK');
          ctx.err('Length: ' + r.body.length + ' (' + Math.ceil(r.body.length / 1024) + 'K) [' + r.ctype + ']');
          ctx.err("Saving to: '" + fname + "'");
          ctx.err('');
          ctx.err(fname + '  100%[===================>]  ' + r.body.length + '  --.-KB/s    in 0s');
          ctx.err('');
          ctx.err("'" + fname + "' saved [" + r.body.length + '/' + r.body.length + ']');
        }
        if (out === '-') { ctx.out(r.body); continue; }
        var w = writeFile(normPath(fname), r.body);
        if (w.error) { ctx.err('wget: ' + fname + ': ' + w.error); code = 1; }
      }
      return code;
    },
    curl: function(ctx) {
      var headOnly = false, silent = false, saveO = false, outName = null, urls = [];
      for (var i = 0; i < ctx.args.length; i++) {
        var a = ctx.args[i];
        if (a === '-I' || a === '--head') headOnly = true;
        else if (a === '-s' || a === '--silent') silent = true;
        else if (a === '-O') saveO = true;
        else if (a === '-o') outName = ctx.args[++i];
        else if (a === '-L' || a === '-k' || a === '-f') { /* ignore */ }
        else if (a.charAt(0) !== '-') urls.push(a);
      }
      if (!urls.length) { ctx.err('curl: try \'curl --help\' for more information'); return 2; }
      var code = 0;
      for (var u = 0; u < urls.length; u++) {
        var r = httpGet(urls[u]);
        if (r.error === 'resolve') { if (!silent) ctx.err('curl: (6) Could not resolve host: ' + r.host); code = 6; continue; }
        if (r.error) { ctx.err('curl: (1) unsupported URL: ' + urls[u]); code = 1; continue; }
        if (headOnly) {
          ctx.out('HTTP/1.1 200 OK\r\n');
          ctx.out('Server: nginx/1.24.0\r\n');
          ctx.out('Content-Type: ' + r.ctype + '\r\n');
          ctx.out('Content-Length: ' + r.body.length + '\r\n');
          ctx.out('Connection: keep-alive\r\n');
          ctx.out('\r\n');
          continue;
        }
        if (saveO || outName) {
          var fname = outName || baseName(r.path) || 'index.html';
          var w = writeFile(normPath(fname), r.body);
          if (w.error) { ctx.err('curl: ' + fname + ': ' + w.error); code = 1; }
          continue;
        }
        ctx.out(r.body);
      }
      return code;
    }
  });

  function runSleep(args, cont) {
    var secs = parseFloat(args[0]);
    if (isNaN(secs) || secs < 0) {
      addLine("sleep: invalid number '" + (args[0] || '') + "'");
      lastExit = 1;
      return;
    }
    var pid = nextPid++;
    var proc = { pid: pid, command: 'sleep ' + args.join(' '), startTime: new Date(), status: 'running', jobId: null };
    processes[pid] = proc;
    foregroundPid = pid;
    disableTerminalInput();
    var timer = setTimeout(function() { finish(false); }, Math.min(secs, 86400) * 1000);
    function keyHandler(e) {
      if (e.key === 'c' && e.ctrlKey) { e.preventDefault(); finish(true); }
    }
    function finish(interrupted) {
      clearTimeout(timer);
      document.removeEventListener('keydown', keyHandler);
      delete processes[pid];
      if (foregroundPid === pid) foregroundPid = null;
      if (interrupted) addLine('^C');
      lastExit = interrupted ? 130 : 0;
      enableTerminalInput();
      updatePrompt();
      scrollToBottom();
      if (!interrupted && cont) cont();
    }
    document.addEventListener('keydown', keyHandler);
    return 'async';
  }

  // ping at the tty: one packet per interval, reply after its RTT, Ctrl+C aborts with stats.
  function runPing(args, cont) {
    var count = null, host = null, interval = 1000;
    for (var i = 0; i < args.length; i++) {
      var a = args[i];
      if (a === '-c') count = parseInt(args[++i], 10);
      else if (a === '-i') interval = Math.max(100, Math.min(60000, (parseFloat(args[++i]) || 1) * 1000));
      else if (a === '-w' || a === '-W' || a === '-s') i++;
      else if (a.charAt(0) !== '-') host = a;
    }
    if (!host) { addLine('ping: usage error: Destination address required'); lastExit = 1; return; }
    var target = resolveHost(host);
    if (!target && !isIP(host)) { addLine("ping: bad address '" + host + "'"); lastExit = 1; return; }
    var ip = target ? target.ip : host;
    var n = count && count > 0 ? Math.min(count, 20) : 4;
    var pid = nextPid++;
    var proc = { pid: pid, command: 'ping ' + args.join(' '), startTime: new Date(), status: 'running', jobId: null };
    processes[pid] = proc;
    foregroundPid = pid;
    disableTerminalInput();
    addLine('PING ' + host + ' (' + ip + '): 56 data bytes');
    scrollToBottom();
    var times = [], sent = 0, timer = null;
    function sendNext() {
      var seq = sent++;
      var t = +(0.03 + Math.random() * (ip === '127.0.0.1' ? 0.05 : 8)).toFixed(3);
      timer = setTimeout(function() {
        times.push(t);
        addLine('64 bytes from ' + ip + ': seq=' + seq + ' ttl=64 time=' + t.toFixed(3) + ' ms');
        scrollToBottom();
        if (sent >= n) { finish(false); return; }
        timer = setTimeout(sendNext, Math.max(0, interval - t));
      }, t);
    }
    function keyHandler(e) {
      if (e.key === 'c' && e.ctrlKey) { e.preventDefault(); finish(true); }
    }
    function finish(interrupted) {
      clearTimeout(timer);
      document.removeEventListener('keydown', keyHandler);
      delete processes[pid];
      if (foregroundPid === pid) foregroundPid = null;
      if (interrupted) addLine('^C');
      addLine('');
      addLine('--- ' + host + ' ping statistics ---');
      var loss = sent ? Math.round((sent - times.length) / sent * 100) : 0;
      addLine(sent + ' packets transmitted, ' + times.length + ' packets received, ' + loss + '% packet loss');
      if (times.length) {
        var min = Math.min.apply(null, times), max = Math.max.apply(null, times);
        var avg = times.reduce(function(x, y) { return x + y; }, 0) / times.length;
        addLine('round-trip min/avg/max = ' + min.toFixed(3) + '/' + avg.toFixed(3) + '/' + max.toFixed(3) + ' ms');
      }
      lastExit = times.length ? 0 : 1;
      enableTerminalInput();
      updatePrompt();
      scrollToBottom();
      if (!interrupted && cont) cont();
    }
    document.addEventListener('keydown', keyHandler);
    sendNext();
    return 'async';
  }

  function runYes(args, cont) {
    var word = args.length ? args.join(' ') : 'y';
    var pid = nextPid++;
    var proc = { pid: pid, command: 'yes' + (args.length ? ' ' + args.join(' ') : ''), startTime: new Date(), status: 'running', jobId: null, intervalId: null };
    processes[pid] = proc;
    foregroundPid = pid;
    disableTerminalInput();
    proc.intervalId = setInterval(function() {
      for (var i = 0; i < 32; i++) addLine(word);
      var lines = terminal.querySelectorAll('.line');
      for (var j = 0; j < lines.length - 2000; j++) lines[j].remove();
      scrollToBottom();
    }, 60);
    function keyHandler(e) {
      if (e.key === 'c' && e.ctrlKey) {
        e.preventDefault();
        clearInterval(proc.intervalId);
        document.removeEventListener('keydown', keyHandler);
        delete processes[pid];
        if (foregroundPid === pid) foregroundPid = null;
        addLine('^C');
        lastExit = 130;
        enableTerminalInput();
        updatePrompt();
        scrollToBottom();
      }
    }
    document.addEventListener('keydown', keyHandler);
    return 'async';
  }

