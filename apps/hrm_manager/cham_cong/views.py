from django.shortcuts import render
from django.urls import reverse
from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
from django.db.models import CharField, F, Value, Func, Count, OuterRef, Subquery, IntegerField
from django.db.models.functions import Cast, Coalesce
from django.contrib.postgres.aggregates import JSONBAgg

from json import loads
import datetime as dt

from apps.hrm_manager.__core__.models import Bangchamcong, Khunggionghitrua, Phongban, Lichlamviecthucte, Calamviec, Lichsucongtac
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
    try:
        ngay_lam_viec = dt.date.fromisoformat(request.GET.get("ngaylamviec"))
    except (ValueError, TypeError):
        return JsonResponse({'success': False, 'message': 'Ngày không hợp lệ'}, status=400)

    # Subquery đếm số lần chấm công của nhân viên trong ngày
    sq_count_chamcong = Bangchamcong.objects.filter(
        ngaylamviec=ngay_lam_viec,
        nhanvien=OuterRef('nhanvien_id')
    ).values('nhanvien').annotate(
        cnt=Count('id')
    ).values('cnt')

    # Main Query: Lấy lịch làm việc thực tế cùng các thông tin liên quan
    lichlamviec_qs = Lichlamviecthucte.objects.filter(
        ngaylamviec=ngay_lam_viec
    ).annotate(
        # Đếm số lần chấm công ngay trong SQL
        total_cham_cong=Coalesce(Subquery(sq_count_chamcong, output_field=IntegerField()), 0),
        solanchamcongtrongngay=F('calamviec__solanchamcongtrongngay'),
        sokhunggiotrongca=F('calamviec__sokhunggiotrongca')
    ).filter(
        # Chỉ lấy những người CHƯA chấm đủ công, Logic: total_cham_cong < solanchamcongtrongngay
        total_cham_cong__lt=F('solanchamcongtrongngay')
    ).values(
        "nhanvien_id", "calamviec_id", 
        "total_cham_cong", "solanchamcongtrongngay", "sokhunggiotrongca"
    ).annotate(
        hovaten=F('nhanvien__hovaten'),
        manhanvien=F('nhanvien__manhanvien'),
        loainv=F('nhanvien__loainv__id'),
        
        # Build JSON Khung giờ làm việc
        khunggiolamviec_list=JSONBAgg(
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
            ordering='calamviec__khunggiolamviec__created_at'
        )
    )

    ds_lich = list(lichlamviec_qs)
    
    if not ds_lich:
        return JsonResponse({'success': True, 'data': []}, status=200)

    # Lấy danh sách ID để dùng cho các query map
    nhanvien_ids = [item['nhanvien_id'] for item in ds_lich]
    calamviec_ids = set(item['calamviec_id'] for item in ds_lich)

    # Query lần lấy tất cả phòng ban của các nhân viên có trong list
    pb_qs = Lichsucongtac.objects.filter(
        nhanvien_id__in=nhanvien_ids,
        trangthai="active"
    ).values('nhanvien_id', 'phongban_id')
    
    # Tạo map: { nhanvien_id: phongban_id }
    map_phongban = {p['nhanvien_id']: p['phongban_id'] for p in pb_qs}

    # Query lấy tất cả nghỉ trưa của các ca làm việc có trong list
    nghitrua_qs = Calamviec.objects.filter(id__in=calamviec_ids).values('id').annotate(
        list_nghitrua=JSONBAgg(
            Func(
                Value('giobatdau'), Cast('khunggionghitrua__giobatdau', CharField()),
                Value('gioketthuc'), Cast('khunggionghitrua__gioketthuc', CharField()),
                function='jsonb_build_object'
            )
        )
    )
    map_nghitrua = {item['id']: item['list_nghitrua'] for item in nghitrua_qs}

    # --- GỘP dữ liệu ---
    final_result = []
    
    for item in ds_lich:
        item['phongban_id'] = map_phongban.get(item['nhanvien_id'])  # Gán phòng ban từ Map (Nhanh hơn subquery)
        item['khunggionghitrua'] = map_nghitrua.get(item['calamviec_id'], [])  # Gán nghỉ trưa
        
        # Logic chọn khung giờ (Merge Shift)
        list_khung_gio = item.pop('khunggiolamviec_list', []) # Đổi tên field tạm để xử lý
        idx = item['total_cham_cong'] # Đã tính ở DB

        # Safety check: Đảm bảo index nằm trong range (dù DB đã filter nhưng vẫn nên check)
        if idx < len(list_khung_gio):
            # Logic gộp ca: Nhiều khung giờ nhưng chỉ yêu cầu chấm 1 lần
            if item['sokhunggiotrongca'] > 1 and item['solanchamcongtrongngay'] == 1:
                target_kg = list_khung_gio[0]
                last_kg = list_khung_gio[-1]
                
                # Merge thông tin ra về
                target_kg.update({
                    'thoigianketthuc': last_kg['thoigianketthuc'],
                    'thoigianchophepvesomnhat': last_kg['thoigianchophepvesomnhat'],
                    'thoigianchophepvemuonnhat': last_kg['thoigianchophepvemuonnhat'],
                    'thoigianvesomkhongtinhchamcong': last_kg['thoigianvesomkhongtinhchamcong']
                })
                item['khunggiolamviec'] = target_kg
            else:
                # Lấy đúng khung giờ theo thứ tự lần chấm
                item['khunggiolamviec'] = list_khung_gio[idx]
            
            final_result.append(item)

    return JsonResponse({'success': True, 'data': final_result}, status=200)

# ============================================================
# VIEWS: ĐƠN BÁO & BÁO CÁO
# ============================================================

def view_don_bao(request):
    return render(request, "hrm_manager/cham_cong/don_bao.html", {})

def view_bao_cao(request):
    return render(request, "hrm_manager/cham_cong/bao_cao.html", {})