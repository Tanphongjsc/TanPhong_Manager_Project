from django.forms import model_to_dict
from django.shortcuts import render
from django.urls import reverse
from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
from django.db.models import CharField, F, Value, Func, Count, OuterRef, Subquery, IntegerField, Q, Exists
from django.db.models.functions import Cast, Coalesce
from django.db import transaction
from django.contrib.postgres.aggregates import JSONBAgg

from json import loads, dumps
import datetime as dt
from collections import defaultdict

from apps.hrm_manager.__core__.models import Bangchamcong, Khunggionghitrua, Phongban, Lichlamviecthucte, Calamviec, Lichsucongtac
from apps.hrm_manager.cham_cong.services import PayrollCalculator
from apps.hrm_manager.utils.permissions import require_api_permission, require_view_permission
from apps.hrm_manager.utils.view_helpers import diff_minutes, parse_time_to_minutes, parse_minutes_to_time, calculate_work_minutes_with_overnight, tinh_phut_nghi_trua_trong_khoang, serialize_time_value
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

def calculate_bang_cham_cong_objects(data_list):
    """
    Dùng chung cho cả thêm mới và cập nhật chấm công.
    Trả về danh sách instance Bangchamcong đã tính toán đầy đủ số liệu.
    """
    base_data_list = []
    extra_data_list = []
    for item in data_list:
        if item.get('pay_role') == 'extra':
            extra_data_list.append(item)
        else:
            base_data_list.append(item)
            
    # Tính trước tiền lương gốc theo danh sách đầu vào, dùng lại cho từng nhân viên.
    ket_qua_tien_base = tinh_luong_cham_cong(base_data_list)
    ket_qua_tien_extra = tinh_luong_cham_cong(extra_data_list)
    objs_bang_cham_cong = []

    # Gom dữ liệu theo nhân viên để hợp nhất các công việc của cùng 1 người trong ngày.
    grouped_data = {}
    for item in data_list:
        # Key gom nhóm là nhân viên, để mỗi nhân viên tạo đúng 1 dòng kết quả cuối.
        nv_id = item['nhanvien_id']
        if nv_id not in grouped_data:
            grouped_data[nv_id] = {'main_item': None, 'sub_items': [], 'extra_items': []}
        
        if item.get('pay_role') == 'extra':
            grouped_data[nv_id]['extra_items'].append(item)
        else:
            if grouped_data[nv_id]['main_item'] is None:
                grouped_data[nv_id]['main_item'] = item
            grouped_data[nv_id]['sub_items'].append(item)

    for nv_id, group in grouped_data.items():
        item = group['main_item']
        if not item:
            item = group['extra_items'][0] if group.get('extra_items') else None
        if not item: continue
        
        sub_items = group['sub_items']
        extra_items = group['extra_items']
        phuongthuctinhluong = item.get('phuongthuctinhluong', 'daily')

        # Nhiều công việc trong ngày sẽ gộp tên để hiển thị 1 dòng trong bảng chấm công.
        danh_sach_cong_viec = sub_items if phuongthuctinhluong == 'daily' else extra_items
        combined_ten_cv = ", ".join([sub.get('tencongviec', '') for sub in danh_sach_cong_viec if sub.get('tencongviec')])

        # Sao chép khung giờ để tránh mutate dữ liệu gốc từ payload khi cần điều chỉnh ở ca linh động.
        khung_gio = item.get("khunggiolamviec", {}).copy()
        tg_vao = item.get("thoigianchamcongvao")
        tg_ra = item.get("thoigianchamcongra")
        loai_calamviec = item.get("loaicalamviec", "CO_DINH")
        codilam = item.get("codilam", False)

        # Reset các biến tích lũy cho từng nhân viên trước khi tính.
        thoigiandimuon = 0
        thoigianvesom = 0
        thoigiandisom = 0
        thoigianvemuon = 0
        tg_lam_viec = 0
        tg_lam_them = 0
        so_cong_thuc_te = 0

        tien_base = 0
        tien_extra = 0
        tien_ot = 0
        tong_tien_cuoi_cung = 0
        final_thamsotinhluong = {}
        thanhtien_thanhphan = {"tien_base": 0, "tien_ot": 0, "tien_extra": 0}

        if codilam == True:
            # Sai lệch giờ vào (dương: đi muộn, âm: đi sớm).
            khoang_tg_cham_cong_vao = diff_minutes(khung_gio.get("thoigianbatdau"), tg_vao)

            if not item.get("cocancheckout", True):
                # Ca không cần checkout thì mặc định giờ ra theo khung giờ kết thúc.
                tg_ra = khung_gio.get("thoigianketthuc")
                item['thoigianchamcongra'] = tg_ra

            in_minutes = parse_time_to_minutes(tg_vao)
            out_minutes = parse_time_to_minutes(tg_ra)
            start_minutes = parse_time_to_minutes(khung_gio.get("thoigianbatdau"))
            end_minutes = parse_time_to_minutes(khung_gio.get("thoigianketthuc"))

            # tg_lam_viec_thuc: phút làm việc theo checkin/checkout thực tế.
            # tg_lam_viec_chuan_ca: phút chuẩn của ca (khung giờ kế hoạch).
            tg_lam_viec_thuc = calculate_work_minutes_with_overnight(
                in_minutes, out_minutes, start_minutes, end_minutes
            )
            tg_lam_viec_chuan_ca = calculate_work_minutes_with_overnight(
                start_minutes, end_minutes, start_minutes, end_minutes
            )

            # Trừ thời gian nghỉ trưa thực tế/chuẩn ra khỏi tổng phút làm việc.
            ds_nghi_trua = item.get('khunggionghitrua', [])
            tong_phut_nghi_trua_thuc = tinh_phut_nghi_trua_trong_khoang(in_minutes, out_minutes, ds_nghi_trua)
            tong_phut_nghi_trua_chuan = tinh_phut_nghi_trua_trong_khoang(start_minutes, end_minutes, ds_nghi_trua)
            tg_lam_viec_thuc = tg_lam_viec_thuc - tong_phut_nghi_trua_thuc
            tg_lam_viec_chuan_ca = tg_lam_viec_chuan_ca - tong_phut_nghi_trua_chuan

            if khoang_tg_cham_cong_vao > 0:
                # Đi muộn nhưng có cắt qua nghỉ trưa thì trừ phần nghỉ trưa để không phạt sai.
                khoang_tg_cham_cong_vao -= tinh_phut_nghi_trua_trong_khoang(start_minutes, in_minutes, ds_nghi_trua)

            if loai_calamviec == "CO_DINH":
                # CA CỐ ĐỊNH: so với chuẩn ca, có ngưỡng cho phép đi muộn/về sớm.
                limit_di_muon = khung_gio.get("thoigianchophepdenmuon", 0)
                limit_ve_som = khung_gio.get("thoigianchophepvesomnhat", 0)

                if khoang_tg_cham_cong_vao > limit_di_muon:
                    thoigiandimuon = khoang_tg_cham_cong_vao
                elif khoang_tg_cham_cong_vao < 0:
                    thoigiandisom = abs(khoang_tg_cham_cong_vao)

                khoang_tg_cham_cong_ra = diff_minutes(tg_ra, khung_gio.get("thoigianketthuc"))
                if khoang_tg_cham_cong_ra > 0:
                    # Về sớm có thể cắt qua nghỉ trưa nên cần loại trừ phút nghỉ trưa khỏi phần phạt.
                    khoang_tg_cham_cong_ra -= tinh_phut_nghi_trua_trong_khoang(out_minutes, end_minutes, ds_nghi_trua)

                if khoang_tg_cham_cong_ra > limit_ve_som:
                    thoigianvesom = khoang_tg_cham_cong_ra
                elif khoang_tg_cham_cong_ra < 0:
                    thoigianvemuon = abs(khoang_tg_cham_cong_ra)

                # Công thực tế của ca cố định = công chuẩn trừ đi muộn/về sớm.
                tg_lam_viec = tg_lam_viec_chuan_ca - thoigiandimuon - thoigianvesom

            elif loai_calamviec == "LINH_DONG":
                # CA LINH ĐỘNG: cho phép dịch giờ vào trong biên độ, khi hợp lệ sẽ dời giờ kết thúc tương ứng.
                phut_den_muon_cho_phep = khung_gio.get("sophutdenmuon", 0)
                phut_den_som_cho_phep = khung_gio.get("sophutdensom", 0)

                is_linh_dong_hop_le = False
                if khoang_tg_cham_cong_vao > 0 and khoang_tg_cham_cong_vao <= phut_den_muon_cho_phep:
                    is_linh_dong_hop_le = True
                elif khoang_tg_cham_cong_vao < 0 and abs(khoang_tg_cham_cong_vao) <= phut_den_som_cho_phep:
                    is_linh_dong_hop_le = True

                if is_linh_dong_hop_le:
                    # Dời giờ kết thúc để giữ nguyên tổng thời lượng ca khi nhân viên vào lệch trong ngưỡng cho phép.
                    khung_gio['thoigianketthuc'] = parse_minutes_to_time(
                        parse_time_to_minutes(khung_gio.get("thoigianketthuc")) + khoang_tg_cham_cong_vao
                    )
                else:
                    # Ngoài ngưỡng linh động: tính thành đi muộn/đi sớm như bình thường.
                    if khoang_tg_cham_cong_vao > phut_den_muon_cho_phep:
                        thoigiandimuon = khoang_tg_cham_cong_vao
                    elif khoang_tg_cham_cong_vao < 0:
                        thoigiandisom = abs(khoang_tg_cham_cong_vao)

                khoang_tg_cham_cong_ra = diff_minutes(tg_ra, khung_gio.get("thoigianketthuc"))
                if khoang_tg_cham_cong_ra > 0:
                    # Sau khi dời giờ kết thúc, tiếp tục trừ nghỉ trưa để tính phần về sớm chính xác.
                    end_minutes_hien_tai = parse_time_to_minutes(khung_gio.get("thoigianketthuc"))
                    khoang_tg_cham_cong_ra -= tinh_phut_nghi_trua_trong_khoang(out_minutes, end_minutes_hien_tai, ds_nghi_trua)

                if khoang_tg_cham_cong_ra > 0:
                    thoigianvesom = khoang_tg_cham_cong_ra
                elif khoang_tg_cham_cong_ra < 0:
                    thoigianvemuon = abs(khoang_tg_cham_cong_ra)

                # Với ca linh động hợp lệ có thể dời giờ kết thúc tương ứng giờ vào.
                tg_lam_viec = tg_lam_viec_chuan_ca - thoigiandimuon - thoigianvesom

            elif loai_calamviec == "TU_DO":
                # CA TỰ DO: không ép công thức chuẩn theo khung, dùng thời gian thực tế sau khi trừ nghỉ trưa.
                if khoang_tg_cham_cong_vao < 0:
                    thoigiandisom = abs(khoang_tg_cham_cong_vao)

                khoang_tg_cham_cong_ra = diff_minutes(tg_ra, khung_gio.get("thoigianketthuc"))
                if khoang_tg_cham_cong_ra < 0:
                    thoigianvemuon = abs(khoang_tg_cham_cong_ra)

                tg_lam_viec = tg_lam_viec_thuc

            if item.get('cotinhlamthem', False) and thoigianvemuon > 0:
                # Chỉ tính OT khi có cấu hình tính OT và có thời gian về muộn.
                tg_lam_them = item.get("sophutot", 0)

            limit_vesom_0_cong = khung_gio.get("thoigianvesomkhongtinhchamcong", 0)
            limit_dimuon_0_cong = khung_gio.get("thoigiandimuonkhongtinhchamcong", 0)

            # Vi phạm ngưỡng nặng (đi muộn/về sớm quá mức) thì hạ về 0 công.
            if (limit_vesom_0_cong > 0 and thoigianvesom > limit_vesom_0_cong) or \
            (limit_dimuon_0_cong > 0 and thoigiandimuon > limit_dimuon_0_cong):
                tg_lam_viec = 0

            # Không đạt ngưỡng phút tối thiểu của khung giờ thì cũng không tính công.
            if tg_lam_viec < khung_gio.get("thoigianlamviectoithieu", 0):
                tg_lam_viec = 0

            # Quy đổi phút làm việc sang số công theo công chuẩn của khung giờ.
            so_cong_chuan = khung_gio.get("congcuakhunggio", 0) or 0
            if tg_lam_viec_chuan_ca > 0 and so_cong_chuan > 0:
                so_cong_thuc_te = round((tg_lam_viec / tg_lam_viec_chuan_ca) * so_cong_chuan, 2)
                so_cong_thuc_te = min(so_cong_thuc_te, so_cong_chuan)
            else:
                so_cong_thuc_te = 0

            if phuongthuctinhluong == 'daily':
                tien_base = ket_qua_tien_base.get(item['nhanvien_id'], 0)
                tien_extra = 0
                if tg_lam_them > 0:
                    don_gia_phut = tien_base / tg_lam_viec_thuc if tg_lam_viec_thuc > 0 else 0
                    tien_ot = don_gia_phut * tg_lam_them * 0.5
            elif phuongthuctinhluong == 'monthly':
                tien_base = 0
                tien_extra = ket_qua_tien_extra.get(item['nhanvien_id'], 0)
                tien_ot = 0 # Không tính OT cho VP
            
            tong_tien_cuoi_cung = tien_base + tien_ot + tien_extra
            
            if tg_lam_viec == 0 and tg_lam_them == 0 and tien_extra == 0:
                tong_tien_cuoi_cung = 0

            thanhtien_thanhphan = {
                "tien_base": tien_base,
                "tien_ot": tien_ot,
                "tien_extra": tien_extra
            }

            # Build Tham số tính lương
            chi_tiet_luong = extra_items if phuongthuctinhluong == 'monthly' else sub_items
            final_thamsotinhluong = {
                'mode': 'multi_task' if len(chi_tiet_luong) > 1 else 'single_task',
                'details': [
                    {
                        'congviec_id': sub.get('congviec_id'),
                        'tencongviec': sub.get('tencongviec'),
                        'thamsotinhluong': sub.get('thamsotinhluong'),
                        'pay_role': sub.get('pay_role')
                    } for sub in chi_tiet_luong
                ]
            }

        # Tạo object Bangchamcong để bulk_create ở tầng API.
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
            thanhtienthanhphan = dumps(thanhtien_thanhphan) if isinstance(thanhtien_thanhphan, dict) else thanhtien_thanhphan,
            ghichu = item.get('ghichu', ''),
            congviec_id = item.get('congviec_id'),
            nhanvien_id = item['nhanvien_id'],
            calamviec_id = item.get('calamviec_id', None)
        ))

    return objs_bang_cham_cong

