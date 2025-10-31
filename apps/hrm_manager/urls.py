from django.urls import path, include

app_name = "hrm_manager"
urlpatterns = [
    # Include URLs từ sub-apps
    path('core/', include('apps.hrm_manager.__core__.urls')),  # URLs cho phần core (models chung)
    path('cham-cong/', include('apps.hrm_manager.cham_cong.urls')),  # URLs cho chấm công
    path('don-bao/', include('apps.hrm_manager.don_bao.urls')),  # URLs cho đơn báo
    path('hop-dong-lao-dong/', include('apps.hrm_manager.hop_dong_lao_dong.urls')),  # URLs cho hợp đồng lao động
    path('lam-them-gio/', include('apps.hrm_manager.lam_them_gio.urls')),  # URLs cho làm thêm giờ
    path('lich-lam-viec/', include('apps.hrm_manager.lich_lam_viec.urls')),  # URLs cho lịch làm việc
    path('nghi-phep/', include('apps.hrm_manager.nghi_phep.urls')),  #  URLs cho nghỉ phép
    path('quan-ly-luong/', include('apps.hrm_manager.quan_ly_luong.urls')),  # URLs cho quản lý lương
    path('to-chuc-nhan-su/', include('apps.hrm_manager.to_chuc_nhan_su.urls')),  # URLs cho tổ chức nhân sự
]