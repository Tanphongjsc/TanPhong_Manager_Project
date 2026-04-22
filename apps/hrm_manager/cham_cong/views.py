from django.forms import model_to_dict
from django.shortcuts import render
from django.urls import reverse
from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
from django.db.models import CharField, F, Value, Func, Count, OuterRef, Subquery, IntegerField, Q, Exists, Min, Max
from django.db.models.functions import Cast, Coalesce
from django.db import transaction
from django.contrib.postgres.aggregates import JSONBAgg

from json import loads, dumps
import datetime as dt
from collections import defaultdict

from apps.hrm_manager.__core__.models import Bangchamcong, Khunggionghitrua, Phongban, Lichlamviecthucte, Calamviec, Lichsucongtac
from apps.hrm_manager.cham_cong.services import PayrollCalculator
from apps.hrm_manager.utils.permissions import require_api_permission, require_view_permission
from apps.hrm_manager.utils.view_helpers import (
    diff_minutes, parse_time_to_minutes, parse_minutes_to_time,
    calculate_work_minutes_with_overnight, tinh_phut_nghi_trua_trong_khoang,
    serialize_time_value, json_error, json_success, handle_exceptions, get_request_data
)
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


def _parse_salary_config(raw_value):
    """Parse cấu hình lương từ string/dict → dict (fallback {})"""
    if isinstance(raw_value, dict):
        return raw_value
    if isinstance(raw_value, str):
        try:
            parsed = loads(raw_value)
            return parsed if isinstance(parsed, dict) else {}
        except Exception:
            return {}
    return {}


def _normalize_job_id(job_id):
    """Chuẩn hóa job_id → int hoặc None"""
    if job_id in (None, ''):
        return None
    try:
        return int(job_id)
    except (TypeError, ValueError):
        return job_id


def _build_payload_rows_from_saved_record(record):
    """
    Tạo danh sách payload rows từ 1 bản ghi đã lưu.
    Dùng khi expand data cho team jobs (update mode).
    """
    ngay_lam_viec = record.get('ngaylamviec')
    if isinstance(ngay_lam_viec, dt.date):
        ngay_lam_viec = ngay_lam_viec.isoformat()

    base = {
        'id': record.get('id'),
        'nhanvien_id': record.get('nhanvien_id'),
        'ngaylamviec': ngay_lam_viec,
        'thoigianchamcongvao': record.get('thoigianchamcongvao'),
        'thoigianchamcongra': record.get('thoigianchamcongra'),
        'cotinhlamthem': record.get('cotinhlamthem', False),
        'coantrua': record.get('coantrua', False),
        'loaicalamviec': record.get('loaicalamviec', 'CO_DINH'),
        'cophaingaynghi': record.get('cophaingaynghi', False),
        'codilam': record.get('codilam', False),
        'calamviec_id': record.get('calamviec_id'),
        'khunggionghitrua': list(record.get('khunggionghitrua') or []),
        'khunggiolamviec': dict(record.get('khunggiolamviec') or {}),
        'cocancheckout': record.get('cocancheckout', True),
        'sophutot': record.get('thoigianlamthem') or record.get('sophutot') or 0,
        'tongthoigianlamvieccuaca': record.get('tongthoigianlamvieccuaca') or 0,
        'phuongthuctinhluong': record.get('phuongthuctinhluong') or 'daily',
        'ghichu': record.get('ghichu') or '',
    }

    # Nghỉ phép → 1 row đơn giản
    if base['codilam'] is False:
        return [{**base, 'loaichamcong': record.get('loaichamcong') or 'VP',
                 'congviec_id': None, 'tencongviec': record.get('tencongviec') or 'Nghỉ phép', 'thamsotinhluong': {}}]

    # Parse details từ cấu hình lương
    salary_cfg = _parse_salary_config(record.get('thamsotinhluong'))
    details = [d for d in (salary_cfg.get('details') or []) if isinstance(d, dict) and d.get('congviec_id') is not None]
    phuong_thuc = str(base['phuongthuctinhluong']).lower()

    rows = []
    # Monthly (VP) → thêm 1 row hành chính trước
    if phuong_thuc == 'monthly':
        rows.append({**base, 'loaichamcong': 'VP', 'congviec_id': None, 'tencongviec': 'Hành chính', 'thamsotinhluong': {}})

    # Thêm rows cho từng detail công việc
    for detail in details:
        rows.append({
            **base,
            'loaichamcong': 'SX' if phuong_thuc == 'monthly' else (record.get('loaichamcong') or 'SX'),
            'pay_role': detail.get('pay_role'),
            'congviec_id': detail.get('congviec_id'),
            'tencongviec': detail.get('tencongviec') or '',
            'thamsotinhluong': detail.get('thamsotinhluong') or {},
        })

    # Fallback nếu không có detail nào
    if not rows:
        rows.append({
            **base,
            'loaichamcong': record.get('loaichamcong') or ('VP' if phuong_thuc == 'monthly' else 'SX'),
            'congviec_id': None if phuong_thuc == 'monthly' else record.get('congviec_id'),
            'tencongviec': 'Hành chính' if phuong_thuc == 'monthly' else (record.get('tencongviec') or ''),
            'thamsotinhluong': {},
        })
    return rows


