/**
 * Created by CDejarl1 on 8/30/2017.
 */
const setup = require('webdev-setup-tools');
const os = require('os');

const operatingSystem = os.platform().trim();
const formatOutput = setup.getOutputOptions();
const npmProjectGlobals = setup.getProjectGlobals('node').globals;
const windowsProjectGlobals = npmProjectGlobals.windows;
delete npmProjectGlobals.windows;

let installGlobalNpmDependencies = () => {

  let userState = {};
  let findVersion = (dependency, projectGlobals) => {
    let getNpmPackageVersions = setup.getSystemCommand('npm info ' + dependency + ' versions --json --registry=https://registry.npmjs.org/');
    return setup.findHighestCompatibleVersion(dependency, projectGlobals, getNpmPackageVersions);
  };
  let getGlobals = modules => {
    let npmPackageNamePattern = /([@a-z-A-Z/.0-9_]+)@([0-9]+(?:\.[0-9-a-z]+)+)/g;
    return setup.getAllUserGlobals(modules, npmPackageNamePattern);
  };
  let npmListUserGlobals = setup.getSystemCommand('npm ls -g');
  let npmInstallModuleAsGlobal = 'npm install -g';
  console.log('gettling installed node modules.');
  return setup.findUserGlobals(npmListUserGlobals, getGlobals)
    .catch(error => { // this will catch if the user has unmet dependencies on existing npm packages
      console.error('Failed to find npm globals with the following error:\n', error);
      process.exit(0);
    })
    .then(userGlobals => {
      userState.userGlobals = userGlobals;
      if (operatingSystem === 'win32' && windowsProjectGlobals) {
        userState.windows = {};
        return setup.runListOfPromises(windowsProjectGlobals, findVersion)
          .then(windowsRemotePackages => {
            let windowsUpdates = setup.findRequiredAndOptionalUpdates(userState.userGlobals, windowsProjectGlobals, windowsRemotePackages);
            userState.windows.required = windowsUpdates.required;
            userState.windows.optional = windowsUpdates.optional;
            if (userState.windows.required.length > 0) {
              console.log('installing required windows packages.');
              return setup.executeSystemCommand(setup.getSystemCommand(setup.getInstallationCommand(userState.windows.required, npmInstallModuleAsGlobal, '@')), { resolve: formatOutput.resolve });
            }
          })
      }
    })
    .then(() => setup.runListOfPromises(npmProjectGlobals, findVersion))
    .then(npmRemotePackages => {
      userState.npm = {};
      let npmUpdates = setup.findRequiredAndOptionalUpdates(userState.userGlobals, npmProjectGlobals, npmRemotePackages);
      userState.npm.required = npmUpdates.required;
      userState.npm.optional = npmUpdates.optional;
      if (userState.npm.required.length > 0) {
        console.log('installing required npm packages.');
        return setup.executeSystemCommand(setup.getSystemCommand(setup.getInstallationCommand(userState.npm.required, npmInstallModuleAsGlobal, '@')), formatOutput);
      }
    })
    .then(() => {
      if (userState.windows && userState.windows.optional.length > 0) {
        console.log('windows updates exist for the following packages: ');
        setup.listOptionals(userState.windows.optional);
        return setup.confirmOptionalInstallation('do you want to install these optional windows updates now (y/n)? ',
          () => setup.executeSystemCommand(setup.getSystemCommand(setup.getInstallationCommand(userState.windows.optional, npmInstallModuleAsGlobal, '@')), formatOutput));
      }

    })
    .then(() => {
      if (userState.npm.optional.length > 0) {
        console.log('npm updates exist for the following packages: ');
        setup.listOptionals(userState.npm.optional);
        return setup.confirmOptionalInstallation('do you want to install these optional npm updates now (y/n)? ',
          () => setup.executeSystemCommand(setup.getSystemCommand(setup.getInstallationCommand(userState.npm.optional, npmInstallModuleAsGlobal, '@')), formatOutput));
      }
    })
    .then(() => {
      console.log('all npm packages are up to date.');
      return userState;
    })
    .catch(error => {
      console.error('Failed to install npm packages with the following message:\n', error);
      process.exit(0);
    });
};

module.exports = {
  installNpmGlobalPackages: installGlobalNpmDependencies
};