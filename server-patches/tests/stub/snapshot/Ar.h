// Stand-in for Source/_Network/Misc/Include/ar.h, for the snapshot test program only: a storing CAr with the members
// Snapshot.h, Snapshot.cpp and snapshot-test.cpp use. Each one does what the real one does to the bytes and the
// offset (ar.h, ar.cpp); the real one's heap manager and fixed first buffer are left out.
#pragma once

#include <vector>

class CAr
{
public:
	CAr()	{}

	// CAr::Write (ar.cpp:66): the bytes go at the offset, which moves past them.
	void	Write( const void* lpBuf, u_int nSize )
		{	const BYTE* p = (const BYTE*)lpBuf;		m_buf.insert( m_buf.end(), p, p + nSize );	}
	// CAr::GetBuffer (ar.cpp:172): the first byte, and the bytes written so far.
	LPBYTE	GetBuffer( int* pnBufSize )
		{	*pnBufSize = (int)m_buf.size();		return m_buf.empty() ? NULL : &m_buf[0];	}
	// CAr::GetOffset (ar.h:188): the bytes written so far.
	u_long	GetOffset( void )	{	return (u_long)m_buf.size();	}
	// CAr::Flush (ar.cpp:181): back to the first byte.
	void	Flush( void )	{	m_buf.clear();	}
	// CAr::ReelIn (ar.cpp:187): back to uOffset; the bytes before it stay.
	void	ReelIn( u_int uOffset )	{	ASSERT( uOffset <= m_buf.size() );	m_buf.resize( uOffset );	}

	// The insertion operators of ar.h:47-57 (defined at ar.h:98-121): little-endian, int and unsigned as LONG, short
	// as WORD, char as BYTE.
	CAr& operator<<( BYTE by )		{	Write( &by, sizeof(by) );	return *this;	}
	CAr& operator<<( WORD w )		{	Write( &w, sizeof(w) );		return *this;	}
	CAr& operator<<( LONG l )		{	Write( &l, sizeof(l) );		return *this;	}
	CAr& operator<<( DWORD dw )		{	Write( &dw, sizeof(dw) );	return *this;	}
	CAr& operator<<( float f )		{	Write( &f, sizeof(f) );		return *this;	}
	CAr& operator<<( double d )		{	Write( &d, sizeof(d) );		return *this;	}
	CAr& operator<<( int i )		{	return operator<<( (LONG)i );	}
	CAr& operator<<( short w )		{	return operator<<( (WORD)w );	}
	CAr& operator<<( char ch )		{	return operator<<( (BYTE)ch );	}
	CAr& operator<<( unsigned u )	{	return operator<<( (LONG)u );	}

private:
	std::vector<BYTE>	m_buf;
};
