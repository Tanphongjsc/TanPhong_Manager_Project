from django.shortcuts import render, get_object_or_404
from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.utils.timezone import now
from django.db import transaction
from django.db.models import F, Q, Sum, Count, Exists, OuterRef, FloatField
from django.urls import reverse
from django.db.models.functions import Coalesce

from apps.hrm_manager.__core__.models import (Bangluong, Phantuluong, Nhomphantuluong, Thietlapsolieucodinh, Phieuluong, Quytacchedoluong, Bangchamcong, 
                                              Lichsucongtac, Ctphieuluong, NhanvienChedoluong, Chedoluong, Kyluong, PhongbanChedoluong, Phongban, Lichlamviecthucte)

from json import loads, dumps
from collections import defaultdict
import logging
from datetime import date, datetime, timedelta
from apps.hrm_manager.cham_cong.services import PayrollCalculator
from apps.hrm_manager.utils.view_helpers import (
    get_list_context,
    json_response,
    json_error,
    json_success,
    get_object_or_json_error,
    validate_required_fields,
    validate_unique_field,
    get_field_value,
    safe_delete,
    handle_exceptions,
    paginate_queryset,
    get_request_data,
    search_queryset, filter_by_field, filter_by_status
)

from .services import ( 
    CheDoLuongService, 
    PayrollPeriodLockException, 
    ActiveEmployeesExistException, 
    ConflictException, 
    KyLuongService,
    BangLuongService
)


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================
def genarate_phieu_luong_from_bang_luong(bang_luong_id):
    """
    Sinh phiếu lương cho bảng lương đã chọn, gom dữ liệu, áp dụng công thức động, trả về kết quả từng nhân viên.
    """
    # 1. Lấy thông tin bảng lương, kỳ lương, chế độ lương
    try:
        bangluong_obj = Bangluong.objects.select_related('kyluong', 'chedoluong').get(id=bang_luong_id)
    except Bangluong.DoesNotExist:
        return None, "Bảng lương không tồn tại"
    thoigian_batdau = bangluong_obj.kyluong.ngaybatdau
    thoigian_ketthuc = bangluong_obj.kyluong.ngayketthuc
    chedoluong_id = bangluong_obj.chedoluong_id

    # 1.5. Lấy danh sách nhân viên ACTIVE được cấu hình trong chế độ lương của bảng lương này
    nhanvien_ids = list(Lichsucongtac.objects.filter(
        trangthai='active',
        nhanvien_id__in=NhanvienChedoluong.objects.filter(
            chedoluong_id=chedoluong_id,
            trangthai='active'
        ).values('nhanvien_id')
    ).values_list('nhanvien_id', flat=True).distinct().order_by('nhanvien_id'))

    # 2. Lấy danh sách quy tắc tính lương (rules) đang active cho chế độ lương này
    rules_qs = Quytacchedoluong.objects.filter(
        chedoluong_id=chedoluong_id, trangthai='active'
    ).values(
        'maquytac', 'bieuthuctinhtoan', 'nguondulieu', 'phantuluong', 'phantuluong__loaiphantu'
    )
    rules_list = list(rules_qs)
    #Check quy tắc rỗng trước khi sinh phiếu
    if not rules_list:
        return None, "Chế độ lương chưa có quy tắc tính lương nào. Vui lòng thiết lập quy tắc trước."
    
    # Các mã quy tắc cần tính bằng công thức
    formula_keys = [r['maquytac'] for r in rules_list if r['nguondulieu'].strip().lower() == 'formula']

    # 3. Lấy dữ liệu chấm công tổng hợp theo nhân viên trong kỳ lương
    bcc_data = Bangchamcong.objects.filter(
        nhanvien_id__in=nhanvien_ids,
        ngaylamviec__range=[thoigian_batdau, thoigian_ketthuc]
    ).values('nhanvien').annotate(
        tong_so_luong_an=Count('coantrua', filter=Q(coantrua=True)),
        tong_thoigian_lamviec=(
            Coalesce(Sum('thoigianlamviec'), 0.0, output_field=FloatField()) +
            Coalesce(Sum('thoigiandisom'), 0.0, output_field=FloatField()) +
            Coalesce(Sum('thoigianvemuon'), 0.0, output_field=FloatField())
        ) / 60.0,
        tong_thoigian_lamthem=Coalesce(Sum('thoigianlamthem'), 0.0, output_field=FloatField()) / 60.0,
        tong_cong_lamviec=Coalesce(Sum('conglamviec'), 0.0, output_field=FloatField()),
        tong_cong_vp_thucte=(Coalesce(Sum('conglamviec', filter=Q(loaichamcong='VP')), 0.0, output_field=FloatField())),
        tong_tien_sx=Coalesce(Sum('thanhtien', filter=Q(loaichamcong='SX')), 0.0, output_field=FloatField()),
    )
    bcc_dict = {item['nhanvien']: item for item in bcc_data}
    if not bcc_dict:
        return None, "Chưa có dữ liệu chấm công trong kỳ lương"
    
    # 3.5 Lấy ra số công số giờ làm chuẩn từ Lịch làm việc thực tế + Ca làm việc (cho các nhân viên đã lọc)
    lich_lam_viec_qs = Lichlamviecthucte.objects.filter(
        nhanvien_id__in=nhanvien_ids,
        ngaylamviec__range=[thoigian_batdau, thoigian_ketthuc]
    ).values('nhanvien').annotate(tong_cong_lamviec_thucte=Sum('calamviec__congcuacalamviec'))
    # Chuyển về dict {nhanvien_id: tong_cong_lamviec}
    lich_lam_viec_dict = {item['nhanvien']: item['tong_cong_lamviec_thucte'] for item in lich_lam_viec_qs}

    # 4. Lấy dữ liệu thiết lập số liệu cố định cho từng nhân viên
    setup_data = Thietlapsolieucodinh.objects.filter(
        nhanvien_id__in=nhanvien_ids, trangthai='active'
    ).values('nhanvien', 'phantuluong', 'giatrimacdinh')
    setup_dict = defaultdict(dict)
    for item in setup_data:
        # Chuyển giá trị về float an toàn
        try:
            val = float(item['giatrimacdinh']) if item['giatrimacdinh'] is not None else None
        except (TypeError, ValueError):
            val = 0.0
        setup_dict[item['nhanvien']][item['phantuluong']] = val

    # 5. Chuẩn bị dữ liệu đầu vào cho PayrollCalculator Dạng: { 'ID_NV': [ { 'tham_so': {...} } ] }
    data_groups_map = {}
    for nv_id in nhanvien_ids:
        nv_bcc = bcc_dict.get(nv_id, {})
        nv_setup = setup_dict.get(nv_id, {})
        context_params = {}
        
        # A. Dữ liệu biến động từ chấm công
        context_params['SO_LUONG_AN'] = float(nv_bcc.get('tong_so_luong_an', 0)) # Số lượng ăn
        context_params['SO_CONG_LAM_VIEC'] = float(nv_bcc.get('tong_cong_lamviec', 0)) # Số công làm việc

        cong_chuan_thang = lich_lam_viec_dict.get(nv_id, 26)
        if cong_chuan_thang <= 0:
            cong_chuan_thang = 26
        context_params['CONG_CHUAN_THANG'] = cong_chuan_thang

        # B. Dữ liệu từ rules: system/manual/formula
        for rule in rules_list:
            ma_qt = rule['maquytac']
            src = rule['nguondulieu'].strip().lower()
            
            # Nếu đã có giá trị từ chấm công hoặc thiết lập cố định thì không ghi đè, ưu tiên nguồn đó hơn là rule
            if ma_qt in context_params:
                continue

            if src == 'system':
                if ma_qt == 'LUONG_CO_BAN':  
                    luong_co_ban_thiet_lap = float(nv_setup.get(rule['phantuluong'], 0) or 0)

                    context_params[ma_qt] = round(
                        ((luong_co_ban_thiet_lap / cong_chuan_thang) * nv_bcc.get('tong_cong_vp_thucte', 0)) + nv_bcc.get('tong_tien_sx', 0),
                        2
                    )
                else:
                    context_params[ma_qt] = nv_setup.get(rule['phantuluong'], 0.0)
            elif src == 'manual':
                context_params[ma_qt] = None # Chờ nhập liệu tay
            elif src == 'formula':
                # Gán chuỗi công thức, sẽ được tính động khi cần
                context_params[ma_qt] = rule['bieuthuctinhtoan']

        # Đóng gói dữ liệu cho từng nhân viên
        data_groups_map[str(nv_id)] = [{
            'tham_so': context_params,
            'nhanvien_id': nv_id
        }]

    # 6. Khởi tạo PayrollCalculator và tính toán các trường công thức cho từng nhân viên
    payroll_calculator = PayrollCalculator(data_groups_map)
    phieu_luong_final = {}
    for nv_id_str, members in data_groups_map.items():
        member_data = members[0]
        params = member_data['tham_so']
        # Tính tất cả các trường công thức cho nhân viên này
        calculated_results = payroll_calculator.calculate_batch_fields(
            field_keys=formula_keys,
            params=params,
            group_id=nv_id_str
        )
        # Cập nhật lại params với kết quả vừa tính
        params.update(calculated_results)
        
        # 7. Định dạng kết quả đầu ra cho từng nhân viên
        nv_id = int(nv_id_str)
        phieu_luong_final[nv_id] = {}
        for rule in rules_list:
            ma_qt = rule['maquytac']
            val = params.get(ma_qt)
            phieu_luong_final[nv_id][rule['phantuluong']] = {
                "value": round(val, 2) if val is not None else None,
                "type": rule['phantuluong__loaiphantu'],
                "status": "calculated" if val is not None else rule['nguondulieu'].strip().lower(),
                "formula": rule['bieuthuctinhtoan']
            }

    # Trả về danh sách phần tử lương và phiếu lương từng nhân viên
    return {
        "phan_tu_luong": [r['phantuluong'] for r in rules_list],
        "phieu_luong": phieu_luong_final
    }, "Tạo phiếu lương thành công"


# ============================================================================
# VIEW URLS - TRANG CHÍNH
# ============================================================================

# ------------------------------- PHẦN TỬ LƯƠNG ------------------------------
@login_required
def view_phan_tu_luong(request):
    context = {
        'breadcrumbs': [
            {'title': 'Quản lý lương', 'url': '#'},
            {'title': 'Phần tử lương', 'url': None},
        ],
        'tabs': [
            {'label': 'Danh sách phần tử lương', 'url': '#tab-elements', 'url_name': 'tab_elements'},
            {'label': 'Quản lý thông tin lương', 'url': '#tab-info', 'url_name': 'tab_info'},
        ]
    }

    return render(request, 'hrm_manager/quan_ly_luong/phan_tu_luong.html', context)


