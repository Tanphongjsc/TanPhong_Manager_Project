from __future__ import annotations

from django.http import JsonResponse
from django.shortcuts import render

from config.authz import get_required_permissions, is_exempt_path


class AccessControlMiddleware:
    """
    Centralized authorization gate.

    Rules are resolved from URL prefix + HTTP method and mapped to
    Django permissions under app_label `access_control`.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        path = request.path or "/"
        if is_exempt_path(path):
            return self.get_response(request)

        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return self.get_response(request)

        if user.is_superuser:
            return self.get_response(request)

        required_permissions = get_required_permissions(path=path, method=request.method)
        if not required_permissions:
            return self.get_response(request)

        if any(user.has_perm(perm) for perm in required_permissions):
            return self.get_response(request)

        # Backward compatibility for dashboard permission already in project.
        if "access_control.view_dashboard" in required_permissions and user.has_perm("dashboard.view_dashboard"):
            return self.get_response(request)

        is_api = "/api/" in path or request.headers.get("X-Requested-With") == "XMLHttpRequest"
        if is_api:
            return JsonResponse(
                {
                    "success": False,
                    "message": "Bạn không có quyền truy cập chức năng này.",
                    "required_permission": " | ".join(required_permissions),
                },
                status=403,
            )

        return render(
            request,
            "registration/403.html",
            {
                "required_permission": " | ".join(required_permissions),
            },
            status=403,
        )
