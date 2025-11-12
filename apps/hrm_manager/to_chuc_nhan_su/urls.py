from django.urls import path, include
from . import views

app_name = "to_chuc_nhan_su"
urlpatterns = [

    # ===================== VIEW URLS ====================
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

]