from django.shortcuts import render, get_object_or_404
from django.urls import reverse
from django.views.decorators.http import require_http_methods
from django.utils import timezone
import json
from apps.hrm_manager.__core__.models import Nganhang, Baohiem, Loainhanvien

from apps.hrm_manager.utils.view_helpers import (
    get_list_context,
    json_response,
    json_error,
    json_success,
    validate_required_fields,
    validate_unique_field,
    get_field_value,
    safe_delete,
    handle_exceptions,
)

# ============================================================================
# VIEW URLS - TRANG CHÍNH
# ============================================================================

def view_cay_nhan_su_index(request):
    """Hiển thị trang cây nhân sự"""
    return render(request, "hrm_manager/quan_ly_nhan_su/caynhansu.html")


def view_bao_cao_index(request):
    """Hiển thị trang báo cáo"""
    return render(request, "hrm_manager/quan_ly_nhan_su/baocao.html")


def view_chuc_vu_index(request):
    """Hiển thị trang chức vụ"""
    return render(request, "hrm_manager/quan_ly_nhan_su/chucvu.html")


def view_danh_muc_index(request):
    """Hiển thị trang danh mục hệ thống"""
    return render(request, "hrm_manager/quan_ly_nhan_su/danhmuchethong.html")


def view_bo_thuong_index(request):
    """Hiển thị trang quản lý bồi thường"""
    return render(request, "hrm_manager/quan_ly_nhan_su/quanlythongtin_boithuong.html")


def view_tam_ung_index(request):
    """Hiển thị trang quản lý tạm ứng"""
    return render(request, "hrm_manager/quan_ly_nhan_su/quanlythongtin_quanlytamung.html")


# ============================================================================
# VIEW URLS - DANH MỤC HỆ THỐNG
# ============================================================================

def view_dmht_nganhang_list(request):
    """Hiển thị danh sách ngân hàng"""
    queryset = Nganhang.objects.all()
   
    context = get_list_context(
        request,
        queryset,
        search_fields=['TenNganHang', 'MaNganHang', 'TenVietTat'],
        filter_field=('TrangThai', 'status'),
        page_size=20,
        order_by='-created_at'
    )

    # ✅ Thêm breadcrumbs
    context['breadcrumbs'] = [
        {'title': 'Quản lý nhân sự', 'url': '#'},
        {'title': 'Danh mục hệ thống', 'url': reverse('hrm:to_chuc_nhan_su:danh_muc_index')},
        {'title': 'Danh mục ngân hàng', 'url': None},
    ]
    
    return render(request, "hrm_manager/quan_ly_nhan_su/dmht_nganhang.html", context)


def view_dmht_baohiem_list(request):
    """Hiển thị danh sách bảo hiểm"""
    queryset = Baohiem.objects.all()
    
    context = get_list_context(
        request,
        queryset,
        search_fields=['TenBaoHiem', 'MaBaoHiem'],
        filter_field=('TrangThai', 'status'),
        page_size=20,
        order_by='-created_at'
    )

    # ✅ Thêm breadcrumbs
    context['breadcrumbs'] = [
        {'title': 'Quản lý nhân sự', 'url': '#'},
        {'title': 'Danh mục hệ thống', 'url': reverse('hrm:to_chuc_nhan_su:danh_muc_index')},
        {'title': 'Danh mục bảo hiểm', 'url': None},
    ]
    
    return render(request, "hrm_manager/quan_ly_nhan_su/dmht_baohiem.html", context)


def view_dmht_loainhanvien_list(request):
    """Hiển thị danh sách loại nhân viên"""
    queryset = Loainhanvien.objects.all()
    
    context = get_list_context(
        request,
        queryset,
        search_fields=['TenLoaiNV', 'MaLoaiNV'],
        filter_field=('TrangThai', 'status'),
        page_size=20,
        order_by='-created_at'
    )
    
    # ✅ Thêm breadcrumbs
    context['breadcrumbs'] = [
        {'title': 'Quản lý nhân sự', 'url': '#'},
        {'title': 'Danh mục hệ thống', 'url': reverse('hrm:to_chuc_nhan_su:danh_muc_index')},
        {'title': 'Danh mục loại nhân viên', 'url': None},
    ]
    return render(request, "hrm_manager/quan_ly_nhan_su/dmht_loainhanvien.html", context)


