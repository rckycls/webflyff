// Stand-in for the servers' stdafx.h, for the limits test program only: the Windows and C++ headers that dos2.cpp
// and AccountMgr.cpp use, the few server macros they need, and a test clock in place of GetTickCount and time.
#pragma once

#define _WINSOCK_DEPRECATED_NO_WARNINGS	// inet_addr, as the servers use it
#include <winsock2.h>
#include <windows.h>
#include <assert.h>
#include <ctime>
#include <list>
#include <map>
#include <string>
using namespace std;

#define	ASSERT( x )			assert( x )
#define	SAFE_DELETE( p )	{ if( p ) { delete ( p ); ( p ) = NULL; } }
#define	safe_delete( p )	{ delete ( p ); }
#define	MIN( x )	( 1000 * 60 * ( (int)x ) )
#define	SEC( x )	( 1000 * ( (int)x ) )
inline void Error( const char*, ... ) {}

// The test clock, set by limits-test.cpp.
DWORD	TestTickCount( void );
time_t	TestTime( void );

// The parts of Source/_Common/timer.h that CDos2 uses, on the test clock.
class CTimer
{
	DWORD	m_dwInterval;
	DWORD	m_dwEnd;
public:
	CTimer() : m_dwInterval( 0 ), m_dwEnd( 0 )	{}
	void	Set( float fInterval, BOOL = FALSE )	{	m_dwInterval = (DWORD)fInterval;	Reset();	}
	void	Reset( void )	{	m_dwEnd = TestTickCount() + m_dwInterval;	}
	BOOL	IsTimeOut( void )	{	return TestTickCount() >= m_dwEnd;	}
};

// Only after every header: the code under test reads the test clock.
#define	GetTickCount	TestTickCount
#define	time( p )	TestTime()