# ------------------------------- PHIẾU LƯƠNG ------------------------------
@login_required
def view_phieu_luong(request, bangluong_id=None):
    """Render phiếu lương page.
    """
    # Prefer path parameter; fallback to query-string if not provided
    bangluong_id = bangluong_id or request.GET.get('bangluong_id')
    bangluong_qs = Bangluong.objects.filter(id=bangluong_id).first()
    if bangluong_qs is None:
        return render(request, 'registration/404.html', {})

    context = {
        'breadcrumbs': [
            {'title': 'Quản lý lương', 'url': '#'},
            {'title': 'Phiếu lương', 'url': None},
        ],
        'bangluong': bangluong_qs,
    }

    return render(request, 'hrm_manager/quan_ly_luong/phieu_luong_main.html', context)





# ============================================================================
# API URLS
# ============================================================================

# ------------------------------- PHẦN TỬ LƯƠNG ------------------------------
# @login_required
@require_http_methods(["GET", "POST"])
def api_phan_tu_luong_list(request):
    """API lấy danh sách phần tử lương"""

    group_params = request.GET.get('is_group', False)
    
    if request.method == 'GET':
        # Lấy danh sách phần tử lương
        phan_tu_luong_qs = (
            Phantuluong.objects.select_related('nhomphantu')
            .values('id', 'tenphantu', 'maphantu', 'loaiphantu', 'nhomphantu', 'mota', 'trangthai')
            .annotate(nhomphantu_ten=F('nhomphantu__tennhom'))
            .order_by('id')
        )

        phan_tu_luong_qs = search_queryset(request, phan_tu_luong_qs, ('maphantu', 'tenphantu'))
        phan_tu_luong_qs = filter_by_field(request, phan_tu_luong_qs, 'loaiphantu', 'type')
        phan_tu_luong_qs = filter_by_field(request, phan_tu_luong_qs, 'nhomphantu', 'group')
        page_obj, paginator = paginate_queryset(request, phan_tu_luong_qs, default_page_size=int(request.GET.get('page_size', 10)))

        # Nhóm phần tử nếu có tham số group_params
        data = defaultdict(list)
        if group_params:
            for item in list(page_obj):
                if item['nhomphantu'] not in data:
                    data[item['nhomphantu']] = {
                        'nhomphantu': item['nhomphantu'],
                        'nhomphantu_ten': item['nhomphantu_ten'],
                        'elements': []
                    }
                data[item['nhomphantu']]['elements'].append(item)
        else:
            data = list(page_obj)

        return json_success(
            'Lấy danh sách phần tử thành công',
            data=data,
            pagination={
                'page': page_obj.number,
                'page_size': paginator.per_page,
                'total': paginator.count,
                'total_pages': paginator.num_pages,
                'has_next': page_obj.has_next(),
                'has_prev': page_obj.has_previous()
            }
        )

    elif request.method == 'POST':
        # Xử lý tạo mới phần tử lương
        try:
            data = loads(request.body)
        except :
            return json_error('Dữ liệu không hợp lệ', status=400)

        # ✅ BỔ SUNG #10: Validate unique mã phần tử
        maphantu = data.get('maphantu', '').strip()
        if maphantu:
            if not validate_unique_field(Phantuluong, 'maphantu', maphantu):
                return json_error('Mã phần tử lương đã tồn tại', status=400)
            
        phantu_luong_obj = Phantuluong.objects.create(
            tenphantu = data.get('tenphantu', '').strip().title(),
            maphantu = data.get('maphantu', '').strip(),
            loaiphantu = data.get('loaiphantu').strip(),
            nhomphantu_id = data.get('nhomphantu'),
            mota = data.get('mota', '').strip(),
            trangthai = "active",
            created_at = now().date(),
        )

        return json_success(
            'Lưu phần tử lương thành công',
            data={
                'id': phantu_luong_obj.id,
                'tenphantu': phantu_luong_obj.tenphantu,
                'maphantu': phantu_luong_obj.maphantu,
                'loaiphantu': phantu_luong_obj.loaiphantu,
                'nhomphantu': phantu_luong_obj.nhomphantu_id,
                'mota': phantu_luong_obj.mota,
                'trangthai': phantu_luong_obj.trangthai,
            }
        )


@login_required
@require_http_methods(["GET", "PUT", "DELETE"])
def api_phan_tu_luong_detail(request, pk):
    """API lấy chi tiết phần tử lương"""

    try:
        phan_tu_luong = Phantuluong.objects.get(id=pk)
    except Phantuluong.DoesNotExist:
        return json_error('Không tìm thấy phần tử lương',status=404)

    if request.method == 'GET':
        # Lấy chi tiết phần tử lương
        return json_response(
            message='Lấy chi tiết phần tử lương thành công',
            data = {
                'id': phan_tu_luong.id,
                'tenphantu': phan_tu_luong.tenphantu,
                'maphantu': phan_tu_luong.maphantu,
                'loaiphantu': phan_tu_luong.loaiphantu,
                'nhomphantu': phan_tu_luong.nhomphantu_id,
                'mota': phan_tu_luong.mota,
                'trangthai': phan_tu_luong.trangthai,
            }
        )

    elif request.method == 'PUT':
        # Cập nhật phần tử lương
        try:
            data = loads(request.body)

            # ✅ BỔ SUNG #10: Validate unique mã phần tử khi update
            maphantu = data.get('maphantu', phan_tu_luong.maphantu).strip()
            if maphantu != phan_tu_luong.maphantu:
                if not validate_unique_field(Phantuluong, 'maphantu', maphantu, exclude_pk=phan_tu_luong.id):
                    return json_error('Mã phần tử lương đã tồn tại', status=400)
                
            phan_tu_luong.tenphantu = data.get('tenphantu', phan_tu_luong.tenphantu).strip().title()
            phan_tu_luong.maphantu = data.get('maphantu', phan_tu_luong.maphantu).strip()
            phan_tu_luong.loaiphantu = data.get('loaiphantu', phan_tu_luong.loaiphantu).strip()
            phan_tu_luong.nhomphantu_id = data.get('nhomphantu', phan_tu_luong.nhomphantu_id)
            phan_tu_luong.mota = data.get('mota', phan_tu_luong.mota).strip()
            phan_tu_luong.trangthai = data.get('trangthai', phan_tu_luong.trangthai).strip().lower()
            phan_tu_luong.updated_at = now().date()

            phan_tu_luong.save()

            return json_response(
                message='Cập nhật phần tử lương thành công',
                data={
                    'id': phan_tu_luong.id,
                    'tenphantu': phan_tu_luong.tenphantu,
                    'maphantu': phan_tu_luong.maphantu,
                    'loaiphantu': phan_tu_luong.loaiphantu,
                    'nhomphantu': phan_tu_luong.nhomphantu_id,
                    'mota': phan_tu_luong.mota,
                    'trangthai': phan_tu_luong.trangthai,
                }
            )

        except :
            return json_error('Dữ liệu không hợp lệ hoặc lỗi trong quá trình cập nhật', status=400)

    elif request.method == 'DELETE':
        # ✅ BỔ SUNG: Check phần tử lương đang được sử dụng trong quy tắc chế độ lương
        is_used_in_rule = Quytacchedoluong.objects.filter(
            phantuluong=phan_tu_luong,
            trangthai='active'
        ).exists()
        if is_used_in_rule:
            return json_error(
                'Không thể xóa: Phần tử lương đang được sử dụng trong quy tắc chế độ lương đang hoạt động',
                status=400
            )

        # ✅ BỔ SUNG: Check phần tử lương đang có dữ liệu thiết lập số liệu cố định
        is_used_in_setup = Thietlapsolieucodinh.objects.filter(
            phantuluong=phan_tu_luong,
            trangthai='active'
        ).exists()
        if is_used_in_setup:
            return json_error(
                'Không thể xóa: Phần tử lương đang có dữ liệu thiết lập số liệu cố định',
                status=400
            )

        # ✅ BỔ SUNG: Check phần tử lương đã xuất hiện trong chi tiết phiếu lương
        is_used_in_payslip = Ctphieuluong.objects.filter(
            phantuluong_id=phan_tu_luong.id
        ).exists()
        if is_used_in_payslip:
            # Có dữ liệu lịch sử → chỉ cho inactive, không xóa cứng
            phan_tu_luong.trangthai = 'inactive'
            phan_tu_luong.updated_at = now().date()
            phan_tu_luong.save()
            return json_response(message='Phần tử lương đã có dữ liệu phiếu lương, đã chuyển sang trạng thái ngừng hoạt động')
        # Xóa phần tử lương
        try:        
            phan_tu_luong.delete()
            return json_response(message='Xóa phần tử lương thành công')
        except :
            return json_error('Lỗi trong quá trình xóa phần tử lương', status=400)


@login_required
@require_http_methods(["POST"])
def api_phan_tu_luong_toggle_status(request, id):
    """API bật/tắt trạng thái phần tử lương"""
    try:
        phan_tu_luong = Phantuluong.objects.get(id=id)
    except:
        return json_error('Không tìm thấy phần tử lương', status=404)

    # ✅ BỔ SUNG: Nếu đang active muốn tắt → check ràng buộc
    if phan_tu_luong.trangthai == 'active':
        is_used_in_active_rule = Quytacchedoluong.objects.filter(
            phantuluong=phan_tu_luong,
            trangthai='active',
            chedoluong__trangthai='active'
        ).filter(
            Q(chedoluong__is_deleted=False) | Q(chedoluong__is_deleted__isnull=True)
        ).exists()

        if is_used_in_active_rule:
            return json_error(
                'Không thể tắt: Phần tử lương đang được sử dụng trong quy tắc chế độ lương đang hoạt động',
                status=400
            )
        
    # Chuyển đổi trạng thái
    if phan_tu_luong.trangthai == 'active':
        phan_tu_luong.trangthai = 'inactive'
    else:
        phan_tu_luong.trangthai = 'active'
    
    phan_tu_luong.updated_at = now().date()
    phan_tu_luong.save()

    return json_response(
        message='Chuyển đổi trạng thái phần tử lương thành công',
        data={
            'id': phan_tu_luong.id,
            'trangthai': phan_tu_luong.trangthai,
        }
    )

