from django.shortcuts import render, get_object_or_404
from django.views.decorators.http import require_POST
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.csrf import csrf_exempt

from django.forms.models import model_to_dict
from django.http import JsonResponse
from django.utils import timezone

from django.db import transaction
from .models import *

from json import loads, dumps


# Create your views here.
def view_danh_sach_thong_bao (request):
    return render(request, "dich_vu_dien_nuoc/danh_sach_thong_bao.html")

def view_bao_cao_doanh_thu (request):
    return render(request, "dich_vu_dien_nuoc/bao_cao_doanh_thu.html")

def view_quan_ly_loai_dich_vu (request):
    """Hiển thị danh sách loại dịch vụ"""

    loai_dich_vu_list = Loaidichvu.objects.all().order_by("id_loaidichvu")

    dich_vu_list = Dichvu.objects.all().order_by("id_dichvu").select_related("id_loaidichvu")

    context = {
        "danh_sach_dich_vu": dich_vu_list,
        "danh_sach_loai_dich_vu": loai_dich_vu_list
    }

    return render(request, "dich_vu_dien_nuoc/quan_ly_loai_dich_vu.html", context)

@require_POST
@transaction.atomic
def api_dich_vu_update_or_create(request):
    """Cập nhật hoặc tạo mới dịch vụ"""    
    try:
        data = loads(request.body)
        pk = data.get('id_dichvu', None)

        # Biến lưu lại dữ liệu được cập nhật hoặc tạo mới để response lại cho giao diện
        dich_vu_instance = None
    
        if pk:
            # Cập nhật dịch vụ
            dich_vu_instance = get_object_or_404(Dichvu, id_dichvu=pk)
            
            dich_vu_instance.id_loaidichvu_id = data.get("id_loaidichvu", None)
            dich_vu_instance.tendichvu = data.get("tendichvu", None)
            dich_vu_instance.chuthich = data.get("chuthich", None)
            dich_vu_instance.ngayghi = timezone.now()
            
            # Lưu lại các thay đổi
            dich_vu_instance.save()
        
        else:
            # Tạo mới dịch vụ
            data.pop("id_dichvu", None)

            dich_vu_instance = Dichvu.objects.create(
                id_loaidichvu_id=data.get("id_loaidichvu", None),
                tendichvu=data.get("tendichvu", None),
                chuthich=data.get("chuthich", None),
                ngayghi=timezone.now()
            )
        
        return JsonResponse({'success': True, 'message': 'Lưu loại dịch vụ thành công!', 'data': model_to_dict(dich_vu_instance)})
    
    except Exception as e:
        return JsonResponse({'success': False, 'message': f"Dữ liệu thêm mới chưa đúng - {str(e)}"}, status=400)
    

@require_POST
@transaction.atomic
def api_loai_dich_vu_update_or_create(request):
    """Cập nhật hoặc tạo mới Loại dịch vụ"""    
    try:
        data = loads(request.body)
        pk = data.get('id_loaidichvu', None)

        # Biến lưu lại dữ liệu được cập nhật hoặc tạo mới để response lại cho giao diện
        loai_dich_vu_instance = None

        if pk:
            # Cập nhật dịch vụ
            loai_dich_vu_instance = get_object_or_404(Loaidichvu, id_loaidichvu=pk)
            
            data.pop("id_dichvu", None) # Xóa id_dichvu khỏi data để tránh lỗi khi cập nhật
            for key, value in data.items():
                setattr(loai_dich_vu_instance, key, value)
            
            # Lưu lại các thay đổi
            loai_dich_vu_instance.save()
        
        else:
            # Tạo mới dịch vụ
            data.pop("id_loaidichvu", None)

            loai_dich_vu_instance = Loaidichvu.objects.create(
                tenloaidichvu=data.get("tenloaidichvu", None),
                chuthich=data.get("chuthich", None),
            )
        
        return JsonResponse({'success': True, 'message': 'Lưu loại dịch vụ thành công!', 'data': model_to_dict(loai_dich_vu_instance)})
    
    except Exception as e:
        return JsonResponse({'success': False, 'message': f"Dữ liệu thêm mới chưa đúng - {str(e)}"}, status=400)



def api_dich_vu_delete(request, pk):
    """Xóa dịch vụ"""        
    try: 
        dichvu = get_object_or_404(Dichvu, id_dichvu = pk)
        dichvu.delete()
        return JsonResponse({'success': True, 'message': 'Xóa dịch vụ thành công!'})
    except Exception as e:
        return JsonResponse({'success': False, 'message': str(e)}, status=400)


def api_loai_dich_vu_delete(request, pk):
    """Xóa loại dịch vụ"""
    try: 
        loaidichvu = get_object_or_404(Loaidichvu, id_loaidichvu = pk)
        loaidichvu.delete()
        return JsonResponse({'success': True, 'message': 'Xóa dịch vụ thành công!'})
    except Exception as e:
        return JsonResponse({'success': False, 'message': str(e)}, status=400)



