![T-Mobile](./documentation/images/T-Mobile-NextGen-Magenta-Tiny.png)

webdev-setup-tools-aem
======================

This is a plugin for the [`webdev-setup-tools `](https://github.com/tmo-ng/webdev-setup-tools).
This plugin enables easy installation of aem packages as defined in your projects package.json.
## Installing Npm Package

  npm install webdev-setup-tools-aem --save
## Purpose
To automate installation and all required system configurations for Adobe AEM software package.

## Configuration

This plugin determines the packages to install from the "web-dev-setup-tools" field in the package.json your project root.
This field typically has the following syntax:


  ```sh
  "web-dev-setup-tools": {
      "aem": {
        "author": { // aem author file
          "aem6-author-p4009.jar": "https://sample.com/aem6-author-p4009.jar"
        },
        "license": { // aem license file
          "license.properties": "https://sample.com/license.properties"
        },
        "zip_files": { // content files to upload and install
          "acs-aem-2.12.0-min.zip": "https://github.com/acs-aem-2.12.0-min.zip",
          "AEM-2-6.1.SP2.zip": "https://sample.com/AEM-2-6.1.SP2.zip",
          "cq-6.1.0-sp2-cf-1.0.zip": "https://sample.com/cq-6.1.0-sp2-cf-1.0.zip",
          "BRT_content_07.zip": "https://sample.com/BRT_content_07.zip"
        },
        "aem_folder_path": "C:\" // where to install aem e.g. "C:\AEM"
        "download_path": "C:\Users\Mkay\Downloads\" // where to download content files
        "crx_endpoint": "http://<username>:<password>@localhost:<port>/crx/packmgr/service.jsp" // where to upload and install content files
        "mvn_config_path": "C:\myProject\content\" // path to maven settings file pom.xml
      }
      // other packages to install ...
    }
  ```

## Usage

  install aem packages
  ```sh
  let setup_tools = require('webdev-setup-tools-aem');
  setup_tools.installAem();
  ```








### Important Notes For Windows Users
Due to built in Windows security features and restrictions, there are a number of additional steps that need to be taken by windows users.

[`webdev-setup-tools `](https://github.com/tmo-ng/webdev-setup-tools#readme)





## Release History

* 1.0.0 Initial release