# ------------------------------- NHÓM PHẦN TỬ LƯƠNG ------------------------------
# @login_required
@require_http_methods(["GET", "POST"])
def api_nhom_phan_tu_luong_list(request):
    """API lấy danh sách nhom phần tử lương"""
    
    if request.method == 'GET':
        # Lấy danh sách nhom phần tử lương

        nhom_phan_tu_luong_qs = Nhomphantuluong.objects.all().values().order_by('id')
        nhom_phan_tu_luong_qs = search_queryset(request, nhom_phan_tu_luong_qs, ('manhom', 'tennhom'))

        page_obj, paginator = paginate_queryset(request, nhom_phan_tu_luong_qs, default_page_size=int(request.GET.get('page_size', 10)))

        return json_success(
            'Lấy danh sách nhóm phần tử thành công',
            data=list(page_obj),
            pagination={
                'page': page_obj.number,
                'page_size': paginator.per_page,
                'total': paginator.count,
                'total_pages': paginator.num_pages,
                'has_next': page_obj.has_next(),
                'has_prev': page_obj.has_previous()
            }
        )

    elif request.method == 'POST':
        # Xử lý tạo mới Nhóm phần tử lương
        try:
            data = loads(request.body)
        except :
            return json_error('Dữ liệu không hợp lệ', status=400)
        
         # ✅ BỔ SUNG #9: Validate unique mã nhóm
        manhom = data.get('manhom', '').strip()
        if manhom:
            if not validate_unique_field(Nhomphantuluong, 'manhom', manhom):
                return json_error('Mã nhóm phần tử lương đã tồn tại', status=400)
            
        nhom_phan_tu_luong_obj = Nhomphantuluong.objects.create(
            manhom = data.get('manhom', '').strip(),
            tennhom = data.get('tennhom', '').strip().title(),
            created_at = now().date(),
        )

        return json_success(
            'Lưu nhóm phần tử lương thành công',
            data={
                'tennhom': nhom_phan_tu_luong_obj.tennhom,
                'manhom': nhom_phan_tu_luong_obj.manhom,
            }
        )

@login_required
@require_http_methods(["GET", "PUT", "DELETE"])
def api_nhom_phan_tu_luong_detail(request, pk):
    """API lấy chi tiết phần tử lương"""

    try:
        nhom_phan_tu_luong = Nhomphantuluong.objects.get(id=pk)
    except Nhomphantuluong.DoesNotExist:
        return json_error('Không tìm thấy nhóm phần tử lương',status=404)

    if request.method == 'GET':
        # Lấy chi tiết phần tử lương
        return json_response(
            message='Lấy chi tiết phần tử lương thành công',
            data = {
                'id': nhom_phan_tu_luong.id,
                'tennhom': nhom_phan_tu_luong.tennhom,
                'manhom': nhom_phan_tu_luong.manhom,
            }
        )

    elif request.method == 'PUT':
        # Cập nhật phần tử lương
        try:
            data = loads(request.body)

            # ✅ BỔ SUNG #9: Validate unique mã nhóm khi update
            manhom = data.get('manhom', nhom_phan_tu_luong.manhom).strip()
            if manhom != nhom_phan_tu_luong.manhom:
                if not validate_unique_field(Nhomphantuluong, 'manhom', manhom, exclude_pk=nhom_phan_tu_luong.id):
                    return json_error('Mã nhóm phần tử lương đã tồn tại', status=400)
                
            nhom_phan_tu_luong.tennhom = data.get('tennhom', nhom_phan_tu_luong.tennhom).strip().title()
            nhom_phan_tu_luong.manhom = data.get('manhom', nhom_phan_tu_luong.manhom).strip()
            nhom_phan_tu_luong.updated_at = now().date()

            nhom_phan_tu_luong.save()

            return json_response(
                message='Cập nhật nhóm phần tử lương thành công',
                data={
                    'id': nhom_phan_tu_luong.id,
                    'tennhom': nhom_phan_tu_luong.tennhom,
                    'manhom': nhom_phan_tu_luong.manhom,
                }
            )

        except :
            return json_error('Dữ liệu không hợp lệ hoặc lỗi trong quá trình cập nhật', status=400)

    elif request.method == 'DELETE':
        # ✅ BỔ SUNG: Check nhóm còn chứa phần tử lương active
        has_active_elements = Phantuluong.objects.filter(
            nhomphantu=nhom_phan_tu_luong,
            trangthai='active'
        ).exists()
        if has_active_elements:
            return json_error(
                'Không thể xóa: Nhóm phần tử lương đang chứa các phần tử lương đang hoạt động',
                status=400
            )
        # Xóa phần tử lương
        try:        
            nhom_phan_tu_luong.delete()
            return json_response(message='Xóa nhóm phần tử lương thành công')
        except :
            return json_error('Lỗi trong quá trình xóa nhóm phần tử lương', status=400)

# ------------------------------- SETUP GIÁ TRỊ MẶC ĐỊNH PHẦN TỬ LƯƠNG ------------------------------

# @login_required
@require_http_methods(["GET", "POST"])
@transaction.atomic
def api_phan_tu_luong_setup_params(request):
    """API thiết lập các giá trị mặc định cho phần tử lương"""

    if request.method == 'GET':
        # Lấy danh sách nhóm phần tử lương
        phantu_luong_setup_qs = Thietlapsolieucodinh.objects.select_related('phantuluong', 'nhanvien').filter(trangthai='active').values()
        phantu_luong_id = phantu_luong_setup_qs.values_list('phantuluong_id', flat=True).distinct().order_by('phantuluong__nhomphantu__id', 'phantuluong__id')
    
        # Chuẩn hóa dữ liệu trả về
        data_nhanvien_phantuluong = defaultdict(dict)
        for item in phantu_luong_setup_qs:
            if item.get("nhanvien_id") not in data_nhanvien_phantuluong:
                data_nhanvien_phantuluong[item.get("nhanvien_id")] = {}
            data_nhanvien_phantuluong[item.get("nhanvien_id")][item.get("phantuluong_id")] = item.get("giatrimacdinh")

        return json_success(
            'Lấy danh sách nhóm phần tử lương thành công',
            data={
                'phan_tu_luong': list(phantu_luong_id),
                'set_up_phan_tu_luong': data_nhanvien_phantuluong,
            }
        )

    elif request.method == 'POST':
        # Xử lý dữ liệu đầu vào an toàn
        try:
            raw_data = loads(request.body)
            employees_data = raw_data.get('employees', {})
            
            if not employees_data:
                return json_error('Dữ liệu không hợp lệ: Rỗng', status=400)
            employees_id = list(employees_data.keys())

        except:
            return json_error('Dữ liệu không hợp lệ: Sai định dạng JSON', status=400)

        # Chuẩn bị dữ liệu: {(nhanvien_id, phantuluong_id): value}
        input_mapping = {}
        try:
            for emp_id, salary_elements in employees_data.items():
                for salary_id, value in salary_elements.items():
                    input_mapping[(int(emp_id), int(salary_id))] = value
        except (ValueError, TypeError):
            return json_error('Dữ liệu ID hoặc giá trị không hợp lệ', status=400)

        # Các list chứa object để bulk operations
        to_create = []
        to_update = []
        
        # Lấy dữ liệu cũ đang active
        current_qs = Thietlapsolieucodinh.objects.select_related('nhanvien', 'phantuluong').filter(trangthai='active', nhanvien_id__in=employees_id)
        today = now().date()

        # Duyệt qua các bản ghi đang có trong DB
        for item in current_qs:
            key = (item.nhanvien_id, item.phantuluong_id)
            
            # CASE A: Bản ghi này CÓ trong dữ liệu gửi lên
            if key in input_mapping:
                new_value = input_mapping[key]
                
                # Nếu giá trị thay đổi -> Inactive cũ, Tạo mới
                if int(item.giatrimacdinh) != int(new_value):
                    # Đánh dấu bản ghi cũ là inactive
                    item.trangthai = 'inactive'
                    item.updated_at = today
                    to_update.append(item)
                    
                    # Tạo bản ghi mới
                    to_create.append(Thietlapsolieucodinh(
                        nhanvien_id=item.nhanvien_id,
                        phantuluong_id=item.phantuluong_id,
                        giatrimacdinh=new_value,
                        trangthai='active',
                        created_at=today
                    ))
                
                # Dữ liệu này đã xử lý xong, xóa khỏi mapping để không lặp lại ở bước tạo mới
                del input_mapping[key]
            
            # CASE B: Bản ghi này KHÔNG CÓ trong dữ liệu gửi lên
            else:
                item.trangthai = 'inactive'
                item.updated_at = today
                to_update.append(item)

        # Xử lý các dữ liệu còn lại trong input_mapping (Là các bản ghi hoàn toàn mới)
        for (emp_id, salary_id), value in input_mapping.items():
            to_create.append(Thietlapsolieucodinh(
                nhanvien_id=emp_id,
                phantuluong_id=salary_id,
                giatrimacdinh=value,
                trangthai='active',
                created_at=today
            ))

        # Thực thi lưu vào Database
        if to_update:
            Thietlapsolieucodinh.objects.bulk_update(to_update, ['trangthai', 'updated_at'])
        
        if to_create:
            Thietlapsolieucodinh.objects.bulk_create(to_create)

        return json_success('Lưu thiết lập số liệu cố định phần tử lương thành công')


