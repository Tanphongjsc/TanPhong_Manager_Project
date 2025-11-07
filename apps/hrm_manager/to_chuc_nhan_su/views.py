from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.forms.models import model_to_dict

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
# @login_required
@csrf_exempt
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

            phong_ban = Phongban.objects.create(
                maphongban=data.get('maphongban'),
                tenphongban=data.get('tenphongban').title(),
                level=data.get('level'),
                ghichu=data.get('ghichu'),
                trangthai=data.get('trangthai'),
                congty=data.get('congty'),
                phongbancha_id=data.get('phongbancha_id'),
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
                    'congty': phong_ban.congty,
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
                    'congty': phong_ban.congty,
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
@csrf_exempt
@require_http_methods(["GET"])
def api_phong_ban_nhan_vien(request, id):
    # """API lấy danh sách nhân sự theo phòng ban"""

    # if id:
    #     try: 
    #         nhan_vien_list = Nhanvien.objects.filter(phongban_id=id).values()
    #         return JsonResponse({
    #             'success': True,
    #             'data': list(nhan_vien_list),
    #             'total': nhan_vien_list.count()
    #         })
        
    #     except Exception as e:
    #         return JsonResponse({
    #             'success': False,
    #             'message': f'Lỗi: {str(e)}'
    #         }, status=400)
    
    # return JsonResponse({
    #     'success': False,
    #     'message': 'Lỗi thiếu ID phòng ban'
    # }, status=400)
    pass



def api_phong_ban_tree(request):
    pass



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


