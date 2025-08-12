from django.shortcuts import render, get_object_or_404
from django.views.decorators.http import require_POST
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.csrf import csrf_exempt

from django.forms.models import model_to_dict
from django.http import JsonResponse

from django.db import transaction
from .models import *

from json import loads, dumps


# Create your views here.
def view_danh_sach_thong_bao (request):
    return render(request, "dich_vu_dien_nuoc/danh_sach_thong_bao.html")

def view_bao_cao_doanh_thu (request):
    return render(request, "dich_vu_dien_nuoc/bao_cao_doanh_thu.html")

def view_quan_ly_loai_dich_vu (request):
    return render(request, "dich_vu_dien_nuoc/quan_ly_loai_dich_vu.html")

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