# ------------------------------ PHIẾU LƯƠNG ------------------------------
# @login_required
@require_http_methods(["GET", "POST"])
@transaction.atomic
@csrf_exempt
def api_phieu_luong_list(request):
    if request.method == 'GET':
        bang_luong_id = request.GET.get('bangluong_id', None)
        if not bang_luong_id:
            return json_error('Thiếu tham số bangluong_id', status=400)

        # ✅ BỔ SUNG: Check trạng thái bảng lương trước khi sinh phiếu
        try:
            bl_obj = Bangluong.objects.get(id=bang_luong_id)
            blocked_statuses = ['approved', 'paid', 'cancelled']
            if bl_obj.trangthai in blocked_statuses:
                if not Phieuluong.objects.filter(bangluong_id=bang_luong_id).exists():
                    return json_error(
                        f'Bảng lương đã ở trạng thái "{BangLuongService.get_status_display(bl_obj.trangthai)}", không thể sinh phiếu lương mới'
                    )
        except Bangluong.DoesNotExist:
            return json_error('Bảng lương không tồn tại', status=400)
        
        if not Phieuluong.objects.filter(bangluong_id=bang_luong_id).exists():
            data, message = genarate_phieu_luong_from_bang_luong(bang_luong_id)
            if data:
                # ✅ THÊM: Chuyển bảng lương sang processing khi bắt đầu sinh phiếu
                Bangluong.objects.filter(
                    id=bang_luong_id, 
                    trangthai='draft'
                ).update(
                    trangthai='processing',
                    updated_at=now()
                )
                return json_success(message, data=data)
            return json_error(message, data=data)
        else:
            phieu_luong_data = Phieuluong.objects.filter(bangluong_id=bang_luong_id).select_related('nhanvien').values()
            ct_phieu_luong_data = Ctphieuluong.objects.filter(phieuluong_id__in=phieu_luong_data.values_list('id', flat=True)).select_related('phantuluong').order_by('thutuhienthi').values()
            ct_phieu_luong_map = defaultdict()
            for item in ct_phieu_luong_data:
                if item['phieuluong_id'] not in ct_phieu_luong_map:
                    ct_phieu_luong_map[item['phieuluong_id']] = {}

                ct_phieu_luong_map[item['phieuluong_id']][item['phantuluong_id']] = {
                    "value": item['giatritinhduoc'],
                    "type": item['loaiphantu'],
                    "status": 'calculated',
                    "formula": item['bieuthuctinhtoan'],
                    "input_value": item['giatridauvao'],
                    "code": item['maphantuluong']
                }
            
            for item in phieu_luong_data:
                item['ct_phieu_luong'] = ct_phieu_luong_map.get(item['id'], {})

            return json_success('Lấy danh sách phiếu lương thành công', data={
                'phan_tu_luong': list(ct_phieu_luong_data.values_list('phantuluong_id', flat=True).distinct()),
                'phieu_luong': list(phieu_luong_data),
            })
    
    elif request.method == 'POST':
        try:
            data = loads(request.body)
            if data is None:
                return json_error('Dữ liệu không hợp lệ: Rỗng', status=400)

            changes = data.get('changes', {})
            nhanvien_ids = list(changes.keys())
            if not nhanvien_ids:
                return json_error('Dữ liệu không hợp lệ: Rỗng nhân viên', status=400)
            
            phantu_luong = data.get("phan_tu_luong", [])
            if not phantu_luong:
                return json_error('Dữ liệu không hợp lệ: Rỗng phần tử lương', status=400)
                
            bang_luong_id = data.get('bangluong_id') or request.GET.get('bangluong_id')
            if not bang_luong_id:
                return json_error('Thiếu tham số bangluong_id', status=400)
                
        except Exception as e:
            return json_error(f'Dữ liệu không hợp lệ: {str(e)}', status=400)
        
        # Lấy thông tin bảng lương
        try:
            bang_luong_obj = Bangluong.objects.get(id=bang_luong_id)
        except Bangluong.DoesNotExist:
            return json_error('Bảng lương không tồn tại', status=400)

        # ✅ BỔ SUNG: Check trạng thái bảng lương
        locked_statuses = ['approved', 'paid', 'cancelled']
        if bang_luong_obj.trangthai in locked_statuses:
            return json_error(
                f'Bảng lương đã ở trạng thái "{bang_luong_obj.trangthai}", không thể tạo/ghi đè phiếu lương',
                status=400
            )
        
        # Lấy thông tin nhân viên
        nhanvien_list = Lichsucongtac.objects.filter(trangthai='active', nhanvien_id__in=nhanvien_ids).select_related("nhanvien", "phongban", "chucvu").annotate(
            ho_ten=F('nhanvien__hovaten'),
            ten_phongban=F('phongban__tenphongban'),
            ten_chucvu=F('chucvu__tenvitricongviec'),
            ma_nhanvien=F('nhanvien__manhanvien')
        ).values("nhanvien_id", "ho_ten", "ma_nhanvien", "ten_phongban", "ten_chucvu")
        
        nhanvien_map = {str(item['nhanvien_id']): item for item in nhanvien_list}

        # Lấy quy tắc lương
        quytac_chedoluong_qs = Quytacchedoluong.objects.select_related('phantuluong', 'chedoluong').filter(
            chedoluong_id=bang_luong_obj.chedoluong_id, trangthai='active'
        ).annotate(
            loai_phan_tu = F('phantuluong__loaiphantu'),
            ten_phan_tu = F('phantuluong__tenphantu'),
            ma_phan_tu = F('phantuluong__maphantu')
        ).values('maquytac', 'phantuluong_id', 'ten_phan_tu', 'ma_phan_tu', 'loai_phan_tu', 'bieuthuctinhtoan', 'nguondulieu')
        
        quytac_chedoluong_map = {item['phantuluong_id']: item for item in quytac_chedoluong_qs}

        # Lấy dữ liệu bảng chấm công
        thoigian_batdau = bang_luong_obj.kyluong.ngaybatdau
        thoigian_ketthuc = bang_luong_obj.kyluong.ngayketthuc
        bcc_data = Bangchamcong.objects.filter(
            nhanvien_id__in=nhanvien_ids,
            ngaylamviec__range=[thoigian_batdau, thoigian_ketthuc],
            codilam=True
        ).values()
        bcc_map = defaultdict(list)
        for item in bcc_data:
            bcc_map[str(item['nhanvien_id'])].append(item)
        
        # Tìm quy tắc THUC_LINH
        rule_thuc_nhan = next((item for item in quytac_chedoluong_qs if item['maquytac'] == 'THUC_LINH'), None)
        if not rule_thuc_nhan:
            return json_error('Chưa có quy tắc tính lương thực nhận (THUC_LINH) trong chế độ lương này', status=400)
        id_phantu_luong_thuc_nhan = rule_thuc_nhan['phantuluong_id']

        # 1. Chuẩn bị dữ liệu tính toán cho TẤT CẢ nhân viên
        calc_input = {}
        for nv_id, phieu_luong_data in changes.items():
            params = {}
            # Gán trực tiếp các phần tử lương có trong dữ liệu gửi lên
            for pt_id in phantu_luong:
                rule = quytac_chedoluong_map.get(int(pt_id))
                if rule:
                    val = phieu_luong_data.get(str(pt_id))
                    params[rule['maquytac']] = val

            calc_input[str(nv_id)] = [{
                'tham_so': params,
                'nhanvien_id': nv_id,
                'bieu_thuc': rule_thuc_nhan['bieuthuctinhtoan']
            }]
        
        # 2. Thực hiện tính toán hàng loạt
        calculator = PayrollCalculator(calc_input)
        calculated_results = calculator.calculate_all(field_formula='bieu_thuc', field_params='tham_so', field_id='nhanvien_id')

        # 3. Lưu trữ kết quả
        phieuluong_objs = []
        chitiet_phieuluong_objs = []
        
        # Xóa các phiếu lương cũ để tránh trùng lặp
        Phieuluong.objects.filter(bangluong_id=bang_luong_id, nhanvien_id__in=nhanvien_ids).delete()

        for nv_id, phieu_luong_data in changes.items():
            nv_info = nhanvien_map.get(str(nv_id), {})
            
            # Cập nhật kết quả tính toán vào dữ liệu changes
            val_thuc_nhan = calculated_results.get(str(nv_id), 0)
            if float(val_thuc_nhan) != float(phieu_luong_data.get(str(id_phantu_luong_thuc_nhan))):
                logging.warning(f"Giá trị THUC_LINH cho NV {nv_id} được tính lại: {phieu_luong_data.get(str(id_phantu_luong_thuc_nhan))} -> {val_thuc_nhan:.2f}")
            phieu_luong_data[str(id_phantu_luong_thuc_nhan)] = val_thuc_nhan # Update giá trị thực nhận sau khi tính toán

            tong_thu_nhap = 0
            tong_khau_tru = 0
            
            # Tạo đối tượng Phiếu Lương
            phieuluong_obj = Phieuluong(
                bangluong_id=bang_luong_id,
                nhanvien_id=int(nv_id),
                tenphieuluong=f"Phiếu lương - {nv_info.get('ho_ten', '')} - {bang_luong_obj.tenbangluong}",
                maphieuluong=f"PL{nv_info.get('ma_nhanvien', '')}-{bang_luong_obj.mabangluong}",
                ngayphathanh=now().date(),
                tennhanvien=nv_info.get('ho_ten', ''),
                tenphongban=nv_info.get('ten_phongban', ''),
                tenchucvu=nv_info.get('ten_chucvu', ''),
                trangthai='draft',
                ngaychamcong=dumps(bcc_map.get(str(nv_id), []), default=str),
                luongthuclinh=val_thuc_nhan,
                created_at=now().date(),
            )
            phieuluong_objs.append(phieuluong_obj)

            # Lấy bộ tham số đã dùng tính toán để trích xuất dependencies
            calc_context_params = calc_input[str(nv_id)][0]['tham_so']
            # Cập nhật THUC_LINH vào params context nếu công thức khác cần dùng (dù hiện tại chỉ print ra)
            calc_context_params['THUC_LINH'] = val_thuc_nhan
            
            for i, pt_id in enumerate(phantu_luong):
                val = phieu_luong_data.get(str(pt_id))
                quy_tac = quytac_chedoluong_map.get(int(pt_id))

                if not quy_tac:
                    continue

                try:
                    val_float = float(val) if val is not None and val != '' else 0
                except:
                    val_float = 0

                loai_phan_tu = quy_tac.get('loai_phan_tu', '')

                if loai_phan_tu == 'THU_NHAP' and quy_tac.get('maquytac') != 'THUC_LINH':  # Không cộng THUC_LINH vào tổng thu nhập
                    tong_thu_nhap += val_float
                elif loai_phan_tu == 'KHAU_TRU':
                    tong_khau_tru += val_float

                chitiet_phieuluong_objs.append(
                    Ctphieuluong(
                        created_at=now().date(),
                        phantuluong_id = int(pt_id),
                        maphantuluong=quy_tac.get('ma_phan_tu', ''), # Using maphantu from model
                        tenphantuluong=quy_tac.get('ten_phan_tu', ''),
                        loaiphantu=loai_phan_tu,
                        nguondulieu=quy_tac.get('nguondulieu', ''),
                        bieuthuctinhtoan=quy_tac.get('bieuthuctinhtoan', ''),
                        giatridauvao=dumps(calculator.extract_formula_params(quy_tac.get('bieuthuctinhtoan', ''), calc_context_params)),
                        giatritinhduoc=val_float,
                        thutuhienthi=i,
                        phieuluong=phieuluong_obj
                    )
                )

            phieuluong_obj.tongthunhap = tong_thu_nhap
            phieuluong_obj.tongkhautru = tong_khau_tru
        
        Phieuluong.objects.bulk_create(phieuluong_objs)
        Ctphieuluong.objects.bulk_create(chitiet_phieuluong_objs)

        # ✅ THÊM: Chuyển bảng lương sang calculated sau khi lưu phiếu lương thành công
        bang_luong_obj.trangthai = 'calculated'
        bang_luong_obj.tongsoluongnhanvien = len(nhanvien_ids)
        bang_luong_obj.tongtienluong = sum(
            float(calculated_results.get(str(nv_id), 0)) for nv_id in nhanvien_ids
        )
        bang_luong_obj.updated_at = now()
        bang_luong_obj.save(update_fields=['trangthai', 'tongsoluongnhanvien', 'tongtienluong', 'updated_at'])

        return json_success('Lưu phiếu lương thành công')
    
    return json_success('Lấy danh sách phiếu lương thành công')
        
# ===================================================================================       
#------------------------------------CHE DO LUONG------------------------------------
# ===================================================================================


# --- VIEW:  Trang danh sách ---
def view_che_do_luong(request):
    """Màn hình danh sách Chế độ lương"""
    context = {
        'breadcrumbs': [
            {'title': 'Quản lý lương', 'url': '#'},
            {'title': 'Chế độ lương', 'url': None},
        ],
    }
    return render(request, "hrm_manager/quan_ly_luong/che_do_luong.html", context)

