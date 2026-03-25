"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.views.generic import RedirectView
from django.http import JsonResponse
from django.http import HttpResponse
from django.shortcuts import redirect
from django.shortcuts import render
from django.contrib.auth.decorators import login_required

from config.authz.ui import get_first_allowed_url


def health_check(request):
    return JsonResponse({"status": "ok"})


def root_entry(request):
    # Render thường gọi HEAD / để health probe; trả 200 để tránh timeout.
    if request.method == 'HEAD':
        return HttpResponse(status=200)

    if not request.user.is_authenticated:
        return redirect('login')

    destination = get_first_allowed_url(request.user)
    if destination:
        return redirect(destination)

    return render(request, 'registration/403.html', status=403)


@login_required
def post_login_redirect(request):
    destination = get_first_allowed_url(request.user)
    if destination:
        return redirect(destination)
    return render(request, 'registration/403.html', status=403)


def permission_denied_view(request, exception=None):
    return render(request, 'registration/403.html', status=403)


urlpatterns = [
    path('health/', health_check, name='health_check'),
    path('admin/', admin.site.urls),
    path('', root_entry, name='root_entry'),
    path('accounts/post-login/', post_login_redirect, name='post_login_redirect'),
    path('accounts/', include('django.contrib.auth.urls')),
    path('dashboard/', include('apps.dashboard.urls')),
    path('dichvudiennuoc/', include('apps.dich_vu_dien_nuoc.urls')),
    path('hrm/', include('apps.hrm_manager.urls')),
]

handler403 = 'config.urls.permission_denied_view'

# 🆕 THÊM DÒNG NÀY CHO DEVELOPMENT
if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.BASE_DIR / 'static')


# Tùy chỉnh tiêu đề trang admin
admin.site.site_header = "Trang quản trị"  # Tiêu đề chính (header)
admin.site.site_title = "Admin Panel"           # Tiêu đề trên tab trình duyệt
admin.site.index_title = "Chào mừng bạn, hôm nay bạn như thế nào ?"         # Tiêu đề trên trang index