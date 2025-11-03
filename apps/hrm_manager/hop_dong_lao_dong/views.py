from django.shortcuts import render

# Create your views here.
def view_quan_ly_hop_dong_index(request):
    return render(request, "hrm_manager/quan_ly_nhan_su/quanlythongtin_quanlyhopdong.html")