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

    # Báo cáo doanh thu API URL
    path("api/baocaodoanhthu/filter/", views.api_bao_cao_doanh_thu_filter, name="api_baocaodoanhthu_filter"),
    path("api/baocaodoanhthu/export/", views.api_bao_cao_doanh_thu_export, name="api_baocaodoanhthu_export"),

    path("quanlyloaidichvu/", views.view_quan_ly_loai_dich_vu, name="quanlyloaidichvu"),

    # Quản lý dịch vụ API URL
    path('api/dichvu/update-or-create/', views.api_dich_vu_update_or_create ,name="api_quanlyloaidichvu_update_or_create"),
    path("api/dichvu/delete/<str:pk>/", views.api_dich_vu_delete, name="api_quanlyloaidichvu_delete"),

    path('api/loaidichvu/update-or-create/', views.api_loai_dich_vu_update_or_create ,name="api_quanlyloaidichvu_update_or_create"),\
    path("api/loaidichvu/delete/<str:pk>/", views.api_loai_dich_vu_delete, name="api_quanlyloaidichvu_delete"),

]

