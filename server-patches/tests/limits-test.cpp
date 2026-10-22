// The test program for flood-limiter-gateway.patch and certifier-lockout.patch. run-limits-test.sh builds it with
// dos2.cpp and AccountMgr.cpp from Source\ and the stand-ins in stub\, then runs it: it prints PASS, or each failed
// check, and exits with 0 only when nothing failed.
#include "stdafx.h"
#include <stdio.h>
#include "dos2.h"
#include "AccountMgr.h"
#include "..\Resource\lang.h"

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
// Wrong-password count (CAccountMgr)

static const DWORD	A	= inet_addr( "198.51.100.1" );
static const DWORD	B	= inet_addr( "198.51.100.2" );
static const time_t	T	= 1000000;

// What Certify does with a wrong password: Check, then count it (whatever Check answered).
static void Wrong( CAccountMgr & mgr, DWORD dwIP, const char* lpszAccount )
{
	mgr.Check( dwIP, lpszAccount );
	mgr.SetError( 1 );
}

// 3 wrong passwords at g_tTestTime.
static void Wrong3( CAccountMgr & mgr, DWORD dwIP, const char* lpszAccount )
{
	for( int i = 0; i < 3; i++ )
		Wrong( mgr, dwIP, lpszAccount );
}

// The full map of the two tests below: (A, "first") 3 wrong at T, (A, "second") 3 wrong at T + 1, and one wrong at
// T + 2 for each of MAX_ACCOUNT_CACHE - 2 other accounts.
static void Fill( CAccountMgr & mgr )
{
	g_tTestTime	= T;		Wrong3( mgr, A, "first" );
	g_tTestTime	= T + 1;	Wrong3( mgr, A, "second" );
	g_tTestTime	= T + 2;
	char sz[16];
	for( int i = 0; i < MAX_ACCOUNT_CACHE - 2; i++ )
	{
		wsprintf( sz, "n%d", i );
		Wrong( mgr, A, sz );
	}
}

static void TestOneWrongBlocksOnlyThatPair()
{
	g_tTestTime	= T;
	CAccountMgr mgr;
	Wrong( mgr, A, "acc1" );
	g_tTestTime	= T + 10;
	CHECK( mgr.Check( A, "acc1" ) == CHECK_1TIMES_ERROR, "one wrong blocks that pair for 15 s" );
	CHECK( mgr.Check( B, "acc1" ) == CHECK_OK, "the same account from another address" );
	CHECK( mgr.Check( A, "acc2" ) == CHECK_OK, "another account from the same address" );
	CHECK( mgr.Size() == 1, "Check never adds a pair" );
	g_tTestTime	= T + 16;
	CHECK( mgr.Check( A, "acc1" ) == CHECK_OK, "free after 16 s" );
}

static void TestThreeWrongBlockFifteenMinutesAndAgain()
{
	CAccountMgr mgr;
	g_tTestTime	= T;		Wrong( mgr, A, "acc1" );
	g_tTestTime	= T + 16;	Wrong( mgr, A, "acc1" );
	g_tTestTime	= T + 32;	Wrong( mgr, A, "acc1" );
	g_tTestTime	= T + 33;
	CHECK( mgr.Check( A, "acc1" ) == CHECK_3TIMES_ERROR, "three wrong block" );
	g_tTestTime	= T + 32 + 900;
	CHECK( mgr.Check( A, "acc1" ) == CHECK_3TIMES_ERROR, "still blocked 15 min after the last" );
	g_tTestTime	= T + 32 + 901;
	CHECK( mgr.Check( A, "acc1" ) == CHECK_OK, "free after 15 min" );
	mgr.SetError( 1 );
	CHECK( mgr.Check( A, "acc1" ) == CHECK_3TIMES_ERROR, "the next wrong blocks 15 min again" );
}

static void TestGoodLoginClears()
{
	g_tTestTime	= T;
	CAccountMgr mgr;
	Wrong3( mgr, A, "acc1" );
	g_tTestTime	= T + 901;
	CHECK( mgr.Check( A, "acc1" ) == CHECK_OK, "free after the block" );
	mgr.SetError( 0 );		// a good login
	CHECK( mgr.Size() == 0, "a good login forgets the pair" );
	Wrong( mgr, A, "acc1" );
	CHECK( mgr.Check( A, "acc1" ) == CHECK_1TIMES_ERROR, "the count started over" );
}

static void TestForgottenAfterOneDay()
{
	g_tTestTime	= T;
	CAccountMgr mgr;
	Wrong3( mgr, A, "acc1" );
	Wrong3( mgr, B, "acc1" );
	g_tTestTime	= T + 86400;
	Wrong( mgr, A, "acc1" );
	CHECK( mgr.Check( A, "acc1" ) == CHECK_3TIMES_ERROR, "kept for 24 h" );
	g_tTestTime	= T + 86401;
	Wrong( mgr, B, "acc1" );
	CHECK( mgr.Check( B, "acc1" ) == CHECK_1TIMES_ERROR, "forgotten after 24 h, started over" );
}

static void TestKoreanHasNoShortBlock()
{
	g_tTestTime		= T;
	g_nTestLanguage	= LANG_KOR;
	CAccountMgr mgr;
	Wrong( mgr, A, "acc1" );
	CHECK( mgr.Check( A, "acc1" ) == CHECK_OK, "no 15 s block in Korean" );
	g_nTestLanguage	= 1;
}

static void TestFullMapDropsTheOldestFirst()
{
	CAccountMgr mgr;
	Fill( mgr );
	CHECK( mgr.Size() == MAX_ACCOUNT_CACHE, "the map is full" );
	g_tTestTime	= T + 60;
	Wrong( mgr, A, "new" );
	CHECK( mgr.Size() == MAX_ACCOUNT_CACHE, "a full map stays at its cap" );
	CHECK( mgr.Check( A, "first" ) == CHECK_OK, "the oldest pair is dropped" );
	CHECK( mgr.Check( A, "second" ) == CHECK_3TIMES_ERROR, "the next oldest is kept" );
	CHECK( mgr.Check( A, "new" ) == CHECK_1TIMES_ERROR, "the new pair is counted" );
}

static void TestFullMapDropsExpiredPairsFirst()
{
	CAccountMgr mgr;
	Fill( mgr );
	g_tTestTime	= T + 3600;
	Wrong3( mgr, A, "late" );			// the map is full: "first" goes
	g_tTestTime	= T + 86400 + 3;
	Wrong( mgr, A, "new" );				// everything from T + 1 and T + 2 is over 24 h old
	CHECK( mgr.Size() == 2, "every expired pair is removed at once" );
	CHECK( mgr.Check( A, "late" ) == CHECK_OK, "its block is long over" );
	mgr.SetError( 1 );
	CHECK( mgr.Check( A, "late" ) == CHECK_3TIMES_ERROR, "but its count was kept" );
}

////////////////////////////////////////////////////////////////////////////////

int main()
{
	TestExemptAddressIsNeverRefused();
	TestUnlistedAddressIsBlockedAsToday();
	TestAddExemptRefusesBadAddresses();		// last of the CDos2 tests: it fills the static skip list

	TestOneWrongBlocksOnlyThatPair();
	TestThreeWrongBlockFifteenMinutesAndAgain();
	TestGoodLoginClears();
	TestForgottenAfterOneDay();
	TestKoreanHasNoShortBlock();
	TestFullMapDropsTheOldestFirst();
	TestFullMapDropsExpiredPairsFirst();

	if( s_nFailed > 0 )
	{
		printf( "FAILED %d check(s)\n", s_nFailed );
		return 1;
	}
	printf( "PASS\n" );
	return 0;
}