# --- VIEW:  Form tạo mới/cập nhật ---
def view_che_do_luong_create(request):
    """Màn hình Thêm mới Chế độ lương"""
    breadcrumbs = [
        {'title': 'Quản lý lương', 'url': '#'},
        {'title': 'Chế độ lương', 'url': reverse('hrm:quan_ly_luong:che_do_luong')},
        {'title': 'Thêm mới', 'url':  None},
    ]
    return render(request, "hrm_manager/quan_ly_luong/che_do_luong_form.html", {
        'title': 'Thêm mới chế độ lương',
        'breadcrumbs': breadcrumbs,
        'cancel_url': reverse('hrm:quan_ly_luong:che_do_luong'),
        'is_update': False
    })

def view_che_do_luong_update(request, pk):
    """Màn hình Cập nhật Chế độ lương"""
    breadcrumbs = [
        {'title':  'Quản lý lương', 'url': '#'},
        {'title': 'Chế độ lương', 'url': reverse('hrm:quan_ly_luong:che_do_luong')},
        {'title': 'Cập nhật', 'url': None},
    ]
    return render(request, "hrm_manager/quan_ly_luong/che_do_luong_form.html", {
        'title': 'Cập nhật chế độ lương',
        'breadcrumbs': breadcrumbs,
        'cancel_url': reverse('hrm:quan_ly_luong:che_do_luong'),
        'item_id': pk,
        'is_update': True
    })

# ============================================================
# API: LIST
# ============================================================

@require_http_methods(["GET"])
@handle_exceptions
def api_che_do_luong_list(request):
    """
    API Lấy danh sách Chế độ lương
    ✅ Bổ sung: 
    - Số nhân viên đang sử dụng
    - Có bảng lương hay không
    - Is default
    """
    
    # Query chính với annotations
    queryset = Chedoluong.objects.annotate(
        so_nhan_vien=Count(
            'nhanvienchedoluong',
            filter=Q(nhanvienchedoluong__trangthai='active'),
            distinct=True
        ),
        has_rules=Exists(
            Quytacchedoluong.objects.filter(chedoluong_id=OuterRef('pk'))
        ),
        has_payrolls=Exists(
            Bangluong.objects.filter(chedoluong_id=OuterRef('pk'))
        )
    )
    
    # ✅ Nếu có soft delete, filter is_deleted
    if hasattr(Chedoluong, 'is_deleted'):
        queryset = queryset.filter(Q(is_deleted=False) | Q(is_deleted__isnull=True))
    
    queryset = queryset.order_by('-created_at')
    
    # Sử dụng Helper
    context = get_list_context(
        request,
        queryset,
        search_fields=['tenchedo', 'machedo'],
        page_size=20,
        order_by='-created_at'
    )
    
    page_obj = context['page_obj']
    items_list = []
    
    for item in page_obj.object_list:
        
        items_list.append({
            'id': item.id,
            'ten_che_do_luong': item.tenchedo,
            'ma_che_do_luong': item.machedo,
            'so_nhan_vien': item.so_nhan_vien,
            'ghi_chu': item.ghichu,
            'trang_thai': item.trangthai,
            'has_payrolls': item.has_payrolls,
            'has_rules': item.has_rules,
            'ngay_ap_dung': item.ngayapdung.isoformat() if item.ngayapdung else None,
            'ngay_het_han': item.ngayhethan.isoformat() if item.ngayhethan else None,
        })
    
    return json_success(
        'Thành công',
        data=items_list,
        pagination={
            'page': page_obj.number,
            'page_size': context['paginator'].per_page,
            'total':  context['paginator'].count,
            'total_pages': context['paginator'].num_pages,
            'has_next': page_obj.has_next(),
            'has_prev': page_obj.has_previous()
        }
    )


# --- API: Chi tiết ---
@require_http_methods(["GET"])
@handle_exceptions
def api_che_do_luong_detail(request, pk):
    """
    ✅ CẬP NHẬT:  Thêm thông tin nhân viên/phòng ban
    """
    che_do = get_object_or_json_error(Chedoluong, pk, "Không tìm thấy chế độ lương")
    if not isinstance(che_do, Chedoluong):
        return che_do
    
    # Lấy danh sách phòng ban
    all_dept_ids = list(
        PhongbanChedoluong.objects.filter(chedoluong=che_do, trangthai='active')
        .values_list('phongban_id', flat=True)
    )
    
    # Consolidate departments (loại bỏ con nếu cha đã chọn)
    consolidated_dept_ids = CheDoLuongService.get_consolidated_dept_ids(all_dept_ids)
    
    depts = []
    if consolidated_dept_ids:
        depts = [
            {'id': d.id, 'name': d.tenphongban}
            for d in Phongban.objects.filter(id__in=consolidated_dept_ids)
        ]
    
    # Lấy nhân viên thuộc phòng ban
    dept_emp_ids = CheDoLuongService.get_employees_from_departments(all_dept_ids)
    
    # Lấy nhân viên trực tiếp (không thuộc phòng ban đã chọn)
    all_emp_records = NhanvienChedoluong.objects.filter(
        chedoluong=che_do,
        trangthai='active'
    ).select_related('nhanvien')
    
    direct_emp_records = [
        rec for rec in all_emp_records
        if rec.nhanvien and rec.nhanvien.id not in dept_emp_ids
    ]
    
    # Map nhân viên -> phòng ban hiện tại
    direct_emp_ids = [r.nhanvien.id for r in direct_emp_records]
    emp_dept_map = {}
    
    if direct_emp_ids:
        active_assignments = Lichsucongtac.objects.filter(
            nhanvien_id__in=direct_emp_ids,
            trangthai='active',
            ketthuc__isnull=True
        ).select_related('phongban')
        
        for assign in active_assignments:
            if assign.phongban:
                emp_dept_map[assign.nhanvien_id] = assign.phongban.tenphongban
    
    emps = []
    emp_ids = []
    for rec in direct_emp_records:
        dept_name = emp_dept_map.get(rec.nhanvien.id, '')
        emps.append({
            'id': rec.nhanvien.id,
            'name': rec.nhanvien.hovaten,
            'dept':  dept_name,
            'code': rec.nhanvien.manhanvien
        })
        emp_ids.append(rec.nhanvien.id)
    
    quy_tac_list = Quytacchedoluong.objects.filter(
        chedoluong=che_do
    ).select_related('phantuluong').values(
        'id',
        'phantuluong_id',
        'tenquytac',
        'maquytac', 
        'nguondulieu',
        'bieuthuctinhtoan',
        'mota',
        'phantuluong__tenphantu',
        'phantuluong__maphantu'
    )

    quy_tac = []
    for qt in quy_tac_list:
        quy_tac.append({
            'id': qt['id'],
            'phantuluong_id': qt['phantuluong_id'],
            'tenphantu': qt['phantuluong__tenphantu'],
            'maphantu': qt['phantuluong__maphantu'],
            'nguondulieu': qt['nguondulieu'] or 'manual',
            'bieuthuc': qt['bieuthuctinhtoan'] or '',
            'mota': qt['mota'] or ''
        })

    data = {
        'id': che_do.id,
        'ten_che_do': che_do.tenchedo,
        'ma_che_do': che_do.machedo,
        'ghi_chu':  che_do.ghichu,
        'trang_thai': che_do.trangthai,
        'ngay_ap_dung': che_do.ngayapdung.isoformat() if che_do.ngayapdung else None,
        'ngay_het_han': che_do.ngayhethan.isoformat() if che_do.ngayhethan else None,
        'can_modify_code': CheDoLuongService.can_modify_code(che_do),
        'depts': depts,
        'emps': emps,
        'dept_ids': consolidated_dept_ids,
        'emp_ids': emp_ids,
        'quy_tac': quy_tac,
    }
    
    return json_success('Lấy chi tiết thành công', data=data)

# ============================================================
# API: CREATE
# ============================================================

@require_http_methods(["POST"])
@handle_exceptions
def api_che_do_luong_create(request):
    """API Tạo mới Chế độ lương"""
    data = get_request_data(request)
    
    # Validate required fields
    is_valid, missing = validate_required_fields(data, ['ten_che_do', 'ma_che_do'])
    if not is_valid:
        return json_error(f"Vui lòng nhập đầy đủ: {', '.join(missing)}")
    
    ma_che_do = data.get('ma_che_do', '').strip().upper()
    is_unique, msg = CheDoLuongService.validate_unique_code(ma_che_do)
    if not is_unique:
        return json_error(msg)
    
    # Validate dates
    ngay_ap_dung = data.get('ngay_ap_dung')
    ngay_het_han = data.get('ngay_het_han')
    is_valid_dates, date_msg = CheDoLuongService.validate_dates(ngay_ap_dung, ngay_het_han)
    if not is_valid_dates:
        return json_error(date_msg)
    
    # Lấy dữ liệu nhân viên/phòng ban
    dept_ids = data.get('dept_ids', [])
    emp_ids = data.get('emp_ids', [])
    force_transfer = data.get('force_transfer', False)
    
    # Validate phải chọn ít nhất 1
    if not dept_ids and not emp_ids:
        return json_error("Vui lòng chọn ít nhất một nhân viên hoặc bộ phận áp dụng")
    
    # Expand và resolve
    all_dept_ids = CheDoLuongService._expand_dept_ids(dept_ids)
    all_emp_ids = CheDoLuongService.resolve_all_employees(all_dept_ids, emp_ids)
    
    # Xác định effective_date
    effective_date_option = data.get('effective_date', 'today')
    if effective_date_option == 'tomorrow':
        effective_date = date.today() + timedelta(days=1)
    elif ngay_ap_dung:
        effective_date = datetime.strptime(ngay_ap_dung, '%Y-%m-%d').date() if isinstance(ngay_ap_dung, str) else ngay_ap_dung
    else:
        effective_date = date.today()
    
    # Check conflicts
    if not force_transfer:
        dept_conflicts = CheDoLuongService.check_department_conflicts(all_dept_ids, effective_date=effective_date)
        emp_conflicts = CheDoLuongService.check_employee_conflicts(all_emp_ids, effective_date=effective_date)
        
        if dept_conflicts or emp_conflicts:
            return json_response(
                success=False,
                message="Phát hiện xung đột với chế độ lương khác",
                data={'conflicts': dept_conflicts + emp_conflicts, 'require_confirm': True},
                status=200
            )
    
    try:
        with transaction.atomic():
            # Tạo chế độ lương
            che_do_moi = Chedoluong.objects.create(
                tenchedo=data.get('ten_che_do', '').strip(),
                machedo=ma_che_do,
                ghichu=data.get('ghi_chu', '').strip(),
                ngayapdung=ngay_ap_dung,
                ngayhethan=ngay_het_han,
                trangthai='active',
                created_at=now().date()
            )
            
            # Xử lý assignment
            transferred = CheDoLuongService.process_employee_assignment(
                che_do_moi,
                all_dept_ids,
                all_emp_ids,
                force_transfer=force_transfer,
                effective_date=effective_date
            )
            
            # Lưu quy tắc
            quy_tac_list = data.get('quy_tac', [])
            if quy_tac_list:
                _save_quy_tac(che_do_moi, quy_tac_list)
            
            response_data = {'id': che_do_moi.id}
            if transferred:
                response_data['transferred'] = transferred
            
            return json_success("Thêm mới chế độ lương thành công", **response_data)
    
    except Exception as e:
        return json_error(f"Lỗi khi lưu: {str(e)}")


