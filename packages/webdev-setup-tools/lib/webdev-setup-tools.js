// this file intended to parse the package.json file for missing dependencies
const semver = require('semver');
const os = require('os');
const {exec} = require('child_process');
const request = require('request');
const fs = require('fs');
const readline = require('readline');
const path = require('path');

const operatingSystem = os.platform().trim(); // supported values are darwin (osx), linux (ubuntu), and win32 ()
const windows = (operatingSystem === 'win32');
const homeDirectory = os.homedir();
const scriptsDirectory = __dirname;
const root = (process.cwd().endsWith('setup')) ? '../../' : './';

const globals = (() => {
  try {
    return (fs.existsSync(root + 'setup.json')) ? JSON.parse(fs.readFileSync(root + 'setup.json', 'utf8')) : JSON.parse(fs.readFileSync(root + 'package.json', 'utf8'));
  } catch(err) {
    console.log('failed to identify global configuration with the following error:\n' + err);
    process.exit(1);
  }
})();

const webdevSetupTools = globals['web-dev-setup-tools'] || globals;

const formattedOutputOptions = {
  resolve: (resolve, data) => {
    resolve(data);
  },
  stdout: data => {
    process.stdout.write(data);
  }
};

let getOutputOptions = () => formattedOutputOptions;

let getProjectGlobals = (packageName) => {
  if (!webdevSetupTools.hasOwnProperty(packageName)) {
    throw new Error('no configuration found for ' + packageName);
  }
  return webdevSetupTools[packageName];
};

// simplify updating environment variables to fewer files
let sourceBashProfileFromBashrc = () => {
  let bashRcPath = homeDirectory + '/.bashrc';
  let profilePath = homeDirectory + '/.bash_profile';
  if (windows || !fs.existsSync(bashRcPath) || !fs.existsSync(profilePath)) {
    return;
  }
  let sourceBashRcPattern = /(?:source|.) (?:"\$HOME\/.bash_profile"|~\/.bash_profile)/;
  if (!sourceBashRcPattern.test(fs.readFileSync(bashRcPath, 'utf8'))) {
    fs.appendFileSync(bashRcPath, '. ~/.bash_profile\n');
  }
};

