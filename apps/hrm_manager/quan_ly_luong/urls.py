from django.urls import path
from .import views

app_name = 'quan_ly_luong'

urlpatterns = [
    # View chính
    path('che-do-luong/', views.view_che_do_luong, name='che_do_luong'),
    path('che-do-luong/create/', views.view_che_do_luong_create, name='che_do_luong_create'),
    path('che-do-luong/<int:pk>/update/', views.view_che_do_luong_update, name='che_do_luong_update'),
    # API
    path('api/che-do-luong/list/', views.api_che_do_luong_list, name='api_che_do_luong_list'),
    path('api/che-do-luong/<int:pk>/detail/', views.api_che_do_luong_detail, name='api_che_do_luong_detail'),
    path('api/che-do-luong/create/', views.api_che_do_luong_create, name='api_che_do_luong_create'),
    path('api/che-do-luong/<int:pk>/update/', views.api_che_do_luong_update, name='api_che_do_luong_update'),
    path('api/che-do-luong/<int:pk>/delete/', views.api_che_do_luong_delete, name='api_che_do_luong_delete'),
    path('api/che-do-luong/<int:pk>/toggle-status/', views.api_che_do_luong_toggle_status, name='api_che_do_luong_toggle_status'),
    
    path('api/che-do-luong/check-conflicts/', views.api_che_do_luong_check_conflicts, name='api_che_do_luong_check_conflicts'),
]
