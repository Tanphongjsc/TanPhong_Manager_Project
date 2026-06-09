from django.shortcuts import render, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.urls import reverse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.forms.models import model_to_dict
from django.db.models import OuterRef, Subquery, Q, Prefetch, Case, When, Value, IntegerField, F
from django.db import transaction
from django.core.paginator import Paginator, EmptyPage, PageNotAnInteger
from django.utils import timezone

import json
import re
from datetime import datetime, timedelta
from json import loads
from collections import defaultdict

from apps.hrm_manager.__core__.models import *
from apps.hrm_manager.to_chuc_nhan_su.auto_assign_service import EmployeeAutoAssignService

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
    paginate_queryset,
    get_request_data
)

# ============================================================================
# HELPER: Đồng bộ chéo trangthainv <-> trangthai (active/inactive)
# ============================================================================

def _sync_employee_status(trangthainv, trangthai):
    """
    Đảm bảo trangthainv và trangthai luôn nhất quán:
      - 'Đã nghỉ việc' <-> 'inactive'
      - 'Đang làm việc' / 'Thử việc' <-> 'active'
    Ưu tiên: trangthainv quyết định trước, trangthai là fallback.
    Returns: (trangthainv, trangthai)
    """
    if trangthainv == 'Đã nghỉ việc':
        return trangthainv, 'inactive'
    if trangthai == 'inactive':
        return 'Đã nghỉ việc', 'inactive'
    return (trangthainv or 'Đang làm việc'), 'active'


# ============================================================================
# VIEW URLS - TRANG CHÍNH
# ============================================================================

@login_required
def view_cay_nhan_su_index(request):
    """Hiển thị trang cây nhân sự"""

    context = {
        'breadcrumbs': [
            {'title': 'Quản lý nhân sự', 'url': '#'},
            {'title': 'Cây nhân sự', 'url': None},
        ],
        
        # Dữ liệu filter cho trạng thái nhân viên
        'status_list_nv': [
            {'value': 'Đang làm việc', 'label': 'Đang làm việc'},
            {'value': 'Thử việc', 'label': 'Thử việc'},
            {'value': 'Đã nghỉ việc', 'label': 'Đã nghỉ việc'},
        ],
        
        # Dữ liệu filter cho giới tính
        'gioitinh_list' : [
            {'value': 'Nam', 'label': 'Nam'},
            {'value': 'Nữ', 'label': 'Nữ'},
            {'value': 'Khác', 'label': 'Khác'},
        ]
    }

    return render(request, "hrm_manager/quan_ly_nhan_su/caynhansu.html", context=context)

@login_required
def view_nhan_vien_index(request, id):
    """Hiển thị trang chi tiết nhân viên từ cây nhân sự"""

    nhan_vien = get_object_or_404(Nhanvien, id=id)

    context = {
        'breadcrumbs': [
            {'title': 'Quản lý nhân sự', 'url': '#'},
            {'title': 'Cây nhân sự', 'url': reverse('hrm:to_chuc_nhan_su:cay_nhan_su_index')},
            {'title': nhan_vien.hovaten, 'url': None},
        ],
        'tabs': [
            {'label': 'Thông tin cơ bản', 'url': '#tab-basic', 'url_name': 'tab_basic'},
            {'label': 'Thông tin nâng cao', 'url': '#tab-advanced', 'url_name': 'tab_advanced'},
            {'label': 'Lịch sử công tác', 'url': '#tab-history', 'url_name': 'tab_history'}
        ],
        'advanced_menu_items' : [
            {'label': 'Thông tin bổ sung', 'target': 'subtab-info', 'icon': 'fas fa-info-circle'},
            {'label': 'Hợp đồng lao động', 'target': 'subtab-contracts', 'icon': 'fas fa-file-contract'},
            {'label': 'Thuế thu nhập cá nhân', 'target': 'subtab-tax', 'icon': 'fas fa-money-bill-wave'},
            {'label': 'Bảo hiểm xã hội', 'target': 'subtab-bhxh', 'icon': 'fas fa-shield-alt'},
            {'label': 'Bảo hiểm y tế', 'target': 'subtab-bhyt', 'icon': 'fas fa-heartbeat'},
            {'label': 'Phụ cấp', 'target': 'subtab-allowance', 'icon': 'fas fa-coins'},
        ],
        'employee': nhan_vien,
        'current_job': nhan_vien.lichsucongtac_set.filter(trangthai='active').first(),
        'bank_options': list(Nganhang.objects.values_list('id', 'tennganhang')),
        'gender_options': [('Nam', 'Nam'), ('Nữ', 'Nữ'), ('Khác', 'Khác')]
    }

    return render(request, "hrm_manager/quan_ly_nhan_su/nhanvien_detail.html", context=context)


# ===============================================================
# ================= QUẢN LÝ CÂY NHÂN SỰ - API ===================
# ===============================================================

# ==================== API CÔNG TY ====================

@login_required
@require_http_methods(["GET", "POST"])
def api_cong_ty_list(request):
    """API lấy danh sách và tạo mới Công Ty"""
    
    if request.method == "GET":
        # Lấy danh sách công ty
        cong_ty_list = Congty.objects.all().values()
        
        return JsonResponse({
            'success': True,
            'data': list(cong_ty_list),
            'total': cong_ty_list.count()
        })
    
    elif request.method == "POST":
        # Tạo mới công ty
        try:
            data = loads(request.body)

            # Validate mã công ty phải duy nhất trong toàn hệ thống
            ma_congty = (data.get('macongty') or '').strip()
            if not validate_unique_field(Congty, 'macongty', ma_congty):
                return json_error('Mã công ty đã tồn tại. Vui lòng chọn mã khác.', 400)

            cong_ty = Congty.objects.create(
                macongty=data.get('macongty'),
                tencongty_vi=data.get('tencongty_vi'),
                masothue=data.get('masothue'),
                diachi_vi=data.get('diachi_vi'),
                tencongty_en=data.get('tencongty_en'),
                diachi_en=data.get('diachi_en'),
                tenviettat=data.get('tenviettat'),
                fax=data.get('fax'),
                sodienthoai=data.get('sodienthoai'),
                nguoidaidien=data.get('nguoidaidien'),
                created_at=datetime.now()
            )
            
            return JsonResponse({
                'success': True,
                'message': 'Tạo công ty thành công',
                'data': {
                    'id': cong_ty.id,
                    'macongty': cong_ty.macongty,
                    'tencongty_vi': cong_ty.tencongty_vi,
                    'masothue': cong_ty.masothue,
                    'diachi_vi': cong_ty.diachi_vi,
                    'tencongty_en': cong_ty.tencongty_en,
                    'diachi_en': cong_ty.diachi_en,
                    'tenviettat': cong_ty.tenviettat,
                    'fax': cong_ty.fax,
                    'sodienthoai': cong_ty.sodienthoai,
                    'nguoidaidien': cong_ty.nguoidaidien,
                    'created_at': cong_ty.created_at
                }
            }, status=201)
            
        except Exception as e:
            return JsonResponse({
                'success': False,
                'message': f'Lỗi: {str(e)}'
            }, status=400)


@login_required
@require_http_methods(["GET", "PUT", "DELETE"])
def api_cong_ty_detail(request, id):
    """API lấy chi tiết, cập nhật và xóa Công Ty"""
    
    try:
        cong_ty = Congty.objects.get(id=id)
    except Congty.DoesNotExist:
        return JsonResponse({
            'success': False,
            'message': 'Không tìm thấy công ty'
        }, status=404)
    
    if request.method == "GET":
        # Lấy chi tiết công ty
        return JsonResponse({
            'success': True,
            'data': model_to_dict(cong_ty)
        })
    
    elif request.method == "PUT":
        # Cập nhật chức vụ
        try:
            data = loads(request.body)

            # Validate mã công ty không trùng (trừ chính nó)
            ma_congty = (data.get('macongty') or '').strip()
            if ma_congty and not validate_unique_field(Congty, 'macongty', ma_congty, exclude_pk=id):
                return json_error('Mã công ty đã tồn tại. Vui lòng chọn mã khác.', 400)

            for field in cong_ty._meta.fields:
                if field.name in data:
                    setattr(cong_ty, field.name, data[field.name])
            
            cong_ty.updated_at = datetime.now()
            cong_ty.save()
            
            return JsonResponse({
                'success': True,
                'message': 'Cập nhật công ty thành công',
                'data': {
                    'id': cong_ty.id,
                    'macongty': cong_ty.macongty,
                    'tencongty_vi': cong_ty.tencongty_vi,
                    'masothue': cong_ty.masothue,
                    'diachi_vi': cong_ty.diachi_vi,
                    'tencongty_en': cong_ty.tencongty_en,
                    'diachi_en': cong_ty.diachi_en,
                    'tenviettat': cong_ty.tenviettat,
                    'fax': cong_ty.fax,
                    'sodienthoai': cong_ty.sodienthoai,
                    'nguoidaidien': cong_ty.nguoidaidien,
                    'created_at': cong_ty.created_at
                }
            })
            
        except Exception as e:
            return JsonResponse({
                'success': False,
                'message': f'Lỗi: {str(e)}'
            }, status=400)
    
    elif request.method == "DELETE":
        # Xóa Công Ty
        try:
            # ✅ BỔ SUNG: Check công ty còn phòng ban
            has_departments = Phongban.objects.filter(congty=cong_ty).exists()
            if has_departments:
                return JsonResponse({
                    'success': False,
                    'message': 'Không thể xóa: Công ty đang có phòng ban. Vui lòng xóa/chuyển phòng ban trước.'
                }, status=400)
            
            cong_ty.delete()
            return JsonResponse({
                'success': True,
                'message': 'Xóa công ty thành công'
            })
        except Exception as e:
            return JsonResponse({
                'success': False,
                'message': f'Lỗi: {str(e)}'
            }, status=400)


