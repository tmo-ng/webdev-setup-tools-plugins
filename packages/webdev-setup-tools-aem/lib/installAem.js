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
const port = aemGlobals.port || '4502';
const content_files = aemGlobals.zip_files || aemGlobals.content_files;
const findPortProcessWindows = 'netstat -a -n -o | findstr :' + port;
const findPortProcessOsxLinux = 'lsof -i TCP:' + port + ' | grep LISTEN';
const seconds = 1000;
const windows = (operatingSystem === 'win32');
const folderSeparator = (windows) ? '\\' : '/';
const commandSeparator = (windows) ? '; ' : ' && ';
let crx_endpoint = aemGlobals.crx_endpoint;

// variables to be read from user input
let aem_install_dir = '';
let download_path_dir = '';
let mvn_config_dir = '';


let aem_dir = '';
let aem_folder_path = '';
let download_path = '';
let mvn_config_path = '';

// customPrompts - and array of objects with of the form {display: 'please enter the path to your aem installation: ', var_name: 'aem_install_dir'},
let installAemDependencies = (customPrompts) => {
  return setup.getConfigVariablesCustomPrompt(customPrompts, filepath => fs.existsSync(filepath))
    .then(userVars => {
      mvn_config_dir = userVars.mvn_config_dir;
      download_path_dir = userVars.download_path_dir;
      aem_install_dir = userVars.aem_install_dir;
      formatAemVariables();

      if (isAemConfigValid()) {
        if (fs.existsSync(aem_folder_path)) {
          return overwriteExistingAEM();
        } else {
          return aemInstallationProcedure();
        }
      } else {
        console.log('Aem installation is not possible with your current configuration.\n' +
          'Check your directories are named properly and for an existing AEM installation');
      }
    });
};

function overwriteExistingAEM() {
  return setup.confirmOptionalInstallation('Found existing AEM installation, would you like to overwrite this(y/n)?  ', () => {
    let deleteDirectory = (windows) ? 'rd /s /q \"' + aem_folder_path + '\"' : 'rm -rf ' + aem_folder_path;
    return setup.executeSystemCommand(deleteDirectory, formatOutput)
      .then(() => aemInstallationProcedure())
  });
}
let formatAemVariables = () => {
  aem_dir = (aem_install_dir.endsWith(folderSeparator)) ? 'AEM' + folderSeparator : folderSeparator + 'AEM' + folderSeparator;
  aem_folder_path = aem_install_dir + aem_dir;
  download_path = (download_path_dir.endsWith(folderSeparator)) ? download_path_dir : download_path_dir + folderSeparator;
  mvn_config_path = (mvn_config_dir.endsWith(folderSeparator)) ? mvn_config_dir : mvn_config_dir + folderSeparator;
};
let isAemConfigValid = () => {
  return fs.existsSync(mvn_config_dir + folderSeparator  + 'pom.xml') && fs.existsSync(aem_install_dir) && fs.existsSync(download_path_dir);
};
let waitForServerStartup = () => {
  console.log('waiting for server to startup...');
  let portListenCommand = (windows) ? findPortProcessWindows : findPortProcessOsxLinux;
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
          console.log('did not find any process at port ' + port + ', checking again.');
          setTimeout(waitForEstablishedConnection, 5 * seconds);
        });
    };
    waitForEstablishedConnection();
  });
};

