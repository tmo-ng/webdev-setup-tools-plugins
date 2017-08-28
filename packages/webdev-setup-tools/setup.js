// this file intended to parse the package.json file to find any dependencies that need to be updated
const semver = require('semver');
const os = require('os');
const operatingSystem = os.platform().trim(); // supported values are darwin (osx), linux (ubuntu), and win32 ()
const packageGlobals = require('../../package.json').globals;
const {exec} = require('child_process');
const request = require('request');
const fs = require('fs');
const versionPattern = /([0-9]+(?:\.[0-9]+)+)/g;
const readline = require('readline');
const scriptsDirectory = __dirname;
const findPortProcessWindows = 'netstat -a -n -o | findstr :4502';
const findPortProcessOsxLinux = 'lsof -i TCP:4502';
const seconds = 1000;
const minutes = 60 * seconds;
const options = {
    resolve: (resolve, data) => {
        resolve(data);
    },
    stdout: data => {
        process.stdout.write(data);
    }
};
let findRequiredAndOptionalUpdates = (userGlobals, projectGlobals, highestVersion) => {
    let optionalInstall = [];
    let requiredInstall = [];
    for (let index = 0; index < highestVersion.length; index++) {
        let module = highestVersion[index];
        if (!userGlobals[module.name]) { // install nonexistent
            console.log('missing required project package ' + module.name + '.');
            requiredInstall.push(module);
        } else if (semver.outside(userGlobals[module.name], projectGlobals[module.name], '<')) { // install incompatible
            console.log('package ' + module.name + ' version ' + userGlobals[module.name] + ' is not compatible with the project.');
            requiredInstall.push(module);
        } else if (semver.gt(module.highestCompatibleVersion, userGlobals[module.name])) { // optional update
            optionalInstall.push(module);
        }
    }
    return {required: requiredInstall, optional: optionalInstall};
};
let runListOfPromises  = (projectGlobals, promise) => {
    let promises = [];
    Object.keys(projectGlobals).forEach(dependency => {
        promises.push(promise(dependency, projectGlobals));
    });
    return Promise.all(promises).then(packageVersions => {
        return packageVersions;
    }, error => {
        return error;
    });
};
let getInstallationCommand = (packages, command, separator) => {
    let installCommand = command;
    for (let index = 0; index < packages.length; index++) {
        installCommand += ' ' + packages[index].name + separator + packages[index].highestCompatibleVersion;
    }
    return installCommand;
};
let handleUnresponsiveSystem = (delayTime, delayMessage) => {
    return new Promise((resolve) => {
        (function waitForSystemResponse() {
            let onTimeoutFunction = () => displayUserPrompt(delayMessage)
                .then(response => {
                    if (!response.startsWith('y')) {
                        resolve();
                    } else {
                        console.log('waiting for response from system...');
                        waitForSystemResponse();
                    }
                });
            setTimeout(onTimeoutFunction, delayTime);
        })();
    });
};
let executeSystemCommand = (commandToExecute, outputOptions) => {
    return new Promise((resolve, reject) => {
        let systemCommand = exec(commandToExecute, {maxBuffer: 1024 * 500}, (error, osResponse, stderr) => {
            if (error) {
                reject(Error(error));
            } else if (stderr && !outputOptions.stderr) {
                console.log(stderr);
            }
            outputOptions.resolve(resolve, osResponse);
        });
        if (outputOptions.stdout) {
            systemCommand.stdout.on('data', data => {
                outputOptions.stdout(data);
            });
        }
        if (outputOptions.stderr) {
            systemCommand.stderr.on('data', data => {
                outputOptions.stderr(resolve, reject, data);
            });
        }
        if (outputOptions.exit) {
            systemCommand.on('exit', data => {
                outputOptions.exit(resolve, reject, data);
            });
        }
    });
};
let findHighestCompatibleVersion = (globalPackage, projectGlobals, listVersionsCommand) => { // get highest version from terminal or prompt output
    const nodeVersionPattern = /([0-9]+(?:\.[0-9-a-z]+)+)/g;
    let matchVersionsOptions = {
        resolve: (resolve, data) => {
            let match = nodeVersionPattern.exec(data);
            let allVersions = [];
            while (match !== null) {
                allVersions.push(match[0]);
                match = nodeVersionPattern.exec(data);
            }
            let tool = {};
            tool.name = globalPackage;
            tool.highestCompatibleVersion = semver.maxSatisfying(allVersions, projectGlobals[globalPackage]);
            resolve(tool);
        }
    };
    return executeSystemCommand(listVersionsCommand, matchVersionsOptions);
};

