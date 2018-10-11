#!/usr/bin/env bash
#load nvm into current environment
function load_nvm_script () {
  #this assumes the recommended installation directory of ~/.nvm
    if [ -e "$HOME/.nvm" ]; then
        export NVM_DIR="$HOME/.nvm"
        [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    fi

}
function get_local_node_version () {
    currentVersion=$(nvm current 2> /dev/null | grep -o -E '[0-9]+(\.[0-9]+){1,}')
    echo "$currentVersion"
}
function get_local_nvm_version () {
    currentVersion=$(nvm --version 2> /dev/null | grep -o -E '[0-9]+(\.[0-9]+){1,}')
    echo "$currentVersion"
}

function get_max_compatible_node () {
    latestVersion=$(node -e "require('webdev-setup-tools').getMaxNodeVersion().then((version) => {console.log(version.trim())})")
    echo "$latestVersion"
}
function get_highest_local_node () {
   latestVersionLocal=$(nvm list | head -n 1 | grep -o -E '[0-9]+(\.[0-9]+){1,}')
   echo "$latestVersionLocal"
}
#install and use node version
function install_node_version () {
    #install latest version, and migrate npm to new version
    latestVersion=$(get_max_compatible_node)
    if nvm install $latestVersion
    then
        nvm alias default $latestVersion
        nvm use $latestVersion


    else
        echo "install failed for node"
        exit
    fi
}
function perform_optional_update () {
    localVersion=$1
    latestVersion=$2
    if [[ $localVersion != ${latestVersion:1} ]]; then
        echo -n "would you like to update node now(y/n)? "
        read response
        if [[ $response != "n" ]]; then
            echo "updating node now.."
            nvm install $latestVersion
            nvm alias default $latestVersion
            nvm use $latestVersion

        else
            echo "ignoring node update"
        fi
    else
        echo "local node version $localVersion is up to date"
    fi
}
function local_is_compatible () {
    localVersion=$1
    isCompatible=$(node -e "console.log(require('webdev-setup-tools').isLocalNodeCompatible('$1'))")
    echo "$isCompatible"
}
#install dependencies required by setup.js
function install_package_dependencies () {
    if cd ../../; then
        npm install
    fi
}
function install_node_lts () {
    nvm install --lts
    latestVersion=$(get_highest_local_node)
    nvm alias default $latestVersion
    nvm use $latestVersion
    load_nvm_script

    #need to install to verify lts satisfies required version
    if [[ $1 != "--no-install" ]]; then
        echo "now installing required package dependencies"
        install_package_dependencies
    fi

    if [[ $(local_is_compatible $latestVersion) == "false" ]]; then
        echo "local version of node is not compatible with this project"
        install_node_version
    fi

}
function install_nvm () {
    LOCAL_VERSION=$(get_local_nvm_version)
    if [ -z "$LOCAL_VERSION" ]; then
        echo "no version of nvm detected detected, installing now"
        if curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.33.0/install.sh | bash
        then
            echo "successfully installed nvm"
        else
            echo "failed to install nvm"
            exit
        fi
    fi
}

function main () {
    if [[ ! -e ~/.bash_profile ]]; then
        > ~/.bash_profile
    fi
    if [[ ! -e ~/.bashrc ]]; then
        > ~/.bashrc
    fi
    load_nvm_script
    LOCAL_VERSION=$(get_local_node_version)
    if [ -z "$LOCAL_VERSION" ]; then
        echo "no version of node detected, installing now"
        install_nvm
        load_nvm_script
        install_node_lts $1
    else
        if [[ $1 != "--no-install" ]]; then
            echo "now installing required package dependencies"
            install_package_dependencies
        else
            cd ../../
        fi
        #check here for compatibility
        echo "you are currently using node version $LOCAL_VERSION"
        if [[ $(local_is_compatible $LOCAL_VERSION) == "false" ]]; then
            echo "local version of node is out of date, updating now."
            install_node_version
            nvm reinstall-packages $LOCAL_VERSION
        else
            REMOTE_VERSION=$(get_max_compatible_node)
            echo "the latest version available is $REMOTE_VERSION"
            perform_optional_update $LOCAL_VERSION $REMOTE_VERSION
        fi
    fi
    #update to newest version in current shell

    load_nvm_script

    echo "beginning full install"
    bash -l -c "cd ./tools/setup && node ./setup.js"
}
main $1