def _get_department_map(nhanvien_ids):
    if not nhanvien_ids:
        return {}
    qs_phongban = Lichsucongtac.objects.filter(
        nhanvien_id__in=nhanvien_ids,
        trangthai="active"
    ).values('nhanvien_id', 'phongban_id')
    return {p['nhanvien_id']: p['phongban_id'] for p in qs_phongban}

def _get_calamviec_meta(calamviec_ids, include_khung_gio=False):
    if not calamviec_ids:
        return {}

    annotations = {
        'json_nghitrua': JSONBAgg(
            Func(
                Value('giobatdau'), Cast('khunggionghitrua__giobatdau', CharField()),
                Value('gioketthuc'), Cast('khunggionghitrua__gioketthuc', CharField()),
                function='jsonb_build_object'
            )
        )
    }

    if include_khung_gio:
        annotations['list_khung_gio_json'] = JSONBAgg(
            Func(
                Value('congcuakhunggio'), F('khunggiolamviec__congcuakhunggio'),
                Value('thoigianbatdau'), Cast('khunggiolamviec__thoigianbatdau', CharField()),
                Value('thoigianketthuc'), Cast('khunggiolamviec__thoigianketthuc', CharField()),
                Value('thoigianchophepchamcongsomnhat'), Cast('khunggiolamviec__thoigianchophepchamcongsomnhat', CharField()),
                Value('thoigianchophepvemuonnhat'), Cast('khunggiolamviec__thoigianchophepvemuonnhat', CharField()),
                Value('thoigianchophepdenmuon'), F('khunggiolamviec__thoigianchophepdenmuon'),
                Value('thoigiandimuonkhongtinhchamcong'), F('khunggiolamviec__thoigiandimuonkhongtinhchamcong'),
                Value('thoigianchophepvesomnhat'), F('khunggiolamviec__thoigianchophepvesomnhat'),
                Value('thoigianvesomkhongtinhchamcong'), F('khunggiolamviec__thoigianvesomkhongtinhchamcong'),
                Value('thoigianlamviectoithieu'), F('khunggiolamviec__thoigianlamviectoithieu'),
                Value('sophutdenmuon'), F('khunggiolamviec__sophutdenmuon'),
                Value('sophutdensom'), F('khunggiolamviec__sophutdensom'),
                function='jsonb_build_object'
            ),
            ordering='khunggiolamviec__created_at'
        )

    qs = Calamviec.objects.filter(id__in=calamviec_ids).values('id').annotate(**annotations)
    return {
        c['id']: {
            'khunggionghitrua': c.get('json_nghitrua') or [],
            'list_khung_gio': c.get('list_khung_gio_json') or []
        }
        for c in qs
    }