# ============================================================================
# API URLS - DANH MỤC LISTS (JSON)
# ============================================================================

@require_http_methods(["GET"])
@handle_exceptions # Tự động bắt lỗi và trả về JSON error [cite: 18]
def api_nganhang_list(request):
    """API lấy danh sách ngân hàng (JSON) hỗ trợ search, filter, pagination"""
    queryset = Nganhang.objects.all()
    
    # 1. Tận dụng get_list_context để lấy context
    # Logic này giống hệt view_dmht_nganhang_list [cite: 316]
    context = get_list_context(
        request,
        queryset,
        search_fields=['TenNganHang', 'MaNganHang', 'TenVietTat'],
        filter_field=('TrangThai', 'status'),
        page_size=20, # Bạn có thể đổi thành int(request.GET.get('page_size', 20)) nếu muốn
        order_by='-created_at'
    )
    
    page_obj = context['page_obj']
    paginator = context['paginator']

    # 2. Serialize dữ liệu từ page_obj
    # Lấy cấu trúc fields từ api_nganhang_detail [cite: 321, 322]
    items_list = []
    for item in page_obj.object_list:
        items_list.append({
            'id': item.id,
            'TenNganHang': item.tennganhang,
            'MaNganHang': item.manganhang,
            'TenVietTat': item.tenviettat or '',
            'DiaChiChiNhanh': item.diachichinhanh or '',
            'TrangThai': item.trangthai,
        })
    
    # 3. Chuẩn bị thông tin pagination
    pagination_data = {
        'page': page_obj.number,
        'page_size': paginator.per_page, 
        'total': paginator.count,
        'total_pages': paginator.num_pages,
        'has_next': page_obj.has_next(),
        'has_prev': page_obj.has_previous()
    }
    
    # 4. Trả về bằng json_success [cite: 12]
    return json_success(
        'Lấy danh sách ngân hàng thành công',
        data=items_list,
        pagination=pagination_data
    )


@require_http_methods(["GET"])
@handle_exceptions
def api_baohiem_list(request):
    """API lấy danh sách bảo hiểm (JSON) hỗ trợ search, filter, pagination"""
    queryset = Baohiem.objects.all()
    
    # Logic này giống hệt view_dmht_baohiem_list [cite: 318]
    context = get_list_context(
        request,
        queryset,
        search_fields=['TenBaoHiem', 'MaBaoHiem'],
        filter_field=('TrangThai', 'status'),
        page_size=20,
        order_by='-created_at'
    )
    
    page_obj = context['page_obj']
    paginator = context['paginator']

    # Lấy cấu trúc fields từ api_baohiem_detail [cite: 332]
    items_list = []
    for item in page_obj.object_list:
        items_list.append({
            'id': item.id,
            'tenbaohiem': item.tenbaohiem,
            'mabaohiem': item.mabaohiem,
            'ghichu': item.ghichu or '',
            'trangthai': item.trangthai,
        })
    
    pagination_data = {
        'page': page_obj.number,
        'page_size': paginator.per_page, 
        'total': paginator.count,
        'total_pages': paginator.num_pages,
        'has_next': page_obj.has_next(),
        'has_prev': page_obj.has_previous()
    }
    
    return json_success(
        'Lấy danh sách bảo hiểm thành công',
        data=items_list,
        pagination=pagination_data
    )