def _expand_update_payload_for_team_jobs(data_list, ngay_lam_viec_set):
    """Mở rộng payload khi update: thêm các nhân viên cùng team job chưa có trong payload."""
    team_job_ids = {
        _normalize_job_id(item.get('congviec_id'))
        for item in data_list
        if _normalize_job_id(item.get('congviec_id')) is not None
        and _parse_salary_config(item.get('thamsotinhluong')).get('loaicv') == 'nhom'
    }
    if not team_job_ids or not ngay_lam_viec_set:
        return data_list

    expanded = list(data_list)
    existing_ids = {item.get('id') for item in data_list if item.get('id') is not None}

    for ngay in ngay_lam_viec_set:
        for record in build_cham_cong_data_for_update(ngay):
            if record.get('id') in existing_ids:
                continue
            # Kiểm tra record có chứa team job liên quan không
            details = _parse_salary_config(record.get('thamsotinhluong')).get('details') or []
            has_related = any(
                isinstance(d, dict)
                and _normalize_job_id(d.get('congviec_id')) in team_job_ids
                and _parse_salary_config(d.get('thamsotinhluong')).get('loaicv') == 'nhom'
                for d in details
            )
            if has_related:
                expanded.extend(_build_payload_rows_from_saved_record(record))
                if record.get('id') is not None:
                    existing_ids.add(record['id'])

    return expanded


def tinh_luong_cham_cong(data_list):
    """
    Tính lương chấm công: gom nhóm theo loại công việc (cá nhân/nhóm),
    sau đó delegate cho PayrollCalculator.
    """
    groups = {}
    for item in data_list:
        # Parse config tính lương
        config = loads(item['thamsotinhluong']) if isinstance(item['thamsotinhluong'], str) else item['thamsotinhluong']
        item['tham_so'] = config.get('tham_so', {})
        item['bieu_thuc'] = config.get('bieu_thuc', '')
        loaicv = config.get('loaicv', 'canhan')

        # Key: nhóm theo team hoặc cá nhân
        key = f"TEAM_{item.get('congviec_id')}" if loaicv == 'nhom' else f"INDIVIDUAL_{item['nhanvien_id']}"
        groups.setdefault(key, []).append(item)

    return PayrollCalculator(groups).calculate_all(field_formula='bieu_thuc', field_params='tham_so', field_id='nhanvien_id')


def _tinh_time_deviation(khung_gio, tg_vao, tg_ra, loai_calamviec, item, in_min, out_min, start_min, end_min,
                          tg_lam_viec_thuc, tg_lam_viec_chuan_ca, ds_nghi_trua):
    """
    Tính toán sai lệch giờ vào/ra (đi muộn, về sớm, đi sớm, về muộn)
    theo từng loại ca: CO_DINH, LINH_DONG, TU_DO.
    Returns: (thoigiandimuon, thoigianvesom, thoigiandisom, thoigianvemuon, tg_lam_viec)
    """
    thoigiandimuon = thoigianvesom = thoigiandisom = thoigianvemuon = 0

    # Sai lệch giờ vào (dương: đi muộn, âm: đi sớm)
    khoang_vao = diff_minutes(khung_gio.get("thoigianbatdau"), tg_vao)

    # Trừ nghỉ trưa nếu đi muộn cắt qua giờ nghỉ
    if khoang_vao > 0:
        khoang_vao -= tinh_phut_nghi_trua_trong_khoang(start_min, in_min, ds_nghi_trua)

    if loai_calamviec == "CO_DINH":
        # So sánh với ngưỡng cho phép
        limit_muon = khung_gio.get("thoigianchophepdenmuon", 0)
        limit_som = khung_gio.get("thoigianchophepvesomnhat", 0)

        if khoang_vao > limit_muon:
            thoigiandimuon = khoang_vao
        elif khoang_vao < 0:
            thoigiandisom = abs(khoang_vao)

        khoang_ra = diff_minutes(tg_ra, khung_gio.get("thoigianketthuc"))
        if khoang_ra > 0:
            khoang_ra -= tinh_phut_nghi_trua_trong_khoang(out_min, end_min, ds_nghi_trua)
        if khoang_ra > limit_som:
            thoigianvesom = khoang_ra
        elif khoang_ra < 0:
            thoigianvemuon = abs(khoang_ra)

        tg_lam_viec = tg_lam_viec_chuan_ca - thoigiandimuon - thoigianvesom

    elif loai_calamviec == "LINH_DONG":
        # Kiểm tra biên độ linh động
        phut_muon_cho_phep = khung_gio.get("sophutdenmuon", 0)
        phut_som_cho_phep = khung_gio.get("sophutdensom", 0)
        is_hop_le = (0 < khoang_vao <= phut_muon_cho_phep) or (khoang_vao < 0 and abs(khoang_vao) <= phut_som_cho_phep)

        if is_hop_le:
            # Dời giờ kết thúc tương ứng
            khung_gio['thoigianketthuc'] = parse_minutes_to_time(
                parse_time_to_minutes(khung_gio.get("thoigianketthuc")) + khoang_vao
            )
        else:
            if khoang_vao > phut_muon_cho_phep:
                thoigiandimuon = khoang_vao
            elif khoang_vao < 0:
                thoigiandisom = abs(khoang_vao)

        khoang_ra = diff_minutes(tg_ra, khung_gio.get("thoigianketthuc"))
        if khoang_ra > 0:
            end_min_hien_tai = parse_time_to_minutes(khung_gio.get("thoigianketthuc"))
            khoang_ra -= tinh_phut_nghi_trua_trong_khoang(out_min, end_min_hien_tai, ds_nghi_trua)
        if khoang_ra > 0:
            thoigianvesom = khoang_ra
        elif khoang_ra < 0:
            thoigianvemuon = abs(khoang_ra)

        tg_lam_viec = tg_lam_viec_chuan_ca - thoigiandimuon - thoigianvesom

    elif loai_calamviec == "TU_DO":
        if khoang_vao < 0:
            thoigiandisom = abs(khoang_vao)
        khoang_ra = diff_minutes(tg_ra, khung_gio.get("thoigianketthuc"))
        if khoang_ra < 0:
            thoigianvemuon = abs(khoang_ra)
        tg_lam_viec = tg_lam_viec_thuc
    else:
        tg_lam_viec = tg_lam_viec_thuc

    return thoigiandimuon, thoigianvesom, thoigiandisom, thoigianvemuon, tg_lam_viec


