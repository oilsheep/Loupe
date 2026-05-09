#!/usr/bin/env python3
"""Read electron-updater yml from stdin, prepend ../<version>/ to relative
file references, write to stdout.

The publish-update + rollback CI scripts use this so the loupe/latest/
ymls reference binaries living one directory up at loupe/<version>/.
This keeps loupe/latest/ slim (just two yml files) instead of duplicating
every release's binaries."""

import re
import sys

if len(sys.argv) != 2:
    print("usage: yml-prefix.py <version>", file=sys.stderr)
    sys.exit(2)

version = sys.argv[1]
text = sys.stdin.read()


def prepend(match: re.Match) -> str:
    return f"{match.group(1)}../{version}/{match.group(2)}"


# `  - url: filename.dmg` (inside files: array)
text = re.sub(r"^(\s*-\s*url:\s+)(?!\.\.)(\S.*)$", prepend, text, flags=re.MULTILINE)
# `path: filename.zip` (top-level pointer)
text = re.sub(r"^(path:\s+)(?!\.\.)(\S.*)$", prepend, text, flags=re.MULTILINE)

sys.stdout.write(text)