@require_http_methods(["GET"])
@handle_exceptions
def api_loainhanvien_list(request):
    """API lấy danh sách loại nhân viên (JSON) hỗ trợ search, filter, pagination"""
    queryset = Loainhanvien.objects.all()
    
    # Logic này giống hệt view_dmht_loainhanvien_list [cite: 319]
    context = get_list_context(
        request,
        queryset,
        search_fields=['TenLoaiNV', 'MaLoaiNV'],
        filter_field=('TrangThai', 'status'),
        page_size=20,
        order_by='-created_at'
    )
    
    page_obj = context['page_obj']
    paginator = context['paginator']

    # Lấy cấu trúc fields từ api_loainhanvien_detail [cite: 342, 343]
    items_list = []
    for item in page_obj.object_list:
        items_list.append({
            'id': item.id,
            'TenLoaiNV': item.tenloainv,
            'MaLoaiNV': item.maloainv,
            'GhiChu': item.ghichu or '',
            'trangthai': item.trangthai,
        })
    
    pagination_data = {
        'page': page_obj.number,
        'page_size': paginator.per_page, 
        'total': paginator.count,
        'total_pages': paginator.num_pages,
        'has_next': page_obj.has_next(),
        'has_prev': page_obj.has_previous()
    }
    
    return json_success(
        'Lấy danh sách loại nhân viên thành công',
        data=items_list,
        pagination=pagination_data
    )


# ============================================================================
# API URLS - NGÂN HÀNG
# ============================================================================

@require_http_methods(["GET"])
def api_nganhang_detail(request, pk):
    """API lấy chi tiết ngân hàng"""
    try:
        item = get_object_or_404(Nganhang, pk=pk)
        
        return json_response(
            success=True,
            data={
                'id': item.id,
                'TenNganHang': item.tennganhang,
                'MaNganHang': item.manganhang,
                'TenVietTat': item.tenviettat or '',
                'DiaChiChiNhanh': item.diachichinhanh or '',
                'TrangThai': item.trangthai,
            }
        )
    except Exception as e:
        return json_error(str(e), status=400)


@require_http_methods(["POST"])
def api_nganhang_create(request):
    """API tạo mới ngân hàng"""
    try:
        is_valid, missing = validate_required_fields(
            request.POST,
            ['TenNganHang', 'MaNganHang']
        )
        
        if not is_valid:
            return json_error('Vui lòng nhập đầy đủ tên và mã ngân hàng')
        
        ten_ngan_hang = get_field_value(request, 'TenNganHang')
        ma_ngan_hang = get_field_value(request, 'MaNganHang')
        
        if not validate_unique_field(Nganhang, 'manganhang', ma_ngan_hang):
            return json_error('Mã ngân hàng đã tồn tại')
        
        item = Nganhang.objects.create(
            tennganhang=ten_ngan_hang,
            manganhang=ma_ngan_hang,
            tenviettat=get_field_value(request, 'TenVietTat'),
            diachichinhanh=get_field_value(request, 'DiaChiChiNhanh'),
            trangthai='active',
            created_at=timezone.now(),
            updated_at=timezone.now()
        )
        
        return json_success('Thêm ngân hàng thành công', id=item.id)
        
    except Exception as e:
        return json_error(str(e), status=400)


@require_http_methods(["POST"])
def api_nganhang_update(request, pk):
    """API cập nhật ngân hàng"""
    try:
        item = get_object_or_404(Nganhang, pk=pk)
        
        is_valid, missing = validate_required_fields(
            request.POST,
            ['TenNganHang', 'MaNganHang']
        )
        
        if not is_valid:
            return json_error('Vui lòng nhập đầy đủ tên và mã ngân hàng')
        
        ten_ngan_hang = get_field_value(request, 'TenNganHang')
        ma_ngan_hang = get_field_value(request, 'MaNganHang')
        
        if not validate_unique_field(Nganhang, 'manganhang', ma_ngan_hang, exclude_pk=pk):
            return json_error('Mã ngân hàng đã tồn tại')
        
        item.tennganhang = ten_ngan_hang
        item.manganhang = ma_ngan_hang
        item.tenviettat = get_field_value(request, 'TenVietTat')
        item.diachichinhanh = get_field_value(request, 'DiaChiChiNhanh')
        item.updated_at = timezone.now()
        item.save()
        
        return json_success('Cập nhật ngân hàng thành công')
        
    except Exception as e:
        return json_error(str(e), status=400)


@require_http_methods(["POST"])
def api_nganhang_delete(request, pk):
    """API xóa ngân hàng"""
    try:
        item = get_object_or_404(Nganhang, pk=pk)
        
        success, message = safe_delete(item)
        
        if success:
            return json_success(message)
        else:
            return json_error(message)
            
    except Exception as e:
        return json_error(str(e), status=400)


