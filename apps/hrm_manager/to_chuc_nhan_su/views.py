from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.forms.models import model_to_dict
from django.db.models import OuterRef, Subquery, Q, Prefetch

from apps.hrm_manager.__core__.models import *

from datetime import datetime
from json import loads


# ===============================================================
# ================= QUẢN LÝ CÂY NHÂN SỰ =========================
# ===============================================================


def view_cay_nhan_su_index(request):
    return render(request, "hrm_manager/quan_ly_nhan_su/caynhansu.html")

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
        phong_ban_list = Phongban.objects.all().values()

        return JsonResponse({
            'success': True,
            'data': list(phong_ban_list),
            'total': phong_ban_list.count()
        })
    
    elif request.method == "POST":
        # Tạo mới phòng ban
        try:
            data = loads(request.body)
            phong_ban_cha = Phongban.objects.filter(id=data.get('phongbancha_id', "")).first()

            phong_ban = Phongban.objects.create(
                maphongban=data.get('maphongban'),
                tenphongban=data.get('tenphongban').title(),
                level=phong_ban_cha.level + 1 if phong_ban_cha else 1,
                ghichu=data.get('ghichu'),
                trangthai=data.get('trangthai'),
                congty_id=data.get('congty'),
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
                    setattr(phong_ban, field.name, data[field.name])

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
            phong_ban.delete()
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
    # """API lấy danh sách nhân sự theo phòng ban"""

    # Lấy ID công ty từ request nếu cần lọc theo công ty
    param_query = request.GET.dict()
    congty_id = param_query.pop('congty_id', None)
    phongban_id = param_query.pop('phongban_id', None)
    chucvu = param_query.pop('chucvu', None)

    try:        
        # 1. Build filters chung trên join (từ Lichsucongtac)
        filters = Q(trangthai='active')  # Bắt buộc active từ Lichsu
        if chucvu:
            filters &= Q(chucvu_id=chucvu)  # Giả sử chucvu là ID
        if phongban_id:
            filters &= Q(phongban_id=phongban_id)
        elif congty_id:
            filters &= Q(phongban__congty_id=congty_id)
        
        # Thêm filters từ nhân viên (áp dụng chung trên join)
        fields_nhan_vien = ["nhanvien__gioitinh", "nhanvien__loainv_id", "nhanvien__trangthainv", "nhanvien__trangthai"]
        for key in fields_nhan_vien:
            raw_key = key.replace('nhanvien__', '')  # Map về param gốc
            value = param_query.get(raw_key)
            if value:
                filters &= Q(**{key: value})

        # 2. Query từ Lichsucongtac với join (select_related)
        qs = Lichsucongtac.objects.filter(filters).select_related(
            'nhanvien', 'nhanvien__loainv', 'nhanvien__nganhang',  # Join nhân viên + related
            'phongban', 'chucvu'  # Join cho cong_tac
        ).distinct('nhanvien__id')  # Unique theo nhân viên (nếu có duplicate active)

        # 3. Fields cần thiết (tối ưu data tải về) Lấy fields từ Nhanvien + build cong_tac từ Lichsu
        result = []
        for lichsu in qs:
            nv = lichsu.nhanvien
            cong_tac = {
                'phong_ban': lichsu.phongban.tenphongban if lichsu.phongban else None,
                'chuc_vu': lichsu.chucvu.tenchucvu if lichsu.chucvu else None,  # Giả sử Chucvu có tenchucvu
            }
            nv_data = model_to_dict(nv)
            nv_data['cong_tac'] = cong_tac

            result.append(nv_data)

        return JsonResponse({
            'success': True,
            'data': result,
            'total': len(result)
        })

    except Exception as e:
        return JsonResponse({
            'success': False,
            'message': f'Lỗi: {str(e)}'
        }, status=400)


# @login_required
@require_http_methods(["GET"])
def api_phong_ban_tree(request):
    """API lấy cây phòng ban"""

    try:
        # 1. Lấy tất cả công ty
        cong_ty_qs = Congty.objects.values('id', 'tencongty_vi', 'macongty').order_by('id')  # chỉ lấy field cần thiết

        # 2. Lấy tất cả phòng ban + prefetch công ty để tránh N+1
        phong_ban_qs = Phongban.objects.select_related('congty').values(
            'id', 'tenphongban', 'phongbancha_id', 'congty_id', 'level', 'maphongban'
        )

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



# # ==================== API NHÂN VIÊN ====================

# @login_required
@require_http_methods(["GET", "POST"])
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
                ngayvaolam=data.get('ngayvaolam'),
                loainv=data.get('loainv'),
                trangthainv=data.get('trangthainv'),
                nganhang=data.get('nganhang'),
                sotknganhang=data.get('sotknganhang'),
                tentknganhang=data.get('tentknganhang'),
                masothue=data.get('masothue'),
                trangthai=data.get('trangthai', 'active'),
                created_at=datetime.now()
            )
            
            return JsonResponse({
                'success': True,
                'message': 'Tạo công ty thành công',
                'data': {
                    'id': nhan_vien.id,
                    'manhanvien': nhan_vien.manhanvien,
                    'hovaten': nhan_vien.hovaten,
                    'email': nhan_vien.email,
                    'sodienthoai': nhan_vien.sodienthoai,
                    'diachi': nhan_vien.diachi,
                    'gioitinh': nhan_vien.gioitinh,
                    'ngaysinh': nhan_vien.ngaysinh,
                    'socccd': nhan_vien.socccd,
                    'ngayvaolam': nhan_vien.ngayvaolam,
                    'loainv': nhan_vien.loainv,
                    'trangthainv': nhan_vien.trangthainv,
                    'nganhang': nhan_vien.nganhang,
                    'sotknganhang': nhan_vien.sotknganhang,
                    'tentknganhang': nhan_vien.tentknganhang,
                    'masothue': nhan_vien.masothue,
                    'trangthai': nhan_vien.trangthai,
                    'created_at': nhan_vien.created_at,
                }
            }, status=201)
            
        except Exception as e:
            return JsonResponse({
                'success': False,
                'message': f'Lỗi: {str(e)}'
            }, status=400)


