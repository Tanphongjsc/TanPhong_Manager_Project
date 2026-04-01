from calendar import monthrange
from datetime import date, timedelta
from django.shortcuts import render
from django.db.models import Q, Count, Prefetch, Case, When, Value, IntegerField
from django.core.paginator import Paginator
from django.shortcuts import get_object_or_404
from django.urls import reverse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_http_methods
from apps.hrm_manager.__core__.models import *
import json
from collections import defaultdict
from django.utils import timezone
from django.db import transaction
from .services import CaLamViecService, LichLamViecService, ConflictException
from apps.hrm_manager.utils.permissions import require_api_permission, require_view_permission
from apps.hrm_manager.to_chuc_nhan_su.views import get_all_child_department_ids

from apps.hrm_manager.utils.view_helpers import (
    get_list_context, 
    json_success, 
    handle_exceptions,
    json_success, 
    json_error, 
    json_response,
    safe_delete,
    get_request_data,          
    get_object_or_json_error,  
    validate_required_fields,  
    validate_unique_field
)
# --- HELPERS ĐỂ CẤU HÌNH TABS ---

def get_thiet_ke_lich_tabs():
    """Trả về cấu hình tabs cho nhóm Thiết kế lịch làm việc"""
    return [
        {'label': 'Thiết kế Ca làm việc', 'url_name': 'thiet_ke_ca', 'url': reverse('hrm:lich_lam_viec:thiet_ke_ca')},
        {'label': 'Thiết kế Lịch làm việc', 'url_name': 'thiet_ke_lich', 'url': reverse('hrm:lich_lam_viec:thiet_ke_lich')},
        {'label': 'Tổng hợp Lịch làm việc', 'url_name': 'tong_hop_lich', 'url': reverse('hrm:lich_lam_viec:tong_hop_lich')},
    ]

def get_thiet_ke_nghi_tabs():
    """Trả về cấu hình tabs cho nhóm Thiết kế lịch nghỉ"""
    return [
        {'label': 'Thiết kế Lịch nghỉ', 'url_name': 'thiet_ke_lich_nghi', 'url': reverse('hrm:lich_lam_viec:thiet_ke_lich_nghi')},
        {'label': 'Thiết kế Quỹ nghỉ', 'url_name': 'thiet_ke_quy_nghi', 'url': reverse('hrm:lich_lam_viec:thiet_ke_quy_nghi')},
        {'label': 'Tổng hợp Ngày nghỉ', 'url_name': 'tong_hop_nghi', 'url': reverse('hrm:lich_lam_viec:tong_hop_nghi')},
    ]

def _normalize_summary_date_range(start_raw, end_raw):
    """Chuẩn hóa khoảng ngày cho tab tổng hợp lịch (tối đa 31 ngày)."""
    today = date.today()

    if start_raw and end_raw:
        start_date = date.fromisoformat(start_raw)
        end_date = date.fromisoformat(end_raw)
    elif start_raw:
        start_date = date.fromisoformat(start_raw)
        end_date = start_date + timedelta(days=6)
    elif end_raw:
        end_date = date.fromisoformat(end_raw)
        start_date = end_date - timedelta(days=6)
    else:
        start_date = today
        end_date = today + timedelta(days=6)

    if start_date > end_date:
        raise ValueError("Ngày bắt đầu không được lớn hơn ngày kết thúc")

    range_days = (end_date - start_date).days + 1
    if range_days > 31:
        raise ValueError("Khoảng ngày tối đa là 31 ngày")

    return start_date, end_date, range_days


def _parse_positive_int(raw_value, default_value, min_value=1, max_value=None):
    """Parse số nguyên dương với giới hạn biên an toàn."""
    try:
        value = int(raw_value)
    except (TypeError, ValueError):
        value = default_value

    if value < min_value:
        value = min_value
    if max_value is not None and value > max_value:
        value = max_value

    return value


def _format_time_range(start_time, end_time):
    if not start_time or not end_time:
        return ""
    return f"{start_time.strftime('%H:%M')} - {end_time.strftime('%H:%M')}"

# --- 1.VIEWS: THIẾT KẾ LỊCH LÀM VIỆC ---

@login_required
@require_view_permission('access_control.view_lich_lam_viec')
def view_ca_lam_viec(request):
    
    # Query: Lấy tất cả các giá trị 'loaichamcong' đã từng nhập, loại bỏ trùng lặp
    # Model: Calamviec, Field: loaichamcong 
    distinct_loai_ca = Calamviec.objects.values_list('loaichamcong', flat=True).distinct().order_by('loaichamcong')
    
    # Tạo list options cho select box
    filter_options = []
    for loai in distinct_loai_ca:
        if loai: # Bỏ qua giá trị rỗng
            filter_options.append({'value': loai, 'label': loai})

    context = {
        'breadcrumbs': [
            {'title': 'Chấm công', 'url': '#'},
            {'title': 'Quản lý lịch làm việc', 'url': None},
            {'title': 'Thiết kế ca làm việc', 'url': None},
        ],
        'tabs': get_thiet_ke_lich_tabs(),
        'filter_options': filter_options,
        'page_title': 'Quản lý ca làm việc',
    }
    return render(request, "hrm_manager/lich_lam_viec/ca_lam_viec.html", context)


