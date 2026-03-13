# gunicorn.conf.py - Cấu hình Gunicorn cho Render.com
import os

# Số workers: 2*CPU + 1 (Render free = 1 vCPU)
workers = 2

# Loại worker - sync phù hợp với Django thông thường
worker_class = "sync"

# Timeout (giây) - tăng lên do Supabase free tier có cold-start delay
timeout = 120

# Thời gian tối đa để worker graceful shutdown
graceful_timeout = 30

# Keep-alive
keepalive = 5

# Bind sẽ được override bởi --bind trong Start Command
bind = f"0.0.0.0:{os.getenv('PORT', '8000')}"

# Logging
accesslog = "-"
errorlog = "-"
loglevel = "info"
