/**
 * Created by CDejarl1 on 8/30/2017.
 */
const setup = require('webdev-setup-tools');
const semver = require('semver');
const os = require('os');
const fs = require('fs');
const path = require('path');

const homeDirectory = os.homedir();
const operatingSystem = os.platform().trim();
const windows = (operatingSystem === 'win32');
const formatOutput = setup.getOutputOptions();
const versionPattern = /([0-9]+(?:\.[0-9]+)+)/g;
const globalJavaVersionRange = setup.getProjectGlobals('java');
let jdkDownloadMatcher = (windows) ? /jdk-.*windows-x64.*exe/ : /jdk-.*linux-x64.*tar.gz/;

const arrayOfPrompts = [ // hold all hardcoded string values for the steps in jdk installation
  {
    all: 'This prompt will walk you through the installation and setup of the official oracle java jdk.' +
    '\nWhen a step has been completed, press enter to continue to the next step. Please press enter to begin.'
  },
  {
    all: 'go to the url http://www.oracle.com/technetwork/java/javase/downloads'
  },
  {
    all: 'click on the jdk download link to be redirected to the download page for all systems.'
  },
  {
    linux: 'accept the license agreement, then download the linux-x64.tar.gz file',
    darwin: 'accept the license agreement, then download the osx-x64.dmg file',
    win32: 'accept the license agreement, then download windows-x64.exe file'
  },
  {
    darwin: 'Click on the downloaded file to run the installer. For most MacOs configurations, this automatically adds the jdk to your environment.',
    linux: 'Click on the downloaded tar.gz to extract it, or run the command "tar -xf /path/to/download -C /desired/install/directory" in a terminal',
    win32: 'Click on downloaded windows-x64.exe to start the jdk installer.'
  },
  {
    linux: 'Once you have successfully extracted the tar.gz, press enter to add the jdk to your path',
    win32: 'Once you have successfully completed the windows jdk installer, press enter to add the jdk to your path'
  }
];

let displayJavaPrompts = (javaPrompts) => {
  return javaPrompts.reduce((promise, variable) => promise.then(() => new Promise((resolve) => {
    (function promptForValue() {
      let promptForUser = variable.all || variable[operatingSystem];
      return (promptForUser) ? setup.displayUserPrompt(promptForUser).then(() => resolve()) : resolve();
    })();
  })), Promise.resolve());
};

let addJdkToSystemPath = (jdkPath) => {
  if (operatingSystem === 'darwin') { // mac automatically configures environment to use the jdk
    return Promise.resolve();
  }
  if (typeof jdkPath !== 'string') {
    return Promise.reject('jdk path argument must be a string')
  }
  console.log('Adding java to your environment');
  if (windows) {
    let setJavaHome = setup.setWindowsEnvironmentVariable('JAVA_HOME', '\'' + jdkPath + '\'');
    let setSystemPath = '$old_path = ' + setup.getWindowsEnvironmentVariable('path') +
      '; $new_path = \'' + path.join(jdkPath, 'bin') + '\' + \';\' + $old_path; ' +
      setup.setWindowsEnvironmentVariable('path', '$new_path');
    return setup.executeSystemCommand(setup.getSystemCommand(setJavaHome + '; ' + setSystemPath), formatOutput);
  }
  let srcFile = homeDirectory + '/.bash_profile';
  let javaEnvVars = {'export JAVA_HOME': jdkPath, 'export PATH': path.join(jdkPath, 'bin') + ':$PATH'};
  let javaConfigVars = Object.keys(javaEnvVars);
  let quotesPattern = /["']/;
  let existingVars = setup.getVariablesFromFile(srcFile, '=');
  Object.keys(existingVars).forEach(envVar => { // trim quotes to make precise comparison
    let previousVar = existingVars[envVar];
    existingVars[envVar] = (Array.isArray(previousVar)) ? previousVar.map(element => element.split(quotesPattern).join('')) : previousVar.split(quotesPattern).join('');
  });
  let dataToWrite = javaConfigVars.reduce((totalData, javaVariable) => {
    let existingVar = existingVars[javaVariable];
    let requiredVar = javaEnvVars[javaVariable];
    // avoid repeatedly adding java env vars to startup scripts
    let addJavaVar = (Array.isArray(existingVar) && !existingVar.includes(requiredVar)) || (!Array.isArray(existingVar) && existingVar !== requiredVar);
    return (addJavaVar) ? totalData + javaVariable + '="' + requiredVar + '"\n' : totalData;
  }, '');

  if (dataToWrite !== '') {
    fs.appendFileSync(srcFile, '\n# java path configuration variables added by webdev-setup-tools-java\n' + dataToWrite);
  }

  setup.sourceStartupScipt('.bash_profile', '.bashrc');
};

let findPathToJdk = () => {
  if (operatingSystem === 'darwin') { // mac automatically configures environment to use the jdk
    return Promise.resolve();
  }
  let examplePath = (windows) ? 'C:\\Program Files\\Java\\jdk1.8.0' : '/usr/local/jdk1.8.0';
  return setup.getVariablesWithPrompt([
      {
        display: 'Please enter the full path to the extracted jdk folder (example: ' + examplePath + '): ',
        var_name: 'jdkPath'
      }],
    jdkPath => {
      let javaCompiler = (windows) ? 'javac.exe' : 'javac';
      let validJdkPath = fs.existsSync(path.join(jdkPath,'bin', javaCompiler));
      if (!validJdkPath) {
        console.log('Failed to find jdk with the given path.');
      }
      return validJdkPath;
    })
    .then(jdkObj => Promise.resolve(jdkObj['jdkPath']));
};

let walkThroughjdkInstall = () => {
  return displayJavaPrompts(arrayOfPrompts)
    .then(() => findPathToJdk())
    .then(jdkPath => addJdkToSystemPath(jdkPath))
    .catch(error => {
      console.log('java jdk setup failed with the following message:\n' + error);
    });
};

// handle inconsistent version patterns from java compiler and convert to a standard semantic version format
// example: javac 1.8.0_151 => 8.0.151, javac 9.0.4 => 9.0.4
let getJavaVersion = (javaCompilerVersion) => {
  const javaCompilerVersionSplitter = /[^\d]+/;

  return javaCompilerVersion.trim()
    .split(javaCompilerVersionSplitter)
    .filter((element, index, array) => !isNaN(parseInt(element, 10)) && (index > 1 || array.length < 5))
    .join('.');
};

let installJava = (customJavaVersionRange) => {
  let javaOutputFormatting = {
    resolve: formatOutput.resolve,
    stderr: (resolve, reject, data) => { // by default the output is directed to stderr
      resolve(data);
    }
  };

  let parsedRange = semver.validRange(customJavaVersionRange || globalJavaVersionRange);
  if (!parsedRange) {
    return setup.endProcessWithMessage('incorrect format for java version range', 0, 0);
  }
  console.log('checking java version compatibility.');
  return setup.executeSystemCommand(setup.getSystemCommand('javac -version'), javaOutputFormatting) // important to test the java compiler not JRE
    .catch(() => 'javac 0.0.0')
    .then(javaCompilerVersion => {
      let formattedVersion = getJavaVersion(javaCompilerVersion);
      let version = formattedVersion.match(versionPattern);
      if (version && !semver.outside(version[0], parsedRange, '<')) {
        console.log('java version ' + version[0] + ' is up to date');
        return Promise.resolve();
      }
      console.log('no compatible jdk version found on this computer');
      return walkThroughjdkInstall();
    })
    .catch(error => {
      console.log('Jdk installation failed with the following message:\n' + error);
    });
};

module.exports = {
  installJava: installJava
};
