// The test program for cache-client-addr.patch. run-cache-test.sh builds it with GatewayAddr.cpp from
// Source\CACHESERVER\ and the stand-in stdafx.h in stub\cache\, then runs it: it prints PASS, or each failed check, and
// exits with 0 only when nothing failed.
//
// What it checks is what CDPCacheSrvr::OnGatewayClientAddr (CACHESERVER/DPCacheSrvr.cpp) decides with
// AcceptClientAddr: the player's address a gateway sends is taken only from a listed gateway (the connection's own
// address, as CDPMng::GetPlayerAddr writes it), only before JOIN, and only when it is a dotted IPv4 address.
#include "stdafx.h"
#include <stdio.h>
#include "GatewayAddr.h"

static int s_nFailed	= 0;

#define	CHECK( cond, name )	\
	do { if( !( cond ) ) { printf( "FAIL %s (line %d)\n", (const char*)( name ), __LINE__ ); s_nFailed++; } } while( 0 )

static const char*	GATEWAY	= "127.0.0.1";		// CacheServer.ini 'Gateway "127.0.0.1"'
static const char*	PLAYER	= "203.0.113.5";	// the address the gateway sends

static void TestAcceptsFromListedGatewayBeforeJoin()
{
	CGatewayList gateways;
	CHECK( gateways.Add( GATEWAY ) == TRUE, "Add 127.0.0.1" );
	CHECK( gateways.IsListed( GATEWAY ) == TRUE, "127.0.0.1 is listed" );
	CHECK( AcceptClientAddr( gateways, GATEWAY, FALSE, PLAYER ) == TRUE, "accepts the address from a listed gateway before JOIN" );
	CHECK( AcceptClientAddr( gateways, GATEWAY, FALSE, "255.255.255.254" ) == TRUE, "15 characters, the most there are" );
}

static void TestRefusesAfterJoin()
{
	CGatewayList gateways;
	gateways.Add( GATEWAY );
	CHECK( AcceptClientAddr( gateways, GATEWAY, TRUE, PLAYER ) == FALSE, "refuses it after JOIN" );
}

static void TestRefusesFromUnlistedAddress()
{
	CGatewayList gateways;
	CHECK( AcceptClientAddr( gateways, GATEWAY, FALSE, PLAYER ) == FALSE, "with no Gateway line, nothing is accepted" );
	gateways.Add( GATEWAY );
	CHECK( AcceptClientAddr( gateways, "198.51.100.7", FALSE, PLAYER ) == FALSE, "refuses it from an unlisted address" );
	CHECK( AcceptClientAddr( gateways, PLAYER, FALSE, PLAYER ) == FALSE, "the address it claims doesn't make a peer listed" );
	CHECK( AcceptClientAddr( gateways, "", FALSE, PLAYER ) == FALSE, "a peer address GetPlayerAddr could not read" );
	CHECK( gateways.IsListed( "127.0.0.2" ) == FALSE, "only the listed address" );
}

// The certifier's bad list (limits-test.cpp, TestAddExemptRefusesBadAddresses): IsDottedIPv4 is the same rule.
static void TestRefusesBadAddress()
{
	const char* bad[]	= { "", "127.0.0", "127.0.0.1.5", "1.2.3.a", " 127.0.0.1", "127.0.0.1x", "256.1.1.1", "255.255.255.255", "1234567890123456" };
	CGatewayList gateways;
	gateways.Add( GATEWAY );
	for( int i = 0; i < (int)( sizeof(bad) / sizeof(bad[0]) ); i++ )
	{
		CHECK( IsDottedIPv4( bad[i] ) == FALSE, bad[i] );
		CHECK( AcceptClientAddr( gateways, GATEWAY, FALSE, bad[i] ) == FALSE, bad[i] );
		CHECK( gateways.Add( bad[i] ) == FALSE, bad[i] );		// nor is it taken as a gateway
		CHECK( gateways.IsListed( bad[i] ) == FALSE, bad[i] );
	}
	CHECK( gateways.GetCount() == 1, "no bad address was added" );
	CHECK( IsDottedIPv4( "10.0.0.9" ) == TRUE, "a good address" );
}

static void TestNinthGatewayIsNotAdded()
{
	CGatewayList gateways;
	char sz[16];
	for( int i = 1; i <= 8; i++ )
	{
		wsprintf( sz, "10.0.0.%d", i );
		CHECK( gateways.Add( sz ) == TRUE, sz );
	}
	CHECK( gateways.Add( "10.0.0.9" ) == FALSE, "a ninth gateway is not added" );
	CHECK( gateways.GetCount() == 8, "8 gateways" );
	CHECK( gateways.IsListed( "10.0.0.9" ) == FALSE, "the ninth isn't listed" );
	CHECK( gateways.IsListed( "10.0.0.8" ) == TRUE, "the eighth is" );
	CHECK( AcceptClientAddr( gateways, "10.0.0.9", FALSE, PLAYER ) == FALSE, "and nothing is accepted from it" );
}

int main()
{
	TestAcceptsFromListedGatewayBeforeJoin();
	TestRefusesAfterJoin();
	TestRefusesFromUnlistedAddress();
	TestRefusesBadAddress();
	TestNinthGatewayIsNotAdded();

	if( s_nFailed > 0 )
	{
		printf( "FAILED %d check(s)\n", s_nFailed );
		return 1;
	}
	printf( "PASS\n" );
	return 0;
}