def _build_merged_khung_gio(item, list_khung_gio):
    """
    Gộp nhiều khung giờ thành 1 khung khi ca chỉ yêu cầu chấm công 1 lần.
    Áp dụng giống logic mode create.
    """
    if not list_khung_gio:
        return None

    if item.get('sokhunggiotrongca', 0) <= 1 or item.get('solanchamcongtrongngay', 0) != 1:
        return None

    khung_dau = dict(list_khung_gio[0])
    khung_cuoi = list_khung_gio[-1]
    khung_dau.update({
        'congcuakhunggio': item.get('congtongcuaca', khung_dau.get('congcuakhunggio')),
        'thoigianketthuc': khung_cuoi.get('thoigianketthuc'),
        'thoigianchophepvesomnhat': khung_cuoi.get('thoigianchophepvesomnhat'),
        'thoigianchophepvemuonnhat': khung_cuoi.get('thoigianchophepvemuonnhat'),
        'thoigianvesomkhongtinhchamcong': khung_cuoi.get('thoigianvesomkhongtinhchamcong')
    })
    return khung_dau

def _resolve_khung_gio_lam_viec(item, list_khung_gio, idx_lan_cham):
    """
    Chọn khung giờ làm việc cho 1 bản ghi chấm công.
    Ưu tiên logic gộp khung giờ, nếu không thì lấy theo index lần chấm.
    """
    merged_khung_gio = _build_merged_khung_gio(item, list_khung_gio)
    if merged_khung_gio is not None:
        return merged_khung_gio

    if idx_lan_cham < 0 or idx_lan_cham >= len(list_khung_gio):
        return None

    return list_khung_gio[idx_lan_cham]