# ==================== API PHÒNG BAN ====================
# @login_required
@require_http_methods(["GET", "POST"])
def api_phong_ban_list(request):
    """API lấy danh sách và tạo mới Phòng Ban"""
    
    if request.method == "GET":
        # Lấy danh sách phòng ban
        phong_ban_list = Phongban.objects.all().values().order_by('tenphongban')

        return JsonResponse({
            'success': True,
            'data': list(phong_ban_list),
            'total': phong_ban_list.count()
        })
    
    elif request.method == "POST":
        # Tạo mới phòng ban
        try:
            data = loads(request.body)
            
            # Validate mã phòng ban phải duy nhất trong toàn hệ thống
            ma_phongban = (data.get('maphongban') or '').strip()
            if not validate_unique_field(Phongban, 'maphongban', ma_phongban):
                return json_error('Mã phòng ban đã tồn tại. Vui lòng chọn mã khác.', 400)

            # Lấy phòng ban cha nếu có, để xác định level
            phongbancha_id = data.get('phongbancha_id', "") if data.get('phongbancha_id') else None
            phong_ban_cha = Phongban.objects.filter(id=phongbancha_id).first()

            phong_ban = Phongban.objects.create(
                maphongban=data.get('maphongban'),
                tenphongban=data.get('tenphongban').title(),
                level=phong_ban_cha.level + 1 if phong_ban_cha else 1,
                ghichu=data.get('ghichu'),
                trangthai=data.get('trangthai', 'active'),
                congty_id=data.get('congty_id'),
                phongbancha_id=phong_ban_cha.id if phong_ban_cha else None,
                created_at=datetime.now()
            )
            
            return JsonResponse({
                'success': True,
                'message': 'Tạo phòng ban thành công',
                'data': {
                    'id': phong_ban.id,
                    'maphongban': phong_ban.maphongban,
                    'tenphongban': phong_ban.tenphongban,
                    'level': phong_ban.level,
                    'ghichu': phong_ban.ghichu,
                    'trangthai': phong_ban.trangthai,
                    'congty': phong_ban.congty_id,
                    'phongbancha_id': phong_ban.phongbancha_id,
                    'created_at': phong_ban.created_at
                }
            }, status=201)
            
        except Exception as e:
            return JsonResponse({
                'success': False,
                'message': f'Lỗi: {str(e)}'
            }, status=400)


@login_required
@require_http_methods(["GET", "PUT", "DELETE"])
@transaction.atomic
def api_phong_ban_detail(request, id):
    """API lấy chi tiết, cập nhật và xóa phòng ban"""
    
    try:
        phong_ban = Phongban.objects.get(id=id)
    except Phongban.DoesNotExist:
        return JsonResponse({
            'success': False,
            'message': 'Không tìm thấy phòng ban'
        }, status=404)
    
    if request.method == "GET":
        # Lấy chi tiết phòng ban
        return JsonResponse({
            'success': True,
            'data': model_to_dict(phong_ban)
        })
    
    elif request.method == "PUT":
        # Cập nhật chức vụ
        try:
            data = loads(request.body)

            # Validate mã phòng ban không trùng (trừ chính nó)
            ma_phongban = (data.get('maphongban') or '').strip()
            if ma_phongban and not validate_unique_field(Phongban, 'maphongban', ma_phongban, exclude_pk=id):
                return json_error('Mã phòng ban đã tồn tại. Vui lòng chọn mã khác.', 400)

            for field in phong_ban._meta.fields:
                if field.name in data:
                    value = data[field.name]
                    
                    # Xử lý ForeignKey: chuyển '' thành None
                    if field.name in ['phongbancha_id', 'congty_id']:
                        value = value if value else None
                    
                    # Title case cho tên
                    if field.name == 'tenphongban' and value:
                        value = value.title()
                    
                    setattr(phong_ban, field.name, value)

            phong_ban.updated_at = datetime.now()
            phong_ban.save()
            
            return JsonResponse({
                'success': True,
                'message': 'Cập nhật công ty thành công',
                'data': {
                    'id': phong_ban.id,
                    'maphongban': phong_ban.maphongban,
                    'tenphongban': phong_ban.tenphongban,
                    'level': phong_ban.level,
                    'ghichu': phong_ban.ghichu,
                    'trangthai': phong_ban.trangthai,
                    'congty_id': phong_ban.congty_id,
                    'phongbancha_id': phong_ban.phongbancha_id,
                    'created_at': phong_ban.created_at,
                    'updated_at': phong_ban.updated_at
                }
            })
            
        except Exception as e:
            return JsonResponse({
                'success': False,
                'message': f'Lỗi: {str(e)}'
            }, status=400)
    
    elif request.method == "DELETE":
        # Xóa Phòng Ban
        try:
            phong_ban_cons_ids = get_all_child_department_ids(phong_ban.id)
            # ✅ BỔ SUNG: Check có nhân viên active trong phòng ban hoặc các phòng ban con
            has_active_employees = Lichsucongtac.objects.filter(
                phongban_id__in=phong_ban_cons_ids,
                trangthai='active'
            ).exists()
            if has_active_employees:
                return JsonResponse({
                    'success': False,
                    'message': 'Không thể xóa: Phòng ban (hoặc phòng ban con) đang có nhân viên hoạt động. Vui lòng chuyển nhân viên trước.'
                }, status=400)

            # ✅ BỔ SUNG: Check phòng ban đang được gán trong lịch làm việc active
            has_active_schedule = LichlamviecPhongban.objects.filter(
                phongban_id__in=phong_ban_cons_ids,
                trangthai='active'
            ).filter(
                Q(lichlamviec__is_deleted=False) | Q(lichlamviec__is_deleted__isnull=True)
            ).exists()
            if has_active_schedule:
                return JsonResponse({
                    'success': False,
                    'message': 'Không thể xóa: Phòng ban đang được gán trong lịch làm việc. Vui lòng gỡ bỏ trước.'
                }, status=400)

            # ✅ BỔ SUNG: Check phòng ban đang thuộc chế độ lương active
            has_active_salary = PhongbanChedoluong.objects.filter(
                phongban_id__in=phong_ban_cons_ids,
                trangthai='active'
            ).filter(
                Q(chedoluong__is_deleted=False) | Q(chedoluong__is_deleted__isnull=True)
            ).exists()
            if has_active_salary:
                return JsonResponse({
                    'success': False,
                    'message': 'Không thể xóa: Phòng ban đang thuộc chế độ lương. Vui lòng gỡ bỏ trước.'
                }, status=400)
            phong_ban_con_list = Phongban.objects.filter(id__in=phong_ban_cons_ids)
            phong_ban_con_list.delete() # Xóa các phòng ban con trước

            phong_ban.delete() # Xóa phòng ban hiện tại

            return JsonResponse({
                'success': True,
                'message': 'Xóa phòng ban thành công'
            })
        except Exception as e:
            return JsonResponse({
                'success': False,
                'message': f'Lỗi: {str(e)}'
            }, status=400)

# @login_required
@require_http_methods(["GET"])
def api_phong_ban_nhan_vien(request):
    """API lấy danh sách nhân sự theo phòng ban
    ✅ Backward compatible + Hỗ trợ batch request: 
    - phongban_id=123 (cũ, vẫn hoạt động)
    - phongban_ids=1,2,3 (mới, hỗ trợ batch - giảm N request xuống 1)
    """

    # Lấy tham số lọc từ query params
    param_query = request.GET.dict()
    page = param_query.pop('page', 1)
    page_size = param_query.pop('page_size', 10)
    search_param = param_query.pop('search', '').strip()
    congty_id = param_query.pop('congty_id', None)

    # ✅ NEW: Hỗ trợ cả phongban_id (cũ) và phongban_ids (mới)
    single_id = param_query.pop('phongban_id', None)
    multiple_ids = param_query.pop('phongban_ids', '')  # Format: "1,2,3"

    phongban_ids = set()
    
    # Xử lý phongban_id đơn lẻ (backward compatible)
    if single_id:
        child_ids = get_all_child_department_ids(single_id, isnclude_root=True)
        phongban_ids.update(child_ids)
    
    # ✅ NEW: Xử lý phongban_ids (batch)
    if multiple_ids: 
        for pid in multiple_ids.split(','):
            pid = pid.strip()
            if pid:
                child_ids = get_all_child_department_ids(pid, isnclude_root=True)
                phongban_ids.update(child_ids)

    try:        
        # Build filters từ Lichsucongtac
        filters = Q()
        if phongban_ids:
            filters &= Q(phongban__id__in=phongban_ids)
        elif congty_id:
            filters &= Q(phongban__congty_id=congty_id)
        
        # Thêm filters từ nhân viên (áp dụng chung trên join)
        fields_nhan_vien = ["nhanvien__gioitinh", "nhanvien__loainv_id", "nhanvien__trangthainv", "nhanvien__trangthai"]
        for key in fields_nhan_vien:
            raw_key = key.replace('nhanvien__', '')  # Map về param gốc
            value = param_query.get(raw_key)
            if value:
                filters &= Q(**{key: value})
        
        # Thêm query param tìm kiếm
        if search_param:
            filters &= Q(nhanvien__hovaten__icontains=search_param) | Q(nhanvien__manhanvien__icontains=search_param)
        filters &= Q(nhanvien__isnull=False)

        # Lấy bản ghi lịch sử công tác mới nhất của mỗi nhân viên
        latest_id_subquery = Lichsucongtac.objects.filter(
            nhanvien_id=OuterRef('nhanvien_id')
        ).order_by('-batdau', '-id').values('id')[:1]

        # Query từ Lichsucongtac bản ghi mới nhất của nhân viên và áp dụng bộ lọc
        qs = Lichsucongtac.objects.annotate(
            latest_id=Subquery(latest_id_subquery)
        ).filter(
            id=F('latest_id')
        ).filter(
            filters
        ).select_related(
            'nhanvien', 'nhanvien__loainv', 'nhanvien__nganhang',  # Join nhân viên + related
            'phongban', 'chucvu'  # Join cho cong_tac
        ).order_by('nhanvien__id')

        # Sử dụng Paginator
        paginator = Paginator(qs, page_size)
        try:
            page_obj = paginator.page(page)
        except PageNotAnInteger:
            return JsonResponse({
                'success': False,
                'message': 'Trang không hợp lệ'
            }, status=400)
        
        # Fields cần thiết (tối ưu data tải về) Lấy fields từ Nhanvien + build cong_tac từ Lichsu
        result = []
        for lichsu in page_obj:
            nv = lichsu.nhanvien
            cong_tac = {
                'phong_ban': lichsu.phongban.tenphongban if lichsu.phongban else None,
                'chuc_vu': lichsu.chucvu.tenvitricongviec if lichsu.chucvu else None,
                'phongban_id': lichsu.phongban.id if lichsu.phongban else None,
            }
            nv_data = {
                'id': nv.id,
                'manhanvien': nv.manhanvien,
                'hovaten': nv.hovaten,
                'email': nv.email,
                'trangthainv': nv.trangthainv,
                'ngayvaolam': nv.ngayvaolam,
                'loainv': nv.loainv.id if nv.loainv else None,
            }
            nv_data['cong_tac'] = cong_tac
            nv_data['ngan_hang'] = {
                'tennganhang': nv.nganhang.tennganhang if nv.nganhang else None,
                'sotknganhang': nv.sotknganhang,
                'tentknganhang': nv.tentknganhang
            }

            result.append(nv_data)

        return JsonResponse({
            'success': True,
            'data': result,
            'pagination': {
                'page': page_obj.number,
                'page_size': page_size,
                'total': paginator.count,
                'total_pages': paginator.num_pages,
                'has_next': page_obj.has_next(),
                'has_prev': page_obj.has_previous()
            }
        })

    except Exception as e:
        return JsonResponse({
            'success': False,
            'message': f'Lỗi: {str(e)}'
        }, status=400)
    
