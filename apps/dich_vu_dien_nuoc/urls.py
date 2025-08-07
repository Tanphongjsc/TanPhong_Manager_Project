from django.urls import path
from . import views

urlpatterns = [
    path("danhsachthongbao/", views.view_danh_sach_thong_bao, name="danhsachthongbao"),
    path("quanlykhachthue/", views.view_quan_ly_khach_thue, name="quanlykhachthue"),
    path("baocaodoanhthu/", views.view_bao_cao_doanh_thu, name="baocaodoanhthu"),
    path("quanlyloaidichvu/", views.view_quan_ly_loai_dich_vu, name="quanlyloaidichvu"),
]