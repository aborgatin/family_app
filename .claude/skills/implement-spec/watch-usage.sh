#!/bin/zsh
# Exits (notifying Claude) once 5-hour usage >= ${1:-70}%. Reads the endpoint every 5 minutes and
# leaves the reading in usage.sh's cache, so the pre-spawn checks don't call it again.
th=${1:-70}
while true; do
  out=$($0:h/usage.sh --refresh); u=${out%% *}
  [[ "$u" == <-> ]] && (( u >= th )) && { echo "THRESHOLD $out"; exit 0; }
  perl -e 'select(undef,undef,undef,300)'
done