@login_required
@require_http_methods(["GET"])
def api_phong_ban_tree(request):
    """API lấy cây phòng ban"""

    try:
        # 1.Lấy tất cả công ty
        cong_ty_qs = Congty.objects.values('id', 'tencongty_vi', 'macongty').order_by('id')

        # 2.Lấy tất cả phòng ban + prefetch công ty để tránh N+1
        phong_ban_qs = Phongban.objects.select_related('congty').values(
            'id', 'tenphongban', 'phongbancha_id', 'congty_id', 'level', 'maphongban'
        ).order_by('tenphongban')

        # Chuyển thành dict để tra cứu nhanh
        phong_ban_dict = {pb['id']: {**pb, 'children': []} for pb in phong_ban_qs} # Thêm trường 'children' để xây dựng cây

        # Danh sách node gốc theo công ty
        root_by_company = {}

        # Tạo cây phòng ban theo công ty
        for pb in phong_ban_dict.values():
            parent_id = pb['phongbancha_id']
            if parent_id:
                # Là phòng ban con
                parent_pb = phong_ban_dict.get(parent_id)
                if parent_pb:
                    parent_pb['children'].append(pb)
            else:
                # Là Phòng ban cha
                congty_id = pb['congty_id']
                if congty_id not in root_by_company:
                    root_by_company[congty_id] = []
                root_by_company[congty_id].append(pb)

        # Kết hợp công ty với cây phòng ban
        for cong_ty in cong_ty_qs:
            cong_ty_id = cong_ty['id']
            cong_ty['departments'] = root_by_company.get(cong_ty_id, [])

        return JsonResponse({
            'success': True,
            'data': list(cong_ty_qs)
        })
    
    except Exception as e:
        return JsonResponse({
            'success': False,
            'message': f'Lỗi: {str(e)}'
        }, status=400)

# ------ PHONG BAN HELPER FUNCTIONS ------
def get_all_child_department_ids(root_id, isnclude_root=False):
    """
    Trả về list tất cả ID con, cháu, chắt...của một phòng ban.
    Tối ưu: Chỉ tốn đúng 1 câu lệnh truy vấn Database.
    """
    if not root_id:
        return []
    
    # Lấy dữ liệu thô (Chỉ lấy cột cần thiết để tối ưu bộ nhớ)
    all_nodes = Phongban.objects.values_list('id', 'phongbancha_id')

    # Xây dựng bản đồ Cha-Con
    parent_map = defaultdict(list)
    for ID, parent_ID in all_nodes:
        if parent_ID: # Nếu có cha
            parent_map[parent_ID].append(ID)
    
    # Thu thập kết quả
    results = []
    stack = [int(root_id)]  # Bắt đầu từ node gốc
    
    while stack:
        current_id = stack.pop()
        
        # Tìm các con trực tiếp của node đang xét
        direct_children = parent_map.get(current_id, [])
        
        if direct_children:
            results.extend(direct_children) # Thêm vào kết quả
            stack.extend(direct_children)   # Thêm vào stack để tiếp tục tìm con của chúng

    if isnclude_root:
        results.append(int(root_id))

    return results

# ==================== API NHÂN VIÊN ====================

@login_required
@require_http_methods(["GET"])
def api_nhan_vien_next_code(request):
    """API lấy mã nhân viên tiếp theo tự động tăng"""
    try:
        codes = Nhanvien.objects.exclude(manhanvien__isnull=True).exclude(manhanvien='').values_list('manhanvien', flat=True)
        max_num = 0
        for code in codes:
            match = re.search(r'\d+', code)
            if match:
                num = int(match.group())
                if num > max_num:
                    max_num = num
        
        next_num = max_num + 1
        next_code = f"NV{next_num:05d}"
        
        return JsonResponse({'data': {'next_code': next_code}})
    except Exception as e:
        return json_error("Không thể tạo mã nhân viên mới", 500)

@login_required
@transaction.atomic
@require_http_methods(["GET", "POST", "PUT", "DELETE"])
def api_nhan_vien_list(request):
    """API lấy danh sách và tạo mới Nhân Viên"""
    
    if request.method == "GET":
        # Lấy danh sách Nhân viên

        param_filters = request.GET.dict()

        # Xây dựng bộ lọc cho Nhân viên       
        filters = Q()

        fields_nhan_vien = ["gioitinh", "loainv_id", "trangthainv", "trangthai"]
        for key in fields_nhan_vien:
            value = param_filters.get(key)
            if value:
                filters &= Q(**{key: value})

        nhan_vien_list = Nhanvien.objects.filter(filters).values()
        
        return JsonResponse({
            'success': True,
            'data': list(nhan_vien_list),
            'total': len(nhan_vien_list)
        })
    
    elif request.method == "POST":
        # Tạo mới nhân viên
        try:
            data = loads(request.body)

            # Validate mã nhân viên phải duy nhất
            ma_nhanvien = (data.get('manhanvien') or '').strip()
            if ma_nhanvien and not validate_unique_field(Nhanvien, 'manhanvien', ma_nhanvien):
                return json_error('Mã nhân viên đã tồn tại. Vui lòng chọn mã khác.', 400)

            # Đồng bộ chéo trangthainv <-> trangthai
            trangthainv, trangthai = _sync_employee_status(
                data.get('trangthainv'), data.get('trangthai')
            )

            nhan_vien = Nhanvien.objects.create(
                manhanvien=data.get('manhanvien'),
                hovaten=data.get('hovaten'),
                email=data.get('email'),
                sodienthoai=data.get('sodienthoai'),
                diachi=data.get('diachi'),
                gioitinh=data.get('gioitinh'),
                ngaysinh=data.get('ngaysinh'),
                socccd=data.get('socccd'),
                ngayvaolam=data.get('ngayvaolam') if data.get('ngayvaolam') else None,
                loainv_id=data.get('loainv_id') or data.get('loainv'),
                trangthainv=trangthainv,
                nganhang_id=data.get('nganhang'),
                sotknganhang=data.get('sotknganhang'),
                tentknganhang=data.get('tentknganhang'),
                masothue=data.get('masothue'),
                trangthai=trangthai,
                created_at=datetime.now(),
            )
            # Lịch sử công tác sẽ được tạo bởi frontend gọi API /lich-su-cong-tac/ riêng
            # Không tạo ở đây để tránh bị trùng lặp (2 bản ghi)

            return JsonResponse({
                'success': True,
                'message': 'Tạo nhân viên thành công',
                'data': model_to_dict(nhan_vien)
            }, status=201)
            
        except Exception as e:
            return JsonResponse({
                'success': False,
                'message': f'Lỗi: {str(e)}'
            }, status=400)

    elif request.method == "DELETE":
        # Xóa Nhân Viên

        nhan_vien_ids = request.GET.getlist('nhan_vien_ids', [])
        try:
            # NV có dữ liệu lịch sử (chấm công/phiếu lương) → soft delete
            has_history_ids = set(Bangchamcong.objects.filter(
                nhanvien_id__in=nhan_vien_ids
            ).values_list('nhanvien_id', flat=True))

            has_payslip_ids = set(Phieuluong.objects.filter(
                nhanvien_id__in=nhan_vien_ids
            ).values_list('nhanvien_id', flat=True))

            soft_delete_ids = list(has_history_ids | has_payslip_ids)
            hard_delete_ids = list(set(nhan_vien_ids) - set(soft_delete_ids))

            # Soft delete: cleanup lịch/lương → chuyển trạng thái nghỉ việc
            if soft_delete_ids:
                for nv_id in soft_delete_ids:
                    EmployeeAutoAssignService.cleanup_on_termination(nv_id)

                Nhanvien.objects.filter(id__in=soft_delete_ids).update(
                    trangthainv='Đã nghỉ việc',
                    trangthai='inactive',
                    updated_at=datetime.now()
                )
                Lichsucongtac.objects.filter(
                    nhanvien_id__in=soft_delete_ids,
                    trangthai='active'
                ).update(
                    trangthai='inactive',
                    ketthuc=datetime.now().date(),
                    updated_at=datetime.now()
                )

            # Hard delete: cleanup trước khi xóa cứng
            if hard_delete_ids:
                for nv_id in hard_delete_ids:
                    EmployeeAutoAssignService.cleanup_on_termination(nv_id)
                Nhanvien.objects.filter(id__in=hard_delete_ids).delete()

            msg_parts = []
            if hard_delete_ids:
                msg_parts.append(f"Đã xóa {len(hard_delete_ids)} nhân viên")
            if soft_delete_ids:
                msg_parts.append(f"Đã chuyển {len(soft_delete_ids)} nhân viên sang 'Đã nghỉ việc' (có dữ liệu lịch sử)")

            return JsonResponse({
                'success': True,
                'message': '. '.join(msg_parts)
            })

        except Exception as e:
            return JsonResponse({'success': False, 'message': f'Lỗi: {str(e)}'}, status=400)


