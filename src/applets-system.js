  // ── Applets: system & misc ───────────────────────────────────────────────
  function clearTerminal() {
    var lines = terminal.querySelectorAll('.line');
    for (var i = 0; i < lines.length; i++) lines[i].remove();
  }

  var MAN_PAGES = {
    sl: [
      'SL(1)                     General Commands Manual                    SL(1)', '',
      'NAME', '       sl - cure your bad habit of mistyping', '',
      'SYNOPSIS', '       sl [-alFc]', '',
      'DESCRIPTION',
      '       sl is a highly advanced animation program for curing your bad habit',
      '       of mistyping.', '',
      '       -a     An accident is occurring. People cry for help.', '',
      '       -l     Little version.', '',
      '       -F     It flies like the galaxy express 999.', '',
      '       -c     C51 appears instead of D51.', '',
      'SEE ALSO', '       ls(1)', '',
      'BUGS', '       It sometimes lists directory contents.', '',
      'AUTHOR', '       Toyoda Masashi (mtoyoda@acm.org)', '',
      '                            March 31, 2014                            SL(1)'
    ],
    deerhunt: [
      'DEERHUNT(6)                    Games Manual                    DEERHUNT(6)', '',
      'NAME', '       deerhunt - deer hunting simulator for X11', '',
      'SYNOPSIS', '       deerhunt [&]', '',
      'DESCRIPTION',
      '       A real-time 3D hunting simulator. The position of the sun, the',
      '       season and the length of the day follow the system clock, and',
      '       the weather rolls in on its own: fog, rain, thunderstorms, and',
      '       snow when it is cold enough.', '',
      '       Deer, moose, bear, wolf, fox, hare, squirrel and grouse roam',
      '       the valley. Wounded bears charge. Deep water means swimming,',
      '       and a swimming hunter cannot shoot.', '',
      'CONTROLS',
      '       mouse        look around',
      '       w a s d      walk (or swim)',
      '       left btn, f  fire',
      '       right btn, q look through the scope (q toggles)',
      '       arrows       fine aim',
      '       space        hold breath (steadies the scope)',
      '       1 2 3        choose rifle',
      '       r            reload',
      '       m            sound on/off', '',
      'NOTES',
      '       Most animals are active at dawn and dusk. Compensate for wind',
      '       and bullet drop at long range; a steady breath helps.', '',
      'CREDITS',
      '       Wildlife and nature models by Quaternius (quaternius.com), CC0,',
      '       and Poly by Google (bear, squirrel), CC-BY 3.0.', '',
      'BUGS', '       The animals are procedural and hold no grudge.', '',
      '                              July 11, 2026                   DEERHUNT(6)'
    ],
    floppyhunt: [
      'FLOPPYHUNT(6)                  Games Manual                  FLOPPYHUNT(6)', '',
      'NAME', '       floppyhunt - floppy disk shooting gallery for X11', '',
      'SYNOPSIS', '       floppyhunt [&]', '',
      'DESCRIPTION',
      '       A Duck Hunt clone where flying 3.5" floppy disks replace the ducks.',
      '       Aim with the mouse, and the disk under your crosshair when you fire',
      '       is hit. Every disk survives two misses before it flees the screen;',
      '       a disk that gets away costs you one of three lives.', '',
      '       Hit every disk in a round for the PERFECT 10000-point bonus. Every',
      '       fifth round is a MOVING DISKS round: the disks fly straight and fast',
      '       and are worth double. The dog does not take losing well.', '',
      'CONTROLS',
      '       mouse        aim',
      '       left btn     fire',
      '       space, z     fire',
      '       enter        start / advance',
      '       m            sound on/off', '',
      'BUGS', '       The dog laughs. It always laughs.', '',
      '                              August 19, 2026                 FLOPPYHUNT(6)'
    ],
    vi: [
      'VI(1)                     General Commands Manual                    VI(1)', '',
      'NAME', '       vi - edit FILE', '',
      'SYNOPSIS', '       vi [FILE]', '',
      'DESCRIPTION',
      '       BusyBox vi. Saved files persist in your browser (localStorage).', '',
      '       Normal mode: h j k l arrows, w b, 0 $ ^, gg G, x, dd, dw, yy, p P,',
      '       r, u, i I a A o O, /pattern, n N, ZZ', '',
      '       Command mode: :w [FILE], :q, :q!, :wq, :x, :N (go to line N),',
      '       :[range]s/pat/repl/[gi] where range is %, N, N,M, . or $', '',
      '                              July 11, 2026                          VI(1)'
    ],
    ssh: [
      'SSH(1)                    General Commands Manual                   SSH(1)', '',
      'NAME', '       ssh - OpenSSH remote login client (emulated)', '',
      'SYNOPSIS',
      '       ssh [-v] [-p port] [-i identity] [-l login] [user@]host [command]', '',
      'DESCRIPTION',
      '       An OpenSSH-style client for securit.se. A browser tab cannot open',
      '       raw TCP sockets, so this connects to a small set of emulated hosts',
      '       rather than the real network; host keys you accept are written to',
      '       ~/.ssh/known_hosts and persist across reloads, exactly like the',
      '       real client. See ssh-keygen(1), scp(1).', '',
      'REACHABLE HOSTS',
      '       localhost, securit, securit.se, lab   publickey (drops you in)',
      '       rainbow, rainbow.securit.se           password (banner has a hint)', '',
      'NOTES',
      '       For a client that reaches real servers you would run a',
      '       WebSocket-to-TCP relay and point a JS/WASM SSH stack at it; a',
      '       static page alone cannot.', '',
      '                              July 11, 2026                         SSH(1)'
    ]
  };

  function fmtK(n) { return String(n).padStart(11); }

  defineApplets({
    busybox: function(ctx) {
      if (ctx.args[0] === '--list') {
        Object.keys(applets).sort().forEach(function(n) { ctx.println(n); });
        return 0;
      }
      if (ctx.args.length && ctx.args[0] !== '--help') {
        var sub = ctx.args[0];
        var fn = applets[sub];
        if (!fn) { ctx.err(sub + ': applet not found'); return 127; }
        var ctx2 = {
          args: ctx.args.slice(1), argv0: sub, stdin: ctx.stdin, tty: ctx.tty,
          out: ctx.out, println: ctx.println, err: ctx.err,
          error: function(s) { ctx.err(sub + ': ' + s); }
        };
        return fn(ctx2) || 0;
      }
      ctx.println(bbBanner());
      ctx.println('BusyBox is copyrighted by many authors between 1998-2024.');
      ctx.println('Licensed under GPLv2. See source distribution for detailed');
      ctx.println('copyright notices.');
      ctx.println('');
      ctx.println('Usage: busybox [function [arguments]...]');
      ctx.println('   or: busybox --list');
      ctx.println('   or: function [arguments]...');
      ctx.println('');
      ctx.println('\tBusyBox is a multi-call binary that combines many common Unix');
      ctx.println('\tutilities into a single executable. The shell in this browser');
      ctx.println("\temulates it; saved files persist in the browser's storage.");
      ctx.println('');
      ctx.println('Currently defined functions:');
      var names = Object.keys(applets).sort();
      var line = '\t';
      for (var i = 0; i < names.length; i++) {
        var piece = names[i] + (i < names.length - 1 ? ', ' : '');
        if (line.length + piece.length > 72) { ctx.println(line); line = '\t'; }
        line += piece;
      }
      if (line !== '\t') ctx.println(line);
      return 0;
    },
    sh: function(ctx) {
      if (ctx.args[0] === '-c' && ctx.args.length > 1) {
        runCommandLine(ctx.args.slice(1).join(' '));
        return lastExit;
      }
      if (ctx.args.length && ctx.args[0].charAt(0) !== '-') {
        var r = readFile(normPath(ctx.args[0]));
        if (r.error) { ctx.err('sh: ' + ctx.args[0] + ': ' + r.error); return 127; }
        runScript(r.content);
        return lastExit;
      }
      ctx.println(bbBanner());
      ctx.println("Enter 'help' for a list of built-in commands.");
      return 0;
    },
    ash: function(ctx) { return applets.sh(ctx); },
    uname: function(ctx) {
      var p = parseFlags(ctx.args, 'asnrvmop');
      var f = p.flags;
      var vals = {
        s: 'Linux', n: 'securit', r: '6.1.0-37-amd64',
        v: '#1 SMP PREEMPT_DYNAMIC Debian 6.1.140-1 (2025-05-22)',
        m: 'x86_64', p: 'unknown', o: 'GNU/Linux'
      };
      var order = ['s', 'n', 'r', 'v', 'm', 'p', 'o'];
      var picked = f.a ? ['s', 'n', 'r', 'v', 'm', 'o'] : order.filter(function(k) { return f[k]; });
      if (!picked.length) picked = ['s'];
      ctx.println(picked.map(function(k) { return vals[k]; }).join(' '));
      return 0;
    },
    hostname: function(ctx) {
      if (ctx.args.indexOf('-I') >= 0 || ctx.args.indexOf('-i') >= 0) { ctx.println(NET.ip); return 0; }
      if (ctx.args.indexOf('-f') >= 0) { ctx.println(curHost() + (curHost().indexOf('.') < 0 ? '.securit.se' : '')); return 0; }
      ctx.println(curHost());
      return 0;
    },
    whoami: function(ctx) { ctx.println(curUser()); return 0; },
    logname: function(ctx) { ctx.println(env.USER); return 0; },
    groups: function(ctx) { ctx.println('guest'); return 0; },
    id: function(ctx) { ctx.println('uid=1000(guest) gid=1000(guest) groups=1000(guest)'); return 0; },
    tty: function(ctx) { ctx.println(ctx.tty ? '/dev/pts/0' : 'not a tty'); return ctx.tty ? 0 : 1; },
    nproc: function(ctx) { ctx.println(String(navigator.hardwareConcurrency || 2)); return 0; },
    arch: function(ctx) { ctx.println('x86_64'); return 0; },
    env: function(ctx) {
      var i = 0;
      while (i < ctx.args.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(ctx.args[i])) {
        var a = ctx.args[i], eq = a.indexOf('=');
        env[a.slice(0, eq)] = a.slice(eq + 1);
        i++;
      }
      if (i < ctx.args.length) {
        var res = runSimple(ctx.args.slice(i), ctx.stdin, { tty: ctx.tty });
        ctx.out(res.stdout);
        if (res.stderr) ctx.err(res.stderr.replace(/\n$/, ''));
        return res.code;
      }
      Object.keys(env).forEach(function(k) { ctx.println(k + '=' + env[k]); });
      return 0;
    },
    printenv: function(ctx) {
      if (!ctx.args.length) {
        Object.keys(env).forEach(function(k) { ctx.println(k + '=' + env[k]); });
        return 0;
      }
      var code = 0;
      ctx.args.forEach(function(k) {
        if (env[k] !== undefined) ctx.println(env[k]);
        else code = 1;
      });
      return code;
    },
    date: function(ctx) {
      var fmt = null;
      for (var i = 0; i < ctx.args.length; i++) {
        var a = ctx.args[i];
        if (a.charAt(0) === '+') fmt = a.slice(1);
        else if (a === '-u' || a === '-R') { /* close enough */ }
        else { ctx.error("invalid date '" + a + "'"); return 1; }
      }
      var d = new Date();
      if (!fmt) { ctx.println(formatDate(d)); return 0; }
      var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      var MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      var out = fmt.replace(/%([YymdeHMSsaAbBjn%])/g, function(_, c) {
        switch (c) {
          case 'Y': return String(d.getFullYear());
          case 'y': return String(d.getFullYear() % 100).padStart(2, '0');
          case 'm': return String(d.getMonth() + 1).padStart(2, '0');
          case 'd': return String(d.getDate()).padStart(2, '0');
          case 'e': return String(d.getDate()).padStart(2, ' ');
          case 'H': return String(d.getHours()).padStart(2, '0');
          case 'M': return String(d.getMinutes()).padStart(2, '0');
          case 'S': return String(d.getSeconds()).padStart(2, '0');
          case 's': return String(Math.floor(d.getTime() / 1000));
          case 'a': return DAYS[d.getDay()].slice(0, 3);
          case 'A': return DAYS[d.getDay()];
          case 'b': return MONTHS[d.getMonth()];
          case 'B': return MONTHS_FULL[d.getMonth()];
          case 'j': return String(Math.ceil((d - new Date(d.getFullYear(), 0, 0)) / 86400000)).padStart(3, '0');
          case 'n': return '\n';
          default: return '%';
        }
      });
      ctx.println(out);
      return 0;
    },
    cal: function(ctx) {
      var d = new Date();
      var year = d.getFullYear(), month = d.getMonth();
      if (ctx.args.length >= 2) {
        month = parseInt(ctx.args[0], 10) - 1;
        year = parseInt(ctx.args[1], 10);
        if (isNaN(month) || isNaN(year) || month < 0 || month > 11) { ctx.error('invalid date'); return 1; }
      }
      var MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      var head = MONTHS_FULL[month] + ' ' + year;
      var pad = Math.floor((20 - head.length) / 2);
      ctx.println(' '.repeat(Math.max(0, pad)) + head);
      ctx.println('Su Mo Tu We Th Fr Sa');
      var first = new Date(year, month, 1).getDay();
      var days = new Date(year, month + 1, 0).getDate();
      var today = (year === d.getFullYear() && month === d.getMonth()) ? d.getDate() : -1;
      var line = '   '.repeat(first).slice(0, first * 3);
      for (var day = 1; day <= days; day++) {
        var cell = String(day).padStart(2, ' ');
        if (day === today && ctx.tty) cell = '\x1b[1;32m' + cell + '\x1b[0m';
        line += cell + ' ';
        if ((first + day) % 7 === 0) { ctx.println(line.replace(/\s+$/, '')); line = ''; }
      }
      if (line.trim()) ctx.println(line.replace(/\s+$/, ''));
      return 0;
    },
    uptime: function(ctx) {
      var up = Math.floor((Date.now() - BOOT_TIME) / 1000) + 183042;
      var days = Math.floor(up / 86400);
      var hrs = Math.floor((up % 86400) / 3600);
      var mins = Math.floor((up % 3600) / 60);
      var t = new Date();
      ctx.println(' ' + String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0') + ':' + String(t.getSeconds()).padStart(2, '0') +
        ' up ' + days + ' days, ' + String(hrs).padStart(2) + ':' + String(mins).padStart(2, '0') +
        ',  1 user,  load average: 0.00, 0.01, 0.05');
      return 0;
    },
    free: function(ctx) {
      ctx.println('              total        used        free      shared  buff/cache   available');
      ctx.println('Mem:    ' + fmtK(2013452) + fmtK(331898) + fmtK(1524188) + fmtK(1024) + fmtK(157366) + fmtK(1730040));
      ctx.println('Swap:   ' + fmtK(0) + fmtK(0) + fmtK(0));
      return 0;
    },
    dmesg: function(ctx) {
      [
        '[    0.000000] Linux version 6.1.0-37-amd64 (builder@securit) #1 SMP PREEMPT_DYNAMIC',
        '[    0.001204] Command line: BOOT_IMAGE=/boot/vmlinuz root=/dev/vda1 ro quiet',
        '[    0.142551] Memory: 2013452K/2097152K available',
        '[    0.401180] virtio_blk virtio1: [vda] 10485760 512-byte logical blocks (5.37 GB/5.00 GiB)',
        '[    0.622013] EXT4-fs (vda1): mounted filesystem with ordered data mode. Quota mode: none.',
        '[    1.093392] random: crng init done',
        '[    1.244819] eth0: link up, 1000 Mbps, full duplex',
        '[    2.001240] browserfs: localStorage overlay mounted on /home (persistent)',
        '[    4.192011] deerhunt: wildlife subsystem initialized, 3 rifles registered',
        '[    6.017743] sshd[204]: listening on 0.0.0.0 port 22'
      ].forEach(function(l) { ctx.println(l); });
      return 0;
    },
    mount: function(ctx) {
      ctx.println('/dev/vda1 on / type ext4 (rw,relatime)');
      ctx.println('proc on /proc type proc (rw,nosuid,nodev,noexec,relatime)');
      ctx.println('devtmpfs on /dev type devtmpfs (rw,nosuid,noexec,relatime)');
      ctx.println('tmpfs on /dev/shm type tmpfs (rw,nosuid,nodev)');
      ctx.println('localStorage on /home type browserfs (rw,relatime,persistent)');
      return 0;
    },
    which: function(ctx) {
      var code = 0;
      for (var i = 0; i < ctx.args.length; i++) {
        var nm = ctx.args[i];
        if (applets[nm]) ctx.println('/bin/' + nm);
        else {
          var rx = resolveFromPath(nm);
          if (rx) ctx.println(rx.path);
          else code = 1;
        }
      }
      return code;
    },
    clear: function(ctx) {
      if (ctx.tty) clearTerminal();
      return 0;
    },
    reset: function(ctx) {
      if (ctx.tty) clearTerminal();
      return 0;
    },
    ps: function(ctx) {
      var now = new Date();
      ctx.println('USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND');
      for (var i = 0; i < bootProcs.length; i++) {
        var bp = bootProcs[i];
        ctx.println(bp.user.padEnd(8) + ' ' + bp.pid.toString().padStart(4) + '  ' + bp.cpu + '  ' + bp.mem + ' ' + bp.vsz.toString().padStart(6) + ' ' + bp.rss.toString().padStart(5) + ' ' + bp.tty.padEnd(8) + ' ' + bp.stat.padEnd(4) + ' ' + formatPsTime(now) + '   0:00 ' + bp.command);
      }
      ctx.println('guest    ' + shellPid.toString().padStart(4) + '  0.0  0.1  22456  5432 pts/0    Ss   ' + formatPsTime(now) + '   0:00 -sh');
      var pids = Object.keys(processes);
      for (var j = 0; j < pids.length; j++) {
        var proc = processes[pids[j]];
        var stat = (foregroundPid === proc.pid) ? 'S+  ' : 'S   ';
        ctx.println('guest   ' + proc.pid.toString().padStart(5) + '  0.2  0.3  45200  8192 pts/0    ' + stat + formatPsTime(proc.startTime) + '   0:00 ' + proc.command);
      }
      ctx.println('guest   ' + nextPid.toString().padStart(5) + '  0.0  0.0  15320  2048 pts/0    R+   ' + formatPsTime(now) + '   0:00 ps ' + (ctx.args.join(' ') || 'aux'));
      return 0;
    },
    kill: function(ctx) {
      if (!ctx.args.length) { ctx.err('kill: usage: kill [-s sigspec | -n signum | -sigspec] pid | jobspec ...'); return 1; }
      var code = 0;
      for (var i = 0; i < ctx.args.length; i++) {
        if (ctx.args[i].charAt(0) === '-') continue;
        var pid = parseInt(ctx.args[i], 10);
        if (isNaN(pid)) { ctx.err('sh: kill: ' + ctx.args[i] + ': arguments must be process or job IDs'); code = 1; continue; }
        if (pid === shellPid || bootProcs.some(function(bp) { return bp.pid === pid; })) {
          ctx.err('sh: kill: (' + pid + ') - Operation not permitted');
          code = 1;
          continue;
        }
        if (!killProcess(pid)) { ctx.err('sh: kill: (' + pid + ') - No such process'); code = 1; }
      }
      return code;
    },
    jobs: function(ctx) {
      var jobIds = Object.keys(jobs);
      for (var i = 0; i < jobIds.length; i++) {
        var job = jobs[jobIds[i]];
        var status = job.status === 'running' ? 'Running' : 'Done';
        ctx.println('[' + job.jobId + ']+  ' + status + '                 ' + job.command + (job.status === 'running' ? ' &' : ''));
      }
      return 0;
    },
    man: function(ctx) {
      if (!ctx.args.length) { ctx.println('What manual page do you want?'); return 1; }
      var page = MAN_PAGES[ctx.args[0]];
      if (!page) { ctx.println('No manual entry for ' + ctx.args[0]); return 1; }
      page.forEach(function(l) { ctx.println(l); });
      return 0;
    },
    sudo: function(ctx) {
      ctx.println('[sudo] password for guest: ');
      ctx.println('guest is not in the sudoers file. This incident will be reported.');
      return 1;
    },
    su: function(ctx) {
      ctx.println('Password: ');
      ctx.println('su: Authentication failure');
      return 1;
    },
    md5sum: function(ctx) { ctx.error('not available on this system (no crypto in the disk driver)'); return 1; },
    sl: function(ctx) { ctx.err('sl: redirected? trains only run on terminals'); return 1; },
    sleep: function(ctx) {
      if (!ctx.args.length || isNaN(parseFloat(ctx.args[0]))) { ctx.error("invalid number '" + (ctx.args[0] || '') + "'"); return 1; }
      return 0;
    },
    yes: function(ctx) {
      var word = ctx.args.length ? ctx.args.join(' ') : 'y';
      for (var i = 0; i < 4096; i++) ctx.println(word);
      return 0;
    },
    vi: function(ctx) {
      ctx.err('vi: standard input is not a terminal');
      return 1;
    },
    poweroff: function(ctx) { ctx.error('must be root (and this is a web page)'); return 1; },
    reboot: function(ctx) { ctx.error('must be root — try reloading the page instead'); return 1; },
    'true': function() { return 0; },
    'false': function() { return 1; }
  });

