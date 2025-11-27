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

    
    # ===================== API URLS =====================
    
    # CHỨC VỤ
    path('api/v1/chuc-vu/', views.api_chuc_vu_list, name='api_chuc_vu_list'),
    path('api/v1/chuc-vu/<int:id>/', views.api_chuc_vu_detail, name='api_chuc_vu_detail'),

    # CÔNG TY
    path('api/v1/cong-ty/', views.api_cong_ty_list, name='api_cong_ty_list'),
    path('api/v1/cong-ty/<int:id>/', views.api_cong_ty_detail, name='api_cong_ty_detail'),
    
    # PHÒNG BAN
    path('api/v1/phong-ban/', views.api_phong_ban_list, name='api_phong_ban_list'),
    path('api/v1/phong-ban/<int:id>/', views.api_phong_ban_detail, name='api_phong_ban_detail'),
    path('api/v1/phong-ban/employee/', views.api_phong_ban_nhan_vien, name='api_phong_ban_nhan_vien'),
    path('api/v1/phong-ban/tree/', views.api_phong_ban_tree, name='api_phong_ban_tree'),

    # NHÂN VIÊN
    path('api/v1/nhan-vien/', views.api_nhan_vien_list, name='api_nhan_vien_list'),
    path('api/v1/nhan-vien/<int:id>/', views.api_nhan_vien_detail, name='api_nhan_vien_detail'),
    path('api/v1/chuc-vu/<int:id>/toggle-status/', views.api_chuc_vu_toggle_status, name='api_chuc_vu_toggle_status'),

    # LỊCH SỬ CÔNG TÁC
    path("api/v1/lich-su-cong-tac/", views.api_lich_su_cong_tac_list, name="api_lich_su_cong_tac_list"),
    path("api/v1/lich-su-cong-tac/<int:id>/", views.api_lich_su_cong_tac_detail, name="api_lich_su_cong_tac_detail"),
    path("api/v1/lich-su-cong-tac/chuyen-cong-tac/", views.api_lich_su_cong_tac_chuyen_cong_tac, name="api_lich_su_cong_tac_chuyen_cong_tac"),
    
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