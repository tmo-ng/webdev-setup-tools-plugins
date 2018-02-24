/**
 * Created by CDejarl1 on 9/11/2017.
 */
const setup = require('webdev-setup-tools');
const ruby = require('webdev-setup-tools-ruby');
const npm = require('webdev-setup-tools-npm-globals');
const maven = require('webdev-setup-tools-maven');
const aem = require('webdev-setup-tools-aem');
const gems = require('webdev-setup-tools-gems');
const java = require('webdev-setup-tools-java');
const seconds = 1000;
let fullInstall = () => {
  ruby.installRuby()
    .then(() => gems.installGems())
    .then(() => npm.installNpmGlobalPackages())
    .then(() => java.installJava())
    .then(() => maven.installMaven())
    .then(() => aem.installAem([{
        display: 'What is the path to the pom.xml (example: ~/project)? ',
        var_name: 'mvn_config_dir'
      },
      {
        display: 'Where you would like to download AEM content files ',
        var_name: 'download_path_dir'
      },
      {
        display: 'Where would you like AEM to be installed ',
        var_name: 'aem_install_dir'
      }
    ]))
    .then(() => setup.endProcessWithMessage('You are now ready to begin development.'
      , 5 * seconds, 0));
};
fullInstall();