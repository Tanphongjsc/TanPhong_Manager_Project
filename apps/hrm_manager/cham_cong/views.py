from django.forms import model_to_dict
from django.shortcuts import render
from django.urls import reverse
from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
from django.db.models import CharField, F, Value, Func, Count, OuterRef, Subquery, IntegerField, Q
from django.db.models.functions import Cast, Coalesce
from django.db import transaction
from django.contrib.postgres.aggregates import JSONBAgg

from json import loads, dumps
import datetime as dt
from collections import defaultdict

from apps.hrm_manager.__core__.models import Bangchamcong, Khunggionghitrua, Phongban, Lichlamviecthucte, Calamviec, Lichsucongtac
from apps.hrm_manager.cham_cong.services import PayrollCalculator
from apps.hrm_manager.utils.view_helpers import diff_minutes, parse_time_to_minutes, parse_minutes_to_time, calculate_work_minutes_with_overnight, tinh_phut_nghi_trua_trong_khoang
from apps.hrm_manager.to_chuc_nhan_su.views import get_all_child_department_ids

# ============================================================
# HELPERS
# ============================================================

def get_lam_them_tabs():
    """Tabs cho nhóm Quản lý Làm thêm"""
    return [
        {'label': 'Thiết kế Quy tắc làm thêm', 'url_name': 'quytac_lam_them', 'url': reverse('hrm:cham_cong:quytac_lam_them')},
        {'label': 'Tổng hợp Làm thêm', 'url_name': 'tong_hop_lam_them', 'url': reverse('hrm:cham_cong:tong_hop_lam_them')},
    ]

def tinh_luong_cham_cong(data_list):
    """
    Xử lý dữ liệu & Tính lương chấm công dựa trên danh sách data đầu vào.
    Input: List[Dict] - Mỗi dict chứa thông tin nhân viên và cấu hình tính lương.
    Output: Dict - Kết quả tính lương cho từng nhân viên dưới dạng {nhanvien_id: thanhtien}
    """

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

    return ket_qua

