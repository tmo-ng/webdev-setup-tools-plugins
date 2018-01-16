/**
 * Created by CDejarl1 on 8/30/2017.
 */
const setup = require('webdev-setup-tools');
const semver = require('semver');
const os = require('os');
const operatingSystem = os.platform().trim();
const windows = (operatingSystem === 'win32');
const formatOutput = setup.getOutputOptions();
const versionPattern = /([0-9]+(?:\.[0-9]+)+)/g;
const requiredJavaVersion = setup.getProjectGlobals('java');


let walkThroughjdkInstall = () => {
  return setup.displayUserPrompt('This prompt will walk you through\nthe installation and setup of the official oracle java jdk.' +
    '\nWhen a step has been completed, press enter to continue to the next step.\nPlease press enter to begin.')
    .then(() => setup.displayUserPrompt('go to the url http://www.oracle.com/technetwork/java/javase/downloads'))
    .then(() => setup.displayUserPrompt('click on the jdk download link to be redirected to the download page for all systems.'))
    .then(() => setup.displayUserPrompt('accept the license agreement, then download the version matching your operating system.' +
      '\nFor most Apple OSX configurations, this auto configures your path, so you can ignore the subsequent steps.'))
    .then(() => {
      if (windows) {
        return setup.displayUserPrompt('accept the default path and tools for your new java installation.');
      }
    })
    .then(() => setup.displayUserPrompt('after the download, you will need to first unzip this folder,\nthen add this location to your system path.'))
    .then(() => {
      let displayPrompt = (windows) ? 'type "environment variables" into your start button menu or search bar and click enter.' : 'press ctrl + alt + t to launch a terminal';
      return setup.displayUserPrompt(displayPrompt);
    })
    .then(() => {
      let displayPrompt = (windows) ? 'click on the "environment variables" button near the bottom.' : 'type nano (or your text editor of choice) ~/.bash_profile';
      return setup.displayUserPrompt(displayPrompt);
    })
    .then(() => {
      let displayPrompt = (windows) ? 'in the lower window marked "system variables" you should see a variable marked "Path".\nClick on this value to modify it.' :
        'Scroll to the end of the file. If java has not been added to your environment, you can add it with the followind:\nJAVA_HOME=/usr/lib/jvm/{your java version here}\nexport JAVA_HOME\nSave the file and exit. ' +
        'reload the system path by pressing . /etc/environment or close the terminal.';
      return setup.displayUserPrompt(displayPrompt);
    })
    .then(() => {
      if (windows) {
        return setup.displayUserPrompt('click on the button labeled "New", or double click on "Path"');
      }
    })
    .then(() => {
      if (windows) {
        return setup.displayUserPrompt('paste the path to your java sdk in this box. typically, this path is of ' +
          'the form\nC:\\Program Files\\Java\\jdk1.8.0_141\\bin, but this is unique to each installation.');
      }
    })
    .then(() => {
      if (windows) {
        return setup.displayUserPrompt('Next, you will need to add a System Variable for "JAVA_HOME".\nClick new under the box for system variables.\nA box should pop up with values ' +
          'for the variable name and the value. Enter "JAVA_HOME" as the name.\nFor the value, Enter "C:\\Program Files\\Java\\jdk1.8.0_141", but this is unique to each installation.');
      }
    })
    .then(() => {
      return setup.displayUserPrompt('open a new terminal then type "javac -version".\nIf this was done correctly, you should see output like "javac 1.8.0_141".');
    })
    .then(() => {
      return setup.displayUserPrompt('This concludes the java jdk setup.');
    })
    .catch(error => {
      console.log('java jdk setup failed with the following message:\n' + error);
    });
};

let installJava = () => {
  let javaOutputFormatting = {
    resolve: formatOutput.resolve,
    stderr: (resolve, reject, data) => { // by default the output is directed to stderr
      resolve(data);
    }
  };
  let checkJavaCompilerVersion = setup.getSystemCommand('javac -version'); // important to test the java compiler

  console.log('checking java version compatibility.');
  return setup.executeSystemCommand(checkJavaCompilerVersion, javaOutputFormatting)
    .catch(() => { //java commands are redirected to stderr in both windows and linux environments
      console.log('no jdk version found in this computers System Path.');
      return walkThroughjdkInstall();
    })
    .then(javaVersion => {
      if (javaVersion) {
        let version = javaVersion.match(versionPattern);
        if (version && !semver.outside(version[0], requiredJavaVersion, '<')) {
          console.log('java version ' + version[0] + ' is up to date');
          return;
        }
        console.log('no compatible jdk version found on this computer');
        return walkThroughjdkInstall();
      }
    })
    .catch(error => {
      console.log('Jdk installation failed with the following message:\n' + error);
    });
};


module.exports = {
  installJava: installJava
};