let confirmOptionalInstallation = (displayPrompt, installCallback) => {
    return displayUserPrompt(displayPrompt)
        .then(response => {
            if (!response.startsWith('n')) {
                console.log('updating packages');
                return installCallback();
            } else {
                console.log('update aborted');
            }
        });
};
let getAllUserGlobals = (installedModules, modulePattern) => { // return a map of all modules user has installed
    let match = modulePattern.exec(installedModules);
    let userGlobals = {};
    let GLOBAL_NAME = 1;
    let GLOBAL_VERSION = 2;
    while (match !== null) {
        userGlobals[match[GLOBAL_NAME]] = match[GLOBAL_VERSION];
        match = modulePattern.exec(installedModules);
    }
    return userGlobals;
};
let findUserGlobals = (listGlobalsCommand, getGlobals) => {
    let findGlobalsOptions = {
        resolve: (resolve, data) => {
            resolve(getGlobals(data));
        }
    };
    return executeSystemCommand(listGlobalsCommand, findGlobalsOptions);
};
let listOptionals = optionalPackages => {
    for (let index = 0; index < optionalPackages.length; index++) {
        console.log(optionalPackages[index].name);
    }
};
let installGlobalNpmDependencies = () => {
    let userState = {};
    let findVersion = (dependency, projectGlobals) => {
        let getNpmPackageVersions = getSystemCmd('npm info ' + dependency + ' versions --json');
        return findHighestCompatibleVersion(dependency, projectGlobals, getNpmPackageVersions);
    };
    let getGlobals = modules => {
        return getAllUserGlobals(modules, /([a-z-A-Z]+)@([0-9]+(?:\.[0-9-a-z]+)+)/g);
    };
    const npmListUserGlobals = getSystemCmd('npm ls -g');
    const npmInstallModuleAsGlobal = 'npm install -g';
    console.log('getting installed node modules.');
    return findUserGlobals(npmListUserGlobals, getGlobals)
        .catch(error => { // this will catch if the user has unmet dependencies on existing npm packages
            console.log(error);
        })
        .then(userGlobals => {
            userState.userGlobals = userGlobals;
            if (operatingSystem === 'win32') { // flag for additional install requirements
                userState.windows = {};
                return runListOfPromises(packageGlobals.windows, findVersion)
                    .then(windowsPackages => {
                        let windowsUpdates = findRequiredAndOptionalUpdates(userGlobals, packageGlobals.windows, windowsPackages);
                        userState.windows.required = windowsUpdates.required;
                        userState.windows.optional = windowsUpdates.optional;
                        if (userState.windows.required.length > 0) {
                            console.log('installing required windows packages.');
                            return Promise.race([executeSystemCommand(getSystemCmd(getInstallationCommand(userState.windows.required, npmInstallModuleAsGlobal, '@')), { resolve: options.resolve }),
                                handleUnresponsiveSystem(2 * minutes, 'The system is not responding.\ndo you want to keep waiting (y/n)?  ')]);
                        }
                    })
            }
        })
        .then(() => runListOfPromises(packageGlobals.npm, findVersion)
            .then(npmPackages => {
                userState.npm = {};
                let npmUpdates = findRequiredAndOptionalUpdates(userState.userGlobals, packageGlobals.npm, npmPackages);
                userState.npm.required = npmUpdates.required;
                userState.npm.optional = npmUpdates.optional;
                if (userState.npm.required.length > 0) {
                    console.log('installing required npm packages.');
                    return executeSystemCommand(getSystemCmd(getInstallationCommand(userState.npm.required, npmInstallModuleAsGlobal, '@')), options);
                }
            }))
        .then(() => {
            if (userState.windows && userState.windows.optional.length > 0) {
                console.log('windows updates exist for the following packages: ');
                listOptionals(userState.windows.optional);
                return confirmOptionalInstallation('do you want to install these optional windows updates now (y/n)?  ',
                    () => executeSystemCommand(getSystemCmd(getInstallationCommand(userState.windows.optional, npmInstallModuleAsGlobal, '@')), options));
            }

        })
        .then(() => {
            if (userState.npm.optional.length > 0) {
                console.log('npm updates exist for the following packages: ');
                listOptionals(userState.npm.optional);
                return confirmOptionalInstallation('do you want to install these optional npm updates now (y/n)?  ',
                    () => executeSystemCommand(getSystemCmd(getInstallationCommand(userState.npm.optional, npmInstallModuleAsGlobal, '@')), options));
            }
        })
        .then(() => {
            console.log('all npm packages are up to date.');
            return userState;
        })
        .catch(error => {
            console.error('Failed!', error);
        });
};
let getVersionsWithRequest = (productUrl, hyperlinkPattern, range) => {
    return new Promise((resolve, reject) => {
        request({
            followAllRedirects: true,
            agent: false,
            url: productUrl,
            method: 'GET'
        }, (error, response, body) => {
            if (error) {
                reject(error);
            }
            let match = hyperlinkPattern.exec(body);
            let versionMap = {};
            while (match !== null) {
                let downloadLink = match[0];
                let version = match[1];
                versionMap[version] = downloadLink;
                match = hyperlinkPattern.exec(body);
            }
            let arrayOfVersions = Object.keys(versionMap);
            let highestVersion = semver.maxSatisfying(arrayOfVersions, range);
            let highestVersionObj = {};
            highestVersionObj.downloadHyperlink = versionMap[highestVersion];
            highestVersionObj.version = highestVersion;
            resolve(highestVersionObj);
        });
    });
};

