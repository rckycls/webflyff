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
--   dbo.WEB_VIP_GIFT     (2026-11-19, VIP perks) one gift box per approved request (and per Give VIP with its tick):
--                        queued with the approval, sent by the website's VIP job (in-game mail), then marked sent;
--   dbo.WEB_VIP_GIFT_ITEM what each tier's box holds (up to 6 item stacks); a starting list is put in while it is empty;
--   and, in CHARACTER_01_DBF, dbo.WEB_VIP_GIFT_SENT (each gift whose mails were written, so none goes twice) with the
--   usp_AdminVip* procedures that read and reset the characters' VIP letters and write the gift mails (MAIL_STR 'A1'
--   into server index 51: the Database server's real-time mail, __GETMAILREALTIME, hands them to the player);
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

-- 2026-11-19 (VIP perks): the gift boxes. requestId is the approved request (NULL for Give VIP); idPlayer, the
-- character's name and the items are written when the box is sent.
IF OBJECT_ID(N'dbo.WEB_VIP_GIFT', N'U') IS NULL
	CREATE TABLE dbo.WEB_VIP_GIFT (
		id int IDENTITY(1,1) NOT NULL CONSTRAINT PK_WEB_VIP_GIFT PRIMARY KEY,
		account varchar(32) NOT NULL,
		level tinyint NOT NULL,
		requestId int NULL,
		createdAt datetime2(0) NOT NULL CONSTRAINT DF_WEB_VIP_GIFT_createdAt DEFAULT SYSUTCDATETIME(),
		createdBy varchar(32) NOT NULL,
		sentAt datetime2(0) NULL,
		idPlayer char(7) NULL,
		characterName varchar(32) NULL,
		items varchar(400) NULL
	)
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_WEB_VIP_GIFT_sent' AND object_id = OBJECT_ID(N'dbo.WEB_VIP_GIFT'))
	CREATE INDEX IX_WEB_VIP_GIFT_sent ON dbo.WEB_VIP_GIFT (sentAt, id)
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_WEB_VIP_GIFT_account' AND object_id = OBJECT_ID(N'dbo.WEB_VIP_GIFT'))
	CREATE INDEX IX_WEB_VIP_GIFT_account ON dbo.WEB_VIP_GIFT (account, id)
GO
IF OBJECT_ID(N'dbo.WEB_VIP_GIFT_ITEM', N'U') IS NULL
	CREATE TABLE dbo.WEB_VIP_GIFT_ITEM (
		level tinyint NOT NULL,
		slot tinyint NOT NULL,
		itemId int NOT NULL,
		count int NOT NULL,
		CONSTRAINT PK_WEB_VIP_GIFT_ITEM PRIMARY KEY (level, slot),
		CONSTRAINT CK_WEB_VIP_GIFT_ITEM CHECK (level BETWEEN 1 AND 4 AND slot BETWEEN 1 AND 6 AND count BETWEEN 1 AND 9999 AND itemId > 0)
	)