@require_http_methods(["POST"])
def api_nganhang_toggle_status(request, pk):
    """API toggle trạng thái ngân hàng"""
    try:
        item = get_object_or_404(Nganhang, pk=pk)
        
        data = json.loads(request.body)
        
        item.trangthai = 'active' if data.get('is_active') else 'inactive'
        item.updated_at = timezone.now()
        item.save()
        
        return json_success('Cập nhật trạng thái thành công')
        
    except Exception as e:
        return json_error(str(e), status=400)


# ============================================================================
# API URLS - BẢO HIỂM
# ============================================================================

@require_http_methods(["GET"])
def api_baohiem_detail(request, pk):
    """API lấy chi tiết bảo hiểm"""
    try:
        item = get_object_or_404(Baohiem, pk=pk)
        
        return json_response(
            success=True,
            data={
                'id': item.id,
                'tenbaohiem': item.tenbaohiem,
                'mabaohiem': item.mabaohiem,
                'ghichu': item.ghichu or '',
                'trangthai': item.trangthai,
            }
        )
    except Exception as e:
        return json_error(str(e), status=400)


@require_http_methods(["POST"])
def api_baohiem_create(request):
    """API tạo mới bảo hiểm"""
    try:
        is_valid, missing = validate_required_fields(
            request.POST,
            ['TenBaoHiem', 'MaBaoHiem']
        )
        
        if not is_valid:
            return json_error('Vui lòng nhập đầy đủ tên và mã bảo hiểm')
        
        ten_bao_hiem = get_field_value(request, 'TenBaoHiem')
        ma_bao_hiem = get_field_value(request, 'MaBaoHiem')
        
        if not validate_unique_field(Baohiem, 'mabaohiem', ma_bao_hiem):
            return json_error('Mã bảo hiểm đã tồn tại')
        
        item = Baohiem.objects.create(
            tenbaohiem=ten_bao_hiem,
            mabaohiem=ma_bao_hiem,
            ghichu=get_field_value(request, 'GhiChu'),
            trangthai='active',
            created_at=timezone.now(),
            updated_at=timezone.now()
        )
        
        return json_success('Thêm bảo hiểm thành công', id=item.id)
        
    except Exception as e:
        return json_error(str(e), status=400)


@require_http_methods(["POST"])
def api_baohiem_update(request, pk):
    """API cập nhật bảo hiểm"""
    try:
        item = get_object_or_404(Baohiem, pk=pk)
        
        is_valid, missing = validate_required_fields(
            request.POST,
            ['TenBaoHiem', 'MaBaoHiem']
        )
        
        if not is_valid:
            return json_error('Vui lòng nhập đầy đủ tên và mã bảo hiểm')
        
        ten_bao_hiem = get_field_value(request, 'TenBaoHiem')
        ma_bao_hiem = get_field_value(request, 'MaBaoHiem')
        
        if not validate_unique_field(Baohiem, 'mabaohiem', ma_bao_hiem, exclude_pk=pk):
            return json_error('Mã bảo hiểm đã tồn tại')
        
        item.tenbaohiem = ten_bao_hiem
        item.mabaohiem = ma_bao_hiem
        item.ghichu = get_field_value(request, 'GhiChu')
        item.updated_at = timezone.now()
        item.save()
        
        return json_success('Cập nhật bảo hiểm thành công')
        
    except Exception as e:
        return json_error(str(e), status=400)


@require_http_methods(["POST"])
def api_baohiem_delete(request, pk):
    """API xóa bảo hiểm"""
    try:
        item = get_object_or_404(Baohiem, pk=pk)
        
        success, message = safe_delete(item)
        
        if success:
            return json_success(message)
        else:
            return json_error(message)
            
    except Exception as e:
        return json_error(str(e), status=400)


@require_http_methods(["POST"])
def api_baohiem_toggle_status(request, pk):
    """API toggle trạng thái bảo hiểm"""
    try:
        item = get_object_or_404(Baohiem, pk=pk)
        data = json.loads(request.body)
        
        item.trangthai = 'active' if data.get('is_active') else 'inactive'
        item.updated_at = timezone.now()
        item.save()
        
        return json_success('Cập nhật trạng thái thành công')
        
    except Exception as e:
        return json_error(str(e), status=400)


