#!/bin/bash
set -euxo pipefail

cd /testbed
python3 -c "import flask; print('flask can be imported')"