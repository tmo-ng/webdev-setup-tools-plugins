@echo OFF
setlocal enabledelayedexpansion
set userNodeVersion=""
set latestNodeVersion=""
set downloadsFolder=%userprofile%\Downloads\
set npmCmd=npm
set hasMinPsVersion=""
set hasScriptExecEnabled=""
set hasAdminRights=""


for /f "tokens=*" %%i in ('powershell -command "$policy = Get-ExecutionPolicy; $policy -ne \"restricted\";"') do (
    set hasScriptExecEnabled=%%i
)

if !hasScriptExecEnabled! == False (
    set /p missingPrompt=This program requires powershell script execution to be enabled.
    set /p missingPrompt=log into powershell and enter the command "Set-ExecutionPolicy unrestricted", then restart this script.
    exit /b 0
)

set /p killNodeMessage=This will kill all running node processes. Press enter to continue.
powershell -command "& { . .\nodeInstallerScript.ps1; KillBackgroundNodeProcesses }"

for /f "tokens=*" %%i in ('powershell -command "& { . .\nodeInstallerScript.ps1; IsPowershellVersionCompatible }"') do (
    set hasMinPsVersion=%%i
)

if !hasMinPsVersion! == False (
    set /p missingPrompt=This program requires powershell version 3.0 or higher.
    set /p missingPrompt=This can be downloaded at https://www.microsoft.com/en-us/download/details.aspx?id=34595
    exit /b 0
)

for /f "tokens=*" %%i in ('powershell -command "& { . .\nodeInstallerScript.ps1; IsCommandPromptAdmin }"') do (
    set hasAdminRights=%%i
)

if !hasAdminRights! == False (
    set /p missingPrompt=Please restart this script in an administrative command prompt window. Press Enter to exit.
    exit /b 0
)

for /f "tokens=*" %%i in ('node -v 2^>nul') do (
    set userNodeVersion=%%i
)

for /f "tokens=*" %%i in ('powershell -command "& { . .\nodeInstallerScript.ps1; FindMostRecentNodeVersion }"') do (
    set latestNodeVersion=%%i
)

if !latestNodeVersion! == False (
    set /p missingPrompt=Failed to find the latest version of node. Please verify you have set the default internet explorer settings.
    exit /b 0
)

if !userNodeVersion! == "" (
    call :InstallNode
    exit /b 0
)
call :ValidateNode
exit /b 0

:CheckNodeCompatibility
for /f "tokens=*" %%i in ('node -e "require('webdev-setup-tools').getMaxNodeVersion().then((version) => {console.log(version.trim())})"') do (
    set latestNodeVersion=%%i
)
echo the newest version of node is !latestNodeVersion!
set compatible=""
set nodePath=""
for /f "tokens=*" %%i in ('node -e "console.log(require('webdev-setup-tools').isLocalNodeCompatible('!userNodeVersion:~1!'))"') do (
    set compatible=%%i
)
for /f "tokens=*" %%i in ('where node.exe') do (
    set nodePath=%%i
)
if !compatible! == false (
    echo local node version !userNodeVersion! is out of date, updating now

    powershell.exe -command "$client = New-Object System.Net.WebClient;$client.Headers['User-Agent'] = 'tmoNg';$client.DownloadFile('https://nodejs.org/dist/!latestNodeVersion!/win-x64/node.exe', '!nodePath!')"
    set userNodeVersion=!latestNodeVersion!
)
if NOT !userNodeVersion! == !latestNodeVersion! (
    set /p optionalPrompt=a newer version of node is available. would you like to install this version now ^(yes/no^)^?
    if NOT !optionalPrompt! == no (
    powershell.exe -command "$client = New-Object System.Net.WebClient;$client.Headers['User-Agent'] = 'tmoNg';$client.DownloadFile('https://nodejs.org/dist/!latestNodeVersion!/win-x64/node.exe', '!nodePath!')"
    set userNodeVersion=!latestNodeVersion!
    )
)
echo user node version !userNodeVersion! is up to date
call :StartNodeScript
exit /b 0

:InstallNode
set /p missingPrompt=node is missing, press any key to start installation
powershell.exe -command "$client = New-Object System.Net.WebClient;$client.Headers['User-Agent'] = 'tmoNg';$client.DownloadFile('https://nodejs.org/dist/!latestNodeVersion!/node-!latestNodeVersion!-x64.msi', '!downloadsFolder!node-!latestNodeVersion!-x64.msi')"
msiexec /qn /l* C:\node-log.txt /i !downloadsFolder!node-!latestNodeVersion!-x64.msi
set userNodeVersion=!latestNodeVersion!
echo node was installed with version !latestNodeVersion!
cd ../ && powershell.exe -command "$env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine'); npm install --scripts-prepend-node-path=true;" && call :StartNodeScript
exit /b 0

:ValidateNode
cd ../ && npm install --scripts-prepend-node-path=true && call :CheckNodeCompatibility
exit /b 0

:StartNodeScript
powershell.exe -command "$env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine'); cd ./setup-scripts; node setup.js;"
exit /b 0