@login_required
@require_view_permission('access_control.write_lich_lam_viec')
def view_ca_lam_viec_create(request):
    """Màn hình Thêm mới Ca"""
    breadcrumbs = [
        {'title': 'Chấm công', 'url': '#'},
        {'title': 'Thiết kế ca làm việc', 'url': reverse('hrm:lich_lam_viec:thiet_ke_ca')},
        {'title': 'Thêm mới ca làm việc', 'url': None},
    ]
    return render(request, "hrm_manager/lich_lam_viec/ca_form_page.html", {
        'title': 'Thêm mới ca làm việc',
        'breadcrumbs': breadcrumbs,
        'cancel_url': reverse('hrm:lich_lam_viec:thiet_ke_ca')
    })

@login_required
@require_view_permission('access_control.write_lich_lam_viec')
def view_ca_lam_viec_update(request, pk):
    """Màn hình Cập nhật Ca"""
    breadcrumbs = [
        {'title': 'Chấm công', 'url': '#'},
        {'title': 'Thiết kế ca làm việc', 'url': reverse('hrm:lich_lam_viec:thiet_ke_ca')},
        {'title': 'Cập nhật ca làm việc', 'url': None},
    ]
    return render(request, "hrm_manager/lich_lam_viec/ca_form_page.html", {
        'title': 'Cập nhật ca làm việc',
        'breadcrumbs': breadcrumbs,
        'item_id': pk, # Truyền ID xuống để JS biết đường gọi API detail
        'cancel_url': reverse('hrm:lich_lam_viec:thiet_ke_ca')
    })

@login_required
@require_view_permission('access_control.view_lich_lam_viec')
def view_lich_lam_viec(request):
    
    # Lấy danh sách loại kịch bản để làm bộ lọc
    distinct_types = Lichlamviec.objects.values_list('loaikichbanlamviec', flat=True).distinct()
    filter_options = [{'value': t, 'label': t} for t in distinct_types if t]

    context = {
        'breadcrumbs': [
            {'title': 'Chấm công', 'url': '#'},
            {'title': 'Quản lý lịch làm việc', 'url': None},
            {'title': 'Thiết kế lịch làm việc', 'url': None},
        ],
        'tabs': get_thiet_ke_lich_tabs(),
        'filter_options': filter_options,
        'page_title': 'Quản lý lịch làm việc',
    }
    return render(request, "hrm_manager/lich_lam_viec/lich_lam_viec.html", context)

@login_required
@require_view_permission('access_control.write_lich_lam_viec')
def view_lich_lam_viec_create(request):
    """Màn hình Thêm mới Ca"""
    breadcrumbs = [
        {'title': 'Chấm công', 'url': '#'},
        {'title': 'Thiết kế lịch làm việc', 'url': reverse('hrm:lich_lam_viec:thiet_ke_lich')},
        {'title': 'Thêm mới lịch làm việc', 'url': None},
    ]
    return render(request, "hrm_manager/lich_lam_viec/lich_form_page.html", {
        'title': 'Thêm mới lịch làm việc',
        'breadcrumbs': breadcrumbs,
        'cancel_url': reverse('hrm:lich_lam_viec:thiet_ke_lich'),
        'is_update': False
    })

@login_required
@require_view_permission('access_control.write_lich_lam_viec')
def view_lich_lam_viec_update(request, pk):
    """Màn hình Cập nhật Lịch làm việc"""
    context = {
        'title': 'Cập nhật lịch làm việc',
        'breadcrumbs': [
            {'title': 'Chấm công', 'url': '#'},
            {'title': 'Thiết kế lịch làm việc', 'url': reverse('hrm:lich_lam_viec:thiet_ke_lich')},
            {'title': 'Cập nhật lịch làm việc', 'url': None},
        ],
        'cancel_url': reverse('hrm:lich_lam_viec:thiet_ke_lich'),
        'item_id': pk,
        'is_update': True
    }
    return render(request, "hrm_manager/lich_lam_viec/lich_form_page.html", context)

@login_required
@require_view_permission('access_control.view_lich_lam_viec')
def view_tong_hop_lich(request):
    context = {
        'breadcrumbs': [
            {'title': 'Chấm công', 'url': '#'},
            {'title': 'Quản lý lịch làm việc', 'url': None},
            {'title': 'Tổng hợp lịch làm việc', 'url': None},
        ],
        'tabs': get_thiet_ke_lich_tabs(),
        'page_title': 'Tổng hợp lịch làm việc',
    }
    return render(request, "hrm_manager/lich_lam_viec/tong_hop_lich.html", context)

# --- 2.VIEWS: THIẾT KẾ LỊCH NGHỈ ---

@login_required
@require_view_permission('access_control.view_lich_lam_viec')
def view_lich_nghi(request):
    context = {
        'breadcrumbs': [
            {'title': 'Chấm công', 'url': '#'},
            {'title': 'Lịch nghỉ', 'url': None},
            {'title': 'Thiết kế lịch nghỉ', 'url': None},
        ],
        'tabs': get_thiet_ke_nghi_tabs(),
        'page_title': 'Quản lý lịch nghỉ',
    }
    return render(request, "hrm_manager/lich_lam_viec/lich_nghi/lich_nghi.html", context)

