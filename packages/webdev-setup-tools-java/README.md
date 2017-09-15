![T-Mobile](./documentation/images/T-Mobile-NextGen-Magenta-Tiny.png)

webdev-setup-tools-java
=======================

This is a plugin for [`webdev-setup-tools `](https://github.com/tmo-ng/webdev-setup-tools).

## Installing Npm Package

  npm install webdev-setup-tools-java --save

## Purpose
To provide step by step instructions for installing and configuring the official Oracle Java JDK that is used for Java development. This includes system path modification and environment variable setup on Windows 7+, OSX, and Linux.


## Configuration

This package should be installed in the
node modules folder located in the root of the project folder.
It determines the packages to install from the "web-dev-setup-tools" field in the package.json in the project root.
This field typically has the following syntax:


```sh
"web-dev-setup-tools": {
  "java": ">1.7.0"
  // other packages to install ...
}
```

## Usage

  walk through steps to download, install, and setup the official Oracle java jdk
  ```sh
  let setup_tools = require('webdev-setup-tools-java');
  setup_tools.installJava();
  ```








### Important Notes For Windows Users
Due to built in Windows security features and restrictions, there are a number of additional steps that need to be taken by windows users.

[`webdev-setup-tools `](https://github.com/tmo-ng/webdev-setup-tools#readme)



## Release History

* 1.0.0 Initial release