GO
-- The starting boxes, put in only while the table is empty (the owner changes them in the panel's VIP tab): Remantis
-- Laccotte (HP, 10206), Refresher Hold (MP, 10207), Vital Drink X (FP, 10208), Town Blinkwing (4805) and Scroll of
-- Resurrection (10431), all stacking to 99.
IF NOT EXISTS (SELECT 1 FROM dbo.WEB_VIP_GIFT_ITEM)
	INSERT dbo.WEB_VIP_GIFT_ITEM (level, slot, itemId, count)
	SELECT v.level, v.slot, v.itemId, v.count
	FROM (VALUES
		(1, 1, 10206, 10), (1, 2, 10207, 10), (1, 3, 10208, 10), (1, 4, 4805, 5), (1, 5, 10431, 1),
		(2, 1, 10206, 20), (2, 2, 10207, 20), (2, 3, 10208, 20), (2, 4, 4805, 10), (2, 5, 10431, 2),
		(3, 1, 10206, 30), (3, 2, 10207, 30), (3, 3, 10208, 30), (3, 4, 4805, 15), (3, 5, 10431, 3),
		(4, 1, 10206, 50), (4, 2, 10207, 50), (4, 3, 10208, 50), (4, 4, 4805, 20), (4, 5, 10431, 5)
	) AS v (level, slot, itemId, count)
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

-- Three result sets: the live VIP (none once endsAt has passed), the account's last 20 requests, newest first, and
-- (2026-11-19, VIP perks) its latest gift box: its tier, when it was queued and sent, and to which character.
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
SELECT TOP 1 g.level, CONVERT(varchar(19), g.createdAt, 126) + 'Z' AS createdAt,
	CONVERT(varchar(19), g.sentAt, 126) + 'Z' AS sentAt, g.characterName
FROM dbo.WEB_VIP_GIFT g
WHERE g.account = @account
ORDER BY g.id DESC
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
-- ended one, or another tier) starts the request's tier now, for one month. All in one transaction. 2026-11-19 (VIP
-- perks): it also gives the account its VIP letter (only over a player or VIP letter: staff keep theirs) and queues
-- the month's gift box for the VIP job to send.
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
UPDATE dbo.ACCOUNT_TBL_DETAIL SET m_chLoginAuthority = CASE @level WHEN 1 THEN 'A' WHEN 2 THEN 'B' WHEN 3 THEN 'C' ELSE 'E' END
WHERE account = @account AND @level BETWEEN 1 AND 4 AND CAST(m_chLoginAuthority AS binary(1)) IN (0x46, 0x41, 0x42, 0x43, 0x45)
INSERT dbo.WEB_VIP_GIFT (account, level, requestId, createdBy) VALUES (@account, @level, @id, @admin)
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
-- 2026-11-19 (VIP perks): Give VIP, the VIP letters and the gift boxes (flyffweb_admin: the panel and the VIP job)
-- ---------------------------------------------------------------------------------------------------------------

