![T-Mobile](./documentation/images/T-Mobile-NextGen-Magenta-Tiny.png)

webdev-setup-tools-gems
=======================

This is a plugin for [`webdev-setup-tools `](https://github.com/tmo-ng/webdev-setup-tools).

## Installing Npm Package

  npm install webdev-setup-tools-gems --save

## Purpose
To automate both the installation and updates of ruby gems required by your project. Additionally, to install the maximum compatible version of each gem required by your project using semantic version ranges provided for each gem.

## Configuration

This plugin determines the packages to install from the "web-dev-setup-tools" field in the package.json your project root.
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
Please refer to the Important Notes For Windows Users section of [`webdev-setup-tools `](https://github.com/tmo-ng/webdev-setup-tools#readme) for more detailed instructions.



## Release History

* 1.0.0 Initial release