def _bo_sung_nghi_trua_giua_cac_khung_gio(item, list_khung_gio):
    """
    Nếu ca làm việc có nhiều khung giờ và chỉ chấm công 1 lần, 
    khoảng thời gian giữa các khung giờ sẽ tự động được ghi nhận là giờ nghỉ trưa.
    """
    if item.get('sokhunggiotrongca', 0) > 1 and item.get('solanchamcongtrongngay', 0) == 1:
        # Sắp xếp các khung giờ theo thời gian bắt đầu để đảm bảo tính liên tục (phòng trường hợp DB trả sai thứ tự)
        sorted_kg = sorted([k for k in list_khung_gio if k.get('thoigianbatdau')], key=lambda x: str(x['thoigianbatdau']))
        
        # Gộp khoảng thời gian giữa khung trước (kết thúc) và khung sau (bắt đầu)
        for f, s in zip(sorted_kg, sorted_kg[1:]):
            t_end, t_start = f.get('thoigianketthuc'), s.get('thoigianbatdau')
            if t_end and t_start:
                nghi_trua = {'giobatdau': t_end, 'gioketthuc': t_start}
                # Tránh thêm trùng lặp nếu người dùng đã tình cờ khai báo trong cơ sở dữ liệu
                if nghi_trua not in item.setdefault('khunggionghitrua', []):
                    item['khunggionghitrua'].append(nghi_trua)

