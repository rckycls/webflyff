# Make the Support / VIP tables and procedures (vip.sql, next to this file), without SQL Server Management Studio:
# Windows PowerShell talks to SQL Server itself. Run it where SQL Server runs (the VM, then the VPS), as administrator,
# AFTER Install-WebLogin.ps1 and Install-AdminLogin.ps1 (it gives their logins the rights to the new procedures):
#
#   powershell -ExecutionPolicy Bypass -File .\Install-Vip.ps1
#
# It asks for no password: it uses your Windows login, and it does not change flyffweb_site's or flyffweb_admin's
# passwords. Then it checks that the four VIP tiers are there.
#
# Options:
#   -Server .\SQLEXPRESS  the SQL Server instance, if the script cannot find it by itself
#   -User sa              a SQL login (it asks for its password) instead of your Windows login
#
# Run it again any time (after an update of FlyffWeb, say): the tables, the requests and your prices stay.

param(
	[string]$Server = '',
	[string]$User = ''
)

$ErrorActionPreference = 'Stop'

function Plain([Security.SecureString]$secure) {
	$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
	try { return [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

# The instance: the SQL Server service in this machine (MSSQLSERVER is the default instance, MSSQL$NAME a named one)
if ($Server -eq '') {
	$services = @(Get-Service -Name 'MSSQLSERVER', 'MSSQL$*' -ErrorAction SilentlyContinue)
	if ($services.Count -eq 0) { throw 'No SQL Server service found on this machine. Run it where SQL Server runs, or pass -Server.' }
	$running = @($services | Where-Object { $_.Status -eq 'Running' })
	if ($running.Count -eq 0) { throw "SQL Server is not running ($($services[0].Name)). Start it first." }
	$name = $running[0].Name
	if ($name -eq 'MSSQLSERVER') { $Server = '.' } else { $Server = '.\' + $name.Substring(6) }
}
Write-Host "SQL Server: $Server"

$sqlFile = Join-Path $PSScriptRoot 'vip.sql'
if (-not (Test-Path $sqlFile)) { throw "vip.sql is not next to this script ($sqlFile)." }

$builder = New-Object System.Data.SqlClient.SqlConnectionStringBuilder
$builder['Data Source'] = $Server
$builder['Initial Catalog'] = 'master'
if ($User -ne '') {
	$builder['User ID'] = $User
	$builder['Password'] = Plain (Read-Host "Password for $User" -AsSecureString)
} else {
	$builder['Integrated Security'] = $true
}

$batches = [regex]::Split((Get-Content -Raw -Encoding UTF8 $sqlFile), '(?im)^\s*GO\s*$') | Where-Object { $_.Trim() -ne '' }

$connection = New-Object System.Data.SqlClient.SqlConnection $builder.ConnectionString
$connection.Open()
try {
	foreach ($batch in $batches) {
		$command = $connection.CreateCommand()
		$command.CommandText = $batch
		[void]$command.ExecuteNonQuery()
	}
	$command = $connection.CreateCommand()
	$command.CommandText = "SELECT COUNT(*) FROM ACCOUNT_DBF.dbo.WEB_VIP_TIER"
	$tiers = $command.ExecuteScalar()
	# 2026-11-19 (VIP perks): the gift boxes, and the game's mail procedure they are written with
	$command = $connection.CreateCommand()
	$command.CommandText = "SELECT (SELECT COUNT(*) FROM ACCOUNT_DBF.dbo.WEB_VIP_GIFT_ITEM), CASE WHEN OBJECT_ID(N'CHARACTER_01_DBF.dbo.MAIL_STR', N'P') IS NULL THEN 0 ELSE 1 END"
	$reader = $command.ExecuteReader()
	[void]$reader.Read()
	$giftItems = $reader.GetInt32(0)
	$hasMail = $reader.GetInt32(1) -gt 0
	$reader.Close()
	$command = $connection.CreateCommand()
	$command.CommandText = "SELECT (SELECT COUNT(*) FROM ACCOUNT_DBF.sys.database_principals WHERE name = N'flyffweb_site'), (SELECT COUNT(*) FROM ACCOUNT_DBF.sys.database_principals WHERE name = N'flyffweb_admin')"
	$reader = $command.ExecuteReader()
	[void]$reader.Read()
	$hasSite = $reader.GetInt32(0) -gt 0
	$hasAdmin = $reader.GetInt32(1) -gt 0
	$reader.Close()
} finally {
	$connection.Close()
}

Write-Host 'Made: ACCOUNT_DBF.dbo.WEB_VIP_TIER, WEB_PAY_QR, WEB_VIP_REQUEST, WEB_VIP, WEB_VIP_GIFT, WEB_VIP_GIFT_ITEM, CHARACTER_01_DBF.dbo.WEB_VIP_GIFT_SENT and their procedures.'
if (-not $hasMail) { Write-Warning 'CHARACTER_01_DBF.dbo.MAIL_STR is missing: the VIP gift boxes cannot be sent. Ask Claude.' }
Write-Host "Gift boxes: $giftItems item stack(s) across the tiers (change them in the panel's VIP tab)."
if ($tiers -lt 1) { Write-Warning 'There are no VIP tiers: something is wrong. Ask Claude.'; exit 1 }
Write-Host "Check passed: $tiers VIP tier(s) in WEB_VIP_TIER."
if (-not $hasSite) { Write-Warning 'flyffweb_site has no user in ACCOUNT_DBF yet: run Install-WebLogin.ps1 first, then this script again.' }
if (-not $hasAdmin) { Write-Warning 'flyffweb_admin has no user in ACCOUNT_DBF yet: run Install-AdminLogin.ps1 first, then this script again (the panel approves the requests).' }
if (-not ($hasSite -and $hasAdmin)) { exit 1 }
Write-Host 'Both logins may run their VIP procedures. Next: the "vip" section in web.config.json, then nssm restart flyffweb-site.'
