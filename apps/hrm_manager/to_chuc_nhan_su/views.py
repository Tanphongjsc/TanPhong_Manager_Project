from django.shortcuts import render, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.urls import reverse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.forms.models import model_to_dict
from django.db.models import OuterRef, Subquery, Q, Prefetch
from django.db import transaction
from django.core.paginator import Paginator, EmptyPage, PageNotAnInteger
from django.utils import timezone

import json
from datetime import datetime, timedelta
from json import loads
from collections import defaultdict

from apps.hrm_manager.__core__.models import *

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
# VIEW URLS - TRANG CHÍNH
# ============================================================================

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

def view_nhan_vien_index(request, id):
    """Hiển thị trang chi tiết nhân viên từ cây nhân sự"""

    nhan_vien = get_object_or_404(Nhanvien, id=id)

    context = {
        'breadcrumbs': [
            {'title': 'Quản lý nhân sự', 'url': '#'},
            {'title': 'Cây nhân sự', 'url': reverse('hrm:to_chuc_nhan_su:cay_nhan_su_index')},
            {'title': nhan_vien.hovaten, 'url': None},
        ],
        'nhan_vien': nhan_vien,
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
@login_required
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

@login_required
@require_http_methods(["GET"])
def api_phong_ban_nhan_vien(request):
    """API lấy danh sách nhân sự theo phòng ban"""

    # Lấy tham số lọc từ query params
    param_query = request.GET.dict()
    print(param_query.get('phongban_id', None))
    page = param_query.pop('page', 1)
    page_size = param_query.pop('page_size', 10)
    search_param = param_query.pop('search', '').strip()
    congty_id = param_query.pop('congty_id', None)
    phongban_ids = get_all_child_department_ids(param_query.pop('phongban_id', None), isnclude_root=True)

    print("PHÒNG BAN IDS:", phongban_ids)

    try:        
        # Build filters từ Lichsucongtac
        filters = Q(trangthai='active')  # Bắt buộc active từ Lichsu
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
        
        # Thêm query param tìm kiếm & nhân viên còn active
        filters &= Q(nhanvien__hovaten__icontains=search_param) | Q(nhanvien__manhanvien__icontains=search_param) if search_param else Q()
        filters &= Q(nhanvien__isnull=False)

        # Query từ Lichsucongtac với join (select_related)
        qs = Lichsucongtac.objects.filter(filters).select_related(
            'nhanvien', 'nhanvien__loainv', 'nhanvien__nganhang',  # Join nhân viên + related
            'phongban', 'chucvu'  # Join cho cong_tac
        ).distinct('nhanvien__id')  # Unique theo nhân viên (nếu có duplicate active)

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
            }
            nv_data = {
                'id': nv.id,
                'manhanvien': nv.manhanvien,
                'hovaten': nv.hovaten,
                'email': nv.email,
                'trangthainv': nv.trangthainv,
                'ngayvaolam': nv.ngayvaolam,
            }
            nv_data['cong_tac'] = cong_tac

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
        # 1. Lấy tất cả công ty
        cong_ty_qs = Congty.objects.values('id', 'tencongty_vi', 'macongty').order_by('id')

        # 2. Lấy tất cả phòng ban + prefetch công ty để tránh N+1
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
    Trả về list tất cả ID con, cháu, chắt... của một phòng ban.
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
                loainv_id=data.get('loainv'),
                trangthainv=data.get('trangthainv') if data.get('trangthainv') else 'Đang làm việc',
                nganhang_id=data.get('nganhang'),
                sotknganhang=data.get('sotknganhang'),
                tentknganhang=data.get('tentknganhang'),
                masothue=data.get('masothue'),
                trangthai=data.get('trangthai', 'active'),
                created_at=datetime.now(),
            )
            
            lich_su_new = Lichsucongtac.objects.create(
                batdau=data.get('batdau', datetime.now()+timedelta(days=1)),
                ketthuc=None,
                noicongtac=data.get('noicongtac'),
                trangthai=data.get('trangthai', 'active'),
                nhanvien_id = nhan_vien.id,
                phongban_id=data.get('phongban'),
                chucvu_id=data.get('chucvu'),
                created_at=datetime.now(),
            )

            return JsonResponse({
                'success': True,
                'message': 'Tạo công ty thành công',
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
            nhan_vien = Nhanvien.objects.filter(id__in = nhan_vien_ids)
            nhan_vien.delete()

            return JsonResponse({
                "success" :True,
                "message": "Xóa nhân viên thành công"
            })
        
        except Exception as e:
            return JsonResponse({
                'success': False,
                'message': f'Lỗi: {str(e)}'
            }, status=400)


@login_required
@transaction.atomic
@require_http_methods(["GET", "PUT", "DELETE"])
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
            'data': model_to_dict(nhan_vien)
        })
    
    elif request.method == "PUT":
        # Cập nhật nhân viên
        try:
            data = loads(request.body)

            for field in nhan_vien._meta.fields:
                if field.name in data:
                    if field.name in ['loainv', 'nganhang']:
                        setattr(nhan_vien, f"{field.name}_id", data[field.name] if data[field.name] else None)
                    else:
                        setattr(nhan_vien, field.name, data.get(field.name) if data.get(field.name) else None)

            nhan_vien.updated_at = datetime.now()
            nhan_vien.save()
            
            return JsonResponse({
                'success': True,
                'message': 'Cập nhật nhân viên thành công',
                'data': model_to_dict(nhan_vien)
            })
            
        except Exception as e:
            return JsonResponse({
                'success': False,
                'message': f'Lỗi: {str(e)}'
            }, status=400)
    
    elif request.method == "DELETE":
        # Xóa Nhân Viên
        try:
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
        trang_thai = request.GET.get("trangthai", 'all')

        lich_su_qs = Lichsucongtac.objects.all().values()

        if trang_thai != 'all':
            lich_su_qs = lich_su_qs.filter(trangthai=trang_thai)

        return JsonResponse({
            'success': True,
            'data': list(lich_su_qs),
            'total': len(lich_su_qs)
        })


    if request.method == "POST":
        # Tạo mới lịch sử công tác
        try:
            data = loads(request.body)
            nhanvien_id = data.get('nhanvien_id')

            lich_su_old = get_object_or_404(Lichsucongtac, nhanvien_id=nhanvien_id, trangthai='active')
            if lich_su_old:
                lich_su_old.ketthuc = data.get('batdau')
                lich_su_old.trangthai = 'inactive'
                lich_su_old.updated_at = datetime.now()
                lich_su_old.save()

            lich_su_new = Lichsucongtac.objects.create(
                batdau=data.get('batdau', datetime.now()+timedelta(days=1)),
                ketthuc=None,
                noicongtac=data.get('noicongtac'),
                trangthai=data.get('trangthai', 'active'),
                nhanvien_id = data.get('nhanvien_id'),
                phongban_id=data.get('phongban_id'),
                chucvu_id=data.get('chucvu_id'),
                created_at=datetime.now() + timedelta(days=1),
            )

            return JsonResponse({
                'success': True,
                'message': 'Tạo lịch sử công tác thành công',
                'data': model_to_dict(lich_su_new)
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
        nhan_vien_ids = request.GET.get('nhan_vien_ids', [])
        phong_ban_id = request.GET.get('phong_ban_id')

        if not nhan_vien_ids or not phong_ban_id:
            return JsonResponse({
                'success': False,
                'message': 'Thiếu nhan_vien_ids hoặc phong_ban_id'
            }, status=400)

        # Cập nhật phòng ban cho các nhân viên
        Lichsucongtac.objects.filter(
            nhanvien_id__in=nhan_vien_ids,
            trangthai='active'  # Chỉ cập nhật lịch sử công tác đang active
        ).update(
            phongban_id=phong_ban_id,
            updated_at=datetime.now()
        )

        return JsonResponse({
            'success': True,
            'message': 'Cập nhật phòng ban cho nhân viên thành công'
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

    trang_thai = request.GET.get("trangthai", 'all')
    lich_su = Lichsucongtac.objects.filter(nhanvien_id=id, trangthai = trang_thai).select_related('phongban', 'chucvu').first()

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
            {'title': 'Chức vụ', 'url': None},
        ],
        'status_list': [
            {'value': 'active', 'label': 'Đang hoạt động'},
            {'value': 'inactive', 'label': 'Ngừng hoạt động'}
        ]
        
    }

    return render(request, "hrm_manager/quan_ly_nhan_su/chucvu.html", context=context)


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
            data = loads(request.body)
            
            chuc_vu = Chucvu.objects.create(
                machucvu=data.get('machucvu'),
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
            # data = loads(request.body)
            data = get_request_data(request)
            
            chuc_vu.machucvu = data.get('machucvu', chuc_vu.machucvu)
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
            chuc_vu.delete()
            return JsonResponse({
                'success': True,
                'message': 'Xóa chức vụ thành công'
            })
        except Exception as e:
            return JsonResponse({
                'success': False,
                'message': f'Lỗi: {str(e)}'
            }, status=400)

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

def view_danh_muc_index(request):
    """Hiển thị trang danh mục hệ thống"""
    return render(request, "hrm_manager/quan_ly_nhan_su/danhmuchethong.html")


def view_bo_thuong_index(request):
    """Hiển thị trang quản lý bồi thường"""
    return render(request, "hrm_manager/quan_ly_nhan_su/quanlythongtin_boithuong.html")


def view_tam_ung_index(request):
    """Hiển thị trang quản lý tạm ứng"""
    return render(request, "hrm_manager/quan_ly_nhan_su/quanlythongtin_quanlytamung.html")

STATUS_LIST = [
    {'value': 'active', 'label': 'Đang hoạt động'},
    {'value': 'inactive', 'label': 'Ngừng hoạt động'}
]

def view_dmht_nganhang_list(request):
    context = {
        'breadcrumbs': [
            {'title': 'Quản lý nhân sự', 'url': '#'},
            {'title': 'Danh mục hệ thống', 'url': reverse('hrm:to_chuc_nhan_su:danh_muc_index')},
            {'title': 'Danh mục ngân hàng', 'url': None},
        ],
        'status_list': STATUS_LIST  # <--- Truyền biến này sang HTML
    }
    return render(request, "hrm_manager/quan_ly_nhan_su/dmht_nganhang.html", context)

def view_dmht_baohiem_list(request):
    context = {
        'breadcrumbs': [
            {'title': 'Quản lý nhân sự', 'url': '#'},
            {'title': 'Danh mục hệ thống', 'url': reverse('hrm:to_chuc_nhan_su:danh_muc_index')},
            {'title': 'Danh mục bảo hiểm', 'url': None},
        ],
        'status_list': STATUS_LIST # <--- Truyền biến này
    }
    return render(request, "hrm_manager/quan_ly_nhan_su/dmht_baohiem.html", context)

def view_dmht_loainhanvien_list(request):
    context = {
        'breadcrumbs': [
            {'title': 'Quản lý nhân sự', 'url': '#'},
            {'title': 'Danh mục hệ thống', 'url': reverse('hrm:to_chuc_nhan_su:danh_muc_index')},
            {'title': 'Danh mục loại nhân viên', 'url': None},
        ],
        'status_list': STATUS_LIST # <--- Truyền biến này
    }
    return render(request, "hrm_manager/quan_ly_nhan_su/dmht_loainhanvien.html", context)


# ============================================================================
# API URLS - DANH MỤC LISTS (JSON)
# ============================================================================

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


@require_http_methods(["GET"])
@handle_exceptions
def api_loainhanvien_list(request):
    """API lấy danh sách loại nhân viên (JSON) hỗ trợ search, filter, pagination"""
    queryset = Loainhanvien.objects.all()
    
    context = get_list_context(
        request,
        queryset,
        search_fields=['tenloainv', 'maloainv'],
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


@require_http_methods(["POST", "DELETE"])
def api_nganhang_delete(request, pk):
    try:
        item = get_object_or_404(Nganhang, pk=pk)
        success, message = safe_delete(item)
        return json_success(message) if success else json_error(message)
    except Exception as e:
        return json_error(str(e), status=400)


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

@require_http_methods(["POST", "DELETE"])
def api_baohiem_delete(request, pk):
    try:
        item = get_object_or_404(Baohiem, pk=pk)
        success, message = safe_delete(item)
        return json_success(message) if success else json_error(message)
    except Exception as e:
        return json_error(str(e), status=400)

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
        # SỬA LỖI: Lấy data JSON
        data = get_request_data(request)

        is_valid, missing = validate_required_fields(
            data, 
            ['TenLoaiNV', 'MaLoaiNV']
        )
        
        if not is_valid:
            return json_error('Vui lòng nhập đầy đủ tên và mã loại nhân viên')
        
        if not validate_unique_field(Loainhanvien, 'maloainv', data.get('MaLoaiNV')):
            return json_error('Mã loại nhân viên đã tồn tại')
        
        item = Loainhanvien.objects.create(
            tenloainv=data.get('TenLoaiNV'),
            maloainv=data.get('MaLoaiNV'),
            ghichu=data.get('GhiChu', ''),
            trangthai='active',
            created_at=timezone.now(),
            updated_at=timezone.now()
        )
        
        return json_success('Thêm loại nhân viên thành công', id=item.id)
        
    except Exception as e:
        return json_error(str(e), status=400)


@require_http_methods(["POST", "PUT"])
def api_loainhanvien_update(request, pk):
    try:
        item = get_object_or_404(Loainhanvien, pk=pk)
        data = get_request_data(request)

        if not data.get('TenLoaiNV') or not data.get('MaLoaiNV'):
            return json_error('Vui lòng nhập đầy đủ thông tin')
            
        if not validate_unique_field(Loainhanvien, 'maloainv', data.get('MaLoaiNV'), exclude_pk=pk):
             return json_error('Mã loại nhân viên đã tồn tại')

        item.tenloainv = data.get('TenLoaiNV')
        item.maloainv = data.get('MaLoaiNV')
        item.ghichu = data.get('GhiChu', '')
        item.updated_at = timezone.now()
        item.save()
        
        return json_success('Cập nhật loại nhân viên thành công')
    except Exception as e:
        return json_error(str(e), status=400)

@require_http_methods(["POST", "DELETE"])
def api_loainhanvien_delete(request, pk):
    try:
        item = get_object_or_404(Loainhanvien, pk=pk)
        if item.maloainv == 'NV': # Bảo vệ mã mặc định
             return json_error('Không thể xóa loại nhân viên mặc định')
             
        success, message = safe_delete(item)
        return json_success(message) if success else json_error(message)
    except Exception as e:
        return json_error(str(e), status=400)

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
