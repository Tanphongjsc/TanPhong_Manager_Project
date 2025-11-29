from django.shortcuts import render
from django.db.models import Prefetch, Case, When, Value, IntegerField
from django.shortcuts import get_object_or_404
from django.urls import reverse
from django.views.decorators.http import require_http_methods
from apps.hrm_manager.__core__.models import *
import json
from django.utils import timezone
from django.db import transaction

from apps.hrm_manager.utils.view_helpers import (
    get_list_context, 
    json_success, 
    handle_exceptions,
    json_success, 
    json_error, 
    safe_delete,
)
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
    return render(request, "hrm_manager/cham_cong/lich_lam_viec/ca_lam_viec.html", context)


def view_ca_lam_viec_create(request):
    """Màn hình Thêm mới Ca"""
    breadcrumbs = [
        {'title': 'Chấm công', 'url': '#'},
        {'title': 'Thiết kế ca làm việc', 'url': reverse('hrm:cham_cong:thiet_ke_ca')},
        {'title': 'Thêm mới ca làm việc', 'url': None},
    ]
    return render(request, "hrm_manager/cham_cong/lich_lam_viec/ca_form_page.html", {
        'title': 'Thêm mới ca làm việc',
        'breadcrumbs': breadcrumbs
    })

def view_ca_lam_viec_update(request, pk):
    """Màn hình Cập nhật Ca"""
    breadcrumbs = [
        {'title': 'Chấm công', 'url': '#'},
        {'title': 'Thiết kế ca làm việc', 'url': reverse('hrm:cham_cong:thiet_ke_ca')},
        {'title': 'Cập nhật ca làm việc', 'url': None},
    ]
    return render(request, "hrm_manager/cham_cong/lich_lam_viec/ca_form_page.html", {
        'title': 'Cập nhật ca làm việc',
        'breadcrumbs': breadcrumbs,
        'item_id': pk # Truyền ID xuống để JS biết đường gọi API detail
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


# --- API TRẢ VỀ JSON ---

@require_http_methods(["GET"])
@handle_exceptions
def api_calamviec_list(request):
    """API Lấy danh sách hiển thị bảng"""
    khung_gio_prefetch = Prefetch(
        'khunggiolamviec_set',
        queryset=Khunggiolamviec.objects.order_by('thoigianbatdau')
    )
    
    # 1. Annotate để đánh dấu ưu tiên: CAHANHCHINH = 0, Các ca khác = 1
    queryset = Calamviec.objects.prefetch_related(khung_gio_prefetch).annotate(
        is_system_default=Case(
            When(macalamviec='CAHANHCHINH', then=Value(0)),
            default=Value(1),
            output_field=IntegerField(),
        )
    ).order_by('is_system_default', '-created_at') # <--- Sắp xếp: Ưu tiên (0) lên trước, sau đó mới đến ngày tạo
    
    context = get_list_context(
        request,
        queryset,
        search_fields=['tencalamviec', 'macalamviec'],
        filter_field=('loaichamcong', 'loaichamcong'),
        page_size=20,
        order_by=None # <--- Quan trọng: Để None để helper không ghi đè thứ tự sắp xếp của queryset
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
def api_calamviec_detail(request, pk):
    try:
        ca = get_object_or_404(Calamviec, pk=pk)
        
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
                
                # Rule Linh động 
                'LinhDongDenMuon': kg.sophutdenmuon, 
                'LinhDongVeSom': kg.sophutdensom,

                # Rule Tự do
                'MinPhutLamViec': kg.thoigianlamviectoithieu,
                'YeuCauChamCong': kg.yeucauchamcong
            })

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
            'TongCong': ca.tongthoigianlamvieccuaca,
            'KhongCanCheckout': not ca.cocancheckout,
            'SoLanChamCong': ca.solanchamcongtrongngay,
            'ChiTietKhungGio': khung_gios,
            'NghiTrua': nghi_trua_data
        }
        return json_success('Lấy chi tiết thành công', data=data)
    except Exception as e:
        return json_error(str(e))

@require_http_methods(["POST"])
def api_calamviec_create(request):
    """API Tạo mới"""
    try:
        data = json.loads(request.body)
        ma_ca = data.get('MaCa', '').strip().upper()
        if Calamviec.objects.filter(macalamviec=ma_ca).exists():
            return json_error(f"Mã ca '{ma_ca}' đã tồn tại.")

        with transaction.atomic():
            ca_moi = Calamviec.objects.create(
                tencalamviec=data.get('TenCa'),
                macalamviec=ma_ca,
                loaichamcong=data.get('LoaiCa'),
                tongthoigianlamvieccuaca=data.get('TongCong', 0),
                congcuacalamviec=int(data.get('TongCong', 0)),
                sokhunggiotrongca=data.get('SoKhungGio', 1),
                cocancheckout=not data.get('KhongCanCheckout', False),
                solanchamcongtrongngay=data.get('SoLanChamCong', 1),
                conghitrua=bool(data.get('NghiTrua')), 
                trangthai='active',
                created_at=timezone.now()
            )
            _save_shift_details(ca_moi, data)
            
        return json_success("Thêm mới thành công", id=ca_moi.id)
    except Exception as e:
        return json_error(f"Lỗi khi tạo: {str(e)}")