let downloadPackage = (hyperlink, downloadPath) => {
    return new Promise((resolve, reject) => {
        let downloadFile = fs.createWriteStream(downloadPath);
        let stream = request(hyperlink).pipe(downloadFile);
        stream.on('finish', () => {
            console.log('download complete');
        });
        stream.on('error', err => {
            console.log(err);
            reject(err);
        });
        downloadFile.on('close', () => {
            resolve(downloadPath);
        });
    });
};
let checkRubyInstallWindows = () => {
    let rubyUrlWindows = 'https://rubyinstaller.org/downloads/archives/';
    let rubyHyperlinkPattern = /https[^"]+rubyinstaller-([0-9.]+)[0-9-p]*x64.exe/g;
    let getRubyVersion = getSystemCmd('ruby -v');
    return executeSystemCommand(getRubyVersion, {resolve: options.resolve})
        .catch(() => {
            console.log('no version of ruby is installed on this computer');
        })
        .then(rubyVersion => {
            if (rubyVersion) {
                return rubyVersion.match(versionPattern)[0];
            }
        })
        .then(localRubyVersion => {
            return getVersionsWithRequest(rubyUrlWindows, rubyHyperlinkPattern, packageGlobals.ruby)
                .then(remoteRubyVersion => {
                    let installRuby = () => {
                        let path = remoteRubyVersion.downloadHyperlink;
                        let rubyDownloadPath = process.env.USERPROFILE + '\\Downloads\\' +
                            path.substring(path.lastIndexOf('/') + 1, path.length);
                        return downloadPackage(path, rubyDownloadPath)
                            .then(rubyFilePath => {
                                let startRubyInstall = rubyFilePath + ' /verysilent /tasks="modpath"';
                                return executeSystemCommand(startRubyInstall, options);
                            });
                    };
                    if (!localRubyVersion || semver.outside(localRubyVersion, packageGlobals.ruby, '<')) {
                        if (localRubyVersion) {
                            console.log('local ruby version is ' + localRubyVersion + ' package requires ' + packageGlobals.ruby);
                        }
                        console.log('installing ruby now');
                        return installRuby();
                    } else {
                        if (semver.gt(remoteRubyVersion.version, localRubyVersion)) {
                            console.log('a newer version of ruby, version ' + remoteRubyVersion.version + ' is now available.');
                            return confirmOptionalInstallation('do you want to install this optional ruby upgrade now (y/n)?  ', () => installRuby());
                        } else {
                            console.log('local ruby version ' + localRubyVersion + ' is up to date.');
                        }
                    }
                });
        });
};
let checkRvmInstallMacLinux = () => {
    const rvmInstallMacLinux = 'curl -sSL https://get.rvm.io | bash -s -- --ignore-dotfiles';
    const rvmGetAllRemoteRubyVersions = convertToBashLoginCommand('rvm list known');
    const rvmGetAllLocalRubyVersions = convertToBashLoginCommand('rvm list');
    const rvmSetLocalRubyDefault = 'rvm --default use ';
    let checkForExistingRvm = getSystemCmd('which rvm');
    return executeSystemCommand(checkForExistingRvm, {resolve: options.resolve})
        .catch(() => {
            console.log('no version of rvm is installed on this computer');
        })
        .then(rvmVersion => {
            if (!rvmVersion) {
                console.log('installing rvm now');
                return executeSystemCommand(rvmInstallMacLinux, options)
                    .then(() => {
                        let outFile = (operatingSystem === 'darwin') ? '/.bash_profile' : '/.bashrc';
                        return executeSystemCommand('echo "[ -s \\"\\$HOME/.rvm/scripts/rvm\\" ] && \\. \\"\\$HOME/.rvm/scripts/rvm\\"" >> ' + os.homedir() + outFile, options)
                            .then(() => executeSystemCommand('echo "export PATH=\\"\\$PATH:\\$HOME/.rvm/bin\\"" >> ' + os.homedir() + outFile, options));
                    });
            }
        })
        .catch(e => {
            console.log(e);
        })
        .then(() => {
            let getLocalRubyOptions = {
                resolve: (resolve, data) => {
                    let versions = data.match(versionPattern);
                    let returnValue = (versions) ? semver.maxSatisfying(versions, packageGlobals.ruby) : versions;
                    resolve(returnValue);
                }
            };
            return executeSystemCommand(rvmGetAllLocalRubyVersions, getLocalRubyOptions);
        })
        .then(rubyVersion => executeSystemCommand(rvmGetAllRemoteRubyVersions, {resolve: options.resolve})
            .then(allVersions => {
                let rvmRubyPattern = /\[ruby-]([.0-9]+)\[([.0-9-a-z]+)]/g;
                let match = rvmRubyPattern.exec(allVersions);
                let versions = [];
                while (match !== null) {
                    versions.push(match[1] + match[2]);
                    match = rvmRubyPattern.exec(allVersions);
                }
                return semver.maxSatisfying(versions, packageGlobals.ruby);
            })
            .then(versionToInstall => {
                let installRuby = () => executeSystemCommand(getSystemCmd('rvm install ' + versionToInstall), options)
                    .then(() => versionToInstall);
                if (!rubyVersion) {
                    console.log('no version of ruby detected, installing version ' + versionToInstall + ' now');
                    return installRuby();
                } else if (semver.lt(rubyVersion, versionToInstall)) {
                    console.log('a newer version of ruby, version ' + versionToInstall + ' is available.');
                    return confirmOptionalInstallation('do you want to install this optional ruby update now (y/n)?  ', () => installRuby());
                } else {
                    console.log(rubyVersion + ' satisfies package requirements');
                    return rubyVersion;
                }
            }))
        .then(rubyVersion => executeSystemCommand(convertToBashLoginCommand(rvmSetLocalRubyDefault + rubyVersion), options)
            .catch(e => {
                console.log(e);
            }).then(() => {
                console.log('ruby install complete. default version is now ' + rubyVersion + '.');
            }));
};
let displayUserPrompt = displayPrompt => new Promise((resolve) => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    rl.question(displayPrompt, (answer) => {
        resolve(answer);
        rl.close();
    });
});
let walkThroughjdkInstall = () => displayUserPrompt('go to the url http://www.oracle.com/technetwork/java/javase/downloads/')
    .then(() => displayUserPrompt('click on the jdk download link'))
    .then(() => displayUserPrompt('click on the accept license agreement button, then download the version matching your operating system.'))
    .then(() => {
        if (operatingSystem === 'win32') {
            return displayUserPrompt('accept the default installation path and default tools.');
        }
    })
    .then(() => displayUserPrompt('after downloading, you will need to first unzip this folder, then add this location to your system path.')).then(() => {
        if (operatingSystem === 'win32') {
            return displayUserPrompt('type "environment variables" into your start button menu or search bar and click enter.');
        } else {
            return displayUserPrompt('press ctrl + alt + t to launch a terminal');
        }
    })
    .then(() => {
        if (operatingSystem === 'win32') {
            return displayUserPrompt('click on "environment variables".');
        } else {
            return displayUserPrompt('type nano (any text editor will work) /etc/environment and press enter');
        }
    })
    .then(() => {
        if (operatingSystem === 'win32') {
            return displayUserPrompt('in the lower window marked "system variables" you should see a variable marked "Path". Click on this value to modify it.');
        } else {
            return displayUserPrompt('scroll to the end of the file and enter the following:\nJAVA_HOME=/usr/lib/jvm/{your java version here}\nexport JAVA_HOME\nSave the file and exit. ' +
                'reload the system path by pressing . /etc/environment or close the terminal.');
        }
    }).then(() => {
        if (operatingSystem === 'win32') {
            return displayUserPrompt('click on the button labeled "New". A blank entry should pop up at the bottom.');
        }
    })
    .then(() => {
        if (operatingSystem === 'win32') {
            return displayUserPrompt('paste the path to your java sdk in this box. typically, this path is of ' +
                'the form\nC:\\Program Files\\Java\\jdk1.8.0_141\\bin, but this is unique to each installation.');
        }
    })
    .then(() => {
        if (operatingSystem === 'win32') {
            return displayUserPrompt('Next, you will need to add a System Variable for "JAVA_HOME". Click new under the box for system variables.\nA box should pop up with values ' +
                'for the variable name and the value. Enter "JAVA_HOME" as the name.\nEnter C:\\Program Files\\Java\\jdk1.8.0_141, or the path to your unique java jdk folder.');
        }
    }).then(() => {
        if (operatingSystem === 'win32') {
            return displayUserPrompt('open a new terminal then type "javac -v". If this was done correctly, you should see output like "javac 1.8.0_141". Java is now ');
        }
    })
    .then(() => {
        if (operatingSystem === 'win32') {
            return displayUserPrompt('click ok then close for each open screen');
        }
    }).then(() => {
        if (operatingSystem === 'win32') {
            return displayUserPrompt('open a new terminal then type "javac -v". If this was done correctly, you should see output like "javac 1.8.0_141". Java is now ');
        }
    });

