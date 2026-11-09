#!/bin/zsh
# Prints: <five_hour utilization %> <resets_at ISO> [stale]
# Reads the usage endpoint at most once per 5 minutes: a reading younger than that comes from the
# cache. `--refresh` always asks (the watcher). When the endpoint fails (rate limit, no JSON), prints
# the cached reading with `stale`, or `ERR rate-limited` when there is none.
cache=${USAGE_CACHE:-${XDG_CACHE_HOME:-$HOME/.cache}/family-app/usage}
max_age=300
now=$(date +%s)

if [[ "$1" != --refresh && -r $cache ]]; then
  read -r util resets at <$cache
  (( now - at < max_age )) && { echo "$util $resets"; exit 0; }
fi

tok=$(security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null | /usr/bin/python3 -I -c 'import json,sys; print(json.load(sys.stdin)["claudeAiOauth"]["accessToken"])' 2>/dev/null)
[ -z "$tok" ] && { echo "ERR no-token"; exit 1; }
reading=$(curl -s -m 10 ${USAGE_URL:-https://api.anthropic.com/api/oauth/usage} -H "Authorization: Bearer $tok" -H "anthropic-beta: oauth-2025-04-20" \
 | /usr/bin/python3 -I -c 'import json,sys; d=json.load(sys.stdin)["five_hour"]; print(int(d["utilization"]), d["resets_at"])' 2>/dev/null)

if [[ -n $reading ]]; then
  mkdir -p ${cache:h} && echo "$reading $now" >$cache
  echo "$reading"
elif [[ -r $cache ]]; then
  read -r util resets at <$cache
  echo "$util $resets stale"
else
  echo "ERR rate-limited"; exit 1
fi
