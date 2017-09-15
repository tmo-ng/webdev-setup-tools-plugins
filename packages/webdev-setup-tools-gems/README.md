![T-Mobile](./documentation/images/T-Mobile-NextGen-Magenta-Tiny.png)

webdev-setup-tools-gems
=======================

This package is the ruby gems installation plugin for webdev-setup-tools-core module.

## Installing Npm Package

  npm install webdev-setup-tools-gems --save

## Purpose
To automate both the installation and updates of ruby gems required by the current project. Additionally, to install the maximum compatible version of each gem required by the current project using semantic version ranges provided for each gem.

## Configuration

This package should be installed in the
node modules folder located in the root of the project folder.
It determines the packages to install from the "web-dev-setup-tools" property in the package.json in the project root.
This field typically has the following syntax:


```sh
"web-dev-setup-tools": {
    "ruby": {
      "install": "^2.0.0",
      "gems": {
        "sass":"^3.0.0",
        "json":"^2.0.0",
        // other gems to install ...
      }
    },
    // other packages to install ...
  }
```

## Usage

  install ruby gems
  ```sh
  let setup_tools = require('webdev-setup-tools-gems');
  setup_tools.installGems();
  ```








### Important Notes For Windows Users
Due to built in Windows security features and restrictions, there are a number of additional steps that need to be taken by windows users.

[`webdev-setup-tools `](https://github.com/tmo-ng/webdev-setup-tools#readme)



## Release History

* 1.0.0 Initial release