  // ── Emulated network ─────────────────────────────────────────────────────
  // No real packets leave the browser; this models one self-consistent host
  // (matching the login banner and /etc/resolv.conf) plus a handful of
  // reachable peers, shared by ssh and the networking applets.
  var NET = {
    ip: '192.168.1.42', mask: '255.255.255.0', cidr: 24, bcast: '192.168.1.255',
    gw: '192.168.1.1', dns: '192.168.1.1', mac: '52:54:00:9d:3a:7c',
    iface: 'eth0', rxb: 0, txb: 0
  };
  // hostname -> {ip, ssh:{...}} ; ssh present means an sshd is listening.
  var HOSTS = {
    'localhost':          { ip: '127.0.0.1',    ssh: { host: 'securit', auth: 'key', loopback: true } },
    '127.0.0.1':          { ip: '127.0.0.1',    ssh: { host: 'securit', auth: 'key', loopback: true } },
    'securit':            { ip: '192.168.1.42', ssh: { host: 'securit', auth: 'key', loopback: true } },
    'securit.se':         { ip: '192.168.1.42', ssh: { host: 'securit', auth: 'key', loopback: true } },
    'lab':                { ip: '192.168.1.50', ssh: { host: 'lab',     auth: 'key',
                              motd: ['  _        _     ', ' | |  __ _| |__  ', ' | | / _` | \'_ \\ ', ' | || (_| | |_) |', ' |_(_)__,_|_.__/ ', '',
                                     'lab.securit.se — scratch box. Same disk as securit (shared home).', ''] } },
    'lab.securit.se':     { ip: '192.168.1.50', alias: 'lab' },
    'rainbow':            { ip: '10.20.30.7',   ssh: { host: 'rainbow', auth: 'password', password: 'rainbow',
                              banner: ['+------------------------------------------------+',
                                       '|  rainbow.securit.se  —  public demo shell      |',
                                       '|  This is a courtesy account. Password: rainbow |',
                                       '+------------------------------------------------+'],
                              motd: ['Welcome to Rainbow 🌈  (demo). Be nice; the disk is shared.', ''] } },
    'rainbow.securit.se': { ip: '10.20.30.7',   alias: 'rainbow' },
    'router':             { ip: '192.168.1.1' },
    'gateway':            { ip: '192.168.1.1' }
  };
  function resolveHost(name) {
    var h = HOSTS[name.toLowerCase()];
    if (h && h.alias) h = HOSTS[h.alias];
    return h || null;
  }
  function isIP(s) { return /^\d{1,3}(\.\d{1,3}){3}$/.test(s); }

  // Stable pseudo-random bytes from a seed string (no real crypto needed).
  function seededBytes(seed, n) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    var out = [];
    for (var j = 0; j < n; j++) { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; h >>>= 0; out.push(h & 0xff); }
    return out;
  }
  function b64(bytes) {
    var CH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/', s = '';
    for (var i = 0; i < bytes.length; i += 3) {
      var n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
      s += CH[(n >> 18) & 63] + CH[(n >> 12) & 63];
      s += i + 1 < bytes.length ? CH[(n >> 6) & 63] : '';
      s += i + 2 < bytes.length ? CH[n & 63] : '';
    }
    return s;
  }
  function hostKeyBlob(host) { return 'AAAAC3NzaC1lZDI1NTE5AAAAI' + b64(seededBytes('key:' + host, 32)); }
  function hostFingerprint(host) { return 'SHA256:' + b64(seededBytes('fp:' + host, 32)).slice(0, 43); }

  function ensureDir(path) {
    if (fs[path]) return;
    var parent = parentOf(path);
    ensureDir(parent);
    if (!fs[path]) mkdirNode(path);
  }
  function knownHostsPath() { return HOME + '/.ssh/known_hosts'; }
  function knownHostHas(host) {
    var e = fs[knownHostsPath()];
    if (!e) return false;
    return e.content.split('\n').some(function(l) { return l.split(' ')[0] === host; });
  }
  function addKnownHost(host) {
    ensureDir(HOME + '/.ssh');
    if (fs[HOME + '/.ssh']) { fs[HOME + '/.ssh'].mode = 'drwx------'; markDirty(HOME + '/.ssh'); }
    var line = host + ' ssh-ed25519 ' + hostKeyBlob(host) + '\n';
    writeFile(knownHostsPath(), line, { append: true });
  }

  function parseSshArgs(args) {
    var o = { user: null, host: null, port: 22, verbose: 0, ident: null, cmd: [], want: false, opts: [] };
    for (var i = 0; i < args.length; i++) {
      var a = args[i];
      if (o.host) { o.cmd.push(a); continue; }
      if (a === '-v') { o.verbose++; continue; }
      if (a === '-vv' || a === '-vvv') { o.verbose += a.length - 1; continue; }
      if (a === '-p') { o.port = parseInt(args[++i], 10) || 22; continue; }
      if (a.slice(0, 2) === '-p' && a.length > 2) { o.port = parseInt(a.slice(2), 10) || 22; continue; }
      if (a === '-l') { o.user = args[++i]; continue; }
      if (a === '-i') { o.ident = args[++i]; continue; }
      if (a === '-o' || a === '-c' || a === '-b' || a === '-F') { i++; continue; }
      if (a === '-T' || a === '-t' || a === '-q' || a === '-N' || a === '-x' || a === '-A' || a === '-C' || a === '-4' || a === '-6') continue;
      if (a.charAt(0) === '-' && a.length > 1) continue;   // ignore unknown flags
      // first operand: [user@]host
      var at = a.indexOf('@');
      if (at >= 0) { o.user = a.slice(0, at); o.host = a.slice(at + 1); }
      else o.host = a;
    }
    if (o.host && !o.user) o.user = curUser();
    return o;
  }

  function sshVerbose(o, target, out) {
    if (!o.verbose) return;
    out('OpenSSH_9.7p1, OpenSSL 3.0.13 30 Jan 2024');
    out('debug1: Connecting to ' + o.host + ' [' + target.ip + '] port ' + o.port + '.');
    out('debug1: Connection established.');
    out('debug1: Local version string SSH-2.0-OpenSSH_9.7p1');
    out('debug1: Remote protocol version 2.0, remote software version OpenSSH_9.7p1');
    out('debug1: SSH2_MSG_KEXINIT sent');
    out('debug1: SSH2_MSG_KEXINIT received');
    out('debug1: kex: algorithm: curve25519-sha256');
    out('debug1: kex: host key algorithm: ssh-ed25519');
    out('debug1: Server host key: ssh-ed25519 ' + hostFingerprint(target.ssh.host));
    out('debug1: Host \'' + o.host + '\' is known and matches the ED25519 host key.');
    out('debug1: SSH2_MSG_NEWKEYS sent');
    out('debug1: SSH2_MSG_NEWKEYS received');
  }