def calculate_bang_cham_cong_objects(data_list):
    """
    Xử lý và tính toán đầy đủ cho danh sách dữ liệu chấm công.
    Trả về danh sách instance Bangchamcong sẵn sàng bulk_create/save.
    """
    ket_qua_tien = tinh_luong_cham_cong(data_list)
    objs = []

    # Gom theo nhân viên (mỗi NV → 1 record kết quả)
    grouped = {}
    for item in data_list:
        grouped.setdefault(item['nhanvien_id'], []).append(item)

    for nv_id, items in grouped.items():
        if not items:
            continue
        item = items[0]

        phuongthuctinhluong = item.get('phuongthuctinhluong', 'daily')
        ten_cv_list = [s.get('tencongviec', '') for s in items if s.get('tencongviec')]
        combined_ten_cv = ", ".join(dict.fromkeys(ten_cv_list))

        khung_gio = item.get("khunggiolamviec", {}).copy()
        tg_vao = item.get("thoigianchamcongvao")
        tg_ra = item.get("thoigianchamcongra")
        loai_calamviec = item.get("loaicalamviec", "CO_DINH")
        codilam = item.get("codilam", False)

        # Reset biến tích lũy cho từng nhân viên
        thoigiandimuon = thoigianvesom = thoigiandisom = thoigianvemuon = 0
        tg_lam_viec = tg_lam_them = so_cong_thuc_te = 0
        tien_base = tien_extra = tien_ot = tong_tien = 0
        final_thamsotinhluong = {}
        thanhtien_tp = {"tien_base": 0, "tien_ot": 0, "tien_extra": 0}

        if codilam:
            # Ca không cần checkout → mặc định giờ ra = giờ kết thúc
            if not item.get("cocancheckout", True):
                tg_ra = khung_gio.get("thoigianketthuc")
                item['thoigianchamcongra'] = tg_ra

            in_min = parse_time_to_minutes(tg_vao)
            out_min = parse_time_to_minutes(tg_ra)
            start_min = parse_time_to_minutes(khung_gio.get("thoigianbatdau"))
            end_min = parse_time_to_minutes(khung_gio.get("thoigianketthuc"))
            ds_nghi_trua = item.get('khunggionghitrua', [])
            print(ds_nghi_trua)

            # Tính thời gian làm việc thực tế và chuẩn
            tg_lam_viec_thuc = calculate_work_minutes_with_overnight(in_min, out_min, start_min, end_min)
            tg_lam_viec_chuan_ca = calculate_work_minutes_with_overnight(start_min, end_min, start_min, end_min)

            # Trừ nghỉ trưa
            tg_lam_viec_thuc -= tinh_phut_nghi_trua_trong_khoang(in_min, out_min, ds_nghi_trua)
            tg_lam_viec_chuan_ca -= tinh_phut_nghi_trua_trong_khoang(start_min, end_min, ds_nghi_trua)

            # Tính sai lệch giờ theo loại ca
            thoigiandimuon, thoigianvesom, thoigiandisom, thoigianvemuon, tg_lam_viec = _tinh_time_deviation(
                khung_gio, tg_vao, tg_ra, loai_calamviec, item,
                in_min, out_min, start_min, end_min,
                tg_lam_viec_thuc, tg_lam_viec_chuan_ca, ds_nghi_trua
            )

            # OT: chỉ tính khi có cấu hình và có về muộn
            if item.get('cotinhlamthem', False) and thoigianvemuon > 0:
                tg_lam_them = item.get("sophutot", 0)

            # Vi phạm ngưỡng nặng → 0 công
            limit_vesom_0 = khung_gio.get("thoigianvesomkhongtinhchamcong", 0)
            limit_dimuon_0 = khung_gio.get("thoigiandimuonkhongtinhchamcong", 0)
            if (limit_vesom_0 > 0 and thoigianvesom > limit_vesom_0) or \
               (limit_dimuon_0 > 0 and thoigiandimuon > limit_dimuon_0):
                tg_lam_viec = 0

            # Không đạt ngưỡng phút tối thiểu → 0 công
            if tg_lam_viec < khung_gio.get("thoigianlamviectoithieu", 0):
                tg_lam_viec = 0

            # Quy đổi phút → số công
            so_cong_chuan = khung_gio.get("congcuakhunggio", 0) or 0
            if tg_lam_viec_chuan_ca > 0 and so_cong_chuan > 0:
                so_cong_thuc_te = min(round((tg_lam_viec / tg_lam_viec_chuan_ca) * so_cong_chuan, 2), so_cong_chuan)

            # Tính tiền theo phương thức
            if phuongthuctinhluong == 'daily':
                tien_base = ket_qua_tien.get(nv_id, 0)
                if tg_lam_them > 0:
                    don_gia_phut = tien_base / tg_lam_viec_thuc if tg_lam_viec_thuc > 0 else 0
                    tien_ot = don_gia_phut * tg_lam_them * 0.5
            elif phuongthuctinhluong == 'monthly':
                tien_extra = ket_qua_tien.get(nv_id, 0)

            tong_tien = tien_base + tien_ot + tien_extra
            if tg_lam_viec == 0 and tg_lam_them == 0 and tien_extra == 0:
                tong_tien = 0

            thanhtien_tp = {"tien_base": tien_base, "tien_ot": tien_ot, "tien_extra": tien_extra}

            # Build tham số tính lương (chỉ giữ details có congviec_id)
            valid_details = [
                {'congviec_id': s.get('congviec_id'), 'tencongviec': s.get('tencongviec'),
                 'thamsotinhluong': s.get('thamsotinhluong'), 'pay_role': s.get('pay_role')}
                for s in items if s.get('congviec_id') is not None
            ]
            final_thamsotinhluong = {
                'mode': 'multi_task' if len(valid_details) > 1 else 'single_task',
                'details': valid_details
            }

        # Tạo object Bangchamcong
        objs.append(Bangchamcong(
            id=item.get('id') or None,
            created_at=timezone.now(),
            thoigianchamcongvao=tg_vao,
            thoigianchamcongra=tg_ra,
            conglamviec=max(0, so_cong_thuc_te),
            thoigianlamviec=max(0, tg_lam_viec),
            ngaylamviec=dt.date.fromisoformat(item['ngaylamviec']),
            thoigianlamthem=tg_lam_them,
            cotinhlamthem=item.get('cotinhlamthem', False),
            coantrua=item.get('coantrua', False),
            codilam=codilam,
            thoigiandimuon=thoigiandimuon,
            thoigianvesom=thoigianvesom,
            thoigiandisom=thoigiandisom,
            thoigianvemuon=thoigianvemuon,
            loaichamcong=item.get('loaichamcong', ''),
            tencongviec=combined_ten_cv or item.get('tencongviec', ''),
            cophaingaynghi=item.get('cophaingaynghi', False),
            thamsotinhluong=dumps(final_thamsotinhluong if isinstance(final_thamsotinhluong, dict) else _parse_salary_config(final_thamsotinhluong)),
            thanhtien=tong_tien if codilam else 0,
            thanhtienthanhphan=dumps(thanhtien_tp if isinstance(thanhtien_tp, dict) else {}),
            ghichu=item.get('ghichu', ''),
            congviec_id=item.get('congviec_id'),
            nhanvien_id=nv_id,
            calamviec_id=item.get('calamviec_id', None)
        ))

    return objs


