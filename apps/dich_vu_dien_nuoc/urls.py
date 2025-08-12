from django.urls import path
from . import views

urlpatterns = [
    path("danhsachthongbao/", views.view_danh_sach_thong_bao, name="danhsachthongbao"),
    path("quanlykhachthue/", views.view_quan_ly_khach_thue, name="quanlykhachthue"),

    # Quản lý Khách Thuê API URL
    path("api/get-all-services/", views.api_get_all_services, name="api_get_all_services"),
    path('api/quanlykhachthue/update-or-create/', views.api_quan_ly_khach_thue_update_or_create ,name="api_quanlykhachthue_update_or_create"),
    path("api/quanlykhachthue/delete/<str:pk>/", views.api_quan_ly_khach_thue_delete, name="api_quanlykhachthue_delete"),

    path("baocaodoanhthu/", views.view_bao_cao_doanh_thu, name="baocaodoanhthu"),
    path("quanlyloaidichvu/", views.view_quan_ly_loai_dich_vu, name="quanlyloaidichvu"),
]