def build_cham_cong_data_by_status(ngay_lam_viec, da_cham_cong=False):
    """
    Gom dữ liệu chấm công theo trạng thái đã/ chưa chấm công.
    da_cham_cong=True  -> Lấy danh sách đã chấm đủ số lần.
    da_cham_cong=False -> Lấy danh sách còn thiếu số lần chấm công.
    """

    # Subquery: Đếm số lần nhân viên đã chấm công trong ngày
    sq_dem_so_lan_cham_cong = Bangchamcong.objects.filter(
        ngaylamviec=ngay_lam_viec,
        nhanvien=OuterRef('nhanvien_id')
    ).values('nhanvien').annotate(
        cnt=Count('id')
    ).values('cnt')

    # Main Query: Lấy lịch làm việc thực tế
    qs_lich_lam_viec = Lichlamviecthucte.objects.filter(
        ngaylamviec=ngay_lam_viec
    ).annotate(
        # Gắn số lần đã chấm công vào mỗi dòng
        total_cham_cong=Coalesce(Subquery(sq_dem_so_lan_cham_cong, output_field=IntegerField()), 0),
        
        # Alias các trường dữ liệu cần dùng để code ngắn gọn hơn
        solanchamcongtrongngay=F('calamviec__solanchamcongtrongngay'),
        sokhunggiotrongca=F('calamviec__sokhunggiotrongca'),
        cocancheckout=F('calamviec__cocancheckout'),
        loaicalamviec=F('calamviec__loaichamcong'), 
        tongthoigianlamvieccuaca=F('calamviec__tongthoigianlamvieccuaca'),
        congtongcuaca=F('calamviec__congcuacalamviec'),

        # Build JSON danh sách khung giờ (Bao gồm ĐẦY ĐỦ các trường như yêu cầu)
        list_khung_gio_json=JSONBAgg(
            Func(
                Value('congcuakhunggio'), F('calamviec__khunggiolamviec__congcuakhunggio'),
                Value('thoigianbatdau'), Cast('calamviec__khunggiolamviec__thoigianbatdau', CharField()),
                Value('thoigianketthuc'), Cast('calamviec__khunggiolamviec__thoigianketthuc', CharField()),
                Value('thoigianchophepchamcongsomnhat'), Cast('calamviec__khunggiolamviec__thoigianchophepchamcongsomnhat', CharField()),
                Value('thoigianchophepvemuonnhat'), Cast('calamviec__khunggiolamviec__thoigianchophepvemuonnhat', CharField()),
                Value('thoigianchophepdenmuon'), F('calamviec__khunggiolamviec__thoigianchophepdenmuon'),
                Value('thoigiandimuonkhongtinhchamcong'), F('calamviec__khunggiolamviec__thoigiandimuonkhongtinhchamcong'),
                Value('thoigianchophepvesomnhat'), F('calamviec__khunggiolamviec__thoigianchophepvesomnhat'),
                Value('thoigianvesomkhongtinhchamcong'), F('calamviec__khunggiolamviec__thoigianvesomkhongtinhchamcong'),
                Value('thoigianlamviectoithieu'), F('calamviec__khunggiolamviec__thoigianlamviectoithieu'),
                Value('sophutdenmuon'), F('calamviec__khunggiolamviec__sophutdenmuon'),
                Value('sophutdensom'), F('calamviec__khunggiolamviec__sophutdensom'),
                function='jsonb_build_object'
            ),
            ordering='calamviec__khunggiolamviec__created_at'
        )
    )

    # Lọc theo đã chấm công hay chưa dựa trên số lần chấm công so với yêu cầu của ca làm việc
    if da_cham_cong == 'True':
        qs_lich_lam_viec = qs_lich_lam_viec.filter(total_cham_cong__gte=F('solanchamcongtrongngay'))
    else:
        qs_lich_lam_viec = qs_lich_lam_viec.filter(total_cham_cong__lt=F('solanchamcongtrongngay'))

    qs_lich_lam_viec = qs_lich_lam_viec.values(
        "nhanvien_id", "calamviec_id", "cophaingaynghi",
        "total_cham_cong", "solanchamcongtrongngay", "sokhunggiotrongca", "cocancheckout", "loaicalamviec", "tongthoigianlamvieccuaca",
        "congtongcuaca", "list_khung_gio_json",
        hovaten=F('nhanvien__hovaten'),
        manhanvien=F('nhanvien__manhanvien'),
        loainv=F('nhanvien__loainv__id')
    )

    # Chuyển QuerySet thành List để xử lý Python
    ds_lich_raw = list(qs_lich_lam_viec)
    if not ds_lich_raw:
        return []

    # Lấy danh sách ID duy nhất
    list_nhanvien_id = [item['nhanvien_id'] for item in ds_lich_raw]
    set_calamviec_id = {item['calamviec_id'] for item in ds_lich_raw}

    # Query 1 lần lấy Phòng Ban -> Map {nhanvien_id: phongban_id}
    qs_phongban = Lichsucongtac.objects.filter(
        nhanvien_id__in=list_nhanvien_id,
        trangthai="active"
    ).values('nhanvien_id', 'phongban_id')
    map_nhan_vien_phong_ban = {p['nhanvien_id']: p['phongban_id'] for p in qs_phongban}

    # Query lấy Nghỉ Trưa -> Map {calamviec_id: [list_nghi_trua]}
    qs_nghitrua = Calamviec.objects.filter(id__in=set_calamviec_id).values('id').annotate(
        json_nghitrua=JSONBAgg(
            Func(
                Value('giobatdau'), Cast('khunggionghitrua__giobatdau', CharField()),
                Value('gioketthuc'), Cast('khunggionghitrua__gioketthuc', CharField()),
                function='jsonb_build_object'
            )
        )
    )
    map_calam_nghitrua = {c['id']: c['json_nghitrua'] for c in qs_nghitrua}

    # Xử lý logic gộp dữ liệu
    final_result_map = {}

    for item in ds_lich_raw:
        item['phongban_id'] = map_nhan_vien_phong_ban.get(item['nhanvien_id'])
        item['khunggionghitrua'] = map_calam_nghitrua.get(item['calamviec_id'], [])

        list_khung_gio = item.pop('list_khung_gio_json', [])
        if not list_khung_gio:
            continue

        # Xác định khung giờ cần lấy (Index dựa trên số lần chấm công)
        idx_lan_cham = item['total_cham_cong']
        if da_cham_cong == 'True':
            # Nếu đang xem danh sách ĐÃ chấm: Lấy lại thông tin của lần chấm gần nhất (lùi 1 index)
            idx_lan_cham = max(0, min(idx_lan_cham - 1, len(list_khung_gio) - 1))

        # Logic Merge Shift: Nhiều khung giờ nhưng chỉ chấm 1 lần
        if item['sokhunggiotrongca'] > 1 and item['solanchamcongtrongngay'] == 1:
            khung_dau = list_khung_gio[0]
            khung_cuoi = list_khung_gio[-1]
            khung_dau.update({
                'congcuakhunggio': item['congtongcuaca'],
                'thoigianketthuc': khung_cuoi['thoigianketthuc'],
                'thoigianchophepvesomnhat': khung_cuoi['thoigianchophepvesomnhat'],
                'thoigianchophepvemuonnhat': khung_cuoi['thoigianchophepvemuonnhat'],
                'thoigianvesomkhongtinhchamcong': khung_cuoi['thoigianvesomkhongtinhchamcong']
            })
            item['khunggiolamviec'] = khung_dau
        else:
            # Lấy khung giờ tương ứng với lần chấm công hiện tại
            if idx_lan_cham >= len(list_khung_gio):
                continue
            item['khunggiolamviec'] = list_khung_gio[idx_lan_cham]

        nhanvien_id = item['nhanvien_id']
        item['da_cham_cong'] = da_cham_cong

        # Chỉ giữ lại 1 ca per nhân viên (ca đầu tiên tìm được theo số lần chấm công)
        if nhanvien_id not in final_result_map:
            final_result_map[nhanvien_id] = item

    final_data_list = list(final_result_map.values())
    return final_data_list


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

