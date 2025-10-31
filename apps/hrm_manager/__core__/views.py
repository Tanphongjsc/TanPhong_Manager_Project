from django.shortcuts import render
from django.contrib.auth.decorators import login_required,permission_required
from .models import *

# Create your views here.
@login_required
def index(request):
    models_Hopdong = Hopdong.objects.all()
    print(models_Hopdong)
    return render(request, "hrm_manager/index.html")