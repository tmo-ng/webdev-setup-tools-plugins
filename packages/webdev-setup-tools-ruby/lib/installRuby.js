/**
 * Created by CDejarl1 on 8/30/2017.
 */
const setup = require('webdev-setup-tools');
const semver = require('semver');
const os = require('os');
const fs = require('fs');

const operatingSystem = os.platform().trim();
const windows = (operatingSystem === 'win32');
const formatOutput = setup.getOutputOptions();
const versionPattern = /([0-9]+(?:\.[0-9]+)+)/g;

const rubyGlobals = setup.getProjectGlobals('ruby') || {};
const rubySemanticVersion = rubyGlobals.install; // global semantic version range
const globalRubyObject = {ruby: rubySemanticVersion};

const homeDirectory = os.homedir();

let installRuby = () => {
  return (windows) ? installRubyOnWindows() : installRvmOnMacOrLinux();
};

let installRubyOnWindowsHost = remoteRubyVersion => {
  let path = remoteRubyVersion.downloadHyperlink;
  let rubyDownloadPath = process.env.USERPROFILE + '\\Downloads\\' +
    path.substring(path.lastIndexOf('/') + 1, path.length);
  return setup.downloadPackage(path, rubyDownloadPath)
    .then(rubyFilePath => {
      let startRubyInstall = rubyFilePath + ' /verysilent /tasks="modpath"';
      return setup.executeSystemCommand(startRubyInstall, formatOutput);
    })
    .then(() => remoteRubyVersion.version);
};
let installRubyOnWindows = () => {
  let rubyUrlWindows = 'https://rubyinstaller.org/downloads/archives/';
  let rubyHyperlinkPattern = /https[^"]+rubyinstaller-([0-9.]+)[0-9-p]*x64.exe/g;
  let getRubyVersion = setup.getSystemCommand('ruby -v');
  let localRubyObject = {};
  return setup.executeSystemCommand(getRubyVersion, {resolve: formatOutput.resolve}) // check for existing ruby
    .catch(() => {
      console.log('no version of ruby is installed on this computer');
    })
    .then(localRubyMessage => {
      if (localRubyMessage) {
        let localRubyVersion = localRubyMessage.match(versionPattern)[0];
        localRubyObject = {ruby: localRubyVersion};
      }
    })
    .then(() => setup.getVersionWithRequest(rubyUrlWindows, rubyHyperlinkPattern, rubySemanticVersion))
    .then(remoteRuby => {
      let rubyUpdates = setup.findRequiredAndOptionalUpdates(localRubyObject, globalRubyObject, [{
        name: 'ruby',
        highestCompatibleVersion: remoteRuby.version
      }]);
      if (rubyUpdates.required.length > 0) {
        console.log('installing ruby now.');
        return installRubyOnWindowsHost(remoteRuby);
      } else if (rubyUpdates.optional.length > 0) {
        return setup.confirmOptionalInstallation('do you want to install this optional ruby upgrade now (y/n)?  ', () => installRubyOnWindowsHost(remoteRuby));
      }
    })
    .then(remoteVersion => {
      let newRubyVersion = (remoteVersion) ? remoteVersion : localRubyObject.ruby;
      console.log('ruby install complete. default version is now ' + newRubyVersion + '.');

    })
    .catch(error => {
      console.log('ruby install failed with the following message:\n' + error);
    });
};
let updateDotFiles = (files, dataToWrite) => {
  return Promise.all(files.map(file => new Promise((resolve, reject) => {
    fs.readFile(file, 'utf8', (error, fileData) => {
      let response = 'updating file ' + file;
      if (error) {
        response = 'creating file ' + file;
      }

      let formattedData = (Array.isArray(dataToWrite)) ? dataToWrite : [dataToWrite];
      let formattedWritableData = formattedData.reduce((fullData, lineData) => (error || !fileData.includes(lineData)) ? fullData + '\n' + lineData + '\n' : fullData, '');
      if (formattedWritableData === '') {
        return resolve('');
      }
      fs.appendFile(file, formattedWritableData, error => {
        if (error) {
          reject('failed to update startup file ' + file);
        }
        resolve(response);
      });
    });

  })));

};
let installRvm = () => {
  console.log('installing ruby version manager now');
  // download without using curl
  let rvmPath = homeDirectory + '/.install_rvm';
  let sourceRvm = '[ -s \"$HOME/.rvm/scripts/rvm\" ] && \\. \"$HOME/.rvm/scripts/rvm\"';
  let exportRvmPath = 'export PATH=\"$PATH:$HOME/.rvm/bin\"';
  let rvmScriptUrl = 'https://get.rvm.io';
  return setup.downloadPackage(rvmScriptUrl, rvmPath)
    .then(() => {
      fs.chmodSync(rvmPath, 0o755);
      return setup.executeSystemCommand(setup.getSystemCommand(rvmPath + ' --ignore-dotfiles'), formatOutput);
    })
    .then(() => updateDotFiles([homeDirectory + '/.bash_profile', homeDirectory + '/.profile', homeDirectory + '/.zshrc'], [sourceRvm, exportRvmPath]))
    .then(() => setup.sourceStartupScipt('.bash_profile', '.bashrc'))
    .then(() => {
      let rvmRcPath = homeDirectory + '/.rvmrc';
      let prompt = '\nBy default rvm will alert you when it\n' +
        'is not the first entry in your environment path.\n' +
        'These alerts can become annoying, and this is generally not important\n' +
        'as long as ruby is not installed in another location on your computer.\n' +
        'Would you like to silence rvm alerts when it is not at the front of your environment path(y/n)? ';
      let silenceMismatch = 'rvm_silence_path_mismatch_check_flag=1';
      let displayOptionalPrompt = !fs.existsSync(rvmRcPath) || !fs.readFileSync(rvmRcPath, 'utf8').includes(silenceMismatch);
      return Promise.resolve((displayOptionalPrompt) ? setup.confirmOptionalInstallation(prompt, () => fs.appendFileSync(rvmRcPath, silenceMismatch + '\n')) : '');
    });
};
let installRubyWithRvm = (remoteRubyVersion, environment) => {
  let installRubyCommand = setup.getSystemCommand('rvm install ' + remoteRubyVersion);
  return setup.executeSystemCommand(installRubyCommand, formatOutput, environment)
    .then(() => remoteRubyVersion);
};
let installRvmOnMacOrLinux = () => {
  let rvmGetAllRemoteRubyVersions = setup.getSystemCommand('rvm list known');
  let rvmGetAllLocalRubyVersions = setup.getSystemCommand('rvm list');
  let rvmSetLocalRubyDefault = 'rvm alias create default ';
  let localRubyObject = {};
  let rvmInstalled = fs.existsSync(homeDirectory + '/.rvm');
  let rvmPath = homeDirectory + '/.rvm/bin';
  let rvmInPath = process.env.PATH.includes(rvmPath);
  let processEnv = process.env;
  processEnv.PATH = (processEnv.PATH.includes(rvmPath)) ? processEnv.PATH : processEnv.PATH + ':' + rvmPath;

  return Promise.resolve((rvmInstalled || rvmInPath) ? '' : installRvm())
    .then(() => { // find highest local version of ruby installed
      let getLocalRubyOptions = {
        resolve: (resolve, data) => {
          let versions = data.match(versionPattern);
          let highestVersion = (data.match(versionPattern)) ? semver.maxSatisfying(versions, rubySemanticVersion) : versions;
          resolve(highestVersion);
        }
      };
      return setup.executeSystemCommand(rvmGetAllLocalRubyVersions, getLocalRubyOptions, processEnv);
    })
    .then(localRubyVersion => { // get all remote versions of ruby
      localRubyObject = (localRubyVersion) ? {ruby: localRubyVersion} : localRubyObject;
      return setup.executeSystemCommand(rvmGetAllRemoteRubyVersions, {resolve: formatOutput.resolve}, processEnv);
    })
    .then(allVersions => { // get the highest compatible version of ruby from remote
      let rvmRubyPattern = /\[ruby-]([.0-9]+)\[([.0-9-a-z]+)]/g;
      let match = rvmRubyPattern.exec(allVersions);
      let versions = [];
      while (match !== null) {
        versions.push(match[1] + match[2]);
        match = rvmRubyPattern.exec(allVersions);
      }
      return semver.maxSatisfying(versions, rubySemanticVersion);
    })
    .then(remoteRubyVersion => { // install highest compatible version of ruby
      let rubyUpdates = setup.findRequiredAndOptionalUpdates(localRubyObject, globalRubyObject, [{
        name: 'ruby',
        highestCompatibleVersion: remoteRubyVersion
      }]);
      if (rubyUpdates.required.length > 0) {
        console.log('installing ruby now.');
        return installRubyWithRvm(remoteRubyVersion, processEnv);
      } else if (rubyUpdates.optional.length > 0) {
        return setup.confirmOptionalInstallation('do you want to install this optional ruby upgrade now (y/n)?  ', () => installRubyWithRvm(remoteRubyVersion, processEnv));
      }
    })
    .then(rubyVersion => { // set the new version as default
      if (!rubyVersion) {
        return Promise.resolve('ruby install complete. No rubies were installed.');
      }
      return setup.executeSystemCommand(setup.getSystemCommand(rvmSetLocalRubyDefault + rubyVersion), formatOutput, processEnv)
        .then(() => {
          return Promise.resolve('ruby install complete. default version is now ' + rubyVersion + '.');
        });
    })
    .then(message => console.log(message))
    .catch(error => console.log('ruby install failed with the following message:\n' + error));
};

module.exports = {
  installRuby: installRuby
};