@login_required
@require_view_permission('access_control.view_lich_lam_viec')
def view_quy_nghi(request):
    context = {
        'breadcrumbs': [
            {'title': 'Chấm công', 'url': '#'},
            {'title': 'Lịch nghỉ', 'url': None},
            {'title': 'Quỹ nghỉ', 'url': None},
        ],
        'tabs': get_thiet_ke_nghi_tabs(),
        'page_title': 'Quản lý lịch nghỉ',
    }
    return render(request, "hrm_manager/lich_lam_viec/lich_nghi/quy_nghi.html", context)

@login_required
@require_view_permission('access_control.view_lich_lam_viec')
def view_tong_hop_nghi(request):
    context = {
        'breadcrumbs': [
            {'title': 'Chấm công', 'url': '#'},
            {'title': 'Lịch nghỉ', 'url': None},
            {'title': 'Tổng hợp nghỉ', 'url': None},
        ],
        'tabs': get_thiet_ke_nghi_tabs(),
        'page_title': 'Quản lý lịch nghỉ',
    }
    return render(request, "hrm_manager/lich_lam_viec/lich_nghi/tong_hop_nghi.html", context)


# ------------------- API TRẢ VỀ JSON -------------------
#==================== CA LÀM VIỆC =======================
#========================================================

@login_required
@require_api_permission('access_control.view_lich_lam_viec')
@require_http_methods(["GET"])
@handle_exceptions
def api_calamviec_list(request):
    """API Lấy danh sách hiển thị bảng"""
    khung_gio_prefetch = Prefetch(
        'khunggiolamviec_set',
        queryset=Khunggiolamviec.objects.order_by('id')
    )
    
    # 1.Annotate ưu tiên: CAHANHCHINH = 0, Các ca khác = 1
    queryset = Calamviec.objects.filter(Q(is_deleted=False) | Q(is_deleted__isnull=True)).prefetch_related(khung_gio_prefetch).annotate(
        is_system_default=Case(
            When(macalamviec='CAHANHCHINH', then=Value(0)),
            default=Value(1),
            output_field=IntegerField(),
        )
    ).order_by('is_system_default', '-created_at') # CAHANHCHINH lên đầu, sau đó mới đến ngày tạo
    
    # Sử dụng Helper tạo context list
    context = get_list_context(
        request,
        queryset,
        search_fields=['tencalamviec', 'macalamviec'],
        filter_field=('loaichamcong', 'loaichamcong'),
        page_size=20,
        order_by=None # Để None để giữ nguyên thứ tự sắp xếp của queryset
    )
    
    page_obj = context['page_obj']
    items_list = []
    
    for item in page_obj.object_list:
        # Format hiển thị khung giờ
        khung_gios = []
        for kg in item.khunggiolamviec_set.all():
            start = kg.thoigianbatdau.strftime('%H:%M') if kg.thoigianbatdau else ''
            end = kg.thoigianketthuc.strftime('%H:%M') if kg.thoigianketthuc else ''
            khung_gios.append(f"{start} - {end}")

        items_list.append({
            'id': item.id,
            'TenCa': item.tencalamviec,
            'MaCa': item.macalamviec,
            'LoaiCa': item.loaichamcong,
            'KhungGio': khung_gios,
            'TrangThai': item.trangthai,
        })
    
    return json_success(
        'Thành công', 
        data=items_list,
        pagination={
            'page': page_obj.number,
            'total': context['paginator'].count,
            'total_pages': context['paginator'].num_pages,
            'has_next': page_obj.has_next(),
            'has_prev': page_obj.has_previous()
        }
    )


@login_required
@require_api_permission('access_control.view_lich_lam_viec')
@require_http_methods(["GET"])
@handle_exceptions
def api_calamviec_detail(request, pk):
    """API Lấy chi tiết 1 ca (Dùng cho form Update)"""
    # Helper: Lấy object hoặc trả về lỗi 404 JSON
    ca = get_object_or_json_error(Calamviec, pk, "Không tìm thấy ca làm việc")
    if not isinstance(ca, Calamviec): return ca # Trả về lỗi nếu có

    # Lấy danh sách khung giờ chi tiết
    khung_gios = []
    for kg in ca.khunggiolamviec_set.order_by('id'):
        khung_gios.append({
            'id': kg.id,
            'GioBatDau': kg.thoigianbatdau.strftime('%H:%M') if kg.thoigianbatdau else None,
            'GioKetThuc': kg.thoigianketthuc.strftime('%H:%M') if kg.thoigianketthuc else None,
            'Cong': kg.congcuakhunggio,
            
            # Rule Cố định (Lấy từ trường cũ)
            'DenMuonCP': kg.thoigianchophepdenmuon,
            'VeSomCP': kg.thoigianchophepvesomnhat,
            'KhongTinhCongNeuMuonHon': kg.thoigiandimuonkhongtinhchamcong, 
            'KhongTinhCongNeuSomHon': kg.thoigianvesomkhongtinhchamcong,
            'CheckInSomNhat': kg.thoigianchophepchamcongsomnhat.strftime('%H:%M') if kg.thoigianchophepchamcongsomnhat else None,
            'CheckOutMuonNhat': kg.thoigianchophepvemuonnhat.strftime('%H:%M') if kg.thoigianchophepvemuonnhat else None,
            
            # Rule Linh động (Lấy từ trường MỚI)
            'LinhDongDenMuon': kg.sophutdenmuon, 
            'LinhDongVeSom': kg.sophutdensom,

            # Rule Tự do
            'MinPhutLamViec': kg.thoigianlamviectoithieu,
            'YeuCauChamCong': kg.yeucauchamcong
        })

    # Lấy thông tin nghỉ trưa
    nghi_trua_data = None
    nghi_trua_obj = ca.khunggionghitrua_set.first() 
    if nghi_trua_obj:
        nghi_trua_data = {
            'BatDau': nghi_trua_obj.giobatdau.strftime('%H:%M'),
            'KetThuc': nghi_trua_obj.gioketthuc.strftime('%H:%M')
        }

    data = {
        'id': ca.id,
        'TenCa': ca.tencalamviec,
        'MaCa': ca.macalamviec,
        'LoaiCa': ca.loaichamcong,
        'TongCong': ca.congcuacalamviec,
        'KhongCanCheckout': not ca.cocancheckout,
        'SoLanChamCong': ca.solanchamcongtrongngay,
        'ChiTietKhungGio': khung_gios,
        'NghiTrua': nghi_trua_data
    }
    return json_success('Lấy chi tiết thành công', data=data)


