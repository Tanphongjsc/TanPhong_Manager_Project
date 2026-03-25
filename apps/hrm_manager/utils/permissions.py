from __future__ import annotations

from functools import wraps

from django.core.exceptions import PermissionDenied
from django.http import JsonResponse


def _has_permission(user, perm_code: str) -> bool:
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    if user.has_perm(perm_code):
        return True
    # Backward compatibility for old dashboard permission.
    if perm_code == "access_control.view_dashboard" and user.has_perm("dashboard.view_dashboard"):
        return True
    return False


def require_view_permission(perm_code: str):
    def decorator(view_func):
        @wraps(view_func)
        def wrapped(request, *args, **kwargs):
            if not _has_permission(request.user, perm_code):
                raise PermissionDenied("Bạn không có quyền truy cập màn hình này.")
            return view_func(request, *args, **kwargs)

        return wrapped

    return decorator


def require_api_permission(perm_code: str):
    def decorator(view_func):
        @wraps(view_func)
        def wrapped(request, *args, **kwargs):
            if not _has_permission(request.user, perm_code):
                return JsonResponse(
                    {
                        "success": False,
                        "message": "Bạn không có quyền thực hiện thao tác này.",
                        "required_permission": perm_code,
                    },
                    status=403,
                )
            return view_func(request, *args, **kwargs)

        return wrapped

    return decorator