# ============================================================
# API: UPDATE
# ============================================================

@require_http_methods(["PUT", "POST"])
@handle_exceptions
def api_che_do_luong_update(request, pk):
    """API Cập nhật Chế độ lương"""
    che_do = get_object_or_json_error(Chedoluong, pk, "Không tìm thấy chế độ lương")
    if not isinstance(che_do, Chedoluong):
        return che_do
    
    # Kiểm tra kỳ lương lock
    try:
        CheDoLuongService.assert_not_in_locked_period(che_do)
    except PayrollPeriodLockException as e:
        return json_error(str(e))
    
    data = get_request_data(request)
    
    # Validate mã nếu thay đổi
    ma_che_do_moi = data.get('ma_che_do', '').strip().upper()
    if ma_che_do_moi != che_do.machedo:
        if not CheDoLuongService.can_modify_code(che_do):
            return json_error('Không thể sửa mã do đã có dữ liệu liên quan')
        
        is_unique, msg = CheDoLuongService.validate_unique_code(ma_che_do_moi, exclude_id=pk)
        if not is_unique:
            return json_error(msg)
    
    # Validate dates
    ngay_ap_dung = data.get('ngay_ap_dung')
    ngay_het_han = data.get('ngay_het_han')
    
    # Chỉ validate ngày mới nếu có thay đổi và chưa có bảng lương
    if not CheDoLuongService.has_payroll_history(che_do):
        is_valid_dates, date_msg = CheDoLuongService.validate_dates(ngay_ap_dung, ngay_het_han)
        if not is_valid_dates:
            return json_error(date_msg)
    
    # Lấy dữ liệu nhân viên/phòng ban
    dept_ids = data.get('dept_ids', [])
    emp_ids = data.get('emp_ids', [])
    force_transfer = data.get('force_transfer', False)
    
    if not dept_ids and not emp_ids:
        return json_error("Vui lòng chọn ít nhất một nhân viên hoặc bộ phận áp dụng")
    
    # Expand và resolve
    all_dept_ids = CheDoLuongService._expand_dept_ids(dept_ids)
    all_emp_ids = CheDoLuongService.resolve_all_employees(all_dept_ids, emp_ids)
    
    # Xác định effective_date
    effective_date_option = data.get('effective_date', 'today')
    if effective_date_option == 'tomorrow':
        effective_date = date.today() + timedelta(days=1)
    else:
        effective_date = date.today()
    
    # Check conflicts
    if not force_transfer:
        dept_conflicts = CheDoLuongService.check_department_conflicts(
            all_dept_ids, exclude_id=pk, effective_date=effective_date
        )
        emp_conflicts = CheDoLuongService.check_employee_conflicts(
            all_emp_ids, exclude_id=pk, effective_date=effective_date
        )
        
        if dept_conflicts or emp_conflicts:
            return json_response(
                success=False,
                message="Phát hiện xung đột với chế độ lương khác",
                data={'conflicts': dept_conflicts + emp_conflicts, 'require_confirm': True},
                status=200
            )
    
    try:
        with transaction.atomic():
            # Update thông tin cơ bản
            che_do.tenchedo = data.get('ten_che_do', '').strip()
            
            if CheDoLuongService.can_modify_code(che_do):
                che_do.machedo = ma_che_do_moi
            
            che_do.ghichu = data.get('ghi_chu', '').strip()
            
            # Chỉ update ngày nếu chưa có bảng lương
            if not CheDoLuongService.has_payroll_history(che_do):
                if ngay_ap_dung:
                    che_do.ngayapdung = ngay_ap_dung
                if ngay_het_han:
                    che_do.ngayhethan = ngay_het_han
            
            che_do.updated_at = now().date()
            che_do.save()
            
            # Xử lý assignment
            transferred = CheDoLuongService.process_employee_assignment(
                che_do,
                all_dept_ids,
                all_emp_ids,
                force_transfer=force_transfer,
                effective_date=effective_date
            )
            
            # Lưu quy tắc
            quy_tac_list = data.get('quy_tac', [])
            _save_quy_tac(che_do, quy_tac_list)
            
            response_data = {}
            if transferred:
                response_data['transferred'] = transferred
            
            return json_success("Cập nhật chế độ lương thành công", **response_data)
    
    except Exception as e:
        return json_error(f"Lỗi khi lưu: {str(e)}")


# ============================================================
# API: CHECK DELETE
# ============================================================

@require_http_methods(["GET"])
@handle_exceptions
def api_che_do_luong_check_delete(request, pk):
    """API kiểm tra điều kiện xóa trước khi hiển thị confirm"""
    che_do = get_object_or_json_error(Chedoluong, pk, "Không tìm thấy chế độ lương")
    if not isinstance(che_do, Chedoluong):
        return che_do
    
    check_result = CheDoLuongService.check_can_delete(che_do)
    
    return json_success('OK', data=check_result)


# ============================================================
# API: DELETE
# ============================================================

@require_http_methods(["POST", "DELETE"])
@handle_exceptions
def api_che_do_luong_delete(request, pk):
    """API Xóa Chế độ lương"""
    item = get_object_or_json_error(Chedoluong, pk, "Không tìm thấy dữ liệu")
    if not isinstance(item, Chedoluong):
        return item
    
    data = get_request_data(request)
    force_soft_delete = data.get('soft_delete', False)
    
    success, message = CheDoLuongService.delete_che_do(item, force_soft_delete=force_soft_delete)
    
    if success:
        return json_success(message)
    else:
        return json_error(message)


# ============================================================
# API: CHECK TOGGLE STATUS
# ============================================================

@require_http_methods(["GET"])
@handle_exceptions
def api_che_do_luong_check_toggle(request, pk):
    """API kiểm tra điều kiện toggle status"""
    che_do = get_object_or_json_error(Chedoluong, pk, "Không tìm thấy chế độ lương")
    if not isinstance(che_do, Chedoluong):
        return che_do
    
    is_currently_active = che_do.trangthai == 'active'
    
    # Nếu đang tắt muốn bật -> check overlap
    if not is_currently_active:
        return json_success('OK', data={'can_toggle': True})
    
    # Nếu đang bật muốn tắt -> check các điều kiện
    check_result = CheDoLuongService.check_can_toggle_off(che_do)
    
    return json_success('OK', data=check_result)


# ============================================================
# API: TOGGLE STATUS
# ============================================================

@require_http_methods(["POST"])
@handle_exceptions
def api_che_do_luong_toggle_status(request, pk):
    """API Bật/Tắt trạng thái"""
    che_do = get_object_or_json_error(Chedoluong, pk, "Không tìm thấy chế độ lương")
    if not isinstance(che_do, Chedoluong):
        return che_do
    
    data = get_request_data(request)
    is_active = data.get('is_active', False)
    force = data.get('force', False)
    
    result = CheDoLuongService.toggle_status(che_do, is_active, force=force)
    
    if result['success']:
        return json_success(result['message'])
    elif result.get('require_confirm'):
        return json_response(
            success=False,
            message='Cần xác nhận',
            data={
                'require_confirm': True,
                'warning': result.get('warning')
            },
            status=200
        )
    else:
        return json_error(result['message'])


# ============================================================
# API: CHECK CONFLICTS
# ============================================================

@require_http_methods(["POST"])
@handle_exceptions
def api_che_do_luong_check_conflicts(request):
    """API kiểm tra xung đột nhân viên/phòng ban"""
    data = get_request_data(request)
    dept_ids = data.get('dept_ids', [])
    emp_ids = data.get('emp_ids', [])
    exclude_id = data.get('exclude_id')
    effective_date_str = data.get('effective_date')
    
    # Parse effective_date
    effective_date = None
    if effective_date_str:
        try:
            effective_date = datetime.strptime(effective_date_str, '%Y-%m-%d').date()
        except:
            pass
    
    # Resolve all employees
    all_dept_ids = CheDoLuongService._expand_dept_ids(dept_ids)
    all_emp_ids = CheDoLuongService.resolve_all_employees(all_dept_ids, emp_ids)
    
    if not all_emp_ids and not all_dept_ids:
        return json_success("Không có đối tượng nào được chọn", data={'conflicts': []})
    
    # Check conflicts
    dept_conflicts = CheDoLuongService.check_department_conflicts(
        all_dept_ids, exclude_id=exclude_id, effective_date=effective_date
    )
    emp_conflicts = CheDoLuongService.check_employee_conflicts(
        all_emp_ids, exclude_id=exclude_id, effective_date=effective_date
    )
    
    all_conflicts = dept_conflicts + emp_conflicts
    
    if all_conflicts:
        return json_response(
            success=False,
            message="Phát hiện xung đột",
            data={'conflicts': all_conflicts},
            status=200
        )
    
    return json_success("Hợp lệ", data={'conflicts': []})


# ============================================================
# API: TRANSFER EMPLOYEES
# ============================================================

@require_http_methods(["POST"])
@handle_exceptions
def api_che_do_luong_transfer(request):
    """API chuyển nhân viên/phòng ban giữa các chế độ lương"""
    data = get_request_data(request)
    
    from_id = data.get('from_che_do_id')
    to_id = data.get('to_che_do_id')
    emp_ids = data.get('emp_ids')
    dept_ids = data.get('dept_ids')
    effective_date_str = data.get('effective_date')
    
    if not from_id or not to_id:
        return json_error("Thiếu thông tin chế độ nguồn hoặc đích")
    
    from_che_do = get_object_or_json_error(Chedoluong, from_id, "Không tìm thấy chế độ nguồn")
    if not isinstance(from_che_do, Chedoluong):
        return from_che_do
    
    to_che_do = get_object_or_json_error(Chedoluong, to_id, "Không tìm thấy chế độ đích")
    if not isinstance(to_che_do, Chedoluong):
        return to_che_do
    
    # Parse effective_date
    effective_date = None
    if effective_date_str:
        try:
            effective_date = datetime.strptime(effective_date_str, '%Y-%m-%d').date()
        except:
            effective_date = date.today()
    
    result = CheDoLuongService.transfer_employees(
        from_che_do, 
        to_che_do,
        emp_ids=emp_ids,
        dept_ids=dept_ids,
        effective_date=effective_date
    )
    
    if result['success']:
        return json_success(result['message'], transferred_count=result['transferred_count'])
    else:
        return json_error(result['message'])


