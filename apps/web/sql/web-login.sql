-- The web service's SQL Server login (website spec section 3.6). Install-WebLogin.ps1 runs it in the VM and fills in
-- the password variable; it can be run again (it then sets the password anew and keeps the rest).
--
-- It makes:
--   CHARACTER_01_DBF.dbo.usp_WebOnlineCount: the characters in a world now (CHARACTER_TBL.MultiServer > 0);
--   the SQL login flyffweb_site (password policy on), with a user in ACCOUNT_DBF and in CHARACTER_01_DBF that may
--   EXECUTE usp_CreateNewAccount and usp_WebOnlineCount, and nothing else: no table rights, no other database, not sa.
--   The procedures belong to dbo, so they reach their tables through ownership chaining.

USE [CHARACTER_01_DBF]
GO
-- CREATE OR ALTER needs SQL Server 2016 SP1; this form works on older ones too
IF OBJECT_ID(N'dbo.usp_WebOnlineCount', N'P') IS NULL EXEC (N'CREATE PROCEDURE dbo.usp_WebOnlineCount AS RETURN 0')
GO
ALTER PROCEDURE dbo.usp_WebOnlineCount
AS
SET NOCOUNT ON
SELECT COUNT(*) AS players FROM dbo.CHARACTER_TBL WHERE MultiServer > 0
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
