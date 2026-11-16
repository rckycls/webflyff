-- Support / VIP: manual QR payments (2026-11-16). Install-Vip.ps1 runs it in the VM or on the VPS, with your Windows
-- login; it can be run again (tables and the owner's changes stay, procedures are made again).
--
-- It makes, in ACCOUNT_DBF:
--   dbo.WEB_VIP_TIER     the tiers players can pick (level, name, price in US cents, price in peso centavos or none,
--                        on/off); VIP 1-4 at $2/$4/$6/$10 (P115/P230/P345/P575) a month are put in once, and a run
--                        again never changes them;
--   dbo.WEB_PAY_QR       the payment QR codes the admin uploads (label, account name, note, picture file, on/off, order);
--   dbo.WEB_VIP_REQUEST  each player's request: tier, currency (USD or PHP) and the price in it, reference number,
--                        receipt picture file (none once a rejected request's picture was deleted), status
--                        P (processing), A (approved) or R (rejected, with the reason), who decided and when;
--   dbo.WEB_VIP          each account's VIP level and end time (UTC). VIP ends by itself: every read checks the time;
--   the usp_WebVip* / usp_WebPayQr* / usp_WebPlayerLogin procedures for the site's login flyffweb_site, and the
--   usp_AdminVip* / usp_AdminPayQr* procedures for the panel's login flyffweb_admin. Each login gets EXECUTE on its own
--   procedures only (when that login's user exists in ACCOUNT_DBF), and no table rights: the procedures belong to dbo
--   and reach their tables through ownership chaining.
--
-- Every procedure takes typed parameters and builds no SQL from text. Times are UTC, sent as text ending in Z.
-- The pictures themselves are files outside the web folders (web.config.json's vip.uploadsDir); the tables hold only
-- their random file names.

USE [ACCOUNT_DBF]
GO
IF OBJECT_ID(N'dbo.WEB_VIP_TIER', N'U') IS NULL
	CREATE TABLE dbo.WEB_VIP_TIER (
		level tinyint NOT NULL CONSTRAINT PK_WEB_VIP_TIER PRIMARY KEY,
		name nvarchar(32) NOT NULL,
		priceCents int NOT NULL,
		-- what players in the Philippines see and pay, in centavos; none: US$ only for this tier
		pricePhpCents int NULL,
		isOn bit NOT NULL CONSTRAINT DF_WEB_VIP_TIER_isOn DEFAULT 1,
		CONSTRAINT CK_WEB_VIP_TIER_level CHECK (level BETWEEN 1 AND 9),
		CONSTRAINT CK_WEB_VIP_TIER_price CHECK (priceCents BETWEEN 1 AND 1000000),
		CONSTRAINT CK_WEB_VIP_TIER_pricePhp CHECK (pricePhpCents BETWEEN 1 AND 1000000)
	)
GO
-- the defaults, only for levels not there yet: a run again keeps the owner's prices and names. The peso prices are about
-- the dollar ones at 57.5 pesos a dollar; the owner sets their own in the panel's VIP tab, Tiers.
INSERT dbo.WEB_VIP_TIER (level, name, priceCents, pricePhpCents)
SELECT v.level, v.name, v.priceCents, v.pricePhpCents
FROM (VALUES (1, N'VIP 1', 200, 11500), (2, N'VIP 2', 400, 23000), (3, N'VIP 3', 600, 34500), (4, N'VIP 4', 1000, 57500)) AS v(level, name, priceCents, pricePhpCents)
WHERE NOT EXISTS (SELECT 1 FROM dbo.WEB_VIP_TIER t WHERE t.level = v.level)
GO

IF OBJECT_ID(N'dbo.WEB_PAY_QR', N'U') IS NULL
	CREATE TABLE dbo.WEB_PAY_QR (
		id int IDENTITY(1,1) NOT NULL CONSTRAINT PK_WEB_PAY_QR PRIMARY KEY,
		label nvarchar(40) NOT NULL,
		accountName nvarchar(80) NOT NULL,
		note nvarchar(200) NOT NULL CONSTRAINT DF_WEB_PAY_QR_note DEFAULT N'',
		imageFile varchar(40) NOT NULL,
		isOn bit NOT NULL CONSTRAINT DF_WEB_PAY_QR_isOn DEFAULT 0,
		sortOrder int NOT NULL CONSTRAINT DF_WEB_PAY_QR_sortOrder DEFAULT 1,
		createdAt datetime2(0) NOT NULL CONSTRAINT DF_WEB_PAY_QR_createdAt DEFAULT SYSUTCDATETIME()
	)
GO

IF OBJECT_ID(N'dbo.WEB_VIP_REQUEST', N'U') IS NULL
	CREATE TABLE dbo.WEB_VIP_REQUEST (
		id int IDENTITY(1,1) NOT NULL CONSTRAINT PK_WEB_VIP_REQUEST PRIMARY KEY,
		account varchar(32) NOT NULL,
		level tinyint NOT NULL,
		-- what the player was asked to pay: USD in cents or PHP in centavos, the tier's price when the request was sent
		currency char(3) NOT NULL CONSTRAINT DF_WEB_VIP_REQUEST_currency DEFAULT 'USD',
		priceCents int NOT NULL,
		reference varchar(40) NOT NULL,
		-- the reference in capitals with only its letters and digits: the same payment typed two ways is one key
		referenceKey varchar(40) NOT NULL,
		-- none once the request was rejected long enough ago (usp_AdminVipForgetReceipts)
		receiptFile varchar(40) NULL,
		status char(1) NOT NULL CONSTRAINT DF_WEB_VIP_REQUEST_status DEFAULT 'P',
		reason nvarchar(200) NULL,
		address varchar(45) NOT NULL,
		createdAt datetime2(0) NOT NULL CONSTRAINT DF_WEB_VIP_REQUEST_createdAt DEFAULT SYSUTCDATETIME(),
		decidedAt datetime2(0) NULL,
		decidedBy varchar(32) NULL,
		-- the VIP end time an approval gave
		vipEndsAt datetime2(0) NULL,
		CONSTRAINT CK_WEB_VIP_REQUEST_status CHECK (status IN ('P', 'A', 'R')),
		CONSTRAINT CK_WEB_VIP_REQUEST_currency CHECK (currency IN ('USD', 'PHP'))
	)
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_WEB_VIP_REQUEST_account' AND object_id = OBJECT_ID(N'dbo.WEB_VIP_REQUEST'))
	CREATE INDEX IX_WEB_VIP_REQUEST_account ON dbo.WEB_VIP_REQUEST (account, status)
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_WEB_VIP_REQUEST_status' AND object_id = OBJECT_ID(N'dbo.WEB_VIP_REQUEST'))
	CREATE INDEX IX_WEB_VIP_REQUEST_status ON dbo.WEB_VIP_REQUEST (status, id)
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_WEB_VIP_REQUEST_reference' AND object_id = OBJECT_ID(N'dbo.WEB_VIP_REQUEST'))
	CREATE INDEX IX_WEB_VIP_REQUEST_reference ON dbo.WEB_VIP_REQUEST (referenceKey, status)
GO

IF OBJECT_ID(N'dbo.WEB_VIP', N'U') IS NULL
	CREATE TABLE dbo.WEB_VIP (
		account varchar(32) NOT NULL CONSTRAINT PK_WEB_VIP PRIMARY KEY,
		level tinyint NOT NULL,
		endsAt datetime2(0) NOT NULL,
		updatedAt datetime2(0) NOT NULL CONSTRAINT DF_WEB_VIP_updatedAt DEFAULT SYSUTCDATETIME()
	)
GO

-- ---------------------------------------------------------------------------------------------------------------
-- The site's procedures (flyffweb_site)
-- ---------------------------------------------------------------------------------------------------------------

-- The website's player login, as the game's LOGIN_STR checks it: 1 ok (with the account as stored), 0 no such account
-- or a wrong password (one answer for both), 2 banned (BlockTime today or later). @pw is the hash the game's login sends.
IF OBJECT_ID(N'dbo.usp_WebPlayerLogin', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_WebPlayerLogin
GO
CREATE PROCEDURE dbo.usp_WebPlayerLogin
	@account varchar(32), @pw varchar(32)
AS
SET NOCOUNT ON
DECLARE @stored varchar(32), @blockTime char(8)
SELECT @stored = a.account, @blockTime = d.BlockTime
FROM dbo.ACCOUNT_TBL a INNER JOIN dbo.ACCOUNT_TBL_DETAIL d ON d.account = a.account
WHERE a.account = @account AND a.password = @pw
IF @stored IS NULL
	SELECT 0 AS result, CAST(NULL AS varchar(32)) AS account
ELSE IF @blockTime >= CONVERT(char(8), GETDATE(), 112)
	SELECT 2 AS result, @stored AS account
ELSE
	SELECT 1 AS result, @stored AS account
GO

IF OBJECT_ID(N'dbo.usp_WebVipTiers', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_WebVipTiers
GO
CREATE PROCEDURE dbo.usp_WebVipTiers
AS
SET NOCOUNT ON
SELECT level, name, priceCents, pricePhpCents FROM dbo.WEB_VIP_TIER WHERE isOn = 1 ORDER BY level
GO

IF OBJECT_ID(N'dbo.usp_WebPayQrList', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_WebPayQrList
GO
CREATE PROCEDURE dbo.usp_WebPayQrList
AS
SET NOCOUNT ON
SELECT id, label, accountName, note FROM dbo.WEB_PAY_QR WHERE isOn = 1 ORDER BY sortOrder, id
GO

-- The picture file of a QR that is on (an off one is never served to players).
IF OBJECT_ID(N'dbo.usp_WebPayQrImage', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_WebPayQrImage
GO
CREATE PROCEDURE dbo.usp_WebPayQrImage
	@id int
AS
SET NOCOUNT ON
SELECT imageFile FROM dbo.WEB_PAY_QR WHERE id = @id AND isOn = 1
GO

-- Two result sets: the live VIP (none once endsAt has passed), then the account's last 20 requests, newest first.
IF OBJECT_ID(N'dbo.usp_WebVipMine', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_WebVipMine
GO
CREATE PROCEDURE dbo.usp_WebVipMine
	@account varchar(32)
AS
SET NOCOUNT ON
SELECT v.level, t.name, CONVERT(varchar(19), v.endsAt, 126) + 'Z' AS endsAt
FROM dbo.WEB_VIP v LEFT JOIN dbo.WEB_VIP_TIER t ON t.level = v.level
WHERE v.account = @account AND v.endsAt > SYSUTCDATETIME()
SELECT TOP 20 r.id, r.level, t.name, r.currency, r.priceCents, r.reference, r.status, r.reason,
	CAST(CASE WHEN r.receiptFile IS NULL THEN 0 ELSE 1 END AS bit) AS hasReceipt,
	CONVERT(varchar(19), r.createdAt, 126) + 'Z' AS createdAt,
	CONVERT(varchar(19), r.decidedAt, 126) + 'Z' AS decidedAt,
	CONVERT(varchar(19), r.vipEndsAt, 126) + 'Z' AS vipEndsAt
FROM dbo.WEB_VIP_REQUEST r LEFT JOIN dbo.WEB_VIP_TIER t ON t.level = r.level
WHERE r.account = @account
ORDER BY r.id DESC
GO

-- A new request: the new id, or -1 the tier is missing or off, -2 the account has @maxPending requests processing,
-- -3 the reference is on a request that is processing or approved (a rejected one frees it), -4 the tier has no price
-- in @currency (PHP without a peso price). The price is the tier's now, in @currency. The checks and the insert are one
-- transaction under key locks, so requests sent at once cannot pass them.
IF OBJECT_ID(N'dbo.usp_WebVipRequestAdd', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_WebVipRequestAdd
GO
CREATE PROCEDURE dbo.usp_WebVipRequestAdd
	@account varchar(32), @level tinyint, @currency char(3), @reference varchar(40), @referenceKey varchar(40),
	@receiptFile varchar(40), @address varchar(45), @maxPending int
AS
SET NOCOUNT ON
SET XACT_ABORT ON
DECLARE @found bit, @price int, @id int
BEGIN TRANSACTION
SELECT @found = 1, @price = CASE @currency WHEN 'USD' THEN priceCents WHEN 'PHP' THEN pricePhpCents END
FROM dbo.WEB_VIP_TIER WHERE level = @level AND isOn = 1
IF @found IS NULL
BEGIN
	ROLLBACK
	SELECT -1 AS id
	RETURN
END
IF @price IS NULL
BEGIN
	ROLLBACK
	SELECT -4 AS id
	RETURN
END
IF (SELECT COUNT(*) FROM dbo.WEB_VIP_REQUEST WITH (UPDLOCK, HOLDLOCK) WHERE account = @account AND status = 'P') >= @maxPending
BEGIN
	ROLLBACK
	SELECT -2 AS id
	RETURN
END
IF EXISTS (SELECT 1 FROM dbo.WEB_VIP_REQUEST WITH (UPDLOCK, HOLDLOCK) WHERE referenceKey = @referenceKey AND status IN ('P', 'A'))
BEGIN
	ROLLBACK
	SELECT -3 AS id
	RETURN
END
INSERT dbo.WEB_VIP_REQUEST (account, level, currency, priceCents, reference, referenceKey, receiptFile, address)
VALUES (@account, @level, @currency, @price, @reference, @referenceKey, @receiptFile, @address)
SET @id = CAST(SCOPE_IDENTITY() AS int)
COMMIT
SELECT @id AS id
GO

-- The receipt file of one of the account's own requests (nothing for anyone else's, NULL once it was deleted).
IF OBJECT_ID(N'dbo.usp_WebVipReceipt', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_WebVipReceipt
GO
CREATE PROCEDURE dbo.usp_WebVipReceipt
	@id int, @account varchar(32)
AS
SET NOCOUNT ON
SELECT receiptFile FROM dbo.WEB_VIP_REQUEST WHERE id = @id AND account = @account
GO

-- ---------------------------------------------------------------------------------------------------------------
-- The panel's procedures (flyffweb_admin)
-- ---------------------------------------------------------------------------------------------------------------

-- Requests by status: P oldest first (the queue), A and R newest first; 100 rows. Each with the account's live VIP.
IF OBJECT_ID(N'dbo.usp_AdminVipRequests', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_AdminVipRequests
GO
CREATE PROCEDURE dbo.usp_AdminVipRequests
	@status char(1)
AS
SET NOCOUNT ON
SELECT TOP 100 r.id, r.account, r.level, t.name, r.currency, r.priceCents, r.reference, r.status, r.reason, r.address, r.decidedBy,
	CAST(CASE WHEN r.receiptFile IS NULL THEN 0 ELSE 1 END AS bit) AS hasReceipt,
	CONVERT(varchar(19), r.createdAt, 126) + 'Z' AS createdAt,
	CONVERT(varchar(19), r.decidedAt, 126) + 'Z' AS decidedAt,
	CONVERT(varchar(19), r.vipEndsAt, 126) + 'Z' AS vipEndsAt,
	CASE WHEN v.endsAt > SYSUTCDATETIME() THEN v.level END AS vipLevel,
	CASE WHEN v.endsAt > SYSUTCDATETIME() THEN CONVERT(varchar(19), v.endsAt, 126) + 'Z' END AS vipNowEndsAt
FROM dbo.WEB_VIP_REQUEST r
LEFT JOIN dbo.WEB_VIP_TIER t ON t.level = r.level
LEFT JOIN dbo.WEB_VIP v ON v.account = r.account
WHERE r.status = @status
ORDER BY CASE WHEN @status = 'P' THEN r.id ELSE -r.id END
GO

IF OBJECT_ID(N'dbo.usp_AdminVipRequestGet', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_AdminVipRequestGet
GO
CREATE PROCEDURE dbo.usp_AdminVipRequestGet
	@id int
AS
SET NOCOUNT ON
SELECT r.id, r.account, r.level, t.name, r.currency, r.priceCents, r.reference, r.status, r.reason, r.address, r.decidedBy, r.receiptFile,
	CAST(CASE WHEN r.receiptFile IS NULL THEN 0 ELSE 1 END AS bit) AS hasReceipt,
	CONVERT(varchar(19), r.createdAt, 126) + 'Z' AS createdAt,
	CONVERT(varchar(19), r.decidedAt, 126) + 'Z' AS decidedAt,
	CONVERT(varchar(19), r.vipEndsAt, 126) + 'Z' AS vipEndsAt,
	CASE WHEN v.endsAt > SYSUTCDATETIME() THEN v.level END AS vipLevel,
	CASE WHEN v.endsAt > SYSUTCDATETIME() THEN CONVERT(varchar(19), v.endsAt, 126) + 'Z' END AS vipNowEndsAt
FROM dbo.WEB_VIP_REQUEST r
LEFT JOIN dbo.WEB_VIP_TIER t ON t.level = r.level
LEFT JOIN dbo.WEB_VIP v ON v.account = r.account
WHERE r.id = @id
GO

-- Approves a request that is still processing: 1 with the level and the new end time, 0 it was decided already, -1 no
-- such request. The rule: the same tier while it still runs adds one month to its end; anything else (no VIP, an
-- ended one, or another tier) starts the request's tier now, for one month. All in one transaction.
IF OBJECT_ID(N'dbo.usp_AdminVipApprove', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_AdminVipApprove
GO
CREATE PROCEDURE dbo.usp_AdminVipApprove
	@id int, @admin varchar(32)
AS
SET NOCOUNT ON
SET XACT_ABORT ON
DECLARE @account varchar(32), @level tinyint, @status char(1), @now datetime2(0), @curLevel tinyint, @curEnds datetime2(0), @start datetime2(0), @ends datetime2(0)
SET @now = SYSUTCDATETIME()
BEGIN TRANSACTION
SELECT @account = account, @level = level, @status = status FROM dbo.WEB_VIP_REQUEST WITH (UPDLOCK, HOLDLOCK) WHERE id = @id
IF @account IS NULL OR @status <> 'P'
BEGIN
	ROLLBACK
	SELECT CASE WHEN @account IS NULL THEN -1 ELSE 0 END AS result, CAST(NULL AS tinyint) AS level, CAST(NULL AS varchar(20)) AS endsAt
	RETURN
END
SELECT @curLevel = level, @curEnds = endsAt FROM dbo.WEB_VIP WITH (UPDLOCK, HOLDLOCK) WHERE account = @account
IF @curLevel = @level AND @curEnds > @now SET @start = @curEnds ELSE SET @start = @now
SET @ends = DATEADD(month, 1, @start)
IF @curEnds IS NULL
	INSERT dbo.WEB_VIP (account, level, endsAt) VALUES (@account, @level, @ends)
ELSE
	UPDATE dbo.WEB_VIP SET level = @level, endsAt = @ends, updatedAt = @now WHERE account = @account
UPDATE dbo.WEB_VIP_REQUEST SET status = 'A', decidedAt = @now, decidedBy = @admin, vipEndsAt = @ends WHERE id = @id
COMMIT
SELECT 1 AS result, @level AS level, CONVERT(varchar(19), @ends, 126) + 'Z' AS endsAt
GO

-- Rejects a request that is still processing, with the reason the player will see: 1 done, 0 not processing any more.
IF OBJECT_ID(N'dbo.usp_AdminVipReject', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_AdminVipReject
GO
CREATE PROCEDURE dbo.usp_AdminVipReject
	@id int, @admin varchar(32), @reason nvarchar(200)
AS
SET NOCOUNT ON
UPDATE dbo.WEB_VIP_REQUEST SET status = 'R', reason = @reason, decidedAt = SYSUTCDATETIME(), decidedBy = @admin
WHERE id = @id AND status = 'P'
SELECT @@ROWCOUNT AS changed
GO

-- Forgets the receipt pictures of requests rejected more than @days days ago and gives their files, so the service deletes
-- them (the requests stay, without a picture). Run by the web service every few hours (startVip.ts).
IF OBJECT_ID(N'dbo.usp_AdminVipForgetReceipts', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_AdminVipForgetReceipts
GO
CREATE PROCEDURE dbo.usp_AdminVipForgetReceipts
	@days int
AS
SET NOCOUNT ON
UPDATE dbo.WEB_VIP_REQUEST SET receiptFile = NULL
OUTPUT deleted.receiptFile
WHERE status = 'R' AND receiptFile IS NOT NULL AND decidedAt < DATEADD(day, -@days, SYSUTCDATETIME())
GO

IF OBJECT_ID(N'dbo.usp_AdminVipTiers', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_AdminVipTiers
GO
CREATE PROCEDURE dbo.usp_AdminVipTiers
AS
SET NOCOUNT ON
SELECT level, name, priceCents, pricePhpCents, isOn FROM dbo.WEB_VIP_TIER ORDER BY level
GO

IF OBJECT_ID(N'dbo.usp_AdminVipTierSave', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_AdminVipTierSave
GO
CREATE PROCEDURE dbo.usp_AdminVipTierSave
	@level tinyint, @name nvarchar(32), @priceCents int, @pricePhpCents int, @isOn bit
AS
SET NOCOUNT ON
UPDATE dbo.WEB_VIP_TIER SET name = @name, priceCents = @priceCents, pricePhpCents = @pricePhpCents, isOn = @isOn WHERE level = @level
SELECT @@ROWCOUNT AS changed
GO

IF OBJECT_ID(N'dbo.usp_AdminPayQrList', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_AdminPayQrList
GO
CREATE PROCEDURE dbo.usp_AdminPayQrList
AS
SET NOCOUNT ON
SELECT id, label, accountName, note, imageFile, isOn, sortOrder, CONVERT(varchar(19), createdAt, 126) + 'Z' AS createdAt
FROM dbo.WEB_PAY_QR ORDER BY sortOrder, id
GO

IF OBJECT_ID(N'dbo.usp_AdminPayQrAdd', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_AdminPayQrAdd
GO
CREATE PROCEDURE dbo.usp_AdminPayQrAdd
	@label nvarchar(40), @accountName nvarchar(80), @note nvarchar(200), @imageFile varchar(40), @isOn bit, @sortOrder int
AS
SET NOCOUNT ON
INSERT dbo.WEB_PAY_QR (label, accountName, note, imageFile, isOn, sortOrder)
VALUES (@label, @accountName, @note, @imageFile, @isOn, @sortOrder)
SELECT CAST(SCOPE_IDENTITY() AS int) AS id
GO

IF OBJECT_ID(N'dbo.usp_AdminPayQrSave', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_AdminPayQrSave
GO
CREATE PROCEDURE dbo.usp_AdminPayQrSave
	@id int, @label nvarchar(40), @accountName nvarchar(80), @note nvarchar(200), @isOn bit, @sortOrder int
AS
SET NOCOUNT ON
UPDATE dbo.WEB_PAY_QR SET label = @label, accountName = @accountName, note = @note, isOn = @isOn, sortOrder = @sortOrder
WHERE id = @id
SELECT @@ROWCOUNT AS changed
GO

-- Deletes a QR and gives its picture file, so the service deletes the file too (nothing when there was no such QR).
IF OBJECT_ID(N'dbo.usp_AdminPayQrDelete', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_AdminPayQrDelete
GO
CREATE PROCEDURE dbo.usp_AdminPayQrDelete
	@id int
AS
SET NOCOUNT ON
DELETE dbo.WEB_PAY_QR OUTPUT deleted.imageFile WHERE id = @id
GO

-- ---------------------------------------------------------------------------------------------------------------
-- Who may run them (only logins already made by Install-WebLogin.ps1 / Install-AdminLogin.ps1)
-- ---------------------------------------------------------------------------------------------------------------
IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'flyffweb_site')
BEGIN
	GRANT EXECUTE ON OBJECT::dbo.usp_WebPlayerLogin TO [flyffweb_site]
	GRANT EXECUTE ON OBJECT::dbo.usp_WebVipTiers TO [flyffweb_site]
	GRANT EXECUTE ON OBJECT::dbo.usp_WebPayQrList TO [flyffweb_site]
	GRANT EXECUTE ON OBJECT::dbo.usp_WebPayQrImage TO [flyffweb_site]
	GRANT EXECUTE ON OBJECT::dbo.usp_WebVipMine TO [flyffweb_site]
	GRANT EXECUTE ON OBJECT::dbo.usp_WebVipRequestAdd TO [flyffweb_site]
	GRANT EXECUTE ON OBJECT::dbo.usp_WebVipReceipt TO [flyffweb_site]
END
GO
IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'flyffweb_admin')
BEGIN
	GRANT EXECUTE ON OBJECT::dbo.usp_AdminVipRequests TO [flyffweb_admin]
	GRANT EXECUTE ON OBJECT::dbo.usp_AdminVipRequestGet TO [flyffweb_admin]
	GRANT EXECUTE ON OBJECT::dbo.usp_AdminVipApprove TO [flyffweb_admin]
	GRANT EXECUTE ON OBJECT::dbo.usp_AdminVipReject TO [flyffweb_admin]
	GRANT EXECUTE ON OBJECT::dbo.usp_AdminVipForgetReceipts TO [flyffweb_admin]
	GRANT EXECUTE ON OBJECT::dbo.usp_AdminVipTiers TO [flyffweb_admin]
	GRANT EXECUTE ON OBJECT::dbo.usp_AdminVipTierSave TO [flyffweb_admin]
	GRANT EXECUTE ON OBJECT::dbo.usp_AdminPayQrList TO [flyffweb_admin]
	GRANT EXECUTE ON OBJECT::dbo.usp_AdminPayQrAdd TO [flyffweb_admin]
	GRANT EXECUTE ON OBJECT::dbo.usp_AdminPayQrSave TO [flyffweb_admin]
	GRANT EXECUTE ON OBJECT::dbo.usp_AdminPayQrDelete TO [flyffweb_admin]
END
GO