def view_quan_ly_khach_thue (request):
    """Hiển thị danh sách hợp đồng thuê và các dịch vụ liên quan"""
    hopdong_list = Hopdong.objects.prefetch_related("hopdongdichvu_set__id_dichvu").order_by("-ngaytaohopdong")

    response_data = []
    for hopdong in hopdong_list:
        dichvu_list = [
            {
                "id_hopdongdichvu": dv.id_hopdongdichvu,
                "id_dichvu": dv.id_dichvu_id,
                "tendichvu": dv.id_dichvu.tendichvu,
                "donvitinh": dv.donvitinh,
                "dongia": dv.dongia,
                "chuthich": dv.chuthich
            }
            for dv in hopdong.hopdongdichvu_set.all()
        ]

        response_data.append({
            "id_hopdong": hopdong.id_hopdong,
            "tencongty": hopdong.tencongty,
            "kythanhtoan": hopdong.kythanhtoan,
            "sohd": hopdong.sohd,
            "chuthich": hopdong.chuthich,
            "ngaytaohopdong": hopdong.ngaytaohopdong,
            "tiencoc": hopdong.tiencoc,
            "ngayketthuc": hopdong.ngayketthuc if hopdong.ngayketthuc else "",
            "ngaybatdautinhtien": hopdong.ngaybatdautinhtien if hopdong.ngaybatdautinhtien else "",
            "trangthai": hopdong.trangthai,
            "dichvu_list": dumps(dichvu_list)
        })
    
    context = {
        "danh_sach_hop_dong": response_data
    }

    return render(request, "dich_vu_dien_nuoc/quan_ly_khach_thue.html", context)

@transaction.atomic
@require_POST
def api_quan_ly_khach_thue_update_or_create(request):
    try:
        data = loads(request.body)
        dichvu_list = data.pop('dichvu_list', [])
        hopdong_id = data.get('id_hopdong')

        # Chuyển đổi các trường ngày tháng và rỗng
        for field in ['ngaytaohopdong', 'ngayketthuc', 'ngaybatdautinhtien']:
            if data.get(field) == '':
                data[field] = None

        # Format dữ liệu số
        data['tiencoc'] = float(data.get('tiencoc', 0)) if data.get('tiencoc') else None
        
        # Logic cập nhật hoặc tạo mới Hợp đồng
        if hopdong_id:
            hopdong_instance = get_object_or_404(Hopdong, id_hopdong=hopdong_id)
            # Bỏ id_hopdong khỏi data trước khi cập nhật
            data.pop('id_hopdong', None)

            # Cập nhật các trường hợp có trong payload
            for key, value in data.items():
                setattr(hopdong_instance, key, value)
            hopdong_instance.save()
        else:
            data.pop('id_hopdong', None)
            hopdong_instance = Hopdong.objects.create(**data)

        # Lấy ra những dịch vụ gửi lên từ payload
        submitted_dichvu_ids = {item.get('id_hopdongdichvu') for item in dichvu_list if item.get('id_hopdongdichvu')}
        
        # Xóa những dịch vụ không có trong payload gửi lên
        HopdongDichvu.objects.filter(id_hopdong=hopdong_instance).exclude(id_hopdongdichvu__in=submitted_dichvu_ids).delete()

        # Cập nhật hoặc tạo mới dịch vụ
        for service_data in dichvu_list:
            if not service_data.get('id_dichvu'):
                continue

            hopdong_dichvu_id = service_data.get('id_hopdongdichvu')
            
            defaults = {
                'id_dichvu_id': service_data['id_dichvu'],
                'donvitinh': service_data.get('donvitinh'),
                'dongia': service_data.get('dongia', 0) if service_data.get("dongia") else None,
                'chuthich': service_data.get('chuthich')
            }

            if hopdong_dichvu_id:
                # Cập nhật
                HopdongDichvu.objects.filter(id_hopdongdichvu=hopdong_dichvu_id).update(**defaults)
            else:
                # Tạo mới
                HopdongDichvu.objects.create(
                    id_hopdong=hopdong_instance,
                    **defaults
                )
        
        return JsonResponse({'success': True, 'message': 'Lưu hợp đồng thành công!'})

    except Exception as e:
        return JsonResponse({'success': False, 'message': f"Dữ liệu thêm mới chưa đúng - {str(e)}"}, status=400)

@transaction.atomic
@require_POST
def api_quan_ly_khach_thue_delete(request, pk):
    try:
        hopdong = get_object_or_404(Hopdong, id_hopdong=pk)
        hopdong.delete()
        return JsonResponse({'success': True, 'message': 'Xóa hợp đồng thành công!'})
    except Exception as e:
        return JsonResponse({'success': False, 'message': str(e)}, status=400)

def api_get_all_services (request):
    dich_vu = Dichvu.objects.all().values("id_dichvu", "tendichvu")
    return JsonResponse(list(dich_vu), safe=False)