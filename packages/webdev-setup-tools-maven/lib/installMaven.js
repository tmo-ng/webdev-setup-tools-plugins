/**
 * Created by CDejarl1 on 8/30/2017.
 */
const setup = require('webdev-setup-tools');
const os = require('os');
const fs = require('fs');
const operatingSystem = os.platform().trim();
const windows = (operatingSystem === 'win32');
const formatOutput = setup.getOutputOptions();
const requiredMavenVersion = setup.getProjectGlobals('maven');
const globalMavenObject = {maven: requiredMavenVersion};
const versionPattern = /([0-9]+(?:\.[0-9]+)+)/g;
const homeDirectory = os.homedir();

let setEnvironmentVariables = unzippedFolderPath => {
  console.log('setting your maven system environment variables.');
  if (windows) {
    let commandSeparator = '; ';
    let setM2Home = setup.setWindowsEnvironmentVariable('M2_HOME', '\'' + unzippedFolderPath + '\'');

    let setMavenHome = setup.setWindowsEnvironmentVariable('MAVEN_HOME', '\'' + unzippedFolderPath + '\'');

    let setSystemPath = '$old_path = ' + setup.getWindowsEnvironmentVariable('path') +
      '; $new_path = \'' + unzippedFolderPath + '\' + \'\\bin\' + \';\' + $old_path; ' +
      setup.setWindowsEnvironmentVariable('path', '$new_path');
    let setAllPathVariables = setM2Home + commandSeparator + setMavenHome + commandSeparator + setSystemPath;
    return setup.executeSystemCommand(setup.getSystemCommand(setAllPathVariables), formatOutput);
  } else {
    let srcFile = homeDirectory + '/.bash_profile';
    let maven_vars = {'export PATH': '/usr/local/maven/bin:$PATH', 'export M2_HOME': '/usr/local/maven', 'export MAVEN_HOME': '/usr/local/maven'};
    let mvnConfigVars = Object.keys(maven_vars);
    let profileVariables = setup.getMissingVariables(srcFile, mvnConfigVars);
    let existingVars = profileVariables.foundVariables || {};
    let dataToWrite = mvnConfigVars.reduce((totalData, mavenVariable) => {
      let existingVar = existingVars[mavenVariable];
      let requiredVar = maven_vars[mavenVariable];

      // avoid polluting startup files with additional references to maven
      let addMvnVar = (Array.isArray(existingVar) && !existingVar.includes(requiredVar)) || (!Array.isArray(existingVar) && existingVar !== requiredVar);
      return (addMvnVar) ? totalData + mavenVariable + '=' + requiredVar + '\n' : totalData;
    }, '');

    if (dataToWrite !== '') {
      fs.appendFileSync(srcFile, '\n# maven path configuration variables added by webdev-setup-tools-maven\n' + dataToWrite);
    }

    setup.sourceStartupScipt('.bash_profile', '.bashrc');
    let createSymbolicLinkToMaven = 'sudo ln -sfn ' + unzippedFolderPath + ' /usr/local/maven';
    return setup.executeSystemCommand(createSymbolicLinkToMaven, formatOutput);
  }
};

let installMavenOnHost = (mavenDownload) => {
  let remotePath = mavenDownload.downloadHyperlink;
  let fileName = remotePath.substring(remotePath.lastIndexOf('/') + 1, remotePath.length);

  let downloadFolder = (windows) ?  'C:\\Program Files\\' : '/usr/local/';


  let folderSeparator = (windows) ? '\\' : '/';
  let downloadPath = homeDirectory + folderSeparator + 'Downloads' + folderSeparator + fileName;
  let mavenVersion = mavenDownload.version;
  console.log('downloading maven version from the following link:\n' + remotePath);
  return setup.downloadPackage(remotePath, downloadPath)
    .then(downloadPath => { // unzip the downloaded package
      let unzipCommand;
      if (windows) {
        unzipCommand = 'powershell.exe -command \"Add-Type -AssemblyName System.IO.Compression.FileSystem; ' +
          '[System.IO.Compression.ZipFile]::ExtractToDirectory(' + '\'' + downloadPath + '\', \'C:\\Program Files\\\');\"';
      } else {
        unzipCommand = 'sudo tar -xvzf ' + downloadPath + ' -C /usr/local/';
      }
      return setup.executeSystemCommand(unzipCommand, formatOutput);
    })
    .then(() => { // set environment variables
      let directories = fs.readdirSync(downloadFolder);
      let fileMatcher = new RegExp('.*maven-' + mavenDownload.version + '.*');
      let unzippedFolderPath = downloadFolder + directories.find((folder) => fileMatcher.test(folder));

      return setEnvironmentVariables(unzippedFolderPath);
    })
    .then(() => { // notify user of success
      console.log('successfully installed maven version ' + mavenVersion);
    })
    .catch(error => { // notify user of failure and reason
      console.log('Failed to install maven with the following message:\n' + error);
    });
};
let installMaven = () => {
  let checkMavenVersion = setup.getSystemCommand('mvn -v');
  let localMaven = {};
  let downloadPattern = (windows) ? /http[^"]+maven-([0-9.]+)-bin\.zip/g : /http[^"]+maven-([0-9.]+)-bin\.tar\.gz/g;
  let mavenUrl = 'https://maven.apache.org/download.cgi';
  return setup.executeSystemCommand(checkMavenVersion, {resolve: formatOutput.resolve})
    .catch(() => {
      console.log('No version of maven detected. Installing maven now.');
    })
    .then(mavenVersion => {
      if (mavenVersion) {
        localMaven.maven = mavenVersion.match(versionPattern)[0];
      }
    })
    .then(() => setup.getVersionWithRequest(mavenUrl, downloadPattern, requiredMavenVersion))
    .then(remoteMaven => {
      let mavenUpdates = setup.findRequiredAndOptionalUpdates(localMaven, globalMavenObject, [{name: 'maven', highestCompatibleVersion: remoteMaven.version}]);
      if (mavenUpdates.required.length > 0) {
        console.log('installing required maven update now.');
        return installMavenOnHost(remoteMaven);
      } else if (mavenUpdates.optional.length > 0) {
        return setup.confirmOptionalInstallation('a newer maven version is now available.\nDo you want to upgrade now (y/n)? ', () => installMavenOnHost(remoteMaven));
      } else {
        console.log('your local maven version is up to date.');
      }
    })
    .then(() => {
      console.log('maven setup complete.');

    })
    .catch(error => {
      console.log('maven install failed with the following message:\n' + error);
    });
};

module.exports = {
  installMaven: installMaven
};