@login_required
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

@login_required
def view_tong_hop_cham_cong(request):
    """Tổng hợp chấm công"""
    context = {
        'breadcrumbs': [
            {'title': 'Chấm công', 'url': '#'},
            {'title': 'Quản lý chấm công', 'url': None},
            {'title': 'Tổng hợp chấm công', 'url': None},
        ],
        'tabs': [
            {'label': 'Tổng hợp tháng', 'url': '#tab-tong-hop', 'url_name': 'tab_summary', 'is_active': True},
            {'label': 'Đã chấm công', 'url': '#tab-da-cham', 'url_name': 'tab_checked_in'},
            {'label': 'Chưa chấm công', 'url': '#tab-chua-cham', 'url_name': 'tab_not_checked_in'},
        ]
    }
    return render(request, "hrm_manager/cham_cong/bang_cham_cong_summary.html", context)

# ================ API CHO BẢNG CHẤM CÔNG ================
@login_required
@require_http_methods(["GET", "POST"])
@transaction.atomic
def api_bang_cham_cong_list(request):
    """API cung cấp dữ liệu bảng chấm công dưới dạng JSON"""

    if request.method == 'GET':
        # Lấy dữ liệu chấm công
        return JsonResponse({'error': 'Phương thức không được phép'}, status=405)
    
    elif request.method == 'POST':
        try:
            data_list = loads(request.body)
            ket_qua_thanh_tien = tinh_luong_cham_cong(data_list)
            objs_bang_cham_cong = []

            # Gom nhóm dữ liệu theo nhân viên để tránh trùng lặp bản ghi
            grouped_data = {}
            for item in data_list:
                nv_id = item['nhanvien_id']
                if nv_id not in grouped_data:
                    grouped_data[nv_id] = {'main_item': item, 'sub_items': []}
                grouped_data[nv_id]['sub_items'].append(item)

            for nv_id, group in grouped_data.items():
                # Lấy thông tin chung từ item đầu tiên (Giờ vào/ra, Ca làm việc giống nhau)
                item = group['main_item']
                sub_items = group['sub_items']

                # Gộp tên công việc và ghi chú từ tất cả các tasks
                combined_ten_cv = ", ".join([sub.get('tencongviec', '') for sub in sub_items if sub.get('tencongviec')])

                khung_gio = item.get("khunggiolamviec", {}).copy()
                tg_vao = item.get("thoigianchamcongvao")
                tg_ra = item.get("thoigianchamcongra")
                loai_calamviec = item.get("loaicalamviec", "CO_DINH")
                codilam = item.get("codilam", False)

                # Khởi tạo mặc định
                thoigiandimuon = 0
                thoigianvesom = 0
                thoigiandisom = 0
                thoigianvemuon = 0
                tg_lam_viec = 0
                tg_lam_them = 0
                so_cong_thuc_te = 0

                if codilam == True:
                    # diff(Chuẩn, Thực): Dương = Đến Muộn | Âm = Đến Sớm
                    khoang_tg_cham_cong_vao = diff_minutes(khung_gio.get("thoigianbatdau"), tg_vao)

                    # Xử lý Checkout (Auto-fill nếu quên)
                    if not item.get("cocancheckout", True):
                        tg_ra = khung_gio.get("thoigianketthuc")
                        item['thoigianchamcongra'] = tg_ra 

                    # Tính tổng phút làm việc thô (Ra - Vào)
                    in_minutes = parse_time_to_minutes(tg_vao)
                    out_minutes = parse_time_to_minutes(tg_ra)
                    start_minutes = parse_time_to_minutes(khung_gio.get("thoigianbatdau"))
                    end_minutes = parse_time_to_minutes(khung_gio.get("thoigianketthuc"))
                    
                    # Tính thời gian làm việc thô xử lý qua đêm
                    tg_lam_viec_thuc = calculate_work_minutes_with_overnight(
                        in_minutes, out_minutes, start_minutes, end_minutes
                    )
                    tg_lam_viec_chuan_ca = calculate_work_minutes_with_overnight(
                        start_minutes, end_minutes, start_minutes, end_minutes
                    )
                    
                    # Trừ nghỉ trưa (chỉ phần giao với khoảng thời gian thực tế/chuẩn)
                    ds_nghi_trua = item.get('khunggionghitrua', [])
                    tong_phut_nghi_trua_thuc = tinh_phut_nghi_trua_trong_khoang(in_minutes, out_minutes, ds_nghi_trua)
                    tong_phut_nghi_trua_chuan = tinh_phut_nghi_trua_trong_khoang(start_minutes, end_minutes, ds_nghi_trua)
                    tg_lam_viec_thuc = tg_lam_viec_thuc - tong_phut_nghi_trua_thuc
                    tg_lam_viec_chuan_ca = tg_lam_viec_chuan_ca - tong_phut_nghi_trua_chuan

                    # Điều chỉnh đi muộn: trừ nghỉ trưa trong khoảng [start, check_in]
                    if khoang_tg_cham_cong_vao > 0:
                        khoang_tg_cham_cong_vao -= tinh_phut_nghi_trua_trong_khoang(start_minutes, in_minutes, ds_nghi_trua)

                    # --- CASE 1: CỐ ĐỊNH ---
                    if loai_calamviec == "CO_DINH":
                        limit_di_muon = khung_gio.get("thoigianchophepdenmuon", 0)
                        limit_ve_som = khung_gio.get("thoigianchophepvesomnhat", 0)
                        
                        # Đi muộn/về sớm trong giới hạn cho phép -> Không tính phạt
                        # diff(Thực, Chuẩn): Dương = Đi Muộn | Âm = Đi Sớm
                        if khoang_tg_cham_cong_vao > limit_di_muon:
                            thoigiandimuon = khoang_tg_cham_cong_vao
                        elif khoang_tg_cham_cong_vao < 0:
                            thoigiandisom = abs(khoang_tg_cham_cong_vao)

                        # Về sớm/muộn trong giới hạn cho phép -> Không tính phạt
                        # diff(Thực, Chuẩn): Dương = Về Sớm | Âm = Về Muộn (OT)
                        khoang_tg_cham_cong_ra = diff_minutes(tg_ra, khung_gio.get("thoigianketthuc"))
                        # Trừ nghỉ trưa trong khoảng về sớm [check_out, end]
                        if khoang_tg_cham_cong_ra > 0:
                            khoang_tg_cham_cong_ra -= tinh_phut_nghi_trua_trong_khoang(out_minutes, end_minutes, ds_nghi_trua)

                        if khoang_tg_cham_cong_ra > limit_ve_som: 
                            thoigianvesom = khoang_tg_cham_cong_ra
                        elif khoang_tg_cham_cong_ra < 0: 
                            thoigianvemuon = abs(khoang_tg_cham_cong_ra)

                        # Chỉ trừ phần đi muộn/về sớm vượt ngưỡng cho phép
                        tg_lam_viec = tg_lam_viec_chuan_ca - thoigiandimuon - thoigianvesom

                    # --- CASE 2: LINH ĐỘNG ---
                    elif loai_calamviec == "LINH_DONG":
                        phut_den_muon_cho_phep = khung_gio.get("sophutdenmuon", 0) 
                        phut_den_som_cho_phep = khung_gio.get("sophutdensom", 0) 
                        
                        # Logic điều chỉnh giờ
                        # Nếu nằm trong khoảng linh động -> Dời giờ kết thúc
                        is_linh_dong_hop_le = False
                        
                        if khoang_tg_cham_cong_vao > 0 and khoang_tg_cham_cong_vao <= phut_den_muon_cho_phep:
                            is_linh_dong_hop_le = True
                        elif khoang_tg_cham_cong_vao < 0 and abs(khoang_tg_cham_cong_vao) <= phut_den_som_cho_phep:
                            is_linh_dong_hop_le = True
                        
                        if is_linh_dong_hop_le:
                            # Dời giờ kết thúc theo thực tế vào
                            khung_gio['thoigianketthuc'] = parse_minutes_to_time(
                                parse_time_to_minutes(khung_gio.get("thoigianketthuc")) + khoang_tg_cham_cong_vao
                            )
                        else:
                            # Quá hạn mức linh động -> Tính phạt như Ca cố định
                            if khoang_tg_cham_cong_vao > phut_den_muon_cho_phep:
                                thoigiandimuon = khoang_tg_cham_cong_vao
                            elif khoang_tg_cham_cong_vao < 0:
                                thoigiandisom = abs(khoang_tg_cham_cong_vao)

                        # Tính VỀ dựa trên giờ kết thúc (có thể đã dời hoặc chưa)
                        khoang_tg_cham_cong_ra = diff_minutes(tg_ra, khung_gio.get("thoigianketthuc"))
                        # Trừ nghỉ trưa trong khoảng về sớm [check_out, end_đã_dời]
                        if khoang_tg_cham_cong_ra > 0:
                            end_minutes_hien_tai = parse_time_to_minutes(khung_gio.get("thoigianketthuc"))
                            khoang_tg_cham_cong_ra -= tinh_phut_nghi_trua_trong_khoang(out_minutes, end_minutes_hien_tai, ds_nghi_trua)
                        
                        if khoang_tg_cham_cong_ra > 0: # Về sớm
                            thoigianvesom = khoang_tg_cham_cong_ra
                        elif khoang_tg_cham_cong_ra < 0: # Về muộn
                            thoigianvemuon = abs(khoang_tg_cham_cong_ra)

                        # Chỉ trừ phần đi muộn/về sớm vượt ngưỡng cho phép
                        tg_lam_viec = tg_lam_viec_chuan_ca - thoigiandimuon - thoigianvesom

                    # --- CASE 3: TỰ DO ---
                    elif loai_calamviec == "TU_DO":
                        if khoang_tg_cham_cong_vao < 0:
                            thoigiandisom = abs(khoang_tg_cham_cong_vao)

                        # Tính giờ ra
                        khoang_tg_cham_cong_ra = diff_minutes(tg_ra, khung_gio.get("thoigianketthuc"))
                        if khoang_tg_cham_cong_ra < 0:
                            thoigianvemuon = abs(khoang_tg_cham_cong_ra)
                        
                        # Ca tự do tính theo thực tế đã được tính ở trên
                        tg_lam_viec = tg_lam_viec_thuc

                    # --- LOGIC CHUNG ---
                    
                    # Tính thời gian OT
                    if item.get('cotinhlamthem', False) and thoigianvemuon > 0:
                        tg_lam_them = item.get("sophutot", 0)

                    # Ràng buộc không tính công (Chỉ áp dụng cho Cố định/Linh động nếu cần)
                    limit_vesom_0_cong = khung_gio.get("thoigianvesomkhongtinhchamcong", 0)
                    limit_dimuon_0_cong = khung_gio.get("thoigiandimuonkhongtinhchamcong", 0)

                    if (limit_vesom_0_cong > 0 and thoigianvesom > limit_vesom_0_cong) or \
                    (limit_dimuon_0_cong > 0 and thoigiandimuon > limit_dimuon_0_cong):
                        tg_lam_viec = 0
                    
                    # Thời gian tối thiểu
                    if tg_lam_viec < khung_gio.get("thoigianlamviectoithieu", 0):
                        tg_lam_viec = 0

                    # --- QUY ĐỔI GIỜ LÀM -> SỐ CÔNG ---
                    # Số công thực tế = (Giờ làm thực tế / Giờ làm chuẩn ca) * Số công chuẩn
                    so_cong_chuan = khung_gio.get("congcuakhunggio", 0) or 0
                    if tg_lam_viec_chuan_ca > 0 and so_cong_chuan > 0:
                        so_cong_thuc_te = round((tg_lam_viec / tg_lam_viec_chuan_ca) * so_cong_chuan, 2)
                        # Giới hạn không vượt quá công chuẩn
                        so_cong_thuc_te = min(so_cong_thuc_te, so_cong_chuan)
                    else:
                        so_cong_thuc_te = 0
                    
                    # --- TÍNH TOÁN TIỀN LƯƠNG & OT ---
                    # Lấy lương gốc từ Calculator
                    luong_goc = ket_qua_thanh_tien.get(item['nhanvien_id'], 0)
                    
                    # Tính tiền OT
                    tien_ot = 0
                    if tg_lam_them > 0:
                        don_gia_phut = luong_goc / tg_lam_viec_chuan_ca if tg_lam_viec_chuan_ca > 0 else 0
                        tien_ot = don_gia_phut * tg_lam_them * 1.5

                    # Tính tổng tiền cho dòng chấm công này
                    tong_tien_cuoi_cung = luong_goc + tien_ot
                    
                    # Không làm phút nào (tg_lam_viec=0) thì không có lương
                    if tg_lam_viec == 0 and tg_lam_them == 0:
                        tong_tien_cuoi_cung = 0

                # Xử lý thamsotinhluong: Nếu làm nhiều việc, lưu cấu trúc JSON chứa danh sách
                if len(sub_items) > 1:
                    final_thamsotinhluong = {
                        'mode': 'multi_task',
                        'details': [
                            {
                                'congviec_id': sub.get('congviec_id'),
                                'tencongviec': sub.get('tencongviec'),
                                'thamsotinhluong': sub.get('thamsotinhluong')
                            } for sub in sub_items
                        ]
                    }
                else:
                    final_thamsotinhluong = item.get('thamsotinhluong', {})

                # Tạo Object
                objs_bang_cham_cong.append(Bangchamcong(
                    created_at = timezone.now(),
                    thoigianchamcongvao = tg_vao,
                    thoigianchamcongra = tg_ra,
                    conglamviec = max(0, so_cong_thuc_te),
                    thoigianlamviec = max(0, tg_lam_viec),
                    ngaylamviec = dt.date.fromisoformat(item['ngaylamviec']),
                    thoigianlamthem = tg_lam_them,
                    cotinhlamthem = item.get('cotinhlamthem', False),
                    coantrua = item.get('coantrua', False),
                    codilam = codilam,
                    thoigiandimuon = thoigiandimuon,
                    thoigianvesom = thoigianvesom,
                    thoigiandisom = thoigiandisom,
                    thoigianvemuon = thoigianvemuon,
                    loaichamcong = item.get('loaichamcong', ''),
                    tencongviec = combined_ten_cv if combined_ten_cv else item.get('tencongviec', ''),
                    cophaingaynghi = item.get('cophaingaynghi', False),
                    thamsotinhluong = dumps(final_thamsotinhluong) if isinstance(final_thamsotinhluong, dict) else final_thamsotinhluong,
                    thanhtien = tong_tien_cuoi_cung if codilam == True else 0,
                    ghichu = item.get('ghichu', ''),
                    congviec_id = item.get('congviec_id'),
                    nhanvien_id = item['nhanvien_id'],
                    calamviec_id = item.get('calamviec_id', None)
                ))

            Bangchamcong.objects.bulk_create(objs_bang_cham_cong)
            
            return JsonResponse({
                'success': True,
                'message': 'Chấm công thành công',
                'data':[model_to_dict(obj) for obj in objs_bang_cham_cong],
            }, status = 201)

        except Exception as e:
            return JsonResponse({'success': False, 'message': f'Lỗi: {str(e)}'}, status=400)


