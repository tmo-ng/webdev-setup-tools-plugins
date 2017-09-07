/**
 * Created by CDejarl1 on 8/30/2017.
 */
const setup = require('webdev-setup-tools');
const semver = require('semver');
const os = require('os');
const operatingSystem = os.platform().trim();
const options = setup.getOptions();
const versionPattern = /([0-9]+(?:\.[0-9]+)+)/g;
const rubySemanticVersion = setup.getProjectGlobals('ruby').install; // global semantic version range
const globalRubyObject = {ruby: rubySemanticVersion};
const homeDirectory = os.homedir();

let installRuby = () => {
    return (operatingSystem === 'win32') ? installRubyOnWindows() : installRvmOnMacOrLinux();
};

let installRubyOnWindowsHost = remoteRubyVersion => {
    let path = remoteRubyVersion.downloadHyperlink;
    let rubyDownloadPath = process.env.USERPROFILE + '\\Downloads\\' +
        path.substring(path.lastIndexOf('/') + 1, path.length);
    return setup.downloadPackage(path, rubyDownloadPath)
        .then(rubyFilePath => {
            let startRubyInstall = rubyFilePath + ' /verysilent /tasks="modpath"';
            return setup.executeSystemCommand(startRubyInstall, options);
        })
        .then(() => remoteRubyVersion.version);
};
let installRubyOnWindows = () => {
    let rubyUrlWindows = 'https://rubyinstaller.org/downloads/archives/';
    let rubyHyperlinkPattern = /https[^"]+rubyinstaller-([0-9.]+)[0-9-p]*x64.exe/g;
    let getRubyVersion = setup.getSystemCommand('ruby -v');
    let localRubyObject = {};
    return setup.executeSystemCommand(getRubyVersion, {resolve: options.resolve}) // check for existing ruby
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
            let rubyUpdates = setup.findRequiredAndOptionalUpdates(localRubyObject, globalRubyObject, [{name: 'ruby', highestCompatibleVersion: remoteRuby.version}]);
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

let installRvm = installRvmForMacLinux => {
    console.log('installing rvm now');
    return setup.executeSystemCommand(installRvmForMacLinux, options)
        .then(() => { // update environment variables
            let outFile = (operatingSystem === 'darwin') ? '/.bash_profile' : '/.bashrc';
            return setup.executeSystemCommand('echo "[ -s \\"\\$HOME/.rvm/scripts/rvm\\" ] && \\. \\"\\$HOME/.rvm/scripts/rvm\\"" >> ' + homeDirectory + outFile, options)
                .then(() => setup.executeSystemCommand('echo "export PATH=\\"\\$PATH:\\$HOME/.rvm/bin\\"" >> ' + homeDirectory + outFile, options));
        });
};
let installRubyWithRvm = remoteRubyVersion => {
    let installRubyCommand = setup.getSystemCommand('rvm install ' + remoteRubyVersion);
    return setup.executeSystemCommand(installRubyCommand, options)
        .then(() => remoteRubyVersion);
};
let installRvmOnMacOrLinux = () => {
    let installRvmForMacLinux = 'curl -sSL https://get.rvm.io | bash -s -- --ignore-dotfiles';
    let rvmGetAllRemoteRubyVersions = setup.convertToBashLoginCommand('rvm list known');
    let rvmGetAllLocalRubyVersions = setup.convertToBashLoginCommand('rvm list');
    let rvmSetLocalRubyDefault = 'rvm --default use ';
    let checkForExistingRvm = setup.convertToBashLoginCommand('which rvm');
    let localRubyObject = {};
    return setup.executeSystemCommand(checkForExistingRvm, {resolve: options.resolve})
        .catch(() => {
            console.log('no version of rvm is installed on this computer');
        })
        .then(rvmVersion => { // install rvm
            if (!rvmVersion) {
                return installRvm(installRvmForMacLinux);
            }
        })
        .then(() => { // find highest local version of ruby installed
            let getLocalRubyOptions = {
                resolve: (resolve, data) => {
                    let versions = data.match(versionPattern);
                    let highestVersion = (versions) ? semver.maxSatisfying(versions, rubySemanticVersion) : versions;
                    resolve(highestVersion);
                }
            };
            return setup.executeSystemCommand(rvmGetAllLocalRubyVersions, getLocalRubyOptions);
        })
        .then(localRubyVersion => { // get all remote versions of ruby
            localRubyObject = (localRubyVersion) ? {ruby: localRubyVersion} : localRubyObject;
            return setup.executeSystemCommand(rvmGetAllRemoteRubyVersions, {resolve: options.resolve})
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
            let rubyUpdates = setup.findRequiredAndOptionalUpdates(localRubyObject, globalRubyObject, [{name: 'ruby', highestCompatibleVersion: remoteRubyVersion}]);
            if (rubyUpdates.required.length > 0) {
                console.log('installing ruby now.');
                return installRubyWithRvm(remoteRubyVersion);
            } else if (rubyUpdates.optional.length > 0) {
                return setup.confirmOptionalInstallation('do you want to install this optional ruby upgrade now (y/n)?  ', () => installRubyWithRvm(remoteRubyVersion));
            }
        })
        .then(rubyVersion => { // set the new version as default
            return setup.executeSystemCommand(setup.convertToBashLoginCommand(rvmSetLocalRubyDefault + rubyVersion), options)
                .then(() => {
                    console.log('ruby install complete. default version is now ' + rubyVersion + '.');
                });
        })
        .catch(error => { // handle failure
            console.log('ruby install failed with the following message:\n' + error);
        });
};

module.exports = {
    installRuby: installRuby
};