@login_required
@require_api_permission('access_control.write_lich_lam_viec')
@require_http_methods(["POST"])
@handle_exceptions
def api_calamviec_create(request):
    """
    API Tạo mới Ca
    ✅ Refactored: Sử dụng Service Layer + Validators
    """
    data = get_request_data(request)
    
    # 1.Validate trường bắt buộc
    is_valid, missing = validate_required_fields(data, ['TenCa', 'MaCa'])
    if not is_valid:
        return json_error(f"Vui lòng nhập đầy đủ: {', '.join(missing)}")

    # 2.Validate unique Mã
    ma_ca = data.get('MaCa', '').strip().upper()
    if not validate_unique_field(Calamviec, 'macalamviec', ma_ca):
        return json_error(f"Mã ca '{ma_ca}' đã tồn tại.")

    # ✅ 4.Gọi Service tạo mới (Logic tách ra)
    try:
        ca_moi = CaLamViecService.create_ca(data)
        return json_success("Thêm mới thành công", id=ca_moi.id)
    except Exception as e:
        return json_error(f"Lỗi khi lưu: {str(e)}")


@login_required
@require_api_permission('access_control.write_lich_lam_viec')
@require_http_methods(["PUT", "POST"])
@handle_exceptions
def api_calamviec_update(request, pk):
    """
    API Cập nhật Ca
    ✅ Refactored: Sử dụng Service Layer + Validators
    """
    ca = get_object_or_json_error(Calamviec, pk, "Không tìm thấy ca làm việc")
    if not isinstance(ca, Calamviec): 
        return ca
    
    data = get_request_data(request)
    
    # 1.Validate unique Mã (trừ chính nó)
    ma_ca = data.get('MaCa', '').strip().upper()
    if not validate_unique_field(Calamviec, 'macalamviec', ma_ca, exclude_pk=pk):
        return json_error(f"Mã ca '{ma_ca}' đã tồn tại.")

    # ✅ 3.Gọi Service cập nhật
    try:
        CaLamViecService.update_ca(ca, data)
        return json_success("Cập nhật thành công")
    except Exception as e:
        return json_error(f"Lỗi khi lưu: {str(e)}")


@login_required
@require_api_permission('access_control.write_lich_lam_viec')
@require_http_methods(["POST", "DELETE"])
@handle_exceptions
def api_calamviec_delete(request, pk):
    """
    API Xóa Ca
    ✅ Refactored: Sử dụng Service Layer
    """
    item = get_object_or_json_error(Calamviec, pk, "Không tìm thấy dữ liệu")
    if not isinstance(item, Calamviec): 
        return item

    # ✅ Gọi Service xóa (Logic check CAHANHCHINH ở trong Service)
    success, message = CaLamViecService.delete_ca(item)
    
    if success:
        return json_success(message)
    else:
        return json_error(message)
    

#==================== API LỊCH LÀM VIỆC =======================
#==============================================================

