# Make the admin panel's SQL Server login, flyffweb_admin, its procedures and the audit table (admin-login.sql, next to
# this file), without SQL Server Management Studio: Windows PowerShell talks to SQL Server itself. Run it where SQL
# Server runs (the VM, then the VPS), as Install-WebLogin.ps1 is run:
#
#   powershell -ExecutionPolicy Bypass -File .\Install-AdminLogin.ps1
#
# It asks twice for the new login's password (choose a long one; it goes in web.config.json as admin.sql.password). Then
# it logs in as flyffweb_admin over TCP, as the panel will, and runs usp_AdminOnlineList to show that it works.
#
# Options:
#   -Server .\SQLEXPRESS  the SQL Server instance, if the script cannot find it by itself
#   -User sa              a SQL login (it asks for its password) instead of your Windows login, to make the new one
#   -TcpPort 1433         the TCP port the panel will use (web.config.json's sql.port)
#
# Run it again to change the password or to update the procedures: the audit log stays.

param(
	[string]$Server = '',
	[string]$User = '',
	[ValidateRange(1, 65535)][int]$TcpPort = 1433
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

$sqlFile = Join-Path $PSScriptRoot 'admin-login.sql'
if (-not (Test-Path $sqlFile)) { throw "admin-login.sql is not next to this script ($sqlFile)." }

$first = Plain (Read-Host 'New password for the login flyffweb_admin' -AsSecureString)
$again = Plain (Read-Host 'The same password again' -AsSecureString)
if ($first -ne $again) { throw 'The two passwords are not the same. Nothing was changed.' }
if ($first.Length -lt 12) { throw 'Use at least 12 characters. Nothing was changed.' }
$password = $first

if ($User -ne '') {
	$adminPassword = Plain (Read-Host "Password for $User" -AsSecureString)
	$connectionString = "Server=$Server;Database=master;User ID=$User;Password=$adminPassword;"
} else {
	$connectionString = "Server=$Server;Database=master;Integrated Security=True;"
}

# The password goes into the script's text (CREATE LOGIN takes no parameter): its quotes are doubled for SQL.
$script = (Get-Content -Raw -Encoding UTF8 $sqlFile).Replace('$(Password)', $password.Replace("'", "''"))
$batches = [regex]::Split($script, '(?im)^\s*GO\s*$') | Where-Object { $_.Trim() -ne '' }

$connection = New-Object System.Data.SqlClient.SqlConnection $connectionString
$connection.Open()
try {
	foreach ($batch in $batches) {
		$command = $connection.CreateCommand()
		$command.CommandText = $batch
		[void]$command.ExecuteNonQuery()
	}
	$command = $connection.CreateCommand()
	$command.CommandText = "SELECT CONVERT(int, SERVERPROPERTY('IsIntegratedSecurityOnly'))"
	$windowsOnly = $command.ExecuteScalar()
} finally {
	$connection.Close()
}
Write-Host 'Made: the login flyffweb_admin, its users in ACCOUNT_DBF and CHARACTER_01_DBF, the usp_Admin* procedures and ACCOUNT_DBF.dbo.WEB_ADMIN_LOG.'
if ($windowsOnly -eq 1) {
	Write-Warning 'This SQL Server takes Windows logins only, so flyffweb_admin cannot log in. Turn on "SQL Server and Windows Authentication mode" (server properties, Security) and restart SQL Server.'
}

# The check: log in as the panel will (TCP, the new login) and ask who is online.
$check = "Server=127.0.0.1,$TcpPort;Database=CHARACTER_01_DBF;User ID=flyffweb_admin;Password=$password;Encrypt=True;TrustServerCertificate=True;Connect Timeout=5;"
$connection = New-Object System.Data.SqlClient.SqlConnection $check
try {
	$connection.Open()
	$command = $connection.CreateCommand()
	$command.CommandText = 'dbo.usp_AdminOnlineList'
	$command.CommandType = [System.Data.CommandType]::StoredProcedure
	$reader = $command.ExecuteReader()
	$players = 0
	while ($reader.Read()) { $players++ }
	$reader.Close()
	Write-Host "Check passed: flyffweb_admin logged in on 127.0.0.1,$TcpPort and sees $players character(s) online."
	Write-Host "Put in web.config.json's admin section: sql.user flyffweb_admin, sql.password (the one you typed)."
	Write-Host 'Then run admin-check.sql as flyffweb_admin: every line must say PASS.'
} catch {
	Write-Warning "The login was made, but logging in as flyffweb_admin on 127.0.0.1,$TcpPort failed: $($_.Exception.Message)"
	Write-Warning 'Check that TCP/IP is on for this instance (SQL Server Configuration Manager) and which port it listens on; then pass -TcpPort.'
	exit 1
} finally {
	$connection.Close()
}
