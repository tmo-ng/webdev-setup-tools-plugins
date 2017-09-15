![T-Mobile](./documentation/images/T-Mobile-NextGen-Magenta-Tiny.png)

webdev-setup-tools-maven
========================

This is a plugin for [`webdev-setup-tools `](https://github.com/tmo-ng/webdev-setup-tools).

## Installing Npm Package

  npm install webdev-setup-tools-maven --save

## Purpose
To automate installation and all required system configurations for the Apache Maven software project management and comprehension tool.

## Configuration

This plugin determines the packages to install from the "web-dev-setup-tools" field in the package.json your project root.
This field typically has the following syntax:


```sh
"web-dev-setup-tools": {
  "maven": "3.5.0",
  // other packages to install ...
}
```
## Usage

  Download, install, and configure maven for development
  ```sh
  let setup_tools = require('webdev-setup-tools-maven');
  setup_tools.installMaven();
  ```








### Important Notes For Windows Users
Due to built in Windows security features and restrictions, there are a number of additional steps that need to be taken by windows users.

[`webdev-setup-tools `](https://github.com/tmo-ng/webdev-setup-tools#readme)



## Release History

* 1.0.0 Initial release