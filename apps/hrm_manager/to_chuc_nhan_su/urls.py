from django.urls import path, include
from . import views

app_name = "to_chuc_nhan_su"
urlpatterns = [

    # VIEW URLS
    path("cay-nhan-su/", views.view_cay_nhan_su_index, name="cay_nhan_su_index"),
    path("bao-cao/", views.view_bao_cao_index, name="bao_cao_index"),
    path("chuc-vu/", views.view_chuc_vu_index, name="chuc_vu_index"),
    path("danh-muc/", views.view_danh_muc_index, name="danh_muc_index"),
    path("quan-ly/boi-thuong/", views.view_bo_thuong_index, name="quan_ly_boi_thuong_index"),
    path("quan-ly/tam-ung/", views.view_tam_ung_index, name="quan_ly_tam_ung_index"),

    # API URLS

]