// fileToUpdate - name of dotfile script in home directory that will be updated e.g. .bash_profile
// fileToSource - name of the startup script that will be sourced in e.g. .profile
let sourceStartupScipt = (fileToSource, fileToUpdate) => {
  let updateFilePath = path.join(homeDirectory, fileToUpdate);
  let sourceFilePath = path.join(homeDirectory, fileToSource);
  if (windows || !fs.existsSync(updateFilePath) || !fs.existsSync(sourceFilePath)) {
    return;
  }
  let sourceBashRcPattern = new RegExp('(?:source|.) (?:"\\$HOME\\/' + fileToSource +'"|~\\/' + fileToSource + ')');
  if (!sourceBashRcPattern.test(fs.readFileSync(updateFilePath, 'utf8'))) {
    fs.appendFileSync(updateFilePath, '\n\n# source file added by webdev-setup-tools\n. ~/' + fileToSource + '\n');
  }
};
// userGlobals - object mapping packages to versions
// projectGlobals - global object listed in package.json at root
// packageArray - array of module objects with name and highestCompatibleVersion properties
let findRequiredAndOptionalUpdates = (userGlobals, projectGlobals, packageArray) => {
  let optionalInstall = [];
  let requiredInstall = [];
  for (let index = 0; index < packageArray.length; index++) {
    let module = packageArray[index];
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

let runListOfPromises = (projectGlobals, promise) => {
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

let executeSystemCommand = (commandToExecute, outputOptions, environment) => {
  return new Promise((resolve, reject) => {
    let systemCommand = exec(commandToExecute, {
      maxBuffer: 1024 * 500,
      env: environment
    }, (error, osResponse, stderr) => {
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
  let versionPattern = /([0-9]+(?:\.[0-9-a-z]+)+)/g;
  let matchVersionsOptions = {
    resolve: (resolve, data) => {
      let match = versionPattern.exec(data);
      let allVersions = [];
      while (match !== null) {
        allVersions.push(match[0]);
        match = versionPattern.exec(data);
      }
      let tool = {};
      tool.name = globalPackage;
      tool.highestCompatibleVersion = semver.maxSatisfying(allVersions, projectGlobals[globalPackage]);
      resolve(tool);
    }
  };
  return executeSystemCommand(listVersionsCommand, matchVersionsOptions);
};

let confirmOptionalInstallation = (displayPrompt, acceptCallback, denyCallback) => {

  let acceptResponses = new Set(['y', 'yes']);
  let denyResponses = new Set(['n', 'no']);
  return new Promise((resolve, reject) => {
    (function ignoreInvalidKeys() {
      return displayUserPrompt(displayPrompt)
        .then(response => {
          if (acceptResponses.has(response.toLowerCase())) {
            resolve(acceptCallback);
          } else if (denyResponses.has(response.toLowerCase())) {
            resolve(denyCallback);
          } else {
            ignoreInvalidKeys();
          }
        });
    })();
  })
    .then(function (callback) {
      if (!callback) {
        return Promise.resolve();
      }
      return callback();
    });

};

let getAllUserGlobals = (installedModules, modulePattern) => { // return a map of all modules user has installed
  let match = modulePattern.exec(installedModules);
  let userGlobals = {};
  let globalName = 1;
  let globalVersion = 2;
  while (match !== null) {
    userGlobals[match[globalName]] = match[globalVersion];
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

let getVersionWithRequest = (productUrl, hyperlinkPattern, range) => {
  if (!semver.validRange(range)) {
    return Promise.reject(new Error('invalid range specified'));
  }
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

      if (!highestVersion) {
        reject(new Error('No compatible version found for the specified range'));
      }

      let highestVersionObj = {};
      highestVersionObj.downloadHyperlink = versionMap[highestVersion];
      highestVersionObj.version = highestVersion;
      resolve(highestVersionObj);
    });
  });
};

let getMaxNodeVersion = (range) => {
  let globalNode = webdevSetupTools.node || globals.engines;
  let installRange = range || globalNode.node || globalNode.install;
  return getVersionWithRequest('https://nodejs.org/dist/', /href="v([0-9.]+)\/"/g, installRange).then(versionObj => 'v' + versionObj.version);
};
// console.log(require('semver').satisfies('$localVersion', require('../setup.json')['web-dev-setup-tools']['node']['install']))
let isLocalNodeCompatible = (localNode) => {
  if (typeof localNode !== 'string' || !semver.valid(localNode)) {
    throw new Error('local node version must be a valid semantic version string');
  }

  let globalNode = webdevSetupTools.node || globals.engines;
  let installRange = globalNode.node || globalNode.install;
  return semver.satisfies(localNode, installRange);
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

// refresh the path before running every command in powershell to handle full install
let convertToPowershellCommand = systemCommand => {
  return 'powershell.exe -command \"$env:Path = ' + getSystemEnvVarForWindows('Path') + ' + \';\' + ' + getUserEnvVarForWindows('Path') + '; ' + systemCommand + ';\"';
};

let convertToBashLoginCommand = systemCommand => 'bash -l -c \"' + systemCommand + '\"';

let getSystemCmd = systemCommand => (windows) ? convertToPowershellCommand(systemCommand) : convertToBashLoginCommand(systemCommand);

let goUpDirectories = numberOfDirectories => {
  let splitValue = (windows) ? '\\' : '/';
  return scriptsDirectory.split(splitValue).slice(0, -numberOfDirectories).join(splitValue) + splitValue;
};

let hasAdminRights = () => {
  if (!windows) {
    return Promise.resolve();
  }
  let checkAdminRights = 'powershell -c "$wid=[System.Security.Principal.WindowsIdentity]::GetCurrent();' +
    '$prp=new-object System.Security.Principal.WindowsPrincipal($wid);$adm=[System.Security.Principal.WindowsBuiltInRole]::Administrator;' +
    'echo $prp.IsInRole($adm)"';
  return executeSystemCommand(checkAdminRights, {resolve: formattedOutputOptions.resolve})
    .then(shellResponse => {
      if (shellResponse.trim().toLowerCase() === 'false') {
        console.log('Please rerun this command in an administrative command prompt window');
        process.exit(0);
      }
    });
};

let getSystemEnvVarForWindows = variableName => '[Environment]::GetEnvironmentVariable(\'' + variableName + '\', \'Machine\')';

let getUserEnvVarForWindows = variableName => '[Environment]::GetEnvironmentVariable(\'' + variableName + '\', \'User\')';

let setSystemEnvironmentVariable = (variableName, variableValue) => '[Environment]::SetEnvironmentVariable(\'' + variableName + '\', ' + variableValue + ', \'Machine\')';

let endProcessWithMessage = (message, delay, exitCode) => {
  console.log(message);
  setTimeout(() => {
    process.exit(exitCode);
  }, delay);
};
let getVariablesFromUser = (arrayOfConfigVariables, validateInputFunc) => {
  return arrayOfConfigVariables.reduce((promise, variable) => promise.then((responseObject) => new Promise((resolve) => {
    let promptForValue = () => {
      let promptForUser = 'please enter a valid value for ' + variable + ': ';
      return displayUserPrompt(promptForUser)
        .then(output => {
          if (validateInputFunc(output)) {
            responseObject[variable] = output;
            resolve(responseObject);
          } else {
            promptForValue();
          }
        });
    };
    promptForValue();
  })), Promise.resolve({}));
};
let getVariablesWithPrompt = (arrayOfConfigVariables, validateInputFunc) => {
  return arrayOfConfigVariables.reduce((promise, variable) => promise.then((responseObject) => new Promise((resolve) => {
    let promptForValue = () => {
      let promptForUser = variable['display'];
      return displayUserPrompt(promptForUser)
        .then(output => {
          let customValidator = variable['custom_validator'] || validateInputFunc;
          if (customValidator(output)) {
            responseObject[variable['var_name']] = output;
            resolve(responseObject);
          } else {
            promptForValue();
          }
        });
    };
    promptForValue();
  })), Promise.resolve({}));
};
let getVariablesFromText = (data, separator) => {
  let userConstants = {};
  let matcher = new RegExp(separator);
  data.split(/\r?\n/).forEach(line => {
    let indexToSplit = matcher.exec(line);
    if (!indexToSplit) {
      return;
    }
    let key = line.substring(0, indexToSplit.index).trim();
    let value = line.substring(indexToSplit.index + indexToSplit[0].length).trim();
    if (userConstants.hasOwnProperty(key)) {
      let previousValue = userConstants[key];
      userConstants[key] = (Array.isArray(previousValue)) ? previousValue : [previousValue];
      userConstants[key].push(value);
    } else {
      userConstants[key] = value;
    }
  });
  return userConstants;
};

let getVariablesFromFile = (filePath, separator) => {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  const data = fs.readFileSync(filePath, 'utf8');
  return getVariablesFromText(data, separator);
};

let getMissingVariables = (filePath, arrayOfConfigVariables, separator) => {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  let missingVariables = [];
  let keyValSeparator = separator || '=';
  let foundVariables = getVariablesFromFile(filePath, keyValSeparator);
  for (let index = 0; index < arrayOfConfigVariables.length; index++) {
    let variable = arrayOfConfigVariables[index];
    if (!foundVariables.hasOwnProperty(variable)) {
      missingVariables.push(variable);
    }
  }
  return {missingVariables: missingVariables, foundVariables: foundVariables};
};
let shouldModifyGitIgnore = (isAGitRepo, gitIgnorePath, fileName) => {
  return isAGitRepo && (!fs.existsSync(gitIgnorePath) || !fs.readFileSync(gitIgnorePath, 'utf8').includes(fileName));
};

let getConfigVariablesCustomPrompt = (promptObjects, validateInputFunc) => {

  let validationFunction = (validateInputFunc) ? validateInputFunc : input => input;
  let isAGitRepo = fs.existsSync('../../.git');
  if (!isAGitRepo) {
    let alertNonGitUser = 'It looks like you are not using a git repository.\n' +
      'It will be your responsibility to ignore the .setuprc that is created by this procedure.\n' +
      'Check with your version control system documentation for this information.';
    console.log(alertNonGitUser);
  }
  let lineSeparator = os.EOL;

  let setuprcPath = path.join(fs.realpathSync('../../'), '.setuprc');
  let existingSetupRc = fs.existsSync(setuprcPath);
  if (shouldModifyGitIgnore(isAGitRepo, '../../.gitignore', '.setuprc')) {
    let gitIgnorePath = path.join(fs.realpathSync('../../'), '.gitignore');
    fs.appendFileSync(gitIgnorePath, '.setuprc' + lineSeparator);
  }
  let userConfigVariables = [];
  let userVariables = {};
  let missingConfigVars = (existingSetupRc) ? [] : promptObjects;
  if (existingSetupRc) {
    promptObjects.forEach(prompt => {
      userConfigVariables.push(prompt['var_name']);
    });
    let configVariables = getMissingVariables(setuprcPath, userConfigVariables);
    userVariables = configVariables.foundVariables;
    promptObjects.forEach(prompt => {
      if (!userVariables.hasOwnProperty(prompt['var_name'])) {
        missingConfigVars.push(prompt)
      }
    });

  }
  return getVariablesWithPrompt(missingConfigVars, validationFunction)
    .then(userResponseMap => { // write text to file then return user responses
      if (missingConfigVars.length === 0) {
        return userVariables;
      }
      let fileText = '';
      Object.keys(userResponseMap).forEach(variable => {
        fileText += variable + '=' + userResponseMap[variable] + lineSeparator;
      });
      fs.appendFileSync(setuprcPath, fileText);
      return Object.assign(userVariables, userResponseMap);
    });
};
// requestedConfigVariables - an array of string variables to be found
// validateInputFunc - function used to accept or reject user input for the configuration variables
let getConfigVariables = (requestedConfigVariables, validateInputFunc) => {
  let userConfigVariables = requestedConfigVariables || [];
  let validationFunction = (validateInputFunc) ? validateInputFunc : input => input;
  let isAGitRepo = fs.existsSync('../../.git');
  if (!isAGitRepo) {
    let alertNonGitUser = 'It looks like you are not using a git repository.\n' +
      'It will be your responsibility to ignore the .setuprc that is created by this procedure.\n' +
      'Check with your version control system documentation for this information.';
    console.log(alertNonGitUser);
  }
  let lineSeparator = os.EOL;

  let setuprcPath = path.join(fs.realpathSync('../../'), '.setuprc');
  let existingSetupRc = fs.existsSync(setuprcPath);
  if (shouldModifyGitIgnore(isAGitRepo, '../../.gitignore', '.setuprc')) {
    let gitIgnorePath = path.join(fs.realpathSync('../../'), '.gitignore');
    fs.appendFileSync(gitIgnorePath, '.setuprc' + lineSeparator);
  }
  let userVariables = {};
  let variablesToConfigure = userConfigVariables;
  if (existingSetupRc) {
    let configVariables = getMissingVariables(setuprcPath, userConfigVariables);
    variablesToConfigure = configVariables.missingVariables;
    userVariables = configVariables.foundVariables;
  }
  return getVariablesFromUser(variablesToConfigure, validationFunction)
    .then(userResponseMap => { // write text to file then return user responses
      if (variablesToConfigure.length === 0) {
        return userVariables;
      }
      let fileText = '';
      Object.keys(userResponseMap).forEach(variable => {
        fileText += variable + '=' + userResponseMap[variable] + lineSeparator;
      });
      fs.appendFileSync(setuprcPath, fileText);
      return Object.assign(userVariables, userResponseMap);
    });
};

module.exports = {
  getSystemCommand: getSystemCmd,
  findHighestCompatibleVersion: findHighestCompatibleVersion,
  findUserGlobals: findUserGlobals,
  getAllUserGlobals: getAllUserGlobals,
  runListOfPromises: runListOfPromises,
  findRequiredAndOptionalUpdates: findRequiredAndOptionalUpdates,
  handleUnresponsiveSystem: handleUnresponsiveSystem,
  hasAdminRights: hasAdminRights,
  executeSystemCommand: executeSystemCommand,
  confirmOptionalInstallation: confirmOptionalInstallation,
  getVersionWithRequest: getVersionWithRequest,
  downloadPackage: downloadPackage,
  convertToBashLoginCommand: convertToBashLoginCommand,
  convertToPowershellCommand: convertToPowershellCommand,
  displayUserPrompt: displayUserPrompt,
  getWindowsEnvironmentVariable: getSystemEnvVarForWindows,
  setWindowsEnvironmentVariable: setSystemEnvironmentVariable,
  getOutputOptions: getOutputOptions,
  getProjectGlobals: getProjectGlobals,
  getInstallationCommand: getInstallationCommand,
  listOptionals: listOptionals,
  goUpDirectories: goUpDirectories,
  getVariablesFromFile: getVariablesFromFile,
  endProcessWithMessage: endProcessWithMessage,
  getConfigVariables: getConfigVariables,
  getVariablesWithPrompt: getVariablesWithPrompt,
  getConfigVariablesCustomPrompt: getConfigVariablesCustomPrompt,
  getMissingVariables: getMissingVariables,
  getMaxNodeVersion: getMaxNodeVersion,
  isLocalNodeCompatible: isLocalNodeCompatible,
  sourceBashProfileFromBashrc: sourceBashProfileFromBashrc,
  sourceStartupScipt: sourceStartupScipt
};