# ============================================================
# HELPER FUNCTIONS
# ============================================================
# Mã phần tử cố định - luôn có trong chế độ lương
FIXED_ELEMENT_CODE = 'THUC_LINH'

def _save_quy_tac(che_do, quy_tac_list):
    """
    Helper function để lưu quy tắc
    Đảm bảo phần tử THUC_LINH luôn được lưu
    """
    # Xóa quy tắc cũ
    Quytacchedoluong.objects.filter(chedoluong=che_do).delete()
    
    # Kiểm tra xem THUC_LINH đã có trong danh sách chưa
    has_fixed_element = any(
        qt.get('maphantu') == FIXED_ELEMENT_CODE 
        for qt in quy_tac_list
    )
    
    # Nếu chưa có, tìm và thêm phần tử THUC_LINH
    if not has_fixed_element:
        fixed_element = Phantuluong.objects.filter(
            maphantu=FIXED_ELEMENT_CODE,
            trangthai='active'
        ).first()
        
        if fixed_element:
            quy_tac_list.append({
                'phantuluong_id': fixed_element.id,
                'tenphantu': fixed_element.tenphantu,
                'maphantu': fixed_element.maphantu,
                'nguondulieu': 'formula',
                'bieuthuc': '',
                'mota': ''
            })
    
    # Tạo quy tắc mới
    for qt in quy_tac_list:
        Quytacchedoluong.objects.create(
            chedoluong=che_do,
            phantuluong_id=qt.get('phantuluong_id'),
            tenquytac=qt.get('tenphantu'),
            maquytac=qt.get('maphantu'),
            nguondulieu=qt.get('nguondulieu', 'manual'),
            bieuthuctinhtoan=qt.get('bieuthuc', ''),
            mota=qt.get('mota', ''),
            trangthai='active',
            created_at=now().date()
        )

# ===================================================================================
#---------------------------------- KỲ LƯƠNG --------------------------------------
# ===================================================================================  

# VIEW URLS - TRANG CHÍNH
@login_required
def view_ky_luong(request):
    """Màn hình danh sách Kỳ lương"""
    context = {
        'breadcrumbs': [
            {'title': 'Quản lý lương', 'url': '#'},
            {'title': 'Kỳ lương', 'url': None},
        ],
    }
    return render(request, "hrm_manager/quan_ly_luong/ky_luong.html", context)

# ============================================================================
# API URLS
# ============================================================================

@require_http_methods(["GET"])
@handle_exceptions
def api_ky_luong_list(request):
    """
    API Lấy danh sách Kỳ lương
    """
    queryset = Kyluong.objects.all().order_by('-ngaybatdau', '-thang')
    
    # Search theo tháng/năm
    search = request.GET.get('search', '').strip()
    if search:
        # Có thể search "12/2026" hoặc "2026" hoặc "12"
        if '/' in search:
            parts = search.split('/')
            if len(parts) == 2:
                try:
                    month = int(parts[0])
                    year = int(parts[1])
                    queryset = queryset.filter(thang=month, ngaybatdau__year=year)
                except ValueError:
                    pass
        else:
            try:
                num = int(search)
                if num > 12:  # Năm
                    queryset = queryset.filter(ngaybatdau__year=num)
                else:  # Tháng
                    queryset = queryset.filter(thang=num)
            except ValueError:
                pass
    
    # Filter theo năm
    year_filter = request.GET.get('year', '').strip()
    if year_filter:
        try:
            queryset = queryset.filter(ngaybatdau__year=int(year_filter))
        except ValueError:
            pass
    
    # Pagination
    context = get_list_context(
        request,
        queryset,
        search_fields=[],
        page_size=20,
        order_by=None
    )
    
    page_obj = context['page_obj']
    items_list = []
    
    for item in page_obj.object_list:
        # ✅ THÊM: Lazy sync trạng thái vào DB
        KyLuongService.sync_status_to_db(item)
        items_list.append(KyLuongService.format_period_display(item))
    
    return json_success(
        'Thành công',
        data=items_list,
        pagination={
            'page': page_obj.number,
            'page_size': context['paginator'].per_page,
            'total': context['paginator'].count,
            'total_pages': context['paginator'].num_pages,
            'has_next': page_obj.has_next(),
            'has_prev': page_obj.has_previous()
        }
    )


@require_http_methods(["GET"])
@handle_exceptions  
def api_ky_luong_detail(request, pk):
    """
    API Lấy chi tiết Kỳ lương
    ✅ CẬP NHẬT: Thêm can_edit_month
    """
    ky_luong = get_object_or_json_error(Kyluong, pk, "Không tìm thấy kỳ lương")
    if not isinstance(ky_luong, Kyluong):
        return ky_luong
    
    data = KyLuongService.format_period_display(ky_luong)
    
    # Thêm thông tin chi tiết cho form edit
    data['ngay_bat_dau_raw'] = ky_luong.ngaybatdau.strftime('%Y-%m-%d') if ky_luong.ngaybatdau else None
    data['ngay_ket_thuc_raw'] = ky_luong.ngayketthuc.strftime('%Y-%m-%d') if ky_luong.ngayketthuc else None
    data['ngay_chot_luong_raw'] = ky_luong.ngaychotluong.strftime('%Y-%m-%d') if ky_luong.ngaychotluong else None
    
    # ✅ MỚI: Lấy constraints cho date picker (dùng tháng gốc)
    year = ky_luong.ngaybatdau.year
    month = ky_luong.thang
    min_start, max_start, min_end, max_end = KyLuongService.get_date_constraints_for_month(year, month)
    
    data['min_ngay_bat_dau'] = min_start.strftime('%Y-%m-%d')
    data['max_ngay_bat_dau'] = max_start.strftime('%Y-%m-%d')
    data['min_ngay_ket_thuc'] = min_end.strftime('%Y-%m-%d')
    data['max_ngay_ket_thuc'] = max_end.strftime('%Y-%m-%d')
    
    return json_success('Lấy chi tiết thành công', data=data)


@require_http_methods(["POST"])
@handle_exceptions
def api_ky_luong_create(request):
    """
    API Tạo mới Kỳ lương
    """
    data = get_request_data(request)
    
    # Parse dates
    thang = data.get('thang')
    nam = data.get('nam')
    ngay_bat_dau = data.get('ngay_bat_dau')
    ngay_ket_thuc = data.get('ngay_ket_thuc')
    ngay_chot_luong = data.get('ngay_chot_luong')
    lap_theo_thang = data.get('lap_theo_thang', False)
    
    # Validate required fields
    if not thang or not nam:
        return json_error("Vui lòng chọn tháng và năm")
    
    if not ngay_bat_dau or not ngay_ket_thuc:
        return json_error("Vui lòng chọn ngày bắt đầu và kết thúc kỳ lương")
    
    # Parse date strings
    try:
        thang = int(thang)
        nam = int(nam)
        ngay_bat_dau = datetime.strptime(ngay_bat_dau, '%Y-%m-%d').date()
        ngay_ket_thuc = datetime.strptime(ngay_ket_thuc, '%Y-%m-%d').date()
        
        if ngay_chot_luong:
            ngay_chot_luong = datetime.strptime(ngay_chot_luong, '%Y-%m-%d').date()
        else:
            ngay_chot_luong = KyLuongService.get_default_closing_date(ngay_ket_thuc)
            
    except (ValueError, TypeError) as e:
        return json_error(f"Định dạng ngày không hợp lệ: {str(e)}")
    
    try:
        if lap_theo_thang:
            # Tạo nhiều kỳ lương
            created, errors = KyLuongService.create_periods_for_year(
                base_data=data,
                from_month=thang,
                year=nam
            )
            
            if errors and not created:
                return json_error(f"Không thể tạo kỳ lương: {'; '.join(errors)}")
            
            msg = f"Đã tạo {len(created)} kỳ lương"
            if errors:
                msg += f". Lỗi: {'; '.join(errors)}"
            
            return json_success(msg, count=len(created))
        else:
            # Tạo 1 kỳ lương
            ky_luong = KyLuongService.create_period({
                'thang': thang,
                'nam': nam,
                'ngay_bat_dau': ngay_bat_dau,
                'ngay_ket_thuc': ngay_ket_thuc,
                'ngay_chot_luong': ngay_chot_luong,
            })
            
            return json_success("Tạo kỳ lương thành công", id=ky_luong.id)
            
    except ValueError as e:
        return json_error(str(e))
    except Exception as e:
        return json_error(f"Lỗi khi tạo kỳ lương: {str(e)}")


@require_http_methods(["PUT", "POST"])
@handle_exceptions
def api_ky_luong_update(request, pk):
    """
    API Cập nhật Kỳ lương
    """
    ky_luong = get_object_or_json_error(Kyluong, pk, "Không tìm thấy kỳ lương")
    if not isinstance(ky_luong, Kyluong):
        return ky_luong
    
    data = get_request_data(request)
    
    # Parse dates
    thang = data.get('thang')
    nam = data.get('nam')
    ngay_bat_dau = data.get('ngay_bat_dau')
    ngay_ket_thuc = data.get('ngay_ket_thuc')
    ngay_chot_luong = data.get('ngay_chot_luong')
    
    try:
        if thang:
            thang = int(thang)
        if nam:
            nam = int(nam)
        if ngay_bat_dau:
            ngay_bat_dau = datetime.strptime(ngay_bat_dau, '%Y-%m-%d').date()
        if ngay_ket_thuc:
            ngay_ket_thuc = datetime.strptime(ngay_ket_thuc, '%Y-%m-%d').date()
        if ngay_chot_luong:
            ngay_chot_luong = datetime.strptime(ngay_chot_luong, '%Y-%m-%d').date()
            
    except (ValueError, TypeError) as e:
        return json_error(f"Định dạng ngày không hợp lệ: {str(e)}")
    
    try:
        KyLuongService.update_period(ky_luong, {
            'thang': thang,
            'nam': nam,
            'ngay_bat_dau': ngay_bat_dau,
            'ngay_ket_thuc': ngay_ket_thuc,
            'ngay_chot_luong': ngay_chot_luong,
        })
        
        return json_success("Cập nhật kỳ lương thành công")
        
    except ValueError as e:
        return json_error(str(e))
    except Exception as e:
        return json_error(f"Lỗi khi cập nhật: {str(e)}")


@require_http_methods(["POST", "DELETE"])
@handle_exceptions
def api_ky_luong_delete(request, pk):
    """
    API Xóa Kỳ lương
    """
    ky_luong = get_object_or_json_error(Kyluong, pk, "Không tìm thấy kỳ lương")
    if not isinstance(ky_luong, Kyluong):
        return ky_luong
    
    success, msg = KyLuongService.delete_period(ky_luong)
    
    if success:
        return json_success(msg)
    else:
        return json_error(msg)

