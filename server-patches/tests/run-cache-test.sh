#!/usr/bin/env bash
# Builds and runs the C++ test program for cache-client-addr.patch. Run it in Git Bash.
#   SOURCE  the server source folder (default: the Source folder next to FlyffWeb)
#   VCVARS  vcvars32.bat of Visual Studio 2022 (default: the Professional edition's)
#   BUILD   the folder to build in (default: $TEMP/flyffweb-cache-test)
# Prints PASS and exits 0, or prints each failed check and exits 1.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
SOURCE="${SOURCE:-$here/../../../Source}"
VCVARS="${VCVARS:-C:\\Program Files\\Microsoft Visual Studio\\2022\\Professional\\VC\\Auxiliary\\Build\\vcvars32.bat}"
BUILD="${BUILD:-$TEMP/flyffweb-cache-test}"

mkdir -p "$BUILD/src"
rm -f "${BUILD:?}/src/"*.obj "${BUILD:?}/src/cache-test.exe" "${BUILD:?}/src/GatewayAddr."*
# The stand-in for stdafx.h, then the code under test: only the address rules, without the network code.
cp "$here/stub/cache/stdafx.h" "$here/cache-test.cpp" "$BUILD/src/"
cp "$SOURCE/CACHESERVER/GatewayAddr.h" "$SOURCE/CACHESERVER/GatewayAddr.cpp" "$BUILD/src/"

# x86, like the servers.
printf '@echo off\r\ncd /d "%%~dp0"\r\ncall "%s" >nul 2>&1 || exit /b 1\r\ncl /nologo /EHsc /W3 /Fe:cache-test.exe cache-test.cpp GatewayAddr.cpp ws2_32.lib user32.lib || exit /b 1\r\n' "$VCVARS" > "$BUILD/src/build.bat"
cmd //c "$(cygpath -w "$BUILD/src/build.bat")"
"$BUILD/src/cache-test.exe"
