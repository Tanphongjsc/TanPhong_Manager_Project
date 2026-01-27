from django.shortcuts import render
from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_http_methods
from django.utils.timezone import now
from json import loads
from collections import defaultdict
from datetime import date, datetime, timedelta
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

from django.urls import reverse
from django.db import transaction
from django.db.models import F, Prefetch, Count, Q, Exists, OuterRef
from apps.hrm_manager.__core__.models import *
from .services import CheDoLuongService, PayrollPeriodLockException, ActiveEmployeesExistException, ConflictException

# Create your views here.

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



# ============================================================================
# API URLS
# ============================================================================

# ------------------------------- PHẦN TỬ LƯƠNG ------------------------------
# @login_required
@require_http_methods(["GET", "POST"])
def api_phan_tu_luong_list(request):
    """API lấy danh sách phần tử lương"""

    group_params = request.GET.get('is_group', False)
    print(group_params)
    
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
        # Xóa phần tử lương
        try:        
            nhom_phan_tu_luong.delete()
            return json_response(message='Xóa nhóm phần tử lương thành công')
        except :
            return json_error('Lỗi trong quá trình xóa nhóm phần tử lương', status=400)

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

def _save_quy_tac(che_do, quy_tac_list):
    """Helper function để lưu quy tắc"""
    # Xóa quy tắc cũ
    Quytacchedoluong.objects.filter(chedoluong=che_do).delete()
    
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