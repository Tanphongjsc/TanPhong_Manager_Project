from django.urls import path, include
from . import views

app_name = "hop_dong_lao_dong"
urlpatterns = [

    # VIEW URLS
    path("quan-ly/hop-dong/", views.view_quan_ly_hop_dong_index, name="quan_ly_hop_dong_index"),

    # API URLS

]