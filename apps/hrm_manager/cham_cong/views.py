from django.shortcuts import render
from django.urls import reverse

# --- HELPERS ĐỂ CẤU HÌNH TABS ---

def get_thiet_ke_lich_tabs():
    """Trả về cấu hình tabs cho nhóm Thiết kế lịch làm việc"""
    return [
        {'label': 'Thiết kế Ca làm việc', 'url_name': 'thiet_ke_ca', 'url': reverse('hrm:cham_cong:thiet_ke_ca')},
        {'label': 'Thiết kế Lịch làm việc', 'url_name': 'thiet_ke_lich', 'url': reverse('hrm:cham_cong:thiet_ke_lich')},
        {'label': 'Tổng hợp Lịch làm việc', 'url_name': 'tong_hop_lich', 'url': reverse('hrm:cham_cong:tong_hop_lich')},
    ]

def get_thiet_ke_nghi_tabs():
    """Trả về cấu hình tabs cho nhóm Thiết kế lịch nghỉ"""
    return [
        {'label': 'Thiết kế Lịch nghỉ', 'url_name': 'thiet_ke_lich_nghi', 'url': reverse('hrm:cham_cong:thiet_ke_lich_nghi')},
        {'label': 'Thiết kế Quỹ nghỉ', 'url_name': 'thiet_ke_quy_nghi', 'url': reverse('hrm:cham_cong:thiet_ke_quy_nghi')},
        {'label': 'Tổng hợp Ngày nghỉ', 'url_name': 'tong_hop_nghi', 'url': reverse('hrm:cham_cong:tong_hop_nghi')},
    ]

def get_lam_them_tabs():
    """Trả về cấu hình tabs cho nhóm Thiết kế làm thêm"""
    return [
        {'label': 'Thiết kế Quy tắc làm thêm', 'url_name': 'quytac_lam_them', 'url': reverse('hrm:cham_cong:quytac_lam_them')},
        {'label': 'Tổng hợp Làm thêm', 'url_name': 'tong_hop_lam_them', 'url': reverse('hrm:cham_cong:tong_hop_lam_them')},
    ]

# --- 1. VIEWS: THIẾT KẾ LỊCH LÀM VIỆC ---

def view_ca_lam_viec(request):
    context = {
        'breadcrumbs': [
            {'title': 'Chấm công', 'url': '#'},
            {'title': 'Quản lý lịch làm việc', 'url': None},
            {'title': 'Thiết kế ca làm việc', 'url': None},
        ],
        'tabs': get_thiet_ke_lich_tabs(),
        # Thêm data cho Toolbar/Filter nếu cần
        'status_list': [{'value': 'active', 'label': 'Đang hoạt động'}, {'value': 'inactive', 'label': 'Ngừng hoạt động'}]
    }
    return render(request, "hrm_manager/cham_cong/lich_lam_viec/ca_lam_viec.html", context)

def view_lich_lam_viec(request):
    context = {
        'breadcrumbs': [
            {'title': 'Chấm công', 'url': '#'},
            {'title': 'Quản lý lịch làm việc', 'url': None},
            {'title': 'Thiết kế lịch', 'url': None},
        ],
        'tabs': get_thiet_ke_lich_tabs(),
    }
    return render(request, "hrm_manager/cham_cong/lich_lam_viec/thiet_ke_lich.html", context)

def view_tong_hop_lich(request):
    context = {
        'breadcrumbs': [
            {'title': 'Chấm công', 'url': '#'},
            {'title': 'Quản lý lịch làm việc', 'url': None},
            {'title': 'Tổng hợp lịch', 'url': None},
        ],
        'tabs': get_thiet_ke_lich_tabs(),
    }
    return render(request, "hrm_manager/cham_cong/lich_lam_viec/tong_hop_lich.html", context)

# --- 2. VIEWS: THIẾT KẾ LỊCH NGHỈ ---

def view_lich_nghi(request):
    context = {
        'breadcrumbs': [
            {'title': 'Chấm công', 'url': '#'},
            {'title': 'Lịch nghỉ', 'url': None},
            {'title': 'Thiết kế lịch nghỉ', 'url': None},
        ],
        'tabs': get_thiet_ke_nghi_tabs(),
    }
    return render(request, "hrm_manager/cham_cong/lich_nghi/lich_nghi.html", context)

def view_quy_nghi(request):
    context = {
        'breadcrumbs': [
            {'title': 'Chấm công', 'url': '#'},
            {'title': 'Lịch nghỉ', 'url': None},
            {'title': 'Quỹ nghỉ', 'url': None},
        ],
        'tabs': get_thiet_ke_nghi_tabs(),
    }
    return render(request, "hrm_manager/cham_cong/lich_nghi/quy_nghi.html", context)

def view_tong_hop_nghi(request):
    context = {
        'breadcrumbs': [
            {'title': 'Chấm công', 'url': '#'},
            {'title': 'Lịch nghỉ', 'url': None},
            {'title': 'Tổng hợp nghỉ', 'url': None},
        ],
        'tabs': get_thiet_ke_nghi_tabs(),
    }
    return render(request, "hrm_manager/cham_cong/lich_nghi/tong_hop_nghi.html", context)

# --- 3. VIEWS: THIẾT KẾ LÀM THÊM ---

def view_quytac_lam_them(request):
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
    context = {
        'breadcrumbs': [
            {'title': 'Chấm công', 'url': '#'},
            {'title': 'Quản lý làm thêm', 'url': None},
            {'title': 'Tổng hợp làm thêm', 'url': None},
        ],
        'tabs': get_lam_them_tabs(),
    }
    return render(request, "hrm_manager/cham_cong/lam_them/tong_hop_lam_them.html", context)

# --- 4. VIEWS: QUẢN LÝ CHẤM CÔNG ---

def view_bang_cham_cong(request):
    context = {
        'breadcrumbs': [
            {'title': 'Chấm công', 'url': '#'},
            {'title': 'Quản lý chấm công', 'url': None},
            {'title': 'Bảng chấm công', 'url': None},
        ],
    }
    
    return render(request, "hrm_manager/cham_cong/quan_ly/bang_cham_cong.html", context)

def view_tong_hop_cham_cong(request):
    context = {
        'breadcrumbs': [
            {'title': 'Chấm công', 'url': '#'},
            {'title': 'Quản lý chấm công', 'url': None},
            {'title': 'Tổng hợp chấm công', 'url': None},
        ],
    }
    return render(request, "hrm_manager/cham_cong/quan_ly/tong_hop_cham_cong.html", context)

def view_don_bao(request):
    return render(request, "hrm_manager/cham_cong/don_bao.html", {})

def view_bao_cao(request):
    return render(request, "hrm_manager/cham_cong/bao_cao.html", {})