# ============================================================================
# API URLS - LOẠI NHÂN VIÊN
# ============================================================================

@require_http_methods(["GET"])
def api_loainhanvien_detail(request, pk):
    """API lấy chi tiết loại nhân viên"""
    try:
        item = get_object_or_404(Loainhanvien, pk=pk)
        
        return json_response(
            success=True,
            data={
                'id': item.id,
                'TenLoaiNV': item.tenloainv,
                'MaLoaiNV': item.maloainv,
                'GhiChu': item.ghichu or '',
                'tenloainv': item.tenloainv,
                'maloainv': item.maloainv,
                'ghichu': item.ghichu or '',
                'trangthai': item.trangthai,
            }
        )
    except Exception as e:
        return json_error(str(e), status=400)


@require_http_methods(["POST"])
def api_loainhanvien_create(request):
    """API tạo mới loại nhân viên"""
    try:
        is_valid, missing = validate_required_fields(
            request.POST,
            ['TenLoaiNV', 'MaLoaiNV']
        )
        
        if not is_valid:
            return json_error('Vui lòng nhập đầy đủ tên và mã loại nhân viên')
        
        ten_loai_nv = get_field_value(request, 'TenLoaiNV')
        ma_loai_nv = get_field_value(request, 'MaLoaiNV')
        
        if not validate_unique_field(Loainhanvien, 'maloainv', ma_loai_nv):
            return json_error('Mã loại nhân viên đã tồn tại')
        
        item = Loainhanvien.objects.create(
            tenloainv=ten_loai_nv,
            maloainv=ma_loai_nv,
            ghichu=get_field_value(request, 'GhiChu'),
            trangthai='active',
            created_at=timezone.now(),
            updated_at=timezone.now()
        )
        
        return json_success('Thêm loại nhân viên thành công', id=item.id)
        
    except Exception as e:
        return json_error(str(e), status=400)


@require_http_methods(["POST"])
def api_loainhanvien_update(request, pk):
    """API cập nhật loại nhân viên"""
    try:
        item = get_object_or_404(Loainhanvien, pk=pk)
        
        is_valid, missing = validate_required_fields(
            request.POST,
            ['TenLoaiNV', 'MaLoaiNV']
        )
        
        if not is_valid:
            return json_error('Vui lòng nhập đầy đủ tên và mã loại nhân viên')
        
        ten_loai_nv = get_field_value(request, 'TenLoaiNV')
        ma_loai_nv = get_field_value(request, 'MaLoaiNV')
        
        if not validate_unique_field(Loainhanvien, 'maloainv', ma_loai_nv, exclude_pk=pk):
            return json_error('Mã loại nhân viên đã tồn tại')
        
        item.tenloainv = ten_loai_nv
        item.maloainv = ma_loai_nv
        item.ghichu = get_field_value(request, 'GhiChu')
        item.updated_at = timezone.now()
        item.save()
        
        return json_success('Cập nhật loại nhân viên thành công')
        
    except Exception as e:
        return json_error(str(e), status=400)


@require_http_methods(["POST"])
def api_loainhanvien_delete(request, pk):
    """API xóa loại nhân viên"""
    try:
        item = get_object_or_404(Loainhanvien, pk=pk)
        
        success, message = safe_delete(item)
        
        if success:
            return json_success(message)
        else:
            return json_error(message)
            
    except Exception as e:
        return json_error(str(e), status=400)


@require_http_methods(["POST"])
def api_loainhanvien_toggle_status(request, pk):
    """API toggle trạng thái loại nhân viên"""
    try:
        item = get_object_or_404(Loainhanvien, pk=pk)
        
        data = json.loads(request.body)
        
        item.trangthai = 'active' if data.get('is_active') else 'inactive'
        item.updated_at = timezone.now()
        item.save()
        
        return json_success('Cập nhật trạng thái thành công')
        
    except Exception as e:
        return json_error(str(e), status=400)