# @login_required
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
                    setattr(nhan_vien, field.name, data[field.name])

            nhan_vien.updated_at = datetime.now()
            nhan_vien.save()
            
            return JsonResponse({
                'success': True,
                'message': 'Cập nhật nhân viên thành công',
                'data': {
                    'id': nhan_vien.id,
                    'manhanvien': nhan_vien.manhanvien,
                    'hovaten': nhan_vien.hovaten,
                    'email': nhan_vien.email,
                    'sodienthoai': nhan_vien.sodienthoai,
                    'diachi': nhan_vien.diachi,
                    'gioitinh': nhan_vien.gioitinh,
                    'ngaysinh': nhan_vien.ngaysinh,
                    'socccd': nhan_vien.socccd,
                    'ngayvaolam': nhan_vien.ngayvaolam,
                    'loainv': nhan_vien.loainv,
                    'trangthainv': nhan_vien.trangthainv,
                    'nganhang': nhan_vien.nganhang,
                    'sotknganhang': nhan_vien.sotknganhang,
                    'tentknganhang': nhan_vien.tentknganhang,
                    'masothue': nhan_vien.masothue,
                    'trangthai': nhan_vien.trangthai,
                    'created_at': nhan_vien.created_at,
                }
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



def view_bao_cao_index(request):
    return render(request, "hrm_manager/quan_ly_nhan_su/baocao.html")


# ===============================================================
# ================= QUẢN LÝ CHỨC VỤ =============================
# ===============================================================

@login_required
def view_chuc_vu_index(request):
    return render(request, "hrm_manager/quan_ly_nhan_su/chucvu.html")

# ==================== API CHỨC VỤ ====================

@login_required
@require_http_methods(["GET", "POST"])
def api_chuc_vu_list(request):
    """API lấy danh sách và tạo mới chức vụ"""
    
    if request.method == "GET":
        # Lấy danh sách chức vụ
        chuc_vu_list = Chucvu.objects.all().order_by('id').values()
        
        return JsonResponse({
            'success': True,
            'data': list(chuc_vu_list),
            'total': chuc_vu_list.count()
        })
    
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
            data = loads(request.body)
            
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


def view_danh_muc_index(request):
    return render(request, "hrm_manager/quan_ly_nhan_su/danhmuchethong.html")

def view_bo_thuong_index(request):
    return render(request, "hrm_manager/quan_ly_nhan_su/quanlythongtin_boithuong.html")

def view_tam_ung_index(request):
    return render(request, "hrm_manager/quan_ly_nhan_su/quanlythongtin_quanlytamung.html")


