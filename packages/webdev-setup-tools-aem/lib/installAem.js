/**
 * Created by CDejarl1 on 8/30/2017.
 */
const setup = require('webdev-setup-tools');
const fs = require('fs');
const request = require('request');
const os = require('os');
const path = require('path');

const operatingSystem = os.platform().trim();
const formatOutput = setup.getOutputOptions();
const aemGlobals = setup.getProjectGlobals('aem');
const port = aemGlobals.port || '4502';
const content_files = aemGlobals.zip_files || aemGlobals.content_files;
const options = aemGlobals.quickstart_options || [];
const mvn_install_options = aemGlobals.mvn_install_options || [];
const findPortProcessWindows = 'netstat -a -n -o | findstr :' + port;
const findPortProcessOsxLinux = 'lsof -i TCP:' + port + ' | grep LISTEN';
const seconds = 1000;
const minutes = 60 * seconds;
const max_wait = 4 * minutes; // maximum time to wait for quickstart server startup
const windows = (operatingSystem === 'win32');
const commandSeparator = (windows) ? '; ' : ' && ';
const crx_endpoint = aemGlobals.crx_endpoint;
const requiredVars = new Set(['mvn_config_dir', 'download_path_dir', 'aem_install_dir']);

// requiredPromptObj - and array of objects with of the form {display: 'please enter the path to your aem installation: ', var_name: 'aem_install_dir'},
let installAemDependencies = (requiredPromptObj) => {
  if (!Array.isArray(requiredPromptObj)) {
    throw new Error('AEM requires array of configuration prompts');
  } else if (requiredPromptObj.some(promptObj => typeof promptObj !== 'object' || !promptObj.hasOwnProperty('display') || !promptObj.hasOwnProperty('var_name'))) {
    throw new Error('configuration prompts missing required properties for AEM installation procedure');
  } else if (requiredVars.size !== requiredPromptObj.reduce((allVars, nextPromptObj) => (requiredVars.has(nextPromptObj.var_name)) ? allVars.add(nextPromptObj.var_name) : allVars, new Set()).size) {
    throw new Error('Custom prompts are missing some required variables for aem installation');
  }

  return setup.getConfigVariablesCustomPrompt(requiredPromptObj, folderPath => {
    let validFolder = fs.existsSync(folderPath);
    if (!validFolder) {
      console.log('the folder ' + folderPath + ' could not be found.');
    }
    return validFolder;
  })
    .then(userVars => {
      let aemRoot = userVars.aem_install_dir;
      let downloadRoot = userVars.download_path_dir;
      let mvnRoot = userVars.mvn_config_dir;
      // let aem_folder_path = (aemRoot.endsWith(folderSeparator)) ? aemRoot + 'AEM' + folderSeparator : aemRoot + folderSeparator + 'AEM' + folderSeparator;
      // let download_path = (downloadRoot.endsWith(folderSeparator)) ? downloadRoot : downloadRoot + folderSeparator;
      // let mvn_config_path = (mvnRoot.endsWith(folderSeparator)) ? mvnRoot : mvnRoot + folderSeparator;
      let aem_folder_path = path.join(aemRoot, 'AEM');
      let download_path = downloadRoot;
      let mvn_config_path = mvnRoot;
      let userAemConfig = {aem_folder_path: aem_folder_path, download_path: download_path, mvn_config_path: mvn_config_path};
      // [aemRoot, download_path, mvn_config_path + 'pom.xml']
      if (isAemConfigValid([aemRoot, download_path, path.join(mvn_config_path, 'pom.xml')])) {
        return Promise.resolve(fs.existsSync(aem_folder_path) ? overwriteExistingAEM(userAemConfig) : aemInstallationProcedure(userAemConfig));
      } else {
        console.log('Aem installation is not possible with your current configuration.\n' +
          'Check your directories are named properly and for an existing AEM installation');
        process.exit(0);
      }
    });
};
let isAemConfigValid = (userAemConfig) => { // verify all user specified folders exist
  return userAemConfig.reduce(function (total, nextPath) {
    return total && fs.existsSync(nextPath);
  }, true);
};
function overwriteExistingAEM(userAemConfig) {
  return setup.confirmOptionalInstallation('Found existing AEM installation, would you like to overwrite this(y/n)? ', () => {
    let deleteDirectory = (windows) ? 'rd /s /q \"' + userAemConfig.aem_folder_path + '\"' : 'rm -rf ' + userAemConfig.aem_folder_path;
    return setup.executeSystemCommand(deleteDirectory, formatOutput)
      .then(() => aemInstallationProcedure(userAemConfig))
  });
}

let waitForServerStartup = () => {
  console.log('waiting for server to startup...');
  let portListenCommand = (windows) ? findPortProcessWindows : findPortProcessOsxLinux;
  return new Promise((resolve) => {
    (function waitForEstablishedConnection(wait_time) {
      return setup.executeSystemCommand(portListenCommand, {resolve: formatOutput.resolve})
        .then(osResponse => {
          if (osResponse.includes('ESTABLISHED') || wait_time > max_wait) {
            console.log(osResponse);
            resolve(osResponse);
          } else {
            console.log('server is listening, waiting for connection to be established');
            let delay = 3 * seconds;
            setTimeout(() => {
              waitForEstablishedConnection(wait_time + delay);
            }, delay);
          }
        })
        .catch(() => {
          console.log('did not find any process at port ' + port + ', checking again.');
          let delay = 5 * seconds;
          setTimeout(() => {
            waitForEstablishedConnection(wait_time + delay);
          }, delay);
        });
    })(0);
  });
};

