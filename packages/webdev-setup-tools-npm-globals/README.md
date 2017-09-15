![T-Mobile](./documentation/images/T-Mobile-NextGen-Magenta-Tiny.png)

webdev-setup-tools-npm-globals
======================

This is a plugin for [`webdev-setup-tools `](https://github.com/tmo-ng/webdev-setup-tools).
This plugin enables easy installation of nodejs global packages as defined in your projects package.json.

## Installing Npm Package

  npm install webdev-setup-tools-npm-globals --save

## Purpose
To automate both the installation and updates of global npm packages as required by your project. To manually install these packages with npm would typically take a separate installation command for each package in your project.
Additionally, to install the maximum compatible version of each module required by your project using semantic version ranges provided for each module.

## Configuration

This plugin determines the packages to install from the "web-dev-setup-tools" field in the package.json your project root.
This field typically has the following syntax:

```sh
"web-dev-setup-tools": {
    "node": {
      "install": ">=7.0.0",
      "globals": {
        "bower": "^1.0.0",
        "grunt-cli": "~1.0.0",
        "gulp": ">=3.9.1",
        "windows": {
          "windows-build-tools": "^1.2.0"
        },
        // other npm packages to install ...
      }
    },
    // other packages to install ...
  }
```
## Usage

  Install all required global npm modules
  ```sh
  let setup_tools = require('webdev-setup-tools-npm');
  setup_tools.installNpmGlobalPackages();
  ```








### Important Notes For Windows Users
Due to built in Windows security features and restrictions, there are a number of additional steps that need to be taken by windows users.
Please refer to the Important Notes For Windows Users section of [`webdev-setup-tools `](https://github.com/tmo-ng/webdev-setup-tools#readme) for more detailed instructions.



## Release History

* 1.0.0 Initial release