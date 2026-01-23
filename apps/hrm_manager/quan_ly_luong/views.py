from datetime import timezone
from django.shortcuts import render, get_object_or_404
from django.urls import reverse
from django.db import transaction
from django.views.decorators.http import require_http_methods
from django.db.models import Prefetch, Count, Q, Exists, OuterRef
from apps.hrm_manager.__core__.models import *
from apps.hrm_manager.utils.view_helpers import (
    get_list_context,
    json_success,
    handle_exceptions,
    json_error,
    json_response,
    get_request_data,
    get_object_or_json_error,
    validate_required_fields,
    validate_unique_field,
    safe_delete
)
from .services import CheDoLuongService

# --- HELPERS ---
def get_che_do_luong_tabs():
    """Tabs cho nhóm Chế độ lương (nếu cần mở rộng sau)"""
    return []  # Để rỗng nếu không có tabs


# --- VIEW:  Trang danh sách ---
def view_che_do_luong(request):
    """Màn hình danh sách Chế độ lương"""
    context = {
        'breadcrumbs': [
            {'title': 'Quản lý lương', 'url': '#'},
            {'title': 'Chế độ lương', 'url': None},
        ],
        'tabs':  get_che_do_luong_tabs(),
    }
    return render(request, "hrm_manager/quan_ly_luong/che_do_luong.html", context)


