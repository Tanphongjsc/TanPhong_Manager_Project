DICH_VU_PREFIX = '/dichvudiennuoc/'


def current_module(request):
    """Phân hệ đang mở, dùng để sidebar chỉ hiện menu của phân hệ đó.

    portal  = trang chủ (/)
    dich_vu = Dịch vụ nhà xưởng (/dichvudiennuoc/...)
    hrm     = mọi trang còn lại (Nhân sự – Tiền lương, Dashboard)
    """
    path = getattr(request, 'path', '') or ''
    if path == '/':
        module = 'portal'
    elif path.startswith(DICH_VU_PREFIX):
        module = 'dich_vu'
    else:
        module = 'hrm'
    return {'current_module': module}
