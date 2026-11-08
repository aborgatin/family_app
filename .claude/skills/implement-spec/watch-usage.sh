#!/bin/zsh
# Exits (notifying Claude) once 5-hour usage >= ${1:-70}%.
th=${1:-70}
while true; do
  out=$($0:h/usage.sh); u=${out%% *}
  [[ "$u" == <-> ]] && (( u >= th )) && { echo "THRESHOLD $out"; exit 0; }
  perl -e 'select(undef,undef,undef,120)'
done
