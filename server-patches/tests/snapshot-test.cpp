// The test program for world-snapshot-index.patch. run-snapshot-test.sh builds it with Snapshot.h and Snapshot.cpp
// from Source\WORLDSERVER and the stand-ins in stub\snapshot\, then runs it: it prints PASS, or each failed check,
// and exits with 0 only when nothing failed.
#include "stdafx.h"
#include <stdio.h>
#include "Snapshot.h"

// Source/_Network/MsgHdr.h:99 and :259.
#define	PACKETTYPE_JOIN		(DWORD)0x0000ff00
#define	PACKETTYPE_SNAPSHOT	(DWORD)0xffffff00

static int s_nFailed	= 0;

#define	CHECK( cond, name )	\
	do { if( !( cond ) ) { printf( "FAIL %s (line %d)\n", (const char*)( name ), __LINE__ ); s_nFailed++; } } while( 0 )

static const DPID	USER	= 7;		// the player's DPID on the cache server
static const OBJID	PLAYER	= 0x1234;	// the player's object ID

// What CUser::Notify (Source/WORLDSERVER/User.cpp:585) does with a bundle, without its IsValid and m_dwDestroyTime
// checks: append the table of contents, put the count into the header, send (here: return the bytes), set the type to
// SNAPSHOT for the next bundle, and rewind to the first message.
static vector<BYTE> Notify( CSnapshot & snap )
{
	static u_int uOffset	= sizeof(DPID)+sizeof(DWORD)+sizeof(OBJID)+sizeof(short);
	LPBYTE lpBuf;
	int nBufSize;
	vector<BYTE> sent;

	if( snap.cb > 0 )
	{
		snap.AppendIndex( uOffset );
		lpBuf	= snap.ar.GetBuffer( &nBufSize );
		*(UNALIGNED WORD*)( lpBuf + sizeof(DPID) + sizeof(DWORD) + sizeof(OBJID) )	= snap.cb;
		sent.assign( lpBuf, lpBuf + nBufSize );
		*(UNALIGNED DWORD*)( lpBuf + sizeof(DPID) )		= PACKETTYPE_SNAPSHOT;
		snap.cb	= 0;
		snap.ar.ReelIn( uOffset );
	}
	return sent;
}

// A message as CUser's writers add one: cb++, then the object ID, the type and nFields bytes of fields.
static void Add( CSnapshot & snap, OBJID objid, WORD wType, int nFields )
{
	snap.cb++;
	snap.ar << objid << wType;
	for( int i = 0; i < nFields; i++ )
		snap.ar << (BYTE)( 0xa0 + i );
}

// A snapshot for USER with a JOIN header, as CUser::Open (User.cpp:315) starts one.
static void Join( CSnapshot & snap )
{
	snap.dpidUser	= USER;
	snap.SetSnapshot( PLAYER, PACKETTYPE_JOIN );
}

static BOOL SameBytes( const vector<BYTE> & got, const BYTE* want, int nWant )
{
	if( (int)got.size() != nWant )
	{
		printf( "  %d bytes, not %d\n", (int)got.size(), nWant );
		return FALSE;
	}
	for( int i = 0; i < nWant; i++ )
		if( got[i] != want[i] )
		{
			printf( "  byte %d is %02x, not %02x\n", i, got[i], want[i] );
			return FALSE;
		}
	return TRUE;
}

// The starts the count recorded, as offsets from the first byte after the count field (byte 14).
static BOOL StartsAre( const CSnapshotCount & cb, const u_long* auStart, int nStart )
{
	if( cb.Count() != nStart )
		return FALSE;
	for( int i = 0; i < nStart; i++ )
		if( cb.Start( i ) != 14 + auStart[i] )
			return FALSE;
	return TRUE;
}

////////////////////////////////////////////////////////////////////////////////

static void TestStartsAreRecordedAtEachIncrement()
{
	CSnapshot snap;
	Join( snap );
	CHECK( snap.ar.GetOffset() == 14, "the header is 14 bytes (the count is written as 2)" );
	CHECK( snap.cb.Count() == 0, "no starts before the first message" );

	Add( snap, 0x100, 0x00f1, 0 );		// 6 bytes
	Add( snap, 0x101, 0x00ce, 4 );		// 10 bytes
	Add( snap, 0x102, 0x00f1, 0 );		// 6 bytes

	const u_long auStart[]	= { 0, 6, 16 };
	CHECK( StartsAre( snap.cb, auStart, 3 ), "starts are recorded at each cb++: 0, 6, 16 from byte 14" );
	CHECK( (short)snap.cb == 3, "cb counts like the short it was" );
	CHECK( snap.cb > 0, "cb compares like the short it was" );
}

