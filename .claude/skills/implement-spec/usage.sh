#!/bin/zsh
# Prints: <five_hour utilization %> <resets_at ISO>
tok=$(security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null | /usr/bin/python3 -I -c 'import json,sys; print(json.load(sys.stdin)["claudeAiOauth"]["accessToken"])' 2>/dev/null)
[ -z "$tok" ] && { echo "ERR no-token"; exit 1; }
curl -s -m 10 https://api.anthropic.com/api/oauth/usage -H "Authorization: Bearer $tok" -H "anthropic-beta: oauth-2025-04-20" \
 | /usr/bin/python3 -I -c 'import json,sys; d=json.load(sys.stdin)["five_hour"]; print(int(d["utilization"]), d["resets_at"])'
