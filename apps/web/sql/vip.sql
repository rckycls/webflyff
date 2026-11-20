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
-- 2026-11-20 (redeem codes, docs/superpowers/specs/2026-11-20-vip-codes-design.md): dbo.WEB_CODE (the codes the owner
--   makes: a VIP level for some days, up to 6 item stacks, or both; for everyone, only some accounts, or a batch of
--   one-use keys), WEB_CODE_ITEM, WEB_CODE_KEY, WEB_CODE_ACCOUNT and WEB_CODE_USE (each redeem, with the character its
--   items go to by in-game mail), and in CHARACTER_01_DBF, WEB_CODE_SENT (each use whose mails were written); the
--   site's usp_WebCodeCheck / usp_WebCodeRedeem / usp_WebCodeCharacter and the panel's usp_AdminCode* procedures.
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
-- The accounts the VIP job's adoption step has seen: each is adopted at most once, ever, so a WEB_VIP row the owner
-- deletes is never brought back by a letter set by hand long ago (the final review, 2026-11-19).
IF OBJECT_ID(N'dbo.WEB_VIP_ADOPTED', N'U') IS NULL
	CREATE TABLE dbo.WEB_VIP_ADOPTED (
		account varchar(32) NOT NULL CONSTRAINT PK_WEB_VIP_ADOPTED PRIMARY KEY,
		seenAt datetime2(0) NOT NULL CONSTRAINT DF_WEB_VIP_ADOPTED_seenAt DEFAULT SYSUTCDATETIME()
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

-- 2026-11-20 (redeem codes): the codes. kind E: for everyone (one key; each account once; maxUses, or no cap), L: only
-- the accounts in WEB_CODE_ACCOUNT (one key), K: a batch of one-use keys. A code gives a VIP level (1-4) for vipDays
-- days, the item stacks in WEB_CODE_ITEM, or both (usp_AdminCodeAdd refuses neither). What a code gives never changes
-- after it is made; the owner can change its label and end time, and turn it off.
IF OBJECT_ID(N'dbo.WEB_CODE', N'U') IS NULL
	CREATE TABLE dbo.WEB_CODE (
		id int IDENTITY(1,1) NOT NULL CONSTRAINT PK_WEB_CODE PRIMARY KEY,
		label varchar(64) NOT NULL,
		kind char(1) NOT NULL,
		vipLevel tinyint NOT NULL CONSTRAINT DF_WEB_CODE_vipLevel DEFAULT 0,
		vipDays smallint NOT NULL CONSTRAINT DF_WEB_CODE_vipDays DEFAULT 0,
		maxUses int NULL,
		uses int NOT NULL CONSTRAINT DF_WEB_CODE_uses DEFAULT 0,
		expiresAt datetime2(0) NOT NULL,
		isOn bit NOT NULL CONSTRAINT DF_WEB_CODE_isOn DEFAULT 1,
		createdAt datetime2(0) NOT NULL CONSTRAINT DF_WEB_CODE_createdAt DEFAULT SYSUTCDATETIME(),
		createdBy varchar(32) NOT NULL,
		CONSTRAINT CK_WEB_CODE CHECK (kind IN ('E', 'L', 'K')
			AND ((vipLevel = 0 AND vipDays = 0) OR (vipLevel BETWEEN 1 AND 4 AND vipDays BETWEEN 1 AND 366))
			AND (maxUses IS NULL OR maxUses >= 1))
	)
GO
-- 2026-11-20 (owner, "Bound (can't trade)"): a bound code's items are mailed with the game's binds flag
-- (CItemElem::binds, 0x02): IsBinds() then refuses them in a trade, a drop, a mail, a private shop and the guild bank.
-- Added to a WEB_CODE made before, as off.
IF COL_LENGTH(N'dbo.WEB_CODE', N'bound') IS NULL
	ALTER TABLE dbo.WEB_CODE ADD bound bit NOT NULL CONSTRAINT DF_WEB_CODE_bound DEFAULT 0
GO
IF OBJECT_ID(N'dbo.WEB_CODE_ITEM', N'U') IS NULL
	CREATE TABLE dbo.WEB_CODE_ITEM (
		codeId int NOT NULL,
		slot tinyint NOT NULL,
		itemId int NOT NULL,
		count int NOT NULL,
		CONSTRAINT PK_WEB_CODE_ITEM PRIMARY KEY (codeId, slot),
		CONSTRAINT CK_WEB_CODE_ITEM CHECK (slot BETWEEN 1 AND 6 AND count BETWEEN 1 AND 9999 AND itemId > 0)
	)
GO
-- The key as players type it, without spaces or dashes, in capitals. usedBy: the account that used a one-use key.
IF OBJECT_ID(N'dbo.WEB_CODE_KEY', N'U') IS NULL
	CREATE TABLE dbo.WEB_CODE_KEY (
		id int IDENTITY(1,1) NOT NULL CONSTRAINT PK_WEB_CODE_KEY PRIMARY KEY,
		codeId int NOT NULL,
		keyText varchar(32) NOT NULL CONSTRAINT UQ_WEB_CODE_KEY_keyText UNIQUE,
		usedBy varchar(32) NULL,
		usedAt datetime2(0) NULL
	)
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_WEB_CODE_KEY_code' AND object_id = OBJECT_ID(N'dbo.WEB_CODE_KEY'))
	CREATE INDEX IX_WEB_CODE_KEY_code ON dbo.WEB_CODE_KEY (codeId, id)
GO
IF OBJECT_ID(N'dbo.WEB_CODE_ACCOUNT', N'U') IS NULL
	CREATE TABLE dbo.WEB_CODE_ACCOUNT (
		codeId int NOT NULL,
		account varchar(32) NOT NULL,
		CONSTRAINT PK_WEB_CODE_ACCOUNT PRIMARY KEY (codeId, account)
	)
GO
-- Each redeem: who, which character the items go to, the VIP it gave (and the lower one it replaced), and when its
-- mails were written (deliveredAt; set at once when the code gives no item). requestId: the game's id for one press
-- of Redeem, so a press sent again after a lost answer gets the first answer back.
IF OBJECT_ID(N'dbo.WEB_CODE_USE', N'U') IS NULL
	CREATE TABLE dbo.WEB_CODE_USE (
		id int IDENTITY(1,1) NOT NULL CONSTRAINT PK_WEB_CODE_USE PRIMARY KEY,
		codeId int NOT NULL,
		keyId int NOT NULL,
		account varchar(32) NOT NULL,
		requestId varchar(64) NOT NULL,
		idPlayer char(7) NOT NULL,
		characterName varchar(32) NOT NULL,
		usedAt datetime2(0) NOT NULL CONSTRAINT DF_WEB_CODE_USE_usedAt DEFAULT SYSUTCDATETIME(),
		address varchar(45) NOT NULL,
		vipLevel tinyint NOT NULL,
		vipDays smallint NOT NULL,
		vipEndsAt datetime2(0) NULL,
		replacedLevel tinyint NULL,
		replacedEndsAt datetime2(0) NULL,
		deliveredAt datetime2(0) NULL,
		deliveredTo char(7) NULL,
		deliveredName varchar(32) NULL,
		CONSTRAINT UQ_WEB_CODE_USE_account UNIQUE (codeId, account),
		CONSTRAINT UQ_WEB_CODE_USE_request UNIQUE (account, requestId)
	)
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_WEB_CODE_USE_delivered' AND object_id = OBJECT_ID(N'dbo.WEB_CODE_USE'))
	CREATE INDEX IX_WEB_CODE_USE_delivered ON dbo.WEB_CODE_USE (deliveredAt, id)
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
	CONVERT(varchar(19), g.sentAt, 126) + 'Z' AS sentAt, g.characterName,
	CAST(CASE WHEN g.items = 'cancelled' THEN 1 ELSE 0 END AS bit) AS cancelled
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

-- A VIP letter set by hand before the VIP perks (an account or a character with one, and no WEB_VIP row at all)
-- becomes a 30-day VIP at that level, with no gift box, in the audit log as vip-job. Once per account, ever: the account
-- is marked in WEB_VIP_ADOPTED whatever the answer. 1 adopted, 0 the account has a row (paid, given or ended: the letter
-- then follows that row) or was seen before.
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
IF NOT EXISTS (SELECT 1 FROM dbo.WEB_VIP_ADOPTED WITH (UPDLOCK, HOLDLOCK) WHERE account = @account)
BEGIN
	INSERT dbo.WEB_VIP_ADOPTED (account) VALUES (@account)
	IF NOT EXISTS (SELECT 1 FROM dbo.WEB_VIP WITH (UPDLOCK, HOLDLOCK) WHERE account = @account)
	BEGIN
		INSERT dbo.WEB_VIP (account, level, endsAt) VALUES (@account, @level, DATEADD(day, 30, @now))
		INSERT dbo.WEB_ADMIN_LOG (admin, address, action, account, result, before, after, endedAt)
		VALUES ('vip-job', '', 'vip.adopt', @account, 'ok', N'{"letter":"set by hand"}', N'{"level":' + CAST(@level AS nvarchar(2)) + N',"days":30}', @now)
		COMMIT
		SELECT CAST(1 AS bit) AS adopted
		RETURN
	END
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
	FROM dbo.ACCOUNT_TBL_DETAIL d
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

-- The gift boxes not sent yet, oldest first, after the box @afterId (0: from the start): the job reads them a page at a
-- time, so boxes that wait never hold back the ones behind them.
IF OBJECT_ID(N'dbo.usp_AdminVipGiftsPending', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_AdminVipGiftsPending
GO
CREATE PROCEDURE dbo.usp_AdminVipGiftsPending
	@max int, @afterId int = 0
AS
SET NOCOUNT ON
SELECT TOP (@max) id, account, level, requestId, CONVERT(varchar(19), createdAt, 126) + 'Z' AS createdAt
FROM dbo.WEB_VIP_GIFT
WHERE sentAt IS NULL AND id > @afterId
ORDER BY id
GO

-- Ends an account's live VIP now (the final review, 2026-11-19: a wrongly approved payment, say): its end time becomes
-- now, the account's letter goes back to F (only over a player or VIP letter), and its gift boxes not sent yet are
-- cancelled (marked sent with items 'cancelled', no character). 1 with the boxes cancelled, 0 no live VIP, -1 no such
-- account. One transaction, in the audit log through the panel's action.
IF OBJECT_ID(N'dbo.usp_AdminVipEnd', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_AdminVipEnd
GO
CREATE PROCEDURE dbo.usp_AdminVipEnd
	@account varchar(32)
AS
SET NOCOUNT ON
SET XACT_ABORT ON
DECLARE @stored varchar(32), @now datetime2(0), @cancelled int
SELECT @stored = account FROM dbo.ACCOUNT_TBL_DETAIL WHERE account = @account
IF @stored IS NULL
BEGIN
	SELECT -1 AS result, 0 AS cancelled
	RETURN
END
SET @now = SYSUTCDATETIME()
BEGIN TRANSACTION
UPDATE dbo.WEB_VIP WITH (UPDLOCK, HOLDLOCK) SET endsAt = @now, updatedAt = @now WHERE account = @stored AND endsAt > @now
IF @@ROWCOUNT = 0
BEGIN
	COMMIT
	SELECT 0 AS result, 0 AS cancelled
	RETURN
END
UPDATE dbo.ACCOUNT_TBL_DETAIL SET m_chLoginAuthority = 'F'
WHERE account = @stored AND CAST(m_chLoginAuthority AS binary(1)) IN (0x46, 0x41, 0x42, 0x43, 0x45)
UPDATE dbo.WEB_VIP_GIFT SET sentAt = @now, items = 'cancelled' WHERE account = @stored AND sentAt IS NULL
SET @cancelled = @@ROWCOUNT
COMMIT
SELECT 1 AS result, @cancelled AS cancelled
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
-- 2026-11-20 (redeem codes): the site's check and redeem (flyffweb_site), the panel's codes (flyffweb_admin)
-- ---------------------------------------------------------------------------------------------------------------
-- The answers of check and redeem: 1 ok, 2 ok and it would replace a lower live VIP (check only: redeem then needs
-- @confirm = 1), 3 the same request id was redeemed before (that use's answer again), -1 no such key, -2 past its end
-- time, -3 turned off, -4 an everyone code at its cap, -5 a one-use key already used, -6 this account used the code,
-- -7 the account is not on the code's list, -8 the account has a higher live VIP (the whole code is refused, items
-- too), -9 it would replace a lower live VIP and @confirm is 0. Each answer: one row (the code's offer, NULL for -1;
-- liveLevel/liveEndsAt: the account's live VIP, after the redeem for 1 and 3) and the code's items by slot.

-- What a key would give this account now, without using it.
IF OBJECT_ID(N'dbo.usp_WebCodeCheck', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_WebCodeCheck
GO
CREATE PROCEDURE dbo.usp_WebCodeCheck
	@account varchar(32), @key varchar(32)
AS
SET NOCOUNT ON
DECLARE @now datetime2(0), @keyId int, @codeId int, @usedBy varchar(32), @kind char(1), @label varchar(64), @vipLevel tinyint,
	@vipDays smallint, @maxUses int, @uses int, @expiresAt datetime2(0), @isOn bit, @liveLevel tinyint, @liveEnds datetime2(0), @result int,
	@bound bit
SET @now = SYSUTCDATETIME()
SELECT @keyId = id, @codeId = codeId, @usedBy = usedBy FROM dbo.WEB_CODE_KEY WHERE keyText = @key
IF @keyId IS NOT NULL
	SELECT @kind = kind, @label = label, @vipLevel = vipLevel, @vipDays = vipDays, @maxUses = maxUses, @uses = uses,
		@expiresAt = expiresAt, @isOn = isOn, @bound = bound
	FROM dbo.WEB_CODE WHERE id = @codeId
SELECT @liveLevel = level, @liveEnds = endsAt FROM dbo.WEB_VIP WHERE account = @account AND endsAt > @now
SET @result = CASE
	WHEN @kind IS NULL THEN -1
	WHEN @isOn = 0 THEN -3
	WHEN @expiresAt <= @now THEN -2
	WHEN EXISTS (SELECT 1 FROM dbo.WEB_CODE_USE WHERE codeId = @codeId AND account = @account) THEN -6
	WHEN @kind = 'L' AND NOT EXISTS (SELECT 1 FROM dbo.WEB_CODE_ACCOUNT WHERE codeId = @codeId AND account = @account) THEN -7
	WHEN @kind = 'K' AND @usedBy IS NOT NULL THEN -5
	WHEN @kind = 'E' AND @maxUses IS NOT NULL AND @uses >= @maxUses THEN -4
	WHEN @vipLevel > 0 AND @liveLevel > @vipLevel THEN -8
	WHEN @vipLevel > 0 AND @liveLevel < @vipLevel THEN 2
	ELSE 1 END
SELECT @result AS result, CASE WHEN @result = -1 THEN NULL ELSE @codeId END AS codeId, @label AS label, @vipLevel AS vipLevel,
	@vipDays AS vipDays, CONVERT(varchar(19), @expiresAt, 126) + 'Z' AS expiresAt,
	@liveLevel AS liveLevel, CONVERT(varchar(19), @liveEnds, 126) + 'Z' AS liveEndsAt, @bound AS bound
SELECT itemId, count FROM dbo.WEB_CODE_ITEM WHERE codeId = @codeId AND @result <> -1 ORDER BY slot
GO

-- Uses a key for the account, its items going to the character @idPlayer (the site checked it is the account's with
-- usp_WebCodeCharacter). The checks, the use, the VIP (as Give VIP sets it: the same level while it runs gets the days
-- added; another level starts now; the account's letter only over a player or VIP letter) are one transaction under
-- key locks on the key, the code and the account's VIP row, so two redeems at once cannot both pass a cap or a
-- one-use key. The items are mailed afterwards by the panel's login (usp_AdminCodePending / usp_AdminCodeMailSend).
IF OBJECT_ID(N'dbo.usp_WebCodeRedeem', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_WebCodeRedeem
GO
CREATE PROCEDURE dbo.usp_WebCodeRedeem
	@account varchar(32), @key varchar(32), @requestId varchar(64), @idPlayer char(7), @characterName varchar(32),
	@address varchar(45), @confirm bit
AS
SET NOCOUNT ON
SET XACT_ABORT ON
DECLARE @now datetime2(0), @useId int, @keyId int, @codeId int, @usedBy varchar(32), @kind char(1), @label varchar(64),
	@vipLevel tinyint, @vipDays smallint, @maxUses int, @uses int, @expiresAt datetime2(0), @isOn bit, @curLevel tinyint,
	@curEnds datetime2(0), @liveLevel tinyint, @liveEnds datetime2(0), @result int, @start datetime2(0), @ends datetime2(0),
	@replacedLevel tinyint, @replacedEnds datetime2(0), @delivered datetime2(0), @bound bit
SET @now = SYSUTCDATETIME()
-- an answer lost on the way: the same press sent again gets the first answer back
SELECT @useId = id FROM dbo.WEB_CODE_USE WHERE account = @account AND requestId = @requestId
IF @useId IS NULL
BEGIN
	BEGIN TRANSACTION
	SELECT @keyId = id, @codeId = codeId, @usedBy = usedBy FROM dbo.WEB_CODE_KEY WITH (UPDLOCK, HOLDLOCK) WHERE keyText = @key
	IF @keyId IS NOT NULL
		SELECT @kind = kind, @label = label, @vipLevel = vipLevel, @vipDays = vipDays, @maxUses = maxUses, @uses = uses,
			@expiresAt = expiresAt, @isOn = isOn, @bound = bound
		FROM dbo.WEB_CODE WITH (UPDLOCK, HOLDLOCK) WHERE id = @codeId
	-- the same press may have won the race while this one waited for the locks
	SELECT @useId = id FROM dbo.WEB_CODE_USE WHERE account = @account AND requestId = @requestId
	IF @useId IS NOT NULL
		COMMIT
	ELSE
	BEGIN
		SELECT @curLevel = level, @curEnds = endsAt FROM dbo.WEB_VIP WITH (UPDLOCK, HOLDLOCK) WHERE account = @account
		IF @curEnds > @now SELECT @liveLevel = @curLevel, @liveEnds = @curEnds
		SET @result = CASE
			WHEN @kind IS NULL THEN -1
			WHEN @isOn = 0 THEN -3
			WHEN @expiresAt <= @now THEN -2
			WHEN EXISTS (SELECT 1 FROM dbo.WEB_CODE_USE WHERE codeId = @codeId AND account = @account) THEN -6
			WHEN @kind = 'L' AND NOT EXISTS (SELECT 1 FROM dbo.WEB_CODE_ACCOUNT WHERE codeId = @codeId AND account = @account) THEN -7
			WHEN @kind = 'K' AND @usedBy IS NOT NULL THEN -5
			WHEN @kind = 'E' AND @maxUses IS NOT NULL AND @uses >= @maxUses THEN -4
			WHEN @vipLevel > 0 AND @liveLevel > @vipLevel THEN -8
			WHEN @vipLevel > 0 AND @liveLevel < @vipLevel AND ISNULL(@confirm, 0) = 0 THEN -9
			ELSE 1 END
		IF @result <> 1
		BEGIN
			ROLLBACK
			SELECT @result AS result, CAST(NULL AS int) AS useId, CASE WHEN @result = -1 THEN NULL ELSE @codeId END AS codeId,
				@label AS label, @vipLevel AS vipLevel, @vipDays AS vipDays, CONVERT(varchar(19), @expiresAt, 126) + 'Z' AS expiresAt,
				@liveLevel AS liveLevel, CONVERT(varchar(19), @liveEnds, 126) + 'Z' AS liveEndsAt, @bound AS bound
			SELECT itemId, count FROM dbo.WEB_CODE_ITEM WHERE codeId = @codeId AND @result <> -1 ORDER BY slot
			RETURN
		END
		IF @vipLevel > 0
		BEGIN
			IF @liveLevel = @vipLevel SET @start = @liveEnds ELSE SET @start = @now
			SET @ends = DATEADD(day, @vipDays, @start)
			IF @liveLevel < @vipLevel SELECT @replacedLevel = @liveLevel, @replacedEnds = @liveEnds
			IF @curEnds IS NULL
				INSERT dbo.WEB_VIP (account, level, endsAt) VALUES (@account, @vipLevel, @ends)
			ELSE
				UPDATE dbo.WEB_VIP SET level = @vipLevel, endsAt = @ends, updatedAt = @now WHERE account = @account
			UPDATE dbo.ACCOUNT_TBL_DETAIL SET m_chLoginAuthority = CASE @vipLevel WHEN 1 THEN 'A' WHEN 2 THEN 'B' WHEN 3 THEN 'C' ELSE 'E' END
			WHERE account = @account AND CAST(m_chLoginAuthority AS binary(1)) IN (0x46, 0x41, 0x42, 0x43, 0x45)
		END
		IF NOT EXISTS (SELECT 1 FROM dbo.WEB_CODE_ITEM WHERE codeId = @codeId) SET @delivered = @now
		INSERT dbo.WEB_CODE_USE (codeId, keyId, account, requestId, idPlayer, characterName, usedAt, address, vipLevel, vipDays,
			vipEndsAt, replacedLevel, replacedEndsAt, deliveredAt)
		VALUES (@codeId, @keyId, @account, @requestId, @idPlayer, @characterName, @now, @address, @vipLevel, @vipDays,
			@ends, @replacedLevel, @replacedEnds, @delivered)
		SET @useId = SCOPE_IDENTITY()
		UPDATE dbo.WEB_CODE SET uses = uses + 1 WHERE id = @codeId
		IF @kind = 'K' UPDATE dbo.WEB_CODE_KEY SET usedBy = @account, usedAt = @now WHERE id = @keyId
		COMMIT
		SET @result = 1
	END
END
-- the answer of a use: 1 for the one just made, 3 for one made before with this request id
SELECT CASE WHEN @result = 1 THEN 1 ELSE 3 END AS result, u.id AS useId, c.id AS codeId, c.label, c.vipLevel, c.vipDays,
	CONVERT(varchar(19), c.expiresAt, 126) + 'Z' AS expiresAt,
	v.level AS liveLevel, CONVERT(varchar(19), v.endsAt, 126) + 'Z' AS liveEndsAt, c.bound
FROM dbo.WEB_CODE_USE u
JOIN dbo.WEB_CODE c ON c.id = u.codeId
LEFT JOIN dbo.WEB_VIP v ON v.account = u.account AND v.endsAt > SYSUTCDATETIME()
WHERE u.id = @useId
SELECT i.itemId, i.count FROM dbo.WEB_CODE_ITEM i JOIN dbo.WEB_CODE_USE u ON u.codeId = i.codeId WHERE u.id = @useId ORDER BY i.slot
GO

-- Makes a code with its items, its keys (<k>KEY</k>..., already in capitals without dashes) and, for kind L, its
-- accounts (<a>name</a>...): one row, result 1 with the new id, -1 a key is taken (detail: that key), -2 an account
-- does not exist (detail: that name), -3 a value out of range. Lists come as xml: the old databases' compatibility
-- level may not have STRING_SPLIT. One transaction.
IF OBJECT_ID(N'dbo.usp_AdminCodeAdd', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_AdminCodeAdd
GO
CREATE PROCEDURE dbo.usp_AdminCodeAdd
	@label varchar(64), @kind char(1), @vipLevel tinyint, @vipDays smallint, @maxUses int, @expiresAt datetime2(0), @admin varchar(32),
	@item1 int = 0, @count1 int = 0, @item2 int = 0, @count2 int = 0, @item3 int = 0, @count3 int = 0,
	@item4 int = 0, @count4 int = 0, @item5 int = 0, @count5 int = 0, @item6 int = 0, @count6 int = 0,
	@keys xml, @accounts xml = NULL, @bound bit = 0
AS
SET NOCOUNT ON
SET XACT_ABORT ON
DECLARE @id int, @taken varchar(32), @unknown varchar(32), @items int, @keyCount int, @accountCount int, @now datetime2(0)
DECLARE @keyList TABLE (keyText varchar(32) NOT NULL PRIMARY KEY)
DECLARE @accountList TABLE (account varchar(32) NOT NULL PRIMARY KEY)
DECLARE @itemList TABLE (slot tinyint NOT NULL, itemId int NOT NULL, count int NOT NULL)
SET @now = SYSUTCDATETIME()
INSERT @keyList (keyText) SELECT DISTINCT t.k.value('.', 'varchar(32)') FROM @keys.nodes('/k') AS t(k)
IF @accounts IS NOT NULL
	INSERT @accountList (account) SELECT DISTINCT t.a.value('.', 'varchar(32)') FROM @accounts.nodes('/a') AS t(a)
INSERT @itemList (slot, itemId, count)
SELECT v.slot, v.itemId, v.count
FROM (VALUES (1, @item1, @count1), (2, @item2, @count2), (3, @item3, @count3), (4, @item4, @count4), (5, @item5, @count5), (6, @item6, @count6))
	AS v (slot, itemId, count)
WHERE v.itemId > 0 AND v.count > 0
SELECT @items = COUNT(*) FROM @itemList
SELECT @keyCount = COUNT(*) FROM @keyList
SELECT @accountCount = COUNT(*) FROM @accountList
IF ISNULL(LTRIM(@label), '') = '' OR @kind IS NULL OR @kind NOT IN ('E', 'L', 'K')
	OR @vipLevel IS NULL OR @vipDays IS NULL
	OR NOT ((@vipLevel = 0 AND @vipDays = 0) OR (@vipLevel BETWEEN 1 AND 4 AND @vipDays BETWEEN 1 AND 366))
	OR (@vipLevel = 0 AND @items = 0)
	OR EXISTS (SELECT 1 FROM @itemList WHERE count > 9999)
	OR @expiresAt IS NULL OR @expiresAt <= @now OR @expiresAt > DATEADD(day, 366, @now)
	OR @keyCount = 0 OR @keyCount > 500 OR (@kind <> 'K' AND @keyCount <> 1)
	OR EXISTS (SELECT 1 FROM @keyList WHERE LEN(keyText) < 4)
	OR (@kind = 'L' AND (@accountCount = 0 OR @accountCount > 500)) OR (@kind <> 'L' AND @accountCount > 0)
	OR (@maxUses IS NOT NULL AND (@kind <> 'E' OR @maxUses < 1))
BEGIN
	SELECT -3 AS result, CAST(NULL AS int) AS id, CAST(NULL AS varchar(32)) AS detail
	RETURN
END
BEGIN TRANSACTION
SELECT TOP 1 @taken = l.keyText FROM @keyList l JOIN dbo.WEB_CODE_KEY k WITH (UPDLOCK, HOLDLOCK) ON k.keyText = l.keyText ORDER BY l.keyText
IF @taken IS NOT NULL
BEGIN
	ROLLBACK
	SELECT -1 AS result, CAST(NULL AS int) AS id, @taken AS detail
	RETURN
END
SELECT TOP 1 @unknown = l.account FROM @accountList l
WHERE NOT EXISTS (SELECT 1 FROM dbo.ACCOUNT_TBL_DETAIL d WHERE d.account = l.account) ORDER BY l.account
IF @unknown IS NOT NULL
BEGIN
	ROLLBACK
	SELECT -2 AS result, CAST(NULL AS int) AS id, @unknown AS detail
	RETURN
END
INSERT dbo.WEB_CODE (label, kind, vipLevel, vipDays, maxUses, expiresAt, createdBy, bound)
VALUES (@label, @kind, @vipLevel, @vipDays, @maxUses, @expiresAt, @admin, ISNULL(@bound, 0))
SET @id = SCOPE_IDENTITY()
INSERT dbo.WEB_CODE_ITEM (codeId, slot, itemId, count) SELECT @id, slot, itemId, count FROM @itemList
INSERT dbo.WEB_CODE_KEY (codeId, keyText) SELECT @id, keyText FROM @keyList
-- each account as stored (its own spelling)
INSERT dbo.WEB_CODE_ACCOUNT (codeId, account)
SELECT DISTINCT @id, d.account FROM @accountList l JOIN dbo.ACCOUNT_TBL_DETAIL d ON d.account = l.account
COMMIT
SELECT 1 AS result, @id AS id, CAST(NULL AS varchar(32)) AS detail
GO

-- Every code, newest first, with its key counts and (for kinds E and L) its key; then every code's items.
IF OBJECT_ID(N'dbo.usp_AdminCodeList', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_AdminCodeList
GO
CREATE PROCEDURE dbo.usp_AdminCodeList
AS
SET NOCOUNT ON
SELECT c.id, c.label, c.kind, c.vipLevel, c.vipDays, c.maxUses, c.uses, CONVERT(varchar(19), c.expiresAt, 126) + 'Z' AS expiresAt,
	c.isOn, CONVERT(varchar(19), c.createdAt, 126) + 'Z' AS createdAt, c.createdBy, c.bound,
	(SELECT COUNT(*) FROM dbo.WEB_CODE_KEY k WHERE k.codeId = c.id) AS keysTotal,
	(SELECT COUNT(*) FROM dbo.WEB_CODE_KEY k WHERE k.codeId = c.id AND k.usedBy IS NULL) AS keysUnused,
	CASE WHEN c.kind <> 'K' THEN (SELECT TOP 1 k.keyText FROM dbo.WEB_CODE_KEY k WHERE k.codeId = c.id ORDER BY k.id) END AS firstKey
FROM dbo.WEB_CODE c
ORDER BY c.id DESC
SELECT codeId, slot, itemId, count FROM dbo.WEB_CODE_ITEM ORDER BY codeId, slot
GO

-- One code: its row (as in the list), its items, and its accounts (kind L).
IF OBJECT_ID(N'dbo.usp_AdminCodeGet', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_AdminCodeGet
GO
CREATE PROCEDURE dbo.usp_AdminCodeGet
	@id int
AS
SET NOCOUNT ON
SELECT c.id, c.label, c.kind, c.vipLevel, c.vipDays, c.maxUses, c.uses, CONVERT(varchar(19), c.expiresAt, 126) + 'Z' AS expiresAt,
	c.isOn, CONVERT(varchar(19), c.createdAt, 126) + 'Z' AS createdAt, c.createdBy, c.bound,
	(SELECT COUNT(*) FROM dbo.WEB_CODE_KEY k WHERE k.codeId = c.id) AS keysTotal,
	(SELECT COUNT(*) FROM dbo.WEB_CODE_KEY k WHERE k.codeId = c.id AND k.usedBy IS NULL) AS keysUnused,
	CASE WHEN c.kind <> 'K' THEN (SELECT TOP 1 k.keyText FROM dbo.WEB_CODE_KEY k WHERE k.codeId = c.id ORDER BY k.id) END AS firstKey
FROM dbo.WEB_CODE c
WHERE c.id = @id
SELECT codeId, slot, itemId, count FROM dbo.WEB_CODE_ITEM WHERE codeId = @id ORDER BY slot
SELECT account FROM dbo.WEB_CODE_ACCOUNT WHERE codeId = @id ORDER BY account
GO

-- A code's keys, in the order they were made, with who used each (one-use keys).
IF OBJECT_ID(N'dbo.usp_AdminCodeKeys', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_AdminCodeKeys
GO
CREATE PROCEDURE dbo.usp_AdminCodeKeys
	@id int
AS
SET NOCOUNT ON
SELECT keyText, usedBy, CONVERT(varchar(19), usedAt, 126) + 'Z' AS usedAt FROM dbo.WEB_CODE_KEY WHERE codeId = @id ORDER BY id
GO

-- Changes a code's label, end time and on/off: changed 1, or 0 (no such code, or a value out of range).
IF OBJECT_ID(N'dbo.usp_AdminCodeSave', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_AdminCodeSave
GO
CREATE PROCEDURE dbo.usp_AdminCodeSave
	@id int, @label varchar(64), @expiresAt datetime2(0), @isOn bit
AS
SET NOCOUNT ON
IF ISNULL(LTRIM(@label), '') = '' OR @expiresAt IS NULL OR @expiresAt > DATEADD(day, 366, SYSUTCDATETIME()) OR @isOn IS NULL
BEGIN
	SELECT 0 AS changed
	RETURN
END
UPDATE dbo.WEB_CODE SET label = @label, expiresAt = @expiresAt, isOn = @isOn WHERE id = @id
SELECT @@ROWCOUNT AS changed
GO

-- A code's latest uses, newest first.
IF OBJECT_ID(N'dbo.usp_AdminCodeUses', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_AdminCodeUses
GO
CREATE PROCEDURE dbo.usp_AdminCodeUses
	@id int, @max int
AS
SET NOCOUNT ON
SELECT TOP (@max) id, account, idPlayer, characterName, CONVERT(varchar(19), usedAt, 126) + 'Z' AS usedAt, address, vipLevel, vipDays,
	CONVERT(varchar(19), vipEndsAt, 126) + 'Z' AS vipEndsAt, replacedLevel, CONVERT(varchar(19), replacedEndsAt, 126) + 'Z' AS replacedEndsAt,
	CONVERT(varchar(19), deliveredAt, 126) + 'Z' AS deliveredAt, deliveredName
FROM dbo.WEB_CODE_USE
WHERE codeId = @id
ORDER BY id DESC
GO

-- The uses whose mails are not written yet, oldest first, after the use @afterId (0: from the start), with their
-- codes' items: the VIP job reads them a page at a time, so uses that wait never hold back the ones behind them.
IF OBJECT_ID(N'dbo.usp_AdminCodePending', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_AdminCodePending
GO
CREATE PROCEDURE dbo.usp_AdminCodePending
	@max int, @afterId int
AS
SET NOCOUNT ON
DECLARE @page TABLE (id int NOT NULL PRIMARY KEY, codeId int NOT NULL)
INSERT @page (id, codeId) SELECT TOP (@max) id, codeId FROM dbo.WEB_CODE_USE WHERE deliveredAt IS NULL AND id > @afterId ORDER BY id
SELECT u.id, u.codeId, c.label, u.account, u.idPlayer, c.bound
FROM @page p JOIN dbo.WEB_CODE_USE u ON u.id = p.id JOIN dbo.WEB_CODE c ON c.id = u.codeId
ORDER BY u.id
SELECT i.codeId, i.slot, i.itemId, i.count FROM dbo.WEB_CODE_ITEM i WHERE i.codeId IN (SELECT codeId FROM @page) ORDER BY i.codeId, i.slot
GO

-- One use whose mails are not written yet (right after its redeem), with its code's items; nothing when it was.
IF OBJECT_ID(N'dbo.usp_AdminCodePendingOne', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_AdminCodePendingOne
GO
CREATE PROCEDURE dbo.usp_AdminCodePendingOne
	@useId int
AS
SET NOCOUNT ON
SELECT u.id, u.codeId, c.label, u.account, u.idPlayer, c.bound
FROM dbo.WEB_CODE_USE u JOIN dbo.WEB_CODE c ON c.id = u.codeId
WHERE u.id = @useId AND u.deliveredAt IS NULL
SELECT i.codeId, i.slot, i.itemId, i.count
FROM dbo.WEB_CODE_ITEM i JOIN dbo.WEB_CODE_USE u ON u.codeId = i.codeId
WHERE u.id = @useId AND u.deliveredAt IS NULL
ORDER BY i.slot
GO

-- Marks a use's mails written (once): to which character. changed 1, or 0 when it was marked already.
IF OBJECT_ID(N'dbo.usp_AdminCodeMarkDelivered', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_AdminCodeMarkDelivered
GO
CREATE PROCEDURE dbo.usp_AdminCodeMarkDelivered
	@useId int, @idPlayer char(7), @characterName varchar(32)
AS
SET NOCOUNT ON
UPDATE dbo.WEB_CODE_USE SET deliveredAt = SYSUTCDATETIME(), deliveredTo = @idPlayer, deliveredName = @characterName
WHERE id = @useId AND deliveredAt IS NULL
SELECT @@ROWCOUNT AS changed
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
	GRANT EXECUTE ON OBJECT::dbo.usp_WebCodeCheck TO [flyffweb_site]
	GRANT EXECUTE ON OBJECT::dbo.usp_WebCodeRedeem TO [flyffweb_site]
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
	GRANT EXECUTE ON OBJECT::dbo.usp_AdminVipEnd TO [flyffweb_admin]
	GRANT EXECUTE ON OBJECT::dbo.usp_AdminCodeAdd TO [flyffweb_admin]
	GRANT EXECUTE ON OBJECT::dbo.usp_AdminCodeList TO [flyffweb_admin]
	GRANT EXECUTE ON OBJECT::dbo.usp_AdminCodeGet TO [flyffweb_admin]
	GRANT EXECUTE ON OBJECT::dbo.usp_AdminCodeKeys TO [flyffweb_admin]
	GRANT EXECUTE ON OBJECT::dbo.usp_AdminCodeSave TO [flyffweb_admin]
	GRANT EXECUTE ON OBJECT::dbo.usp_AdminCodeUses TO [flyffweb_admin]
	GRANT EXECUTE ON OBJECT::dbo.usp_AdminCodePending TO [flyffweb_admin]
	GRANT EXECUTE ON OBJECT::dbo.usp_AdminCodePendingOne TO [flyffweb_admin]
	GRANT EXECUTE ON OBJECT::dbo.usp_AdminCodeMarkDelivered TO [flyffweb_admin]
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

-- 2026-11-20 (redeem codes): each code use whose mails were written, with the character they went to.
IF OBJECT_ID(N'dbo.WEB_CODE_SENT', N'U') IS NULL
	CREATE TABLE dbo.WEB_CODE_SENT (
		useId int NOT NULL CONSTRAINT PK_WEB_CODE_SENT PRIMARY KEY,
		idPlayer char(7) NOT NULL,
		characterName varchar(32) NULL,
		sentAt datetime2(0) NOT NULL CONSTRAINT DF_WEB_CODE_SENT_sentAt DEFAULT SYSUTCDATETIME()
	)
GO

-- The character's name when @idPlayer is the account's, on server 01, and not deleted (no row otherwise): the site
-- checks the character a redeem names before it uses the code.
IF OBJECT_ID(N'dbo.usp_WebCodeCharacter', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_WebCodeCharacter
GO
CREATE PROCEDURE dbo.usp_WebCodeCharacter
	@account varchar(32), @idPlayer char(7)
AS
SET NOCOUNT ON
SELECT m_szName AS characterName FROM dbo.CHARACTER_TBL
WHERE m_idPlayer = @idPlayer AND account = @account AND serverindex = '01' AND (isblock IS NULL OR isblock <> 'D')
GO

-- Writes a code use's mails, once, as usp_AdminVipGiftSend writes a gift box's: 1 sent, 2 sent before, 0 the account
-- has no character yet. The character: @idPlayer (the one that redeemed) while it is still the account's and not
-- deleted, else the gift boxes' rule (the one in the game now, else the most play time, else the lowest id). One mail
-- per item stack into server index 51; the mails and the sent mark are one transaction.
IF OBJECT_ID(N'dbo.usp_AdminCodeMailSend', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_AdminCodeMailSend
GO
CREATE PROCEDURE dbo.usp_AdminCodeMailSend
	@useId int, @account varchar(32), @idPlayer char(7), @title varchar(128), @text varchar(255),
	@item1 int = 0, @count1 int = 0, @item2 int = 0, @count2 int = 0, @item3 int = 0, @count3 int = 0,
	@item4 int = 0, @count4 int = 0, @item5 int = 0, @count5 int = 0, @item6 int = 0, @count6 int = 0,
	@bound bit = 0
AS
SET NOCOUNT ON
SET XACT_ABORT ON
DECLARE @to char(7), @name varchar(32), @tmCreate int, @nMail int, @slot int, @item int, @count int, @flag int
-- 2026-11-20: a bound code's items carry CItemElem::binds (0x02), as MAIL_TBL.byFlag (GetItemFromMail reads it back)
SET @flag = CASE WHEN @bound = 1 THEN 2 ELSE 0 END
BEGIN TRANSACTION
IF EXISTS (SELECT 1 FROM dbo.WEB_CODE_SENT WITH (UPDLOCK, HOLDLOCK) WHERE useId = @useId)
BEGIN
	SELECT @to = idPlayer, @name = characterName FROM dbo.WEB_CODE_SENT WHERE useId = @useId
	COMMIT
	SELECT 2 AS result, @to AS idPlayer, @name AS characterName
	RETURN
END
SELECT @to = m_idPlayer, @name = m_szName FROM dbo.CHARACTER_TBL
WHERE m_idPlayer = @idPlayer AND account = @account AND serverindex = '01' AND (isblock IS NULL OR isblock <> 'D')
IF @to IS NULL
	SELECT TOP 1 @to = m_idPlayer, @name = m_szName FROM dbo.CHARACTER_TBL
	WHERE account = @account AND serverindex = '01' AND (isblock IS NULL OR isblock <> 'D')
	ORDER BY CASE WHEN MultiServer > 0 THEN 0 ELSE 1 END, TotalPlayTime DESC, m_idPlayer
IF @to IS NULL
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
		EXEC dbo.MAIL_STR @iGu = 'A1', @nMail = @nMail, @serverindex = '51', @idReceiver = @to, @idSender = '0000000',
			@nGold = 0, @tmCreate = @tmCreate, @byRead = 0, @szTitle = @title, @szText = @text, @dwItemId = @item, @nItemNum = @count,
			@byFlag = @flag
	END
	SET @slot = @slot + 1
END
INSERT dbo.WEB_CODE_SENT (useId, idPlayer, characterName) VALUES (@useId, @to, @name)
COMMIT
SELECT 1 AS result, @to AS idPlayer, @name AS characterName
GO

IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'flyffweb_site')
BEGIN
	GRANT EXECUTE ON OBJECT::dbo.usp_WebCodeCharacter TO [flyffweb_site]
END
GO

IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'flyffweb_admin')
BEGIN
	GRANT EXECUTE ON OBJECT::dbo.usp_AdminCodeMailSend TO [flyffweb_admin]
	GRANT EXECUTE ON OBJECT::dbo.usp_AdminVipCharacterLetters TO [flyffweb_admin]
	GRANT EXECUTE ON OBJECT::dbo.usp_AdminVipClearCharacterLetters TO [flyffweb_admin]
	GRANT EXECUTE ON OBJECT::dbo.usp_AdminVipGiftSend TO [flyffweb_admin]
END
GO