# ============================================================
# DATA HELPERS: Ca làm việc & Khung giờ
# ============================================================

# Danh sách fields cho JSONBAgg khung giờ (dùng chung cho create & update)
_KHUNG_GIO_FIELDS = [
    ('congcuakhunggio', None),
    ('thoigianbatdau', 'cast'), ('thoigianketthuc', 'cast'),
    ('thoigianchophepchamcongsomnhat', 'cast'), ('thoigianchophepvemuonnhat', 'cast'),
    ('thoigianchophepdenmuon', None),
    ('thoigiandimuonkhongtinhchamcong', None),
    ('thoigianchophepvesomnhat', None),
    ('thoigianvesomkhongtinhchamcong', None),
    ('thoigianlamviectoithieu', None),
    ('sophutdenmuon', None), ('sophutdensom', None),
]


def _build_khung_gio_jsonb_agg(field_prefix=''):
    """Tạo JSONBAgg annotation cho khung giờ (có thể prefix cho nested relation)."""
    args = []
    for field_name, cast_type in _KHUNG_GIO_FIELDS:
        full_field = f'{field_prefix}{field_name}' if field_prefix else field_name
        args.append(Value(field_name))
        args.append(Cast(full_field, CharField()) if cast_type == 'cast' else F(full_field))
    return JSONBAgg(Func(*args, function='jsonb_build_object'), ordering=f'{field_prefix}created_at')


