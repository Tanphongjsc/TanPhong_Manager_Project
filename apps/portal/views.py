from django.contrib.auth.decorators import login_required
from django.http import HttpResponse
from django.shortcuts import render
from django.views.decorators.cache import never_cache
from django.views.decorators.csrf import csrf_exempt

from apps.portal.permissions import GATEWAY_PERMISSIONS
from apps.portal.services import get_portal_apps


@login_required
def home(request):
    return render(request, 'portal/home.html', {
        'portal_apps': get_portal_apps(request.user),
        'page_title': 'Trang chủ',
    })


@csrf_exempt
@never_cache
def gateway_auth(request, app):
    """Cổng nginx (auth_request) hỏi: người dùng hiện tại có được vào `app` không?

    204 = cho qua, 401 = chưa đăng nhập, 403 = không có quyền, 404 = app lạ.
    Chỉ đọc phiên đăng nhập hiện có, không ghi gì vào DB nghiệp vụ.
    """
    perm = GATEWAY_PERMISSIONS.get(app)
    if perm is None:
        return HttpResponse(status=404)
    user = request.user
    if not user.is_authenticated:
        return HttpResponse(status=401)
    if user.is_superuser or user.has_perm(perm):
        return HttpResponse(status=204)
    return HttpResponse(status=403)


def gateway_denied(request):
    """Trang báo không có quyền khi nginx chặn truy cập CO / Tính giá."""
    return render(request, 'registration/403.html', status=403)