-- Gives VIP without a payment: 1 with the level and the new end time, -1 no such account, -2 a level or a number of
-- days out of range. The same tier while it runs gets @days more; anything else starts the tier now for @days. The
-- account gets its VIP letter (only over a player or VIP letter), and @gift = 1 queues a gift box. One transaction.
IF OBJECT_ID(N'dbo.usp_AdminVipGive', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_AdminVipGive
GO
CREATE PROCEDURE dbo.usp_AdminVipGive
	@account varchar(32), @level tinyint, @days int, @gift bit, @admin varchar(32)
AS
SET NOCOUNT ON
SET XACT_ABORT ON
DECLARE @stored varchar(32), @now datetime2(0), @curLevel tinyint, @curEnds datetime2(0), @start datetime2(0), @ends datetime2(0)
IF @level IS NULL OR @level NOT BETWEEN 1 AND 4 OR @days IS NULL OR @days NOT BETWEEN 1 AND 366
BEGIN
	SELECT -2 AS result, CAST(NULL AS tinyint) AS level, CAST(NULL AS varchar(20)) AS endsAt
	RETURN
END
SELECT @stored = account FROM dbo.ACCOUNT_TBL_DETAIL WHERE account = @account
IF @stored IS NULL
BEGIN
	SELECT -1 AS result, CAST(NULL AS tinyint) AS level, CAST(NULL AS varchar(20)) AS endsAt
	RETURN
END
SET @now = SYSUTCDATETIME()
BEGIN TRANSACTION
SELECT @curLevel = level, @curEnds = endsAt FROM dbo.WEB_VIP WITH (UPDLOCK, HOLDLOCK) WHERE account = @stored
IF @curLevel = @level AND @curEnds > @now SET @start = @curEnds ELSE SET @start = @now
SET @ends = DATEADD(day, @days, @start)
IF @curEnds IS NULL
	INSERT dbo.WEB_VIP (account, level, endsAt) VALUES (@stored, @level, @ends)
ELSE
	UPDATE dbo.WEB_VIP SET level = @level, endsAt = @ends, updatedAt = @now WHERE account = @stored
UPDATE dbo.ACCOUNT_TBL_DETAIL SET m_chLoginAuthority = CASE @level WHEN 1 THEN 'A' WHEN 2 THEN 'B' WHEN 3 THEN 'C' ELSE 'E' END
WHERE account = @stored AND CAST(m_chLoginAuthority AS binary(1)) IN (0x46, 0x41, 0x42, 0x43, 0x45)
IF @gift = 1
	INSERT dbo.WEB_VIP_GIFT (account, level, requestId, createdBy) VALUES (@stored, @level, NULL, @admin)
COMMIT
SELECT 1 AS result, @level AS level, CONVERT(varchar(19), @ends, 126) + 'Z' AS endsAt
GO

-- The accounts whose own letter is a VIP letter (A, B, C, E, compared as bytes), for the VIP job's adoption step.
IF OBJECT_ID(N'dbo.usp_AdminVipLetterAccounts', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_AdminVipLetterAccounts
GO
CREATE PROCEDURE dbo.usp_AdminVipLetterAccounts
AS
SET NOCOUNT ON
SELECT account, m_chLoginAuthority AS letter FROM dbo.ACCOUNT_TBL_DETAIL
WHERE CAST(m_chLoginAuthority AS binary(1)) IN (0x41, 0x42, 0x43, 0x45)
GO

-- A VIP letter set by hand before the VIP perks (an account or a character with one, and no WEB_VIP row at all, ever)
-- becomes a 30-day VIP at that level, with no gift box, in the audit log as vip-job. 1 adopted, 0 the account already
-- has a row (paid, given or ended: the letter then follows that row).
IF OBJECT_ID(N'dbo.usp_AdminVipAdopt', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_AdminVipAdopt
GO
CREATE PROCEDURE dbo.usp_AdminVipAdopt
	@account varchar(32), @level tinyint
AS
SET NOCOUNT ON
SET XACT_ABORT ON
DECLARE @now datetime2(0)
IF @level IS NULL OR @level NOT BETWEEN 1 AND 4
BEGIN
	SELECT CAST(0 AS bit) AS adopted
	RETURN
END
SET @now = SYSUTCDATETIME()
BEGIN TRANSACTION
IF NOT EXISTS (SELECT 1 FROM dbo.WEB_VIP WITH (UPDLOCK, HOLDLOCK) WHERE account = @account)
BEGIN
	INSERT dbo.WEB_VIP (account, level, endsAt) VALUES (@account, @level, DATEADD(day, 30, @now))
	INSERT dbo.WEB_ADMIN_LOG (admin, address, action, account, result, before, after, endedAt)
	VALUES ('vip-job', '', 'vip.adopt', @account, 'ok', N'{"letter":"set by hand"}', N'{"level":' + CAST(@level AS nvarchar(2)) + N',"days":30}', @now)
	COMMIT
	SELECT CAST(1 AS bit) AS adopted
	RETURN
END
COMMIT
SELECT CAST(0 AS bit) AS adopted
GO

-- Puts every player or VIP account letter right: the live WEB_VIP level's letter, else F. Staff letters never change.
-- Each change is one audit row (vip-job); the changes come back as account, before, after.
IF OBJECT_ID(N'dbo.usp_AdminVipSyncLetters', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_AdminVipSyncLetters
GO
CREATE PROCEDURE dbo.usp_AdminVipSyncLetters
AS
SET NOCOUNT ON
SET XACT_ABORT ON
DECLARE @now datetime2(0)
DECLARE @changes TABLE (account varchar(32) NOT NULL, before char(1) NOT NULL, after char(1) NOT NULL)
SET @now = SYSUTCDATETIME()
BEGIN TRANSACTION
;WITH wanted AS (
	SELECT d.account, d.m_chLoginAuthority,
		CASE (SELECT v.level FROM dbo.WEB_VIP v WHERE v.account = d.account AND v.endsAt > @now)
			WHEN 1 THEN 'A' WHEN 2 THEN 'B' WHEN 3 THEN 'C' WHEN 4 THEN 'E' ELSE 'F' END AS letter
	FROM dbo.ACCOUNT_TBL_DETAIL d WITH (UPDLOCK)
	WHERE CAST(d.m_chLoginAuthority AS binary(1)) IN (0x41, 0x42, 0x43, 0x45)
		OR (CAST(d.m_chLoginAuthority AS binary(1)) IN (0x46) AND EXISTS (SELECT 1 FROM dbo.WEB_VIP v WHERE v.account = d.account AND v.endsAt > @now))
)
UPDATE wanted SET m_chLoginAuthority = letter
OUTPUT inserted.account, deleted.m_chLoginAuthority, inserted.m_chLoginAuthority INTO @changes (account, before, after)
WHERE CAST(m_chLoginAuthority AS binary(1)) <> CAST(letter AS binary(1))
INSERT dbo.WEB_ADMIN_LOG (admin, address, action, account, result, before, after, endedAt)
SELECT 'vip-job', '', 'vip.letter', account, 'ok', N'{"letter":"' + before + N'"}', N'{"letter":"' + after + N'"}', @now FROM @changes
COMMIT
SELECT account, before, after FROM @changes
GO

-- The gift boxes not sent yet, oldest first.
IF OBJECT_ID(N'dbo.usp_AdminVipGiftsPending', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_AdminVipGiftsPending
GO
CREATE PROCEDURE dbo.usp_AdminVipGiftsPending
	@max int
AS
SET NOCOUNT ON
SELECT TOP (@max) id, account, level, requestId, CONVERT(varchar(19), createdAt, 126) + 'Z' AS createdAt
FROM dbo.WEB_VIP_GIFT
WHERE sentAt IS NULL
ORDER BY id
GO

-- Marks a gift box sent (once): to whom, and what it held. 1 marked, 0 it was marked already.
IF OBJECT_ID(N'dbo.usp_AdminVipGiftMarkSent', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_AdminVipGiftMarkSent
GO
CREATE PROCEDURE dbo.usp_AdminVipGiftMarkSent
	@id int, @idPlayer char(7), @characterName varchar(32), @items varchar(400)
AS
SET NOCOUNT ON
UPDATE dbo.WEB_VIP_GIFT SET sentAt = SYSUTCDATETIME(), idPlayer = @idPlayer, characterName = @characterName, items = @items
WHERE id = @id AND sentAt IS NULL
SELECT @@ROWCOUNT AS changed
GO

-- What each tier's box holds, by tier and slot.
IF OBJECT_ID(N'dbo.usp_AdminVipGiftItems', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_AdminVipGiftItems
GO
CREATE PROCEDURE dbo.usp_AdminVipGiftItems
AS
SET NOCOUNT ON
SELECT level, slot, itemId, count FROM dbo.WEB_VIP_GIFT_ITEM ORDER BY level, slot
GO

-- Puts an item stack in a tier's slot (1-6), or empties the slot with @count 0: 1 done, -1 a value out of range.
IF OBJECT_ID(N'dbo.usp_AdminVipGiftItemSet', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_AdminVipGiftItemSet
GO
CREATE PROCEDURE dbo.usp_AdminVipGiftItemSet
	@level tinyint, @slot tinyint, @itemId int, @count int
AS
SET NOCOUNT ON
SET XACT_ABORT ON
IF @level IS NULL OR @level NOT BETWEEN 1 AND 4 OR @slot IS NULL OR @slot NOT BETWEEN 1 AND 6 OR @count IS NULL OR @count NOT BETWEEN 0 AND 9999
	OR (@count > 0 AND (@itemId IS NULL OR @itemId < 1))
BEGIN
	SELECT -1 AS changed
	RETURN
END
BEGIN TRANSACTION
IF @count = 0
	DELETE dbo.WEB_VIP_GIFT_ITEM WHERE level = @level AND slot = @slot
ELSE
BEGIN
	UPDATE dbo.WEB_VIP_GIFT_ITEM WITH (UPDLOCK, HOLDLOCK) SET itemId = @itemId, count = @count WHERE level = @level AND slot = @slot
	IF @@ROWCOUNT = 0
		INSERT dbo.WEB_VIP_GIFT_ITEM (level, slot, itemId, count) VALUES (@level, @slot, @itemId, @count)
END
COMMIT
SELECT 1 AS changed
GO

-- The latest gift boxes, newest first, for the panel's Gifts log.
IF OBJECT_ID(N'dbo.usp_AdminVipGiftLog', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_AdminVipGiftLog
GO
CREATE PROCEDURE dbo.usp_AdminVipGiftLog
	@max int
AS
SET NOCOUNT ON
SELECT TOP (@max) id, account, level, requestId, createdBy, CONVERT(varchar(19), createdAt, 126) + 'Z' AS createdAt,
	CONVERT(varchar(19), sentAt, 126) + 'Z' AS sentAt, idPlayer, characterName, items
FROM dbo.WEB_VIP_GIFT
ORDER BY id DESC
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
	GRANT EXECUTE ON OBJECT::dbo.usp_AdminVipGive TO [flyffweb_admin]
	GRANT EXECUTE ON OBJECT::dbo.usp_AdminVipLetterAccounts TO [flyffweb_admin]
	GRANT EXECUTE ON OBJECT::dbo.usp_AdminVipAdopt TO [flyffweb_admin]
	GRANT EXECUTE ON OBJECT::dbo.usp_AdminVipSyncLetters TO [flyffweb_admin]
	GRANT EXECUTE ON OBJECT::dbo.usp_AdminVipGiftsPending TO [flyffweb_admin]
	GRANT EXECUTE ON OBJECT::dbo.usp_AdminVipGiftMarkSent TO [flyffweb_admin]
	GRANT EXECUTE ON OBJECT::dbo.usp_AdminVipGiftItems TO [flyffweb_admin]
	GRANT EXECUTE ON OBJECT::dbo.usp_AdminVipGiftItemSet TO [flyffweb_admin]
	GRANT EXECUTE ON OBJECT::dbo.usp_AdminVipGiftLog TO [flyffweb_admin]
END
GO

-- ---------------------------------------------------------------------------------------------------------------
-- 2026-11-19 (VIP perks), in CHARACTER_01_DBF: the characters' VIP letters and the gift mails (flyffweb_admin's user
-- there is made by Install-AdminLogin.ps1)
-- ---------------------------------------------------------------------------------------------------------------
USE [CHARACTER_01_DBF]
GO

-- Each gift box whose mails were written, with the character it went to: a second send of the same box finds it here.
IF OBJECT_ID(N'dbo.WEB_VIP_GIFT_SENT', N'U') IS NULL
	CREATE TABLE dbo.WEB_VIP_GIFT_SENT (
		giftId int NOT NULL CONSTRAINT PK_WEB_VIP_GIFT_SENT PRIMARY KEY,
		idPlayer char(7) NOT NULL,
		characterName varchar(32) NULL,
		sentAt datetime2(0) NOT NULL CONSTRAINT DF_WEB_VIP_GIFT_SENT_sentAt DEFAULT SYSUTCDATETIME()
	)
GO

-- The server 01 characters whose own letter is a VIP letter (A, B, C, E, compared as bytes), with their account.
IF OBJECT_ID(N'dbo.usp_AdminVipCharacterLetters', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_AdminVipCharacterLetters
GO
CREATE PROCEDURE dbo.usp_AdminVipCharacterLetters
AS
SET NOCOUNT ON
SELECT account, m_chAuthority AS letter FROM dbo.CHARACTER_TBL
WHERE serverindex = '01' AND CAST(m_chAuthority AS binary(1)) IN (0x41, 0x42, 0x43, 0x45)
GO

-- Puts every server 01 character's VIP letter back to F: VIP is the account's now (a character's own VIP letter would
-- win over its account's at entry, DbManagerJoin.cpp:237). The count changed comes back.
IF OBJECT_ID(N'dbo.usp_AdminVipClearCharacterLetters', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_AdminVipClearCharacterLetters
GO
CREATE PROCEDURE dbo.usp_AdminVipClearCharacterLetters
AS
SET NOCOUNT ON
UPDATE dbo.CHARACTER_TBL SET m_chAuthority = 'F'
WHERE serverindex = '01' AND CAST(m_chAuthority AS binary(1)) IN (0x41, 0x42, 0x43, 0x45)
SELECT @@ROWCOUNT AS changed
GO

-- Writes a gift box's mails, once: 1 sent (to idPlayer), 2 it was sent before (to idPlayer), 0 the account has no
-- character to send it to yet. The character: the one in the game now, else the one with the most play time (the
-- lowest id on a tie), never a deleted one. One mail per item stack, as MAIL_STR_REALTIME's 'I1' writes them: into
-- server index 51 (01 + 50), where the Database server's real-time mail (MAIL_STR_REALTIME 'S1') picks them up and
-- hands them to the player's mailbox. The mails and the sent mark are one transaction.
IF OBJECT_ID(N'dbo.usp_AdminVipGiftSend', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_AdminVipGiftSend
GO
CREATE PROCEDURE dbo.usp_AdminVipGiftSend
	@giftId int, @account varchar(32), @title varchar(128), @text varchar(255),
	@item1 int = 0, @count1 int = 0, @item2 int = 0, @count2 int = 0, @item3 int = 0, @count3 int = 0,
	@item4 int = 0, @count4 int = 0, @item5 int = 0, @count5 int = 0, @item6 int = 0, @count6 int = 0
AS
SET NOCOUNT ON
SET XACT_ABORT ON
DECLARE @idPlayer char(7), @name varchar(32), @tmCreate int, @nMail int, @slot int, @item int, @count int
BEGIN TRANSACTION
IF EXISTS (SELECT 1 FROM dbo.WEB_VIP_GIFT_SENT WITH (UPDLOCK, HOLDLOCK) WHERE giftId = @giftId)
BEGIN
	SELECT @idPlayer = idPlayer, @name = characterName FROM dbo.WEB_VIP_GIFT_SENT WHERE giftId = @giftId
	COMMIT
	SELECT 2 AS result, @idPlayer AS idPlayer, @name AS characterName
	RETURN
END
SELECT TOP 1 @idPlayer = m_idPlayer, @name = m_szName FROM dbo.CHARACTER_TBL
WHERE account = @account AND serverindex = '01' AND (isblock IS NULL OR isblock <> 'D')
ORDER BY CASE WHEN MultiServer > 0 THEN 0 ELSE 1 END, TotalPlayTime DESC, m_idPlayer
IF @idPlayer IS NULL
BEGIN
	COMMIT
	SELECT 0 AS result, CAST(NULL AS char(7)) AS idPlayer, CAST(NULL AS varchar(32)) AS characterName
	RETURN
END
SET @tmCreate = DATEDIFF(second, '1970-01-01', SYSUTCDATETIME())
SET @slot = 1
WHILE @slot <= 6
BEGIN
	SELECT @item = CASE @slot WHEN 1 THEN @item1 WHEN 2 THEN @item2 WHEN 3 THEN @item3 WHEN 4 THEN @item4 WHEN 5 THEN @item5 ELSE @item6 END,
		@count = CASE @slot WHEN 1 THEN @count1 WHEN 2 THEN @count2 WHEN 3 THEN @count3 WHEN 4 THEN @count4 WHEN 5 THEN @count5 ELSE @count6 END
	IF @item > 0 AND @count > 0
	BEGIN
		SELECT @nMail = ISNULL(MAX(nMail), 0) + 1 FROM dbo.MAIL_TBL WITH (UPDLOCK, HOLDLOCK) WHERE serverindex = '51'
		EXEC dbo.MAIL_STR @iGu = 'A1', @nMail = @nMail, @serverindex = '51', @idReceiver = @idPlayer, @idSender = '0000000',
			@nGold = 0, @tmCreate = @tmCreate, @byRead = 0, @szTitle = @title, @szText = @text, @dwItemId = @item, @nItemNum = @count
	END
	SET @slot = @slot + 1
END
INSERT dbo.WEB_VIP_GIFT_SENT (giftId, idPlayer, characterName) VALUES (@giftId, @idPlayer, @name)
COMMIT
SELECT 1 AS result, @idPlayer AS idPlayer, @name AS characterName
GO

IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'flyffweb_admin')
BEGIN
	GRANT EXECUTE ON OBJECT::dbo.usp_AdminVipCharacterLetters TO [flyffweb_admin]
	GRANT EXECUTE ON OBJECT::dbo.usp_AdminVipClearCharacterLetters TO [flyffweb_admin]
	GRANT EXECUTE ON OBJECT::dbo.usp_AdminVipGiftSend TO [flyffweb_admin]
END
GO
