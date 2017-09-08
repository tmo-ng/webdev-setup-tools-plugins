webdev-setup-tools-aem
======================

This package is the aem installation plugin for webdev-setup-tools-core module.

## Installing Npm Package

  npm install webdev-setup-tools-aem --save
## Purpose
Often , the

## Configuration

This package should be installed in the
node modules folder located in the root of the project folder.
It determines the packages to install from the "web-dev-setup-tools" field in the package.json in the project root.
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
        "download_path": "C:\Users\Mkay\Downloads" // where to download content files
        "crx_endpoint": "http://<username>:<password>@localhost:<port>/crx/packmgr/service.jsp" // where to upload and install content files
        "mvn_config_path": "C:\myProject\content" // path to maven settings file pom.xml
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








### Important Notes

**Note:** In order to install this package, users will need to have administrative access on their computer.

**Note:** Users running Windows must have powershell script execution enabled. Powershell script execution
is disabled by default as a security feature on many windows distributions. Script execution policy
can either be set to "remotesigned" or "unrestricted", although it is recommended to set the
policy to "remotesigned" to maintain the highest level of security.

**Note:**  To view the current powershell execution policy for windows, copy and paste the following command in
a command prompt:

```sh
  powershell.exe -command "get-executionpolicy"
  ```

**Note:**  To view the set the powershell execution policy for windows, copy and paste the following command in
a command prompt:

```sh
  powershell.exe -command "set-executionpolicy remotesigned"
  ```

**Note:** Users running Windows 7 must upgrade to powershell 3.0 ([`Windows Management Framework 3.0`](https://www.microsoft.com/en-us/download/details.aspx?id=34595)).
By default, Windows 7 comes installed with powershell 2.0. Installation typically requires a system restart.
Users running windows 8 and above have all minimum powershell tools installed by default.

**Note:** .net framework version 4.5 or above is required for script execution on Windows.
This is a prerequisite for many modern software packages, but is not present on Windows 7
out of the box.


## Release History

* 1.0.0 Initial release