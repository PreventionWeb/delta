#!/bin/sh
# Entrypoint for the Azure App Service image (Dockerfile.azure).
# Same startup as Dockerfile.prod: initialise/upgrade the database first and
# stop if that fails, then hand over to supervisord (app + sshd).
set -e

psql "$DATABASE_URL" -f ./dts_database/database_init_docker_prod.sql

exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
