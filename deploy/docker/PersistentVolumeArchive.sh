#!/bin/sh
set -eu

volumes='workspaces test-jobs release-packages staging-releases production-releases module-packages caddy-data caddy-config'

case "${PERSISTENT_VOLUME_MODE:-backup}" in
  backup)
    retention="${VOLUME_BACKUP_RETENTION_DAYS:-30}"
    case "$retention" in ''|*[!0-9]*|0) echo 'VOLUME_BACKUP_RETENTION_DAYS must be a positive integer.' >&2; exit 1;; esac
    if [ "$retention" -gt 3650 ]; then echo 'VOLUME_BACKUP_RETENTION_DAYS cannot exceed 3650.' >&2; exit 1; fi
    if find /volumes -type l -print -quit | grep -q .; then
      echo 'Refusing volume archive: a mounted data volume contains a symbolic link.' >&2
      exit 1
    fi
    stamp="$(date -u +%Y%m%dT%H%M%SZ)-$$"
    archive="nexora-volumes-$stamp.tar.gz"
    temporary="/backups/$archive.partial"
    tar -czpf "$temporary" -C /volumes $volumes
    mv "$temporary" "/backups/$archive"
    (cd /backups && sha256sum "$archive" > "$archive.sha256.partial")
    mv "/backups/$archive.sha256.partial" "/backups/$archive.sha256"
    find /backups -maxdepth 1 -type f -name 'nexora-volumes-*' -mtime "+$retention" -delete
    echo "Created /backups/$archive"
    ;;
  restore)
    archive="${PERSISTENT_VOLUME_ARCHIVE:-}"
    case "$archive" in nexora-volumes-????????T??????Z-*.tar.gz) ;; *) echo 'Invalid archive name.' >&2; exit 1;; esac
    test -f "/backups/$archive" && test -f "/backups/$archive.sha256"
    (cd /backups && sha256sum -c "$archive.sha256")
    tar -tzf "/backups/$archive" > /tmp/archive-list
    awk '
      BEGIN { ok["workspaces"]=1; ok["test-jobs"]=1; ok["release-packages"]=1; ok["staging-releases"]=1; ok["production-releases"]=1; ok["module-packages"]=1; ok["caddy-data"]=1; ok["caddy-config"]=1 }
      { p=$0; sub(/^\.\//,"",p); if (p ~ /^\// || p ~ /(^|\/)\.\.(\/|$)/) exit 1; split(p,a,"/"); if (!(a[1] in ok)) exit 1 }
    ' /tmp/archive-list
    tar -tvzf "/backups/$archive" > /tmp/archive-verbose-list
    awk 'substr($0,1,1) == "l" || substr($0,1,1) == "h" { exit 1 }' /tmp/archive-verbose-list
    for name in $volumes; do
      find "/volumes/$name" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} \;
    done
    tar -xzpf "/backups/$archive" -C /volumes
    echo "Restored /backups/$archive"
    ;;
  *) echo 'PERSISTENT_VOLUME_MODE must be backup or restore.' >&2; exit 1;;
esac
