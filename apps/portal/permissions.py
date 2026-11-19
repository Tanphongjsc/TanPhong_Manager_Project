"""Quyền truy cập các phần mềm chạy sau cổng (CO, Tính giá thành).

Các quyền access_control.* của dự án nằm sẵn trong bảng auth_permission với
content type access_control.featurepermission (không khai báo trong code).
Hai quyền mới được tạo theo đúng mẫu đó, mỗi lần chạy `migrate`
(tín hiệu post_migrate). Thao tác idempotent: chỉ thêm dòng nếu chưa có.
"""

PORTAL_PERMISSION_APP_LABEL = 'access_control'
PORTAL_PERMISSION_MODEL = 'featurepermission'

# Khóa app trên URL cổng -> codename quyền
GATEWAY_PERMISSION_CODENAMES = {
    'co': 'view_co',
    'tinh-gia': 'view_tinh_gia',
}

GATEWAY_PERMISSIONS = {
    app: f'{PORTAL_PERMISSION_APP_LABEL}.{codename}'
    for app, codename in GATEWAY_PERMISSION_CODENAMES.items()
}

_PERMISSION_NAMES = {
    'view_co': 'Truy cap co',
    'view_tinh_gia': 'Truy cap tinh_gia',
}


def ensure_portal_permissions(sender=None, using='default', **kwargs):
    from django.contrib.auth.models import Permission
    from django.contrib.contenttypes.models import ContentType

    content_type, _ = ContentType.objects.using(using).get_or_create(
        app_label=PORTAL_PERMISSION_APP_LABEL,
        model=PORTAL_PERMISSION_MODEL,
    )
    for codename, name in _PERMISSION_NAMES.items():
        Permission.objects.using(using).get_or_create(
            content_type=content_type,
            codename=codename,
            defaults={'name': name},
        )
