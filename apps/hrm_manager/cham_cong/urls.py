from django.urls import path
from . import views

app_name = "cham_cong"

urlpatterns = [
    # ============================================================
    # QUẢN LÝ LÀM THÊM
    # ============================================================
    path('lam-them/quy-tac/', views.view_quytac_lam_them, name='quytac_lam_them'),
    path('lam-them/tong-hop/', views.view_tong_hop_lam_them, name='tong_hop_lam_them'),

    # ============================================================
    # QUẢN LÝ CHẤM CÔNG
    # ============================================================
    path('bang-cham-cong/', views.view_bang_cham_cong, name='bang_cham_cong'),
    path('bang-cham-cong/tong-hop/', views.view_tong_hop_cham_cong, name='tong_hop_cham_cong'),

    # API URL CHO CHẤM CÔNG
    path('api/bang-cham-cong/list/', views.api_bang_cham_cong_list , name='api_bang_cham_cong_list'),
    path('api/bang-cham-cong/nhan-vien-list/', views.api_bang_cham_cong_nhan_vien_list , name='api_bang_cham_cong_nhan_vien_list'),
    path('api/bang-cham-cong/tong-hop-thang/', views.api_tong_hop_cham_cong_thang , name='api_tong_hop_cham_cong_thang'),
    path('api/bang-cham-cong/check-cham-cong/', views.api_check_cham_cong , name='api_check_cham_cong'),

    # ============================================================
    # ĐƠN BÁO & BÁO CÁO
    # ============================================================
    path('don-bao/', views.view_don_bao, name='don_bao'),
    path('bao-cao/', views.view_bao_cao, name='bao_cao'),
]