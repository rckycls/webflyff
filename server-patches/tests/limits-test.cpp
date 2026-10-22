// The test program for flood-limiter-gateway.patch and certifier-lockout.patch. run-limits-test.sh builds it with
// dos2.cpp and AccountMgr.cpp from Source\ and the stand-ins in stub\, then runs it: it prints PASS, or each failed
// check, and exits with 0 only when nothing failed.
#include "stdafx.h"
#include <stdio.h>
#include "dos2.h"

DWORD	g_dwTestTick	= 1000;
time_t	g_tTestTime		= 1000000;
int		g_nTestLanguage	= 1;	// English, as the servers are built

DWORD	TestTickCount( void )	{	return g_dwTestTick;	}
time_t	TestTime( void )		{	return g_tTestTime;	}
int		GetLanguage( void )		{	return g_nTestLanguage;	}

static int s_nFailed	= 0;

#define	CHECK( cond, name )	\
	do { if( !( cond ) ) { printf( "FAIL %s (line %d)\n", (const char*)( name ), __LINE__ ); s_nFailed++; } } while( 0 )

static const u_long	LOOPBACK	= inet_addr( "127.0.0.1" );
static const u_long	OTHER		= inet_addr( "203.0.113.5" );

////////////////////////////////////////////////////////////////////////////////
// Flood limiter (CDos2)

static void TestExemptAddressIsNeverRefused()
{
	CHECK( CDos2::AddExempt( "127.0.0.1" ) == TRUE, "AddExempt 127.0.0.1" );
	CDos2 dos;
	int nNotZero	= 0;
	for( int i = 0; i < 1000; i++ )		// 1,000 connections, 0 ms apart
		if( dos.IsOver( LOOPBACK ) != 0 ) nNotZero++;
	CHECK( nNotZero == 0, "a listed address is never refused" );
}

static void TestUnlistedAddressIsBlockedAsToday()
{
	CDos2 dos;
	for( int i = 1; i <= 50; i++ )
		CHECK( dos.IsOver( OTHER ) == 0, "connections 1-50 pass" );
	CHECK( dos.IsOver( OTHER ) == -1, "the 51st shuts the address down" );
	CHECK( dos.IsOver( OTHER ) == 1, "later ones are closed" );
	g_dwTestTick	+= MIN( 10 ) + 1;		// the 10-minute release timer fires
	CHECK( dos.IsOver( OTHER ) == 0, "released after the timer" );
}

static void TestAddExemptRefusesBadAddresses()
{
	const char* bad[]	= { "", "127.0.0", "127.0.0.1.5", "1.2.3.a", " 127.0.0.1", "127.0.0.1x", "256.1.1.1", "255.255.255.255", "1234567890123456" };
	for( int i = 0; i < (int)( sizeof(bad) / sizeof(bad[0]) ); i++ )
		CHECK( CDos2::AddExempt( bad[i] ) == FALSE, bad[i] );
	// 127.0.0.1 is already listed; 7 more fill the list, the ninth is refused.
	char sz[16];
	for( int i = 1; i <= 7; i++ )
	{
		wsprintf( sz, "10.0.0.%d", i );
		CHECK( CDos2::AddExempt( sz ) == TRUE, sz );
	}
	CHECK( CDos2::AddExempt( "10.0.0.8" ) == FALSE, "a ninth address" );
	CDos2 dos;		// and a refused address is counted like any other
	for( int i = 1; i <= 50; i++ )
		dos.IsOver( inet_addr( "10.0.0.8" ) );
	CHECK( dos.IsOver( inet_addr( "10.0.0.8" ) ) == -1, "a refused address is not skipped" );
}

////////////////////////////////////////////////////////////////////////////////

int main()
{
	TestExemptAddressIsNeverRefused();
	TestUnlistedAddressIsBlockedAsToday();
	TestAddExemptRefusesBadAddresses();		// last: it fills the static skip list

	if( s_nFailed > 0 )
	{
		printf( "FAILED %d check(s)\n", s_nFailed );
		return 1;
	}
	printf( "PASS\n" );
	return 0;
}
