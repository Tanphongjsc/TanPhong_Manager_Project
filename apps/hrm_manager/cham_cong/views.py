from django.shortcuts import render
from django.urls import reverse
from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt

from json import loads

from apps.hrm_manager.__core__.models import Phongban 
from apps.hrm_manager.cham_cong.services import PayrollCalculator

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
            {'title': 'Bảng chấm công', 'url': None},
        ],
        'tabs': [
            {'label': 'Văn Phòng', 'url': '#tab-vp', 'url_name': 'tab_vp'},
            {'label': 'Sản Xuất', 'url': '#tab-sx', 'url_name': 'tab_sx'},
        ],
        'dept_options': Phongban.objects.filter(trangthai=True).values().order_by('tenphongban'),
    }
    return render(request, "hrm_manager/cham_cong/bang_cham_cong.html", context)

def view_tong_hop_cham_cong(request):
    """Tổng hợp chấm công"""
    context = {
        'breadcrumbs': [
            {'title': 'Chấm công', 'url': '#'},
            {'title': 'Quản lý chấm công', 'url': None},
            {'title': 'Tổng hợp chấm công', 'url': None},
        ],
    }
    return render(request, "hrm_manager/cham_cong/quan_ly/tong_hop_cham_cong.html", context)


# ================ API CHO BẢNG CHẤM CÔNG ================
# @login_required
# @require_http_methods(["GET", "POST"])
@csrf_exempt
def api_bang_cham_cong_list(request):
    """API cung cấp dữ liệu bảng chấm công dưới dạng JSON"""

    if request.method == 'GET':
        # Lấy dữ liệu chấm công
        return JsonResponse({'error': 'Phương thức không được phép'}, status=405)
    
    elif request.method == 'POST':
        # Thực hiện lưu dữ liệu chấm công
        try:
            data_list = loads(request.body)

            # Xử lý dữ liệu
            groups = {}
            for item in data_list:
                # 1. Parse JSON
                if isinstance(item['thamsotinhluong'], str):
                        config = loads(item['thamsotinhluong'])
                else:
                    config = item['thamsotinhluong'] # Đã là dict rồi
                
                # 2. Gán vào item để Class PayrollCalculator dùng
                item['tham_so'] = config.get('tham_so', {})
                item['bieu_thuc'] = config.get('bieu_thuc', '')
                loaicv = config.get('loaicv', 'canhan') 
                
                # 3. Tạo Key nhóm
                if loaicv == 'nhom':
                    # Prefix để tránh trùng với ID cá nhân
                    key = f"TEAM_{item.get('congviec_id')}" 
                else:
                    # Mỗi cá nhân là 1 nhóm riêng biệt
                    key = f"INDIVIDUAL_{item['id']}"
                    
                if key not in groups:
                    groups[key] = []
                groups[key].append(item)
        
            # Tính lương
            payroll_calculator = PayrollCalculator()
            ket_qua = payroll_calculator.calculate_all()

            # Gán kết quả trở lại data
            for item in data_list:
                item['thanhtien'] = ket_qua.get(item['id'], 0)

            return JsonResponse({
                'success':True,
                'message': 'Chấm công thành công',
                'data': data_list,
            }, status = 201)

        except Exception as e:
            return JsonResponse({
                'success':False,
                'message': f'Lỗi: {str(e)}'
            }, status = 400)


# ============================================================
# VIEWS: ĐƠN BÁO & BÁO CÁO
# ============================================================

def view_don_bao(request):
    return render(request, "hrm_manager/cham_cong/don_bao.html", {})

def view_bao_cao(request):
    return render(request, "hrm_manager/cham_cong/bao_cao.html", {})