@login_required
@transaction.atomic
@require_http_methods(["GET", "PUT", "PATCH", "DELETE"])
def api_nhan_vien_detail(request, id):
    """API lấy chi tiết, cập nhật và xóa Nhân Viên"""

    try:
        nhan_vien = Nhanvien.objects.get(id=id)
    except Nhanvien.DoesNotExist:
        return JsonResponse({
            'success': False,
            'message': 'Không tìm thấy nhân viên'
        }, status=404)
    
    if request.method == "GET":
        # Lấy chi tiết nhân viên
        return JsonResponse({
            'success': True,
            'data': {
                **model_to_dict(nhan_vien),
                'loainv_id': nhan_vien.loainv_id,
                'nganhang_id': nhan_vien.nganhang_id,
            }
        })
    
    elif request.method in ("PUT", "PATCH"):
        # Cập nhật nhân viên
        try:
            data = loads(request.body)

            # Validate mã nhân viên không trùng (trừ chính nó)
            ma_nhanvien = (data.get('manhanvien') or '').strip()
            if ma_nhanvien and not validate_unique_field(Nhanvien, 'manhanvien', ma_nhanvien, exclude_pk=id):
                return json_error('Mã nhân viên đã tồn tại. Vui lòng chọn mã khác.', 400)

            data['loainv'] = data.get('loainv_id', data.get('loainv'))

            # Lưu trạng thái cũ để detect chuyển nghỉ việc
            old_trangthainv = nhan_vien.trangthainv

            # Đồng bộ chéo trangthainv <-> trangthai
            data['trangthainv'], data['trangthai'] = _sync_employee_status(
                data.get('trangthainv', nhan_vien.trangthainv),
                data.get('trangthai', nhan_vien.trangthai),
            )

            for field in nhan_vien._meta.fields:
                if field.name in data:
                    if field.name in ['loainv', 'nganhang']:
                        setattr(nhan_vien, f"{field.name}_id", data[field.name] if data[field.name] else None)
                    else:
                        setattr(nhan_vien, field.name, data.get(field.name) if data.get(field.name) else None)

            nhan_vien.updated_at = datetime.now()
            nhan_vien.save()

            rehire_warnings = []

            # Cleanup khi chuyển sang trạng thái nghỉ việc
            new_trangthainv = nhan_vien.trangthainv
            if new_trangthainv == 'Đã nghỉ việc' and old_trangthainv != 'Đã nghỉ việc':
                EmployeeAutoAssignService.cleanup_on_termination(nhan_vien.id)

                # Đóng lịch sử công tác active
                Lichsucongtac.objects.filter(
                    nhanvien=nhan_vien,
                    trangthai='active'
                ).update(
                    trangthai='inactive',
                    ketthuc=datetime.now().date(),
                    updated_at=datetime.now()
                )
            elif old_trangthainv == 'Đã nghỉ việc' and new_trangthainv in ('Đang làm việc', 'Thử việc'):
                # Khôi phục lịch/lương/thiết lập khi NV quay lại làm việc
                active_history = Lichsucongtac.objects.filter(
                    nhanvien=nhan_vien,
                    trangthai='active'
                ).order_by('-batdau', '-id').first()

                if not active_history:
                    latest_history = Lichsucongtac.objects.filter(
                        nhanvien=nhan_vien
                    ).order_by('-batdau', '-id').first()

                    if latest_history and latest_history.phongban_id:
                        active_history = Lichsucongtac.objects.create(
                            batdau=datetime.now().date(),
                            ketthuc=None,
                            noicongtac=latest_history.noicongtac,
                            trangthai='active',
                            nhanvien=nhan_vien,
                            phongban=latest_history.phongban,
                            chucvu=latest_history.chucvu,
                            created_at=datetime.now(),
                        )
                    else:
                        rehire_warnings.append(
                            'Không tìm thấy lịch sử công tác gần nhất để khôi phục phòng ban.'
                        )

                if active_history and active_history.phongban_id:
                    assign_result = EmployeeAutoAssignService.auto_assign_for_employee(
                        nhanvien_id=nhan_vien.id,
                        phongban_id=active_history.phongban_id,
                        effective_date=datetime.now().date(),
                        old_phongban_id=None,
                    )
                    if assign_result.get('warnings'):
                        rehire_warnings.extend(assign_result['warnings'])

                restored_count = EmployeeAutoAssignService.restore_fixed_setup_on_rehire(nhan_vien.id)
                if restored_count:
                    rehire_warnings.append(
                        f'Đã khôi phục {restored_count} thiết lập số liệu cố định.'
                    )
            
            response_payload = {
                'success': True,
                'message': 'Cập nhật nhân viên thành công',
                'data': model_to_dict(nhan_vien)
            }
            if rehire_warnings:
                response_payload['warnings'] = rehire_warnings
            return JsonResponse(response_payload)
            
        except Exception as e:
            return JsonResponse({
                'success': False,
                'message': f'Lỗi: {str(e)}'
            }, status=400)
    
    elif request.method == "DELETE":
        # Xóa Nhân Viên
        try:
            has_attendance = Bangchamcong.objects.filter(nhanvien=nhan_vien).exists()
            has_payslip = Phieuluong.objects.filter(nhanvien=nhan_vien).exists()

            # Cleanup lịch/lương/thiết lập trước khi xóa hoặc chuyển nghỉ việc
            EmployeeAutoAssignService.cleanup_on_termination(nhan_vien.id)

            if has_attendance or has_payslip:
                # Có dữ liệu lịch sử → chỉ cho nghỉ việc, không xóa cứng
                nhan_vien.trangthainv = 'Đã nghỉ việc'
                nhan_vien.trangthai = 'inactive'
                nhan_vien.updated_at = datetime.now()
                nhan_vien.save()

                # Đóng lịch sử công tác
                Lichsucongtac.objects.filter(
                    nhanvien=nhan_vien,
                    trangthai='active'
                ).update(
                    trangthai='inactive',
                    ketthuc=datetime.now().date(),
                    updated_at=datetime.now()
                )

                return JsonResponse({
                    'success': True,
                    'message': 'Nhân viên đã có dữ liệu lịch sử, đã chuyển sang trạng thái "Đã nghỉ việc"'
                })
            
            nhan_vien.delete()
            return JsonResponse({
                'success': True,
                'message': 'Xóa nhân viên thành công'
            })
        except Exception as e:
            return JsonResponse({
                'success': False,
                'message': f'Lỗi: {str(e)}'
            }, status=400)


# ==================== API LỊCH SỬ CÔNG TÁC ====================

@login_required
@require_http_methods(["GET", "POST"])
@transaction.atomic
def api_lich_su_cong_tac_list(request):
    """API lấy danh sách lịch sử, thêm mới công tác"""

    if request.method == "GET":
        # Lấy danh sách lịch sử công tác
        nhanvien_id = request.GET.get('nhanvien_id')
        
        lich_su_qs = Lichsucongtac.objects.select_related('phongban', 'chucvu').all()
        
        # Filter theo nhân viên nếu có
        if nhanvien_id:
            lich_su_qs = lich_su_qs.filter(nhanvien_id=nhanvien_id)

        # Filter theo trạng thái nếu có
        trang_thai_param = request.GET.get('trangthai', '').strip()
        if trang_thai_param:
            lich_su_qs = lich_su_qs.filter(trangthai=trang_thai_param)

        lich_su_qs = lich_su_qs.order_by('-created_at')

        # Serialize với related data
        page_size = int(request.GET.get('page_size', 50))
        page_obj, paginator = paginate_queryset(request, lich_su_qs, default_page_size=page_size)

        result = []
        for item in page_obj:
            result.append({
                'id': item.id,
                'created_at': item.created_at,
                'updated_at': item.updated_at,
                'batdau': item.batdau,
                'ketthuc': item.ketthuc,
                'noicongtac': item.noicongtac,
                'trangthai': item.trangthai,
                'nhanvien_id': item.nhanvien_id,
                'phongban_id': item.phongban_id,
                'chucvu_id': item.chucvu_id,
                'phongban': {
                    'id': item.phongban.id,
                    'tenphongban': item.phongban.tenphongban,
                } if item.phongban else None,
                'chucvu': {
                    'id': item.chucvu.id,
                    'tenvitricongviec': item.chucvu.tenvitricongviec,
                } if item.chucvu else None,
            })

        return json_success(
            'Lấy danh sách lịch sử công tác thành công',
            data=result,
            pagination={
                'page': page_obj.number,
                'page_size': paginator.per_page,
                'total': paginator.count,
                'total_pages': paginator.num_pages,
                'has_next': page_obj.has_next(),
                'has_prev': page_obj.has_previous()
            }
        )

    if request.method == "POST":
        # Tạo mới / cập nhật lịch sử công tác
        try:
            data = loads(request.body)
            nhanvien_id = data.get('nhanvien_id')
            today = timezone.now().date()

            new_phongban_id = data.get('phongban_id')
            new_chucvu_id = data.get('chucvu_id')
            new_noicongtac = data.get('noicongtac')

            # Tìm bản ghi active hiện tại
            old_phongban_id = None
            lich_su_old = Lichsucongtac.objects.filter(
                nhanvien_id=nhanvien_id, trangthai='active'
            ).order_by('-batdau', '-id').first()

            # ============================================================
            # NHÁNH B: batdau nằm trong tương lai → cập nhật tại chỗ
            # Tránh nghịch lý ketthuc < batdau khi NV chưa thực sự bắt đầu.
            # ============================================================
            if lich_su_old and lich_su_old.batdau and lich_su_old.batdau > today:
                old_phongban_id = lich_su_old.phongban_id

                # Cập nhật thông tin công tác trực tiếp trên bản ghi hiện có
                lich_su_old.phongban_id = new_phongban_id
                lich_su_old.chucvu_id = new_chucvu_id
                lich_su_old.noicongtac = new_noicongtac
                lich_su_old.updated_at = timezone.now()
                lich_su_old.save()

                # Auto-assign: chỉ xử lý khi phòng ban thực sự thay đổi
                assign_result = {'warnings': []}
                if old_phongban_id and new_phongban_id and str(old_phongban_id) != str(new_phongban_id):
                    EmployeeAutoAssignService.deactivate_old_schedule(
                        nhanvien_id=nhanvien_id,
                        old_phongban_id=old_phongban_id,
                        new_phongban_id=new_phongban_id,
                    )
                    assign_result = EmployeeAutoAssignService.auto_assign_for_employee(
                        nhanvien_id=nhanvien_id,
                        phongban_id=new_phongban_id,
                        effective_date=lich_su_old.batdau,
                        old_phongban_id=old_phongban_id,
                    )

                return JsonResponse({
                    'success': True,
                    'message': 'Cập nhật lịch sử công tác thành công',
                    'data': model_to_dict(lich_su_old),
                    'warnings': assign_result.get('warnings', []),
                })

            # ============================================================
            # NHÁNH C: batdau <= hôm nay → flow chuẩn: đóng cũ + tạo mới
            # ============================================================
            if lich_su_old:
                old_phongban_id = lich_su_old.phongban_id
                lich_su_old.ketthuc = today
                lich_su_old.trangthai = 'inactive'
                lich_su_old.updated_at = timezone.now()
                lich_su_old.save()

            # ============================================================
            # Xác định batdau cho bản ghi mới
            #   NHÁNH A: NV mới (chưa có lịch sử) → dùng ngayvaolam
            #   NHÁNH C: NV đã có lịch sử          → dùng ngày hiện tại
            # ============================================================
            if lich_su_old is None:
                has_any_history = Lichsucongtac.objects.filter(
                    nhanvien_id=nhanvien_id
                ).exists()
                if not has_any_history:
                    # Nhân viên mới hoàn toàn → lấy ngayvaolam
                    nhan_vien = Nhanvien.objects.get(id=nhanvien_id)
                    batdau = nhan_vien.ngayvaolam or today
                else:
                    # Đã có lịch sử inactive (tái tuyển dụng, v.v.) → dùng hôm nay
                    batdau = today
            else:
                batdau = today

            lich_su_new = Lichsucongtac.objects.create(
                batdau=batdau,
                ketthuc=None,
                noicongtac=new_noicongtac,
                trangthai=data.get('trangthai', 'active'),
                nhanvien_id=nhanvien_id,
                phongban_id=new_phongban_id,
                chucvu_id=new_chucvu_id,
                created_at=timezone.now(),
            )

            # Auto-assign lịch làm việc & chế độ lương theo phòng ban mới
            if old_phongban_id and new_phongban_id:
                EmployeeAutoAssignService.deactivate_old_schedule(
                    nhanvien_id=nhanvien_id,
                    old_phongban_id=old_phongban_id,
                    new_phongban_id=new_phongban_id,
                )

            assign_result = EmployeeAutoAssignService.auto_assign_for_employee(
                nhanvien_id=nhanvien_id,
                phongban_id=new_phongban_id,
                effective_date=lich_su_new.batdau,
                old_phongban_id=old_phongban_id,
            )

            return JsonResponse({
                'success': True,
                'message': 'Tạo lịch sử công tác thành công',
                'data': model_to_dict(lich_su_new),
                'warnings': assign_result.get('warnings', []),
            }, status=201)

        except Exception as e:
            return JsonResponse({
                'success': False,
                'message': f'Lỗi: {str(e)}'
            }, status=400)
    

