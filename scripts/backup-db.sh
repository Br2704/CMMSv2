#!/usr/bin/env sh
set -eu

: "${DB_HOST:?DB_HOST is required}"
: "${DB_PORT:?DB_PORT is required}"
: "${DB_USER:?DB_USER is required}"
: "${DB_PASSWORD:?DB_PASSWORD is required}"
: "${DB_NAME:?DB_NAME is required}"

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

export PGPASSWORD="$DB_PASSWORD"
RAW_FILE="$BACKUP_DIR/cmms-$TIMESTAMP.dump"
OUTPUT_FILE="$RAW_FILE"
pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" --format=custom --file "$RAW_FILE"

if [ "${BACKUP_ENCRYPTION_PASSPHRASE:-}" != "" ]; then
  openssl enc -aes-256-cbc -pbkdf2 -salt -in "$RAW_FILE" -out "$RAW_FILE.enc" -pass "pass:${BACKUP_ENCRYPTION_PASSPHRASE}"
  rm -f "$RAW_FILE"
  OUTPUT_FILE="$RAW_FILE.enc"
fi

find "$BACKUP_DIR" -type f \( -name 'cmms-*.dump' -o -name 'cmms-*.dump.enc' \) -mtime +"${BACKUP_RETENTION_DAYS:-14}" -delete
echo "Backup written to $OUTPUT_FILE"
