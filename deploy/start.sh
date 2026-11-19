#!/bin/sh
# Điểm khởi động container: dựng cấu hình nginx theo $PORT rồi giao cho supervisord.
# Không chạy migrate ở đây: migrate của phần mềm lương chạy ở Pre-Deploy Command của Render.
set -eu

: "${PORT:=10000}"
export PORT

envsubst '${PORT}' < /app/hrm/deploy/nginx.conf.template > /etc/nginx/nginx.conf
nginx -t -q

exec /usr/bin/supervisord -c /app/hrm/deploy/supervisord.conf
