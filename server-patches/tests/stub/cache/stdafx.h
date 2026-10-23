// Stand-in for the cache server's stdafx.h (Source/CACHESERVER/StdAfx.h), for the cache test program only: the
// Windows headers that GatewayAddr.h and GatewayAddr.cpp use (BOOL, u_long, inet_addr, lstrlen).
#pragma once

#define _WINSOCK_DEPRECATED_NO_WARNINGS	// inet_addr, as the servers use it (CacheServer.vcxproj defines it too)
#include <winsock2.h>
#include <windows.h>