@require_http_methods(["PUT", "POST"])
def api_calamviec_update(request, pk):
    """API Cập nhật"""
    try:
        data = json.loads(request.body)
        ca = get_object_or_404(Calamviec, pk=pk)
        
        ma_ca = data.get('MaCa', '').strip().upper()
        if Calamviec.objects.filter(macalamviec=ma_ca).exclude(pk=pk).exists():
            return json_error(f"Mã ca '{ma_ca}' đã tồn tại.")

        with transaction.atomic():
            ca.tencalamviec = data.get('TenCa')
            ca.macalamviec = ma_ca
            ca.loaichamcong = data.get('LoaiCa')
            ca.tongthoigianlamvieccuaca = data.get('TongCong', 0)
            ca.congcuacalamviec = int(data.get('TongCong', 0))
            ca.sokhunggiotrongca = data.get('SoKhungGio', 1)
            ca.solanchamcongtrongngay = data.get('SoLanChamCong', 1)
            ca.cocancheckout = not data.get('KhongCanCheckout', False)
            ca.conghitrua = bool(data.get('NghiTrua'))
            ca.updated_at = timezone.now()
            ca.save()

            # Xóa cũ -> Tạo mới
            # 1. Xóa khung giờ làm việc
            ca.khunggiolamviec_set.all().delete()
            # 2. Xóa khung giờ nghỉ trưa
            ca.khunggionghitrua_set.all().delete()
            
            _save_shift_details(ca, data)

        return json_success("Cập nhật thành công")
    except Exception as e:
        return json_error(f"Lỗi khi cập nhật: {str(e)}")

@require_http_methods(["POST", "DELETE"])
def api_calamviec_delete(request, pk):
    """API Xóa Ca"""
    try:
        item = get_object_or_404(Calamviec, pk=pk)
        
        # === THÊM LOGIC CHẶN XÓA CA HÀNH CHÍNH TẠI ĐÂY ===
        if item.macalamviec == 'CAHANHCHINH':
            return json_error("Đây là ca làm việc mặc định của hệ thống, không được phép xóa!")
        # ==================================================
        
        # Xóa các bảng con trước để tránh lỗi Foreign Key
        item.khunggiolamviec_set.all().delete()
        item.khunggionghitrua_set.all().delete()
        
        success, message = safe_delete(item)
        if success:
            return json_success("Xóa thành công!")
        else:
            return json_error(message)
    except Exception as e:
        return json_error(str(e), status=500)

# ============================================================================
# 3. HELPER FUNCTION
# ============================================================================

def _save_shift_details(ca_instance, data):
    khung_gios = data.get('ChiTietKhungGio', [])
    nghi_trua = data.get('NghiTrua') 

    for kg in khung_gios:
        Khunggiolamviec.objects.create(
            calamviec=ca_instance,
            thoigianbatdau=kg.get('GioBatDau') or None,
            thoigianketthuc=kg.get('GioKetThuc') or None,
            congcuakhunggio=kg.get('Cong', 0),
            
            # 1. Cố định: Lưu vào trường cũ
            thoigianchophepdenmuon=kg.get('DenMuonCP', 0),
            thoigianchophepvesomnhat=kg.get('VeSomCP', 0),
            
            # 2. Linh động: LƯU VÀO TRƯỜNG MỚI
            sophutdenmuon=kg.get('LinhDongDenMuon', 0),
            sophutdensom=kg.get('LinhDongVeSom', 0),
            
            # Các trường chung
            thoigiandimuonkhongtinhchamcong=kg.get('KhongTinhCongNeuMuonHon', 0),
            thoigianvesomkhongtinhchamcong=kg.get('KhongTinhCongNeuSomHon', 0),
            thoigianchophepchamcongsomnhat=kg.get('CheckInSomNhat') or None,
            thoigianchophepvemuonnhat=kg.get('CheckOutMuonNhat') or None,
            thoigianlamviectoithieu=kg.get('MinPhutLamViec', 0),
            yeucauchamcong=kg.get('YeuCauChamCong', True),
            created_at=timezone.now()
        )

    if nghi_trua:
        Khunggionghitrua.objects.create(
            calamviec=ca_instance,
            giobatdau=nghi_trua.get('BatDau'),
            gioketthuc=nghi_trua.get('KetThuc'),
            created_at=timezone.now()
        )