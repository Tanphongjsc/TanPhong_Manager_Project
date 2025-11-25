"""
File: view_helpers.py
Helper functions for Django Function-based Views
Author: ThanhTrung
Created: 2025-11-14
"""

from django.core.paginator import Paginator
from django.db.models import Q
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from functools import wraps
import json


# ============================================================================
# PAGINATION HELPERS
# ============================================================================

def paginate_queryset(request, queryset, page_size_param='page_size', default_page_size=20):
    """
    Phân trang queryset
    
    Args:
        request: Django request object
        queryset: QuerySet cần phân trang
        page_size_param: Tên parameter cho page size (default: 'page_size')
        default_page_size: Số items mặc định (default: 20)
    
    Returns:
        tuple: (page_obj, paginator)
    
    Usage:
        page_obj, paginator = paginate_queryset(request, queryset)
        
        context = {
            'object_list': page_obj,
            'paginator': paginator,
            'page_obj': page_obj,
            'is_paginated': page_obj.has_other_pages(),
        }
    """
    page_size = int(request.GET.get(page_size_param, default_page_size))
    page_number = request.GET.get('page', 1)
    
    paginator = Paginator(queryset, page_size)
    page_obj = paginator.get_page(page_number)
    
    return page_obj, paginator


# ============================================================================
# SEARCH & FILTER HELPERS
# ============================================================================

def search_queryset(request, queryset, search_fields, search_param='search'):
    """
    Tìm kiếm trong queryset
    
    Args:
        request: Django request object
        queryset: QuerySet cần tìm kiếm
        search_fields: List các field để search (VD: ['TenNganHang', 'MaNganHang'])
        search_param: Tên parameter cho search (default: 'search')
    
    Returns:
        QuerySet: Queryset đã được filter
    
    Usage:
        queryset = search_queryset(
            request, 
            queryset, 
            ['TenNganHang', 'MaNganHang', 'TenVietTat']
        )
    """
    search_query = request.GET.get(search_param, '').strip()
    
    if not search_query:
        return queryset
    
    q_objects = Q()
    for field in search_fields:
        q_objects |= Q(**{f'{field}__icontains': search_query})
    
    return queryset.filter(q_objects)


def filter_by_status(request, queryset, status_field='TrangThai', status_param='status'):
    """
    Lọc theo trạng thái
    
    Args:
        request: Django request object
        queryset: QuerySet cần lọc
        status_field: Tên field chứa status trong model (default: 'TrangThai')
        status_param: Tên parameter cho status filter (default: 'status')
    
    Returns:
        QuerySet: Queryset đã được filter
    
    Usage:
        queryset = filter_by_status(request, queryset)
        # hoặc custom
        queryset = filter_by_status(request, queryset, 'trangthai', 'trang_thai')
    """
    status_filter = request.GET.get(status_param, '').strip()
    
    if status_filter:
        return queryset.filter(**{status_field: status_filter})
    
    return queryset


def filter_by_field(request, queryset, field_name, param_name=None):
    """
    Lọc theo một field bất kỳ
    
    Args:
        request: Django request object
        queryset: QuerySet cần lọc
        field_name: Tên field trong model
        param_name: Tên parameter (nếu None thì dùng field_name)
    
    Returns:
        QuerySet: Queryset đã được filter
    
    Usage:
        queryset = filter_by_field(request, queryset, 'loai_hop_dong')
    """
    param_name = param_name or field_name
    value = request.GET.get(param_name, '').strip()
    
    if value:
        return queryset.filter(**{field_name: value})
    
    return queryset


# ============================================================================
# JSON RESPONSE HELPERS
# ============================================================================

def json_response(success=True, message='', data=None, status=200):
    """
    Tạo JSON response chuẩn
    
    Args:
        success: Boolean (True/False)
        message: String message
        data: Dict chứa data bổ sung (optional)
        status: HTTP status code (default: 200)
    
    Returns:
        JsonResponse
    
    Usage:
        return json_response(
            success=True, 
            message='Thành công', 
            data={'id': 1}
        )
    """
    response_data = {
        'success': success,
        'message': message,
    }
    
    if data is not None:
        if isinstance(data, dict):
            response_data.update(data)
        else:
            response_data['data'] = data
    
    return JsonResponse(response_data, status=status)


def json_error(message, status=400, **kwargs):
    """
    Shortcut cho error response
    
    Usage:
        return json_error('Có lỗi xảy ra', status=400)
    """
    return json_response(success=False, message=message, data=kwargs, status=status)


def json_success(message, **kwargs):
    """
    Shortcut cho success response
    
    Usage:
        return json_success('Thành công', id=item.id)
    """
    return json_response(success=True, message=message, data=kwargs)


# ============================================================================
# VALIDATION HELPERS
# ============================================================================