let installMavenOnHost = () => {
    let downloadPattern = (operatingSystem === 'win32') ? /http[^"]+maven-([0-9.]+)-bin\.zip/g : /http[^"]+maven-([0-9.]+)-bin\.tar\.gz/g;
    let unzippedFolderPath = (operatingSystem === 'win32') ?  'C:\\Program Files\\' : '/usr/local/';
    let mavenUrl = 'https://maven.apache.org/download.cgi';
    let mavenVersion;
    return getVersionsWithRequest(mavenUrl, downloadPattern, packageGlobals.maven) // scrape the maven homepage to get version and download link
        .then(download => {
            let path = download.downloadHyperlink;
            console.log('downloading maven version from the following link:\n' + path);
            let fileName = path.substring(path.lastIndexOf('/') + 1, path.length);
            unzippedFolderPath += fileName.substring(0, fileName.indexOf(download.version) + download.version.length);
            let folderSeparator = (operatingSystem === 'win32') ? '\\' : '/';
            let downloadPath = os.homedir() + folderSeparator + 'Downloads' + folderSeparator + fileName;
            mavenVersion = download.version;
            return downloadPackage(path, downloadPath);
        })
        .then(downloadPath => { // unzip the downloaded package
            let unzipCommand;
            if (operatingSystem === 'win32') {
                unzipCommand = 'powershell.exe -command \"Add-Type -AssemblyName System.IO.Compression.FileSystem; ' +
                    '[System.IO.Compression.ZipFile]::ExtractToDirectory(' + '\'' + downloadPath + '\', \'C:\\Program Files\\\');\"';
            } else {
                unzipCommand = 'sudo tar -xvzf ' + downloadPath + ' -C /usr/local/';
            }
            return executeSystemCommand(unzipCommand, options);
        })
        .then(() => { // set environment variables
            console.log('setting your maven system environment variables.');
            let outFile = (operatingSystem === 'darwin') ? '.bash_profile' : '.bashrc';
            let commandSeparator = (operatingSystem === 'win32') ? '; ' : ' && ';
            let setM2Home = (operatingSystem === 'win32') ? setSystemEnvironmentVariable('M2_HOME', '\'' + unzippedFolderPath + '\'') :
                'echo "export M2_HOME=/usr/local/maven" >> ' + os.homedir() + '/' + outFile;
            let setMavenHome = (operatingSystem === 'win32') ? setSystemEnvironmentVariable('MAVEN_HOME', '\'' + unzippedFolderPath + '\'') :
                'echo "export MAVEN_HOME=/usr/local/maven" >> ' + os.homedir() + '/' + outFile;
            let setSystemPath = (operatingSystem === 'win32') ? '$old_path = ' + getSystemEnvironmentVariableForWindows('path') +
                '; $new_path = $old_path + \';\' + \'' + unzippedFolderPath + '\' + \'\\bin\'; ' +
                setSystemEnvironmentVariable('path', '$new_path') : 'echo "export PATH=/usr/local/maven/bin:\\$PATH" >> ' + os.homedir() + '/' + outFile;
            let createSymbolicLinkToMaven = 'sudo ln -s ' + unzippedFolderPath + ' /usr/local/maven';
            let setAllPathVariables = setM2Home + commandSeparator + setMavenHome + commandSeparator + setSystemPath;
            setAllPathVariables = (operatingSystem === 'win32') ? getSystemCmd(setAllPathVariables) : setAllPathVariables + commandSeparator + createSymbolicLinkToMaven;
            return executeSystemCommand(setAllPathVariables, options);
        })
        .then(() => { // notify user of success
            console.log('successfully installed maven version ' + mavenVersion);
        })
        .catch(error => { // notify user of failure and reason
            console.log('could not set environment variables at this time.');
            console.log(error);
        });
};
// refresh the path before running every command in powershell to handle full install
let convertToPowershellCommand = systemCommand => 'powershell.exe -command \"$env:Path = ' + getSystemEnvironmentVariableForWindows('Path') + '; ' + systemCommand + ';\"';
let convertToBashLoginCommand = systemCommand => 'bash -l -c \"' + systemCommand + '\"';
let getSystemCmd = systemCommand => (operatingSystem === 'win32') ? convertToPowershellCommand(systemCommand) : convertToBashLoginCommand(systemCommand);
let checkForGemUpdates = () => {
    let getGlobals = modules => getAllUserGlobals(modules, /([a-z-A-Z0-9]+) \(([0-9]+(?:\.[0-9]+)+)/g);
    let findVersion = (dependency, projectGlobals) => {
        //powershell.exe -command "gem list `\"^^sass`$`\" -r -a"
        let searchPattern = (operatingSystem === 'win32') ? '`\\"^^' + dependency + '`$`\\"' : '^' + dependency + '$';
        let gemListRemote = getSystemCmd('gem list ' + searchPattern + ' -r -a');
        return findHighestCompatibleVersion(dependency, projectGlobals, gemListRemote);
    };
    let localGems;
    let remoteGems;
    let gemUpdates;
    let gemListLocal = getSystemCmd('gem list');
    console.log('getting installed gems.');
    return findUserGlobals(gemListLocal, getGlobals)
        .then(globals => {
            localGems = globals;
            return runListOfPromises(packageGlobals.gems, findVersion);
        })
        .then(gems => {
            remoteGems = gems;
            gemUpdates = findRequiredAndOptionalUpdates(localGems, packageGlobals.gems, remoteGems);
            if (gemUpdates.required.length > 0) {
                let gemInstall = getSystemCmd(getInstallationCommand(gemUpdates.required, 'gem install', ':'));
                return executeSystemCommand(gemInstall, options);
            }
        })
        .then(() => {
            if (gemUpdates.optional.length > 0) {
                console.log('gem updates exist for the following packages: ');
                listOptionals(gemUpdates.optional);
                return confirmOptionalInstallation('do you want to install these optional gem updates now (y/n)?  ', () => {
                    let gemInstall = getSystemCmd(getInstallationCommand(gemUpdates.optional, 'gem install', ':'));
                    return executeSystemCommand(gemInstall, options);
                });
            }
        })
        .then(() => {
            console.log('all gem packages are up to date.');
        });
};
let waitForServerStartup = () => {
    console.log('waiting for server to startup...');
    let portListenCommand = (operatingSystem === 'win32') ? findPortProcessWindows : findPortProcessOsxLinux;
    return new Promise((resolve) => {
        (function waitForEstablishedConnection() {
            return executeSystemCommand(portListenCommand, {resolve: options.resolve})
                .then(osResponse => {
                    if (osResponse.includes('ESTABLISHED')) {
                        console.log(osResponse);
                        resolve(osResponse);
                    } else {
                        console.log('server is listening, waiting for connection to be established');
                        setTimeout(waitForEstablishedConnection, 3 * seconds);
                    }
                })
                .catch(() => {
                    console.log('did not find any process at port 4502, checking again.');
                    setTimeout(waitForEstablishedConnection, 5 * seconds);
                });
        })();
    });
};
let goUpDirectories = numberOfDirectories => {
    let splitValue = (operatingSystem === 'win32') ? '\\' : '/';
    return scriptsDirectory.split(splitValue).slice(0, -numberOfDirectories).join(splitValue) + splitValue;
};

let uploadAndInstallAllAemPackages = folderSeparator => {
    console.log('server started, installing local packages now...');
    let packageArray = Object.keys(packageGlobals.aem.zip_files);
    const crxInstallUrl = 'http://admin:admin@localhost:4502/crx/packmgr/service.jsp';
    return packageArray.reduce((promise, zipFile) => promise.then(() => new Promise((resolve) => {
        (function waitForEstablishedConnection() {
            let formData = {
                file: fs.createReadStream(os.homedir() + folderSeparator + 'Downloads' + folderSeparator + zipFile),
                name: zipFile,
                force: 'true',
                install: 'true'
            };
            request.post({url: crxInstallUrl, formData: formData}, (err, httpResponse, body) => {
                if (err) {
                    console.log('upload and install failed with the following message:\n' + err);
                    setTimeout(waitForEstablishedConnection, 3 * seconds);
                } else if (httpResponse.statusCode === 200) {
                    console.log('Upload successful!  Server responded with:', body);
                    resolve(body);
                } else {
                    console.log('Upload failed,  Server responded with:', body);
                    setTimeout(waitForEstablishedConnection, 3 * seconds);
                }
            });
        })();
    })), Promise.resolve());
};
let stopAemProcess = () => {
    let findPortProcess = (operatingSystem === 'win32') ? findPortProcessWindows : findPortProcessOsxLinux;
    return executeSystemCommand(findPortProcess, {resolve: options.resolve})
        .then(output => {
            console.log(output);
            let process = /LISTENING.*?([0-9]+)/g.exec(output);
            return process[1]; // return the process id
        })
        .then(processId => {
            console.log('ending process number ' + processId);
            let endPortProcess = (operatingSystem === 'win32') ? 'taskkill /F /PID ' : 'kill ';
            return executeSystemCommand(endPortProcess + processId, options);
        });
};
let getSystemEnvironmentVariableForWindows = variableName => '[Environment]::GetEnvironmentVariable(\'' + variableName + '\', \'Machine\')';
let setSystemEnvironmentVariable = (variableName, variableValue) => '[Environment]::SetEnvironmentVariable(\'' + variableName + '\', ' + variableValue + ', \'Machine\')';
let mavenCleanAndAutoInstall = (commandSeparator, folderSeparator) => {
    let outFile = goUpDirectories(2) + 'AEM' + folderSeparator + 'mvnOutput.log';

    //need to check whether JAVA_HOME has been set here for windows machines, if not, this can be executed with the command below
    let runMavenCleanInstall = (operatingSystem === 'win32' && !process.env.JAVA_HOME) ? '$env:JAVA_HOME = ' + getSystemEnvironmentVariableForWindows('JAVA_HOME') + commandSeparator : '';
    runMavenCleanInstall += 'cd ' + goUpDirectories(1) + 't-mobile' + commandSeparator + 'mvn clean install \-PautoInstallPackage > ' + outFile;

    console.log('running mvn clean and auto package install.\nOutput is being sent to the file ' + outFile);
    return executeSystemCommand(getSystemCmd(runMavenCleanInstall), options);
};
let copyNodeFile = folderSeparator => () => {
    let nodeFolderPath = goUpDirectories(1) + 't-mobile' + folderSeparator + 'node';
    console.log('copying node file into ' + nodeFolderPath);
    return executeSystemCommand('mkdir ' + nodeFolderPath, options)
        .then(() => {
            let nodePath = process.execPath;
            let copyNodeFile = (operatingSystem === 'win32') ? 'copy ' : 'cp ';
            copyNodeFile += '\"' + nodePath + '\" ' + nodeFolderPath + folderSeparator;
            return executeSystemCommand(copyNodeFile, options);
        });
};
let startAemServer = (commandSeparator, jarName) =>{
    console.log('starting jar file AEM folder.');
    let startServer = 'cd ' + goUpDirectories(2) + 'AEM' + commandSeparator;
    startServer += (operatingSystem === 'win32') ? 'Start-Process java -ArgumentList \'-jar\', \'' + jarName + '\'' : 'java -jar ' + jarName + ' &';
    executeSystemCommand(getSystemCmd(startServer), options);
};
let downloadAllAemFiles = folderSeparator => () => {
    return runListOfPromises(packageGlobals.aem.zip_files, (dependency, globalPackage) => {
        console.log('downloading aem dependency ' + dependency);
        return downloadPackage(globalPackage[dependency], os.homedir() + folderSeparator + 'Downloads' + folderSeparator + dependency);
    });
};
let aemInstallationProcedure = () => {
    let folderSeparator = (operatingSystem === 'win32') ? '\\' : '/';
    let commandSeparator = (operatingSystem === 'win32') ? '; ' : ' && ';
    let aemFolderPath = goUpDirectories(2) + 'AEM';
    let downloadFile = (dependency, globalPackage) => {
        return downloadPackage(globalPackage[dependency], aemFolderPath + folderSeparator + dependency)
            .then(() => dependency);
    };
    let jarName = '';
    console.log('creating AEM directory at ' + aemFolderPath);
    return executeSystemCommand('mkdir ' + aemFolderPath, options)
        .then(() => {
            console.log('downloading jar file into AEM folder.');
            return runListOfPromises(packageGlobals.aem.jar_files, downloadFile);
        })
        .then(fileName => {
            jarName = fileName;
            console.log('downloading license file into AEM folder.');
            return runListOfPromises(packageGlobals.aem.license, downloadFile);
        })
        .then(copyNodeFile(folderSeparator))
        .then(() => startAemServer(commandSeparator, jarName))
        .then(downloadAllAemFiles(folderSeparator))
        .then(() => waitForServerStartup())
        .then(() => uploadAndInstallAllAemPackages(folderSeparator))
        .then(() => mavenCleanAndAutoInstall(commandSeparator, folderSeparator))
        .then(() => stopAemProcess())
        .then(() => {
            console.log('successfully built project with mvn.');
        })
        .catch(error => {
            console.log('failed to build maven in t-mobile folder with the following message\n' + error);
        });
};
let installAemDependencies = () => {
    console.log('checking for Aem dependencies now..');
    const windowsFindQuickstart = 'dir C:\\*crx-quickstart /ad /b /s';
    const osxLinuxFindQuickstart = 'sudo find ' + os.homedir() + ' -type d -name "crx-quickstart"';
    let findQuickstart = (operatingSystem === 'win32') ? windowsFindQuickstart : osxLinuxFindQuickstart;
    return executeSystemCommand(findQuickstart, { resolve: options.resolve })
        .then(osResponse => {
            if (osResponse !== '') {
                console.log('found an existing aem installation at ' + osResponse.trim() + '.');
                return;
            }
            console.log('missing aem dependencies, installing all aem dependencies now...');
            return aemInstallationProcedure();
        })
        .catch(() => {
            // AEM is not installed, run full aem installation procedure here
            console.log('installing all aem dependencies now...');
            return aemInstallationProcedure();
        });
};
let installRuby = () => {
    return (operatingSystem === 'win32') ? checkRubyInstallWindows() : checkRvmInstallMacLinux();
};
let installJava = () => {
    let javaOptions = {};
    javaOptions.resolve = options.resolve;
    javaOptions.stderr = (resolve, reject, data) => { // by default the output is directed to stderr
        resolve(data);
    };
    console.log('checking java version compatibility.');
    // important to test the java compiler is in path, windows does not add to path by default
    let checkJavaCompilerVersion = getSystemCmd('javac -version');
    return executeSystemCommand(checkJavaCompilerVersion, javaOptions)
        .catch(() => { //java commands are redirected to stderr in both windows and linux environments
            console.log('no jdk version found on this computer');
            return walkThroughjdkInstall();
        })
        .then(javaVersion => {
            if (javaVersion) {
                let version = javaVersion.match(versionPattern);
                if (!version || semver.outside(version[0], packageGlobals.engines.java, '<')) {
                    console.log('no compatible jdk version found on this computer');
                    return walkThroughjdkInstall();
                } else {
                    console.log('java version ' + version[0] + ' is up to date');
                }
            }
        });
};
let installMaven = () => {
    const checkMavenVersion = getSystemCmd('mvn -v');
    return executeSystemCommand(checkMavenVersion, {resolve: options.resolve})
        .catch(() => {
            console.log('No version of maven detected. Installing maven now.');
            return installMavenOnHost();
        })
        .then(mavenVersion => {
            if (mavenVersion) {
                console.log('found maven version ' + mavenVersion.match(versionPattern)[0]);
            }
        });
};
let installAngularUiDependenciesWithYarn = () => {
    console.log('installing npm dependencies in angular-ui project folder.');
    let installAngularUiYarn = 'cd ' + goUpDirectories(1) + 'angular-ui';
    installAngularUiYarn += (operatingSystem === 'win32') ? ';' + getNpmPathOnWindows() + '\\yarn.cmd install' : ' && yarn install';
    return executeSystemCommand(getSystemCmd(installAngularUiYarn), options)
        .catch(error => {
            console.log('npm install failed in angular ui folder with the following message:\n');
            console.log(error);
        });
};
let updateWebdriver = (angularUiSuccess) => {
    if (angularUiSuccess) {
        console.log('updating webdriver in angular-ui project folder.');
        let updateWebDriver = 'cd ' + goUpDirectories(1) + 'angular-ui';
        updateWebDriver += (operatingSystem === 'win32') ? '; npm run update-webdriver' : ' && npm run update-webdriver';
        return executeSystemCommand(getSystemCmd(updateWebDriver), options)
            .catch(error => {
                console.log('updating webdriver failed in angular-ui project folder with the following message:\n');
                console.log(error);
            });
    } else {
        console.log('update to webdriver aborted due to failed angular build.');
    }
};
let getNpmPathOnWindows = () => {
    const windowsDirectoryPattern = /C:\\[^;]+npm/g;
    let pathToNpm = windowsDirectoryPattern.exec(process.env.Path);
    return (pathToNpm) ? pathToNpm[0] : process.env.APPDATA + '\\npm';
};
let runGruntPremerge = () => {
    let premergeOptions = {};
    premergeOptions.resolve = options.resolve;
    premergeOptions.stdout = options.stdout;
    premergeOptions.exit = (resolve, reject, data) => {
        resolve(data);
    };

    let gruntCmd = 'cd ' + goUpDirectories(1) + 'angular-ui';

    // handle older versions of windows that do not source npm cmd's correctly
    gruntCmd += (operatingSystem === 'win32') ? ';' + getNpmPathOnWindows() + '\\grunt.cmd pre-merge' : ' && grunt pre-merge';
    let fullGruntCmd = getSystemCmd(gruntCmd);
    return executeSystemCommand(fullGruntCmd, premergeOptions)
        .catch(error => {
            console.log('failed to complete grunt pre-merge, failed with message:\n');
            console.log(error);
        });
};
let endProcessWithMessage = (message, delay, exitCode) => {
    console.log(message);
    setTimeout(() => {
        process.exit(exitCode);
    }, delay);
};
let fullInstall = () => {
    let systemState = {};
    installRuby()
        .then(() => checkForGemUpdates())
        .then(() => installGlobalNpmDependencies())
        .then(userState => {
            systemState = userState;
            return installAngularUiDependenciesWithYarn();
        })
        .then(angularUiSuccess => updateWebdriver(angularUiSuccess))
        .then(() => installJava())
        .then(() => installMaven())
        .then(() => runGruntPremerge())
        .then(() => installAemDependencies())
        .then(() => endProcessWithMessage('For angular development, run command "grunt host".\nFor AEM development, start the crx-quickstart server.', 5 * seconds, 0));
};
module.exports = {
    installNpmGlobals: installGlobalNpmDependencies,
    installRuby: installRuby,
    installAem: installAemDependencies,
    installGems: checkForGemUpdates,
    installJava: installJava,
    installMaven: installMaven,
    installEverything: fullInstall
};