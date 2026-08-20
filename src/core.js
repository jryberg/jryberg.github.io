(function() {
  'use strict';

  // ── BusyBox emulation: environment & persistent filesystem ──────────────
  // The shell emulates `busybox ash` (BusyBox v1.37.0) with a large subset of
  // applets. Every change the visitor makes (vi, cp, rm, mkdir, redirections,
  // ...) is recorded in an overlay persisted to localStorage, so the browser
  // acts as the machine's disk and survives reloads. `fsreset -f` reformats.
  var BB_VERSION = '1.37.0';
  var BB_BUILD = '2026-06-06 12:00:00 UTC';
  var HOME = '/home/guest';
  var env = {
    HOME: HOME, USER: 'guest', LOGNAME: 'guest', SHELL: '/bin/sh',
    TERM: 'xterm-256color', HOSTNAME: 'securit',
    PATH: '/usr/bin:/usr/sbin:/bin:/sbin',
    PWD: HOME, OLDPWD: HOME, EDITOR: 'vi', LANG: 'C.UTF-8'
  };
  var lastExit = 0;
  var BOOT_TIME = Date.now();
  var BASE_MTIME = new Date(2026, 2, 1, 12, 0, 0).getTime();

  function dirEntry(children, extra) {
    var e = { type: 'dir', children: children || [], owner: 'root', group: 'root', mode: 'drwxr-xr-x', mtime: BASE_MTIME };
    if (extra) for (var k in extra) e[k] = extra[k];
    return e;
  }
  function fileEntry(content, extra) {
    var e = { type: 'file', content: content, owner: 'root', group: 'root', mode: '-rw-r--r--', mtime: BASE_MTIME };
    if (extra) for (var k in extra) e[k] = extra[k];
    return e;
  }
  function devEntry(kind, mode) {
    return { type: 'file', content: '', dev: kind, owner: 'root', group: 'root', mode: mode || 'crw-rw-rw-', mtime: BASE_MTIME };
  }
  function procEntry(kind) {
    return { type: 'file', content: '', proc: kind, owner: 'root', group: 'root', mode: '-r--r--r--', mtime: BASE_MTIME };
  }

  function buildBaseFS() {
    return {
      '/': dirEntry(['bin', 'dev', 'etc', 'home', 'proc', 'root', 'sbin', 'tmp', 'usr', 'var']),
      '/bin': dirEntry([]),   // populated with busybox applet links at boot
      '/sbin': dirEntry([]),
      '/bin/busybox': fileEntry('', { executable: true, mode: '-rwxr-xr-x' }),
      '/dev': dirEntry(['null', 'random', 'tty', 'urandom', 'vda1', 'zero']),
      '/dev/null': devEntry('null'),
      '/dev/zero': devEntry('zero'),
      '/dev/random': devEntry('random'),
      '/dev/urandom': devEntry('random'),
      '/dev/tty': devEntry('tty'),
      '/dev/vda1': devEntry('disk', 'brw-rw----'),
      '/etc': dirEntry(['group', 'hostname', 'hosts', 'motd', 'os-release', 'passwd', 'profile', 'resolv.conf', 'shadow']),
      '/etc/hostname': fileEntry('securit\n'),
      '/etc/hosts': fileEntry('127.0.0.1\tlocalhost\n127.0.1.1\tsecurit securit.se\n\n::1\tlocalhost ip6-localhost ip6-loopback\n'),
      '/etc/motd': fileEntry('Welcome to securit.se\n\nThis system runs BusyBox and your browser is its disk: everything you\nchange (vi, cp, rm, mkdir, >redirects, ...) is stored locally and\nsurvives reloads. Type `help` for built-ins, `busybox` for applets,\nand `fsreset -f` to reformat the disk back to factory state.\n'),
      '/etc/os-release': fileEntry('NAME="Securit Linux"\nVERSION="26.06"\nID=securit\nPRETTY_NAME="Securit Linux 26.06 (BusyBox v' + BB_VERSION + ')"\nHOME_URL="https://securit.se/"\n'),
      '/etc/passwd': fileEntry('root:x:0:0:root:/root:/bin/sh\ndaemon:x:1:1:daemon:/usr/sbin:/bin/false\nsshd:x:100:65534::/run/sshd:/bin/false\nguest:x:1000:1000:guest:/home/guest:/bin/sh\n'),
      '/etc/group': fileEntry('root:x:0:\ndaemon:x:1:\ndisk:x:6:\nguest:x:1000:\n'),
      '/etc/shadow': fileEntry('root:$6$rounds=656000$REDACTED:20200:0:99999:7:::\n', { mode: '-rw-------' }),
      '/etc/profile': fileEntry('# /etc/profile: system-wide profile for the Bourne shells\n\nexport PATH="/usr/bin:/usr/sbin:/bin:/sbin"\nif [ "$PS1" ]; then\n  cat /etc/motd 2>/dev/null\nfi\n'),
      '/etc/resolv.conf': fileEntry('nameserver 192.168.1.1\nsearch lan\n'),
      '/home': dirEntry(['guest']),
      '/home/guest': dirEntry(['.profile', 'Documents', 'contact.txt', 'projects.txt'], { owner: 'guest', group: 'guest' }),
      '/home/guest/.profile': fileEntry("# ~/.profile: executed by the ash shell at login.\n\nexport PS1='\\u@\\h:\\w\\$ '\nexport EDITOR=vi\n", { owner: 'guest', group: 'guest' }),
      '/home/guest/contact.txt': fileEntry('johan@ryberg.se\n', { owner: 'guest', group: 'guest' }),
      '/home/guest/projects.txt': fileEntry('Projects\n========\n\ngojinja\n-------\nA Go implementation of the Jinja2 template engine.\nFull support for Jinja2 syntax, designed for embedding in Go applications.\n\n  Source:  https://github.com/jryberg/gojinja\n  Docs:    https://securit.se/gojinja/stable/\n', { owner: 'guest', group: 'guest' }),
      '/home/guest/Documents': dirEntry([], { owner: 'guest', group: 'guest' }),
      '/proc': dirEntry(['cpuinfo', 'meminfo', 'uptime', 'version'], { mode: 'dr-xr-xr-x' }),
      '/proc/cpuinfo': procEntry('cpuinfo'),
      '/proc/meminfo': procEntry('meminfo'),
      '/proc/uptime': procEntry('uptime'),
      '/proc/version': procEntry('version'),
      '/root': dirEntry([], { mode: 'drwx------' }),
      '/tmp': dirEntry([], { mode: 'drwxrwxrwt' }),
      '/usr': dirEntry(['bin', 'sbin']),
      '/usr/bin': dirEntry(['clock', 'deerhunt', 'floppy', 'floppyhunt', 'lemmings']),
      '/usr/bin/clock': { type: 'file', content: '', executable: true, xapp: true, src: 'garden-clock.html', windowTitle: 'The Garden Clock', owner: 'root', group: 'root', mode: '-rwxr-xr-x', mtime: BASE_MTIME },
      '/usr/bin/deerhunt': { type: 'file', content: '', executable: true, xapp: true, src: 'deerhunt.html', windowTitle: 'Deer Hunt', winW: 1024, winH: 720, owner: 'root', group: 'root', mode: '-rwxr-xr-x', mtime: BASE_MTIME },
      '/usr/bin/floppy': { type: 'file', content: '', executable: true, xapp: true, src: 'floppy.html', windowTitle: 'Floppy', owner: 'root', group: 'root', mode: '-rwxr-xr-x', mtime: BASE_MTIME },
      '/usr/bin/floppyhunt': { type: 'file', content: '', executable: true, xapp: true, src: 'floppyhunt.html', windowTitle: 'Floppy Hunt', winW: 960, winH: 720, owner: 'root', group: 'root', mode: '-rwxr-xr-x', mtime: BASE_MTIME },
      '/usr/bin/lemmings': { type: 'file', content: '', executable: true, xapp: true, src: 'lemmings.html', windowTitle: 'Lemmings', winW: 640, winH: 480, owner: 'root', group: 'root', mode: '-rwxr-xr-x', mtime: BASE_MTIME },
      '/usr/sbin': dirEntry([]),
      '/var': dirEntry(['log']),
      '/var/log': dirEntry(['messages']),
      '/var/log/messages': fileEntry('Mar  1 12:00:01 securit syslogd started: BusyBox v' + BB_VERSION + '\nMar  1 12:00:01 securit kernel: EXT4-fs (vda1): mounted filesystem with ordered data mode\nMar  1 12:00:02 securit kernel: random: crng init done\nMar  1 12:00:03 securit sshd[204]: Server listening on 0.0.0.0 port 22.\n')
    };
  }

  var fs = null;   // populated by bootFS()

  // Persistence: the overlay maps absolute path -> entry (or null = deleted).
  var FS_KEY = 'securit.fs.v1';
  var HIST_KEY = 'securit.hist.v1';
  var overlay = {};
  var storageOK = true;

  function loadJSON(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }
  function persistFS() {
    try { localStorage.setItem(FS_KEY, JSON.stringify(overlay)); storageOK = true; }
    catch (e) { storageOK = false; }
    return storageOK;
  }
  function markDirty(path) {
    overlay[path] = fs[path] || null;
  }
  function bootFS() {
    fs = buildBaseFS();
    registerAppletBinaries();
    var saved = loadJSON(FS_KEY);
    if (saved && typeof saved === 'object') {
      overlay = saved;
      Object.keys(overlay).forEach(function(p) {
        if (overlay[p] === null) delete fs[p];
        else fs[p] = overlay[p];
      });
    }
  }

  // Path helpers
  function normPath(p, base) {
    if (!p) return base || cwd;
    if (p === '~') p = env.HOME;
    else if (p.slice(0, 2) === '~/') p = env.HOME + p.slice(1);
    if (p.charAt(0) !== '/') p = (base || cwd) + '/' + p;
    var parts = p.split('/');
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var s = parts[i];
      if (!s || s === '.') continue;
      if (s === '..') out.pop();
      else out.push(s);
    }
    return '/' + out.join('/');
  }
  function parentOf(p) { var i = p.lastIndexOf('/'); return i <= 0 ? '/' : p.slice(0, i); }
  function baseName(p) { if (p === '/') return '/'; return p.slice(p.lastIndexOf('/') + 1); }
  function cloneEntry(e) { return JSON.parse(JSON.stringify(e)); }

  // Permissions: guest may read anything with the others-read bit (or own
  // files), and may only write below $HOME and /tmp.
  function canRead(path) {
    var e = fs[path];
    if (!e) return false;
    if (e.owner === 'guest') return true;
    return (e.mode || '').charAt(7) === 'r';
  }
  function canWritePath(path) {
    if (path === '/dev/null') return true;
    return path === HOME || path.indexOf(HOME + '/') === 0 || path === '/tmp' || path.indexOf('/tmp/') === 0;
  }

  function devRead(e) {
    if (e.dev === 'random') {
      var s = '';
      for (var i = 0; i < 192; i++) s += String.fromCharCode(33 + Math.floor(Math.random() * 94));
      return s + '\n';
    }
    return '';
  }
  function procRead(kind) {
    if (kind === 'uptime') {
      var up = (Date.now() - BOOT_TIME) / 1000 + 4242;
      return up.toFixed(2) + ' ' + (up * 0.97).toFixed(2) + '\n';
    }
    if (kind === 'version') {
      return 'Linux version 6.1.0-37-amd64 (builder@securit) (gcc (Debian 12.2.0-14) 12.2.0) #1 SMP PREEMPT_DYNAMIC Debian 6.1.140-1 (2025-05-22)\n';
    }
    if (kind === 'meminfo') {
      return 'MemTotal:        2013452 kB\nMemFree:         1524188 kB\nMemAvailable:    1730040 kB\nBuffers:           38124 kB\nCached:           281550 kB\nSwapTotal:             0 kB\nSwapFree:              0 kB\n';
    }
    if (kind === 'cpuinfo') {
      var n = (navigator.hardwareConcurrency || 2), s = '';
      for (var i = 0; i < n; i++) {
        s += 'processor\t: ' + i + '\nvendor_id\t: GenuineIntel\nmodel name\t: Intel(R) Xeon(R) CPU @ 2.20GHz\ncpu MHz\t\t: 2199.998\ncache size\t: 56320 KB\nbogomips\t: 4399.99\n\n';
      }
      return s;
    }
    return '';
  }

  // File primitives used by the applets. All return {ok:...} or {error:'...'}.
  function readFile(path) {
    var e = fs[path];
    if (!e) return { error: 'No such file or directory' };
    if (e.type === 'dir') return { error: 'Is a directory' };
    if (!canRead(path)) return { error: 'Permission denied' };
    if (e.dev) return { content: devRead(e) };
    if (e.proc) return { content: procRead(e.proc) };
    return { content: e.content };
  }
  function writeFile(path, content, opts) {
    opts = opts || {};
    var e = fs[path];
    if (e && (e.dev || path === '/dev/null')) return { ok: true };   // devices discard
    if (e && e.type === 'dir') return { error: 'Is a directory' };
    if (!canWritePath(path)) return { error: 'Permission denied' };
    if (!e) {
      var pp = parentOf(path), parent = fs[pp];
      if (!parent) return { error: 'No such file or directory' };
      if (parent.type !== 'dir') return { error: 'Not a directory' };
      e = { type: 'file', content: '', owner: 'guest', group: 'guest', mode: '-rw-r--r--', mtime: Date.now() };
      fs[path] = e;
      if (parent.children.indexOf(baseName(path)) < 0) parent.children.push(baseName(path));
      markDirty(pp);
    }
    e.content = opts.append ? e.content + content : content;
    e.mtime = Date.now();
    markDirty(path);
    if (!persistFS()) return { ok: true, warn: 'No space left on device' };
    return { ok: true };
  }
  function mkdirNode(path) {
    if (fs[path]) return { error: 'File exists' };
    var pp = parentOf(path), parent = fs[pp];
    if (!parent || parent.type !== 'dir') return { error: parent ? 'Not a directory' : 'No such file or directory' };
    if (!canWritePath(path)) return { error: 'Permission denied' };
    fs[path] = { type: 'dir', children: [], owner: 'guest', group: 'guest', mode: 'drwxr-xr-x', mtime: Date.now() };
    parent.children.push(baseName(path));
    markDirty(pp);
    markDirty(path);
    persistFS();
    return { ok: true };
  }
  function removeNode(path) {
    var e = fs[path];
    if (!e) return { error: 'No such file or directory' };
    if (!canWritePath(path)) return { error: 'Permission denied' };
    Object.keys(fs).forEach(function(p) {
      if (p === path || p.indexOf(path + '/') === 0) { delete fs[p]; overlay[p] = null; }
    });
    var pp = parentOf(path), parent = fs[pp];
    if (parent && parent.children) {
      var i = parent.children.indexOf(baseName(path));
      if (i >= 0) parent.children.splice(i, 1);
      markDirty(pp);
    }
    persistFS();
    return { ok: true };
  }

  function pathDirs() { return env.PATH.split(':').filter(Boolean); }

  var cwd = HOME;
  var prevDir = cwd;

  // Remote login sessions (ssh). Empty = the local guest@securit shell. Each
  // frame overrides the prompt identity and remembers what to restore on exit.
  var sessions = [];
  function curUser() { return sessions.length ? sessions[sessions.length - 1].user : 'guest'; }
  function curHost() { return sessions.length ? sessions[sessions.length - 1].host : 'securit'; }

  var history = loadJSON(HIST_KEY) || [];
  var historyIndex = history.length;
  function persistHistory() {
    if (history.length > 500) history = history.slice(history.length - 500);
    try { localStorage.setItem(HIST_KEY, JSON.stringify(history)); } catch (e) { /* full disk */ }
  }
  var terminal = document.getElementById('terminal');

  // Process management (Linux-realistic PIDs)
  var bootProcs = [
    { pid: 1, user: 'root', cpu: '0.0', mem: '0.2', vsz: 169936, rss: 13284, tty: '?', stat: 'Ss', command: '/sbin/init' },
    { pid: 2, user: 'root', cpu: '0.0', mem: '0.0', vsz: 0, rss: 0, tty: '?', stat: 'S', command: '[kthreadd]' },
    { pid: 87, user: 'root', cpu: '0.0', mem: '0.1', vsz: 31608, rss: 5764, tty: '?', stat: 'Ss', command: '/lib/systemd/systemd-journald' },
    { pid: 112, user: 'root', cpu: '0.0', mem: '0.1', vsz: 22060, rss: 3428, tty: '?', stat: 'Ss', command: '/lib/systemd/systemd-udevd' },
    { pid: 198, user: 'root', cpu: '0.0', mem: '0.0', vsz: 6816, rss: 2964, tty: '?', stat: 'Ss', command: 'cron -f' },
    { pid: 204, user: 'root', cpu: '0.0', mem: '0.1', vsz: 15420, rss: 7060, tty: '?', stat: 'Ss', command: '/usr/sbin/sshd -D' },
    { pid: 312, user: 'root', cpu: '0.0', mem: '0.1', vsz: 17180, rss: 7416, tty: '?', stat: 'Ss', command: 'sshd: guest [priv]' },
    { pid: 354, user: 'guest', cpu: '0.0', mem: '0.1', vsz: 17180, rss: 4520, tty: '?', stat: 'S', command: 'sshd: guest@pts/0' }
  ];
  var shellPid = 355;
  var nextPid = 356;
  var processes = {};
  var jobs = {};
  var nextJobId = 1;
  var foregroundPid = null;
  var completedJobs = [];

  function escapeHTML(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function resolvePath(p) {
    if (p === '-') return prevDir;
    return normPath(p);
  }

  function getDisplayPath() {
    if (cwd === env.HOME) return '~';
    if (cwd.indexOf(env.HOME + '/') === 0) return '~' + cwd.slice(env.HOME.length);
    return cwd;
  }

  function buildPrompt() {
    var span = document.createElement('span');
    var user = document.createElement('span');
    user.className = 'prompt-user';
    user.textContent = curUser() + '@' + curHost();
    var sep = document.createElement('span');
    sep.className = 'prompt-sep';
    sep.textContent = ':';
    var path = document.createElement('span');
    path.className = 'prompt-path';
    path.textContent = getDisplayPath();
    var dollar = document.createElement('span');
    dollar.className = 'prompt-dollar';
    dollar.textContent = '$ ';
    span.appendChild(user);
    span.appendChild(sep);
    span.appendChild(path);
    span.appendChild(dollar);
    return span;
  }

  // Terminal output with basic ANSI SGR (color/bold) support, so applets can
  // colorize like real busybox tools (ls --color, grep --color, ...).
  var SGR_COLORS = {
    30: '#0a0a0a', 31: '#e06c75', 32: '#57c457', 33: '#d7af5f', 34: '#5f87d7', 35: '#c678dd', 36: '#56b6c2', 37: '#d4d4d4',
    90: '#6b6b6b', 91: '#ff7b86', 92: '#7ce38b', 93: '#e5c07b', 94: '#7aa2f7', 95: '#d3a4f0', 96: '#7dcfff', 97: '#ffffff'
  };
  function appendAnsiText(div, text) {
    var re = /\x1b\[([0-9;]*)m/g;
    var idx = 0, m, bold = false, color = null;
    function emit(chunk) {
      if (!chunk) return;
      if (!bold && !color) { div.appendChild(document.createTextNode(chunk)); return; }
      var span = document.createElement('span');
      if (color) span.style.color = color;
      if (bold) span.style.fontWeight = 'bold';
      span.textContent = chunk;
      div.appendChild(span);
    }
    while ((m = re.exec(text))) {
      emit(text.slice(idx, m.index));
      idx = m.index + m[0].length;
      var codes = m[1] === '' ? [0] : m[1].split(';').map(Number);
      for (var i = 0; i < codes.length; i++) {
        if (codes[i] === 0) { bold = false; color = null; }
        else if (codes[i] === 1) bold = true;
        else if (SGR_COLORS[codes[i]]) color = SGR_COLORS[codes[i]];
      }
    }
    emit(text.slice(idx));
  }
  function addLine(text) {
    var div = document.createElement('div');
    div.className = 'line';
    var s = text === undefined || text === null ? '' : String(text);
    if (s === '') div.appendChild(document.createTextNode(' '));
    else appendAnsiText(div, s);
    terminal.insertBefore(div, inputLine);
  }

  function addCommandLine(cmdText) {
    var div = document.createElement('div');
    div.className = 'line';
    div.appendChild(buildPrompt());
    var textNode = document.createTextNode(cmdText);
    div.appendChild(textNode);
    terminal.insertBefore(div, inputLine);
  }

  function scrollToBottom() {
    terminal.scrollTop = terminal.scrollHeight;
  }

  // X11 window management
  var topZIndex = 1000;

  function bringToFront(win) {
    topZIndex++;
    win.style.zIndex = topZIndex;
  }

  function makeWindowDraggable(win, handle) {
    var dragging = false, startX, startY, origLeft, origTop;
    handle.addEventListener('mousedown', function(e) {
      if (e.target.tagName === 'BUTTON') return;
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      origLeft = parseInt(win.style.left) || 0;
      origTop = parseInt(win.style.top) || 0;
      var iframe = win.querySelector('iframe');
      if (iframe) iframe.style.pointerEvents = 'none';
      e.preventDefault();
    });
    document.addEventListener('mousemove', function(e) {
      if (!dragging) return;
      win.style.left = (origLeft + e.clientX - startX) + 'px';
      win.style.top = (origTop + e.clientY - startY) + 'px';
    });
    document.addEventListener('mouseup', function() {
      if (dragging) {
        dragging = false;
        var iframe = win.querySelector('iframe');
        if (iframe) iframe.style.pointerEvents = '';
      }
    });
  }

  function createX11Window(fileMeta, pid) {
    var win = document.createElement('div');
    win.className = 'x11-window';
    win.dataset.pid = pid;
    var w = Math.min(fileMeta.winW || 640, window.innerWidth - 40);
    var h = Math.min(fileMeta.winH || 520, window.innerHeight - 40);
    var offsetX = (Math.random() - 0.5) * 60;
    var offsetY = (Math.random() - 0.5) * 60;
    win.style.width = w + 'px';
    win.style.height = h + 'px';
    win.style.left = Math.max(10, (window.innerWidth - w) / 2 + offsetX) + 'px';
    win.style.top = Math.max(10, (window.innerHeight - h) / 2 + offsetY) + 'px';

    var titlebar = document.createElement('div');
    titlebar.className = 'x11-titlebar';
    var btnMin = document.createElement('button');
    btnMin.className = 'x11-btn';
    btnMin.textContent = '_';
    btnMin.title = 'Minimize';
    var title = document.createElement('div');
    title.className = 'x11-title';
    title.textContent = fileMeta.windowTitle || 'X11 Application';
    var btnMax = document.createElement('button');
    btnMax.className = 'x11-btn';
    btnMax.textContent = '\u25a1';
    btnMax.title = 'Maximize';
    var btnClose = document.createElement('button');
    btnClose.className = 'x11-btn';
    btnClose.textContent = 'X';
    btnClose.title = 'Close';
    titlebar.appendChild(btnMin);
    titlebar.appendChild(title);
    titlebar.appendChild(btnMax);
    titlebar.appendChild(btnClose);

    var body = document.createElement('div');
    body.className = 'x11-body';
    var iframe = document.createElement('iframe');
    iframe.src = fileMeta.src;
    iframe.allow = 'pointer-lock; fullscreen; autoplay';
    body.appendChild(iframe);

    win.appendChild(titlebar);
    win.appendChild(body);
    document.body.appendChild(win);

    btnClose.addEventListener('click', function() { killProcess(pid); });
    btnMin.addEventListener('click', function() { win.style.display = 'none'; });
    var maximized = false;
    var origStyle = { width: win.style.width, height: win.style.height, left: win.style.left, top: win.style.top };
    btnMax.addEventListener('click', function() {
      if (!maximized) {
        origStyle = { width: win.style.width, height: win.style.height, left: win.style.left, top: win.style.top };
        win.style.left = '0'; win.style.top = '0'; win.style.width = '100vw'; win.style.height = '100vh';
      } else {
        win.style.width = origStyle.width; win.style.height = origStyle.height;
        win.style.left = origStyle.left; win.style.top = origStyle.top;
      }
      maximized = !maximized;
    });
    makeWindowDraggable(win, titlebar);
    win.addEventListener('mousedown', function() { bringToFront(win); });
    return win;
  }

  // Process lifecycle
  function disableTerminalInput() {
    input.disabled = true;
    cursor.style.display = 'none';
    inputLine.style.display = 'none';
  }

  function enableTerminalInput() {
    input.disabled = false;
    cursor.style.display = '';
    inputLine.style.display = '';
    input.focus();
  }

  function spawnXApp(command, fileMeta, background) {
    var pid = nextPid++;
    var proc = { pid: pid, command: command, jobId: null, windowEl: null, startTime: new Date(), status: 'running' };
    proc.windowEl = createX11Window(fileMeta, pid);
    processes[pid] = proc;
    if (background) {
      var jobId = nextJobId++;
      proc.jobId = jobId;
      jobs[jobId] = { jobId: jobId, pid: pid, command: command, status: 'running' };
      addLine('[' + jobId + '] ' + pid);
    } else {
      foregroundPid = pid;
      disableTerminalInput();
    }
  }

  function killProcess(pid) {
    var proc = processes[pid];
    if (!proc) return false;
    if (proc.intervalId) clearInterval(proc.intervalId);
    if (proc.windowEl && proc.windowEl.parentNode) proc.windowEl.parentNode.removeChild(proc.windowEl);
    if (foregroundPid === pid) {
      foregroundPid = null;
      enableTerminalInput();
      updatePrompt();
      scrollToBottom();
    }
    if (proc.jobId && jobs[proc.jobId]) {
      jobs[proc.jobId].status = 'done';
      completedJobs.push(jobs[proc.jobId]);
    }
    proc.status = 'done';
    delete processes[pid];
    if (proc.onExit) proc.onExit();
    return true;
  }

  function reportCompletedJobs() {
    while (completedJobs.length > 0) {
      var job = completedJobs.shift();
      addLine('[' + job.jobId + ']+  Done                    ' + job.command);
      delete jobs[job.jobId];
    }
  }

  // PATH resolution (for the X11 apps living in /usr/bin)
  function resolveFromPath(cmdName) {
    var dirs = pathDirs();
    for (var i = 0; i < dirs.length; i++) {
      var binPath = dirs[i] + '/' + cmdName;
      var entry = fs[binPath];
      if (entry && entry.type === 'file' && entry.executable) return { path: binPath, entry: entry };
    }
    return null;
  }

  function formatPsTime(d) {
    return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
  }

  function formatDate(d) {
    var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var day = days[d.getDay()];
    var month = months[d.getMonth()];
    var date = d.getDate().toString();
    if (date.length === 1) date = ' ' + date;
    var h = d.getHours().toString().padStart(2, '0');
    var m = d.getMinutes().toString().padStart(2, '0');
    var s = d.getSeconds().toString().padStart(2, '0');
    return day + ' ' + month + ' ' + date + ' ' + h + ':' + m + ':' + s + ' ' + d.getFullYear();
  }

  // ── sl (Steam Locomotive) ────────────────────────────────────────────────
  function runSL(args) {
    var escapeOk = args.indexOf('-e') !== -1;
    var accident = args.indexOf('-a') !== -1;
    var logo     = args.indexOf('-l') !== -1;
    var c51mode  = args.indexOf('-c') !== -1;
    var fly      = args.indexOf('-F') !== -1;

    var probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font-family:"Cascadia Code","Fira Code","JetBrains Mono",Consolas,Monaco,monospace;font-size:14px;line-height:1.4';
    probe.textContent = 'MMMMMMMMMM';
    document.body.appendChild(probe);
    var cw = probe.offsetWidth / 10 || 8.4;
    var ch = probe.offsetHeight || 20;
    document.body.removeChild(probe);
    var COLS  = Math.max(80,  Math.floor(terminal.clientWidth  / cw));
    var LINES = Math.max(24,  Math.floor(terminal.clientHeight / ch));

    var overlay = document.createElement('div');
    overlay.id = 'sl-overlay';
    var pre = document.createElement('pre');
    pre.id = 'sl-pre';
    overlay.appendChild(pre);
    document.body.appendChild(overlay);

    var pid = nextPid++;
    var proc = { pid: pid, command: 'sl' + (args.length ? ' ' + args.join(' ') : ''),
      startTime: new Date(), status: 'running', windowEl: overlay, intervalId: null, jobId: null };
    processes[pid] = proc;
    foregroundPid = pid;
    disableTerminalInput();

    var D51_BODY = [
      "      ====        ________                ___________ ",
      "  _D _|  |_______/        \\__I_I_____===__|_________| ",
      "   |(_)---  |   H\\________/ |   |        =|___ ___|   ",
      "   /     |  |   H  |  |     |   |         ||_| |_||   ",
      "  |      |  |   H  |__--------------------| [___] |   ",
      "  | ________|___H__/__|_____/[][]~\\_______|       |   ",
      "  |/ |   |-----------I_____I [][] []  D   |=======|__ "
    ];
    var D51_WHL = [
      ["__/ =| o |=-~~\\  /~~\\  /~~\\  /~~\\ ____Y___________|__ ",
       " |/-=|___|=    ||    ||    ||    |_____/~\\___/        ",
       "  \\_/      \\O=====O=====O=====O_/      \\_/            "],
      ["__/ =| o |=-~~\\  /~~\\  /~~\\  /~~\\ ____Y___________|__ ",
       " |/-=|___|=O=====O=====O=====O   |_____/~\\___/        ",
       "  \\_/      \\__/  \\__/  \\__/  \\__/      \\_/            "],
      ["__/ =| o |=-O=====O=====O=====O \\ ____Y___________|__ ",
       " |/-=|___|=    ||    ||    ||    |_____/~\\___/        ",
       "  \\_/      \\__/  \\__/  \\__/  \\__/      \\_/            "],
      ["__/ =| o |=-~O=====O=====O=====O\\ ____Y___________|__ ",
       " |/-=|___|=    ||    ||    ||    |_____/~\\___/        ",
       "  \\_/      \\__/  \\__/  \\__/  \\__/      \\_/            "],
      ["__/ =| o |=-~~\\  /~~\\  /~~\\  /~~\\ ____Y___________|__ ",
       " |/-=|___|=   O=====O=====O=====O|_____/~\\___/        ",
       "  \\_/      \\__/  \\__/  \\__/  \\__/      \\_/            "],
      ["__/ =| o |=-~~\\  /~~\\  /~~\\  /~~\\ ____Y___________|__ ",
       " |/-=|___|=    ||    ||    ||    |_____/~\\___/        ",
       "  \\_/      \\_O=====O=====O=====O/      \\_/            "]
    ];
    var D51_COAL = [
      "                              ","                              ",
      "    _________________         ","   _|                \\_____A  ",
      " =|                        |  "," -|                        |  ",
      "__|________________________|_ ","|__________________________|_ ",
      "   |_D__D__D_|  |_D__D__D_|   ","    \\_/   \\_/    \\_/   \\_/    ",
      "                              "
    ];
    var C51_BODY = [
      "        ___                                            ",
      "       _|_|_  _     __       __             ___________",
      "    D__/   \\_(_)___|  |__H__|  |_____I_Ii_()|_________|",
      "     | `---'   |:: `--'  H  `--'         |  |___ ___|  ",
      "    +|~~~~~~~~++::~~~~~~~H~~+=====+~~~~~~|~~||_| |_||  ",
      "    ||        | ::       H  +=====+      |  |::  ...|  ",
      "|    | _______|_::-----------------[][]-----|       |  "
    ];
    var C51_WHL = [
      ["| /~~ ||   |-----/~~~~\\  /[I_____I][][] --|||_______|__",
       "------'|oOo|=[]=-      ||      ||      |  ||=======_|__",
       "/~\\____|___|/~\\_|  O=======O=======O   |__|+-/~\\_|     ",
       "\\_/         \\_/  \\____/  \\____/  \\____/      \\_/       "],
      ["| /~~ ||   |-----/~~~~\\  /[I_____I][][] --|||_______|__",
       "------'|oOo|=[]=- O=======O=======O    |  ||=======_|__",
       "/~\\____|___|/~\\_|      ||      ||      |__|+-/~\\_|     ",
       "\\_/         \\_/  \\____/  \\____/  \\____/      \\_/       "],
      ["| /~~ ||   |-----/~~~~\\  /[I_____I][][] --|||_______|__",
       "------'|oOo|==[]=- O=======O=======O   |  ||=======_|__",
       "/~\\____|___|/~\\_|      ||      ||      |__|+-/~\\_|     ",
       "\\_/         \\_/  \\____/  \\____/  \\____/      \\_/       "],
      ["| /~~ ||   |-----/~~~~\\  /[I_____I][][] --|||_______|__",
       "------'|oOo|===[]=- O=======O=======O  |  ||=======_|__",
       "/~\\____|___|/~\\_|      ||      ||      |__|+-/~\\_|     ",
       "\\_/         \\_/  \\____/  \\____/  \\____/      \\_/       "],
      ["| /~~ ||   |-----/~~~~\\  /[I_____I][][] --|||_______|__",
       "------'|oOo|===[]=-    ||      ||      |  ||=======_|__",
       "/~\\____|___|/~\\_|    O=======O=======O |__|+-/~\\_|     ",
       "\\_/         \\_/  \\____/  \\____/  \\____/      \\_/       "],
      ["| /~~ ||   |-----/~~~~\\  /[I_____I][][] --|||_______|__",
       "------'|oOo|==[]=-     ||      ||      |  ||=======_|__",
       "/~\\____|___|/~\\_|   O=======O=======O  |__|+-/~\\_|     ",
       "\\_/         \\_/  \\____/  \\____/  \\____/      \\_/       "]
    ];
    var C51_COAL = [
      "                              ","                              ","                              ",
      "    _________________         ","   _|                \\_____A  ",
      " =|                        |  "," -|                        |  ",
      "__|________________________|_ ","|__________________________|_ ",
      "   |_D__D__D_|  |_D__D__D_|   ","    \\_/   \\_/    \\_/   \\_/    ",
      "                              "
    ];
    var LOGO_BODY = [
      "     ++      +------ ","     ||      |+-+ |  ",
      "   /---------|| | |  ","  + ========  +-+ |  "
    ];
    var LOGO_WHL = [
      [" _|--O========O~\\-+  ", "//// \\_/      \\_/    "],
      [" _|--/O========O\\-+  ", "//// \\_/      \\_/    "],
      [" _|--/~O========O-+  ", "//// \\_/      \\_/    "],
      [" _|--/~\\------/~\\-+  ", "//// \\_O========O    "],
      [" _|--/~\\------/~\\-+  ", "//// \\O========O/    "],
      [" _|--/~\\------/~\\-+  ", "//// O========O_/    "]
    ];
    var LOGO_COAL = [
      "____                 ","|   \\@@@@@@@@@@@     ",
      "|    \\@@@@@@@@@@@@@_ ","|                  | ",
      "|__________________| ","   (O)       (O)     ",
      "                     "
    ];
    var LOGO_CAR = [
      "____________________ ","|  ___ ___ ___ ___ | ",
      "|  |_| |_| |_| |_| | ","|__________________| ",
      "|__________________| ","   (O)        (O)    ",
      "                     "
    ];
    var SMOKEPTNS = 16;
    var SmokeChars = [
      ["(   )","(    )","(    )","(   )","(  )","(  )","( )","( )","()","()","O","O","O","O","O"," "],
      ["(@@@)","(@@@@)","(@@@@)","(@@@)","(@@)","(@@)","(@)","(@)","@@","@@","@","@","@","@","@"," "]
    ];
    var smoke_dy = [2,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0];
    var smoke_dx = [-2,-1,0,1,1,1,1,1,2,2,2,2,2,3,3,3];
    var smokeP = [];

    function makeGrid() {
      var g = [], r, c, row;
      for (r = 0; r < LINES; r++) {
        row = [];
        for (c = 0; c < COLS; c++) row.push(' ');
        g.push(row);
      }
      return g;
    }
    function pStr(g, row, col, str) {
      if (row < 0 || row >= LINES) return;
      for (var i = 0; i < str.length; i++) {
        var c = col + i;
        if (c >= 0 && c < COLS) g[row][c] = str[i];
      }
    }
    function pMan(g, row, col) {
      var f = (Math.floor((84 + col) / 12) % 2 + 2) % 2;
      pStr(g, row,     col, f === 0 ? "" : "Help!");
      pStr(g, row + 1, col, f === 0 ? "(O)" : "\\O/");
    }

    var x = COLS - 1;
    var escapeHandler = null;

    function cleanup() {
      clearInterval(proc.intervalId);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      if (escapeHandler) document.removeEventListener('keydown', escapeHandler);
      foregroundPid = null;
      proc.status = 'done';
      delete processes[pid];
      enableTerminalInput();
      updatePrompt();
      scrollToBottom();
      if (proc.onExit) proc.onExit();
    }

    function tick() {
      var tLen = logo ? 84 : c51mode ? 87 : 83;
      if (x < -tLen) { cleanup(); return; }

      var g = makeGrid();
      var i, y, fi, dfly = 0, sy, sx;

      if (logo) {
        fi = (((Math.floor((84 + x) / 3)) % 6) + 6) % 6;
        y  = fly ? (Math.floor(x/6) + LINES - Math.floor(COLS/6) - 6) : (Math.floor(LINES/2) - 3);
        var py1 = fly?2:0, py2 = fly?4:0, py3 = fly?6:0;
        var lRows = LOGO_BODY.concat(LOGO_WHL[fi]).concat(["                     "]);
        for (i = 0; i <= 6; i++) {
          pStr(g, y+i,      x,    lRows[i]);
          pStr(g, y+i+py1,  x+21, LOGO_COAL[i]);
          pStr(g, y+i+py2,  x+42, LOGO_CAR[i]);
          pStr(g, y+i+py3,  x+63, LOGO_CAR[i]);
        }
        if (accident) {
          pMan(g, y+1,      x+14);
          pMan(g, y+1+py2,  x+45); pMan(g, y+1+py2, x+53);
          pMan(g, y+1+py3,  x+66); pMan(g, y+1+py3, x+74);
        }
        sy = y-1; sx = x+4;
      } else if (c51mode) {
        fi   = ((87 + x) % 6 + 6) % 6;
        y    = fly ? (Math.floor(x/7) + LINES - Math.floor(COLS/7) - 11) : (Math.floor(LINES/2) - 5);
        dfly = fly ? 1 : 0;
        var cRows = C51_BODY.concat(C51_WHL[fi]).concat(["                                                       "]);
        for (i = 0; i <= 11; i++) {
          pStr(g, y+i,       x,    cRows[i]);
          pStr(g, y+i+dfly,  x+55, C51_COAL[i]);
        }
        if (accident) { pMan(g, y+3, x+45); pMan(g, y+3, x+49); }
        sy = y-1; sx = x+7;
      } else {
        fi   = ((83 + x) % 6 + 6) % 6;
        y    = fly ? (Math.floor(x/7) + LINES - Math.floor(COLS/7) - 10) : (Math.floor(LINES/2) - 5);
        dfly = fly ? 1 : 0;
        var dRows = D51_BODY.concat(D51_WHL[fi]).concat(["                                                      "]);
        for (i = 0; i <= 10; i++) {
          pStr(g, y+i,       x,    dRows[i]);
          pStr(g, y+i+dfly,  x+53, D51_COAL[i]);
        }
        if (accident) { pMan(g, y+2, x+43); pMan(g, y+2, x+47); }
        sy = y-1; sx = x+7;
      }

      // smoke: advance state every 4 steps, paint every frame
      if (x % 4 === 0) {
        for (var j = 0; j < smokeP.length; j++) {
          var p = smokeP[j];
          p.y -= smoke_dy[p.ptrn];
          p.x += smoke_dx[p.ptrn];
          if (p.ptrn < SMOKEPTNS - 1) p.ptrn++;
        }
        smokeP.push({y: sy, x: sx, ptrn: 0, kind: smokeP.length % 2});
      }
      for (var k = 0; k < smokeP.length; k++) {
        pStr(g, smokeP[k].y, smokeP[k].x, SmokeChars[smokeP[k].kind][smokeP[k].ptrn]);
      }

      pre.textContent = g.map(function(row) { return row.join(''); }).join('\n');
      x--;
    }

    proc.intervalId = setInterval(tick, 40);

    if (escapeOk) {
      escapeHandler = function(e) {
        if (e.key === 'c' && e.ctrlKey) {
          e.preventDefault();
          cleanup();
          addLine('^C');
          scrollToBottom();
        }
      };
      document.addEventListener('keydown', escapeHandler);
    }
    return proc;
  }