@require_http_methods(["POST"])
@handle_exceptions
def api_ky_luong_finalize(request, pk):
    """API Chốt kỳ lương: pending -> finalized"""
    ky_luong = get_object_or_json_error(Kyluong, pk, "Không tìm thấy kỳ lương")
    if not isinstance(ky_luong, Kyluong):
        return ky_luong
    
    success, msg = KyLuongService.finalize_period(ky_luong)
    if success:
        return json_success(msg)
    else:
        return json_error(msg)
    
@require_http_methods(["GET"])
@handle_exceptions
def api_ky_luong_get_defaults(request):
    """
    API Lấy giá trị mặc định cho form tạo mới
    ✅ UPDATED: Constraints đơn giản hơn
    """
    year = int(request.GET.get('year', date.today().year))
    month = int(request.GET.get('month', date.today().month))
    
    first_day, last_day = KyLuongService.get_default_period_for_month(year, month)
    closing_date = KyLuongService.get_default_closing_date(last_day)
    
    # Tính min/max cho ngày chốt
    min_closing = last_day + timedelta(days=KyLuongService.MIN_DAYS_AFTER_END_FOR_CLOSING)
    max_closing = last_day + timedelta(days=KyLuongService.MAX_DAYS_AFTER_END_FOR_CLOSING)
    
    # ✅ UPDATED: Lấy constraints ±1 tháng
    min_date, max_date, _, _ = KyLuongService.get_date_constraints_for_month(year, month)
    
    return json_success('OK', data={
        'year': year,
        'month': month,
        'ngay_bat_dau': first_day.strftime('%Y-%m-%d'),
        'ngay_ket_thuc': last_day.strftime('%Y-%m-%d'),
        'ngay_chot_luong': closing_date.strftime('%Y-%m-%d'),
        'min_ngay_chot': min_closing.strftime('%Y-%m-%d'),
        'max_ngay_chot': max_closing.strftime('%Y-%m-%d'),
        # ✅ UPDATED: Chung 1 range cho cả start và end
        'min_ngay_bat_dau': min_date.strftime('%Y-%m-%d'),
        'max_ngay_bat_dau': max_date.strftime('%Y-%m-%d'),
        'min_ngay_ket_thuc': min_date.strftime('%Y-%m-%d'),
        'max_ngay_ket_thuc': max_date.strftime('%Y-%m-%d'),
        'period_days': KyLuongService.DEFAULT_PERIOD_DAYS,
    })

# ===================================================================================
#---------------------------------- BẢNG LƯƠNG ------------------------------------
# ===================================================================================

# VIEW URLS - TRANG CHÍNH

@login_required
def view_bang_luong(request):
    """Màn hình danh sách Bảng lương"""
    
    # Lấy danh sách chế độ lương cho filter
    che_do_luong_list = BangLuongService.get_available_che_do_luong()
    
    # Lấy danh sách kỳ lương đã có trong bảng lương (cho filter)
    ky_luong_list = BangLuongService.get_available_ky_luong_for_filter()
    
    context = {
        'breadcrumbs': [
            {'title': 'Quản lý lương', 'url': '#'},
            {'title': 'Bảng lương', 'url': None},
        ],
        'che_do_luong_list': che_do_luong_list,
        'ky_luong_list': ky_luong_list,
    }
    return render(request, "hrm_manager/quan_ly_luong/bang_luong.html", context)


# ============================================================================
# API URLS
# ============================================================================

@require_http_methods(["GET"])
@handle_exceptions
def api_bang_luong_list(request):
    """
    API Lấy danh sách Bảng lương
    """
    queryset = Bangluong.objects.select_related(
        'kyluong', 'chedoluong'
    ).order_by('-ngaytao', '-created_at')
    
    # Search theo tên, mã bảng lương
    search = request.GET.get('search', '').strip()
    if search:
        queryset = search_queryset(
            request, queryset, 
            ['tenbangluong', 'mabangluong']
        )
    
    # Filter theo kỳ lương
    ky_luong_id = request.GET.get('ky_luong', '').strip()
    if ky_luong_id:
        queryset = queryset.filter(kyluong_id=ky_luong_id)
    
    # Filter theo chế độ lương
    che_do_luong_id = request.GET.get('che_do_luong', '').strip()
    if che_do_luong_id:
        queryset = queryset.filter(chedoluong_id=che_do_luong_id)
    
    # Filter theo trạng thái
    trang_thai = request.GET.get('trang_thai', '').strip()
    if trang_thai:
        queryset = queryset.filter(trangthai=trang_thai)
    
    # Pagination
    context = get_list_context(
        request,
        queryset,
        search_fields=[],
        page_size=20,
        order_by=None
    )
    
    page_obj = context['page_obj']
    items_list = [
        BangLuongService.format_display(item)
        for item in page_obj.object_list
    ]
    
    return json_success(
        'Thành công',
        data=items_list,
        pagination={
            'page': page_obj.number,
            'page_size': context['paginator'].per_page,
            'total': context['paginator'].count,
            'total_pages': context['paginator'].num_pages,
            'has_next': page_obj.has_next(),
            'has_prev': page_obj.has_previous()
        }
    )


@require_http_methods(["GET"])
@handle_exceptions
def api_bang_luong_detail(request, pk):
    """
    API Lấy chi tiết Bảng lương
    """
    bang_luong = get_object_or_json_error(Bangluong, pk, "Không tìm thấy bảng lương")
    if not isinstance(bang_luong, Bangluong):
        return bang_luong
    
    data = BangLuongService.format_display(bang_luong)
    
    return json_success('Lấy chi tiết thành công', data=data)


@require_http_methods(["POST"])
@handle_exceptions
def api_bang_luong_create(request):
    """
    API Tạo mới Bảng lương
    """
    data = get_request_data(request)
    
    try:
        che_do_luong_id = data.get('che_do_luong_id')
        bang_luong = BangLuongService.create({
            'ten_bang_luong': data.get('ten_bang_luong', ''),
            'ky_luong_id': data.get('ky_luong_id'),
            'che_do_luong_id': data.get('che_do_luong_id'),
            'nguoi_tao': request.user.username if request.user.is_authenticated else '',
        })

        return json_success("Tạo bảng lương thành công", id=bang_luong.id)
        
    except ValueError as e:
        return json_error(str(e))
    except Exception as e:
        return json_error(f"Lỗi khi tạo bảng lương: {str(e)}")


@require_http_methods(["PUT", "POST"])
@handle_exceptions
def api_bang_luong_update(request, pk):
    """
    API Cập nhật Bảng lương
    """
    bang_luong = get_object_or_json_error(Bangluong, pk, "Không tìm thấy bảng lương")
    if not isinstance(bang_luong, Bangluong):
        return bang_luong
    
    data = get_request_data(request)
    
    try:
        BangLuongService.update(bang_luong, {
            'ten_bang_luong': data.get('ten_bang_luong', ''),
            'ky_luong_id': data.get('ky_luong_id'),
            'che_do_luong_id': data.get('che_do_luong_id'),
        })
        
        return json_success("Cập nhật bảng lương thành công")
        
    except ValueError as e:
        return json_error(str(e))
    except Exception as e:
        return json_error(f"Lỗi khi cập nhật: {str(e)}")


@require_http_methods(["POST", "DELETE"])
@handle_exceptions
def api_bang_luong_delete(request, pk):
    """
    API Xóa Bảng lương
    """
    bang_luong = get_object_or_json_error(Bangluong, pk, "Không tìm thấy bảng lương")
    if not isinstance(bang_luong, Bangluong):
        return bang_luong
    
    success, msg = BangLuongService.delete(bang_luong)
    
    if success:
        return json_success(msg)
    else:
        return json_error(msg)

@require_http_methods(["POST"])
@handle_exceptions
def api_bang_luong_approve(request, pk):
    """API Duyệt bảng lương: calculated -> approved"""
    bang_luong = get_object_or_json_error(Bangluong, pk, "Không tìm thấy bảng lương")
    if not isinstance(bang_luong, Bangluong):
        return bang_luong
    
    success, msg = BangLuongService.approve(bang_luong)
    if success:
        return json_success(msg)
    else:
        return json_error(msg)


@require_http_methods(["POST"])
@handle_exceptions
def api_bang_luong_mark_paid(request, pk):
    """API Đánh dấu đã chi trả: approved -> paid"""
    bang_luong = get_object_or_json_error(Bangluong, pk, "Không tìm thấy bảng lương")
    if not isinstance(bang_luong, Bangluong):
        return bang_luong
    
    success, msg = BangLuongService.mark_paid(bang_luong)
    if success:
        return json_success(msg)
    else:
        return json_error(msg)


@require_http_methods(["POST"])
@handle_exceptions
def api_bang_luong_cancel(request, pk):
    """API Hủy bảng lương: draft/processing/calculated -> cancelled"""
    bang_luong = get_object_or_json_error(Bangluong, pk, "Không tìm thấy bảng lương")
    if not isinstance(bang_luong, Bangluong):
        return bang_luong
    
    success, msg = BangLuongService.cancel(bang_luong)
    if success:
        return json_success(msg)
    else:
        return json_error(msg)
    

@require_http_methods(["GET"])
@handle_exceptions
def api_bang_luong_get_options(request):
    """
    API Lấy options cho dropdown (kỳ lương, chế độ lương)
    """
    today = date.today()
    month = int(request.GET.get('month', today.month))
    year = int(request.GET.get('year', today.year))
    
    # Kỳ lương theo tháng/năm (cho tạo mới)
    ky_luong_list = BangLuongService.get_available_ky_luong_for_create(month, year)
    ky_luong_options = []
    
    for kl in ky_luong_list:
        kl_year = kl.ngaybatdau.year if kl.ngaybatdau else year
        # Format đúng: 01/2026
        display = "{}/{}".format(str(kl.thang).zfill(2), kl_year)
        ky_luong_options.append({
            'id': kl.id,
            'thang': kl.thang,
            'nam': kl_year,
            'display': display
        })
    
    # Chế độ lương (tất cả active)
    che_do_luong_list = BangLuongService.get_available_che_do_luong()
    che_do_luong_options = []
    
    for cdl in che_do_luong_list:
        so_nv = BangLuongService.count_employees_in_che_do(cdl.id)
        che_do_luong_options.append({
            'id': cdl.id,
            'ma': cdl.machedo,
            'display': cdl.tenchedo,
            'so_nhan_vien': so_nv
        })
    
    return json_success('OK', data={
        'ky_luong': ky_luong_options,
        'che_do_luong': che_do_luong_options,
        'current_month': month,
        'current_year': year,
    })
