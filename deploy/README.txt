TRIỂN KHAI GỘP 3 PHẦN MỀM TÂN PHONG VỀ MỘT SERVICE RENDER
==========================================================

Một container Docker chạy:
  nginx ($PORT=10000)  -> cổng vào duy nhất
  Phần mềm lương       -> 127.0.0.1:8101   đường dẫn /, /hrm/, /dashboard/, /dichvudiennuoc/, /accounts/
  CO-Manager           -> 127.0.0.1:8102   đường dẫn /co/
  Tính giá thành       -> 127.0.0.1:8103   đường dẫn /tinh-gia/
supervisord giữ cả 4 tiến trình luôn chạy.

Trước khi vào /co/ hoặc /tinh-gia/, nginx hỏi phần mềm lương (/gateway/auth/<app>/):
  chưa đăng nhập -> chuyển sang /accounts/login/?next=...
  không có quyền -> trang 403
Quyền: access_control.view_co, access_control.view_tinh_gia (tự tạo khi chạy migrate,
cấp cho nhóm/người dùng trong /admin/ như các quyền HRM khác). Superuser thấy tất cả.

Các file
--------
  Dockerfile           build image (lấy code CO + Tính giá từ GitHub theo commit SHA)
  nginx.conf.template  cấu hình cổng; start.sh thay ${PORT}
  supervisord.conf     4 tiến trình
  with_env.py          lọc biến môi trường theo tiền tố CO_ / TINHGIA_
  start.sh             lệnh khởi động container

Cấu hình service Render (Settings)
----------------------------------
  Runtime                 Docker
  Dockerfile Path         deploy/Dockerfile
  Docker Build Context    .
  Docker Command          (để trống, dùng CMD của image)
  Pre-Deploy Command      sh -c "cd /app/hrm && /opt/venv/hrm/bin/python manage.py migrate --no-input"
  Health Check Path       /health/
  Secret File             github_token  = GitHub fine-grained token, quyền Contents: Read-only
                                          trên 2 repo Tanphongjsc/CO-Manager và Tanphongjsc/TanPhong_Hethongtinhgia

Biến môi trường
---------------
Phần mềm lương: GIỮ NGUYÊN các biến hiện có (user, password, host, port, dbname, DB_SCHEMA,
SECRET_KEY, DEBUG, ALLOWED_HOSTS, CSRF_TRUSTED_ORIGINS, REDIS_CACHE_URL, CELERY_*...).
Không đặt PORTAL_CO_URL / PORTAL_TINHGIA_URL (mặc định /co/ và /tinh-gia/).

Phiên bản code CO / Tính giá:
  CO_GIT_REF        commit SHA của repo CO-Manager cần chạy
  TINHGIA_GIT_REF   commit SHA của repo TanPhong_Hethongtinhgia cần chạy

CO (tiền tố CO_, chép giá trị từ service CO cũ):
  CO_user, CO_password, CO_host, CO_port, CO_dbname
  CO_cloudify_user, CO_cloudify_password
  CO_SECRET_KEY            khóa ngẫu nhiên mới
  CO_DEBUG                 False
  CO_ALLOWED_HOSTS         tanphong-manager-project-ydbo.onrender.com
  CO_CSRF_TRUSTED_ORIGINS  https://tanphong-manager-project-ydbo.onrender.com

Tính giá (tiền tố TINHGIA_, chép toàn bộ biến của service Tính giá cũ rồi thêm tiền tố), ví dụ:
  TINHGIA_APP_TRANSPORT=render_https
  TINHGIA_DJANGO_SECRET_KEY, TINHGIA_DATABASE_URL, TINHGIA_DB_SSLMODE, TINHGIA_APP_MODE ...
  TINHGIA_WEB_CONCURRENCY=1, TINHGIA_GUNICORN_THREADS=4
Không cần đặt: SCRIPT_NAME, PORT, APP_ENV, DJANGO_SETTINGS_MODULE, DJANGO_STATIC_URL,
DJANGO_STATIC_ROOT (supervisord.conf đã đặt sẵn). Render tự cấp RENDER và
RENDER_EXTERNAL_HOSTNAME; with_env.py truyền 2 biến này cho Tính giá.

Cập nhật về sau
---------------
  Sửa phần mềm lương: push như hiện nay, Render tự deploy.
  Sửa CO / Tính giá : push repo đó, lấy commit SHA mới, đặt vào CO_GIT_REF / TINHGIA_GIT_REF
                      trên Render rồi chọn "Save, rebuild and deploy".
  Quay lui CO / Tính giá: đặt lại SHA cũ và deploy.

Chạy thử trên máy (Docker Desktop)
----------------------------------
1. Xuất code CO và Tính giá ra 2 thư mục sạch (không có .env, env/, node_modules/), ví dụ:
     git -C D:/TANPHONGJSC/CO-Manager ls-files -co --exclude-standard | ... (hoặc git worktree)
2. Build, thay 2 stage lấy code từ GitHub bằng thư mục local (không cần token):
     docker build -f deploy/Dockerfile ^
       --build-context co-src=<thư mục CO> ^
       --build-context tinhgia-src=<thư mục Tính giá> ^
       -t tanphong-gateway:local .
   Hoặc build giống Render (cần token trong file token.txt):
     docker build -f deploy/Dockerfile --secret id=github_token,src=token.txt ^
       --build-arg CO_GIT_REF=<sha> --build-arg TINHGIA_GIT_REF=<sha> -t tanphong-gateway:local .
3. Chạy với file biến môi trường (KHÔNG commit file này):
     docker run --rm -p 10000:10000 --env-file deploy.env tanphong-gateway:local
   Tính giá yêu cầu RENDER=true và RENDER_EXTERNAL_HOSTNAME=<tên>.onrender.com trong deploy.env.
   Khi thử qua http://localhost, thêm header X-Forwarded-Proto: https (vì các app bật chuyển HTTPS).
4. Đo RAM: docker stats. Ngưỡng quyết định: 430 MB.

Xem log từng tiến trình trên Render Logs (mọi tiến trình ghi ra stdout).
Khởi động lại một app trong container: supervisorctl -c /app/hrm/deploy/supervisord.conf restart co
