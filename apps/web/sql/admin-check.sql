-- The admin login's check (admin panel spec section 5.8). Run it LOGGED IN AS flyffweb_admin, in SQL Server
-- Management Studio (Connect: SQL Server Authentication, flyffweb_admin and its password) or with
--   sqlcmd -S 127.0.0.1,1433 -U flyffweb_admin -i admin-check.sql
-- It prints 10 lines; every one must start with PASS. It writes one audit row with the action 'check' and changes
-- nothing else.

SET NOCOUNT ON

-- 1. No table rights: reading an account table directly is refused.
BEGIN TRY
	DECLARE @n int
	SELECT @n = COUNT(*) FROM ACCOUNT_DBF.dbo.ACCOUNT_TBL
	PRINT 'FAIL 1: flyffweb_admin can read ACCOUNT_TBL directly'
END TRY
BEGIN CATCH
	PRINT 'PASS 1: ACCOUNT_TBL cannot be read directly'
END CATCH

BEGIN TRY
	DECLARE @m int
	SELECT @m = COUNT(*) FROM CHARACTER_01_DBF.dbo.CHARACTER_TBL
	PRINT 'FAIL 2: flyffweb_admin can read CHARACTER_TBL directly'
END TRY
BEGIN CATCH
	PRINT 'PASS 2: CHARACTER_TBL cannot be read directly'
END CATCH

-- 3. Only the panel's procedures: the game's own login procedure is refused.
BEGIN TRY
	EXEC ACCOUNT_DBF.dbo.LOGIN_STR @iaccount = 'nobody', @ipassword = 'x'
	PRINT 'FAIL 3: flyffweb_admin can run LOGIN_STR'
END TRY
BEGIN CATCH
	PRINT 'PASS 3: LOGIN_STR cannot be run'
END CATCH

