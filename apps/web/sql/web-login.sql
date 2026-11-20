-- The web service's SQL Server login (website spec section 3.6). Install-WebLogin.ps1 runs it in the VM and fills in
-- the password variable; it can be run again (it then sets the password anew and keeps the rest).
--
-- It makes:
--   CHARACTER_01_DBF.dbo.WEB_NOT_COUNTED: accounts whose characters are never counted as players (filled by the
--   server's own scripts; the web service never writes it);
--   CHARACTER_01_DBF.dbo.usp_WebOnlineCount: the characters in a world now (CHARACTER_TBL.MultiServer > 0), but not
--   those of WEB_NOT_COUNTED's accounts;
--   CHARACTER_01_DBF.dbo.usp_WebSiegeWeekly, usp_WebSiegeRankingPlayer, usp_WebSiegeRankingGuild: the Guild Siege
--   weekly winner and the rankings (only ended sieges, tblCombatInfo.Status = '30', server '01');
--   the SQL login flyffweb_site (password policy on), with a user in ACCOUNT_DBF and in CHARACTER_01_DBF that may
--   EXECUTE usp_CreateNewAccount, usp_WebOnlineCount and the three siege procedures, and nothing else: no table rights, no other database, not sa.
--   The procedures belong to dbo, so they reach their tables through ownership chaining.

USE [CHARACTER_01_DBF]
GO
IF OBJECT_ID(N'dbo.WEB_NOT_COUNTED', N'U') IS NULL
	CREATE TABLE dbo.WEB_NOT_COUNTED (account varchar(32) NOT NULL CONSTRAINT PK_WEB_NOT_COUNTED PRIMARY KEY)
GO
-- CREATE OR ALTER needs SQL Server 2016 SP1; this form works on older ones too
IF OBJECT_ID(N'dbo.usp_WebOnlineCount', N'P') IS NULL EXEC (N'CREATE PROCEDURE dbo.usp_WebOnlineCount AS RETURN 0')
GO
ALTER PROCEDURE dbo.usp_WebOnlineCount
AS
SET NOCOUNT ON
SELECT COUNT(*) AS players FROM dbo.CHARACTER_TBL c
WHERE c.MultiServer > 0 AND NOT EXISTS (SELECT 1 FROM dbo.WEB_NOT_COUNTED n WHERE n.account = c.account)
GO

-- The latest siege that ended on a Saturday between 20:00 and 21:59 within the last 7 days (the weekly winner):
-- its winning guild (StraightWin > 0), its MVP (Reward > 0) and when it ended. The times are sent as text with the PH
-- offset: a datetime would be read as UTC by the driver and shifted by 8 hours. The weekday does not depend on DATEFIRST.
-- A deleted MVP (CHARACTER_TBL.isblock = 'D', CHARACTER_STR's soft delete 'D1') has no name, so no mark.
IF OBJECT_ID(N'dbo.usp_WebSiegeWeekly', N'P') IS NULL EXEC (N'CREATE PROCEDURE dbo.usp_WebSiegeWeekly AS RETURN 0')
GO
ALTER PROCEDURE dbo.usp_WebSiegeWeekly
AS
SET NOCOUNT ON
DECLARE @combat int, @ended datetime
SELECT TOP 1 @combat = CombatID, @ended = EndDt
FROM dbo.tblCombatInfo
WHERE serverindex = '01' AND Status = '30' AND EndDt IS NOT NULL
	AND EndDt > DATEADD(day, -7, GETDATE())
	AND (DATEPART(weekday, EndDt) + @@DATEFIRST - 1) % 7 = 6
	AND DATEPART(hour, EndDt) IN (20, 21)
ORDER BY EndDt DESC, CombatID DESC
SELECT
	(SELECT TOP 1 g.GuildID FROM dbo.tblCombatJoinGuild g WHERE g.CombatID = @combat AND g.serverindex = '01' AND g.StraightWin > 0) AS guildId,
	(SELECT TOP 1 t.m_szGuild FROM dbo.tblCombatJoinGuild g INNER JOIN dbo.GUILD_TBL t ON t.m_idGuild = g.GuildID AND t.serverindex = g.serverindex
		WHERE g.CombatID = @combat AND g.serverindex = '01' AND g.StraightWin > 0) AS guildName,
	(SELECT TOP 1 p.PlayerID FROM dbo.tblCombatJoinPlayer p WHERE p.CombatID = @combat AND p.serverindex = '01' AND p.Reward > 0) AS playerId,
	(SELECT TOP 1 c.m_szName FROM dbo.tblCombatJoinPlayer p INNER JOIN dbo.CHARACTER_TBL c ON c.m_idPlayer = p.PlayerID AND c.serverindex = p.serverindex
		AND ISNULL(c.isblock, '') <> 'D'
		WHERE p.CombatID = @combat AND p.serverindex = '01' AND p.Reward > 0) AS playerName,
	CONVERT(varchar(19), @ended, 126) + '+08:00' AS endedAt
WHERE @combat IS NOT NULL
GO

-- The top 100 players by siege points (only above 0), each with the guild of the player's latest siege. @week = 1:
-- only sieges that ended since this Sunday 00:00. Deleted characters (isblock = 'D') are left out.
IF OBJECT_ID(N'dbo.usp_WebSiegeRankingPlayer', N'P') IS NULL EXEC (N'CREATE PROCEDURE dbo.usp_WebSiegeRankingPlayer AS RETURN 0')
GO
ALTER PROCEDURE dbo.usp_WebSiegeRankingPlayer @week bit
AS
SET NOCOUNT ON
DECLARE @since datetime = CASE WHEN @week = 1
	THEN DATEADD(day, -((DATEPART(weekday, GETDATE()) + @@DATEFIRST - 1) % 7), CAST(GETDATE() AS date))
	ELSE CAST('19000101' AS datetime) END
SELECT TOP 100 x.PlayerID AS playerId, c.m_szName AS name, c.m_nJob AS job,
	(SELECT TOP 1 t.m_szGuild
		FROM dbo.tblCombatJoinPlayer q
		INNER JOIN dbo.tblCombatInfo i2 ON i2.CombatID = q.CombatID AND i2.serverindex = q.serverindex
		INNER JOIN dbo.GUILD_TBL t ON t.m_idGuild = q.GuildID AND t.serverindex = q.serverindex
		WHERE q.PlayerID = x.PlayerID AND i2.Status = '30' AND i2.serverindex = '01'
		ORDER BY i2.EndDt DESC, i2.CombatID DESC) AS guild,
	x.points
FROM (
	SELECT p.PlayerID, SUM(p.Point) AS points
	FROM dbo.tblCombatJoinPlayer p
	INNER JOIN dbo.tblCombatInfo i ON i.CombatID = p.CombatID AND i.serverindex = p.serverindex
	WHERE i.serverindex = '01' AND i.Status = '30' AND i.EndDt >= @since
	GROUP BY p.PlayerID
	HAVING SUM(p.Point) > 0
) x
INNER JOIN dbo.CHARACTER_TBL c ON c.m_idPlayer = x.PlayerID AND c.serverindex = '01' AND ISNULL(c.isblock, '') <> 'D'
ORDER BY x.points DESC, c.m_szName
GO

-- The top 100 guilds by wins, then points. Only the sieges where the guild had line-up players count (the guilds that
-- really fought, not the outbid ones). @week = 1: only sieges that ended since this Sunday 00:00.
IF OBJECT_ID(N'dbo.usp_WebSiegeRankingGuild', N'P') IS NULL EXEC (N'CREATE PROCEDURE dbo.usp_WebSiegeRankingGuild AS RETURN 0')
GO
ALTER PROCEDURE dbo.usp_WebSiegeRankingGuild @week bit
AS
SET NOCOUNT ON
DECLARE @since datetime = CASE WHEN @week = 1
	THEN DATEADD(day, -((DATEPART(weekday, GETDATE()) + @@DATEFIRST - 1) % 7), CAST(GETDATE() AS date))
	ELSE CAST('19000101' AS datetime) END
SELECT TOP 100 x.GuildID AS guildId, t.m_szGuild AS name, x.wins, x.sieges, x.points
FROM (
	SELECT g.GuildID,
		SUM(CASE WHEN g.StraightWin > 0 THEN 1 ELSE 0 END) AS wins,
		COUNT(*) AS sieges,
		SUM(g.Point) AS points
	FROM dbo.tblCombatJoinGuild g
	INNER JOIN dbo.tblCombatInfo i ON i.CombatID = g.CombatID AND i.serverindex = g.serverindex
	WHERE i.serverindex = '01' AND i.Status = '30' AND i.EndDt >= @since
		AND EXISTS (SELECT 1 FROM dbo.tblCombatJoinPlayer p WHERE p.CombatID = g.CombatID AND p.serverindex = g.serverindex AND p.GuildID = g.GuildID)
	GROUP BY g.GuildID
) x
INNER JOIN dbo.GUILD_TBL t ON t.m_idGuild = x.GuildID AND t.serverindex = '01'
ORDER BY x.wins DESC, x.points DESC, t.m_szGuild
GO

USE [master]
GO
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'flyffweb_site')
	CREATE LOGIN [flyffweb_site] WITH PASSWORD = N'$(Password)', CHECK_POLICY = ON, CHECK_EXPIRATION = OFF,
		DEFAULT_DATABASE = [ACCOUNT_DBF]
ELSE
	ALTER LOGIN [flyffweb_site] WITH PASSWORD = N'$(Password)', CHECK_POLICY = ON
GO

USE [ACCOUNT_DBF]
GO
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'flyffweb_site')
	CREATE USER [flyffweb_site] FOR LOGIN [flyffweb_site]
GO
GRANT EXECUTE ON OBJECT::dbo.usp_CreateNewAccount TO [flyffweb_site]
GO

USE [CHARACTER_01_DBF]
GO
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'flyffweb_site')
	CREATE USER [flyffweb_site] FOR LOGIN [flyffweb_site]
GO
GRANT EXECUTE ON OBJECT::dbo.usp_WebOnlineCount TO [flyffweb_site]
GO
GRANT EXECUTE ON OBJECT::dbo.usp_WebSiegeWeekly TO [flyffweb_site]
GO
GRANT EXECUTE ON OBJECT::dbo.usp_WebSiegeRankingPlayer TO [flyffweb_site]
GO
GRANT EXECUTE ON OBJECT::dbo.usp_WebSiegeRankingGuild TO [flyffweb_site]
GO
