#!/bin/bash

BUILD_DIR=".build"
PLUGIN_DIR="kibana-auth"
PLUGIN_BUILD_PPATH="${BUILD_DIR}/kibana"
PLUGIN_BUILD_SPATH="${PLUGIN_BUILD_PPATH}/${PLUGIN_DIR}"

PLUGIN_ZIP_FILENAME="kibana-auth-cira-"
KIBANA_VERSION=`cat ${PLUGIN_DIR}/package.json | jq ".kibana.version" | sed -e 's/^"//' -e 's/"$//'`
PLUGIN_VERSION=`cat ${PLUGIN_DIR}/package.json | jq ".version" | sed -e 's/^"//' -e 's/"$//'`

mkdir -p $PLUGIN_BUILD_PPATH
rm -rf $PLUGIN_BUILD_SPATH && cp $PLUGIN_DIR $PLUGIN_BUILD_SPATH -r
cd $BUILD_DIR && zip ${PLUGIN_ZIP_FILENAME}${KIBANA_VERSION}_${PLUGIN_VERSION}.zip kibana -r