@login_required
@require_api_permission('access_control.view_lich_lam_viec')
@require_http_methods(["GET"])
@handle_exceptions
def api_lichlamviec_list(request):
    """API trả về danh sách lịch làm việc cho TableManager"""
    
    # 1.Prefetch đúng cách + ORDER BY id để giữ thứ tự tạo
    codinh_prefetch = Prefetch(
        'lichlamvieccodinh_set',
        queryset=LichlamviecCodinh.objects.select_related('calamviec').prefetch_related(
            Prefetch(
                'calamviec__khunggiolamviec_set',
                queryset=Khunggiolamviec.objects.order_by('id')
            )
        ).order_by('ngaytrongtuan', 'id')  # ✅ FIX: Thêm order by id để giữ thứ tự tạo
    )

    # 2.Query chính - Annotate ưu tiên mặc định lên đầu
    queryset = Lichlamviec.objects.filter(Q(is_deleted=False) | Q(is_deleted__isnull=True)).defer('caidatca').prefetch_related(codinh_prefetch).annotate(
        num_employees=Count(
            'lichlamviecnhanvien', 
            filter=Q(lichlamviecnhanvien__trangthai='active'),
            distinct=True
        ),
        is_system_default=Case(
            When(malichlamviec='NHOM_MAC_DINH', then=Value(0)),
            default=Value(1),
            output_field=IntegerField(),
        )
    ).order_by('is_system_default', '-created_at')

    # 3.Sử dụng Helper get_list_context
    context = get_list_context(
        request,
        queryset,
        search_fields=['tenlichlamviec', 'malichlamviec'],
        filter_field=('loaikichbanlamviec', 'loaichamcong'),
        page_size=20,
        order_by=None
    )

    page_obj = context['page_obj']
    items_list = []

    # 4.Transform dữ liệu - GIỮ NGUYÊN THỨ TỰ
    items_list = LichLamViecService.format_lich_list_data(page_obj)

    return json_success(
        'Thành công',
        data=items_list,
        pagination={
            'page': page_obj.number,
            'total': context['paginator'].count,
            'total_pages': context['paginator'].num_pages,
            'has_next': page_obj.has_next(),
            'has_prev': page_obj.has_previous()
        }
    )

@login_required
@require_api_permission('access_control.view_lich_lam_viec')
@require_http_methods(["GET"])
@handle_exceptions
def api_lichlamviec_options(request):
    """API trả về danh sách nhóm lịch để dùng trong bộ lọc."""
    queryset = Lichlamviec.objects.filter(
        Q(is_deleted=False) | Q(is_deleted__isnull=True)
    ).values('id', 'tenlichlamviec', 'malichlamviec').order_by('tenlichlamviec')

    options = [
        {
            'id': item['id'],
            'TenNhom': item['tenlichlamviec'],
            'MaNhom': item['malichlamviec'],
        }
        for item in queryset
    ]

    return json_success('Thành công', data=options)


@login_required
@require_api_permission('access_control.view_lich_lam_viec')
@require_http_methods(["GET"])
@handle_exceptions
def api_tong_hop_lichlamviec(request):
    """API tổng hợp lịch làm việc theo khoảng ngày với filter lịch sử."""
    try:
        start_date, end_date, range_days = _normalize_summary_date_range(
            request.GET.get('start_date'),
            request.GET.get('end_date')
        )
    except ValueError as exc:
        return json_error(str(exc))

    page = _parse_positive_int(request.GET.get('page'), default_value=1, min_value=1)
    page_size = _parse_positive_int(request.GET.get('page_size'), default_value=20, min_value=1, max_value=200)
    search_query = (request.GET.get('search') or '').strip()

    schedule_filter_raw = request.GET.get('lichlamviec_id')
    schedule_filter_id = None
    if schedule_filter_raw:
        try:
            schedule_filter_id = int(schedule_filter_raw)
        except ValueError:
            return json_error('Nhóm lịch không hợp lệ')

    dept_filter_raw = request.GET.get('phongban_id')
    dept_ids = set()
    if dept_filter_raw:
        try:
            dept_ids = set(get_all_child_department_ids(int(dept_filter_raw), isnclude_root=True))
        except ValueError:
            return json_error('Phòng ban không hợp lệ')

    # Danh sách nhân viên chuẩn theo lịch sử công tác active (khớp api_phong_ban_nhan_vien).
    history_qs = Lichsucongtac.objects.filter(
        trangthai='active',
        nhanvien_id__isnull=False
    )

    if dept_ids:
        history_qs = history_qs.filter(phongban_id__in=dept_ids)

    if search_query:
        history_qs = history_qs.filter(
            Q(nhanvien__hovaten__icontains=search_query) |
            Q(nhanvien__manhanvien__icontains=search_query)
        )

    history_employee_ids = set(history_qs.values_list('nhanvien_id', flat=True).distinct())

    schedule_employee_ids = None
    if schedule_filter_id:
        schedule_employee_ids = set(
            Lichlamviecthucte.objects.filter(
                lichlamviec_id=schedule_filter_id,
                ngaylamviec__gte=start_date,
                ngaylamviec__lte=end_date
            ).filter(
                Q(is_deleted=False) | Q(is_deleted__isnull=True)
            ).values_list('nhanvien_id', flat=True).distinct()
        )

    if schedule_filter_id:
        final_employee_ids = history_employee_ids.intersection(schedule_employee_ids)
    else:
        final_employee_ids = history_employee_ids

    employees_qs = Nhanvien.objects.filter(id__in=final_employee_ids) if final_employee_ids else Nhanvien.objects.none()

    employees_qs = employees_qs.order_by('hovaten', 'manhanvien', 'id')

    paginator = Paginator(employees_qs, page_size)
    page_obj = paginator.get_page(page)
    page_employees = list(page_obj.object_list)
    page_employee_ids = [emp.id for emp in page_employees]

    # Lấy phòng ban theo lịch sử công tác active cho từng nhân viên ở page hiện tại.
    dept_history_qs = Lichsucongtac.objects.filter(
        nhanvien_id__in=page_employee_ids,
        trangthai='active'
    ).select_related('phongban').order_by('nhanvien_id', '-updated_at', '-id')

    dept_map = {}
    for rel in dept_history_qs:
        if rel.nhanvien_id in dept_map:
            continue
        dept_map[rel.nhanvien_id] = {
            'id': rel.phongban_id,
            'name': rel.phongban.tenphongban if rel.phongban else ''
        }

    schedule_qs = Lichlamviecthucte.objects.filter(
        nhanvien_id__in=page_employee_ids,
        ngaylamviec__gte=start_date,
        ngaylamviec__lte=end_date
    ).filter(
        Q(is_deleted=False) | Q(is_deleted__isnull=True)
    ).select_related(
        'calamviec',
        'lichlamviec'
    ).prefetch_related(
        Prefetch('calamviec__khunggiolamviec_set', queryset=Khunggiolamviec.objects.order_by('id'))
    ).order_by('nhanvien_id', 'ngaylamviec', 'id')

    if schedule_filter_id:
        schedule_qs = schedule_qs.filter(lichlamviec_id=schedule_filter_id)

    schedule_map = defaultdict(lambda: defaultdict(list))
    for item in schedule_qs:
        if not item.ngaylamviec:
            continue

        date_key = item.ngaylamviec.isoformat()
        khung_gio = []
        ten_ca = 'Ngày nghỉ'

        if item.calamviec:
            ten_ca = item.calamviec.tencalamviec or 'Ca làm việc'
            for frame in item.calamviec.khunggiolamviec_set.all():
                display = _format_time_range(frame.thoigianbatdau, frame.thoigianketthuc)
                if display:
                    khung_gio.append(display)

        schedule_map[item.nhanvien_id][date_key].append({
            'ca_id': item.calamviec_id,
            'ten_ca': ten_ca,
            'khung_gio': khung_gio,
            'is_day_off': bool(item.cophaingaynghi or item.calamviec_id is None),
            'lich_id': item.lichlamviec_id,
            'ten_lich': item.lichlamviec.tenlichlamviec if item.lichlamviec else ''
        })

    rows = []
    for emp in page_employees:
        emp_schedule_map = schedule_map.get(emp.id, {})
        rows.append({
            'nhanvien_id': emp.id,
            'ten_nv': emp.hovaten,
            'ma_nv': emp.manhanvien,
            'phongban_id': dept_map.get(emp.id, {}).get('id'),
            'ten_phong_ban': dept_map.get(emp.id, {}).get('name', ''),
            'schedule_map': {k: v for k, v in emp_schedule_map.items()}
        })

    return json_success(
        'Thành công',
        data=rows,
        pagination={
            'page': page_obj.number,
            'page_size': page_size,
            'total': paginator.count,
            'total_pages': paginator.num_pages,
            'has_next': page_obj.has_next(),
            'has_prev': page_obj.has_previous(),
        },
        filters={
            'start_date': start_date.isoformat(),
            'end_date': end_date.isoformat(),
            'range_days': range_days,
            'lichlamviec_id': schedule_filter_id,
            'phongban_id': int(dept_filter_raw) if dept_filter_raw else None,
        }
    )