@login_required
@require_http_methods(["POST"])
@transaction.atomic
def api_lich_su_cong_tac_chuyen_cong_tac(request): 
    # Cập nhập phòng ban nhiều nhân viên cùng lúc

    try:
        data = loads(request.body)
        nhan_vien_ids = data.get('nhan_vien_ids', [])
        phong_ban_id = data.get('phong_ban_id')

        if not nhan_vien_ids or not phong_ban_id:
            return JsonResponse({
                'success': False,
                'message': 'Thiếu nhan_vien_ids hoặc phong_ban_id'
            }, status=400)

        # Lấy danh sách lịch sử công tác active của các nhân viên
        active_histories = Lichsucongtac.objects.filter(
            nhanvien_id__in=nhan_vien_ids,
            trangthai='active'
        )

        today = timezone.now().date()
        all_warnings = []
        for lich_su_old in active_histories:
            old_phongban_id = lich_su_old.phongban_id
            nhanvien_id = lich_su_old.nhanvien_id

            # NHÁNH B: batdau tương lai → cập nhật tại chỗ (tránh ketthuc < batdau)
            if lich_su_old.batdau and lich_su_old.batdau > today:
                lich_su_old.phongban_id = phong_ban_id
                lich_su_old.updated_at = timezone.now()
                lich_su_old.save()

                if old_phongban_id and phong_ban_id and str(old_phongban_id) != str(phong_ban_id):
                    EmployeeAutoAssignService.deactivate_old_schedule(
                        nhanvien_id=nhanvien_id,
                        old_phongban_id=old_phongban_id,
                        new_phongban_id=phong_ban_id,
                    )
                    assign_result = EmployeeAutoAssignService.auto_assign_for_employee(
                        nhanvien_id=nhanvien_id,
                        phongban_id=phong_ban_id,
                        effective_date=lich_su_old.batdau,
                        old_phongban_id=old_phongban_id,
                    )
                    if assign_result.get('warnings'):
                        all_warnings.extend(assign_result['warnings'])
                continue

            # NHÁNH C: batdau <= hôm nay → flow chuẩn: đóng cũ + tạo mới
            # 1. Deactivate bản ghi cũ
            lich_su_old.ketthuc = today
            lich_su_old.trangthai = 'inactive'
            lich_su_old.updated_at = timezone.now()
            lich_su_old.save()

            # 2. Tạo bản ghi lịch sử công tác MỚI
            lich_su_new = Lichsucongtac.objects.create(
                batdau=today,
                ketthuc=None,
                noicongtac=lich_su_old.noicongtac,  # Giữ nguyên nơi công tác cũ
                trangthai='active',
                nhanvien_id=nhanvien_id,
                phongban_id=phong_ban_id,
                chucvu_id=lich_su_old.chucvu_id,  # Giữ nguyên chức vụ cũ
                created_at=timezone.now(),
            )

            # 3. Deactivate lịch làm việc phòng ban cũ
            if old_phongban_id and phong_ban_id:
                EmployeeAutoAssignService.deactivate_old_schedule(
                    nhanvien_id=nhanvien_id,
                    old_phongban_id=old_phongban_id,
                    new_phongban_id=phong_ban_id,
                )

            # 4. Auto-assign lịch và lương theo phòng ban mới
            assign_result = EmployeeAutoAssignService.auto_assign_for_employee(
                nhanvien_id=nhanvien_id,
                phongban_id=phong_ban_id,
                effective_date=lich_su_new.batdau,
                old_phongban_id=old_phongban_id
            )

            if assign_result.get('warnings'):
                all_warnings.extend(assign_result['warnings'])

        # Lọc trùng lặp warnings (nếu nhiều nhân viên cùng bị lỗi giống nhau)
        unique_warnings = list(dict.fromkeys(all_warnings))

        return JsonResponse({
            'success': True,
            'message': 'Cập nhật phòng ban cho nhân viên thành công',
            'warnings': unique_warnings
        })

    except Exception as e:
        return JsonResponse({
            'success': False,
            'message': f'Lỗi: {str(e)}'
        }, status=400)


@login_required
@require_http_methods(["GET", "PUT", "DELETE"])
@transaction.atomic
def api_lich_su_cong_tac_detail(request, id):
    """API lấy chi tiết, cập nhật và xóa lịch sử công tác"""

    trang_thai = request.GET.get("trangthai", 'active')
    filters = {'nhanvien_id': id}
    if trang_thai != 'all':
        filters['trangthai'] = trang_thai
    lich_su = Lichsucongtac.objects.filter(**filters).select_related('phongban', 'chucvu').first()

    if request.method == "GET":
        # Lấy chi tiết lịch sử công tác
        return JsonResponse({
            'success': True,
            'data': model_to_dict(lich_su) if lich_su else {}
        })

    elif request.method == "PUT":
        # Cập nhật lịch sử công tác
        try:
            data = loads(request.body)

            for field in lich_su._meta.fields:
                if field.name in data:
                    setattr(lich_su, field.name, data[field.name])
            
            lich_su.updated_at = datetime.now()
            lich_su.save()

            return JsonResponse({
                'success': True,
                'message': 'Cập nhật lịch sử công tác thành công',
                'data': model_to_dict(lich_su)
            }, status=200)
        
        except Exception as e:
            return JsonResponse({
                "success": False,
                "message": f"Lỗi: {str(e)}"
            }, status=400)

    elif request.method == "DELETE":
        # Xóa lịch sử công tác
        try:
            lich_su.delete()
            return JsonResponse({
                'success': True,
                'message': 'Xóa lịch sử công tác thành công'
            })
        except Exception as e:
            return JsonResponse({
                'success': False,
                'message': f'Lỗi: {str(e)}'
            }, status=400)


def view_bao_cao_index(request):
    """Hiển thị trang báo cáo"""
    return render(request, "hrm_manager/quan_ly_nhan_su/baocao.html")


# ===============================================================
# ================= QUẢN LÝ CHỨC VỤ =============================
# ===============================================================

@login_required
def view_chuc_vu_index(request):
    """Hiển thị trang chức vụ"""

    context = {
        'breadcrumbs': [
            {'title': 'Quản lý nhân sự', 'url': '#'},
            {'title': 'Danh mục hệ thống', 'url': reverse('hrm:to_chuc_nhan_su:danh_muc_index')},
            {'title': 'Chức vụ', 'url': None},
        ],
        'status_list': [
            {'value': 'active', 'label': 'Đang hoạt động'},
            {'value': 'inactive', 'label': 'Ngừng hoạt động'}
        ],
        'page_title': 'Danh mục Chức vụ',
        'status_list': STATUS_LIST # <--- Truyền biến này
        
    }

    return render(request, "hrm_manager/quan_ly_nhan_su/dmht_chucvu.html", context=context)


# ==================== API CHỨC VỤ ====================

