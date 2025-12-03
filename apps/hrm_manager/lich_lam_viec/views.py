from django.shortcuts import render
from django.db.models import Prefetch, Case, When, Value, IntegerField
from django.shortcuts import get_object_or_404
from django.urls import reverse
from django.views.decorators.http import require_http_methods
from apps.hrm_manager.__core__.models import *
import json
from django.utils import timezone
from django.db import transaction
from . services import CaLamViecService


from apps.hrm_manager.utils.view_helpers import (
    get_list_context, 
    json_success, 
    handle_exceptions,
    json_success, 
    json_error, 
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

# --- 1. VIEWS: THIẾT KẾ LỊCH LÀM VIỆC ---

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
    }
    return render(request, "hrm_manager/lich_lam_viec/ca_lam_viec.html", context)


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

def view_lich_lam_viec(request):
    context = {
        'breadcrumbs': [
            {'title': 'Chấm công', 'url': '#'},
            {'title': 'Quản lý lịch làm việc', 'url': None},
            {'title': 'Thiết kế lịch', 'url': None},
        ],
        'tabs': get_thiet_ke_lich_tabs(),
    }
    return render(request, "hrm_manager/lich_lam_viec/thiet_ke_lich.html", context)

def view_tong_hop_lich(request):
    context = {
        'breadcrumbs': [
            {'title': 'Chấm công', 'url': '#'},
            {'title': 'Quản lý lịch làm việc', 'url': None},
            {'title': 'Tổng hợp lịch', 'url': None},
        ],
        'tabs': get_thiet_ke_lich_tabs(),
    }
    return render(request, "hrm_manager/lich_lam_viec/tong_hop_lich.html", context)

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
    return render(request, "hrm_manager/lich_lam_viec/lich_nghi/lich_nghi.html", context)

def view_quy_nghi(request):
    context = {
        'breadcrumbs': [
            {'title': 'Chấm công', 'url': '#'},
            {'title': 'Lịch nghỉ', 'url': None},
            {'title': 'Quỹ nghỉ', 'url': None},
        ],
        'tabs': get_thiet_ke_nghi_tabs(),
    }
    return render(request, "hrm_manager/lich_lam_viec/lich_nghi/quy_nghi.html", context)

def view_tong_hop_nghi(request):
    context = {
        'breadcrumbs': [
            {'title': 'Chấm công', 'url': '#'},
            {'title': 'Lịch nghỉ', 'url': None},
            {'title': 'Tổng hợp nghỉ', 'url': None},
        ],
        'tabs': get_thiet_ke_nghi_tabs(),
    }
    return render(request, "hrm_manager/lich_lam_viec/lich_nghi/tong_hop_nghi.html", context)


# --- API TRẢ VỀ JSON ---

@require_http_methods(["GET"])
@handle_exceptions
def api_calamviec_list(request):
    """API Lấy danh sách hiển thị bảng"""
    khung_gio_prefetch = Prefetch(
        'khunggiolamviec_set',
        queryset=Khunggiolamviec.objects.order_by('thoigianbatdau')
    )
    
    # 1. Annotate ưu tiên: CAHANHCHINH = 0, Các ca khác = 1
    queryset = Calamviec.objects.prefetch_related(khung_gio_prefetch).annotate(
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


@require_http_methods(["POST"])
@handle_exceptions
def api_calamviec_create(request):
    """
    API Tạo mới Ca
    ✅ Refactored: Sử dụng Service Layer + Validators
    """
    data = get_request_data(request)
    
    # 1. Validate trường bắt buộc
    is_valid, missing = validate_required_fields(data, ['TenCa', 'MaCa'])
    if not is_valid:
        return json_error(f"Vui lòng nhập đầy đủ: {', '.join(missing)}")

    # 2. Validate unique Mã
    ma_ca = data.get('MaCa', '').strip().upper()
    if not validate_unique_field(Calamviec, 'macalamviec', ma_ca):
        return json_error(f"Mã ca '{ma_ca}' đã tồn tại.")

    # ✅ 4. Gọi Service tạo mới (Logic tách ra)
    try:
        ca_moi = CaLamViecService.create_ca(data)
        return json_success("Thêm mới thành công", id=ca_moi.id)
    except Exception as e:
        return json_error(f"Lỗi khi lưu: {str(e)}")


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
    
    # 1. Validate unique Mã (trừ chính nó)
    ma_ca = data.get('MaCa', '').strip().upper()
    if not validate_unique_field(Calamviec, 'macalamviec', ma_ca, exclude_pk=pk):
        return json_error(f"Mã ca '{ma_ca}' đã tồn tại.")

    # ✅ 3. Gọi Service cập nhật
    try:
        CaLamViecService.update_ca(ca, data)
        return json_success("Cập nhật thành công")
    except Exception as e:
        return json_error(f"Lỗi khi lưu: {str(e)}")


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