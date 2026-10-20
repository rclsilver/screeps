#!/usr/bin/env bash
set -euo pipefail
# Parse only the two allowed values; never execute or source the credentials file.
repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
credentials_file=${SCREEPS_CREDENTIALS_FILE:-"$repo_dir/.env"}
api_url=https://screeps.betrancourt.net
api_token=''
server_password=''
if [[ ! -r "$credentials_file" ]]; then
  printf 'Fichier privé introuvable : %s\n' "$credentials_file" >&2
  exit 1
fi
while IFS= read -r line || [[ -n "$line" ]]; do
  line=${line%$'\r'}
  if [[ "$line" =~ ^[[:space:]]*(export[[:space:]]+)?(TOKEN|SERVER_PASSWORD)[[:space:]]*=[[:space:]]*(.*)$ ]]; then
    key=${BASH_REMATCH[2]}
    value=${BASH_REMATCH[3]}
    value=$(printf '%s' "$value" | sed 's/[[:space:]]*$//')
    if [[ "$value" == \"*\" || "$value" == \'*\' ]]; then value=${value:1:${#value}-2}; fi
    if [[ "$key" == TOKEN ]]; then api_token=$value; else server_password=$value; fi
  fi
done < "$credentials_file"
if [[ -z "$api_token" || -z "$server_password" || "$api_token$server_password" == *$'\r'* || "$api_token$server_password" == *$'\n'* ]]; then
  printf 'TOKEN et SERVER_PASSWORD doivent être présents sur une seule ligne chacun.\n' >&2
  exit 1
fi
get() {
  # Headers go through stdin, keeping secrets out of process arguments and logs.
  printf 'X-Token: %s\nX-Server-Password: %s\n' "$api_token" "$server_password" |
    curl --silent --show-error --fail --connect-timeout 10 --max-time 30 --header @- "$api_url$1" |
    jq -e 'if .error or (has("ok") and .ok != 1) then error("L’API Screeps a refusé la requête : " + (.error // "réponse invalide")) else . end'
}
case "${1:-inspect}" in
  inspect)
    get /api/auth/me | jq '{ok, _id, username, cpu, gcl}'
    get /api/user/branches | jq '{ok, list: [.list[] | {branch, activeWorld, activeSim, modules: (.modules | keys)}]}'
    ;;
  code) get '/api/user/code?branch=default' ;;
  room) get "/api/game/room-objects?room=${2:-W2N2}" ;;
  memory)
    data=$(get /api/user/memory | jq -r '.data')
    if [[ "$data" == gz:* ]]; then printf '%s' "${data#gz:}" | base64 --decode | gzip --decompress
    else printf '%s\n' "$data"; fi
    ;;
  terrain) get "/api/game/room-terrain?room=${2:-W2N2}&encoded=1" ;;
  *) printf 'Usage : bash scripts/api.sh {inspect|code|room [W2N2]|memory|terrain [W2N2]}\n' >&2; exit 2 ;;
esac