@login_required
@require_http_methods(["GET", "POST"])
def api_chuc_vu_list(request):
    """API lấy danh sách và tạo mới chức vụ"""
    
    queryset = Chucvu.objects.all().values()


    if request.method == "GET":
        context = get_list_context(
            request,
            queryset,
            search_fields=['tenvitricongviec', 'machucvu'],
            filter_field=('trangthai', 'status'),
            page_size=int(request.GET.get('page_size', 10)),
        )

        return json_success(
            'Lấy danh sách chức vụ thành công',
            data=list(context['page_obj']),
            pagination={
                'page': context['page_obj'].number,
                'page_size': context['paginator'].per_page,
                'total': context['paginator'].count,
                'total_pages': context['paginator'].num_pages,
                'has_next': context['page_obj'].has_next(),
                'has_prev': context['page_obj'].has_previous()
            }
        )
    
    elif request.method == "POST":
        # Tạo mới chức vụ
        try:
            data = get_request_data(request)
            is_valid, _ = validate_required_fields(data, ['machucvu', 'tenvitricongviec'])
            if not is_valid:
                return JsonResponse({
                    'success': False,
                    'message': 'Vui lòng nhập đầy đủ mã và tên chức vụ'
                }, status=400)

            ma_chuc_vu = (data.get('machucvu') or '').strip()
            if not validate_unique_field(Chucvu, 'machucvu', ma_chuc_vu):
                return JsonResponse({
                    'success': False,
                    'message': 'Mã chức vụ đã tồn tại'
                }, status=400)
            
            chuc_vu = Chucvu.objects.create(
                machucvu=ma_chuc_vu,
                tenvitricongviec=data.get('tenvitricongviec'),
                ghichu=data.get('ghichu'),
                trangthai=data.get('trangthai', 'active'),
                created_at=datetime.now()
            )
            
            return JsonResponse({
                'success': True,
                'message': 'Tạo chức vụ thành công',
                'data': {
                    'id': chuc_vu.id,
                    'machucvu': chuc_vu.machucvu,
                    'tenvitricongviec': chuc_vu.tenvitricongviec,
                    'ghichu': chuc_vu.ghichu,
                    'trangthai': chuc_vu.trangthai
                }
            }, status=201)
            
        except Exception as e:
            return JsonResponse({
                'success': False,
                'message': f'Lỗi: {str(e)}'
            }, status=400)


@login_required
@require_http_methods(["GET", "PUT", "DELETE"])
def api_chuc_vu_detail(request, id):
    """API lấy chi tiết, cập nhật và xóa chức vụ"""
    
    try:
        chuc_vu = Chucvu.objects.get(id=id)
    except Chucvu.DoesNotExist:
        return JsonResponse({
            'success': False,
            'message': 'Không tìm thấy chức vụ'
        }, status=404)
    
    if request.method == "GET":
        # Lấy chi tiết chức vụ
        return JsonResponse({
            'success': True,
            'data': {
                'id': chuc_vu.id,
                'machucvu': chuc_vu.machucvu,
                'tenvitricongviec': chuc_vu.tenvitricongviec,
                'ghichu': chuc_vu.ghichu,
                'trangthai': chuc_vu.trangthai,
                'created_at': chuc_vu.created_at,
                'updated_at': chuc_vu.updated_at
            }
        })
    
    elif request.method == "PUT":
        # Cập nhật chức vụ
        try:
            data = get_request_data(request)
            is_valid, _ = validate_required_fields(data, ['machucvu', 'tenvitricongviec'])
            if not is_valid:
                return JsonResponse({
                    'success': False,
                    'message': 'Vui lòng nhập đầy đủ mã và tên chức vụ'
                }, status=400)

            ma_chuc_vu = (data.get('machucvu') or '').strip()
            if not validate_unique_field(Chucvu, 'machucvu', ma_chuc_vu, exclude_pk=id):
                return JsonResponse({
                    'success': False,
                    'message': 'Mã chức vụ đã tồn tại'
                }, status=400)
            
            chuc_vu.machucvu = ma_chuc_vu
            chuc_vu.tenvitricongviec = data.get('tenvitricongviec', chuc_vu.tenvitricongviec)
            chuc_vu.ghichu = data.get('ghichu', chuc_vu.ghichu)
            chuc_vu.trangthai = data.get('trangthai', chuc_vu.trangthai)
            chuc_vu.updated_at = datetime.now()
            chuc_vu.save()
            
            return JsonResponse({
                'success': True,
                'message': 'Cập nhật chức vụ thành công',
                'data': {
                    'id': chuc_vu.id,
                    'machucvu': chuc_vu.machucvu,
                    'tenvitricongviec': chuc_vu.tenvitricongviec,
                    'ghichu': chuc_vu.ghichu,
                    'trangthai': chuc_vu.trangthai
                }
            })
            
        except Exception as e:
            return JsonResponse({
                'success': False,
                'message': f'Lỗi: {str(e)}'
            }, status=400)
    
    elif request.method == "DELETE":
        # Xóa chức vụ
        try:
            # ✅ BỔ SUNG: Check chức vụ đang được sử dụng trong lịch sử công tác active
            is_assigned = Lichsucongtac.objects.filter(
                chucvu=chuc_vu,
                trangthai='active'
            ).exists()
            if is_assigned:
                return JsonResponse({
                    'success': False,
                    'message': 'Không thể xóa: Chức vụ đang được gán cho nhân viên đang hoạt động'
                }, status=400)

            # ✅ BỔ SUNG: Check có dữ liệu lịch sử (inactive) → chỉ cho inactive
            has_history = Lichsucongtac.objects.filter(chucvu=chuc_vu).exists()
            if has_history:
                chuc_vu.trangthai = 'inactive'
                chuc_vu.updated_at = datetime.now()
                chuc_vu.save()
                return JsonResponse({
                    'success': True,
                    'message': 'Chức vụ đã có dữ liệu lịch sử, đã chuyển sang ngừng hoạt động'
                })

            chuc_vu.delete()
            return JsonResponse({'success': True, 'message': 'Xóa chức vụ thành công'})
        except Exception as e:
            return JsonResponse({'success': False, 'message': f'Lỗi: {str(e)}'}, status=400)

@login_required
@require_http_methods(["POST", "PUT"]) 
def api_chuc_vu_toggle_status(request, id):
    try:
        item = get_object_or_404(Chucvu, pk=id)
        data = get_request_data(request)
        item.trangthai = 'active' if data.get('is_active') else 'inactive'
        item.updated_at = timezone.now()
        item.save()
        return json_success('Cập nhật trạng thái thành công')
    except Exception as e:
        return json_error(str(e), status=400)


# ============================================================================
# VIEW URLS - DANH MỤC HỆ THỐNG
# ============================================================================

@login_required
def view_danh_muc_index(request):
    """Hiển thị trang danh mục hệ thống"""
    return render(request, "hrm_manager/quan_ly_nhan_su/danhmuchethong.html")


@login_required
def view_bo_thuong_index(request):
    """Hiển thị trang quản lý bồi thường"""
    return render(request, "hrm_manager/quan_ly_nhan_su/quanlythongtin_boithuong.html")

@login_required
def view_tam_ung_index(request):
    """Hiển thị trang quản lý tạm ứng"""
    return render(request, "hrm_manager/quan_ly_nhan_su/quanlythongtin_quanlytamung.html")

STATUS_LIST = [
    {'value': 'active', 'label': 'Đang hoạt động'},
    {'value': 'inactive', 'label': 'Ngừng hoạt động'}
]

def view_danh_muc_index(request):
    """View cho trang Dashboard Danh mục hệ thống"""
    context = {
        'breadcrumbs': [
            {'title': 'Quản lý nhân sự', 'url': '#'},
            {'title': 'Danh mục hệ thống', 'url': None}, # Trang hiện tại để URL là None
        ]
    }
    # Đảm bảo tên file html bên dưới trùng với file bạn đang sửa
    return render(request, "hrm_manager/quan_ly_nhan_su/danhmuchethong.html", context)

def view_dmht_nganhang_list(request):
    context = {
        'breadcrumbs': [
            {'title': 'Quản lý nhân sự', 'url': '#'},
            {'title': 'Danh mục hệ thống', 'url': reverse('hrm:to_chuc_nhan_su:danh_muc_index')},
            {'title': 'Danh mục ngân hàng', 'url': None},
        ],
        'page_title': 'Danh mục ngân hàng',
        'status_list': STATUS_LIST  # <--- Truyền biến này sang HTML
    }
    return render(request, "hrm_manager/quan_ly_nhan_su/dmht_nganhang.html", context)

@login_required
def view_dmht_baohiem_list(request):
    context = {
        'breadcrumbs': [
            {'title': 'Quản lý nhân sự', 'url': '#'},
            {'title': 'Danh mục hệ thống', 'url': reverse('hrm:to_chuc_nhan_su:danh_muc_index')},
            {'title': 'Danh mục bảo hiểm', 'url': None},
        ],
        'page_title': 'Danh mục bảo hiểm',
        'status_list': STATUS_LIST # <--- Truyền biến này
    }
    return render(request, "hrm_manager/quan_ly_nhan_su/dmht_baohiem.html", context)

@login_required
def view_dmht_loainhanvien_list(request):
    context = {
        'breadcrumbs': [
            {'title': 'Quản lý nhân sự', 'url': '#'},
            {'title': 'Danh mục hệ thống', 'url': reverse('hrm:to_chuc_nhan_su:danh_muc_index')},
            {'title': 'Danh mục loại nhân viên', 'url': None},
        ],
        'page_title': 'Danh mục loại nhân viên',
        'status_list': STATUS_LIST # <--- Truyền biến này
    }
    return render(request, "hrm_manager/quan_ly_nhan_su/dmht_loainhanvien.html", context)

@login_required
def view_dmht_congviec_list(request):
    context = {
        'breadcrumbs': [
            {'title': 'Quản lý nhân sự', 'url': '#'},
            {'title': 'Danh mục hệ thống', 'url': reverse('hrm:to_chuc_nhan_su:danh_muc_index')},
            {'title': 'Danh mục công việc', 'url': None},
        ],
        'page_title': 'Danh mục công việc',
        'status_list': STATUS_LIST,
        'loai_cong_viec_list': [
            {'value': 'canhan', 'label': 'Cá nhân'},
            {'value': 'nhom', 'label': 'Nhóm / Tổ đội'},
        ]
    }
    return render(request, "hrm_manager/quan_ly_nhan_su/dmht_congviec.html", context)
# ============================================================================
# API URLS - DANH MỤC LISTS (JSON)
# ============================================================================

@login_required
@require_http_methods(["GET"])
@handle_exceptions
def api_nganhang_list(request):
    """API lấy danh sách ngân hàng (JSON) hỗ trợ search, filter, pagination"""
    queryset = Nganhang.objects.all()
    
    context = get_list_context(
        request,
        queryset,
        search_fields=['tennganhang', 'manganhang', 'tenviettat'],
        filter_field=('trangthai', 'status'),
        page_size=20,
        order_by='-created_at'
    )
    
    page_obj = context['page_obj']
    paginator = context['paginator']

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
    
    pagination_data = {
        'page': page_obj.number,
        'page_size': paginator.per_page, 
        'total': paginator.count,
        'total_pages': paginator.num_pages,
        'has_next': page_obj.has_next(),
        'has_prev': page_obj.has_previous()
    }
    
    return json_success(
        'Lấy danh sách ngân hàng thành công',
        data=items_list,
        pagination=pagination_data
    )

