from django.shortcuts import render
from django.urls import reverse
from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
from django.db.models import CharField, F, Value, Func, Count
from django.db.models.functions import Cast
from django.contrib.postgres.aggregates import JSONBAgg

from json import loads
import datetime as dt

from apps.hrm_manager.__core__.models import Bangchamcong, Phongban, Lichlamviecthucte, Calamviec, Khunggiolamviec, Nhanvien
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
@login_required
@require_http_methods(["GET", "POST"])
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
            groups_data = {}
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
                    key = f"INDIVIDUAL_{item['nhanvien_id']}"
                    
                if key not in groups_data:
                    groups_data[key] = []
                groups_data[key].append(item)
        
            # Tính lương
            payroll_calculator = PayrollCalculator(groups_data)
            ket_qua = payroll_calculator.calculate_all(field_formula='bieu_thuc', field_params='tham_so', field_id='nhanvien_id')

            return JsonResponse({
                'success':True,
                'message': 'Chấm công thành công',
                'data': ket_qua,
            }, status = 201)

        except Exception as e:
            return JsonResponse({
                'success':False,
                'message': f'Lỗi: {str(e)}'
            }, status = 400)

# @login_required
@require_http_methods(["GET"])
@csrf_exempt
def api_bang_cham_cong_nhan_vien_list(request):

    # load 
    day_input = request.GET.dict()
    
    # Query lịch làm việc Thực Tế
    lichlamviec_qs = Lichlamviecthucte.objects.filter(
        ngaylamviec=dt.date.fromisoformat(day_input.get("ngaylamviec"))
    ).values(
        "nhanvien_id", "calamviec_id"
    ).annotate(
        hovaten=F('nhanvien__hovaten'),
        manhanvien=F('nhanvien__manhanvien'),
        solanchamcongtrongngay=F('calamviec__solanchamcongtrongngay'),
        khunggiolamviec=JSONBAgg(
            Func(
                Value('thoigianbatdau'), Cast('calamviec__khunggiolamviec__thoigianbatdau', CharField()),
                Value('thoigianketthuc'), Cast('calamviec__khunggiolamviec__thoigianketthuc', CharField()),
                Value('thoigianchophepchamcongsomnhat'), Cast('calamviec__khunggiolamviec__thoigianchophepchamcongsomnhat', CharField()),
                Value('thoigianchophepvemuonnhat'), Cast('calamviec__khunggiolamviec__thoigianchophepvemuonnhat', CharField()),
                Value('thoigianchophepdenmuon'), F('calamviec__khunggiolamviec__thoigianchophepdenmuon'),
                Value('thoigiandimuonkhongtinhchamcong'), F('calamviec__khunggiolamviec__thoigiandimuonkhongtinhchamcong'),
                Value('thoigianchophepvesomnhat'), F('calamviec__khunggiolamviec__thoigianchophepvesomnhat'),
                Value('thoigianvesomkhongtinhchamcong'), F('calamviec__khunggiolamviec__thoigianvesomkhongtinhchamcong'),
                function='jsonb_build_object'
            ),
            # Sắp xếp khung giờ tăng dần để lấy đúng thứ tự
            ordering='calamviec__khunggiolamviec__created_at' 
        )
    )

    # Query tổng số lần đã chấm công của từng nhân viên trong ngày
    data_cham_cong = Bangchamcong.objects.filter(
        ngaylamviec=dt.date.fromisoformat(day_input.get("ngaylamviec"))
    ).values('nhanvien_id').annotate(total=Count('id'))

    # Map dữ liệu để tra cứu
    map_cham_cong = {item['nhanvien_id']: item['total'] for item in data_cham_cong}

    # Lọc danh sách nhân viên dựa trên số lần đã chấm công và quy định trong lịch làm việc
    final_result = []
    ds_lich = list(lichlamviec_qs) 

    for item in ds_lich:
        nhanvien_id = item['nhanvien_id']
        total_cham_cong = map_cham_cong.get(nhanvien_id, 0)
        max_limit = item.get("solanchamcongtrongngay", 0)
        
        # Nếu đã chấm đủ hoặc thừa số lần quy định -> Bỏ qua nhân viên này (không thêm vào kết quả)
        if total_cham_cong >= max_limit:
            continue

        list_khung_gio = item.get('khunggiolamviec', [])
        
        # Chỉ lấy khung giờ nếu index tồn tại
        if total_cham_cong < len(list_khung_gio):
            # Gán đè list bằng 1 object khung giờ duy nhất tương ứng
            item['khunggiolamviec'] = list_khung_gio[total_cham_cong]
            
            # Chỉ append khi logic hợp lệ
            final_result.append(item)
        else:
            continue

    return JsonResponse({
        'success': True, 
        'data': final_result,
    }, status=200)

# ============================================================
# VIEWS: ĐƠN BÁO & BÁO CÁO
# ============================================================

def view_don_bao(request):
    return render(request, "hrm_manager/cham_cong/don_bao.html", {})

def view_bao_cao(request):
    return render(request, "hrm_manager/cham_cong/bao_cao.html", {})