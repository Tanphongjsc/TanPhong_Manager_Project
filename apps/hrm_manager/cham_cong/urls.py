from django.urls import path
from .  import views

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
    path('quan-ly/bang-cham-cong/', views. view_bang_cham_cong, name='bang_cham_cong'),
    path('quan-ly/tong-hop/', views.view_tong_hop_cham_cong, name='tong_hop_cham_cong'),

    # ============================================================
    # ĐƠN BÁO & BÁO CÁO
    # ============================================================
    path('don-bao/', views.view_don_bao, name='don_bao'),
    path('bao-cao/', views.view_bao_cao, name='bao_cao'),
]