@login_required
@require_api_permission('access_control.view_lich_lam_viec')
@require_http_methods(["GET"])
@handle_exceptions
def api_lichlamviec_detail(request, pk):
    """API lấy chi tiết Lịch để fill vào form Update"""
    # ✅ SỬA: Thêm filter is_deleted để tránh trường hợp cố tình truy cập bằng URLS
    try:
        lich = Lichlamviec.objects.filter(Q(is_deleted=False) | Q(is_deleted__isnull=True)).get(pk=pk)
    except Lichlamviec.DoesNotExist:
        return json_error("Không tìm thấy lịch làm việc")
    
    data = LichLamViecService.get_detail_for_form(lich)
    
    # Xử lý thêm cho LICH_TRINH
    if lich.loaikichbanlamviec == 'LICH_TRINH':
        
        # ✅ FIX: Lấy danh sách chu kỳ (loại bỏ record config ẩn nếu có - backward compatibility)
        chu_ky_list = []
        all_lich_trinh = lich.lichlamvieclichtrinh_set.prefetch_related(
            Prefetch(
                'ctlichlamvieclichtrinh_set',
                queryset=CtlichlamviecLichtrinh.objects.select_related('calamviec').prefetch_related(
                    'calamviec__khunggiolamviec_set'
                )
            )
        ).all()
        
        for chu_ky in all_lich_trinh:  
            # Bỏ qua record config ẩn (backward compatibility)
            if chu_ky.machuky == '__CONFIG__':  
                continue
                
            chi_tiet_ngay = []
            for ct in chu_ky.ctlichlamvieclichtrinh_set.all():
                ca_id = ct.calamviec_id
                ten_ca = 'Ngày nghỉ'
                khung_gio = []
                
                if ct.calamviec: 
                    ten_ca = ct.calamviec.tencalamviec
                    khung_gio = [
                        f"{kg.thoigianbatdau.strftime('%H:%M')} - {kg.thoigianketthuc.strftime('%H:%M')}"
                        for kg in ct.calamviec.khunggiolamviec_set.order_by('id')
                    ]
                
                chi_tiet_ngay.append({
                    'NgayTrongChuKy': int(ct.calamviectungngay) if ct.calamviectungngay else 1,
                    'CaID': ca_id,
                    'TenCa': ten_ca,
                    'KhungGio': khung_gio
                })
            
            chu_ky_list.append({
                'id': chu_ky.id,
                'TenChuKy': chu_ky.tenchuky,
                'MaChuKy': chu_ky.machuky,
                'SoNgayLap': chu_ky.songaylap,
                'NgayBatDauChuKy':  chu_ky.ngaybatdauchuky.isoformat() if chu_ky.ngaybatdauchuky else None,
                'ChiTietNgay': chi_tiet_ngay
            })
        
        data['DanhSachChuKy'] = chu_ky_list
        
        # Lấy ScheduleData từ Lichlamviecthucte
        all_emp_ids = LichLamViecService._get_all_employee_ids_for_schedule(lich)
        schedule_data = {}
        
        if all_emp_ids:
            today = date.today()
            start_date = today
            _, last_day = monthrange(today.year, today.month)
            end_date = date(today.year, today.month, last_day)
            
            actual_schedules = Lichlamviecthucte.objects.filter(
                lichlamviec=lich,
                nhanvien_id__in=all_emp_ids,
                ngaylamviec__gte=start_date,
                ngaylamviec__lte=end_date
            ).select_related('calamviec').prefetch_related('calamviec__khunggiolamviec_set')
            
            for record in actual_schedules:
                key = f"{record.nhanvien_id}_{record.ngaylamviec.year}_{record.ngaylamviec.month}_{record.ngaylamviec.day}"
                if key not in schedule_data:  
                    schedule_data[key] = []
                
                if record.calamviec:
                    khung_gios = [
                        f"{kg.thoigianbatdau.strftime('%H:%M')} - {kg.thoigianketthuc.strftime('%H:%M')}"
                        for kg in record.calamviec.khunggiolamviec_set.order_by('id')
                    ]
                    schedule_data[key].append({
                        'id':  record.calamviec.id,
                        'TenCa': record.calamviec.tencalamviec,
                        'KhungGio': khung_gios
                    })
                else:
                    schedule_data[key].append({
                        'id': 0,
                        'TenCa':  'Ngày nghỉ',
                        'KhungGio':  []
                    })
        
        data['ScheduleData'] = schedule_data
    
    return json_success("Thành công", data=data)