def validate_required_fields(data, required_fields):
    """
    Validate các trường bắt buộc
    
    Args:
        data: Dict hoặc QueryDict (request.POST)
        required_fields: List các field bắt buộc
    
    Returns:
        tuple: (is_valid: bool, missing_fields: list)
    
    Usage:
        is_valid, missing = validate_required_fields(
            request.POST,
            ['TenNganHang', 'MaNganHang']
        )
        
        if not is_valid:
            return json_error(f'Thiếu các trường: {", ".join(missing)}')
    """
    missing_fields = []
    
    for field in required_fields:
        value = data.get(field, '').strip() if hasattr(data.get(field, ''), 'strip') else data.get(field, '')
        if not value:
            missing_fields.append(field)
    
    is_valid = len(missing_fields) == 0
    return is_valid, missing_fields


def validate_unique_field(model, field_name, value, exclude_pk=None):
    """
    Kiểm tra field có unique không
    
    Args:
        model: Django Model class
        field_name: Tên field cần check
        value: Giá trị cần check
        exclude_pk: Primary key cần loại trừ (dùng cho update)
    
    Returns:
        bool: True nếu unique, False nếu đã tồn tại
    
    Usage:
        if not validate_unique_field(Nganhang, 'manganhang', ma_ngan_hang, exclude_pk=item_id):
            return json_error('Mã ngân hàng đã tồn tại')
    """
    queryset = model.objects.filter(**{field_name: value})
    
    if exclude_pk:
        queryset = queryset.exclude(pk=exclude_pk)
    
    return not queryset.exists()


# ============================================================================
# DECORATORS
# ============================================================================

def require_ajax(view_func):
    """
    Decorator yêu cầu request phải là AJAX
    
    Usage:
        @require_ajax
        def my_api_view(request):
            ...
    """
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        if not request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return json_error('Chỉ chấp nhận AJAX request', status=400)
        return view_func(request, *args, **kwargs)
    return wrapper


def handle_exceptions(view_func):
    """
    Decorator tự động bắt exceptions và trả về JSON error
    
    Usage:
        @handle_exceptions
        def my_api_view(request):
            ...
    """
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        try:
            return view_func(request, *args, **kwargs)
        except Exception as e:
            import traceback
            traceback.print_exc()
            return json_error(str(e), status=500)
    return wrapper


# ============================================================================
# COMMON VIEW PATTERNS
# ============================================================================

def get_list_context(request, queryset, search_fields=None, filter_field=None, 
                     page_size=20, order_by='-created_at'):
    """
    Tạo context cho list view (tổng hợp search, filter, pagination)
    
    Args:
        request: Django request
        queryset: Base queryset
        search_fields: List field để search (optional)
        filter_field: Tuple (field_name, param_name) cho filter (optional)
        page_size: Số items per page
        order_by: Field để sắp xếp
    
    Returns:
        dict: Context cho template
    
    Usage:
        def view_nganhang_list(request):
            queryset = Nganhang.objects.all()
            context = get_list_context(
                request,
                queryset,
                search_fields=['TenNganHang', 'MaNganHang'],
                filter_field=('TrangThai', 'status'),
                order_by='-created_at'
            )
            return render(request, 'template.html', context)
    """
    # Order
    if order_by:
        queryset = queryset.order_by(order_by)
    
    # Search
    if search_fields:
        queryset = search_queryset(request, queryset, search_fields)
    
    # Filter
    if filter_field:
        field_name, param_name = filter_field if isinstance(filter_field, tuple) else (filter_field, filter_field)
        queryset = filter_by_status(request, queryset, field_name, param_name)
    
    # Paginate
    page_obj, paginator = paginate_queryset(request, queryset, default_page_size=page_size)
    
    return {
        'object_list': page_obj,
        'paginator': paginator,
        'page_obj': page_obj,
        'is_paginated': page_obj.has_other_pages(),
    }


# ============================================================================
# MODEL HELPERS
# ============================================================================

def get_object_or_json_error(model, pk, error_message='Không tìm thấy dữ liệu'):
    """
    Get object hoặc trả về JSON error
    
    Usage:
        item = get_object_or_json_error(Nganhang, pk)
        if isinstance(item, JsonResponse):
            return item  # Error response
        # Continue with item...
    """
    try:
        return get_object_or_404(model, pk=pk)
    except:
        return json_error(error_message, status=404)


def safe_delete(obj):
    """
    Xóa object an toàn với error handling
    
    Returns:
        tuple: (success: bool, message: str)
    
    Usage:
        success, msg = safe_delete(item)
        if not success:
            return json_error(msg)
    """
    try:
        obj.delete()
        return True, 'Xóa thành công'
    except Exception as e:
        return False, f'Không thể xóa: {str(e)}'


# ============================================================================
# REQUEST DATA HELPERS
# ============================================================================

def get_request_data(request):
    """
    Lấy data từ request (hỗ trợ cả POST và JSON body)
    
    Returns:
        dict: Data từ request
    
    Usage:
        data = get_request_data(request)
        ten_ngan_hang = data.get('TenNganHang', '').strip()
    """
    if request.content_type == 'application/json':
        try:
            return json.loads(request.body)
        except:
            return {}
    return request.POST


def get_field_value(request, field_name, default=''):
    """
    Lấy giá trị field từ request và strip
    
    Usage:
        ten_ngan_hang = get_field_value(request, 'TenNganHang')
    """
    data = get_request_data(request)
    value = data.get(field_name, default)
    return value.strip() if hasattr(value, 'strip') else value



