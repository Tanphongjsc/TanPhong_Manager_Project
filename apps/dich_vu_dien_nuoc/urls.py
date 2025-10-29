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
    
    path('api/danh-sach-thong-bao/', views.api_danh_sach_thong_bao, name='api_danh_sach_thong_bao'),
    path('api/danh-sach-cong-ty/', views.api_danh_sach_cong_ty, name='api_danh_sach_cong_ty'),
    path('api/xoa-thong-bao/<int:notification_id>/', views.api_xoa_thong_bao, name='api_xoa_thong_bao'),
    # API cho chức năng tạo mới thông báo
    path('api/danh-sach-cong-ty-chua-tao/', views.api_danh_sach_cong_ty_chua_tao, name='api_danh_sach_cong_ty_chua_tao'),
    path('api/lay-dich-vu-ky-truoc/', views.api_lay_dich_vu_ky_truoc, name='api_lay_dich_vu_ky_truoc'),
    path('api/danh-sach-tat-ca-dich-vu/', views.api_danh_sach_tat_ca_dich_vu, name='api_danh_sach_tat_ca_dich_vu'),
    path('api/tao-moi-thong-bao/', views.api_tao_moi_thong_bao, name='api_tao_moi_thong_bao'),
    # API chi tiết thông báo
    path('api/chi-tiet-thong-bao/<int:notification_id>/', views.api_chi_tiet_thong_bao, name='api_chi_tiet_thong_bao'),
    # API cập nhật thông báo
    path('api/cap-nhat-thong-bao/<int:notification_id>/', views.api_cap_nhat_thong_bao, name='api_cap_nhat_thong_bao'),
    # API in thông báo đơn lẻ
    path('api/in-thong-bao/<int:notification_id>/', views.api_in_thong_bao, name='api_in_thong_bao'),
    # API in nhiều thông báo
    path('api/in-nhieu-thong-bao/', views.api_in_nhieu_thong_bao, name='api_in_nhieu_thong_bao'),

    # Quản lý dịch vụ API URL
    path('api/dichvu/update-or-create/', views.api_dich_vu_update_or_create ,name="api_quanlyloaidichvu_update_or_create"),
    path("api/dichvu/delete/<str:pk>/", views.api_dich_vu_delete, name="api_quanlyloaidichvu_delete"),

    path('api/loaidichvu/update-or-create/', views.api_loai_dich_vu_update_or_create ,name="api_quanlyloaidichvu_update_or_create"),\
    path("api/loaidichvu/delete/<str:pk>/", views.api_loai_dich_vu_delete, name="api_quanlyloaidichvu_delete"),

]

