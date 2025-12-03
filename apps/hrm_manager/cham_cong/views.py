from django.shortcuts import render
from django.urls import reverse


# ============================================================
# HELPERS: CẤU HÌNH TABS
# ============================================================

def get_lam_them_tabs():
    """Tabs cho nhóm Quản lý Làm thêm"""
    return [
        {'label': 'Thiết kế Quy tắc làm thêm', 'url_name': 'quytac_lam_them', 'url': reverse('hrm:cham_cong:quytac_lam_them')},
        {'label': 'Tổng hợp Làm thêm', 'url_name': 'tong_hop_lam_them', 'url': reverse('hrm:cham_cong:tong_hop_lam_them')},
    ]

# ============================================================
# VIEWS: QUẢN LÝ LÀM THÊM
# ============================================================

def view_quytac_lam_them(request):
    """Thiết kế Quy tắc làm thêm"""
    context = {
        'breadcrumbs': [
            {'title': 'Chấm công', 'url': '#'},
            {'title': 'Quản lý làm thêm', 'url': None},
            {'title': 'Quy tắc làm thêm', 'url': None},
        ],
        'tabs': get_lam_them_tabs(),
    }
    return render(request, "hrm_manager/cham_cong/lam_them/quytac_lam_them.html", context)


def view_tong_hop_lam_them(request):
    """Tổng hợp Làm thêm"""
    context = {
        'breadcrumbs': [
            {'title': 'Chấm công', 'url': '#'},
            {'title': 'Quản lý làm thêm', 'url': None},
            {'title': 'Tổng hợp làm thêm', 'url': None},
        ],
        'tabs': get_lam_them_tabs(),
    }
    return render(request, "hrm_manager/cham_cong/lam_them/tong_hop_lam_them. html", context)


# ============================================================
# VIEWS: QUẢN LÝ CHẤM CÔNG
# ============================================================

def view_bang_cham_cong(request):
    """Bảng chấm công"""
    context = {
        'breadcrumbs': [
            {'title': 'Chấm công', 'url': '#'},
            {'title': 'Quản lý chấm công', 'url': None},
            {'title': 'Bảng chấm công', 'url': None},
        ],
        'tabs': get_cham_cong_tabs(),
    }
    return render(request, "hrm_manager/cham_cong/quan_ly/bang_cham_cong.html", context)


def view_tong_hop_cham_cong(request):
    """Tổng hợp chấm công"""
    context = {
        'breadcrumbs': [
            {'title': 'Chấm công', 'url': '#'},
            {'title': 'Quản lý chấm công', 'url': None},
            {'title': 'Tổng hợp chấm công', 'url': None},
        ],
        'tabs': get_cham_cong_tabs(),
    }
    return render(request, "hrm_manager/cham_cong/quan_ly/tong_hop_cham_cong.html", context)


# ============================================================
# VIEWS: ĐƠN BÁO & BÁO CÁO
# ============================================================

def view_don_bao(request):
    return render(request, "hrm_manager/cham_cong/don_bao.html", {})

def view_bao_cao(request):
    return render(request, "hrm_manager/cham_cong/bao_cao.html", {})