# --- API: Danh sách ---
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
    # Prefetch nhân viên áp dụng
    nhanvien_prefetch = Prefetch(
        'nhanvienchedoluong_set',
        queryset=NhanvienChedoluong.objects.select_related('nhanvien').filter(
            trangthai='active'
        ),
        to_attr='active_employees'
    )
    
    # Query chính với annotations
    queryset = Chedoluong.objects.prefetch_related(nhanvien_prefetch).annotate(
        so_nhan_vien=Count(
            'nhanvienchedoluong',
            filter=Q(nhanvienchedoluong__trangthai='active'),
            distinct=True
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
        # Danh sách tên nhân viên
        nhan_vien_list = [
            nv_rel.nhanvien.hovaten 
            for nv_rel in item.active_employees 
            if nv_rel.nhanvien
        ]
        
        items_list.append({
            'id': item.id,
            'ten_che_do_luong': item.tenchedo,
            'ma_che_do_luong': item.machedo,
            'nhan_vien_ap_dung': nhan_vien_list,
            'so_nhan_vien': item.so_nhan_vien,
            'ghi_chu': item.ghichu,
            'trang_thai': item.trangthai,
            'has_payrolls': item.has_payrolls,
            'is_default': item.machedo == CheDoLuongService.DEFAULT_CODE,
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
    from apps.hrm_manager.lich_lam_viec.services import LichLamViecService
    consolidated_dept_ids = LichLamViecService.get_consolidated_dept_ids(all_dept_ids)
    
    depts = []
    if consolidated_dept_ids:
        depts = [
            {'id': d.id, 'name': d.tenphongban}
            for d in Phongban.objects.filter(id__in=consolidated_dept_ids)
        ]
    
    # Lấy nhân viên thuộc phòng ban
    dept_emp_ids = LichLamViecService.get_employees_from_departments(all_dept_ids)
    
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
    
    data = {
        'id': che_do.id,
        'ten_che_do': che_do.tenchedo,
        'ma_che_do': che_do.machedo,
        'ghi_chu':  che_do.ghichu,
        'trang_thai': che_do.trangthai,
        'can_modify_code': CheDoLuongService.can_modify_code(che_do),
        
        # ✅ Thêm dữ liệu nhân viên/phòng ban
        'depts': depts,
        'emps': emps,
        'dept_ids': consolidated_dept_ids,
        'emp_ids': emp_ids,
    }
    
    return json_success('Lấy chi tiết thành công', data=data)


# --- API: Tạo mới ---
@require_http_methods(["POST"])
@handle_exceptions
def api_che_do_luong_create(request):
    """
    ✅ CẬP NHẬT:  Xử lý nhân viên/phòng ban
    """
    data = get_request_data(request)
    
    # Validate
    is_valid, missing = validate_required_fields(data, ['ten_che_do', 'ma_che_do'])
    if not is_valid: 
        return json_error(f"Vui lòng nhập đầy đủ:  {', '.join(missing)}")
    
    ma_che_do = data.get('ma_che_do', '').strip().upper()
    is_unique, msg = CheDoLuongService.validate_unique_code(ma_che_do)
    if not is_unique: 
        return json_error(msg)
    
    # Lấy dữ liệu nhân viên/phòng ban
    dept_ids = data.get('dept_ids', [])
    emp_ids = data.get('emp_ids', [])
    force_transfer = data.get('force_transfer', False)
    
    # Validate:  Phải chọn ít nhất 1
    if not dept_ids and not emp_ids:
        return json_error("Vui lòng chọn ít nhất một nhân viên hoặc bộ phận áp dụng")
    
    # Expand departments và resolve employees
    from apps.hrm_manager.lich_lam_viec.services import LichLamViecService
    all_dept_ids = LichLamViecService._expand_dept_ids(dept_ids)
    all_emp_ids = LichLamViecService.resolve_all_employees(all_dept_ids, emp_ids)
    
    # Check conflicts (nếu không force)
    if not force_transfer: 
        conflicts = CheDoLuongService.check_employee_conflicts(all_emp_ids)
        if conflicts:
            return json_response(
                success=False,
                message="Phát hiện nhân viên đang thuộc chế độ lương khác",
                data={'conflicts': conflicts, 'require_confirm': True},
                status=200
            )
    
    try:
        with transaction.atomic():
            # Tạo chế độ lương
            che_do_moi = Chedoluong.objects.create(
                tenchedo=data.get('ten_che_do', '').strip(),
                machedo=ma_che_do,
                ghichu=data.get('ghi_chu', '').strip(),
                trangthai='active',
                created_at=timezone.now()
            )
            
            # Xử lý assignment
            transferred = CheDoLuongService.process_employee_assignment(
                che_do_moi,
                all_dept_ids,
                all_emp_ids,
                force_transfer=force_transfer
            )
            
            response_data = {'id': che_do_moi.id}
            if transferred:
                response_data['transferred'] = transferred
            
            return json_success("Thêm mới chế độ lương thành công", **response_data)
    
    except Exception as e:
        return json_error(f"Lỗi khi lưu:  {str(e)}")


# --- API: Cập nhật ---
@require_http_methods(["PUT", "POST"])
@handle_exceptions
def api_che_do_luong_update(request, pk):
    """
    ✅ CẬP NHẬT:  Xử lý nhân viên/phòng ban
    """
    che_do = get_object_or_json_error(Chedoluong, pk, "Không tìm thấy chế độ lương")
    if not isinstance(che_do, Chedoluong):
        return che_do
    
    data = get_request_data(request)
    
    # Validate mã nếu thay đổi
    ma_che_do_moi = data.get('ma_che_do', '').strip().upper()
    if ma_che_do_moi != che_do.machedo:
        if not CheDoLuongService.can_modify_code(che_do):
            return json_error('Không thể sửa mã do đã có d��� liệu liên quan')
        
        is_unique, msg = CheDoLuongService.validate_unique_code(ma_che_do_moi, exclude_id=pk)
        if not is_unique:
            return json_error(msg)
    
    # Lấy dữ liệu nhân viên/phòng ban
    dept_ids = data.get('dept_ids', [])
    emp_ids = data.get('emp_ids', [])
    force_transfer = data.get('force_transfer', False)
    
    if not dept_ids and not emp_ids:
        return json_error("Vui lòng chọn ít nhất một nhân viên hoặc bộ phận áp dụng")
    
    # Expand và resolve
    from apps.hrm_manager.lich_lam_viec.services import LichLamViecService
    all_dept_ids = LichLamViecService._expand_dept_ids(dept_ids)
    all_emp_ids = LichLamViecService.resolve_all_employees(all_dept_ids, emp_ids)
    
    # Check conflicts (exclude chính nó)
    if not force_transfer:
        conflicts = CheDoLuongService.check_employee_conflicts(all_emp_ids, exclude_id=pk)
        if conflicts:
            return json_response(
                success=False,
                message="Phát hiện nhân viên đang thuộc chế độ lương khác",
                data={'conflicts':  conflicts, 'require_confirm':  True},
                status=200
            )
    
    try:
        with transaction.atomic():
            # Update thông tin cơ bản
            che_do.tenchedo = data.get('ten_che_do', '').strip()
            che_do.machedo = ma_che_do_moi
            che_do.ghichu = data.get('ghi_chu', '').strip()
            che_do.trangthai = data.get('trang_thai', 'active')
            che_do.updated_at = timezone.now()
            che_do.save()
            
            # Xử lý assignment
            transferred = CheDoLuongService.process_employee_assignment(
                che_do,
                all_dept_ids,
                all_emp_ids,
                force_transfer=force_transfer
            )
            
            response_data = {}
            if transferred:
                response_data['transferred'] = transferred
            
            return json_success("Cập nhật chế độ lương thành công", **response_data)
    
    except Exception as e:
        return json_error(f"Lỗi khi lưu: {str(e)}")


# --- API: Toggle Status ---
@require_http_methods(["POST"])
@handle_exceptions
def api_che_do_luong_toggle_status(request, pk):
    """
    API Bật/Tắt trạng thái
    ✅ Business Rules:  Xử lý bởi Service
    """
    che_do = get_object_or_json_error(Chedoluong, pk, "Không tìm thấy chế độ lương")
    if not isinstance(che_do, Chedoluong):
        return che_do
    
    data = get_request_data(request)
    is_active = data.get('is_active', False)
    
    # Gọi Service
    success, message = CheDoLuongService.toggle_status(che_do, is_active)
    
    if success:
        return json_success(message)
    else:
        return json_error(message)


# --- API: Xóa ---
@require_http_methods(["POST", "DELETE"])
@handle_exceptions
def api_che_do_luong_delete(request, pk):
    """
    API Xóa Chế độ lương
    ✅ Business Rules: Xử lý bởi Service
    """
    item = get_object_or_json_error(Chedoluong, pk, "Không tìm thấy dữ liệu")
    if not isinstance(item, Chedoluong):
        return item
    
    data = get_request_data(request)
    soft_delete = data.get('soft_delete', False)
    
    # Gọi Service
    success, message = CheDoLuongService.delete_che_do(item, soft_delete=soft_delete)
    
    if success:
        return json_success(message)
    else:
        return json_error(message)
    
# --- FORM PAGES ---
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

# --- API:  CHECK CONFLICTS ---
@require_http_methods(["POST"])
@handle_exceptions
def api_che_do_luong_check_conflicts(request):
    """
    API kiểm tra xung đột nhân viên/phòng ban
    Tái sử dụng logic từ LichLamViecService
    """
    try:
        data = get_request_data(request)
        dept_ids = data.get('dept_ids', [])
        emp_ids = data.get('emp_ids', [])
        exclude_id = data.get('exclude_id')

        # Resolve all employees
        from apps.hrm_manager.lich_lam_viec.services import LichLamViecService
        all_dept_ids = LichLamViecService._expand_dept_ids(dept_ids)
        all_emp_ids = LichLamViecService.resolve_all_employees(all_dept_ids, emp_ids)

        if not all_emp_ids:
            return json_success("Không có nhân viên nào được chọn", data={'conflicts': []})

        # Check conflicts
        conflicts = CheDoLuongService.check_employee_conflicts(
            all_emp_ids,
            exclude_id=exclude_id
        )

        if conflicts:
            return json_response(
                success=False,
                message="Phát hiện nhân viên đang thuộc chế độ lương khác",
                data={'conflicts': conflicts},
                status=200
            )

        return json_success("Hợp lệ", data={'conflicts': []})

    except Exception as e: 
        return json_error(str(e))