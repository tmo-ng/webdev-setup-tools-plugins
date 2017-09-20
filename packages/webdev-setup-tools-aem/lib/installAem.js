/**
 * Created by CDejarl1 on 8/30/2017.
 */
const setup = require('webdev-setup-tools');
const fs = require('fs');
const request = require('request');
const os = require('os');

const operatingSystem = os.platform().trim();
const formatOutput = setup.getOutputOptions();
const aemGlobals = setup.getProjectGlobals('aem');
const homeDirectory = os.homedir();
const findPortProcessWindows = 'netstat -a -n -o | findstr :4502';
const findPortProcessOsxLinux = 'lsof -i TCP:4502';
const seconds = 1000;
const folderSeparator = (operatingSystem === 'win32') ? '\\' : '/';
const commandSeparator = (operatingSystem === 'win32') ? '; ' : ' && ';
const aem_install_dir = aemGlobals.aem_folder_path || '';
const download_path_dir = aemGlobals.download_path || '';
const mvn_config_dir = aemGlobals.mvn_config_path || '';

const aem_dir = (aem_install_dir.endsWith(folderSeparator)) ? 'AEM' + folderSeparator : folderSeparator + 'AEM' + folderSeparator;
const aem_folder_path = aem_install_dir + aem_dir;
const download_path = (download_path_dir.endsWith(folderSeparator)) ? download_path_dir : download_path_dir + folderSeparator;
const crx_endpoint = aemGlobals.crx_endpoint;
const mvn_config_path = (mvn_config_dir.endsWith(folderSeparator)) ? mvn_config_dir : mvn_config_dir + folderSeparator;
let installAemDependencies = () => {
    console.log('checking for Aem dependencies now..');
    if (isAemConfigValid()) {
        return aemInstallationProcedure();
    } else {
        console.log('Aem installation is not possible');
    }
};
let isAemConfigValid = () => {
    return fs.existsSync(mvn_config_dir) && fs.existsSync(aem_install_dir) && fs.existsSync(download_path_dir) && !fs.existsSync(aem_folder_path);
};
let waitForServerStartup = () => {
    console.log('waiting for server to startup...');
    let portListenCommand = (operatingSystem === 'win32') ? findPortProcessWindows : findPortProcessOsxLinux;
    return new Promise((resolve) => {
        let waitForEstablishedConnection = () => {
            return setup.executeSystemCommand(portListenCommand, {resolve: formatOutput.resolve})
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
        };
        waitForEstablishedConnection();
    });
};

let uploadAndInstallAllAemPackages = () => {
    console.log('server started, installing local packages now...');
    let packageArray = Object.keys(aemGlobals.zip_files);
    return packageArray.reduce((promise, zipFile) => promise.then(() => new Promise((resolve) => {
        let waitForUploadSuccess = () => {
            let formData = {
                file: fs.createReadStream(homeDirectory + folderSeparator + 'Downloads' + folderSeparator + zipFile),
                name: zipFile,
                force: 'true',
                install: 'true'
            };
            request.post({url: crx_endpoint, formData: formData}, (err, httpResponse, body) => {
                if (err) {
                    console.log('upload and install failed with the following message:\n' + err);
                    setTimeout(waitForUploadSuccess, 5 * seconds);
                } else if (httpResponse.statusCode === 200) {
                    console.log('Upload successful!  Server responded with:', body);
                    resolve(body);
                } else {
                    console.log('Upload failed,  Server responded with:', body);
                    setTimeout(waitForUploadSuccess, 5 * seconds);
                }
            });
        };
        waitForUploadSuccess();
    })), Promise.resolve());
};
let mavenCleanAndAutoInstall = () => {
    let outFile = aem_folder_path + 'mvnOutput.log';

    //need to check whether JAVA_HOME has been set here for windows machines, if not, this can be executed with the command below
    let runMavenCleanInstall = (operatingSystem === 'win32' && !process.env.JAVA_HOME) ? '$env:JAVA_HOME = ' + setup.getWindowsEnvironmentVariable('JAVA_HOME') + commandSeparator : '';
    runMavenCleanInstall += 'cd ' + mvn_config_path + commandSeparator + 'mvn clean install \-PautoInstallPackage > ' + outFile;

    console.log('running mvn clean and auto package install.\nOutput is being sent to the file ' + outFile);
    return setup.executeSystemCommand(setup.getSystemCommand(runMavenCleanInstall), formatOutput);
};
let copyNodeFile = () => {
    let nodeFolderPath = mvn_config_path + 'node';
    console.log('copying node file into ' + nodeFolderPath);
    return setup.executeSystemCommand('mkdir ' + nodeFolderPath, formatOutput)
        .then(() => {
            let nodePath = process.execPath;
            let copyNodeFile = (operatingSystem === 'win32') ? 'copy ' : 'cp ';
            copyNodeFile += '\"' + nodePath + '\" ' + nodeFolderPath + folderSeparator;
            return setup.executeSystemCommand(copyNodeFile, formatOutput);
        });
};
let startAemServer = (jarName) =>{
    console.log('starting jar file AEM folder.');
    let startServer = 'cd ' + aem_folder_path;
    startServer += (operatingSystem === 'win32') ? 'Start-Process java -ArgumentList \'-jar\', \'' + jarName + '\'' : 'java -jar ' + jarName + ' &';
    setup.executeSystemCommand(setup.getSystemCommand(startServer), formatOutput);
};
let downloadAllAemFiles = () => {
    return setup.runListOfPromises(aemGlobals.zip_files, (dependency, globalPackage) => {
        console.log('downloading aem dependency ' + dependency);
        return setup.downloadPackage(globalPackage[dependency], download_path + dependency);
    });
};
let stopAemProcess = () => {
    let findPortProcess = (operatingSystem === 'win32') ? findPortProcessWindows : findPortProcessOsxLinux;
    return setup.executeSystemCommand(findPortProcess, {resolve: formatOutput.resolve})
        .then(output => {
            console.log(output);
            let process = /LISTENING.*?([0-9]+)/g.exec(output);
            return process[1]; // return the process id
        })
        .then(processId => {
            console.log('ending process number ' + processId);
            let endPortProcess = (operatingSystem === 'win32') ? 'taskkill /F /PID ' : 'kill ';
            return setup.executeSystemCommand(endPortProcess + processId, formatOutput);
        });
};
let aemInstallationProcedure = () => {
    let downloadFile = (dependency, globalPackage) => {
        return setup.downloadPackage(globalPackage[dependency], aem_folder_path + dependency)
            .then(() => dependency);
    };
    let authorFile = '';
    console.log('creating AEM directory at ' + aem_folder_path);
    return setup.executeSystemCommand('mkdir ' + aem_folder_path, formatOutput)
        .then(() => {
            console.log('downloading jar file into AEM folder.');
            return setup.runListOfPromises(aemGlobals.author, downloadFile);
        })
        .then(fileName => {
            authorFile = fileName;
            console.log('downloading license file into AEM folder.');
            return setup.runListOfPromises(aemGlobals.license, downloadFile);
        })
        .then(() => copyNodeFile())
        .then(() => startAemServer(authorFile))
        .then(() => downloadAllAemFiles())
        .then(() => waitForServerStartup())
        .then(() => uploadAndInstallAllAemPackages())
        .then(() => mavenCleanAndAutoInstall())
        .then(() => stopAemProcess())
        .then(() => {
            console.log('successfully built project with mvn.');
        })
        .catch(error => {
            console.log('aem installation failed with the following message:\n' + error);
        });
};

module.exports = {
    installAem: installAemDependencies
};