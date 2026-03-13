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


def health_check(request):
    return JsonResponse({"status": "ok"})


urlpatterns = [
    path('health/', health_check, name='health_check'),
    path('admin/', admin.site.urls),
    path('', RedirectView.as_view(url='dashboard/')),
    path('accounts/', include('django.contrib.auth.urls')),
    path('dashboard/', include('apps.dashboard.urls')),
    path('dichvudiennuoc/', include('apps.dich_vu_dien_nuoc.urls')),
    path('hrm/', include('apps.hrm_manager.urls')),
]

# 🆕 THÊM DÒNG NÀY CHO DEVELOPMENT
if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.BASE_DIR / 'static')


# Tùy chỉnh tiêu đề trang admin
admin.site.site_header = "Trang quản trị"  # Tiêu đề chính (header)
admin.site.site_title = "Admin Panel"           # Tiêu đề trên tab trình duyệt
admin.site.index_title = "Chào mừng bạn, hôm nay bạn như thế nào ?"         # Tiêu đề trên trang index