def _get_department_map(nhanvien_ids):
    """Map nhân viên → phòng ban hiện tại"""
    if not nhanvien_ids:
        return {}
    qs = Lichsucongtac.objects.filter(nhanvien_id__in=nhanvien_ids, trangthai="active").values('nhanvien_id', 'phongban_id')
    return {p['nhanvien_id']: p['phongban_id'] for p in qs}


def _get_calamviec_meta(calamviec_ids, include_khung_gio=False):
    """Lấy metadata ca làm (nghỉ trưa + khung giờ nếu cần)"""
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
        annotations['list_khung_gio_json'] = _build_khung_gio_jsonb_agg('khunggiolamviec__')

    qs = Calamviec.objects.filter(id__in=calamviec_ids).values('id').annotate(**annotations)
    return {
        c['id']: {
            'khunggionghitrua': c.get('json_nghitrua') or [],
            'list_khung_gio': c.get('list_khung_gio_json') or []
        }
        for c in qs
    }


def _build_merged_khung_gio(item, list_khung_gio):
    """Gộp nhiều khung giờ → 1 khung khi ca chỉ chấm công 1 lần."""
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
    """Chọn khung giờ cho 1 bản ghi: ưu tiên gộp, fallback theo index."""
    merged = _build_merged_khung_gio(item, list_khung_gio)
    if merged is not None:
        return merged
    if 0 <= idx_lan_cham < len(list_khung_gio):
        return list_khung_gio[idx_lan_cham]
    return None


def _bo_sung_nghi_trua_giua_cac_khung_gio(item, list_khung_gio):
    """Tự động thêm giờ nghỉ trưa = khoảng trống giữa các khung giờ (ca nhiều khung, chấm 1 lần)."""
    if item.get('sokhunggiotrongca', 0) <= 1 or item.get('solanchamcongtrongngay', 0) != 1:
        return
    sorted_kg = sorted([k for k in list_khung_gio if k.get('thoigianbatdau')], key=lambda x: str(x['thoigianbatdau']))
    for f, s in zip(sorted_kg, sorted_kg[1:]):
        t_end, t_start = f.get('thoigianketthuc'), s.get('thoigianbatdau')
        if t_end and t_start:
            nghi_trua = {'giobatdau': t_end, 'gioketthuc': t_start}
            if nghi_trua not in item.setdefault('khunggionghitrua', []):
                item['khunggionghitrua'].append(nghi_trua)


def _get_shifts_for_date(ngay_lam_viec, source='schedule'):
    """Lấy DS ca trong ngày. source='schedule' (lịch LV) | 'attendance' (đã chấm)."""
    Model = Lichlamviecthucte if source == 'schedule' else Bangchamcong
    # Query 1 lần: gom ca + đếm NV + lấy khung giờ qua ORM join
    qs = Model.objects.filter(
        ngaylamviec=ngay_lam_viec, calamviec__isnull=False
    ).values(
        'calamviec_id', tencalamviec=F('calamviec__tencalamviec'),
    ).annotate(
        so_nhan_vien=Count('nhanvien_id', distinct=True),
        gio_bat_dau=Min('calamviec__khunggiolamviec__thoigianbatdau'),
        gio_ket_thuc=Max('calamviec__khunggiolamviec__thoigianketthuc'),
    ).order_by('calamviec_id')
    # Serialize time values cho JSON response
    return [{
        **s,
        'gio_bat_dau': serialize_time_value(s['gio_bat_dau']),
        'gio_ket_thuc': serialize_time_value(s['gio_ket_thuc']),
    } for s in qs]



# ============================================================
# DATA BUILDERS: Chấm công theo ngày
# ============================================================