@login_required
@require_api_permission('access_control.view_lich_lam_viec')
@require_http_methods(["POST"])
@handle_exceptions
def api_check_schedule_conflicts(request):
    """
    API kiểm tra xung đột nhân viên trước khi lưu
    Frontend gọi API này trước khi submit form
    """
    try:
        data = json.loads(request.body)
        dept_ids = data.get('dept_ids', [])
        emp_ids = data.get('emp_ids', [])
        exclude_schedule_id = data.get('exclude_schedule_id')  # ID lịch hiện tại nếu đang edit

        # Gộp tất cả nhân viên
        all_emp_ids = LichLamViecService.resolve_all_employees(dept_ids, emp_ids)

        if not all_emp_ids:
            return json_success("Không có nhân viên nào được chọn", data={'conflicts': []})

        # Kiểm tra xung đột
        conflicts = LichLamViecService.check_employee_conflicts(
            all_emp_ids, 
            exclude_schedule_id=exclude_schedule_id
        )

        if conflicts:
            return json_response(
                success=False,
                message="Phát hiện nhân viên đang thuộc lịch làm việc khác",
                data={'conflicts': conflicts},
                status=200  # 200 để frontend xử lý confirm, không phải lỗi hệ thống
            )

        return json_success("Hợp lệ", data={'conflicts': []})

    except Exception as e:
        return json_error(str(e))


@login_required
@require_api_permission('access_control.view_lich_lam_viec')
@require_http_methods(["POST"])
@handle_exceptions
def api_validate_employee_selection(request):
    """
    API validate khi user chọn nhân viên trong modal
    Kiểm tra nhân viên có thuộc phòng ban đã chọn không
    """
    try: 
        data = json.loads(request.body)
        dept_ids = data.get('dept_ids', [])
        selected_emp_ids = data.get('selected_emp_ids', [])

        # Lấy nhân viên thuộc các phòng ban
        dept_emp_ids = LichLamViecService.get_employees_from_departments(dept_ids)

        # Tìm nhân viên bị trùng (đã thuộc phòng ban)
        duplicates = []
        for eid in selected_emp_ids: 
            if eid in dept_emp_ids:
                emp = Nhanvien.objects.filter(id=eid).first()
                if emp: 
                    duplicates.append({
                        'id': eid,
                        'name': emp.hovaten
                    })

        if duplicates:
            return json_response(
                success=False,
                message="Một số nhân viên đã thuộc phòng ban được chọn",
                data={'duplicates': duplicates},
                status=200
            )

        return json_success("Hợp lệ")

    except Exception as e: 
        return json_error(str(e))
    

