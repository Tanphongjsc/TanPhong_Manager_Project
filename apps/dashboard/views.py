from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from apps.hrm_manager.utils.permissions import require_view_permission

# Create your views here.
@login_required
@require_view_permission('access_control.view_dashboard')
def index(request):
    return render(request, "dashboard/index.html")