@login_required
@require_http_methods(["GET"])
def api_bang_cham_cong_nhan_vien_list(request):
    # Xử lý đầu vào
    try:
        ngay_lam_viec = dt.date.fromisoformat(request.GET.get("ngaylamviec"))
    except (ValueError, TypeError):
        return JsonResponse({'success': False, 'message': 'Ngày không hợp lệ'}, status=400)

    data = build_cham_cong_data_by_status(ngay_lam_viec, da_cham_cong=False)
    return JsonResponse({'success': True, 'data': data}, status=200)


@login_required
@require_http_methods(["GET"])
def api_tong_hop_cham_cong_thang(request):
    """API Tổng hợp chấm công tháng cho nhân viên"""
    
    try:
        phongban_id = request.GET.get('phongban_id', None)
        phong_ban_cons_ids = get_all_child_department_ids(phongban_id, isnclude_root=True) if phongban_id else None
        
        search_query = request.GET.get('search', None)
        
        loai_cham_cong = request.GET.get('loai_chamcong', "all")
        thoi_gian = dt.datetime.strptime(request.GET.get('thang', dt.datetime.now().strftime("%Y-%m")), "%Y-%m")
    except ValueError:
        return JsonResponse({'success': False, 'message': 'Thời gian không hợp lệ'})
    
    # Base Query lấy nhân viên đang active
    queryset = Lichsucongtac.objects.filter(trangthai='active')
    
    # Filter theo phòng ban (Nếu có chọn)
    if phong_ban_cons_ids is not None:
        queryset = queryset.filter(phongban_id__in=phong_ban_cons_ids)
        
    # Filter theo tìm kiếm (Nếu có nhập)
    if search_query:
        queryset = queryset.filter(
            Q(nhanvien__hovaten__icontains=search_query) | 
            Q(nhanvien__manhanvien__icontains=search_query)
        )
    
    # Annotate và thực thi
    ds_nhan_vien = list(queryset.annotate(
        ten_nv=F('nhanvien__hovaten'),
        ma_nv=F('nhanvien__manhanvien'),
        ten_cv=F("chucvu__tenvitricongviec")
    ).values('nhanvien_id', 'ten_nv', 'ma_nv', 'phongban_id', 'ten_cv').order_by('nhanvien_id'))
    
    # Lấy dữ liệu chấm công
    ds_cham_cong = Bangchamcong.objects.filter(
        ngaylamviec__year=thoi_gian.year, 
        ngaylamviec__month=thoi_gian.month
    ).values().order_by('created_at')

    # Xử lý gom nhóm dữ liệu chấm công theo nhân viên
    map_cc = defaultdict(lambda: {'tong_gio': 0, 'logs': defaultdict(list), 'loai_chamcong': ''}) # {nhanvien_id: {'tong_gio': int, 'logs': {ngay: [log_entries], 'loai_chamcong': str}}}

    for cc in ds_cham_cong:
        nv_id = cc['nhanvien_id']
        tg_lam = round(float(cc['thoigianlamviec']/60 or 0),1)
        ngay_str = f"{cc['ngaylamviec'].day:02d}"
        
        # Cộng dồn tổng giờ
        map_cc[nv_id]['tong_gio'] += tg_lam

        # Format dữ liệu từng dòng log
        tg_vao = cc['thoigianchamcongvao']
        tg_ra = cc['thoigianchamcongra']
        
        log_entry = {
            'tg_vao': tg_vao.strftime("%H:%M") if tg_vao else '',
            'tg_ra': tg_ra.strftime("%H:%M") if tg_ra else '',
            'tg_lamviec': tg_lam,
            'codimuon': (cc['thoigiandimuon'] or 0) > 0,
            'thoigiandimuon': cc['thoigiandimuon'],
            'covesom': (cc['thoigianvesom'] or 0) > 0,
            'thoigianvesom': cc['thoigianvesom'],
            'codilam': cc['codilam'],
            'tencalamviec': cc['tencongviec'],
            'ghichu': cc['ghichu'],
        }
        
        map_cc[nv_id]['logs'][ngay_str].append(log_entry)
        map_cc[nv_id]['loai_chamcong'] = cc.get('loaichamcong', None)

    # Merge dữ liệu vào danh sách nhân viên
    merge_ds_nv = []
    for nv in ds_nhan_vien:
        data_cc = map_cc.get(nv['nhanvien_id'])

        if data_cc:
            nv['logs'] = data_cc['logs']
            nv['tongthoigianlamviec'] = data_cc['tong_gio']
            nv['loai_chamcong'] = data_cc['loai_chamcong']
        else:
            nv['logs'] = {}
            nv['tongthoigianlamviec'] = 0
            nv['loai_chamcong'] = ''
        
        if loai_cham_cong == 'all' or loai_cham_cong == nv['loai_chamcong']:
            merge_ds_nv.append(nv)

    return JsonResponse({'success': True, 'data': merge_ds_nv, 'total': len(merge_ds_nv)}, status=200)


# @login_required
@require_http_methods(["GET"])
def api_check_cham_cong(request):
    """API lấy danh sách nhân viên đã hoặc chưa chấm công trong ngày."""
    query_param_da_cham_cong = request.GET.get('dachamcong')
    if query_param_da_cham_cong is None:
        return JsonResponse({'success': False, 'message': 'Giá trị dachamcong không hợp lệ (true/false)'}, status=400)

    try:
        ngay_lam_viec = dt.date.fromisoformat(request.GET.get("ngaylamviec"))
    except (ValueError, TypeError):
        return JsonResponse({'success': False, 'message': 'Ngày không hợp lệ'}, status=400)

    data = build_cham_cong_data_by_status(ngay_lam_viec, da_cham_cong=query_param_da_cham_cong)
    return JsonResponse({'success': True, 'data': data}, status=200)

# ============================================================
# VIEWS: ĐƠN BÁO & BÁO CÁO
# ============================================================

def view_don_bao(request):
    return render(request, "hrm_manager/cham_cong/don_bao.html", {})

def view_bao_cao(request):
    return render(request, "hrm_manager/cham_cong/bao_cao.html", {})