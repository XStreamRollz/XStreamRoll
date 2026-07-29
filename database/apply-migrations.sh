#!/bin/sh
# Applies every migrations/*.up.sql in filename order. Migrations use
# CREATE ... IF NOT EXISTS / ADD COLUMN IF NOT EXISTS so re-running them
# against a DB already created from schema.sql is safe.
set -e

for f in /migrations/*.up.sql; do
  echo "Applying migration: $f"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f "$f"
done
