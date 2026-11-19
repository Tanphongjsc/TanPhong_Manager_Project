# syntax=docker/dockerfile:1.7
#
# Một image chạy cả 3 phần mềm Tân Phong sau một cổng nginx:
#   /            -> Phần mềm lương + Dịch vụ nhà xưởng (repo này)
#   /co/         -> CO-Manager
#   /tinh-gia/   -> Tính giá thành
#
# Render: Runtime = Docker, Dockerfile Path = deploy/Dockerfile, Docker Build Context = .
# Biến build (Render tự truyền biến môi trường thành build arg):
#   CO_GIT_REF, TINHGIA_GIT_REF  = commit SHA (hoặc tên nhánh) cần triển khai
# Secret File trên Render: github_token  (GitHub token chỉ đọc 2 repo CO và Tính giá)
#
# Build thử trên máy với code local (không cần token), xem deploy/README.txt:
#   docker build -f deploy/Dockerfile --build-context co-src=<thư mục CO> \
#     --build-context tinhgia-src=<thư mục Tính giá> -t tanphong .

ARG PYTHON_IMAGE=python:3.11.5-slim-bookworm
ARG NODE_IMAGE=node:24-bookworm-slim

# ---------- 1. Lấy code CO + Tính giá từ GitHub, ghim theo commit ----------
FROM debian:bookworm-slim AS fetch
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*
ARG CO_GIT_REF
ARG TINHGIA_GIT_REF
ARG CO_REPO=github.com/Tanphongjsc/CO-Manager.git
ARG TINHGIA_REPO=github.com/Tanphongjsc/TanPhong_Hethongtinhgia.git
# Token chỉ được mount trong bước này, không nằm trong layer nào của image.
RUN --mount=type=secret,id=github_token,required=true \
    set -eu; \
    test -n "${CO_GIT_REF}" || { echo "Thiếu CO_GIT_REF"; exit 1; }; \
    test -n "${TINHGIA_GIT_REF}" || { echo "Thiếu TINHGIA_GIT_REF"; exit 1; }; \
    TOKEN="$(tr -d '\r\n' < /run/secrets/github_token)"; \
    fetch_repo() { \
      mkdir -p "$1"; git -C "$1" init -q; \
      git -C "$1" fetch -q --depth 1 "https://x-access-token:${TOKEN}@$2" "$3"; \
      git -C "$1" checkout -q FETCH_HEAD; \
      echo "$2 @ $(git -C "$1" rev-parse HEAD)"; \
      rm -rf "$1/.git"; \
    }; \
    fetch_repo /out/co "${CO_REPO}" "${CO_GIT_REF}"; \
    fetch_repo /out/tinhgia "${TINHGIA_REPO}" "${TINHGIA_GIT_REF}"

# Hai stage này có thể thay bằng thư mục local qua --build-context khi chạy thử.
FROM scratch AS co-src
COPY --from=fetch /out/co /

FROM scratch AS tinhgia-src
COPY --from=fetch /out/tinhgia /

# ---------- 2. Build CSS/vendor bằng Node ----------
FROM ${NODE_IMAGE} AS assets
WORKDIR /src/tinhgia
COPY --from=tinhgia-src /package.json /package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY --from=tinhgia-src / ./
RUN npm run build

WORKDIR /src/hrm
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . ./
RUN npm run build:css

# ---------- 3. Cài thư viện Python (3 môi trường riêng) ----------
FROM ${PYTHON_IMAGE} AS pydeps
ENV PIP_DISABLE_PIP_VERSION_CHECK=1 PIP_NO_CACHE_DIR=1
RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential libpq-dev \
 && rm -rf /var/lib/apt/lists/*
COPY requirements.txt /req/hrm/requirements.txt
RUN python -m venv /opt/venv/hrm && /opt/venv/hrm/bin/pip install -r /req/hrm/requirements.txt
COPY --from=co-src /requirements.txt /req/co/requirements.txt
RUN python -m venv /opt/venv/co && /opt/venv/co/bin/pip install -r /req/co/requirements.txt gunicorn==23.0.0
COPY --from=tinhgia-src /requirements.txt /requirements-production.txt /requirements-render.txt /req/tinhgia/
RUN python -m venv /opt/venv/tinhgia && /opt/venv/tinhgia/bin/pip install -r /req/tinhgia/requirements-render.txt

# ---------- 4. Image chạy ----------
FROM ${PYTHON_IMAGE}
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PORT=10000
RUN apt-get update \
 && apt-get install -y --no-install-recommends nginx supervisor gettext-base libpq5 \
 && rm -rf /var/lib/apt/lists/* /etc/nginx/sites-enabled/default

COPY --from=pydeps /opt/venv /opt/venv
COPY --from=assets /src/hrm /app/hrm
COPY --from=co-src / /app/co
COPY --from=assets /src/tinhgia /app/tinhgia
RUN rm -rf /app/hrm/node_modules /app/tinhgia/node_modules

# Gom static lúc build (không cần DB, không cần secret).
# Tính giá: settings production kiểm tra cấu hình nên dùng giá trị giả CHỈ cho bước này;
# lúc chạy thật, các biến TINHGIA_* trên Render được dùng.
RUN cd /app/hrm && /opt/venv/hrm/bin/python manage.py collectstatic --no-input --clear \
 && cd /app/co/CO_Manager \
 && DEBUG=False STATIC_URL=/co/static/ /opt/venv/co/bin/python manage.py collectstatic --no-input --clear \
 && cd /app/tinhgia \
 && env -i PATH="$PATH" HOME=/tmp \
      APP_ENV=production DJANGO_SETTINGS_MODULE=config.production APP_TRANSPORT=render_https \
      RENDER=true RENDER_EXTERNAL_HOSTNAME=build.onrender.com \
      DJANGO_SECRET_KEY=build-only-collectstatic-key-0123456789-abcdefghijklmnopqrstuvwxyz \
      DATABASE_URL=postgresql://build:build@localhost:5432/build \
      DJANGO_STATIC_URL=/tinh-gia/static/ DJANGO_STATIC_ROOT=/app/tinhgia/staticfiles \
      /opt/venv/tinhgia/bin/python manage.py collectstatic --no-input --clear \
 && chmod +x /app/hrm/deploy/start.sh

EXPOSE 10000
CMD ["/app/hrm/deploy/start.sh"]