def build_cham_cong_data_for_update(ngay_lam_viec):
    """
    Lấy dữ liệu chấm công đã lưu để phục vụ chỉnh sửa (mode=update).
    Trả đầy đủ từng dòng chấm công theo ngày, bao gồm nhiều bản ghi/nhân viên nếu có.
    """
    # 1) Lấy toàn bộ bản ghi chấm công đã lưu trong ngày và join thêm metadata cần cho màn hình update.
    qs_cham_cong = Bangchamcong.objects.filter(
        ngaylamviec=ngay_lam_viec
    ).annotate(
        hovaten=F('nhanvien__hovaten'),
        manhanvien=F('nhanvien__manhanvien'),
        loainv=F('nhanvien__loainv__id'),
        phuongthuctinhluong=F('nhanvien__loainv__phuongthuctinhluong'),
        solanchamcongtrongngay=F('calamviec__solanchamcongtrongngay'),
        sokhunggiotrongca=F('calamviec__sokhunggiotrongca'),
        cocancheckout=F('calamviec__cocancheckout'),
        loaicalamviec=F('calamviec__loaichamcong'),
        tongthoigianlamvieccuaca=F('calamviec__tongthoigianlamvieccuaca'),
        congtongcuaca=F('calamviec__congcuacalamviec'),
    ).values(
        'id', 'nhanvien_id', 'calamviec_id', 'cophaingaynghi',
        'hovaten', 'manhanvien', 'loainv', 'phuongthuctinhluong',
        'solanchamcongtrongngay', 'sokhunggiotrongca', 'cocancheckout', 'loaicalamviec', 'tongthoigianlamvieccuaca',
        'congtongcuaca',
        'thoigianchamcongvao', 'thoigianchamcongra', 'coantrua', 'cotinhlamthem', 'thoigianlamthem',
        'codilam', 'loaichamcong', 'tencongviec', 'congviec_id', 'thamsotinhluong', 'ghichu'
    ).order_by('nhanvien_id', 'id')

    # Materialize queryset để xử lý Python nhiều bước bên dưới.
    ds_cham_cong = list(qs_cham_cong)
    if not ds_cham_cong:
        return []

    # 2) Chuẩn bị danh sách id để tải dữ liệu phụ trợ theo batch (tránh query lặp trong vòng for).
    list_nhanvien_id = list({item['nhanvien_id'] for item in ds_cham_cong})
    set_calamviec_id = {item['calamviec_id'] for item in ds_cham_cong if item.get('calamviec_id')}

    # Map phòng ban hiện tại của nhân viên và metadata ca làm (khung giờ + nghỉ trưa).
    map_nhan_vien_phong_ban = _get_department_map(list_nhanvien_id)
    map_ca_lam = _get_calamviec_meta(set_calamviec_id, include_khung_gio=True)

    # row_index_by_emp dùng để xác định bản ghi thứ mấy của mỗi nhân viên,từ đó map đúng khung giờ tương ứng trong ca nhiều khung giờ.
    row_index_by_emp = defaultdict(int)
    final_data = []
    for item in ds_cham_cong:
        nhanvien_id = item['nhanvien_id']
        calamviec_id = item.get('calamviec_id')

        # 3) Gắn phòng ban hiện tại cho từng dòng dữ liệu.
        item['phongban_id'] = map_nhan_vien_phong_ban.get(nhanvien_id)

        # Lấy metadata ca làm đã gom sẵn theo calamviec_id.
        shift_meta = map_ca_lam.get(calamviec_id, {})
        list_khung_gio = shift_meta.get('list_khung_gio', [])
        item['khunggionghitrua'] = shift_meta.get('khunggionghitrua', [])

        # 4) Xác định khung giờ làm việc tương ứng với "lần chấm" hiện tại của nhân viên.
        idx = row_index_by_emp[nhanvien_id]
        khung_gio_lam_viec = _resolve_khung_gio_lam_viec(item, list_khung_gio, idx)
        if khung_gio_lam_viec is None:
            # Dữ liệu ca thiếu hoặc index không hợp lệ thì bỏ qua bản ghi này,
            # nhưng vẫn tăng index để giữ đúng nhịp bản ghi theo nhân viên.
            row_index_by_emp[nhanvien_id] += 1
            continue

        item['khunggiolamviec'] = khung_gio_lam_viec

        # Bô sung thêm thông tin nghỉ trưa giữa các khung giờ nếu ca có nhiều khung và chỉ chấm 1 lần.
        _bo_sung_nghi_trua_giua_cac_khung_gio(item, list_khung_gio)

        # Sau mỗi bản ghi xử lý xong thì tăng chỉ số lần chấm cho nhân viên đó.
        row_index_by_emp[nhanvien_id] += 1

        # 5) Chuẩn hóa dữ liệu trả về để frontend dùng trực tiếp.
        item['sophutot'] = item.get('thoigianlamthem') or 0
        item['ngaylamviec'] = ngay_lam_viec.isoformat()
        item['thoigianchamcongvao'] = serialize_time_value(item.get('thoigianchamcongvao'))
        item['thoigianchamcongra'] = serialize_time_value(item.get('thoigianchamcongra'))

        # Parse JSON tham số tính lương nếu dữ liệu trong DB đang lưu dưới dạng string.
        thamsotinhluong = item.get('thamsotinhluong')
        if isinstance(thamsotinhluong, str):
            try:
                item['thamsotinhluong'] = loads(thamsotinhluong)
            except Exception:
                # Nếu JSON lỗi định dạng thì giữ nguyên giá trị gốc để tránh làm hỏng response.
                pass

        final_data.append(item)

    # Danh sách cuối cùng đã đủ thông tin để render form update chấm công.
    return final_data