def build_cham_cong_data_for_update(ngay_lam_viec, calamviec_id=None):
    """Lấy dữ liệu chấm công đã lưu cho mode update."""
    # Query chấm công + join metadata nhân viên/ca
    qs = Bangchamcong.objects.filter(ngaylamviec=ngay_lam_viec)
    if calamviec_id:
        qs = qs.filter(calamviec_id=calamviec_id)
    qs = qs.annotate(
        hovaten=F('nhanvien__hovaten'), manhanvien=F('nhanvien__manhanvien'),
        loainv=F('nhanvien__loainv__id'), phuongthuctinhluong=F('nhanvien__loainv__phuongthuctinhluong'),
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

    ds = list(qs)
    if not ds:
        return []

    # Batch load metadata phụ trợ
    nv_ids = list({item['nhanvien_id'] for item in ds})
    ca_ids = {item['calamviec_id'] for item in ds if item.get('calamviec_id')}
    map_pb = _get_department_map(nv_ids)
    map_ca = _get_calamviec_meta(ca_ids, include_khung_gio=True)

    # Xử lý từng bản ghi
    row_idx_by_emp = defaultdict(int)
    result = []
    for item in ds:
        nv_id = item['nhanvien_id']
        item['phongban_id'] = map_pb.get(nv_id)

        shift_meta = map_ca.get(item.get('calamviec_id'), {})
        list_kg = shift_meta.get('list_khung_gio', [])
        item['khunggionghitrua'] = shift_meta.get('khunggionghitrua', [])

        # Xác định khung giờ theo index lần chấm
        idx = row_idx_by_emp[nv_id]
        item['khunggiolamviec'] = _resolve_khung_gio_lam_viec(item, list_kg, idx)
        row_idx_by_emp[nv_id] += 1
        if item['khunggiolamviec'] is None:
            continue

        _bo_sung_nghi_trua_giua_cac_khung_gio(item, list_kg)

        # Chuẩn hóa output
        item['sophutot'] = item.get('thoigianlamthem') or 0
        item['ngaylamviec'] = ngay_lam_viec.isoformat()
        item['thoigianchamcongvao'] = serialize_time_value(item.get('thoigianchamcongvao'))
        item['thoigianchamcongra'] = serialize_time_value(item.get('thoigianchamcongra'))

        # Parse JSON thamsotinhluong
        tsl = item.get('thamsotinhluong')
        if isinstance(tsl, str):
            try:
                item['thamsotinhluong'] = loads(tsl)
            except Exception:
                pass

        result.append(item)

    return result


def build_cham_cong_data_by_status(ngay_lam_viec, da_cham_cong=False, mode='create', calamviec_id=None):
    """
    Gom dữ liệu chấm công theo trạng thái:
    - mode='update' → delegate sang build_cham_cong_data_for_update
    - da_cham_cong=True → đã chấm đủ số lần
    - da_cham_cong=False → còn thiếu
    """
    if (mode or 'create').lower() == 'update':
        return build_cham_cong_data_for_update(ngay_lam_viec, calamviec_id=calamviec_id)

    is_da_cham = str(da_cham_cong).lower() == 'true'

    # Subquery: đếm số lần NV đã chấm công trong ngày
    sq_count = Bangchamcong.objects.filter(
        ngaylamviec=ngay_lam_viec, nhanvien=OuterRef('nhanvien_id'), calamviec=OuterRef('calamviec_id')
    ).values('nhanvien', 'calamviec').annotate(cnt=Count('id')).values('cnt')

    # Subquery: tồn tại bản ghi nghỉ
    sq_leave = Bangchamcong.objects.filter(
        ngaylamviec=ngay_lam_viec, nhanvien=OuterRef('nhanvien_id'),
        calamviec=OuterRef('calamviec_id'), codilam=False
    )

    # Base query lịch làm việc thực tế
    qs_base = Lichlamviecthucte.objects.filter(
        ngaylamviec=ngay_lam_viec, calamviec__isnull=False
    )
    if calamviec_id:
        qs_base = qs_base.filter(calamviec_id=calamviec_id)
    qs_base = qs_base.annotate(
        total_cham_cong=Coalesce(Subquery(sq_count, output_field=IntegerField()), 0),
        has_leave_record=Exists(sq_leave),
        solanchamcongtrongngay=F('calamviec__solanchamcongtrongngay')
    )

    # Lọc theo trạng thái chấm công
    if is_da_cham:
        qs_base = qs_base.filter(Q(has_leave_record=True) | Q(total_cham_cong__gte=F('solanchamcongtrongngay')))
        order_fields = ['nhanvien_id', '-total_cham_cong', '-id']
    else:
        qs_base = qs_base.filter(has_leave_record=False, total_cham_cong__lt=F('solanchamcongtrongngay'))
        order_fields = ['nhanvien_id', '-total_cham_cong', 'id']

    # Lấy 1 ca ưu tiên cho mỗi NV
    sq_selected = qs_base.order_by(*order_fields).distinct('nhanvien_id').values('id')

    # Annotate nặng (JSONBAgg) chỉ trên tập đã lọc
    qs = qs_base.filter(id__in=Subquery(sq_selected)).annotate(
        sokhunggiotrongca=F('calamviec__sokhunggiotrongca'),
        cocancheckout=F('calamviec__cocancheckout'),
        loaicalamviec=F('calamviec__loaichamcong'),
        tongthoigianlamvieccuaca=F('calamviec__tongthoigianlamvieccuaca'),
        congtongcuaca=F('calamviec__congcuacalamviec'),
        list_khung_gio_json=_build_khung_gio_jsonb_agg('calamviec__khunggiolamviec__')
    ).values(
        "id", "nhanvien_id", "calamviec_id", "cophaingaynghi",
        "total_cham_cong", "solanchamcongtrongngay", "sokhunggiotrongca",
        "cocancheckout", "loaicalamviec", "tongthoigianlamvieccuaca",
        "congtongcuaca", "list_khung_gio_json",
        hovaten=F('nhanvien__hovaten'),
        manhanvien=F('nhanvien__manhanvien'),
        phuongthuctinhluong=F('nhanvien__loainv__phuongthuctinhluong')
    ).order_by('nhanvien_id')

    ds = list(qs)
    if not ds:
        return []

    # Batch load metadata
    nv_ids = [item['nhanvien_id'] for item in ds]
    ca_ids = {item['calamviec_id'] for item in ds}
    map_pb = _get_department_map(nv_ids)
    map_ca = _get_calamviec_meta(ca_ids, include_khung_gio=False)

    result = []
    for item in ds:
        item['phongban_id'] = map_pb.get(item['nhanvien_id'])
        item['khunggionghitrua'] = map_ca.get(item['calamviec_id'], {}).get('khunggionghitrua', [])

        list_kg = item.pop('list_khung_gio_json', [])
        if not list_kg:
            continue

        # Xác định khung giờ theo index
        idx = item['total_cham_cong']
        if is_da_cham:
            idx = max(0, min(idx - 1, len(list_kg) - 1))

        item['khunggiolamviec'] = _resolve_khung_gio_lam_viec(item, list_kg, idx)
        if item['khunggiolamviec'] is None:
            continue

        _bo_sung_nghi_trua_giua_cac_khung_gio(item, list_kg)

        item['da_cham_cong'] = is_da_cham
        item['lichlamviecthucte_id'] = item.pop('id', None)
        result.append(item)

    return result


# ============================================================
# VIEWS: QUẢN LÝ LÀM THÊM
# ============================================================

def view_quytac_lam_them(request):
    """Thiết kế Quy tắc làm thêm"""
    return render(request, "hrm_manager/cham_cong/lam_them/quytac_lam_them.html", {
        'breadcrumbs': [
            {'title': 'Chấm công', 'url': '#'},
            {'title': 'Quản lý làm thêm', 'url': None},
            {'title': 'Quy tắc làm thêm', 'url': None},
        ],
        'tabs': get_lam_them_tabs(),
    })


def view_tong_hop_lam_them(request):
    """Tổng hợp Làm thêm"""
    return render(request, "hrm_manager/cham_cong/lam_them/tong_hop_lam_them. html", {
        'breadcrumbs': [
            {'title': 'Chấm công', 'url': '#'},
            {'title': 'Quản lý làm thêm', 'url': None},
            {'title': 'Tổng hợp làm thêm', 'url': None},
        ],
        'tabs': get_lam_them_tabs(),
    })


# ============================================================
# VIEWS: QUẢN LÝ CHẤM CÔNG
# ============================================================

@login_required
@require_view_permission('access_control.view_cham_cong')
def view_bang_cham_cong(request):
    """Bảng chấm công"""
    return render(request, "hrm_manager/cham_cong/bang_cham_cong.html", {
        'breadcrumbs': [
            {'title': 'Chấm công', 'url': '#'},
            {'title': 'Bảng chấm công', 'url': None},
        ],
        'tabs': [
            {'label': 'Văn Phòng', 'url': '#tab-vp', 'url_name': 'tab_vp'},
            {'label': 'Sản Xuất', 'url': '#tab-sx', 'url_name': 'tab_sx'},
        ],
        'dept_options': Phongban.objects.filter(trangthai=True).values().order_by('tenphongban'),
    })


@login_required
@require_view_permission('access_control.view_cham_cong')
def view_tong_hop_cham_cong(request):
    """Tổng hợp chấm công"""
    return render(request, "hrm_manager/cham_cong/bang_cham_cong_summary.html", {
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
    })


# ============================================================
# API: BẢNG CHẤM CÔNG (CRUD)
# ============================================================

@login_required
@require_api_permission('access_control.write_cham_cong')
@require_http_methods(["POST", "PUT"])
@transaction.atomic
def api_bang_cham_cong_list(request):
    """API thêm mới (POST) / cập nhật (PUT) dữ liệu bảng chấm công"""
    try:
        data_list = loads(request.body)
        if not isinstance(data_list, list) or not data_list:
            return JsonResponse({'success': False, 'message': 'Dữ liệu đầu vào không hợp lệ'}, status=400)

        # Validate & collect ngày làm việc
        ngay_lam_viec_set = set()
        for item in data_list:
            if not item.get('ngaylamviec') or not item.get('nhanvien_id'):
                return JsonResponse({'success': False, 'message': 'Thiếu thông tin ngày làm việc hoặc nhân viên'}, status=400)
            ngay_lam_viec_set.add(dt.date.fromisoformat(item['ngaylamviec']))

        if request.method == 'POST':
            objs = calculate_bang_cham_cong_objects(data_list)
            Bangchamcong.objects.bulk_create(objs)
            return JsonResponse({
                'success': True, 'message': 'Chấm công thành công',
                'data': [model_to_dict(o) for o in objs],
            }, status=201)

        # PUT: expand team jobs + tách update/create
        update_data = _expand_update_payload_for_team_jobs(data_list, ngay_lam_viec_set)
        objs = calculate_bang_cham_cong_objects(update_data)
        update_objs = [o for o in objs if o.id is not None]
        create_objs = [o for o in objs if o.id is None]

        if update_objs:
            now = timezone.now()
            for o in update_objs:
                o.updated_at = now
                o.save()
        if create_objs:
            Bangchamcong.objects.bulk_create(create_objs)

        return JsonResponse({
            'success': True, 'message': 'Cập nhật chấm công thành công',
            'data': [model_to_dict(o) for o in update_objs + create_objs],
        }, status=200)

    except Exception as e:
        return JsonResponse({'success': False, 'message': f'Lỗi: {str(e)}'}, status=400)


@login_required
@require_api_permission('access_control.view_cham_cong')
@require_http_methods(["GET"])
def api_bang_cham_cong_nhan_vien_list(request):
    """API lấy DS nhân viên chấm công theo ngày, mode & ca làm việc"""
    try:
        ngay = dt.date.fromisoformat(request.GET.get("ngaylamviec"))
    except (ValueError, TypeError):
        return JsonResponse({'success': False, 'message': 'Ngày không hợp lệ'}, status=400)

    mode = (request.GET.get('mode', 'create') or 'create').lower()
    if mode not in {'update', 'create', 'new'}:
        return JsonResponse({'success': False, 'message': 'Giá trị mode không hợp lệ (update/create/new)'}, status=400)

    is_update = mode == 'update'
    ds_ca = _get_shifts_for_date(ngay, 'attendance' if is_update else 'schedule')

    # Parse calamviec_id, auto-select ca đầu tiên nếu không truyền
    try:
        ca_id = int(request.GET.get('calamviec_id'))
    except (TypeError, ValueError):
        ca_id = ds_ca[0]['calamviec_id'] if ds_ca else None

    data = build_cham_cong_data_by_status(ngay, mode='update' if is_update else 'create', da_cham_cong=False, calamviec_id=ca_id)
    return JsonResponse({'success': True, 'data': data, 'ds_calamviec': ds_ca, 'selected_calamviec_id': ca_id}, status=200)


@login_required
@require_api_permission('access_control.view_cham_cong')
@require_http_methods(["GET"])
def api_tong_hop_cham_cong_thang(request):
    """API Tổng hợp chấm công tháng"""
    try:
        phongban_id = request.GET.get('phongban_id')
        pb_ids = get_all_child_department_ids(phongban_id, isnclude_root=True) if phongban_id else None
        search = request.GET.get('search')
        loai_cc = request.GET.get('loai_chamcong', "all")
        thoi_gian = dt.datetime.strptime(request.GET.get('thang', dt.datetime.now().strftime("%Y-%m")), "%Y-%m")
    except ValueError:
        return JsonResponse({'success': False, 'message': 'Thời gian không hợp lệ'})

    # Query nhân viên active
    qs_nv = Lichsucongtac.objects.filter(trangthai='active')
    if pb_ids is not None:
        qs_nv = qs_nv.filter(phongban_id__in=pb_ids)
    if search:
        qs_nv = qs_nv.filter(Q(nhanvien__hovaten__icontains=search) | Q(nhanvien__manhanvien__icontains=search))

    ds_nv = list(qs_nv.annotate(
        ten_nv=F('nhanvien__hovaten'), ma_nv=F('nhanvien__manhanvien'), ten_cv=F("chucvu__tenvitricongviec")
    ).values('nhanvien_id', 'ten_nv', 'ma_nv', 'phongban_id', 'ten_cv').order_by('nhanvien_id'))

    # Query chấm công tháng
    ds_cc = Bangchamcong.objects.filter(
        ngaylamviec__year=thoi_gian.year, ngaylamviec__month=thoi_gian.month
    ).values().order_by('created_at')

    # Gom nhóm theo nhân viên
    map_cc = defaultdict(lambda: {'tong_gio': 0, 'tong_cong': 0, 'logs': defaultdict(list), 'loai_chamcong': ''})
    for cc in ds_cc:
        nv_id = cc['nhanvien_id']
        tg_lam = round(float((cc['thoigianlamviec'] + (cc['thoigianvemuon'] or 0) + (cc['thoigiandisom'] or 0)) / 60 or 0), 1)
        ngay_str = f"{cc['ngaylamviec'].day:02d}"

        map_cc[nv_id]['tong_gio'] += tg_lam
        map_cc[nv_id]['tong_cong'] += cc['conglamviec'] or 0

        tg_vao, tg_ra = cc['thoigianchamcongvao'], cc['thoigianchamcongra']
        map_cc[nv_id]['logs'][ngay_str].append({
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
        })
        map_cc[nv_id]['loai_chamcong'] = cc.get('loaichamcong', None)

    # Merge kết quả
    result = []
    for nv in ds_nv:
        data = map_cc.get(nv['nhanvien_id'])
        if data:
            nv.update({'logs': data['logs'], 'tongthoigianlamviec': data['tong_gio'],
                       'tongconglamviec': data['tong_cong'], 'loai_chamcong': data['loai_chamcong']})
        else:
            nv.update({'logs': {}, 'tongthoigianlamviec': 0, 'tongconglamviec': 0, 'loai_chamcong': ''})
        if loai_cc == 'all' or loai_cc == nv['loai_chamcong']:
            result.append(nv)

    return JsonResponse({'success': True, 'data': result, 'total': len(result)}, status=200)


@login_required
@require_api_permission('access_control.view_cham_cong')
@require_http_methods(["GET"])
def api_check_cham_cong(request):
    """API lấy danh sách nhân viên đã/chưa chấm công trong ngày."""
    dachamcong = request.GET.get('dachamcong')
    if dachamcong is None:
        return JsonResponse({'success': False, 'message': 'Giá trị dachamcong không hợp lệ (true/false)'}, status=400)

    try:
        ngay = dt.date.fromisoformat(request.GET.get("ngaylamviec"))
    except (ValueError, TypeError):
        return JsonResponse({'success': False, 'message': 'Ngày không hợp lệ'}, status=400)

    return JsonResponse({'success': True, 'data': build_cham_cong_data_by_status(ngay, da_cham_cong=dachamcong)}, status=200)


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