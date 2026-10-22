#!/usr/bin/env bash
# Builds and runs the C++ test program for flood-limiter-gateway.patch and certifier-lockout.patch. Run it in Git Bash.
#   SOURCE  the server source folder (default: the Source folder next to FlyffWeb)
#   VCVARS  vcvars32.bat of Visual Studio 2022 (default: the Professional edition's)
#   BUILD   the folder to build in (default: $TEMP/flyffweb-limits-test)
# Prints PASS and exits 0, or prints each failed check and exits 1.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
SOURCE="${SOURCE:-$here/../../../Source}"
VCVARS="${VCVARS:-C:\\Program Files\\Microsoft Visual Studio\\2022\\Professional\\VC\\Auxiliary\\Build\\vcvars32.bat}"
BUILD="${BUILD:-$TEMP/flyffweb-limits-test}"

mkdir -p "$BUILD/src" "$BUILD/Resource"
rm -f "${BUILD:?}/src/"*.obj "${BUILD:?}/src/limits-test.exe"
cp "$here/stub/stdafx.h" "$here/limits-test.cpp" "$BUILD/src/"
cp "$here/stub/Resource/lang.h" "$BUILD/Resource/"	# AccountMgr.cpp includes ..\Resource\lang.h
cp "$SOURCE/_Network/Misc/Include/dos2.h" "$SOURCE/_Network/Misc/Src/dos2.cpp" "$BUILD/src/"
cp "$SOURCE/_Network/Misc/Include/MEMPOOLER.H" "$BUILD/src/mempooler.h"
cp "$SOURCE/CERTIFIER/AccountMgr.h" "$SOURCE/CERTIFIER/AccountMgr.cpp" "$BUILD/src/"

# x86, like the servers: MemPooler casts pointers to DWORD.
printf '@echo off\r\ncd /d "%%~dp0"\r\ncall "%s" >nul 2>&1 || exit /b 1\r\ncl /nologo /EHsc /W3 /Fe:limits-test.exe limits-test.cpp dos2.cpp AccountMgr.cpp ws2_32.lib user32.lib || exit /b 1\r\n' "$VCVARS" > "$BUILD/src/build.bat"
cmd //c "$(cygpath -w "$BUILD/src/build.bat")"
"$BUILD/src/limits-test.exe"
