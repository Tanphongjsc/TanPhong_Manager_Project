from django.shortcuts import render

# Create your views here.
def view_danh_sach_thong_bao (request):
    return render(request, "dich_vu_dien_nuoc/danh_sach_thong_bao.html")

def view_bao_cao_doanh_thu (request):
    return render(request, "dich_vu_dien_nuoc/bao_cao_doanh_thu.html")

def view_quan_ly_loai_dich_vu (request):
    return render(request, "dich_vu_dien_nuoc/quan_ly_loai_dich_vu.html")

def view_quan_ly_khach_thue (request):
    return render(request, "dich_vu_dien_nuoc/quan_ly_khach_thue.html")
