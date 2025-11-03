from django.shortcuts import render

# Create your views here.
def view_cay_nhan_su_index(request):
    return render(request, "hrm_manager/quan_ly_nhan_su/caynhansu.html")

def view_bao_cao_index(request):
    return render(request, "hrm_manager/quan_ly_nhan_su/baocao.html")

def view_chuc_vu_index(request):
    return render(request, "hrm_manager/quan_ly_nhan_su/chucvu.html")

def view_danh_muc_index(request):
    return render(request, "hrm_manager/quan_ly_nhan_su/danhmuchethong.html")

def view_bo_thuong_index(request):
    return render(request, "hrm_manager/quan_ly_nhan_su/quanlythongtin_boithuong.html")

def view_tam_ung_index(request):
    return render(request, "hrm_manager/quan_ly_nhan_su/quanlythongtin_quanlytamung.html")