@login_required
@require_api_permission('access_control.write_lich_lam_viec')
@require_http_methods(["POST"])
@handle_exceptions
def api_lichlamviec_create(request):
    """API Tạo mới Lịch làm việc"""
    
    data = get_request_data(request)

    is_valid, missing = validate_required_fields(data, ['TenNhom', 'MaNhom', 'LoaiKichBan'])
    if not is_valid:
        return json_error(f"Vui lòng nhập đầy đủ:  {', '.join(missing)}")

    ma_nhom = data.get('MaNhom', '').strip().upper()
    if not validate_unique_field(Lichlamviec, 'malichlamviec', ma_nhom):
        return json_error(f"Mã lịch làm việc '{ma_nhom}' đã tồn tại.")

    if data.get('LoaiKichBan') == 'CO_DINH':
        details = data.get('ChiTietCa', [])
        if not details or len(details) == 0:
            return json_error("Vui lòng cấu hình chi tiết ca làm việc cho kịch bản cố định.")

    force_transfer = data.get('force_transfer', False)
    
    # ✅ NEW: Xử lý effective_date
    effective_date_option = data.get('effective_date', 'today')
    if effective_date_option == 'tomorrow':
        effective_date = date.today() + timedelta(days=1)
    else:
        effective_date = date.today()

    try:
        lich_moi, transferred = LichLamViecService.create_lich(
            data,
            force_transfer=force_transfer,
            effective_date=effective_date
        )
        
        response_data = {'id': lich_moi.id}
        if transferred:
            response_data['transferred'] = transferred
        
        return json_success("Thêm mới lịch làm việc thành công", **response_data)
    
    except ConflictException as e:
        return json_response(
            success=False,
            message="Phát hiện nhân viên đang thuộc lịch làm việc khác",
            data={'conflicts': e.conflicts, 'require_confirm': True},
            status=200
        )
    except ValueError as e:
        return json_error(str(e))
    except Exception as e: 
        return json_error(f"Lỗi khi lưu dữ liệu: {str(e)}")
    
    
@login_required
@require_api_permission('access_control.write_lich_lam_viec')
@require_http_methods(["PUT", "POST"])
@handle_exceptions
def api_lichlamviec_update(request, pk):
    """API Cập nhật Lịch làm việc"""
    # ✅ SỬA: Thêm filter is_deleted để tránh trường hợp cố tình truy cập bằng URLS
    try:
        lich = Lichlamviec.objects.filter(Q(is_deleted=False) | Q(is_deleted__isnull=True)).get(pk=pk)
    except Lichlamviec.DoesNotExist:
        return json_error("Không tìm thấy lịch làm việc")

    data = get_request_data(request)

    is_valid, missing = validate_required_fields(data, ['TenNhom', 'MaNhom', 'LoaiKichBan'])
    if not is_valid:
        return json_error(f"Vui lòng nhập đầy đủ:  {', '.join(missing)}")

    ma_nhom = data.get('MaNhom', '').strip().upper()
    if not validate_unique_field(Lichlamviec, 'malichlamviec', ma_nhom, exclude_pk=pk):
        return json_error(f"Mã lịch làm việc '{ma_nhom}' đã tồn tại.")

    if data.get('LoaiKichBan') == 'CO_DINH':
        details = data.get('ChiTietCa', [])
        if not details or len(details) == 0:
            return json_error("Vui lòng cấu hình chi tiết ca làm việc.")

    force_transfer = data.get('force_transfer', False)
    
    # ✅ NEW: Xử lý effective_date
    effective_date_option = data.get('effective_date', 'today')
    if effective_date_option == 'tomorrow':
        effective_date = date.today() + timedelta(days=1)
    else:
        effective_date = date.today()

    try: 
        lich_updated, transferred = LichLamViecService.update_lich(
            lich,
            data,
            force_transfer=force_transfer,
            effective_date=effective_date
        )
        
        response_data = {}
        if transferred: 
            response_data['transferred'] = transferred
        
        return json_success("Cập nhật lịch làm việc thành công", **response_data)
    
    except ConflictException as e:
        return json_response(
            success=False,
            message="Phát hiện nhân viên đang thuộc lịch làm việc khác",
            data={'conflicts': e.conflicts, 'require_confirm': True},
            status=200
        )
    except ValueError as e:
        return json_error(str(e))
    except Exception as e: 
        return json_error(f"Lỗi khi lưu dữ liệu:  {str(e)}")


@login_required
@require_api_permission('access_control.write_lich_lam_viec')
@require_http_methods(["POST", "DELETE"])
@handle_exceptions
def api_lichlamviec_delete(request, pk):
    """
    API Xóa Lịch làm việc
    """
    lich = get_object_or_json_error(Lichlamviec, pk, "Không tìm thấy dữ liệu")
    if not isinstance(lich, Lichlamviec): 
        return lich

    # Gọi Service Xóa
    success, message = LichLamViecService.delete_lich(lich)
    
    if success:
        return json_success(message)
    else:
        return json_error(message)
    
@login_required
@require_api_permission('access_control.write_lich_lam_viec')
@require_http_methods(["POST"])
@handle_exceptions
def api_generate_next_month_schedules(request):
    """
    ✅ NEW: API cho Cron Job - Generate lịch tháng tiếp theo
    CHỈ cho kịch bản CỐ ĐỊNH
    """
    try:
        result = LichLamViecService.generate_next_month_schedules()
        return json_success(
            f"Đã generate lịch cho {result['generated']} nhóm cố định, {result['errors']} lỗi",
            **result
        )
    except Exception as e:
        return json_error(f"Lỗi khi generate:  {str(e)}")