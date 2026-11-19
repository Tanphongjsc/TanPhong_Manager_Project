"""Chạy một lệnh với môi trường "sạch" cho từng phần mềm trong container.

Cách dùng:
    with_env.py <TIỀN_TỐ> [KEY=VALUE ...] -- <lệnh> [tham số ...]

Ví dụ: with_env.py CO_ SCRIPT_NAME=/co -- gunicorn ...
    - Chỉ giữ một số biến hệ thống (PATH, LANG, TZ, RENDER, ...).
    - Mọi biến bắt đầu bằng tiền tố được bỏ tiền tố rồi truyền vào:
      CO_user -> user, CO_SECRET_KEY -> SECRET_KEY.
    - KEY=VALUE ghi đè cuối cùng.

Nhờ vậy CO không đọc nhầm biến user/password/host của phần mềm lương
(hai phần mềm dùng cùng tên biến nhưng trỏ tới hai database khác nhau).
"""
import os
import sys

KEEP = (
    "PATH", "LANG", "LC_ALL", "TZ", "HOME",
    "PYTHONUNBUFFERED", "PYTHONDONTWRITEBYTECODE",
    "RENDER", "RENDER_EXTERNAL_HOSTNAME", "RENDER_EXTERNAL_URL",
    "RENDER_SERVICE_ID", "RENDER_SERVICE_NAME", "RENDER_GIT_COMMIT",
)


def main(argv):
    if len(argv) < 3 or "--" not in argv:
        sys.exit("Cách dùng: with_env.py <TIỀN_TỐ> [KEY=VALUE ...] -- <lệnh> ...")
    prefix = argv[0]
    sep = argv.index("--")
    overrides, command = argv[1:sep], argv[sep + 1:]
    if not prefix or not command:
        sys.exit("Thiếu tiền tố hoặc lệnh.")

    env = {key: value for key, value in os.environ.items() if key in KEEP}
    env.update(
        {key[len(prefix):]: value for key, value in os.environ.items()
         if key.startswith(prefix) and len(key) > len(prefix)}
    )
    for item in overrides:
        key, sep_char, value = item.partition("=")
        if not sep_char or not key:
            sys.exit(f"Tham số không hợp lệ: {item!r} (cần KEY=VALUE)")
        env[key] = value
    env.setdefault("HOME", "/tmp")
    os.execvpe(command[0], command, env)


if __name__ == "__main__":
    main(sys.argv[1:])