-- 4. A search for 'a_' takes _ as itself, not as "any character".
CREATE TABLE #accounts (account varchar(32), email varchar(100), authority char(1), blockTime char(8), created datetime)
INSERT #accounts EXEC ACCOUNT_DBF.dbo.usp_AdminAccountSearch @account = 'a_'
IF EXISTS (SELECT 1 FROM #accounts WHERE LEFT(account, 2) <> 'a_')
	PRINT 'FAIL 4: the search for a_ matched names that do not start with a_'
ELSE
	PRINT 'PASS 4: the search for a_ matched only names starting with a_'
DROP TABLE #accounts

-- 5. A ban date in the past is refused (-1), whatever the account.
CREATE TABLE #changed (changed int)
INSERT #changed EXEC ACCOUNT_DBF.dbo.usp_AdminSetBlockTime @account = 'nobody-check', @blockTime = '20000101'
IF (SELECT changed FROM #changed) = -1
	PRINT 'PASS 5: a ban date in the past is refused'
ELSE
	PRINT 'FAIL 5: a ban date in the past was taken'
DROP TABLE #changed

-- 6. An ended audit row never changes again.
CREATE TABLE #id (id int)
INSERT #id EXEC ACCOUNT_DBF.dbo.usp_AdminLogBegin @admin = 'check', @address = '127.0.0.1', @action = 'check', @before = N'admin-check.sql'
DECLARE @id int
SELECT @id = id FROM #id
EXEC ACCOUNT_DBF.dbo.usp_AdminLogEnd @id = @id, @result = 'ok', @after = N'first'
EXEC ACCOUNT_DBF.dbo.usp_AdminLogEnd @id = @id, @result = 'failed', @after = N'second'
CREATE TABLE #log (id int, at datetime2(0), admin varchar(32), address varchar(45), action varchar(32), account varchar(32),
	characterName varchar(32), result varchar(8), before nvarchar(2000), after nvarchar(2000))
INSERT #log EXEC ACCOUNT_DBF.dbo.usp_AdminLogRead @action = 'check'
IF EXISTS (SELECT 1 FROM #log WHERE id = @id AND result = 'ok' AND after = N'first')
	PRINT 'PASS 6: an ended audit row did not change'
ELSE
	PRINT 'FAIL 6: an ended audit row changed'
DROP TABLE #id
DROP TABLE #log

-- 7. The account list's pages (2026-11-17): at most 10 rows, a total, a page past the end empty with the same total,
-- and 'a_' taken as itself.
CREATE TABLE #page (account varchar(32), email varchar(100), authority char(1), blockTime char(8), created datetime)
DECLARE @total int, @total2 int, @rows int
INSERT #page EXEC ACCOUNT_DBF.dbo.usp_AdminAccountPage @offset = 0, @count = 10, @total = @total OUTPUT
SELECT @rows = COUNT(*) FROM #page
DELETE #page
INSERT #page EXEC ACCOUNT_DBF.dbo.usp_AdminAccountPage @offset = 2000000000, @count = 10, @total = @total2 OUTPUT
IF @rows <= 10 AND @total >= @rows AND (@total = 0 OR @rows > 0) AND @total2 = @total AND NOT EXISTS (SELECT 1 FROM #page)
	PRINT 'PASS 7: the account list gives pages of 10 and the total (' + CAST(@total AS varchar(12)) + ' accounts)'
ELSE
	PRINT 'FAIL 7: the account list''s pages or total are wrong'
DELETE #page
INSERT #page EXEC ACCOUNT_DBF.dbo.usp_AdminAccountPage @offset = 0, @count = 50, @account = 'a_', @total = @total OUTPUT
IF EXISTS (SELECT 1 FROM #page WHERE LEFT(account, 2) <> 'a_')
	PRINT 'FAIL 8: the account list for a_ matched names that do not start with a_'
ELSE
	PRINT 'PASS 8: the account list for a_ matched only names starting with a_'
DROP TABLE #page

-- 9. The character list's pages, the same way.
CREATE TABLE #cpage (idPlayer char(7), name varchar(32), account varchar(32), level int, job int, slot int, deleted bit,
	online bit, worldId int, authority char(1))
INSERT #cpage EXEC CHARACTER_01_DBF.dbo.usp_AdminCharacterPage @offset = 0, @count = 10, @total = @total OUTPUT
SELECT @rows = COUNT(*) FROM #cpage
DELETE #cpage
INSERT #cpage EXEC CHARACTER_01_DBF.dbo.usp_AdminCharacterPage @offset = 2000000000, @count = 10, @total = @total2 OUTPUT
IF @rows <= 10 AND @total >= @rows AND (@total = 0 OR @rows > 0) AND @total2 = @total AND NOT EXISTS (SELECT 1 FROM #cpage)
	PRINT 'PASS 9: the character list gives pages of 10 and the total (' + CAST(@total AS varchar(12)) + ' characters)'
ELSE
	PRINT 'FAIL 9: the character list''s pages or total are wrong'
DROP TABLE #cpage

-- 10. Authority letters: a VIP letter is taken (0 rows: no such account or character), a lower-case or unknown one is
-- refused (-1). Nothing is changed: 'nobody-check' and 'x-check' cannot be names or ids.
CREATE TABLE #auth (changed int)
INSERT #auth EXEC ACCOUNT_DBF.dbo.usp_AdminSetLoginAuthority @account = 'nobody-check', @authority = 'E'
INSERT #auth EXEC ACCOUNT_DBF.dbo.usp_AdminSetLoginAuthority @account = 'nobody-check', @authority = 'p'
INSERT #auth EXEC CHARACTER_01_DBF.dbo.usp_AdminSetCharacterAuthority @account = 'nobody-check', @authority = 'A'
INSERT #auth EXEC CHARACTER_01_DBF.dbo.usp_AdminSetCharacterAuthority @account = 'nobody-check', @authority = 'Z'
INSERT #auth EXEC CHARACTER_01_DBF.dbo.usp_AdminCharacterAuthority @idPlayer = 'x-check', @authority = 'B'
INSERT #auth EXEC CHARACTER_01_DBF.dbo.usp_AdminCharacterAuthority @idPlayer = 'x-check', @authority = 'f'
IF (SELECT COUNT(*) FROM #auth WHERE changed = 0) = 3 AND (SELECT COUNT(*) FROM #auth WHERE changed = -1) = 3
	PRINT 'PASS 10: the VIP letters are taken, a lower-case or unknown letter is refused'
ELSE
	PRINT 'FAIL 10: the authority procedures take or refuse the wrong letters'
DROP TABLE #auth
