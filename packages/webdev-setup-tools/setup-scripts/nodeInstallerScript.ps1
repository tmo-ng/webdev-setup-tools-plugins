function FindMostRecentNodeVersion
{
  $URI = "https://nodejs.org/"
  $HTML = Invoke-WebRequest -Uri $URI
  $nodeVersions = ($HTML.ParsedHtml.getElementsByTagName('a') | Select-Object -Expand href )
  Foreach ($version in $nodeVersions)
  {
    $versionId = $version -match 'v[0-9]+\.[0-9]+\.[0-9]+'
    if ($versionId) {
        return $matches[0]
    }
  }
  return 'False'
}
function InstallMostRecentVersion
{


}
function UpdateToMostRecentVersion
{

}
function KillBackgroundNodeProcesses
{
    try
    {
        Get-Process node -ErrorAction SilentlyContinue | foreach {Stop-Process $_.Id}
    }
    catch
    {
        Write-Host "no background node processes found"
    }
}
function IsPowershellVersionCompatible
{
    $output = Get-Host | Select-Object Version
    $version = $output -match '(?<major_version>[0-9]+)(?:\.[0-9]+)+'
    if ($version) {
        return $matches['major_version'] -ge 3
    }
    return 'False'
}
function IsCommandPromptAdmin
{
    $wid=[System.Security.Principal.WindowsIdentity]::GetCurrent()
    $prp=new-object System.Security.Principal.WindowsPrincipal($wid)
    $adm=[System.Security.Principal.WindowsBuiltInRole]::Administrator
    return $prp.IsInRole($adm)
}
