-- The admin panel's SQL Server login (admin panel spec section 5.4). Install-AdminLogin.ps1 runs it and fills in the
-- password variable; it can be run again (it then sets the password anew and makes the procedures again).
--
-- It makes:
--   ACCOUNT_DBF.dbo.WEB_ADMIN_LOG: the audit log, one row per panel change and per login;
--   the usp_Admin* procedures, each in the database whose tables it touches (no cross-database chaining);
--   the SQL login flyffweb_admin (password policy on), with a user in ACCOUNT_DBF and in CHARACTER_01_DBF that may
--   EXECUTE those procedures and usp_CreateNewAccount, and nothing else: no table rights, no other database, not sa.
--   The procedures belong to dbo, so they reach their tables through ownership chaining.
--
-- Every procedure takes typed parameters and builds no SQL from text. Prefix searches escape [ % _ first. The
-- server index is always '01'. Procedures are dropped and made again (this works on every SQL Server version), so
-- their grants are given again at the end of each database's part.

USE [ACCOUNT_DBF]
GO
IF OBJECT_ID(N'dbo.WEB_ADMIN_LOG', N'U') IS NULL
	CREATE TABLE dbo.WEB_ADMIN_LOG (
		id int IDENTITY(1,1) NOT NULL CONSTRAINT PK_WEB_ADMIN_LOG PRIMARY KEY,
		at datetime2(0) NOT NULL CONSTRAINT DF_WEB_ADMIN_LOG_at DEFAULT SYSUTCDATETIME(),
		admin varchar(32) NOT NULL,
		address varchar(45) NOT NULL,
		action varchar(32) NOT NULL,
		account varchar(32) NULL,
		characterName varchar(32) NULL,
		result varchar(8) NOT NULL CONSTRAINT DF_WEB_ADMIN_LOG_result DEFAULT 'started',
		before nvarchar(2000) NOT NULL CONSTRAINT DF_WEB_ADMIN_LOG_before DEFAULT N'',
		after nvarchar(2000) NOT NULL CONSTRAINT DF_WEB_ADMIN_LOG_after DEFAULT N'',
		endedAt datetime2(0) NULL
	)
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_WEB_ADMIN_LOG_account' AND object_id = OBJECT_ID(N'dbo.WEB_ADMIN_LOG'))
	CREATE INDEX IX_WEB_ADMIN_LOG_account ON dbo.WEB_ADMIN_LOG (account, id)
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_WEB_ADMIN_LOG_character' AND object_id = OBJECT_ID(N'dbo.WEB_ADMIN_LOG'))
	CREATE INDEX IX_WEB_ADMIN_LOG_character ON dbo.WEB_ADMIN_LOG (characterName, id)
GO

-- ---------------------------------------------------------------------------------------------------------------
-- The audit log
-- ---------------------------------------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.usp_AdminLogBegin', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_AdminLogBegin
GO
CREATE PROCEDURE dbo.usp_AdminLogBegin
	@admin varchar(32), @address varchar(45), @action varchar(32), @account varchar(32) = NULL,
	@characterName varchar(32) = NULL, @before nvarchar(2000)
AS
SET NOCOUNT ON
INSERT dbo.WEB_ADMIN_LOG (admin, address, action, account, characterName, before)
VALUES (@admin, @address, @action, @account, @characterName, @before)
SELECT CAST(SCOPE_IDENTITY() AS int) AS id
GO

-- Ends a row once: a row that is no longer 'started' never changes again.
IF OBJECT_ID(N'dbo.usp_AdminLogEnd', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_AdminLogEnd
GO
CREATE PROCEDURE dbo.usp_AdminLogEnd
	@id int, @result varchar(8), @after nvarchar(2000)
AS
SET NOCOUNT ON
IF @result NOT IN ('ok', 'failed', 'refused') RETURN
UPDATE dbo.WEB_ADMIN_LOG SET result = @result, after = @after, endedAt = SYSUTCDATETIME()
WHERE id = @id AND result = 'started'
GO

IF OBJECT_ID(N'dbo.usp_AdminLogRead', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_AdminLogRead
GO
CREATE PROCEDURE dbo.usp_AdminLogRead
	@beforeId int = NULL, @account varchar(32) = NULL, @characterName varchar(32) = NULL, @action varchar(32) = NULL
AS
SET NOCOUNT ON
SELECT TOP 50 id, at, admin, address, action, account, characterName, result, before, after
FROM dbo.WEB_ADMIN_LOG
WHERE (@beforeId IS NULL OR id < @beforeId)
	AND (@account IS NULL OR account = @account)
	AND (@characterName IS NULL OR characterName = @characterName)
	AND (@action IS NULL OR action = @action)
ORDER BY id DESC
GO

IF OBJECT_ID(N'dbo.usp_AdminRecentLogins', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_AdminRecentLogins
GO
CREATE PROCEDURE dbo.usp_AdminRecentLogins
AS
SET NOCOUNT ON
SELECT TOP 10 id, at, admin, address, action, account, characterName, result, before, after
FROM dbo.WEB_ADMIN_LOG
WHERE action IN ('login', 'login_failed')
ORDER BY id DESC
GO

-- ---------------------------------------------------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.usp_AdminAccountSearch', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_AdminAccountSearch
GO
CREATE PROCEDURE dbo.usp_AdminAccountSearch
	@account varchar(32) = NULL, @email varchar(100) = NULL
AS
SET NOCOUNT ON
DECLARE @pattern varchar(130)
SET @pattern = REPLACE(REPLACE(REPLACE(ISNULL(@account, ''), '[', '[[]'), '%', '[%]'), '_', '[_]') + '%'
SELECT TOP 50 a.account, d.email, d.m_chLoginAuthority AS authority, d.BlockTime AS blockTime, d.regdate AS created
FROM dbo.ACCOUNT_TBL a INNER JOIN dbo.ACCOUNT_TBL_DETAIL d ON d.account = a.account
WHERE (@account IS NULL OR a.account LIKE @pattern)
	AND (@email IS NULL OR d.email = @email)
ORDER BY a.account
GO

IF OBJECT_ID(N'dbo.usp_AdminAccountGet', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_AdminAccountGet
GO
CREATE PROCEDURE dbo.usp_AdminAccountGet
	@account varchar(32)
AS
SET NOCOUNT ON
SELECT a.account, d.email, d.m_chLoginAuthority AS authority, d.BlockTime AS blockTime, d.regdate AS created
FROM dbo.ACCOUNT_TBL a INNER JOIN dbo.ACCOUNT_TBL_DETAIL d ON d.account = a.account
WHERE a.account = @account
GO

IF OBJECT_ID(N'dbo.usp_AdminSetPassword', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_AdminSetPassword
GO
CREATE PROCEDURE dbo.usp_AdminSetPassword
	@account varchar(32), @pw varchar(32)
AS
SET NOCOUNT ON
UPDATE dbo.ACCOUNT_TBL SET password = @pw WHERE account = @account
SELECT @@ROWCOUNT AS changed
GO

IF OBJECT_ID(N'dbo.usp_AdminSetEmail', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_AdminSetEmail
GO
CREATE PROCEDURE dbo.usp_AdminSetEmail
	@account varchar(32), @email varchar(100)
AS
SET NOCOUNT ON
UPDATE dbo.ACCOUNT_TBL_DETAIL SET email = @email WHERE account = @account
SELECT @@ROWCOUNT AS changed
GO

-- F player, J helper, L/M/N GM 1-3, O operator, P administrator (Source/_Common/authorization.h).
IF OBJECT_ID(N'dbo.usp_AdminSetLoginAuthority', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_AdminSetLoginAuthority
GO
CREATE PROCEDURE dbo.usp_AdminSetLoginAuthority
	@account varchar(32), @authority char(1)
AS
SET NOCOUNT ON
IF @authority IS NULL OR @authority NOT IN ('F', 'J', 'L', 'M', 'N', 'O', 'P')
BEGIN
	SELECT -1 AS changed
	RETURN
END
UPDATE dbo.ACCOUNT_TBL_DETAIL SET m_chLoginAuthority = @authority WHERE account = @account
SELECT @@ROWCOUNT AS changed
GO

-- A ban: LOGIN_STR refuses a login while BlockTime >= today. NULL means unban: yesterday, as a new account has.
-- A date must be today or later, or 99991231 (forever); anything else is refused with -1.
IF OBJECT_ID(N'dbo.usp_AdminSetBlockTime', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_AdminSetBlockTime
GO
CREATE PROCEDURE dbo.usp_AdminSetBlockTime
	@account varchar(32), @blockTime char(8) = NULL
AS
SET NOCOUNT ON
DECLARE @today char(8)
SET @today = CONVERT(char(8), GETDATE(), 112)
IF @blockTime IS NULL
	SET @blockTime = CONVERT(char(8), GETDATE() - 1, 112)
ELSE IF @blockTime <> '99991231' AND (PATINDEX('%[^0-9]%', @blockTime) > 0 OR ISDATE(@blockTime) = 0 OR @blockTime < @today)
BEGIN
	SELECT -1 AS changed
	RETURN
END
UPDATE dbo.ACCOUNT_TBL_DETAIL SET BlockTime = @blockTime WHERE account = @account
SELECT @@ROWCOUNT AS changed
GO

-- ---------------------------------------------------------------------------------------------------------------
-- The login, and its rights in ACCOUNT_DBF
-- ---------------------------------------------------------------------------------------------------------------
USE [master]
GO
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'flyffweb_admin')
	CREATE LOGIN [flyffweb_admin] WITH PASSWORD = N'$(Password)', CHECK_POLICY = ON, CHECK_EXPIRATION = OFF,
		DEFAULT_DATABASE = [ACCOUNT_DBF]
ELSE
	ALTER LOGIN [flyffweb_admin] WITH PASSWORD = N'$(Password)', CHECK_POLICY = ON
GO

USE [ACCOUNT_DBF]
GO
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'flyffweb_admin')
	CREATE USER [flyffweb_admin] FOR LOGIN [flyffweb_admin]
GO
GRANT EXECUTE ON OBJECT::dbo.usp_AdminLogBegin TO [flyffweb_admin]
GRANT EXECUTE ON OBJECT::dbo.usp_AdminLogEnd TO [flyffweb_admin]
GRANT EXECUTE ON OBJECT::dbo.usp_AdminLogRead TO [flyffweb_admin]
GRANT EXECUTE ON OBJECT::dbo.usp_AdminRecentLogins TO [flyffweb_admin]
GRANT EXECUTE ON OBJECT::dbo.usp_AdminAccountSearch TO [flyffweb_admin]
GRANT EXECUTE ON OBJECT::dbo.usp_AdminAccountGet TO [flyffweb_admin]
GRANT EXECUTE ON OBJECT::dbo.usp_AdminSetPassword TO [flyffweb_admin]
GRANT EXECUTE ON OBJECT::dbo.usp_AdminSetEmail TO [flyffweb_admin]
GRANT EXECUTE ON OBJECT::dbo.usp_AdminSetLoginAuthority TO [flyffweb_admin]
GRANT EXECUTE ON OBJECT::dbo.usp_AdminSetBlockTime TO [flyffweb_admin]
GRANT EXECUTE ON OBJECT::dbo.usp_CreateNewAccount TO [flyffweb_admin]
GO

-- ---------------------------------------------------------------------------------------------------------------
-- Characters (CHARACTER_01_DBF)
-- ---------------------------------------------------------------------------------------------------------------
USE [CHARACTER_01_DBF]
GO
IF OBJECT_ID(N'dbo.usp_AdminSetCharacterAuthority', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_AdminSetCharacterAuthority
GO
CREATE PROCEDURE dbo.usp_AdminSetCharacterAuthority
	@account varchar(32), @authority char(1)
AS
SET NOCOUNT ON
IF @authority IS NULL OR @authority NOT IN ('F', 'J', 'L', 'M', 'N', 'O', 'P')
BEGIN
	SELECT -1 AS changed
	RETURN
END
UPDATE dbo.CHARACTER_TBL SET m_chAuthority = @authority WHERE account = @account AND serverindex = '01'
SELECT @@ROWCOUNT AS changed
GO

IF OBJECT_ID(N'dbo.usp_AdminCharacterSearch', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_AdminCharacterSearch
GO
CREATE PROCEDURE dbo.usp_AdminCharacterSearch
	@name varchar(32) = NULL, @account varchar(32) = NULL
AS
SET NOCOUNT ON
DECLARE @pattern varchar(130)
SET @pattern = REPLACE(REPLACE(REPLACE(ISNULL(@name, ''), '[', '[[]'), '%', '[%]'), '_', '[_]') + '%'
SELECT TOP 50 m_idPlayer AS idPlayer, m_szName AS name, account, m_nLevel AS level, m_nJob AS job, playerslot AS slot,
	CAST(CASE WHEN isblock = 'D' THEN 1 ELSE 0 END AS bit) AS deleted,
	CAST(CASE WHEN MultiServer > 0 THEN 1 ELSE 0 END AS bit) AS online, dwWorldID AS worldId
FROM dbo.CHARACTER_TBL
WHERE serverindex = '01'
	AND (@name IS NULL OR m_szName LIKE @pattern)
	AND (@account IS NULL OR account = @account)
ORDER BY m_szName
GO

IF OBJECT_ID(N'dbo.usp_AdminCharacterGet', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_AdminCharacterGet
GO
CREATE PROCEDURE dbo.usp_AdminCharacterGet
	@idPlayer char(7)
AS
SET NOCOUNT ON
SELECT c.m_idPlayer AS idPlayer, c.m_szName AS name, c.account, c.m_nLevel AS level, c.m_nJob AS job, c.playerslot AS slot,
	CAST(CASE WHEN c.isblock = 'D' THEN 1 ELSE 0 END AS bit) AS deleted,
	CAST(CASE WHEN c.MultiServer > 0 THEN 1 ELSE 0 END AS bit) AS online, c.dwWorldID AS worldId,
	c.m_dwGold AS gold, c.m_vPos_x AS x, c.m_vPos_y AS y, c.m_vPos_z AS z, c.CreateTime AS created,
	c.TotalPlayTime AS playTimeSeconds, CASE WHEN c.isblock = 'D' THEN c.End_Time END AS deletedAt,
	CAST(CASE WHEN EXISTS (SELECT 1 FROM dbo.GUILD_MEMBER_TBL g WHERE g.m_idPlayer = c.m_idPlayer AND g.serverindex = c.serverindex)
		THEN 1 ELSE 0 END AS bit) AS inGuild
FROM dbo.CHARACTER_TBL c
WHERE c.m_idPlayer = @idPlayer AND c.serverindex = '01'
GO

IF OBJECT_ID(N'dbo.usp_AdminOnlineList', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_AdminOnlineList
GO
CREATE PROCEDURE dbo.usp_AdminOnlineList
AS
SET NOCOUNT ON
SELECT m_idPlayer AS idPlayer, m_szName AS name, account, m_nLevel AS level, m_nJob AS job, playerslot AS slot,
	CAST(CASE WHEN isblock = 'D' THEN 1 ELSE 0 END AS bit) AS deleted, CAST(1 AS bit) AS online, dwWorldID AS worldId
FROM dbo.CHARACTER_TBL
WHERE serverindex = '01' AND MultiServer > 0
ORDER BY m_szName
GO

-- The panel calls the character edits below only while the Database and World servers are stopped (spec 4.3).
IF OBJECT_ID(N'dbo.usp_AdminCharacterRename', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_AdminCharacterRename
GO
CREATE PROCEDURE dbo.usp_AdminCharacterRename
	@idPlayer char(7), @name varchar(32)
AS
SET NOCOUNT ON
SET XACT_ABORT ON
BEGIN TRANSACTION
IF NOT EXISTS (SELECT 1 FROM dbo.CHARACTER_TBL WITH (UPDLOCK, HOLDLOCK) WHERE m_idPlayer = @idPlayer AND serverindex = '01')
BEGIN
	COMMIT TRANSACTION
	SELECT 'missing' AS result
	RETURN
END
IF EXISTS (SELECT 1 FROM dbo.CHARACTER_TBL WITH (UPDLOCK, HOLDLOCK) WHERE m_szName = @name AND m_idPlayer <> @idPlayer)
BEGIN
	COMMIT TRANSACTION
	SELECT 'taken' AS result
	RETURN
END
UPDATE dbo.CHARACTER_TBL SET m_szName = @name WHERE m_idPlayer = @idPlayer AND serverindex = '01'
COMMIT TRANSACTION
SELECT 'ok' AS result
GO

IF OBJECT_ID(N'dbo.usp_AdminCharacterSetGold', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_AdminCharacterSetGold
GO
CREATE PROCEDURE dbo.usp_AdminCharacterSetGold
	@idPlayer char(7), @gold int
AS
SET NOCOUNT ON
IF @gold IS NULL OR @gold < 0 OR @gold > 2000000000
BEGIN
	SELECT -1 AS changed
	RETURN
END
UPDATE dbo.CHARACTER_TBL SET m_dwGold = @gold WHERE m_idPlayer = @idPlayer AND serverindex = '01'
SELECT @@ROWCOUNT AS changed
GO

IF OBJECT_ID(N'dbo.usp_AdminCharacterMove', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_AdminCharacterMove
GO
CREATE PROCEDURE dbo.usp_AdminCharacterMove
	@idPlayer char(7), @worldId int, @x real, @y real, @z real
AS
SET NOCOUNT ON
UPDATE dbo.CHARACTER_TBL SET dwWorldID = @worldId, m_vPos_x = @x, m_vPos_y = @y, m_vPos_z = @z
WHERE m_idPlayer = @idPlayer AND serverindex = '01'
SELECT @@ROWCOUNT AS changed
GO

-- The game's own delete (CHARACTER_STR 'D1'): a guild member is refused (the Core server takes them out of the guild,
-- and it is stopped); otherwise isblock 'D', End_Time yyyymmddhhmi, BlockTime yyyymmdd, and friends marked 'D' both
-- ways. CHARACTER_DELETE_STR removes 'D' rows after 7 days.
IF OBJECT_ID(N'dbo.usp_AdminCharacterDelete', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_AdminCharacterDelete
GO
CREATE PROCEDURE dbo.usp_AdminCharacterDelete
	@idPlayer char(7)
AS
SET NOCOUNT ON
SET XACT_ABORT ON
IF NOT EXISTS (SELECT 1 FROM dbo.CHARACTER_TBL WHERE m_idPlayer = @idPlayer AND serverindex = '01' AND isblock <> 'D')
BEGIN
	SELECT 'missing' AS result
	RETURN
END
IF EXISTS (SELECT 1 FROM dbo.GUILD_MEMBER_TBL WHERE m_idPlayer = @idPlayer AND serverindex = '01')
BEGIN
	SELECT 'guild' AS result
	RETURN
END
DECLARE @now datetime, @currDate char(12)
SET @now = GETDATE()
SET @currDate = CONVERT(char(8), @now, 112) + RIGHT('00' + CONVERT(varchar(2), DATEPART(hh, @now)), 2)
	+ RIGHT('00' + CONVERT(varchar(2), DATEPART(mi, @now)), 2)
BEGIN TRANSACTION
UPDATE dbo.CHARACTER_TBL SET isblock = 'D', End_Time = @currDate, BlockTime = LEFT(@currDate, 8)
WHERE m_idPlayer = @idPlayer AND serverindex = '01'
UPDATE dbo.MESSENGER_TBL SET State = 'D' WHERE m_idPlayer = @idPlayer AND serverindex = '01'
UPDATE dbo.MESSENGER_TBL SET State = 'D' WHERE f_idPlayer = @idPlayer AND serverindex = '01'
COMMIT TRANSACTION
SELECT 'ok' AS result
GO

-- Undo a delete within 7 days, while no live character of the account holds the slot and no live character has taken
-- the name (the game's create checks names among live characters only, so a new one can take a deleted one's name).
-- Friends stay deleted.
IF OBJECT_ID(N'dbo.usp_AdminCharacterUndelete', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_AdminCharacterUndelete
GO
CREATE PROCEDURE dbo.usp_AdminCharacterUndelete
	@idPlayer char(7)
AS
SET NOCOUNT ON
DECLARE @account varchar(32), @slot int, @end char(12), @name varchar(32)
SELECT @account = account, @slot = playerslot, @end = End_Time, @name = m_szName
FROM dbo.CHARACTER_TBL WHERE m_idPlayer = @idPlayer AND serverindex = '01' AND isblock = 'D'
IF @account IS NULL
BEGIN
	SELECT 'missing' AS result
	RETURN
END
IF @end IS NULL OR LEFT(@end, 8) <= CONVERT(char(8), DATEADD(d, -7, GETDATE()), 112)
BEGIN
	SELECT 'too_old' AS result
	RETURN
END
IF EXISTS (SELECT 1 FROM dbo.CHARACTER_TBL WHERE account = @account AND serverindex = '01' AND playerslot = @slot
	AND isblock = 'F' AND m_idPlayer <> @idPlayer)
BEGIN
	SELECT 'slot_taken' AS result
	RETURN
END
IF EXISTS (SELECT 1 FROM dbo.CHARACTER_TBL WHERE m_szName = @name AND serverindex = '01' AND isblock = 'F'
	AND m_idPlayer <> @idPlayer)
BEGIN
	SELECT 'name_taken' AS result
	RETURN
END
UPDATE dbo.CHARACTER_TBL SET isblock = 'F', End_Time = NULL, BlockTime = CONVERT(char(8), GETDATE() - 1, 112)
WHERE m_idPlayer = @idPlayer AND serverindex = '01'
SELECT 'ok' AS result
GO

-- ---------------------------------------------------------------------------------------------------------------
-- Item and penya sends (ITEM_SEND_TBL): handed over by the Database server when the character enters the world.
-- The panel's rows carry ItemBillingNo 'ADMIN<audit id>'; only those can be cancelled, and only before delivery.
-- ---------------------------------------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.usp_AdminItemSend', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_AdminItemSend
GO
CREATE PROCEDURE dbo.usp_AdminItemSend
	@idPlayer char(7), @itemName varchar(32), @count int, @upgrade int, @billingNo char(21)
AS
SET NOCOUNT ON
IF NOT EXISTS (SELECT 1 FROM dbo.CHARACTER_TBL WHERE m_idPlayer = @idPlayer AND serverindex = '01')
	OR @count IS NULL OR @count < 1 OR @upgrade IS NULL OR @upgrade < 0 OR @upgrade > 10
BEGIN
	SELECT -1 AS no
	RETURN
END
INSERT dbo.ITEM_SEND_TBL (m_idPlayer, serverindex, Item_Name, Item_count, m_nAbilityOption, End_Time, m_bItemResist,
	m_nResistAbilityOption, m_bCharged, idSender, nPiercedSize, adwItemId0, adwItemId1, adwItemId2, adwItemId3,
	m_dwKeepTime, ItemFlag, ReceiveDt, nRandomOptItemId, ItemBillingNo, adwItemId4, adwItemId5, adwItemId6, adwItemId7,
	adwItemId8, adwItemId9, nUMPiercedSize, adwUMItemId0, adwUMItemId1, adwUMItemId2, adwUMItemId3, adwUMItemId4)
VALUES (@idPlayer, '01', @itemName, @count, @upgrade, NULL, 0,
	0, 0, '0000000', 0, 0, 0, 0, 0,
	0, 0, GETDATE(), 0, @billingNo, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0)
SELECT CAST(SCOPE_IDENTITY() AS int) AS no
GO

IF OBJECT_ID(N'dbo.usp_AdminItemSendList', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_AdminItemSendList
GO
CREATE PROCEDURE dbo.usp_AdminItemSendList
	@idPlayer char(7)
AS
SET NOCOUNT ON
SELECT m_nNo AS no, Item_Name AS item, Item_count AS count, m_nAbilityOption AS upgrade, ReceiveDt AS received,
	CAST(CASE WHEN ItemBillingNo LIKE 'ADMIN%' THEN 1 ELSE 0 END AS bit) AS byPanel
FROM dbo.ITEM_SEND_TBL
WHERE m_idPlayer = @idPlayer AND serverindex = '01' AND ItemFlag = 0
ORDER BY m_nNo
GO

IF OBJECT_ID(N'dbo.usp_AdminItemSendCancel', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_AdminItemSendCancel
GO
CREATE PROCEDURE dbo.usp_AdminItemSendCancel
	@idPlayer char(7), @no int
AS
SET NOCOUNT ON
DELETE dbo.ITEM_SEND_TBL
WHERE m_nNo = @no AND m_idPlayer = @idPlayer AND serverindex = '01' AND ItemFlag = 0 AND ItemBillingNo LIKE 'ADMIN%'
SELECT @@ROWCOUNT AS changed
GO

-- ---------------------------------------------------------------------------------------------------------------
-- The login's rights in CHARACTER_01_DBF
-- ---------------------------------------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'flyffweb_admin')
	CREATE USER [flyffweb_admin] FOR LOGIN [flyffweb_admin]
GO
GRANT EXECUTE ON OBJECT::dbo.usp_AdminSetCharacterAuthority TO [flyffweb_admin]
GRANT EXECUTE ON OBJECT::dbo.usp_AdminCharacterSearch TO [flyffweb_admin]
GRANT EXECUTE ON OBJECT::dbo.usp_AdminCharacterGet TO [flyffweb_admin]
GRANT EXECUTE ON OBJECT::dbo.usp_AdminOnlineList TO [flyffweb_admin]
GRANT EXECUTE ON OBJECT::dbo.usp_AdminCharacterRename TO [flyffweb_admin]
GRANT EXECUTE ON OBJECT::dbo.usp_AdminCharacterSetGold TO [flyffweb_admin]
GRANT EXECUTE ON OBJECT::dbo.usp_AdminCharacterMove TO [flyffweb_admin]
GRANT EXECUTE ON OBJECT::dbo.usp_AdminCharacterDelete TO [flyffweb_admin]
GRANT EXECUTE ON OBJECT::dbo.usp_AdminCharacterUndelete TO [flyffweb_admin]
GRANT EXECUTE ON OBJECT::dbo.usp_AdminItemSend TO [flyffweb_admin]
GRANT EXECUTE ON OBJECT::dbo.usp_AdminItemSendList TO [flyffweb_admin]
GRANT EXECUTE ON OBJECT::dbo.usp_AdminItemSendCancel TO [flyffweb_admin]
GO
