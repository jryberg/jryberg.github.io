  // ── Applets: filesystem ──────────────────────────────────────────────────
  function parseFlags(args, known) {
    var flags = {}, operands = [], bad = null, noMore = false;
    for (var i = 0; i < args.length; i++) {
      var a = args[i];
      if (!noMore && a === '--') { noMore = true; continue; }
      if (!noMore && a.length > 2 && a.slice(0, 2) === '--') continue;   // ignore long opts
      if (!noMore && a.charAt(0) === '-' && a.length > 1 && a.charAt(1) !== '-') {
        for (var j = 1; j < a.length; j++) {
          if (known.indexOf(a.charAt(j)) >= 0) flags[a.charAt(j)] = true;
          else if (!bad) bad = a.charAt(j);
        }
      } else operands.push(a);
    }
    return { flags: flags, operands: operands, bad: bad };
  }
  function joinPath(dir, name) { return (dir === '/' ? '' : dir) + '/' + name; }
  function entrySize(e) {
    if (e.size) return e.size;
    if (e.type === 'dir') return 4096;
    return (e.content || '').length;
  }
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function lsTime(ms) {
    var d = new Date(ms || BASE_MTIME);
    var day = String(d.getDate()).padStart(2, ' ');
    if (Math.abs(Date.now() - d.getTime()) > 15552000000) {
      return MONTHS[d.getMonth()] + ' ' + day + '  ' + d.getFullYear();
    }
    return MONTHS[d.getMonth()] + ' ' + day + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function lsName(name, e, tty) {
    if (!tty || !e) return name;
    if (e.type === 'dir') return '\x1b[1;34m' + name + '\x1b[0m';
    if ((e.mode || '').charAt(0) === 'l') return '\x1b[1;36m' + name + '\x1b[0m';
    if (e.executable) return '\x1b[1;32m' + name + '\x1b[0m';
    return name;
  }
  function longLine(name, e, tty) {
    return (e.mode || (e.type === 'dir' ? 'drwxr-xr-x' : '-rw-r--r--')) +
      ' ' + String(e.type === 'dir' ? 2 : 1).padStart(4) +
      ' ' + (e.owner || 'root').padEnd(8) + ' ' + (e.group || 'root').padEnd(8) +
      ' ' + String(entrySize(e)).padStart(9) + ' ' + lsTime(e.mtime) + ' ' + lsName(name, e, tty) +
      (e.linkTo ? ' -> ' + e.linkTo : '');
  }
  function childOf(path, name, e) {
    if (name === '.') return e;
    if (name === '..') return fs[parentOf(path)] || e;
    return fs[joinPath(path, name)];
  }

  function copyNode(ctx, sp, dp, rec, srcArg) {
    var se = fs[sp];
    if (!se) { ctx.error("can't stat '" + srcArg + "': No such file or directory"); return 1; }
    if (!canRead(sp)) { ctx.error("can't open '" + srcArg + "': Permission denied"); return 1; }
    var de = fs[dp];
    if (de && de.type === 'dir' && se.type !== 'dir') { dp = joinPath(dp, baseName(sp)); de = fs[dp]; }
    if (sp === dp) { ctx.error("'" + srcArg + "' and '" + dp + "' are the same file"); return 1; }
    if (se.type === 'dir') {
      if (!rec) { ctx.error("-r not specified; omitting directory '" + srcArg + "'"); return 1; }
      if (dp === sp || dp.indexOf(sp + '/') === 0) { ctx.error("can't copy a directory into itself"); return 1; }
      if (de && de.type === 'dir') dp = joinPath(dp, baseName(sp));
      if (!fs[dp]) {
        var mr = mkdirNode(dp);
        if (mr.error) { ctx.error("can't create directory '" + dp + "': " + mr.error); return 1; }
      }
      var code = 0;
      var kids = se.children.slice();
      for (var i = 0; i < kids.length; i++) {
        if (copyNode(ctx, joinPath(sp, kids[i]), joinPath(dp, kids[i]), rec, joinPath(srcArg, kids[i]))) code = 1;
      }
      return code;
    }
    var rr = readFile(sp);
    if (rr.error) { ctx.error("can't open '" + srcArg + "': " + rr.error); return 1; }
    var w = writeFile(dp, rr.content);
    if (w.error) { ctx.error("can't create '" + dp + "': " + w.error); return 1; }
    if (se.executable && fs[dp]) {
      fs[dp].executable = true;
      fs[dp].mode = '-rwxr-xr-x';
      markDirty(dp);
      persistFS();
    }
    return 0;
  }

  function moveNode(ctx, sp, dp, srcArg) {
    var se = fs[sp];
    if (!se) { ctx.error("can't rename '" + srcArg + "': No such file or directory"); return 1; }
    if (!canWritePath(sp)) { ctx.error("can't rename '" + srcArg + "': Permission denied"); return 1; }
    var de = fs[dp];
    if (de && de.type === 'dir') { dp = joinPath(dp, baseName(sp)); de = fs[dp]; }
    if (sp === dp) return 0;
    if (!canWritePath(dp)) { ctx.error("can't move to '" + dp + "': Permission denied"); return 1; }
    if (dp.indexOf(sp + '/') === 0) { ctx.error("can't move '" + srcArg + "' into itself"); return 1; }
    var pp = parentOf(dp);
    if (!fs[pp] || fs[pp].type !== 'dir') { ctx.error("can't rename '" + srcArg + "': No such file or directory"); return 1; }
    if (de) {
      var rmr = removeNode(dp);
      if (rmr.error) { ctx.error("can't overwrite '" + dp + "': " + rmr.error); return 1; }
    }
    var keys = Object.keys(fs).filter(function(p) { return p === sp || p.indexOf(sp + '/') === 0; });
    keys.forEach(function(p) {
      var np = dp + p.slice(sp.length);
      fs[np] = fs[p];
      markDirty(np);
    });
    keys.forEach(function(p) { delete fs[p]; overlay[p] = null; });
    var spp = parentOf(sp);
    if (fs[spp] && fs[spp].children) {
      var ix = fs[spp].children.indexOf(baseName(sp));
      if (ix >= 0) fs[spp].children.splice(ix, 1);
      markDirty(spp);
    }
    if (fs[pp].children.indexOf(baseName(dp)) < 0) fs[pp].children.push(baseName(dp));
    markDirty(pp);
    persistFS();
    return 0;
  }

  function applyChmod(e, spec) {
    var m = e.mode || (e.type === 'dir' ? 'drwxr-xr-x' : '-rw-r--r--');
    var t = m.charAt(0);
    var bits = [];
    for (var i = 0; i < 9; i++) bits.push(m.charAt(1 + i) !== '-');
    if (/^[0-7]{3,4}$/.test(spec)) {
      var s = spec.slice(-3);
      for (var c = 0; c < 3; c++) {
        var v = parseInt(s.charAt(c), 8);
        bits[c * 3] = !!(v & 4); bits[c * 3 + 1] = !!(v & 2); bits[c * 3 + 2] = !!(v & 1);
      }
    } else {
      var mm = /^([ugoa]*)([+=-])([rwx]+)$/.exec(spec);
      if (!mm) return false;
      var classes = [];
      var who = mm[1] || 'a';
      if (who.indexOf('a') >= 0 || who === '') classes = [0, 1, 2];
      else {
        if (who.indexOf('u') >= 0) classes.push(0);
        if (who.indexOf('g') >= 0) classes.push(1);
        if (who.indexOf('o') >= 0) classes.push(2);
      }
      var idx = { r: 0, w: 1, x: 2 };
      classes.forEach(function(cl) {
        if (mm[2] === '=') { bits[cl * 3] = bits[cl * 3 + 1] = bits[cl * 3 + 2] = false; }
        for (var k = 0; k < mm[3].length; k++) {
          bits[cl * 3 + idx[mm[3].charAt(k)]] = mm[2] !== '-';
        }
      });
    }
    var rwx = 'rwxrwxrwx';
    var out = t;
    for (var b = 0; b < 9; b++) out += bits[b] ? rwx.charAt(b) : '-';
    e.mode = out;
    if (e.type === 'file') e.executable = bits[2] || bits[5] || bits[8];
    return true;
  }

  defineApplets({
    ls: function(ctx) {
      var p = parseFlags(ctx.args, 'la1dhrtRF');
      if (p.bad) { ctx.error("invalid option -- '" + p.bad + "'"); return 1; }
      var f = p.flags;
      var targets = p.operands.length ? p.operands : ['.'];
      var code = 0, printed = 0;
      for (var t = 0; t < targets.length; t++) {
        var path = normPath(targets[t]);
        var e = fs[path];
        if (!e) { ctx.error(targets[t] + ': No such file or directory'); code = 1; continue; }
        if (e.type === 'dir' && !f.d && !canRead(path)) { ctx.error("can't open '" + targets[t] + "': Permission denied"); code = 1; continue; }
        if (targets.length > 1 && e.type === 'dir' && !f.d) ctx.println((printed++ ? '\n' : '') + targets[t] + ':');
        if (e.type !== 'dir' || f.d) {
          ctx.println(f.l ? longLine(targets[t], e, ctx.tty) : lsName(targets[t], e, ctx.tty));
          continue;
        }
        var names = e.children.slice().sort();
        if (f.a) names = ['.', '..'].concat(names);
        else names = names.filter(function(n) { return n.charAt(0) !== '.'; });
        if (f.t) names.sort(function(a, b) {
          return ((childOf(path, b, e) || {}).mtime || 0) - ((childOf(path, a, e) || {}).mtime || 0);
        });
        if (f.r) names.reverse();
        if (f.l) {
          var total = 0;
          names.forEach(function(n) {
            var ce = childOf(path, n, e);
            if (ce) total += ce.type === 'dir' ? 4 : Math.max(0, Math.ceil(entrySize(ce) / 1024)) * 4;
          });
          ctx.println('total ' + total);
          names.forEach(function(n) {
            var ce = childOf(path, n, e);
            if (ce) ctx.println(longLine(n, ce, ctx.tty));
          });
        } else if (f['1'] || !ctx.tty) {
          names.forEach(function(n) { ctx.println(lsName(n, childOf(path, n, e), ctx.tty)); });
        } else if (names.length) {
          ctx.println(names.map(function(n) { return lsName(n, childOf(path, n, e), ctx.tty); }).join('  '));
        }
      }
      return code;
    },
    cat: function(ctx) {
      var p = parseFlags(ctx.args, 'n');
      var files = p.operands.length ? p.operands : ['-'];
      var text = '', code = 0;
      for (var i = 0; i < files.length; i++) {
        if (files[i] === '-') { text += ctx.stdin; continue; }
        var r = readFile(normPath(files[i]));
        if (r.error) { ctx.error(files[i] + ': ' + r.error); code = 1; continue; }
        text += r.content;
      }
      if (p.flags.n) {
        var ln = text.split('\n');
        if (ln[ln.length - 1] === '') ln.pop();
        text = ln.map(function(l, i) { return String(i + 1).padStart(6) + '  ' + l; }).join('\n') + (ln.length ? '\n' : '');
      }
      ctx.out(text);
      return code;
    },
    cp: function(ctx) {
      var p = parseFlags(ctx.args, 'rRafpv');
      var ops = p.operands;
      if (ops.length < 2) { ctx.error('missing operand'); return 1; }
      var rec = p.flags.r || p.flags.R || p.flags.a;
      var dst = normPath(ops[ops.length - 1]);
      var srcs = ops.slice(0, -1);
      if (srcs.length > 1 && (!fs[dst] || fs[dst].type !== 'dir')) { ctx.error("'" + ops[ops.length - 1] + "' is not a directory"); return 1; }
      var code = 0;
      for (var i = 0; i < srcs.length; i++) {
        if (copyNode(ctx, normPath(srcs[i]), dst, rec, srcs[i])) code = 1;
      }
      return code;
    },
    mv: function(ctx) {
      var p = parseFlags(ctx.args, 'fv');
      var ops = p.operands;
      if (ops.length < 2) { ctx.error('missing operand'); return 1; }
      var dst = normPath(ops[ops.length - 1]);
      var srcs = ops.slice(0, -1);
      if (srcs.length > 1 && (!fs[dst] || fs[dst].type !== 'dir')) { ctx.error("'" + ops[ops.length - 1] + "' is not a directory"); return 1; }
      var code = 0;
      for (var i = 0; i < srcs.length; i++) {
        if (moveNode(ctx, normPath(srcs[i]), dst, srcs[i])) code = 1;
      }
      return code;
    },
    rm: function(ctx) {
      var p = parseFlags(ctx.args, 'rRfiv');
      if (!p.operands.length) { if (!p.flags.f) ctx.error('missing operand'); return p.flags.f ? 0 : 1; }
      var rec = p.flags.r || p.flags.R;
      var code = 0;
      for (var i = 0; i < p.operands.length; i++) {
        var path = normPath(p.operands[i]);
        var e = fs[path];
        if (!e) { if (!p.flags.f) { ctx.error("can't remove '" + p.operands[i] + "': No such file or directory"); code = 1; } continue; }
        if (e.type === 'dir' && !rec) { ctx.error("'" + p.operands[i] + "' is a directory"); code = 1; continue; }
        if (path === '/' || path === HOME) { ctx.error("can't remove '" + p.operands[i] + "': Operation not permitted"); code = 1; continue; }
        var r = removeNode(path);
        if (r.error) { ctx.error("can't remove '" + p.operands[i] + "': " + r.error); code = 1; }
      }
      return code;
    },
    mkdir: function(ctx) {
      var p = parseFlags(ctx.args, 'pv');
      if (!p.operands.length) { ctx.error('missing operand'); return 1; }
      var code = 0;
      for (var i = 0; i < p.operands.length; i++) {
        var path = normPath(p.operands[i]);
        if (p.flags.p) {
          var parts = path.split('/').filter(Boolean);
          var cur = '';
          var ok = true;
          for (var j = 0; j < parts.length; j++) {
            cur += '/' + parts[j];
            if (fs[cur] && fs[cur].type === 'dir') continue;
            var r1 = mkdirNode(cur);
            if (r1.error) { ctx.error("can't create directory '" + p.operands[i] + "': " + r1.error); code = 1; ok = false; break; }
          }
          if (!ok) continue;
        } else {
          var r2 = mkdirNode(path);
          if (r2.error) { ctx.error("can't create directory '" + p.operands[i] + "': " + r2.error); code = 1; }
        }
      }
      return code;
    },
    rmdir: function(ctx) {
      if (!ctx.args.length) { ctx.error('missing operand'); return 1; }
      var code = 0;
      for (var i = 0; i < ctx.args.length; i++) {
        var path = normPath(ctx.args[i]);
        var e = fs[path];
        if (!e || e.type !== 'dir') { ctx.error("'" + ctx.args[i] + "': " + (e ? 'Not a directory' : 'No such file or directory')); code = 1; continue; }
        if (e.children.length) { ctx.error("'" + ctx.args[i] + "': Directory not empty"); code = 1; continue; }
        var r = removeNode(path);
        if (r.error) { ctx.error("'" + ctx.args[i] + "': " + r.error); code = 1; }
      }
      return code;
    },
    touch: function(ctx) {
      var p = parseFlags(ctx.args, 'c');
      if (!p.operands.length) { ctx.error('missing operand'); return 1; }
      var code = 0;
      for (var i = 0; i < p.operands.length; i++) {
        var path = normPath(p.operands[i]);
        var e = fs[path];
        if (e) {
          if (!canWritePath(path)) { ctx.error("can't touch '" + p.operands[i] + "': Permission denied"); code = 1; continue; }
          e.mtime = Date.now();
          markDirty(path);
          persistFS();
        } else if (!p.flags.c) {
          var r = writeFile(path, '');
          if (r.error) { ctx.error("can't touch '" + p.operands[i] + "': " + r.error); code = 1; }
        }
      }
      return code;
    },
    chmod: function(ctx) {
      var p = parseFlags(ctx.args, 'R');
      if (p.operands.length < 2) { ctx.error('missing operand'); return 1; }
      var spec = p.operands[0];
      var code = 0;
      for (var i = 1; i < p.operands.length; i++) {
        var path = normPath(p.operands[i]);
        var e = fs[path];
        if (!e) { ctx.error(p.operands[i] + ': No such file or directory'); code = 1; continue; }
        if (!canWritePath(path)) { ctx.error(p.operands[i] + ': Operation not permitted'); code = 1; continue; }
        if (!applyChmod(e, spec)) { ctx.error('invalid mode: ' + spec); return 1; }
        markDirty(path);
        persistFS();
      }
      return code;
    },
    stat: function(ctx) {
      if (!ctx.args.length) { ctx.error('missing operand'); return 1; }
      var code = 0;
      for (var i = 0; i < ctx.args.length; i++) {
        var path = normPath(ctx.args[i]);
        var e = fs[path];
        if (!e) { ctx.error("can't stat '" + ctx.args[i] + "': No such file or directory"); code = 1; continue; }
        var kind = e.type === 'dir' ? 'directory' : (e.dev ? 'character special file' : 'regular file');
        var uid = e.owner === 'guest' ? 1000 : 0;
        ctx.println('  File: ' + ctx.args[i]);
        ctx.println('  Size: ' + String(entrySize(e)).padEnd(10) + ' Blocks: ' + (e.type === 'dir' ? 8 : Math.ceil(entrySize(e) / 512)).toString().padEnd(10) + ' IO Block: 4096   ' + kind);
        ctx.println('Device: fe01h/65025d\tInode: ' + (100000 + (path.length * 977) % 899999) + '\tLinks: ' + (e.type === 'dir' ? 2 : 1));
        ctx.println('Access: (' + modeOctal(e) + '/' + (e.mode || '-rw-r--r--') + ')  Uid: (' + String(uid).padStart(5) + '/' + (e.owner || 'root').padStart(8) + ')   Gid: (' + String(uid).padStart(5) + '/' + (e.group || 'root').padStart(8) + ')');
        ctx.println('Modify: ' + new Date(e.mtime || BASE_MTIME).toISOString().replace('T', ' ').replace(/\..*/, '.000000000 +0000'));
      }
      return code;
    },
    find: function(ctx) {
      var roots = [];
      var namePat = null, typeF = null, maxDepth = Infinity;
      for (var i = 0; i < ctx.args.length; i++) {
        var a = ctx.args[i];
        if (a === '-name') { namePat = ctx.args[++i]; }
        else if (a === '-type') { typeF = ctx.args[++i]; }
        else if (a === '-maxdepth') { maxDepth = parseInt(ctx.args[++i], 10); }
        else if (a.charAt(0) === '-') { ctx.error(a + ': unknown option'); return 1; }
        else roots.push(a);
      }
      if (!roots.length) roots = ['.'];
      var re = namePat ? globToRegExp(namePat) : null;
      var code = 0;
      function walk(disp, path, depth) {
        var e = fs[path];
        if (!e) { ctx.error(disp + ': No such file or directory'); code = 1; return; }
        var match = (!re || re.test(baseName(path))) &&
          (!typeF || (typeF === 'd') === (e.type === 'dir'));
        if (match) ctx.println(disp);
        if (e.type === 'dir' && depth < maxDepth) {
          if (!canRead(path)) { ctx.error(disp + ': Permission denied'); code = 1; return; }
          e.children.slice().sort().forEach(function(n) {
            walk(disp === '/' ? '/' + n : disp + '/' + n, joinPath(path, n), depth + 1);
          });
        }
      }
      for (var r = 0; r < roots.length; r++) walk(roots[r], normPath(roots[r]), 0);
      return code;
    },
    du: function(ctx) {
      var p = parseFlags(ctx.args, 'sh');
      var targets = p.operands.length ? p.operands : ['.'];
      var code = 0;
      function sizeOf(path) {
        var e = fs[path];
        if (!e) return 0;
        if (e.type !== 'dir') return entrySize(e);
        var s = 4096;
        e.children.forEach(function(n) { s += sizeOf(joinPath(path, n)); });
        return s;
      }
      function fmt(bytes) {
        var kb = Math.max(4, Math.ceil(bytes / 1024) * 4);
        if (!p.flags.h) return String(kb);
        return kb >= 1024 ? (kb / 1024).toFixed(1) + 'M' : kb + 'K';
      }
      function report(disp, path, top) {
        var e = fs[path];
        if (!e) { ctx.error("can't open '" + disp + "': No such file or directory"); code = 1; return; }
        if (e.type === 'dir' && !p.flags.s && !top) { /* recurse below */ }
        if (e.type === 'dir' && !p.flags.s) {
          e.children.forEach(function(n) {
            if (fs[joinPath(path, n)] && fs[joinPath(path, n)].type === 'dir') report(disp + '/' + n, joinPath(path, n), false);
          });
        }
        ctx.println(fmt(sizeOf(path)) + '\t' + disp);
      }
      targets.forEach(function(t) { report(t, normPath(t), true); });
      return code;
    },
    df: function(ctx) {
      var p = parseFlags(ctx.args, 'h');
      var used = 128 + Math.ceil(JSON.stringify(overlay).length / 1024);
      var total = 5120;
      var avail = Math.max(0, total - used);
      var pct = Math.min(100, Math.round(used * 100 / total)) + '%';
      if (p.flags.h) {
        ctx.println('Filesystem                Size      Used Available Use% Mounted on');
        ctx.println('/dev/vda1                 5.0M' + String((used / 1024).toFixed(1) + 'M').padStart(10) + String((avail / 1024).toFixed(1) + 'M').padStart(10) + pct.padStart(5) + ' /');
        ctx.println('tmpfs                   983.1M         0    983.1M   0% /dev/shm');
      } else {
        ctx.println('Filesystem           1K-blocks      Used Available Use% Mounted on');
        ctx.println('/dev/vda1                 5120' + String(used).padStart(10) + String(avail).padStart(10) + pct.padStart(5) + ' /');
        ctx.println('tmpfs                  1006724         0   1006724   0% /dev/shm');
      }
      return 0;
    },
    tee: function(ctx) {
      var p = parseFlags(ctx.args, 'a');
      ctx.out(ctx.stdin);
      var code = 0;
      for (var i = 0; i < p.operands.length; i++) {
        var w = writeFile(normPath(p.operands[i]), ctx.stdin, { append: p.flags.a });
        if (w.error) { ctx.error(p.operands[i] + ': ' + w.error); code = 1; }
      }
      return code;
    },
    mktemp: function(ctx) {
      var p = parseFlags(ctx.args, 'd');
      var name = '/tmp/tmp.' + Math.random().toString(36).slice(2, 8);
      var r = p.flags.d ? mkdirNode(name) : writeFile(name, '');
      if (r.error) { ctx.error(r.error); return 1; }
      ctx.println(name);
      return 0;
    },
    realpath: function(ctx) {
      if (!ctx.args.length) { ctx.error('missing operand'); return 1; }
      for (var i = 0; i < ctx.args.length; i++) ctx.println(normPath(ctx.args[i]));
      return 0;
    },
    readlink: function(ctx) {
      var p = parseFlags(ctx.args, 'f');
      if (!p.operands.length) { ctx.error('missing operand'); return 1; }
      var e = fs[normPath(p.operands[0])];
      if (e && e.linkTo) { ctx.println(e.linkTo); return 0; }
      if (p.flags.f && e) { ctx.println(normPath(p.operands[0])); return 0; }
      return 1;
    },
    file: function(ctx) {
      if (!ctx.args.length) { ctx.error('missing operand'); return 1; }
      var code = 0;
      for (var i = 0; i < ctx.args.length; i++) {
        var path = normPath(ctx.args[i]);
        var e = fs[path];
        if (!e) { ctx.println(ctx.args[i] + ': cannot open (No such file or directory)'); code = 1; continue; }
        var desc;
        if (e.type === 'dir') desc = 'directory';
        else if (e.linkTo) desc = 'symbolic link to ' + e.linkTo;
        else if (e.dev) desc = 'character special';
        else if (e.executable && (e.xapp || path === '/bin/busybox')) desc = 'ELF 64-bit LSB executable, x86-64, statically linked, stripped';
        else if (e.executable) desc = (e.content || '').slice(0, 2) === '#!' ? 'a script executable' : 'executable, ASCII text';
        else if (!(e.content || '').length) desc = 'empty';
        else desc = 'ASCII text';
        ctx.println(ctx.args[i] + ': ' + desc);
      }
      return code;
    },
    basename: function(ctx) {
      if (!ctx.args.length) { ctx.error('missing operand'); return 1; }
      var b = baseName(ctx.args[0].replace(/\/+$/, '') || '/');
      if (ctx.args[1] && b.slice(-ctx.args[1].length) === ctx.args[1] && b !== ctx.args[1]) b = b.slice(0, -ctx.args[1].length);
      ctx.println(b);
      return 0;
    },
    dirname: function(ctx) {
      if (!ctx.args.length) { ctx.error('missing operand'); return 1; }
      var s = ctx.args[0].replace(/\/+$/, '');
      var i = s.lastIndexOf('/');
      ctx.println(i < 0 ? '.' : (i === 0 ? '/' : s.slice(0, i)));
      return 0;
    },
    pwd: function(ctx) { ctx.println(cwd); return 0; },
    sync: function() { persistFS(); return 0; }
  });
  function modeOctal(e) {
    var m = e.mode || '-rw-r--r--';
    var v = '';
    for (var c = 0; c < 3; c++) {
      var n = 0;
      if (m.charAt(1 + c * 3) !== '-') n += 4;
      if (m.charAt(2 + c * 3) !== '-') n += 2;
      if (m.charAt(3 + c * 3) !== '-') n += 1;
      v += n;
    }
    return '0' + v;
  }

