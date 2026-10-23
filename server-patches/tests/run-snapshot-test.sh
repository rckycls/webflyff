#!/usr/bin/env bash
# Builds and runs the C++ test program for world-snapshot-index.patch. Run it in Git Bash.
#   SOURCE  the server source folder (default: the Source folder next to FlyffWeb)
#   VCVARS  vcvars32.bat of Visual Studio 2022 (default: the Professional edition's)
#   BUILD   the folder to build in (default: $TEMP/flyffweb-snapshot-test)
# Prints PASS and exits 0, or prints each failed check and exits 1.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
SOURCE="${SOURCE:-$here/../../../Source}"
VCVARS="${VCVARS:-C:\\Program Files\\Microsoft Visual Studio\\2022\\Professional\\VC\\Auxiliary\\Build\\vcvars32.bat}"
BUILD="${BUILD:-$TEMP/flyffweb-snapshot-test}"

mkdir -p "$BUILD/src"
rm -f "${BUILD:?}/src/"*.obj "${BUILD:?}/src/snapshot-test.exe"
# The stand-ins for stdafx.h, Ar.h, mempooler.h and <DPlay.h> (found through /I.), then the code under test.
cp "$here/stub/snapshot/stdafx.h" "$here/stub/snapshot/Ar.h" "$here/stub/snapshot/mempooler.h" \
	"$here/stub/snapshot/DPlay.h" "$here/snapshot-test.cpp" "$BUILD/src/"
cp "$SOURCE/WORLDSERVER/Snapshot.h" "$SOURCE/WORLDSERVER/Snapshot.cpp" "$BUILD/src/"

# x86, like the servers.
printf '@echo off\r\ncd /d "%%~dp0"\r\ncall "%s" >nul 2>&1 || exit /b 1\r\ncl /nologo /EHsc /W3 /I. /Fe:snapshot-test.exe snapshot-test.cpp Snapshot.cpp || exit /b 1\r\n' "$VCVARS" > "$BUILD/src/build.bat"
cmd //c "$(cygpath -w "$BUILD/src/build.bat")"
"$BUILD/src/snapshot-test.exe"
