from django.contrib import admin
from django.urls import path, include
from network import views

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('network.urls')),
    path('', views.index),
    path('profile/<int:user_id>/', views.profile_page),
]
