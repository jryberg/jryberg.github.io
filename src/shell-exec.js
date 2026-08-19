  // ── Shell: execution ─────────────────────────────────────────────────────
  var applets = {};
  function defineApplets(obj) { for (var k in obj) applets[k] = wrapApplet(k, obj[k]); }

  // `<applet> --help` prints the applet's BusyBox usage message the way
  // run_applet_and_exit() does: to stderr, exit 0. Applets without a BB_HELP
  // entry (echo, printf, test, and the non-busybox ones) are left alone —
  // POSIX says e.g. `test --help` must not be special, and busybox agrees.
  function wrapApplet(name, fn) {
    return function(ctx) {
      if (ctx.args.length === 1 && ctx.args[0] === '--help' && BB_HELP.hasOwnProperty(name)) return bbShowHelp(name, ctx);
      return fn(ctx);
    };
  }
  function bbShowHelp(name, ctx) {
    ctx.err('BusyBox v' + BB_VERSION + ' (' + BB_BUILD + ') multi-call binary.');
    ctx.err('');
    var lines = ('Usage: ' + name + ' ' + BB_HELP[name]).split('\n');
    for (var i = 0; i < lines.length; i++) ctx.err(lines[i]);
    ctx.err('');
    return 0;
  }

  // Usage texts cloned from busybox 1.37.0 (//usage: blocks, default feature
  // set), for the applets this shell implements. `ip` is trimmed to the
  // objects the emulated `ip` knows about.
  var BB_HELP = {
    ls: '[-1AaCxdLHRFplinshrSXvctu] [-w WIDTH] [FILE]...\n\nList directory contents\n\n\t-1\tOne column output\n\t-a\tInclude names starting with .\n\t-A\tLike -a, but exclude . and ..\n\t-x\tList by lines\n\t-d\tList directory names, not contents\n\t-L\tFollow symlinks\n\t-H\tFollow symlinks on command line\n\t-R\tRecurse\n\t-p\tAppend / to directory names\n\t-F\tAppend indicator (one of */=@|) to names\n\t-l\tLong format\n\t-i\tList inode numbers\n\t-n\tList numeric UIDs and GIDs instead of names\n\t-s\tList allocated blocks\n\t-lc\tList ctime\n\t-lu\tList atime\n\t--full-time\tList full date/time\n\t-h\tHuman readable sizes (1K 243M 2G)\n\t--group-directories-first\n\t-S\tSort by size\n\t-X\tSort by extension\n\t-v\tSort by version\n\t-t\tSort by mtime\n\t-tc\tSort by ctime\n\t-tu\tSort by atime\n\t-r\tReverse sort order\n\t-w N\tFormat N columns wide\n\t--color[={always,never,auto}]',
    cat: '[-nbvteA] [FILE]...\n\nPrint FILEs to stdout\n\n\t-n\tNumber output lines\n\t-b\tNumber nonempty lines\n\t-v\tShow nonprinting characters as ^x or M-x\n\t-t\t...and tabs as ^I\n\t-e\t...and end lines with $\n\t-A\tSame as -vte',
    cp: '[-arPLHpfinlsTu] SOURCE DEST\nor: cp [-arPLHpfinlsu] SOURCE... { -t DIRECTORY | DIRECTORY }\n\nCopy SOURCEs to DEST\n\n\t-a\tSame as -dpR\n\t-R,-r\tRecurse\n\t-d,-P\tPreserve symlinks (default if -R)\n\t-L\tFollow all symlinks\n\t-H\tFollow symlinks on command line\n\t-p\tPreserve file attributes if possible\n\t-f\tOverwrite\n\t-i\tPrompt before overwrite\n\t-n\tDon\'t overwrite\n\t-l,-s\tCreate (sym)links\n\t-T\tRefuse to copy if DEST is a directory\n\t-t DIR\tCopy all SOURCEs into DIR\n\t-u\tCopy only newer files',
    mv: '[-finT] SOURCE DEST\nor: mv [-fin] SOURCE... { -t DIRECTORY | DIRECTORY }\n\nRename SOURCE to DEST, or move SOURCEs to DIRECTORY\n\n\t-f\tDon\'t prompt before overwriting\n\t-i\tInteractive, prompt before overwrite\n\t-n\tDon\'t overwrite an existing file\n\t-T\tRefuse to move if DEST is a directory\n\t-t DIR\tMove all SOURCEs into DIR',
    rm: '[-irf] FILE...\n\nRemove (unlink) FILEs\n\n\t-i\tAlways prompt before removing\n\t-f\tNever prompt\n\t-R,-r\tRecurse',
    mkdir: '[-m MODE] [-p] DIRECTORY...\n\nCreate DIRECTORY\n\n\t-m MODE\tMode\n\t-p\tNo error if exists; make parent directories as needed',
    rmdir: '[-p] DIRECTORY...\n\nRemove DIRECTORY if it is empty\n\n\t-p\tInclude parents\n\t--ignore-fail-on-non-empty',
    touch: '[-cham] [-d DATE] [-t DATE] [-r FILE] FILE...\n\nUpdate mtime of FILEs\n\n\t-c\tDon\'t create files\n\t-h\tDon\'t follow links\n\t-a\tChange only atime\n\t-m\tChange only mtime\n\t-d DT\tDate/time to use\n\t-t DT\tDate/time to use\n\t-r FILE\tUse FILE\'s date/time',
    chmod: '[-Rcvf] MODE[,MODE]... FILE...\n\nMODE is octal number (bit pattern sstrwxrwxrwx) or [ugoa]{+|-|=}[rwxXst]\n\n\t-R\tRecurse\n\t-c\tList changed files\n\t-v\tVerbose\n\t-f\tHide errors',
    chown: '[-RhLHPcvf]... USER[:[GRP]] FILE...\n\nChange the owner and/or group of FILEs to USER and/or GRP\n\n\t-h\tAffect symlinks instead of symlink targets\n\t-L\tTraverse all symlinks to directories\n\t-H\tTraverse symlinks on command line only\n\t-P\tDon\'t traverse symlinks (default)\n\t-R\tRecurse\n\t-c\tList changed files\n\t-v\tVerbose\n\t-f\tHide errors',
    chgrp: '[-RhLHPcvf]... GROUP FILE...\n\nChange the group membership of FILEs to GROUP\n\n\t-h\tAffect symlinks instead of symlink targets\n\t-L\tTraverse all symlinks to directories\n\t-H\tTraverse symlinks on command line only\n\t-P\tDon\'t traverse symlinks (default)\n\t-R\tRecurse\n\t-c\tList changed files\n\t-v\tVerbose\n\t-f\tHide errors',
    stat: '[-ltf] [-c FMT] FILE...\n\nDisplay file (default) or filesystem status\n\n\t-c FMT\tUse the specified format\n\t-f\tDisplay filesystem status\n\t-L\tFollow links\n\t-t\tTerse display\n\nFMT sequences for files:\n %a\tAccess rights in octal\n %A\tAccess rights in human readable form\n %b\tNumber of blocks allocated (see %B)\n %B\tSize in bytes of each block reported by %b\n %d\tDevice number in decimal\n %D\tDevice number in hex\n %f\tRaw mode in hex\n %F\tFile type\n %g\tGroup ID\n %G\tGroup name\n %h\tNumber of hard links\n %i\tInode number\n %n\tFile name\n %N\tFile name, with -> TARGET if symlink\n %o\tI/O block size\n %s\tTotal size in bytes\n %t\tMajor device type in hex\n %T\tMinor device type in hex\n %u\tUser ID\n %U\tUser name\n %x\tTime of last access\n %X\tTime of last access as seconds since Epoch\n %y\tTime of last modification\n %Y\tTime of last modification as seconds since Epoch\n %z\tTime of last change\n %Z\tTime of last change as seconds since Epoch\n\nFMT sequences for file systems:\n %a\tFree blocks available to non-superuser\n %b\tTotal data blocks\n %c\tTotal file nodes\n %d\tFree file nodes\n %f\tFree blocks\n %i\tFile System ID in hex\n %l\tMaximum length of filenames\n %n\tFile name\n %s\tBlock size (for faster transfer)\n %S\tFundamental block size (for block counts)\n %t\tType in hex\n %T\tType in human readable form',
    find: '[-HL] [PATH]... [OPTIONS] [ACTIONS]\n\nSearch for files and perform actions on them.\nFirst failed action stops processing of current file.\nDefaults: PATH is current directory, action is \'-print\'\n\n\t-L,-follow\tFollow symlinks\n\t-H\t\t...on command line only\n\t-xdev\t\tDon\'t descend directories on other filesystems\n\t-maxdepth N\tDescend at most N levels. -maxdepth 0 applies\n\t\t\tactions to command line arguments only\n\t-mindepth N\tDon\'t act on first N levels\n\t-depth\t\tAct on directory *after* traversing it\n\nActions:\n\t( ACTIONS )\tGroup actions for -o / -a\n\t! ACT\t\tInvert ACT\'s success/failure\n\tACT1 [-a] ACT2\tIf ACT1 fails, stop, else do ACT2\n\tACT1 -o ACT2\tIf ACT1 succeeds, stop, else do ACT2\n\t\t\tNote: -a has higher priority than -o\n\t-name PATTERN\tMatch file name (w/o directory name) to PATTERN\n\t-iname PATTERN\tCase insensitive -name\n\t-path PATTERN\tMatch path to PATTERN\n\t-ipath PATTERN\tCase insensitive -path\n\t-regex PATTERN\tMatch path to regex PATTERN\n\t-type X\t\tFile type is X (one of: f,d,l,b,c,s,p)\n\t-executable\tFile is executable\n\t-perm MASK\tAt least one mask bit (+MASK), all bits (-MASK),\n\t\t\tor exactly MASK bits are set in file\'s mode\n\t-mtime DAYS\tmtime is greater than (+N), less than (-N),\n\t\t\tor exactly N days in the past\n\t-atime DAYS\tatime +N/-N/N days in the past\n\t-ctime DAYS\tctime +N/-N/N days in the past\n\t-mmin MINS\tmtime is greater than (+N), less than (-N),\n\t\t\tor exactly N minutes in the past\n\t-amin MINS\tatime +N/-N/N minutes in the past\n\t-cmin MINS\tctime +N/-N/N minutes in the past\n\t-newer FILE\tmtime is more recent than FILE\'s\n\t-inum N\t\tFile has inode number N\n\t-samefile FILE\tFile is same as FILE\n\t-user NAME/ID\tFile is owned by given user\n\t-group NAME/ID\tFile is owned by given group\n\t-size N[bck]\tFile size is N (c:bytes,k:kbytes,b:512 bytes(def.))\n\t\t\t+/-N: file size is bigger/smaller than N\n\t-links N\tNumber of links is greater than (+N), less than (-N),\n\t\t\tor exactly N\n\t-context CTX\tFile has specified security context\n\t-empty\t\tMatch empty file/directory\n\t-prune\t\tIf current file is directory, don\'t descend into it\nIf none of the following actions is specified, -print is assumed\n\t-print\t\tPrint file name\n\t-print0\t\tPrint file name, NUL terminated\n\t-exec CMD ARG ;\tRun CMD with all instances of {} replaced by\n\t\t\tfile name. Fails if CMD exits with nonzero\n\t-exec CMD ARG + Run CMD with {} replaced by list of file names\n\t-ok CMD ARG ;   Prompt and run CMD with {} replaced\n\t-delete\t\tDelete current file/directory. Turns on -depth option\n\t-quit\t\tExit',
    du: '[-aHLdclsxhmk] [FILE]...\n\nSummarize disk space used for FILEs (or directories)\n\n\t-a\tShow file sizes too\n\t-b\tApparent size (including holes)\n\t-L\tFollow all symlinks\n\t-H\tFollow symlinks on command line\n\t-d N\tLimit output to directories (and files with -a) of depth < N\n\t-c\tShow grand total\n\t-l\tCount sizes many times if hard linked\n\t-s\tDisplay only a total for each argument\n\t-x\tSkip directories on different filesystems\n\t-h\tSizes in human readable format (e.g., 1K 243M 2G)\n\t-m\tSizes in megabytes\n\t-k\tSizes in kilobytes (default)',
    df: '[-PkmhTai] [-B SIZE] [-t TYPE] [FILESYSTEM]...\n\nPrint filesystem usage statistics\n\n\t-P\tPOSIX output format\n\t-k\t1024-byte blocks (default)\n\t-m\t1M-byte blocks\n\t-h\tHuman readable (e.g. 1K 243M 2G)\n\t-T\tPrint filesystem type\n\t-t TYPE\tPrint only mounts of this type\n\t-a\tShow all filesystems\n\t-i\tInodes\n\t-B SIZE\tBlocksize',
    tee: '[-ai] [FILE]...\n\nCopy stdin to each FILE, and also to stdout\n\n\t-a\tAppend to the given FILEs, don\'t overwrite\n\t-i\tIgnore interrupt signals (SIGINT)',
    mktemp: '[-dt] [-p DIR] [TEMPLATE]\n\nCreate a temporary file with name based on TEMPLATE and print its name.\nTEMPLATE must end with XXXXXX (e.g. [/dir/]nameXXXXXX).\nWithout TEMPLATE, -t tmp.XXXXXX is assumed.\n\n\t-d\tMake directory, not file\n\t-q\tFail silently on errors\n\t-t\tPrepend base directory name to TEMPLATE\n\t-p DIR\tUse DIR as a base directory (implies -t)\n\t-u\tDo not create anything; print a name\n\nBase directory is: -p DIR, else $TMPDIR, else /tmp',
    realpath: 'FILE...\n\nPrint absolute pathnames of FILEs',
    readlink: '[-fnv] FILE\n\nDisplay the value of a symlink\n\n\t-n\tDon\'t add newline\n\t-f\tCanonicalize by following all symlinks\n\t-v\tVerbose',
    basename: 'FILE [SUFFIX] | -a FILE... | -s SUFFIX FILE...\n\nStrip directory path and SUFFIX from FILE\n\n\t-a\t\tAll arguments are FILEs\n\t-s SUFFIX\tRemove SUFFIX (implies -a)',
    dirname: 'FILENAME\n\nStrip non-directory suffix from FILENAME',
    pwd: '\n\nPrint the full filename of the current working directory',
    grep: '[-HhnlLoqvsrRiwFEz] [-m N] [-A|B|C N] { PATTERN | -e PATTERN... | -f FILE... } [FILE]...\n\nSearch for PATTERN in FILEs (or stdin)\n\n\t-H\tAdd \'filename:\' prefix\n\t-h\tDo not add \'filename:\' prefix\n\t-n\tAdd \'line_no:\' prefix\n\t-l\tShow only names of files that match\n\t-L\tShow only names of files that don\'t match\n\t-c\tShow only count of matching lines\n\t-o\tShow only the matching part of line\n\t-q\tQuiet. Return 0 if PATTERN is found, 1 otherwise\n\t-v\tSelect non-matching lines\n\t-s\tSuppress open and read errors\n\t-r\tRecurse\n\t-R\tRecurse and dereference symlinks\n\t-i\tIgnore case\n\t-w\tMatch whole words only\n\t-x\tMatch whole lines only\n\t-F\tPATTERN is a literal (not regexp)\n\t-E\tPATTERN is an extended regexp\n\t-z\tNUL terminated input\n\t-m N\tMatch up to N times per file\n\t-A N\tPrint N lines of trailing context\n\t-B N\tPrint N lines of leading context\n\t-C N\tSame as \'-A N -B N\'\n\t-e PTRN\tPattern to match\n\t-f FILE\tRead pattern from file',
    sed: '[-i[SFX]] [-nrE] [-f FILE]... [-e CMD]... [FILE]...\nor: sed [-i[SFX]] [-nrE] CMD [FILE]...\n\n\t-e CMD\tAdd CMD to sed commands to be executed\n\t-f FILE\tAdd FILE contents to sed commands to be executed\n\t-i[SFX]\tEdit files in-place (otherwise write to stdout)\n\t\tOptionally back files up, appending SFX\n\t-n\tSuppress automatic printing of pattern space\n\t-r,-E\tUse extended regex syntax\n\nIf no -e or -f, the first non-option argument is the sed command string.\nRemaining arguments are input files (stdin if none).',
    awk: '[OPTIONS] [AWK_PROGRAM] [FILE]...\n\n\t-v VAR=VAL\tSet variable\n\t-F SEP\t\tUse SEP as field separator\n\t-f/-E FILE\tRead program from FILE\n\t-e AWK_PROGRAM',
    head: '[OPTIONS] [FILE]...\n\nPrint first 10 lines of FILEs (or stdin).\nWith more than one FILE, precede each with a filename header.\n\n\t-n N[bkm]\tPrint first N lines\n\t-n -N[bkm]\tPrint all except N last lines\n\t-c [-]N[bkm]\tPrint first N bytes\n\t\t\t(b:*512 k:*1024 m:*1024^2)\n\t-q\t\tNever print headers\n\t-v\t\tAlways print headers',
    tail: '[OPTIONS] [FILE]...\n\nPrint last 10 lines of FILEs (or stdin) to.\nWith more than one FILE, precede each with a filename header.\n\n\t-c [+]N[bkm]\tPrint last N bytes\n\t-n N[bkm]\tPrint last N lines\n\t-n +N[bkm]\tStart on Nth line and print the rest\n\t\t\t(b:*512 k:*1024 m:*1024^2)\n\t-q\t\tNever print headers\n\t-v\t\tAlways print headers\n\t-f\t\tPrint data as file grows\n\t-F\t\tSame as -f, but keep retrying\n\t-s SECONDS\tWait SECONDS between reads with -f',
    wc: '[-cmlwL] [FILE]...\n\nCount lines, words, and bytes for FILEs (or stdin)\n\n\t-c\tCount bytes\n\t-m\tCount characters\n\t-l\tCount newlines\n\t-w\tCount words\n\t-L\tPrint longest line length',
    sort: '[-nrughMcszbdfiokt] [-o FILE] [-k START[.OFS][OPTS][,END[.OFS][OPTS]] [-t CHAR] [FILE]...\n\nSort lines of text\n\n\t-o FILE\tOutput to FILE\n\t-c\tCheck whether input is sorted\n\t-b\tIgnore leading blanks\n\t-f\tIgnore case\n\t-i\tIgnore unprintable characters\n\t-d\tDictionary order (blank or alphanumeric only)\n\t-n\tSort numbers\n\t-g\tGeneral numerical sort\n\t-h\tSort human readable numbers (2K 1G)\n\t-M\tSort month\n\t-V\tSort version\n\t-t CHAR\tField separator\n\t-k N[,M] Sort by Nth field\n\t-r\tReverse sort order\n\t-s\tStable (don\'t sort ties alphabetically)\n\t-u\tSuppress duplicate lines\n\t-z\tNUL terminated input and output',
    uniq: '[-cduiz] [-f,s,w N] [FILE [OUTFILE]]\n\nDiscard duplicate lines\n\n\t-c\tPrefix lines by the number of occurrences\n\t-d\tOnly print duplicate lines\n\t-u\tOnly print unique lines\n\t-i\tIgnore case\n\t-z\tNUL terminated output\n\t-f N\tSkip first N fields\n\t-s N\tSkip first N chars (after any skipped fields)\n\t-w N\tCompare N characters in line',
    cut: '[OPTIONS] [FILE]...\n\nPrint selected fields from FILEs to stdout\n\n\t-b LIST\tOutput only bytes from LIST\n\t-c LIST\tOutput only characters from LIST\n\t-d SEP\tField delimiter for input (default -f TAB, -F run of whitespace)\n\t-O SEP\tField delimeter for output (default = -d for -f, one space for -F)\n\t-D\tDon\'t sort/collate sections or match -fF lines without delimeter\n\t-f LIST\tPrint only these fields (-d is single char)\n\t-F LIST\tPrint only these fields (-d is regex)\n\t-s\tOutput only lines containing delimiter\n\t-n\tIgnored',
    tr: '[-cds] STRING1 [STRING2]\n\nTranslate, squeeze, or delete characters from stdin, writing to stdout\n\n\t-c\tTake complement of STRING1\n\t-d\tDelete input characters coded STRING1\n\t-s\tSqueeze multiple output characters of STRING2 into one character',
    rev: '[FILE]...\n\nReverse lines of FILE',
    tac: '[FILE]...\n\nConcatenate FILEs and print them in reverse',
    nl: '[OPTIONS] [FILE]...\n\nWrite FILEs to standard output with line numbers added\n\n\t-b STYLE\tWhich lines to number - a: all, t: nonempty, n: none\n\t-i N\t\tLine number increment\n\t-s STRING\tUse STRING as line number separator\n\t-v N\t\tStart from N\n\t-w N\t\tWidth of line numbers',
    seq: '[-w] [-s SEP] [FIRST [INC]] LAST\n\nPrint numbers from FIRST to LAST, in steps of INC.\nFIRST, INC default to 1.\n\n\t-w\tPad with leading zeros\n\t-s SEP\tString separator',
    xargs: '[OPTIONS] [PROG ARGS]\n\nRun PROG on every item given by stdin\n\n\t-0\tNUL terminated input\n\t-a FILE\tRead from FILE instead of stdin\n\t-o\tReopen stdin as /dev/tty\n\t-r\tDon\'t run command if input is empty\n\t-t\tPrint the command on stderr before execution\n\t-p\tAsk user whether to run each command\n\t-E STR,-e[STR]\tSTR stops input processing\n\t-I STR\tReplace STR within PROG ARGS with input line\n\t-n N\tPass no more than N args to PROG\n\t-s N\tPass command line of no more than N bytes\n\t-P N\tRun up to N PROGs in parallel\n\t-x\tExit if size is exceeded',
    base64: '[-d] [-w COL] [FILE]\n\nBase64 encode or decode FILE to standard output\n\n\t-d\tDecode data\n\t-w COL\tWrap lines at COL (default 76, 0 disables)',
    strings: '[-fo] [-t o|d|x] [-n LEN] [FILE]...\n\nDisplay printable strings in a binary file\n\n\t-f\t\tPrecede strings with filenames\n\t-o\t\tPrecede strings with octal offsets\n\t-t o|d|x\tPrecede strings with offsets in base 8/10/16\n\t-n LEN\t\tAt least LEN characters form a string (default 4)',
    more: '[FILE]...\n\nView FILE (or stdin) one screenful at a time',
    less: '[-EFIMmNSRh~] [FILE]...\n\nView FILE (or stdin) one screenful at a time\n\n\t-E\tQuit once the end of a file is reached\n\t-F\tQuit if entire file fits on first screen\n\t-I\tIgnore case in all searches\n\t-M,-m\tDisplay status line with line numbers\n\t\tand percentage through the file\n\t-N\tPrefix line number to each line\n\t-S\tTruncate long lines\n\t-R\tRemove color escape codes in input\n\t-~\tSuppress ~s displayed past EOF',
    vi: '[-c CMD] [-R] [-H] [FILE]...\n\nEdit FILE\n\n\t-c CMD\tInitial command to run ($EXINIT and ~/.exrc also available)\n\t-R\tRead-only\n\t-H\tList available features',
    uname: '[-amnrspvio]\n\nPrint system information\n\n\t-a\tPrint all\n\t-m\tMachine (hardware) type\n\t-n\tHostname\n\t-r\tKernel release\n\t-s\tKernel name (default)\n\t-p\tProcessor type\n\t-v\tKernel version\n\t-i\tHardware platform\n\t-o\tOS name',
    hostname: '[-sidf] [HOSTNAME | -F FILE]\n\nShow or set hostname or DNS domain name\n\n\t-s\tShort\n\t-i\tAddresses for the hostname\n\t-d\tDNS domain name\n\t-f\tFully qualified domain name\n\t-F FILE\tUse FILE\'s content as hostname',
    whoami: '\n\nPrint the user name associated with the current effective user id',
    logname: '\n\nPrint the name of the current user',
    id: '[-ugGnr] [USER]\n\nPrint information about USER or the current user\n\n\t-u\tUser ID\n\t-g\tGroup ID\n\t-G\tSupplementary group IDs\n\t-n\tPrint names instead of numbers\n\t-r\tPrint real ID instead of effective ID',
    tty: '[-s]\n\nPrint file name of stdin\'s terminal\n\n\t-s\tPrint nothing, only return exit status',
    nproc: '[--all] [--ignore=N]\n\nPrint number of available CPUs\n\n\t--all\t\tNumber of installed CPUs\n\t--ignore=N\tExclude N CPUs',
    arch: '\n\nPrint system architecture',
    env: '[-i0] [-u NAME]... [-] [NAME=VALUE]... [PROG ARGS]\n\nPrint current environment or run PROG after setting up environment\n\n\t-, -i\tStart with empty environment\n\t-0\tNUL terminated output\n\t-u NAME\tRemove variable from environment',
    printenv: '[VARIABLE]...\n\nPrint environment VARIABLEs.\nIf no VARIABLE specified, print all.',
    date: '[OPTIONS] [+FMT] [[-s] TIME]\n\nDisplay time (using +FMT), or set time\n\n\t-u\t\tWork in UTC (don\'t convert to local time)\n\t[-s] TIME\tSet time to TIME\n\t-d TIME\t\tDisplay TIME, not \'now\'\n\t-D FMT\t\tFMT (strptime format) for -s/-d TIME conversion\n\t-r FILE\t\tDisplay last modification time of FILE\n\t-R\t\tOutput RFC-2822 date\n\t-I[SPEC]\tOutput ISO-8601 date\n\t\t\tSPEC=date (default), hours, minutes, seconds or ns\n\nRecognized TIME formats:\n\t@seconds_since_1970\n\thh:mm[:ss]\n\t[YYYY.]MM.DD-hh:mm[:ss]\n\tYYYY-MM-DD hh:mm[:ss]\n\t[[[[[YY]YY]MM]DD]hh]mm[.ss]\n\t\'date TIME\' form accepts MMDDhhmm[[YY]YY][.ss] instead',
    cal: '[-jmy] [[MONTH] YEAR]\n\nDisplay a calendar\n\n\t-j\tUse julian dates\n\t-m\tWeek starts on Monday\n\t-y\tDisplay the entire year',
    uptime: '\n\nDisplay the time since the last boot',
    free: '[-bkmgh]\n\nDisplay free and used memory',
    dmesg: '[-cr] [-n LEVEL] [-s SIZE]\n\nPrint or control the kernel ring buffer\n\n\t-c\t\tClear ring buffer after printing\n\t-n LEVEL\tSet console logging level\n\t-s SIZE\t\tBuffer size\n\t-r\t\tPrint raw message buffer',
    mount: '[OPTIONS] [-o OPT] DEVICE NODE\n\nMount a filesystem. Filesystem autodetection requires /proc.\n\n\t-a\t\tMount all filesystems in fstab\n\t-f\t\tUpdate /etc/mtab, but don\'t mount\n\t-i\t\tDon\'t run mount helper\n\t-n\t\tDon\'t update /etc/mtab\n\t-v\t\tVerbose\n\t-r\t\tRead-only mount\n\t-t FSTYPE[,...]\tFilesystem type(s)\n\t-T FILE\t\tRead FILE instead of /etc/fstab\n\t-O OPT\t\tMount only filesystems with option OPT (-a only)\n-o OPT:\n\tloop\t\tIgnored (loop devices are autodetected)\n\t[a]sync\t\tWrites are [a]synchronous\n\t[no]atime\tDisable/enable updates to inode access times\n\t[no]diratime\tDisable/enable atime updates to directories\n\t[no]relatime\tDisable/enable atime updates relative to modification time\n\t[no]dev\t\t(Dis)allow use of special device files\n\t[no]exec\t(Dis)allow use of executable files\n\t[no]suid\t(Dis)allow set-user-id-root programs\n\t[r]shared\tConvert [recursively] to a shared subtree\n\t[r]slave\tConvert [recursively] to a slave subtree\n\t[r]private\tConvert [recursively] to a private subtree\n\t[un]bindable\tMake mount point [un]able to be bind mounted\n\t[r]bind\t\tBind a file or directory [recursively] to another location\n\tmove\t\tRelocate an existing mount point\n\tremount\t\tRemount a mounted filesystem, changing flags\n\tro\t\tSame as -r\n\nThere are filesystem-specific -o flags.',
    which: '[-a] COMMAND...\n\nLocate COMMAND\n\n\t-a\tShow all matches',
    clear: '\n\nClear screen',
    reset: '\n\nReset terminal (ESC codes) and termios (signals, buffering, echo)',
    ps: '[-o COL1,COL2=HEADER] [-T]\n\nShow list of processes\n\n\t-o COL1,COL2=HEADER\tSelect columns for display\n\t-T\t\t\tShow threads',
    kill: '[-l] [-SIG] PID...\n\nSend a signal (default: TERM) to given PIDs\n\n\t-l\tList all signal names and numbers',
    man: '[-aw] [SECTION] MANPAGE[.SECTION]...\n\nDisplay manual page\n\n\t-a\tDisplay all pages\n\t-w\tShow page locations\n\n$COLUMNS overrides output width',
    su: '[-lmp] [-s SH] [-] [USER [FILE ARGS | -c \'CMD\' [ARG0 ARGS]]]\n\nRun shell under USER (by default, root)\n\n\t-,-l\tClear environment, go to home dir, run shell as login shell\n\t-p,-m\tDo not set new $HOME, $SHELL, $USER, $LOGNAME\n\t-c CMD\tCommand to pass to \'sh -c\'\n\t-s SH\tShell to use instead of user\'s default',
    md5sum: '[-c[sw]] [FILE]...\n\nPrint or check MD5 checksums\n\n\t-c\tCheck sums against list in FILEs\n\t-s\tDon\'t output anything, status code shows success\n\t-w\tWarn about improperly formatted checksum lines',
    sleep: '[N]...\n\nPause for a time equal to the total of the args given, where each arg can\nhave an optional suffix of (s)econds, (m)inutes, (h)ours, or (d)ays',
    yes: '[STRING]\n\nRepeatedly print a line with STRING, or \'y\'',
    poweroff: '[-d DELAY] [-nf]\n\nHalt and shut off power\n\n\t-d SEC\tDelay interval\n\t-n\tDo not sync\n\t-f\tForce (don\'t go through init)',
    reboot: '[-d DELAY] [-nf]\n\nReboot the system\n\n\t-d SEC\tDelay interval\n\t-n\tDo not sync\n\t-f\tForce (don\'t go through init)',
    ifconfig: '[-a] [IFACE] [ADDRESS]\n\nConfigure a network interface\n\n\t[add ADDRESS[/PREFIXLEN]]\n\t[del ADDRESS[/PREFIXLEN]]\n\t[[-]broadcast [ADDRESS]] [[-]pointopoint [ADDRESS]]\n\t[netmask ADDRESS] [dstaddr ADDRESS]\n\t[outfill NN] [keepalive NN]\n\t[hw ether|infiniband ADDRESS] [metric NN] [mtu NN]\n\t[[-]trailers] [[-]arp] [[-]allmulti]\n\t[multicast] [[-]promisc] [txqueuelen NN] [[-]dynamic]\n\t[mem_start NN] [io_addr NN] [irq NN]\n\t[up|down] ...',
    ip: '[OPTIONS] address|route|link [ARGS]\n\nOPTIONS := -f[amily] inet|inet6|link | -o[neline]\n\nip addr add|del IFADDR dev IFACE | show|flush [dev IFACE] [to PREFIX]\nip route list|flush|add|del|change|append|replace|test ROUTE\nip link set IFACE [up|down] [arp on|off] [multicast on|off]\n\t[promisc on|off] [mtu NUM] [name NAME] [qlen NUM] [address MAC]\n\t[master IFACE | nomaster] [netns PID]',
    ping: '[OPTIONS] HOST\n\nSend ICMP ECHO_REQUESTs to HOST\n\n\t-4,-6\t\tForce IP or IPv6 name resolution\n\t-c CNT\t\tSend only CNT pings\n\t-s SIZE\t\tSend SIZE data bytes in packets (default 56)\n\t-i SECS\t\tInterval\n\t-A\t\tPing as soon as reply is received\n\t-t TTL\t\tSet TTL\n\t-I IFACE/IP\tSource interface or IP address\n\t-W SEC\t\tSeconds to wait for the first response (default 10)\n\t\t\t(after all -c CNT packets are sent)\n\t-w SEC\t\tSeconds until ping exits (default:infinite)\n\t\t\t(can exit earlier with -c CNT)\n\t-q\t\tQuiet, only display output at start/finish\n\t-p HEXBYTE\tPayload pattern',
    traceroute: '[-46IFlnrv] [-f 1ST_TTL] [-m MAXTTL] [-q PROBES] [-p PORT]\n\t[-t TOS] [-w WAIT_SEC] [-s SRC_IP] [-i IFACE]\n\t[-z PAUSE_MSEC] HOST [BYTES]\n\nTrace the route to HOST\n\n\t-4,-6\tForce IP or IPv6 name resolution\n\t-F\tSet don\'t fragment bit\n\t-I\tUse ICMP ECHO instead of UDP datagrams\n\t-l\tDisplay TTL value of the returned packet\n\t-n\tPrint numeric addresses\n\t-r\tBypass routing tables, send directly to HOST\n\t-v\tVerbose\n\t-f N\tFirst number of hops (default 1)\n\t-m N\tMax number of hops\n\t-q N\tNumber of probes per hop (default 3)\n\t-p N\tBase UDP port number used in probes\n\t\t(default 33434)\n\t-s IP\tSource address\n\t-i IFACE Source interface\n\t-t N\tType-of-service in probe packets (default 0)\n\t-w SEC\tWait for a response (default 3)\n\t-z MSEC\tWait before each send',
    nslookup: '[-type=QUERY_TYPE] [-debug] HOST [DNS_SERVER]\n\nQuery DNS about HOST\n\nQUERY_TYPE: soa,ns,a,aaaa,cname,mx,txt,ptr,srv,any',
    netstat: '[-ral] [-tuwx] [-enWp]\n\nDisplay networking information\n\n\t-r\tRouting table\n\t-a\tAll sockets\n\t-l\tListening sockets\n\t\tElse: connected sockets\n\t-t\tTCP sockets\n\t-u\tUDP sockets\n\t-w\tRaw sockets\n\t-x\tUnix sockets\n\t\tElse: all socket types\n\t-e\tOther/more information\n\t-n\tDon\'t resolve names\n\t-W\tWide display\n\t-p\tShow PID/program name for sockets',
    arp: '\n[-vn]\t[-H HWTYPE] [-i IF] -a [HOSTNAME]\n[-v]\t\t    [-i IF] -d HOSTNAME [pub]\n[-v]\t[-H HWTYPE] [-i IF] -s HOSTNAME HWADDR [temp]\n[-v]\t[-H HWTYPE] [-i IF] -s HOSTNAME HWADDR [netmask MASK] pub\n[-v]\t[-H HWTYPE] [-i IF] -Ds HOSTNAME IFACE [netmask MASK] pub\n\nManipulate ARP cache\n\n\t-a\t\tDisplay (all) hosts\n\t-d\t\tDelete ARP entry\n\t-s\t\tSet new entry\n\t-v\t\tVerbose\n\t-n\t\tDon\'t resolve names\n\t-i IF\t\tNetwork interface\n\t-D\t\tRead HWADDR from IFACE\n\t-A,-p AF\tProtocol family\n\t-H HWTYPE\tHardware address type',
    route: '[-ne] [-A inet[6]] [{add|del} [-net|-host] TARGET [netmask MASK]\n\t[gw GATEWAY] [metric N] [mss BYTES] [window BYTES] [reject] [IFACE]]\n\nShow or edit kernel routing tables\n\n\t-n\tDon\'t resolve names\n\t-e\tDisplay other/more information\n\t-A inet[6]\tSelect address family',
    wget: '[-cqS] [--spider] [-O FILE] [-o LOGFILE] [--header STR]\n\t[--post-data STR | --post-file FILE] [-Y on/off]\n\t[--no-check-certificate] [-P DIR] [-U AGENT] [-T SEC] URL...\n\nRetrieve files via HTTP or FTP\n\n\t--spider\tOnly check URL existence: $? is 0 if exists\n\t--header STR\tAdd STR (of form \'header: value\') to headers\n\t--post-data STR\tSend STR using POST method\n\t--post-file FILE\tSend FILE using POST method\n\t--no-check-certificate\tDon\'t validate the server\'s certificate\n\t-c\t\tContinue retrieval of aborted transfer\n\t-q\t\tQuiet\n\t-P DIR\t\tSave to DIR (default .)\n\t-S    \t\tShow server response\n\t-T SEC\t\tNetwork read timeout is SEC seconds\n\t-O FILE\t\tSave to FILE (\'-\' for stdout)\n\t-o LOGFILE\tLog messages to FILE\n\t-U STR\t\tUse STR for User-Agent header\n\t-Y on/off\tUse proxy',
    ash: '[-il] [-|+Cabefmnuvx] [-|+o OPT]... [-c \'SCRIPT\' [ARG0 ARGS] | FILE ARGS | -s ARGS]\n\nUnix shell interpreter',
  };
  BB_HELP.sh = BB_HELP.ash;   // busybox maps sh to ash
  // Applets that take over the screen / run in real time when started from an
  // interactive prompt (standalone, without stdout redirection).
  var INTERACTIVE = { vi: true, sl: true, sleep: true, yes: true, ssh: true, ping: true };

  function registerAppletBinaries() {
    var names = Object.keys(applets).sort();
    var bin = fs['/bin'];
    for (var i = 0; i < names.length; i++) {
      var p = '/bin/' + names[i];
      if (!fs[p]) {
        fs[p] = { type: 'file', content: '', executable: true, applet: true, linkTo: 'busybox', owner: 'root', group: 'root', mode: 'lrwxrwxrwx', mtime: BASE_MTIME };
        bin.children.push(names[i]);
      }
    }
    fs['/bin/busybox'].content = '\u007fELF\u0002\u0001\u0001\u0000...busybox multi-call binary (stripped)\u0000';
    fs['/bin/busybox'].size = 1084216;
    if (bin.children.indexOf('busybox') < 0) bin.children.push('busybox');
    bin.children.sort();
  }

  // stdout sink: normally the terminal; a capture buffer during $(...)
  var captureBuf = null;
  var substDepth = 0;
  var noInteractive = 0;

  function termWrite(text) {
    if (!text) return;
    if (captureBuf !== null) { captureBuf.push(String(text)); return; }
    var lines = String(text).split('\n');
    if (lines[lines.length - 1] === '') lines.pop();
    for (var i = 0; i < lines.length; i++) addLine(lines[i]);
  }

  var substExit = null;   // exit code of the last $(...) run in this pipeline

  function captureRun(cmdline) {
    if (substDepth > 8) return '';
    var saved = captureBuf;
    captureBuf = [];
    substDepth++;
    var out = '';
    try {
      runCommandLine(cmdline);
      out = captureBuf.join('');
    } finally {
      captureBuf = saved;
      substDepth--;
      substExit = lastExit;
    }
    return out;
  }

  function runCommandLine(line) {
    var tk = tokenize(line);
    if (tk.error) { termWrite('sh: ' + tk.error + '\n'); lastExit = 2; return; }
    var prog = parseProgram(tk.toks);
    if (prog.error) { termWrite('sh: ' + prog.error + '\n'); lastExit = 2; return; }
    runItems(prog.stmts, 0);
  }

  function runItems(stmts, i) {
    while (i < stmts.length) {
      var st = stmts[i];
      var skip = (st.op === '&&' && lastExit !== 0) || (st.op === '||' && lastExit === 0);
      i++;
      if (skip) continue;
      if (st.node.type !== 'pipeline') {
        execCompound(st.node);
        continue;
      }
      var r = runPipeline(st.node, makeResume(stmts, i));
      if (r === 'async') return;
    }
  }
  function makeResume(stmts, i) {
    return function() {
      runItems(stmts, i);
      if (!readline) updatePrompt();   // don't clobber a pending ssh prompt
      scrollToBottom();
    };
  }

  // Compound statements run fully synchronously; interactive applets inside
  // them fall back to their non-tty behavior.
  function execCompound(node) {
    noInteractive++;
    try {
      if (node.type === 'if') {
        runItems(node.cond, 0);
        var branch = null;
        if (lastExit === 0) branch = node.then;
        else {
          for (var e = 0; e < node.elifs.length; e++) {
            runItems(node.elifs[e].cond, 0);
            if (lastExit === 0) { branch = node.elifs[e].then; break; }
          }
          if (!branch) branch = node.els;
        }
        if (branch) runItems(branch, 0);
        else lastExit = 0;
      } else if (node.type === 'for') {
        var vals = [];
        for (var w = 0; w < node.words.length; w++) vals = vals.concat(expandWord(node.words[w]));
        lastExit = 0;
        for (var v = 0; v < vals.length; v++) {
          env[node.varName] = vals[v];
          runItems(node.body, 0);
        }
      } else if (node.type === 'while') {
        var guard = 0;
        var bodyExit = 0;
        for (;;) {
          if (++guard > 10000) { termWrite('sh: ' + (node.until ? 'until' : 'while') + ': loop aborted after 10000 iterations\n'); break; }
          runItems(node.cond, 0);
          if (node.until ? lastExit === 0 : lastExit !== 0) break;
          runItems(node.body, 0);
          bodyExit = lastExit;
        }
        lastExit = bodyExit;
      }
    } finally {
      noInteractive--;
    }
  }

  function runPipeline(item, cont) {
    var procs = [];
    substExit = null;
    for (var i = 0; i < item.pipe.length; i++) {
      var argv = [];
      for (var w = 0; w < item.pipe[i].words.length; w++) {
        argv = argv.concat(expandWord(item.pipe[i].words[w]));
      }
      // redirect targets are stored as unexpanded words; expand them now
      var rawRedirs = item.pipe[i].redirs;
      var redirs = {};
      ['in', 'out', 'append', 'err', 'errAppend'].forEach(function(k) {
        if (rawRedirs[k] !== undefined) redirs[k] = expandWord(rawRedirs[k])[0];
      });
      if (rawRedirs.errToOut) redirs.errToOut = true;
      procs.push({ argv: argv, redirs: redirs });
    }

    // Leading VAR=value assignments
    while (procs.length === 1 && procs[0].argv.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(procs[0].argv[0])) {
      var asg = procs[0].argv.shift();
      var eq = asg.indexOf('=');
      env[asg.slice(0, eq)] = asg.slice(eq + 1);
    }
    // assignment-only command: exit status comes from any $(...) it ran
    if (procs.length === 1 && !procs[0].argv.length) { lastExit = substExit !== null ? substExit : 0; return; }

    var first = procs[0];
    var name0 = first.argv[0];

    // Commands given as paths: /bin/ls, ./script, /usr/bin/deerhunt ...
    if (name0 && name0.indexOf('/') >= 0) {
      var tpath = normPath(name0);
      var tentry = fs[tpath];
      if (!tentry) { termWrite('sh: ' + name0 + ': not found\n'); lastExit = 127; return; }
      if (tentry.type === 'dir') { termWrite('sh: ' + name0 + ': Is a directory\n'); lastExit = 126; return; }
      if (!tentry.executable) { termWrite('sh: ' + name0 + ': Permission denied\n'); lastExit = 126; return; }
      if (tentry.applet || baseName(tpath) === 'busybox') {
        name0 = first.argv[0] = baseName(tpath) === 'busybox' ? 'busybox' : baseName(tpath);
      } else if (tentry.xapp) {
        // fall through to the xapp branch below
      } else {
        // user-made executable: run it as a shell script
        if (procs.length > 1) { termWrite('sh: ' + name0 + ': cannot be piped\n'); lastExit = 1; return; }
        lastExit = 0;
        runScript(tentry.content);
        return;
      }
    }

    // X11 applications
    var xentry = null;
    if (name0 && name0.indexOf('/') >= 0) {
      var xe = fs[normPath(name0)];
      if (xe && xe.xapp) xentry = xe;
    } else if (name0 && !builtins[name0] && !applets[name0]) {
      var rx = resolveFromPath(name0);
      if (rx && rx.entry.xapp) xentry = rx.entry;
    }
    if (xentry) {
      if (procs.length > 1) { termWrite('sh: ' + baseName(name0) + ': cannot run X11 applications in a pipeline\n'); lastExit = 1; return; }
      // inside $(...) or a compound statement, never block the shell on a window
      var forceBg = item.bg || captureBuf !== null || noInteractive > 0;
      spawnXApp(first.argv.join(' '), xentry, forceBg);
      lastExit = 0;
      if (!forceBg) {
        if (foregroundPid !== null && processes[foregroundPid]) processes[foregroundPid].onExit = cont;
        return 'async';
      }
      return;
    }

    // Interactive applets (vi, sl, sleep, yes) — only standalone at a tty
    if (procs.length === 1 && INTERACTIVE[name0] && !item.bg && captureBuf === null && !noInteractive &&
        !first.redirs.out && !first.redirs.append && !first.redirs.in &&
        !(first.argv.length === 2 && first.argv[1] === '--help' && BB_HELP.hasOwnProperty(name0))) {
      return runInteractive(name0, first.argv.slice(1), cont);
    }

    // Plain pipeline: run each command, feeding stdout to the next stdin
    var carry = '';
    var code = 0;
    for (var p = 0; p < procs.length; p++) {
      var pr = procs[p];
      var input = carry;
      if (pr.redirs.in) {
        var rr = readFile(normPath(pr.redirs.in));
        if (rr.error) {
          termWrite('sh: can\'t open ' + pr.redirs.in + ': ' + rr.error + '\n');
          lastExit = 1;
          return;
        }
        input = rr.content;
      }
      var isLast = p === procs.length - 1;
      var redirected = pr.redirs.out !== undefined || pr.redirs.append !== undefined;
      var res = runSimple(pr.argv, input, { tty: isLast && !redirected && captureBuf === null });
      code = res.code;
      var stdout = res.stdout, stderr = res.stderr;
      if (pr.redirs.errToOut) { stdout += stderr; stderr = ''; }
      if (pr.redirs.err !== undefined || pr.redirs.errAppend !== undefined) {
        var ep = normPath(pr.redirs.err !== undefined ? pr.redirs.err : pr.redirs.errAppend);
        var ew = writeFile(ep, stderr, { append: pr.redirs.errAppend !== undefined });
        if (ew.error) termWrite('sh: can\'t create ' + (pr.redirs.err || pr.redirs.errAppend) + ': ' + ew.error + '\n');
        stderr = '';
      }
      if (stderr) termWrite(stderr);
      if (redirected) {
        var op2 = normPath(pr.redirs.out !== undefined ? pr.redirs.out : pr.redirs.append);
        var ow = writeFile(op2, stdout, { append: pr.redirs.append !== undefined });
        if (ow.error) { termWrite('sh: can\'t create ' + (pr.redirs.out || pr.redirs.append) + ': ' + ow.error + '\n'); code = 1; }
        else if (ow.warn) termWrite('sh: write error: ' + ow.warn + '\n');
        carry = '';
      } else {
        carry = stdout;
      }
    }
    if (carry) termWrite(carry);
    lastExit = code;
  }

  function runSimple(argv, stdin, io) {
    if (!argv.length) return { code: 0, stdout: '', stderr: '' };
    var name = argv[0];
    var out = [], err = [];
    var ctx = {
      args: argv.slice(1),
      argv0: name,
      stdin: stdin || '',
      tty: !!io.tty,
      out: function(s) { out.push(s); },
      println: function(s) { out.push(s + '\n'); },
      err: function(s) { err.push(s + '\n'); },
      error: function(s) { err.push(name + ': ' + s + '\n'); }
    };
    var fn = builtins[name] || applets[name];
    if (!fn) return { code: 127, stdout: '', stderr: 'sh: ' + name + ': not found\n' };
    var code;
    try { code = fn(ctx) || 0; }
    catch (e) { code = 1; err.push(name + ': ' + (e && e.message ? e.message : 'error') + '\n'); }
    return { code: code, stdout: out.join(''), stderr: err.join('') };
  }

  function runScript(content) {
    // the tokenizer treats newlines as ';' and understands multi-line
    // if/for/while blocks, so a script is just one big command line
    runCommandLine(String(content || ''));
  }

