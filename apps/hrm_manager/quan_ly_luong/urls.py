from django.urls import path
from .import views

app_name = 'quan_ly_luong'

urlpatterns = [

    # ========================================================================
    # VIEW URLS - Các trang hiển thị giao diện
    # ========================================================================
    path("phan-tu-luong/", views.view_phan_tu_luong, name="phan_tu_luong"),
    path("phieu-luong/", views.view_phieu_luong, name="phieu_luong"),
    path("phieu-luong/<int:bangluong_id>/", views.view_phieu_luong, name="phieu_luong_with_id"),

    # ===================== API URLS =====================
    
    # ------------------------------- PHẦN TỬ LƯƠNG ------------------------------
    path('api/phan-tu-luong/list', views.api_phan_tu_luong_list, name='api_phan_tu_luong_list'),
    path('api/phan-tu-luong/detail/<int:pk>', views.api_phan_tu_luong_detail, name='api_phan_tu_luong_detail'),
    path('api/phan-tu-luong/<int:id>/toggle-status/', views.api_phan_tu_luong_toggle_status, name='api_phan_tu_luong_toggle_status'),
    path("api/phan-tu-luong/thiet-lap-gia-tri", views.api_phan_tu_luong_setup_params, name="api_phan_tu_luong_setup_params"),

    # ------------------------------ NHÓM PHẦN TỬ LƯƠNG -----------------------------
    path("api/nhom-phan-tu-luong/list", views.api_nhom_phan_tu_luong_list, name="api_nhom_phan_tu_luong_list"),
    path("api/nhom-phan-tu-luong/detail/<int:pk>", views.api_nhom_phan_tu_luong_detail, name="api_nhom_phan_tu_luong_detail"),

    # -------------------------------- PHIẾU LƯƠNG ------------------------------
    path("api/phieu-luong/list", views.api_phieu_luong_list, name="api_phieu_luong_list"),

    # ------------------------------ CHẾ ĐỘ LƯƠNG -----------------------------
    path('che-do-luong/', views.view_che_do_luong, name='che_do_luong'),
    path('che-do-luong/create/', views.view_che_do_luong_create, name='che_do_luong_create'),
    path('che-do-luong/<int:pk>/update/', views.view_che_do_luong_update, name='che_do_luong_update'),
    # API
    path('api/che-do-luong/list/', views.api_che_do_luong_list, name='api_che_do_luong_list'),
    path('api/che-do-luong/<int:pk>/detail/', views.api_che_do_luong_detail, name='api_che_do_luong_detail'),
    path('api/che-do-luong/create/', views.api_che_do_luong_create, name='api_che_do_luong_create'),
    path('api/che-do-luong/<int:pk>/update/', views.api_che_do_luong_update, name='api_che_do_luong_update'),
    path('api/che-do-luong/<int:pk>/delete/', views.api_che_do_luong_delete, name='api_che_do_luong_delete'),
    path('api/che-do-luong/<int:pk>/toggle-status/', views.api_che_do_luong_toggle_status, name='api_che_do_luong_toggle_status'),
    path('api/che-do-luong/check-conflicts/', views.api_che_do_luong_check_conflicts, name='api_che_do_luong_check_conflicts'),
    # API: Check conditions
    path('api/che-do-luong/<int:pk>/check-delete/', views.api_che_do_luong_check_delete, name='api_che_do_luong_check_delete'),
    path('api/che-do-luong/<int:pk>/check-toggle/', views.api_che_do_luong_check_toggle, name='api_che_do_luong_check_toggle'),
    # API: Transfer
    path('api/che-do-luong/transfer/', views.api_che_do_luong_transfer, name='api_che_do_luong_transfer'),

    # ------------------------------ KỲ LƯƠNG -----------------------------
    # Kỳ lương - Views
    path('ky-luong/', views.view_ky_luong, name='ky_luong'),
    
    # Kỳ lương - APIs
    path('api/ky-luong/list/', views.api_ky_luong_list, name='api_ky_luong_list'),
    path('api/ky-luong/<int:pk>/detail/', views.api_ky_luong_detail, name='api_ky_luong_detail'),
    path('api/ky-luong/create/', views.api_ky_luong_create, name='api_ky_luong_create'),
    path('api/ky-luong/<int:pk>/update/', views.api_ky_luong_update, name='api_ky_luong_update'),
    path('api/ky-luong/<int:pk>/delete/', views.api_ky_luong_delete, name='api_ky_luong_delete'),
    path('api/ky-luong/get-defaults/', views.api_ky_luong_get_defaults, name='api_ky_luong_get_defaults'),
    
    # =============================== BẢNG LƯƠNG ==============================
    path('bang-luong/', views.view_bang_luong, name='bang_luong'),
    path('api/bang-luong/list/', views.api_bang_luong_list, name='api_bang_luong_list'),
    path('api/bang-luong/<int:pk>/detail/', views.api_bang_luong_detail, name='api_bang_luong_detail'),
    path('api/bang-luong/create/', views.api_bang_luong_create, name='api_bang_luong_create'),
    path('api/bang-luong/<int:pk>/update/', views.api_bang_luong_update, name='api_bang_luong_update'),
    path('api/bang-luong/<int:pk>/delete/', views.api_bang_luong_delete, name='api_bang_luong_delete'),
    path('api/bang-luong/get-options/', views.api_bang_luong_get_options, name='api_bang_luong_get_options'),
    
    # =============================== PHIẾU LƯƠNG ==============================
    # Phiếu lương - View chính (nhận bang_luong_id để hiển thị phiếu lương của bảng lương đó)
    path('phieu-luong/<int:bang_luong_id>/', views.view_phieu_luong, name='phieu_luong'),
]