let uploadAndInstallAllAemPackages = () => {
  console.log('server started, installing local packages now...');
  let packageArray = Object.keys(content_files);
  return packageArray.reduce((promise, zipFile) => promise.then(() => new Promise((resolve) => {
    let waitForUploadSuccess = () => {
      let formData = {
        file: fs.createReadStream(download_path + zipFile),
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
  let loadJavaHome = '$env:JAVA_HOME = ' + setup.getWindowsEnvironmentVariable('JAVA_HOME');

  let runMavenCleanInstall = (windows) ? loadJavaHome + commandSeparator : '';
  runMavenCleanInstall += 'cd ' + mvn_config_path + commandSeparator + 'mvn clean install \-PautoInstallPackage > ' + outFile;

  console.log('running mvn clean and auto package install.\nOutput is being sent to the file ' + outFile);
  return setup.executeSystemCommand(setup.getSystemCommand(runMavenCleanInstall), {resolve: formatOutput.resolve});
};
let copyNodeFile = () => {
  let nodeFolderPath = mvn_config_path + 'node';
  let copyNodeToFolder = () => {
    let nodePath = process.execPath;
    let copyNodeFile = (windows) ? 'copy ' : 'cp ';
    copyNodeFile += '\"' + nodePath + '\" ' + nodeFolderPath + folderSeparator;
    return setup.executeSystemCommand(copyNodeFile, formatOutput);
  };

  console.log('copying node file into ' + nodeFolderPath);
  if (fs.existsSync(nodeFolderPath)) {
    return copyNodeToFolder();
  } else {
    return setup.executeSystemCommand('mkdir ' + nodeFolderPath, formatOutput)
      .then(() => copyNodeToFolder());
  }
};
let startAemServer = (jarName) =>{
  console.log('starting jar file AEM folder.');
  let startServer = 'cd ' + aem_folder_path + commandSeparator;
  startServer += (windows) ? 'Start-Process java -ArgumentList \'-jar\', \'' + jarName + '\'' + ', \'-nointeractive\'' : 'java -jar ' + jarName + ' -nointeractive &';
  setup.executeSystemCommand(setup.getSystemCommand(startServer), formatOutput);
};
let downloadAllAemFiles = () => {
  let missingFiles = {};
  let previousInstall = false;
  Object.keys(content_files).forEach(file => {
    if (!fs.existsSync(download_path + file)) {
      missingFiles[file] = content_files[file];
    } else {
      previousInstall = true;
    }
  });
  let useExistingFiles = 'Existing AEM content files were found, would you like to use these files(y/n)? ';
  let defaultOption = new Promise((resolve) => {
    setTimeout(resolve, 10 * seconds, missingFiles);
  });

  let optionsArray = [defaultOption, setup.confirmOptionalInstallation(useExistingFiles, () => {
    return missingFiles;
  }, () => {
    return content_files;
  })];

  return Promise.resolve((previousInstall) ? Promise.race(optionsArray) : content_files)
    .then(files => {
      let downloadMessage = (files === missingFiles) ? '\nusing existing content files' : '\ndownloading all content files';
      console.log(downloadMessage);
      return setup.runListOfPromises(files, (dependency, globalPackage) => {
        console.log('downloading aem dependency ' + dependency);
        return setup.downloadPackage(globalPackage[dependency], download_path + dependency);
      });
    });

};
let stopAemProcess = () => {
  let findPortProcess = (windows) ? findPortProcessWindows : findPortProcessOsxLinux;
  return setup.executeSystemCommand(findPortProcess, {resolve: formatOutput.resolve})
    .then(output => {
      let process = (windows) ? /LISTENING.*?([0-9]+)/g.exec(output) : /java.*?([0-9]+)/g.exec(output);
      return process[1]; // return the process id
    })
    .then(processId => {
      console.log('shutting down the aem quickstart server');
      let endPortProcess = (windows) ? 'taskkill /F /PID ' : 'kill ';
      return setup.executeSystemCommand(endPortProcess + processId, formatOutput);
    }).catch(error => {
      console.log('failed to shutdown server on port ' + port + ' with error\n' + error);
    });
};
let aemInstallationProcedure = () => {
  let downloadFile = (dependency, globalPackage) => {
    return setup.downloadPackage(globalPackage[dependency], aem_folder_path + dependency)
      .then(() => dependency);
  };
  let authorFile = Object.keys(aemGlobals.author)[0];
  console.log('creating AEM directory at ' + aem_folder_path);
  return setup.executeSystemCommand('mkdir ' + aem_folder_path, formatOutput)
    .then(() => copyNodeFile())
    .then(() => {
      console.log('downloading author and license files into AEM folder.');
      let authorAndLicense = Object.assign({}, aemGlobals.author, aemGlobals.license);
      return setup.runListOfPromises(authorAndLicense, downloadFile);
    })
    .then(() => startAemServer(authorFile))
    .then(() => downloadAllAemFiles())
    .then(() => waitForServerStartup())
    .then(() => uploadAndInstallAllAemPackages())
    .then(() => mavenCleanAndAutoInstall())
    .then(() => stopAemProcess())
    .then(() => {
      console.log('\nsuccessfully installed aem packages.\n');
    })
    .catch(error => {
      console.log('\naem installation failed with the following message:\n' + error);
      return stopAemProcess();
    });
};

module.exports = {
  installAem: installAemDependencies
};