static void TestTheTrailerIsStartsCountMarker()
{
	CSnapshot snap;
	Join( snap );
	Add( snap, 0x100, 0x00f1, 0 );
	Add( snap, 0x101, 0x00ce, 4 );
	Add( snap, 0x102, 0x00f1, 0 );

	const BYTE want[]	=
	{
		0x07, 0x00, 0x00, 0x00,		// DPID (the cache server takes it off)
		0x00, 0xff, 0x00, 0x00,		// PACKETTYPE_JOIN
		0x34, 0x12, 0x00, 0x00,		// the player's object ID
		0x03, 0x00,					// count
		0x00, 0x01, 0x00, 0x00,  0xf1, 0x00,							// message 0
		0x01, 0x01, 0x00, 0x00,  0xce, 0x00,  0xa0, 0xa1, 0xa2, 0xa3,	// message 1
		0x02, 0x01, 0x00, 0x00,  0xf1, 0x00,							// message 2
		0x00, 0x00, 0x00, 0x00,		// start of message 0
		0x06, 0x00, 0x00, 0x00,		// start of message 1
		0x10, 0x00, 0x00, 0x00,		// start of message 2
		0x03, 0x00,					// count again
		0x54, 0x4f, 0x43, 0x31,		// marker 0x31434F54, "TOC1"
	};
	CHECK( SameBytes( Notify( snap ), want, sizeof(want) ), "the trailer is starts, count, marker" );
	CHECK( snap.ar.GetOffset() == 14, "Notify rewinds to the first message (the trailer goes too)" );
	CHECK( snap.cb == 0 && snap.cb.Count() == 0, "Notify's cb = 0 clears the starts" );
}

static void TestSetSnapshotAndFlushClearTheStarts()
{
	CSnapshot snap;
	Join( snap );
	Add( snap, 0x100, 0x00f1, 0 );
	Add( snap, 0x101, 0x00f1, 0 );
	snap.SetSnapshot( PLAYER, PACKETTYPE_JOIN );
	CHECK( snap.cb == 0 && snap.cb.Count() == 0, "SetSnapshot clears the starts" );
	CHECK( snap.ar.GetOffset() == 14, "SetSnapshot writes the header again" );

	Add( snap, 0x100, 0x00f1, 0 );
	snap.Flush();
	CHECK( snap.cb == 0 && snap.cb.Count() == 0, "Flush clears the starts" );
	CHECK( snap.ar.GetOffset() == 0, "Flush empties the archive" );

	CSnapshot fresh;
	CHECK( fresh.cb == 0 && fresh.cb.Count() == 0, "a new snapshot has no starts" );
	CHECK( Notify( fresh ).empty(), "an empty snapshot sends nothing" );
}

static void TestASecondBundleAfterReelInHasOnlyItsOwnStarts()
{
	CSnapshot snap;
	Join( snap );
	Add( snap, 0x100, 0x00f1, 0 );
	Add( snap, 0x101, 0x00ce, 4 );
	Add( snap, 0x102, 0x00f1, 0 );
	Notify( snap );

	Add( snap, 0x200, 0x00ce, 2 );		// 8 bytes
	Add( snap, 0x201, 0x00f1, 0 );		// 6 bytes
	const u_long auStart[]	= { 0, 8 };
	CHECK( StartsAre( snap.cb, auStart, 2 ), "a second bundle after ReelIn has only its own starts" );

	const BYTE want[]	=
	{
		0x07, 0x00, 0x00, 0x00,		// DPID
		0x00, 0xff, 0xff, 0xff,		// PACKETTYPE_SNAPSHOT, set by the first Notify
		0x34, 0x12, 0x00, 0x00,		// the player's object ID
		0x02, 0x00,					// count
		0x00, 0x02, 0x00, 0x00,  0xce, 0x00,  0xa0, 0xa1,				// message 0
		0x01, 0x02, 0x00, 0x00,  0xf1, 0x00,							// message 1
		0x00, 0x00, 0x00, 0x00,		// start of message 0
		0x08, 0x00, 0x00, 0x00,		// start of message 1
		0x02, 0x00,					// count again
		0x54, 0x4f, 0x43, 0x31,		// marker
	};
	CHECK( SameBytes( Notify( snap ), want, sizeof(want) ), "the second bundle's bytes" );
}

int main()
{
	TestStartsAreRecordedAtEachIncrement();
	TestTheTrailerIsStartsCountMarker();
	TestSetSnapshotAndFlushClearTheStarts();
	TestASecondBundleAfterReelInHasOnlyItsOwnStarts();
	if( s_nFailed )
	{
		printf( "%d check(s) failed\n", s_nFailed );
		return 1;
	}
	printf( "PASS\n" );
	return 0;
}
