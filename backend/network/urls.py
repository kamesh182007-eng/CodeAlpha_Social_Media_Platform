from django.urls import path
from . import views

urlpatterns = [
    # accounts
    path('register/', views.register),
    path('login/', views.login_view),
    path('me/', views.me),

    # posts, likes, comments
    path('posts/', views.posts),
    path('posts/<int:post_id>/like/', views.toggle_like),
    path('posts/<int:post_id>/comments/', views.comments),
    path('posts/<int:post_id>/delete/', views.delete_post),

    # users, profiles, follows
    path('users/', views.users_list),
    path('users/<int:user_id>/', views.user_detail),
    path('users/<int:user_id>/follow/', views.toggle_follow),
    path('profile/', views.update_profile),
]