@login_required
@require_http_methods(["GET"])
@handle_exceptions
def api_baohiem_list(request):
    """API lấy danh sách bảo hiểm (JSON) hỗ trợ search, filter, pagination"""
    queryset = Baohiem.objects.all()
    
    context = get_list_context(
        request,
        queryset,
        search_fields=['tenbaohiem', 'mabaohiem'],
        filter_field=('trangthai', 'status'),
        page_size=20,
        order_by='-created_at'
    )
    
    page_obj = context['page_obj']
    paginator = context['paginator']

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

@login_required
@require_http_methods(["GET"])
@handle_exceptions
def api_loainhanvien_list(request):
    """API lấy danh sách loại nhân viên (JSON) hỗ trợ search, filter, pagination"""
    queryset = Loainhanvien.objects.all().annotate(
        is_default=Case(
            When(maloainv='NV', then=Value(0)),
            default=Value(1),
            output_field=IntegerField()
        )
    ).order_by('is_default', '-created_at')
    
    context = get_list_context(
        request,
        queryset,
        search_fields=['tenloainv', 'maloainv', 'phuongthuctinhluong'],
        filter_field=('trangthai', 'status'),
        page_size=20,
        order_by=None
    )
    
    page_obj = context['page_obj']
    paginator = context['paginator']

    items_list = []
    for item in page_obj.object_list:
        salary_method_raw = (item.phuongthuctinhluong or '').strip().lower()
        salary_method_alias = {
            'monthly': 'monthly',
            'thang': 'monthly',
            'tháng': 'monthly',
            'daily': 'daily',
            'ngay cong': 'daily',
            'ngày công': 'daily',
        }
        items_list.append({
            'id': item.id,
            'TenLoaiNV': item.tenloainv,
            'MaLoaiNV': item.maloainv,
            'PhuongThucTinhLuong': salary_method_alias.get(salary_method_raw, ''),
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


@require_http_methods(["GET"])
@handle_exceptions
def api_congviec_list(request):
    """API lấy danh sách công việc (JSON) hỗ trợ search, filter, pagination"""
    queryset = Congviec.objects.all().values()
    query_params = request.GET.dict()

    loai_cong_viec = query_params.get('loaicongviec', '').strip()
    if loai_cong_viec:
        queryset = queryset.filter(loaicongviec=loai_cong_viec)
    
    context = get_list_context(
        request,
        queryset,
        search_fields=['tencongviec', 'macongviec'],
        filter_field=('trangthaicv', 'status'),
        page_size=int(query_params.get('page_size', 10)),
        order_by='-created_at'
    )
    
    page_obj = context['page_obj']
    paginator = context['paginator']

    pagination_data = {
        'page': page_obj.number,
        'page_size': paginator.per_page, 
        'total': paginator.count,
        'total_pages': paginator.num_pages,
        'has_next': page_obj.has_next(),
        'has_prev': page_obj.has_previous()
    }
    
    return json_success(
        'Lấy danh sách công việc thành công',
        data=list(page_obj.object_list),
        pagination=pagination_data
    )



# ============================================================================
# API URLS - NGÂN HÀNG
# ============================================================================

@login_required
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

@login_required
@require_http_methods(["POST"])
def api_nganhang_create(request):
    """API tạo mới ngân hàng"""
    try:
        # SỬA LỖI: Dùng get_request_data thay vì request.POST
        data = get_request_data(request)
        
        is_valid, missing = validate_required_fields(
            data,  # Truyền data đã lấy được (JSON hoặc Form)
            ['TenNganHang', 'MaNganHang']
        )
        
        if not is_valid:
            return json_error('Vui lòng nhập đầy đủ tên và mã ngân hàng')
        
        ten_ngan_hang = data.get('TenNganHang')
        ma_ngan_hang = data.get('MaNganHang')
        
        if not validate_unique_field(Nganhang, 'manganhang', ma_ngan_hang):
            return json_error('Mã ngân hàng đã tồn tại')
        
        item = Nganhang.objects.create(
            tennganhang=ten_ngan_hang,
            manganhang=ma_ngan_hang,
            tenviettat=data.get('TenVietTat', ''),
            diachichinhanh=data.get('DiaChiChiNhanh', ''),
            trangthai='active',
            created_at=timezone.now(),
            updated_at=timezone.now()
        )
        
        return json_success('Thêm ngân hàng thành công', id=item.id)
        
    except Exception as e:
        return json_error(str(e), status=400)

@login_required
@require_http_methods(["POST", "PUT"])
def api_nganhang_update(request, pk):
    try:
        item = get_object_or_404(Nganhang, pk=pk)
        
        # Dùng get_request_data để lấy data dù là POST (FormData) hay PUT (JSON)
        data = get_request_data(request) 
        
        # Validate thủ công vì request.POST có thể rỗng nếu dùng PUT
        if not data.get('TenNganHang') or not data.get('MaNganHang'):
             return json_error('Vui lòng nhập đầy đủ tên và mã ngân hàng')

        ten_ngan_hang = data.get('TenNganHang')
        ma_ngan_hang = data.get('MaNganHang')
        
        if not validate_unique_field(Nganhang, 'manganhang', ma_ngan_hang, exclude_pk=pk):
            return json_error('Mã ngân hàng đã tồn tại')
        
        item.tennganhang = ten_ngan_hang
        item.manganhang = ma_ngan_hang
        item.tenviettat = data.get('TenVietTat', '')
        item.diachichinhanh = data.get('DiaChiChiNhanh', '')
        item.updated_at = timezone.now()
        item.save()
        
        return json_success('Cập nhật ngân hàng thành công')
    except Exception as e:
        return json_error(str(e), status=400)

@login_required
@require_http_methods(["POST", "DELETE"])
def api_nganhang_delete(request, pk):
    try:
        item = get_object_or_404(Nganhang, pk=pk)
        # ✅ BỔ SUNG: Check ngân hàng đang được nhân viên sử dụng
        is_used = Nhanvien.objects.filter(nganhang=item).exists()
        if is_used:
            return json_error('Không thể xóa: Ngân hàng đang được nhân viên sử dụng')
        
        success, message = safe_delete(item)
        return json_success(message) if success else json_error(message)
    except Exception as e:
        return json_error(str(e), status=400)

@login_required
@require_http_methods(["POST", "PUT"]) 
def api_nganhang_toggle_status(request, pk):
    try:
        item = get_object_or_404(Nganhang, pk=pk)
        data = get_request_data(request)
        item.trangthai = 'active' if data.get('is_active') else 'inactive'
        item.updated_at = timezone.now()
        item.save()
        return json_success('Cập nhật trạng thái thành công')
    except Exception as e:
        return json_error(str(e), status=400)


# ============================================================================
# API URLS - BẢO HIỂM
# ============================================================================

@login_required
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

@login_required
@require_http_methods(["POST"])
def api_baohiem_create(request):
    """API tạo mới bảo hiểm"""
    try:
        # SỬA LỖI: Lấy data JSON
        data = get_request_data(request)

        is_valid, missing = validate_required_fields(
            data, 
            ['TenBaoHiem', 'MaBaoHiem']
        )
        
        if not is_valid:
            return json_error('Vui lòng nhập đầy đủ tên và mã bảo hiểm')
        
        if not validate_unique_field(Baohiem, 'mabaohiem', data.get('MaBaoHiem')):
            return json_error('Mã bảo hiểm đã tồn tại')
        
        item = Baohiem.objects.create(
            tenbaohiem=data.get('TenBaoHiem'),
            mabaohiem=data.get('MaBaoHiem'),
            ghichu=data.get('GhiChu', ''),
            trangthai='active',
            created_at=timezone.now(),
            updated_at=timezone.now()
        )
        
        return json_success('Thêm bảo hiểm thành công', id=item.id)
        
    except Exception as e:
        return json_error(str(e), status=400)

@login_required
@require_http_methods(["POST", "PUT"])
def api_baohiem_update(request, pk):
    try:
        item = get_object_or_404(Baohiem, pk=pk)
        data = get_request_data(request)

        if not data.get('TenBaoHiem') or not data.get('MaBaoHiem'):
            return json_error('Vui lòng nhập đầy đủ thông tin')

        if not validate_unique_field(Baohiem, 'mabaohiem', data.get('MaBaoHiem'), exclude_pk=pk):
             return json_error('Mã bảo hiểm đã tồn tại')

        item.tenbaohiem = data.get('TenBaoHiem')
        item.mabaohiem = data.get('MaBaoHiem')
        item.ghichu = data.get('GhiChu', '')
        item.updated_at = timezone.now()
        item.save()
        
        return json_success('Cập nhật bảo hiểm thành công')
    except Exception as e:
        return json_error(str(e), status=400)

@login_required
@require_http_methods(["POST", "DELETE"])
def api_baohiem_delete(request, pk):
    try:
        item = get_object_or_404(Baohiem, pk=pk)
         # ✅ BỔ SUNG: Check bảo hiểm đang có nhân viên đăng ký active
        is_used = NhanvienBaohiem.objects.filter(
            baohiem=item,
            trangthai='active'
        ).exists()
        if is_used:
            return json_error('Không thể xóa: Bảo hiểm đang có nhân viên đăng ký')
        
        success, message = safe_delete(item)
        return json_success(message) if success else json_error(message)
    except Exception as e:
        return json_error(str(e), status=400)

@login_required
@require_http_methods(["POST", "PUT"])
def api_baohiem_toggle_status(request, pk):
    try:
        item = get_object_or_404(Baohiem, pk=pk)
        data = get_request_data(request)
        item.trangthai = 'active' if data.get('is_active') else 'inactive'
        item.updated_at = timezone.now()
        item.save()
        return json_success('Cập nhật trạng thái thành công')
    except Exception as e:
        return json_error(str(e), status=400)

# ============================================================================
# API URLS - LOẠI NHÂN VIÊN
# ============================================================================

@login_required
@require_http_methods(["GET"])
def api_loainhanvien_detail(request, pk):
    """API lấy chi tiết loại nhân viên"""
    try:
        item = get_object_or_404(Loainhanvien, pk=pk)
        salary_method_raw = (item.phuongthuctinhluong or '').strip().lower()
        salary_method_alias = {
            'monthly': 'monthly',
            'thang': 'monthly',
            'tháng': 'monthly',
            'daily': 'daily',
            'ngay cong': 'daily',
            'ngày công': 'daily',
        }
        salary_method = salary_method_alias.get(salary_method_raw, '')
        
        return json_response(
            success=True,
            data={
                'id': item.id,
                'TenLoaiNV': item.tenloainv,
                'MaLoaiNV': item.maloainv,
                'PhuongThucTinhLuong': salary_method,
                'GhiChu': item.ghichu or '',
                'tenloainv': item.tenloainv,
                'maloainv': item.maloainv,
                'phuongthuctinhluong': salary_method,
                'ghichu': item.ghichu or '',
                'trangthai': item.trangthai,
            }
        )
    except Exception as e:
        return json_error(str(e), status=400)

@login_required
@require_http_methods(["POST"])
def api_loainhanvien_create(request):
    """API tạo mới loại nhân viên"""
    try:
        # SỬA LỖI: Lấy data JSON
        data = get_request_data(request)
        salary_method_raw = (data.get('PhuongThucTinhLuong') or '').strip().lower()
        salary_method_alias = {
            'monthly': 'monthly',
            'thang': 'monthly',
            'tháng': 'monthly',
            'daily': 'daily',
            'ngay cong': 'daily',
            'ngày công': 'daily',
        }
        salary_method = salary_method_alias.get(salary_method_raw)

        is_valid, missing = validate_required_fields(
            data, 
            ['TenLoaiNV', 'MaLoaiNV']
        )
        
        if not is_valid:
            return json_error('Vui lòng nhập đầy đủ tên và mã loại nhân viên')

        if not salary_method:
            return json_error('Phương thức tính lương chỉ được chọn: Tháng hoặc Ngày công')
        
        if not validate_unique_field(Loainhanvien, 'maloainv', data.get('MaLoaiNV')):
            return json_error('Mã loại nhân viên đã tồn tại')
        
        item = Loainhanvien.objects.create(
            tenloainv=data.get('TenLoaiNV'),
            maloainv=data.get('MaLoaiNV'),
            phuongthuctinhluong=salary_method,
            ghichu=data.get('GhiChu', ''),
            trangthai='active',
            created_at=timezone.now(),
            updated_at=timezone.now()
        )
        
        return json_success('Thêm loại nhân viên thành công', id=item.id)
        
    except Exception as e:
        return json_error(str(e), status=400)

@login_required
@require_http_methods(["POST", "PUT"])
def api_loainhanvien_update(request, pk):
    try:
        item = get_object_or_404(Loainhanvien, pk=pk)
        data = get_request_data(request)
        salary_method_raw = (data.get('PhuongThucTinhLuong') or '').strip().lower()
        salary_method_alias = {
            'monthly': 'monthly',
            'thang': 'monthly',
            'tháng': 'monthly',
            'daily': 'daily',
            'ngay cong': 'daily',
            'ngày công': 'daily',
        }
        salary_method = salary_method_alias.get(salary_method_raw)

        if not data.get('TenLoaiNV') or not data.get('MaLoaiNV'):
            return json_error('Vui lòng nhập đầy đủ thông tin')

        if not salary_method:
            return json_error('Phương thức tính lương chỉ được chọn: Tháng hoặc Ngày công')
            
        if not validate_unique_field(Loainhanvien, 'maloainv', data.get('MaLoaiNV'), exclude_pk=pk):
             return json_error('Mã loại nhân viên đã tồn tại')

        item.tenloainv = data.get('TenLoaiNV')
        item.maloainv = data.get('MaLoaiNV')
        item.phuongthuctinhluong = salary_method
        item.ghichu = data.get('GhiChu', '')
        item.updated_at = timezone.now()
        item.save()
        
        return json_success('Cập nhật loại nhân viên thành công')
    except Exception as e:
        return json_error(str(e), status=400)

@login_required
@require_http_methods(["POST", "DELETE"])
def api_loainhanvien_delete(request, pk):
    try:
        item = get_object_or_404(Loainhanvien, pk=pk)
        if item.maloainv == 'NV': # Bảo vệ mã mặc định
             return json_error('Không thể xóa loại nhân viên mặc định')
        
        # ✅ BỔ SUNG: Check loại NV đang được sử dụng
        is_used = Nhanvien.objects.filter(loainv=item).exists()
        if is_used:
            return json_error('Không thể xóa: Loại nhân viên đang được gán cho nhân viên')
        
        success, message = safe_delete(item)
        return json_success(message) if success else json_error(message)
    except Exception as e:
        return json_error(str(e), status=400)

@login_required
@require_http_methods(["POST", "PUT"])
def api_loainhanvien_toggle_status(request, pk):
    try:
        item = get_object_or_404(Loainhanvien, pk=pk)
        data = get_request_data(request)
        item.trangthai = 'active' if data.get('is_active') else 'inactive'
        item.updated_at = timezone.now()
        item.save()
        return json_success('Cập nhật trạng thái thành công')
    except Exception as e:
        return json_error(str(e), status=400)


# ============================================================================
# API URLS - CÔNG VIỆC
# ============================================================================

@login_required
@require_http_methods(["GET"])
def api_congviec_detail(request, pk):
    """API lấy chi tiết công việc"""
    try:
        item = get_object_or_404(Congviec, pk=pk)
        
        return json_success(
            "Lấy chi tiết công việc thành công",
            data={
                'id': item.id,
                'tencongviec': item.tencongviec,
                'macongviec': item.macongviec,
                'loaicongviec': item.loaicongviec,
                'ghichu': item.ghichu or '',
                'bieuthuctinhtoan': item.bieuthuctinhtoan,
                'danhsachthamso': item.danhsachthamso,
                'trangthaicongthuc': item.trangthaicongthuc,
                'trangthaicv': item.trangthaicv,
            }
        )
    except Exception as e:
        return json_error(str(e), status=400)


@login_required
@require_http_methods(["POST"])
def api_congviec_create(request):
    """ API tạo mới công việc"""

    data = get_request_data(request)
    if not data:
        return json_error('Dữ liệu không hợp lệ', status=400)

    try:
        is_valid, _ = validate_required_fields(data, ['tencongviec', 'macongviec'])
        if not is_valid:
            return json_error('Vui lòng nhập đầy đủ mã và tên công việc')

        ma_cong_viec = (data.get('macongviec') or '').strip()
        if not validate_unique_field(Congviec, 'macongviec', ma_cong_viec):
            return json_error('Mã công việc đã tồn tại')

        ten_cong_viec = (data.get('tencongviec') or '').strip()
        congviec = Congviec.objects.create(
            tencongviec=ten_cong_viec.title(),
            macongviec=ma_cong_viec,
            ghichu=data.get('ghichu', ''),
            loaicongviec=data.get('loaicongviec', ''),
            bieuthuctinhtoan=data.get('bieuthuctinhtoan', ''),
            danhsachthamso=data.get('danhsachthamso', ''),
            trangthaicongthuc=data.get('trangthaicongthuc', ''),
            trangthaicv='active',
            created_at=timezone.now(),
        )

        return json_success(
            'Tạo công việc thành công',
            data= model_to_dict(congviec)
        )

    except Exception as e: 
        return JsonResponse({
            'success': False,
            'message': f'Lỗi: {str(e)}'
        }, status=400)
    

@login_required
@require_http_methods(["PUT"])
def api_congviec_update(request, pk):
    """API Cập nhật công việc"""

    data = get_request_data(request)
    if not data:
        return json_error('Dữ liệu không hợp lệ', status=400)
    
    try:
        congviec = get_object_or_404(Congviec, pk=pk)

        is_valid, _ = validate_required_fields(data, ['tencongviec', 'macongviec'])
        if not is_valid:
            return json_error('Vui lòng nhập đầy đủ mã và tên công việc')

        ma_cong_viec = (data.get('macongviec') or '').strip()
        if not validate_unique_field(Congviec, 'macongviec', ma_cong_viec, exclude_pk=pk):
            return json_error('Mã công việc đã tồn tại')

        ten_cong_viec = (data.get('tencongviec') or '').strip()
        data['macongviec'] = ma_cong_viec
        data['tencongviec'] = ten_cong_viec.title() if ten_cong_viec else ten_cong_viec

        for field in Congviec._meta.fields:
            if field.name in data:
                setattr(congviec, field.name, data[field.name])
        congviec.updated_at = timezone.now()
        congviec.save()

        return json_success(
            'Cập nhật công việc thành công',
            data=model_to_dict(congviec)
        )
    except Exception as e:
        return json_error(str(e), status=400)
    
@login_required
@require_http_methods(["DELETE"])
def api_congviec_delete(request, pk):
    """API Xóa công việc"""

    try:
        congviec = get_object_or_404(Congviec, pk=pk)
        # ✅ BỔ SUNG: Check công việc đã có dữ liệu chấm công
        has_attendance = Bangchamcong.objects.filter(congviec=congviec).exists()
        if has_attendance:
            # Có dữ liệu → chỉ cho inactive
            congviec.trangthaicv = 'inactive'
            congviec.updated_at = timezone.now()
            congviec.save()
            return json_success('Công việc đã có dữ liệu chấm công, đã chuyển sang ngừng hoạt động')
        
        congviec.delete()

        return json_success('Xóa công việc thành công')

    except Exception as e:
        return json_error(str(e), status=400)
    

@login_required
@require_http_methods(["POST"])
def api_congviec_toggle_status(request, pk):
    """API Chuyển đổi trạng thái công việc"""
    try:
        congviec = get_object_or_404(Congviec, pk=pk)

        data = get_request_data(request)
        new_status = 'active' if data.get('is_active') else 'inactive'
        
        # Chỉ cập nhật 2 trường cần thiết, tránh động vào các trường JSON
        Congviec.objects.filter(pk=pk).update(
            trangthaicv=new_status,
            updated_at=timezone.now()
        )

        return json_success('Cập nhật trạng thái công việc thành công')

    except Exception as e:
        return json_error(str(e), status=400)