def build_cham_cong_data_by_status(ngay_lam_viec, da_cham_cong=False, mode='create'):
    """
    Gom dữ liệu chấm công theo trạng thái đã/ chưa chấm công.
    da_cham_cong=True  -> Lấy danh sách đã chấm đủ số lần.
    da_cham_cong=False -> Lấy danh sách còn thiếu số lần chấm công.
    mode='update'      -> Không lọc theo trạng thái đã/chưa chấm, trả về toàn bộ theo ngày.
    """

    normalized_mode = (mode or 'create').lower()
    if normalized_mode == 'update':
        return build_cham_cong_data_for_update(ngay_lam_viec)

    is_da_cham_cong = str(da_cham_cong).lower() == 'true'

    # Subquery: Đếm số lần nhân viên đã chấm công trong ngày
    sq_dem_so_lan_cham_cong = Bangchamcong.objects.filter(
        ngaylamviec=ngay_lam_viec,
        nhanvien=OuterRef('nhanvien_id'),
        calamviec=OuterRef('calamviec_id')
    ).values('nhanvien', 'calamviec').annotate(
        cnt=Count('id')
    ).values('cnt')

    # Nếu đã có ít nhất một bản ghi codilam=False cho đúng ca thì coi như ca đó đã được xử lý theo chế độ nghỉ.
    sq_ton_tai_ban_ghi_nghi = Bangchamcong.objects.filter(
        ngaylamviec=ngay_lam_viec,
        nhanvien=OuterRef('nhanvien_id'),
        calamviec=OuterRef('calamviec_id'),
        codilam=False
    )

    # Base Query nhẹ để lọc đúng 1 ca làm việc cho mỗi nhân viên trước.
    qs_lich_lam_viec_base = Lichlamviecthucte.objects.filter(
        ngaylamviec=ngay_lam_viec,
        calamviec__isnull=False
    ).annotate(
        # Gắn số lần đã chấm công vào mỗi dòng
        total_cham_cong=Coalesce(Subquery(sq_dem_so_lan_cham_cong, output_field=IntegerField()), 0),
        has_leave_record=Exists(sq_ton_tai_ban_ghi_nghi),
        solanchamcongtrongngay=F('calamviec__solanchamcongtrongngay')
    )

    # Lọc và sắp xếp để ưu tiên lấy đúng ca đã chấm công đủ số lần (nếu da_cham_cong=True) hoặc chưa đủ số lần (nếu da_cham_cong=False).
    if is_da_cham_cong:
        qs_lich_lam_viec_base = qs_lich_lam_viec_base.filter(
            Q(has_leave_record=True) | Q(total_cham_cong__gte=F('solanchamcongtrongngay'))
        )
        order_by_fields = ['nhanvien_id', '-total_cham_cong', '-id']
    else:
        qs_lich_lam_viec_base = qs_lich_lam_viec_base.filter(
            has_leave_record=False,
            total_cham_cong__lt=F('solanchamcongtrongngay')
        )
        order_by_fields = ['nhanvien_id', '-total_cham_cong', 'id']

    # Chỉ lấy 1 ca ưu tiên cho mỗi nhân viên ngay trong DB.
    sq_selected_shift_ids = qs_lich_lam_viec_base.order_by(*order_by_fields).distinct('nhanvien_id').values('id')

    # Sau khi đã rút gọn dữ liệu, mới build các annotation nặng (JSONBAgg).
    qs_lich_lam_viec = qs_lich_lam_viec_base.filter(
        id__in=Subquery(sq_selected_shift_ids)
    ).annotate(
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

    qs_lich_lam_viec = qs_lich_lam_viec.values(
        "id", "nhanvien_id", "calamviec_id", "cophaingaynghi",
        "total_cham_cong", "solanchamcongtrongngay", "sokhunggiotrongca", "cocancheckout", "loaicalamviec", "tongthoigianlamvieccuaca",
        "congtongcuaca", "list_khung_gio_json",
        hovaten=F('nhanvien__hovaten'),
        manhanvien=F('nhanvien__manhanvien'),
        phuongthuctinhluong=F('nhanvien__loainv__phuongthuctinhluong')
    ).order_by('nhanvien_id')

    # Chuyển QuerySet thành List để xử lý Python
    ds_lich_raw = list(qs_lich_lam_viec)
    if not ds_lich_raw:
        return []

    # Lấy danh sách ID duy nhất
    list_nhanvien_id = [item['nhanvien_id'] for item in ds_lich_raw]
    set_calamviec_id = {item['calamviec_id'] for item in ds_lich_raw}

    map_nhan_vien_phong_ban = _get_department_map(list_nhanvien_id)
    map_ca_lam = _get_calamviec_meta(set_calamviec_id, include_khung_gio=False)

    # Mỗi dòng lịch làm việc thực tế tương ứng một ca cần xử lý độc lập.
    final_data_list = []

    for item in ds_lich_raw:
        item['phongban_id'] = map_nhan_vien_phong_ban.get(item['nhanvien_id'])
        item['khunggionghitrua'] = map_ca_lam.get(item['calamviec_id'], {}).get('khunggionghitrua', [])

        list_khung_gio = item.pop('list_khung_gio_json', [])
        if not list_khung_gio:
            continue

        # Xác định khung giờ cần lấy (Index dựa trên số lần chấm công)
        idx_lan_cham = item['total_cham_cong']
        if is_da_cham_cong:
            # Nếu đang xem danh sách ĐÃ chấm: Lấy lại thông tin của lần chấm gần nhất (lùi 1 index)
            idx_lan_cham = max(0, min(idx_lan_cham - 1, len(list_khung_gio) - 1))

        item['khunggiolamviec'] = _resolve_khung_gio_lam_viec(item, list_khung_gio, idx_lan_cham)
        if item['khunggiolamviec'] is None:
            continue
        
        # Bổ sung tự động khung giờ nghỉ trưa nếu ca có nhiều khung giờ nhưng chỉ chấm công 1 lần
        _bo_sung_nghi_trua_giua_cac_khung_gio(item, list_khung_gio)

        item['da_cham_cong'] = is_da_cham_cong
        item['lichlamviecthucte_id'] = item.pop('id', None)
        final_data_list.append(item)

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
@require_view_permission('access_control.view_cham_cong')
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
@require_view_permission('access_control.view_cham_cong')
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
@require_api_permission('access_control.write_cham_cong')
@require_http_methods(["POST", "PUT"])
@transaction.atomic
def api_bang_cham_cong_list(request):
    """API thêm mới/cập nhật dữ liệu bảng chấm công dưới dạng JSON"""

    try:
        data_list = loads(request.body)
        if not isinstance(data_list, list) or len(data_list) == 0:
            return JsonResponse({'success': False, 'message': 'Dữ liệu đầu vào không hợp lệ'}, status=400)

        ngay_lam_viec_set = set()
        nhan_vien_set = set()
        for item in data_list:
            ngay_raw = item.get('ngaylamviec')
            nhanvien_id = item.get('nhanvien_id')
            if not ngay_raw or not nhanvien_id:
                return JsonResponse({'success': False, 'message': 'Thiếu thông tin ngày làm việc hoặc nhân viên'}, status=400)
            ngay_lam_viec_set.add(dt.date.fromisoformat(ngay_raw))
            nhan_vien_set.add(nhanvien_id)

        if request.method == 'POST':
            # hom_nay = timezone.localdate()
            # ngay_vi_pham = [ngay for ngay in ngay_lam_viec_set if abs((hom_nay - ngay).days) > 7]
            # if ngay_vi_pham:
            #     return JsonResponse({
            #         'success': False,
            #         'message': 'Không thể chấm công: ngày cần sửa đã vượt quá thời hạn 7 ngày cho phép.'
            #     }, status=400)

            objs_bang_cham_cong = calculate_bang_cham_cong_objects(data_list)
            # Bangchamcong.objects.bulk_create(objs_bang_cham_cong)

            return JsonResponse({
                'success': True,
                'message': 'Chấm công thành công',
                'data': [model_to_dict(obj) for obj in objs_bang_cham_cong],
            }, status=201)

        if request.method == 'PUT':
            objs_bang_cham_cong = calculate_bang_cham_cong_objects(data_list)
            
            Bangchamcong.objects.filter(nhanvien_id__in=nhan_vien_set, ngaylamviec__in=ngay_lam_viec_set).delete()
            Bangchamcong.objects.bulk_create(objs_bang_cham_cong)

            return JsonResponse({
                'success': True,
                'message': 'Cập nhật chấm công thành công',
                'data': [model_to_dict(obj) for obj in objs_bang_cham_cong],
            }, status=200)

        return JsonResponse({'success': False, 'message': 'Phương thức không được phép'}, status=405)

    except Exception as e:
        return JsonResponse({'success': False, 'message': f'Lỗi: {str(e)}'}, status=400)


@login_required
@require_api_permission('access_control.view_cham_cong')
@require_http_methods(["GET"])
def api_bang_cham_cong_nhan_vien_list(request):
    # Xử lý đầu vào
    try:
        ngay_lam_viec = dt.date.fromisoformat(request.GET.get("ngaylamviec"))
    except (ValueError, TypeError):
        return JsonResponse({'success': False, 'message': 'Ngày không hợp lệ'}, status=400)

    mode = (request.GET.get('mode', 'create') or 'create').lower()
    if mode not in {'update', 'create', 'new'}:
        return JsonResponse({'success': False, 'message': 'Giá trị mode không hợp lệ (update/create/new)'}, status=400)

    if mode == 'update':
        data = build_cham_cong_data_by_status(ngay_lam_viec, mode='update')
    else:
        data = build_cham_cong_data_by_status(ngay_lam_viec, da_cham_cong=False, mode='create')

    return JsonResponse({'success': True, 'data': data}, status=200)


@login_required
@require_api_permission('access_control.view_cham_cong')
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
    map_cc = defaultdict(lambda: {'tong_gio': 0, 'tong_cong': 0, 'logs': defaultdict(list), 'loai_chamcong': ''}) # {nhanvien_id: {'tong_gio': int, 'logs': {ngay: [log_entries], 'loai_chamcong': str}}}

    for cc in ds_cham_cong:
        nv_id = cc['nhanvien_id']
        tg_lam = round(float((cc['thoigianlamviec'] + (cc['thoigianvemuon'] or 0) + (cc['thoigiandisom'] or 0))/60 or 0),1)
        ngay_str = f"{cc['ngaylamviec'].day:02d}"
        
        # Cộng dồn tổng giờ
        map_cc[nv_id]['tong_gio'] += tg_lam
        map_cc[nv_id]['tong_cong'] += cc['conglamviec'] or 0

        # Format dữ liệu từng dòng log
        tg_vao = cc['thoigianchamcongvao']
        tg_ra = cc['thoigianchamcongra']
        
        log_entry = {
            'tg_vao': tg_vao.strftime("%H:%M") if tg_vao else '',
            'tg_ra': tg_ra.strftime("%H:%M") if tg_ra else '',
            'tg_lamviec': tg_lam,
            'codimuon': (cc['thoigiandimuon'] or 0) > 0,
            'covesom': (cc['thoigianvesom'] or 0) > 0,
            'thoigiandimuon': cc['thoigiandimuon'],
            'thoigianvesom': cc['thoigianvesom'],
            'conglamviec': cc['conglamviec'],
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
            nv['tongconglamviec'] = data_cc['tong_cong']
            nv['loai_chamcong'] = data_cc['loai_chamcong']
        else:
            nv['logs'] = {}
            nv['tongthoigianlamviec'] = 0
            nv['tongconglamviec'] = 0
            nv['loai_chamcong'] = ''
        
        if loai_cham_cong == 'all' or loai_cham_cong == nv['loai_chamcong']:
            merge_ds_nv.append(nv)

    return JsonResponse({'success': True, 'data': merge_ds_nv, 'total': len(merge_ds_nv)}, status=200)


@login_required
@require_api_permission('access_control.view_cham_cong')
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

@login_required
@require_view_permission('access_control.view_don_bao')
def view_don_bao(request):
    return render(request, "hrm_manager/cham_cong/don_bao.html", {})

@login_required
@require_view_permission('access_control.view_cham_cong')
def view_bao_cao(request):
    return render(request, "hrm_manager/cham_cong/bao_cao.html", {})