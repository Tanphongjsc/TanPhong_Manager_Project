from django.urls import path, include
from . import views

app_name = "quan_ly_luong"
urlpatterns = [

    # ========================================================================
    # VIEW URLS - Các trang hiển thị giao diện
    # ========================================================================
    path("phan-tu-luong/", views.view_phan_tu_luong, name="phan_tu_luong"),
    path("phieu-luong/", views.view_phieu_luong, name="phieu_luong"),

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


]