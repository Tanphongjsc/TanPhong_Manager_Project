from django.urls import path
from . import views

app_name = 'cham_cong'

urlpatterns = [
    # 1. NHÓM: QUẢN LÝ LỊCH LÀM VIỆC
    # -- Lịch làm việc
    path('thiet-ke-lich/ca-lam-viec/', views.view_ca_lam_viec, name='thiet_ke_ca'),
    path('thiet-ke-lich/lich-lam-viec/', views.view_lich_lam_viec, name='thiet_ke_lich'),
    path('thiet-ke-lich/tong-hop/', views.view_tong_hop_lich, name='tong_hop_lich'),

    # -- Lịch nghỉ
    path('thiet-ke-nghi/lich-nghi/', views.view_lich_nghi, name='thiet_ke_lich_nghi'),
    path('thiet-ke-nghi/quy-nghi/', views.view_quy_nghi, name='thiet_ke_quy_nghi'),
    path('thiet-ke-nghi/tong-hop/', views.view_tong_hop_nghi, name='tong_hop_nghi'),

    # 2. NHÓM: QUẢN LÝ LÀM THÊM
    path('lam-them/quy-tac/', views.view_quytac_lam_them, name='quytac_lam_them'),
    path('lam-them/tong-hop/', views.view_tong_hop_lam_them, name='tong_hop_lam_them'),

    # 3. NHÓM: QUẢN LÝ CHẤM CÔNG 
    path('quan-ly/bang-cham-cong/', views.view_bang_cham_cong, name='bang_cham_cong'),
    path('quan-ly/tong-hop/', views.view_tong_hop_cham_cong, name='tong_hop_cham_cong'),

    path('don-bao/', views.view_don_bao, name='don_bao'),
    path('bao-cao/', views.view_bao_cao, name='bao_cao'),
]