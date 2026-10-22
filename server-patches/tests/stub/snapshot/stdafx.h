// Stand-in for the world server's stdafx.h (Source/WORLDSERVER/stdafx.h), for the snapshot test program only: the
// Windows and C++ headers that Snapshot.h and Snapshot.cpp use, ASSERT, and OBJID.
#pragma once

#include <winsock2.h>
#include <windows.h>
#include <assert.h>
#include <vector>
using namespace std;

#define	ASSERT( x )		assert( x )

typedef	DWORD	OBJID;		// Source/_Network/Objects/Obj.h:42
