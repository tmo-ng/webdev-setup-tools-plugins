![T-Mobile](./documentation/images/T-Mobile-NextGen-Magenta-Tiny.png)

webdev-setup-tools-ruby
=======================

This is a plugin for [`webdev-setup-tools `](https://github.com/tmo-ng/webdev-setup-tools).

## Installing Npm Package

  npm install webdev-setup-tools-ruby --save

## Purpose
To automate installation and all required system configurations for the Ruby software package required by your project. To automate
Ruby Version Manager (RVM) installation and setup on OSX and Linux to support multiple Ruby versions on your system.

## Configuration

This plugin determines the packages to install from the "web-dev-setup-tools" field in the package.json your project root.
This field typically has the following syntax:


```sh
"web-dev-setup-tools": {
  "ruby": {
    "install": "^2.0.0",
    "gems": {
      // gems to install ...
    }
  },
  // other packages to install ...
}
```
## Usage

  Install ruby
  ```sh
  let setup_tools = require('webdev-setup-tools-ruby');
  setup_tools.installRuby();
  ```








### Important Notes For Windows Users
Due to built in Windows security features and restrictions, there are a number of additional steps that need to be taken by windows users.

[`webdev-setup-tools `](https://github.com/tmo-ng/webdev-setup-tools#readme)


## Release History

* 1.0.0 Initial release