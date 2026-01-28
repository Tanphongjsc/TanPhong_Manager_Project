from django.urls import path
from .import views

app_name = 'quan_ly_luong'

urlpatterns = [

    # ========================================================================
    # VIEW URLS - Các trang hiển thị giao diện
    # ========================================================================
    path("phan-tu-luong/", views.view_phan_tu_luong, name="phan_tu_luong"),

    # ===================== API URLS =====================
    
    # ------------------------------- PHẦN TỬ LƯƠNG ------------------------------
    path('api/phan-tu-luong/list', views.api_phan_tu_luong_list, name='api_phan_tu_luong_list'),
    path('api/phan-tu-luong/detail/<int:pk>', views.api_phan_tu_luong_detail, name='api_phan_tu_luong_detail'),
    path('api/phan-tu-luong/<int:id>/toggle-status/', views.api_phan_tu_luong_toggle_status, name='api_phan_tu_luong_toggle_status'),

    # ------------------------------ NHÓM PHẦN TỬ LƯƠNG -----------------------------
    path("api/nhom-phan-tu-luong/list", views.api_nhom_phan_tu_luong_list, name="api_nhom_phan_tu_luong_list"),
    path("api/nhom-phan-tu-luong/detail/<int:pk>", views.api_nhom_phan_tu_luong_detail, name="api_nhom_phan_tu_luong_detail"),

    # -------------------------------- Thiết lập số liệu cố đính ------------------------------
    path("api/phan-tu-luong/thiet-lap-gia-tri", views.api_phan_tu_luong_setup_params, name="api_phan_tu_luong_setup_params"),

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
    #path('api/ky-luong/check-overlap/', views.api_ky_luong_check_overlap, name='api-ky-luong-check-overlap'),
]
