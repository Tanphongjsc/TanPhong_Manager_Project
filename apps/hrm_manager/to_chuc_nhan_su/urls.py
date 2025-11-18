from django.urls import path
from . import views

app_name = "to_chuc_nhan_su"

urlpatterns = [
    # ========================================================================
    # VIEW URLS - Các trang hiển thị giao diện
    # ========================================================================
    
    # Trang chính
    path("cay-nhan-su/", views.view_cay_nhan_su_index, name="cay_nhan_su_index"),
    path("bao-cao/", views.view_bao_cao_index, name="bao_cao_index"),
    path("chuc-vu/", views.view_chuc_vu_index, name="chuc_vu_index"),
    path("danh-muc/", views.view_danh_muc_index, name="danh_muc_index"),
    path("quan-ly/boi-thuong/", views.view_bo_thuong_index, name="quan_ly_boi_thuong_index"),
    path("quan-ly/tam-ung/", views.view_tam_ung_index, name="quan_ly_tam_ung_index"),

    # Danh mục hệ thống - Views
    path("danh-muc/ngan-hang/", views.view_dmht_nganhang_list, name="dmht_nganhang"),
    #path("danh-muc/hop-dong/", views.view_dmht_hopdong_list, name="dmht_hopdong"),
    path("danh-muc/bao-hiem/", views.view_dmht_baohiem_list, name="dmht_baohiem"),
    path("danh-muc/loai-nhan-vien/", views.view_dmht_loainhanvien_list, name="dmht_loainhanvien"),

    # API URLS - DANH SÁCH VIEWS
    # ========================================================================
    path("api/ngan-hang/list/", views.api_nganhang_list, name="api_nganhang_list"),
    path("api/bao-hiem/list/", views.api_baohiem_list, name="api_baohiem_list"),
    path("api/loai-nhan-vien/list/", views.api_loainhanvien_list, name="api_loainhanvien_list"),

    # ========================================================================
    # API URLS - Ngân hàng
    # ========================================================================
    path("api/ngan-hang/<int:pk>/detail/", views.api_nganhang_detail, name="api_nganhang_detail"),
    path("api/ngan-hang/create/", views.api_nganhang_create, name="api_nganhang_create"),
    path("api/ngan-hang/<int:pk>/update/", views.api_nganhang_update, name="api_nganhang_update"),
    path("api/ngan-hang/<int:pk>/delete/", views.api_nganhang_delete, name="api_nganhang_delete"),
    path("api/ngan-hang/<int:pk>/toggle-status/", views.api_nganhang_toggle_status, name="api_nganhang_toggle_status"),


    # ========================================================================
    # API URLS - Hợp đồng
    # ========================================================================
    # path("api/hop-dong/<int:pk>/detail/", views.api_hopdong_detail, name="api_hopdong_detail"),
    # path("api/hop-dong/create/", views.api_hopdong_create, name="api_hopdong_create"),
    # path("api/hop-dong/<int:pk>/update/", views.api_hopdong_update, name="api_hopdong_update"),
    # path("api/hop-dong/<int:pk>/delete/", views.api_hopdong_delete, name="api_hopdong_delete"),
    # path("api/hop-dong/<int:pk>/toggle-status/", views.api_hopdong_toggle_status, name="api_hopdong_toggle_status"),


    # ========================================================================
    # API URLS - Bảo hiểm
    # ========================================================================
    path("api/bao-hiem/<int:pk>/detail/", views.api_baohiem_detail, name="api_baohiem_detail"),
    path("api/bao-hiem/create/", views.api_baohiem_create, name="api_baohiem_create"),
    path("api/bao-hiem/<int:pk>/update/", views.api_baohiem_update, name="api_baohiem_update"),
    path("api/bao-hiem/<int:pk>/delete/", views.api_baohiem_delete, name="api_baohiem_delete"),
    path("api/bao-hiem/<int:pk>/toggle-status/", views.api_baohiem_toggle_status, name="api_baohiem_toggle_status"),


    # ========================================================================
    # API URLS - Loại nhân viên
    # ========================================================================
    path("api/loai-nhan-vien/<int:pk>/detail/", views.api_loainhanvien_detail, name="api_loainhanvien_detail"),
    path("api/loai-nhan-vien/create/", views.api_loainhanvien_create, name="api_loainhanvien_create"),
    path("api/loai-nhan-vien/<int:pk>/update/", views.api_loainhanvien_update, name="api_loainhanvien_update"),
    path("api/loai-nhan-vien/<int:pk>/delete/", views.api_loainhanvien_delete, name="api_loainhanvien_delete"),
    path("api/loai-nhan-vien/<int:pk>/toggle-status/", views.api_loainhanvien_toggle_status, name="api_loainhanvien_toggle_status"),

    # ========================================================================

]