let uploadAndInstallAllAemPackages = (userAemConfig) => {
  console.log('server started, installing local packages now...');
  let packageArray = Object.keys(content_files);
  return packageArray.reduce((promise, zipFile) => promise.then(() => new Promise((resolve) => {
    let waitForUploadSuccess = () => {
      let formData = {
        file: fs.createReadStream(path.join(userAemConfig.download_path, zipFile)),
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
let mavenCleanAndAutoInstall = (userAemConfig) => {
  let outFile = path.join(userAemConfig.aem_folder_path, 'mvnOutput.log');

  //need to check whether JAVA_HOME has been set here for windows machines, if not, this can be executed with the command below
  let loadJavaHome = (windows) ? '$env:JAVA_HOME = ' + setup.getWindowsEnvironmentVariable('JAVA_HOME') + commandSeparator : '';
  let mvnCleanInstallCmd = 'cd ' + userAemConfig.mvn_config_path + commandSeparator + 'mvn clean install';
  let mvnOptions = '';
  mvn_install_options.forEach(option => {
    mvnOptions += ' ' + option;
  });
  let fullMvnInstallCmd = loadJavaHome + mvnCleanInstallCmd + mvnOptions + ' > ' + outFile;
  console.log('running mvn clean and auto package install.\nOutput is being sent to the file ' + outFile);
  return setup.executeSystemCommand(setup.getSystemCommand(fullMvnInstallCmd), {resolve: formatOutput.resolve});
};
let copyNodeFile = (userAemConfig) => {
  let nodeFolderPath = path.join(userAemConfig.mvn_config_path, 'node');
  let nodePath = path.join(nodeFolderPath, 'node.exe');

  if (!fs.existsSync(nodePath)) {
    if (!fs.existsSync(nodeFolderPath)) {
      console.log('making directory ' + nodeFolderPath);
      fs.mkdirSync(nodeFolderPath);
    }
    console.log('copying node file into ' + nodePath);
    let copyNodeFile = (windows) ? 'copy ' : 'cp ';
    copyNodeFile += '\"' + process.execPath + '\" ' + nodeFolderPath;
    return setup.executeSystemCommand(copyNodeFile, formatOutput);
  } else {
    return Promise.resolve();
  }
};
let startAemServer = (jarName, userAemConfig) =>{
  console.log('starting AEM server...');
  let startServer = 'cd ' + userAemConfig.aem_folder_path + commandSeparator;
  startServer += (windows) ? 'Start-Process java -ArgumentList \'-jar\', \'' + jarName + '\'' : 'java -jar ' + jarName;
  options.forEach(option => {
    startServer += (windows) ? ', \'' + option + '\'' : ' ' + option;
  });
  startServer += (windows) ? '' : ' &';
  setup.executeSystemCommand(setup.getSystemCommand(startServer), {resolve: formatOutput.resolve});
};
let downloadAllAemFiles = (userAemConfig) => {
  let contentFilenames = Object.keys(content_files);
  let missingFiles = contentFilenames.reduce((fileMap, fileName) => {
    if (!fs.existsSync(path.join(userAemConfig.download_path, fileName))) {
      fileMap[fileName] = content_files[fileName];
    }
    return fileMap;
  }, {});

  let existingFiles = contentFilenames.length !== Object.keys(missingFiles).length;
  let optionsArray = (!existingFiles) ? [] : [ // avoid creating promises when no files exist
    new Promise((resolve) => {
      setTimeout(resolve, 10 * seconds, missingFiles);
    }),
    new Promise((resolve) => {
      let useExistingFiles = 'Existing AEM content files were found, would you like to use these files(y/n)? ';
      setup.confirmOptionalInstallation(useExistingFiles, () => {
        resolve(missingFiles);
      }, () => {
        resolve(content_files);
      })
    })
  ];
  return Promise.resolve((existingFiles) ? Promise.race(optionsArray) : content_files)
    .then(files => {
      return setup.runListOfPromises(files, (dependency, globalPackage) => {
        console.log('downloading aem dependency ' + dependency);
        return setup.downloadPackage(globalPackage[dependency], path.join(userAemConfig.download_path, dependency));
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
    })
    .catch(error => {
      console.log('failed to shutdown server on port ' + port + ' with error\n' + error);
      process.exit(0);
    });
};
let aemInstallationProcedure = (userAemConfig) => {
  let downloadFile = (dependency, globalPackage) => {
    return setup.downloadPackage(globalPackage[dependency], path.join(userAemConfig.aem_folder_path, dependency))
      .then(() => dependency);
  };
  let authorFile = Object.keys(aemGlobals.author)[0];
  console.log('creating AEM directory at ' + userAemConfig.aem_folder_path);
  return setup.executeSystemCommand('mkdir ' + userAemConfig.aem_folder_path, formatOutput)
    .then(() => copyNodeFile(userAemConfig))
    .then(() => {
      console.log('downloading author and license files into AEM folder.');
      let authorAndLicense = Object.assign({}, aemGlobals.author, aemGlobals.license);
      return setup.runListOfPromises(authorAndLicense, downloadFile);
    })
    .then(() => startAemServer(authorFile, userAemConfig))
    .then(() => downloadAllAemFiles(userAemConfig))
    .then(() => waitForServerStartup())
    .then(() => uploadAndInstallAllAemPackages(userAemConfig))
    .then(() => mavenCleanAndAutoInstall(userAemConfig))
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
