import json

from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.core import signing
from django.db.models import Q
from django.http import JsonResponse
from django.shortcuts import render
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt

from .models import Profile, Post, Comment, Like, Follow


# ---------------------------------------------------------------
# Pages (the HTML files)
# ---------------------------------------------------------------

def index(request):
    return render(request, 'index.html')


def profile_page(request, user_id):
    return render(request, 'profile.html', {'user_id': user_id})


# ---------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------

def get_user(request):
    """Read the login token from the request and return the user (or None)."""
    header = request.headers.get('Authorization', '')
    if not header.startswith('Bearer '):
        return None
    token = header[7:]
    try:
        data = signing.loads(token, max_age=60 * 60 * 24 * 7)  # valid for 7 days
        return User.objects.get(id=data['user_id'])
    except Exception:
        return None


def read_json(request):
    """Return the JSON sent by the browser as a dict, or None if it is invalid."""
    try:
        data = json.loads(request.body)
    except ValueError:
        return None
    if not isinstance(data, dict):
        return None
    return data


def error(message, status=400):
    return JsonResponse({'error': message}, status=status)


def get_bio(user):
    try:
        return user.profile.bio
    except Profile.DoesNotExist:
        return ''


def format_time(value):
    return timezone.localtime(value).strftime('%d %b %Y, %I:%M %p')


def post_to_dict(post, me):
    return {
        'id': post.id,
        'content': post.content,
        'created_at': format_time(post.created_at),
        'author': {'id': post.user.id, 'username': post.user.username},
        'likes': post.likes.count(),
        'liked': bool(me) and post.likes.filter(user=me).exists(),
        'comments': post.comments.count(),
        'mine': bool(me) and post.user_id == me.id,
    }


def comment_to_dict(comment):
    return {
        'id': comment.id,
        'content': comment.content,
        'created_at': format_time(comment.created_at),
        'author': {'id': comment.user.id, 'username': comment.user.username},
    }


def user_to_dict(user, me):
    return {
        'id': user.id,
        'username': user.username,
        'bio': get_bio(user),
        'posts': user.posts.count(),
        'followers': user.followers.count(),
        'following': user.following.count(),
        'is_me': bool(me) and user.id == me.id,
        'is_following': bool(me) and user.followers.filter(follower=me).exists(),
    }


# ---------------------------------------------------------------
# Accounts: register, login, me
# ---------------------------------------------------------------

@csrf_exempt
def register(request):
    if request.method != 'POST':
        return error('POST required', 405)
    data = read_json(request)
    if data is None:
        return error('Invalid data')

    username = str(data.get('username', '')).strip()
    email = str(data.get('email', '')).strip()
    password = str(data.get('password', ''))

    if not username or not password:
        return error('Username and password are required')
    if len(username) > 30:
        return error('Username must be 30 characters or less')
    if len(password) < 6:
        return error('Password must be at least 6 characters')
    if User.objects.filter(username=username).exists():
        return error('Username already taken')

    user = User.objects.create_user(username=username, email=email, password=password)
    Profile.objects.create(user=user)
    return JsonResponse({'message': 'Registered successfully'}, status=201)


@csrf_exempt
def login_view(request):
    if request.method != 'POST':
        return error('POST required', 405)
    data = read_json(request)
    if data is None:
        return error('Invalid data')

    user = authenticate(
        username=str(data.get('username', '')).strip(),
        password=str(data.get('password', '')),
    )
    if user is None:
        return error('Wrong username or password', 401)

    token = signing.dumps({'user_id': user.id})
    return JsonResponse({'token': token, 'username': user.username, 'user_id': user.id})


def me(request):
    user = get_user(request)
    if user is None:
        return error('Not logged in', 401)
    return JsonResponse(user_to_dict(user, user))


# ---------------------------------------------------------------
# Posts
# ---------------------------------------------------------------

@csrf_exempt
def posts(request):
    me_user = get_user(request)

    if request.method == 'GET':
        queryset = Post.objects.select_related('user')
        user_id = request.GET.get('user', '')

        if user_id.isdigit():
            queryset = queryset.filter(user_id=int(user_id))
        elif request.GET.get('scope') == 'following':
            if me_user is None:
                return error('Please log in first', 401)
            followed_ids = Follow.objects.filter(follower=me_user).values_list('followed_id', flat=True)
            queryset = queryset.filter(Q(user_id__in=followed_ids) | Q(user=me_user))

        return JsonResponse([post_to_dict(p, me_user) for p in queryset[:100]], safe=False)

    if request.method == 'POST':
        if me_user is None:
            return error('Please log in first', 401)
        data = read_json(request)
        if data is None:
            return error('Invalid data')

        content = str(data.get('content', '')).strip()
        if not content:
            return error('Write something first')
        if len(content) > 500:
            return error('A post can have at most 500 characters')

        post = Post.objects.create(user=me_user, content=content)
        return JsonResponse(post_to_dict(post, me_user), status=201)

    return error('Method not allowed', 405)


@csrf_exempt
def delete_post(request, post_id):
    if request.method != 'POST':
        return error('POST required', 405)
    me_user = get_user(request)
    if me_user is None:
        return error('Please log in first', 401)

    try:
        post = Post.objects.get(id=post_id)
    except Post.DoesNotExist:
        return error('Post not found', 404)
    if post.user_id != me_user.id:
        return error('You can only delete your own posts', 403)

    post.delete()
    return JsonResponse({'message': 'Deleted'})


# ---------------------------------------------------------------
# Likes
# ---------------------------------------------------------------

@csrf_exempt
def toggle_like(request, post_id):
    if request.method != 'POST':
        return error('POST required', 405)
    me_user = get_user(request)
    if me_user is None:
        return error('Please log in first', 401)

    try:
        post = Post.objects.get(id=post_id)
    except Post.DoesNotExist:
        return error('Post not found', 404)

    like, created = Like.objects.get_or_create(post=post, user=me_user)
    if not created:
        like.delete()

    return JsonResponse({'liked': created, 'likes': post.likes.count()})


# ---------------------------------------------------------------
# Comments
# ---------------------------------------------------------------

@csrf_exempt
def comments(request, post_id):
    try:
        post = Post.objects.get(id=post_id)
    except Post.DoesNotExist:
        return error('Post not found', 404)

    if request.method == 'GET':
        items = post.comments.select_related('user')
        return JsonResponse([comment_to_dict(c) for c in items], safe=False)

    if request.method == 'POST':
        me_user = get_user(request)
        if me_user is None:
            return error('Please log in first', 401)
        data = read_json(request)
        if data is None:
            return error('Invalid data')

        content = str(data.get('content', '')).strip()
        if not content:
            return error('Write a comment first')
        if len(content) > 300:
            return error('A comment can have at most 300 characters')

        comment = Comment.objects.create(post=post, user=me_user, content=content)
        return JsonResponse(comment_to_dict(comment), status=201)

    return error('Method not allowed', 405)


# ---------------------------------------------------------------
# Users, profiles and follows
# ---------------------------------------------------------------

def users_list(request):
    me_user = get_user(request)
    users = User.objects.order_by('username')[:50]
    return JsonResponse([user_to_dict(u, me_user) for u in users], safe=False)


def user_detail(request, user_id):
    me_user = get_user(request)
    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return error('User not found', 404)
    return JsonResponse(user_to_dict(user, me_user))


@csrf_exempt
def toggle_follow(request, user_id):
    if request.method != 'POST':
        return error('POST required', 405)
    me_user = get_user(request)
    if me_user is None:
        return error('Please log in first', 401)

    try:
        target = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return error('User not found', 404)
    if target.id == me_user.id:
        return error('You cannot follow yourself')

    follow, created = Follow.objects.get_or_create(follower=me_user, followed=target)
    if not created:
        follow.delete()

    return JsonResponse({'following': created, 'followers': target.followers.count()})


@csrf_exempt
def update_profile(request):
    if request.method != 'POST':
        return error('POST required', 405)
    me_user = get_user(request)
    if me_user is None:
        return error('Please log in first', 401)
    data = read_json(request)
    if data is None:
        return error('Invalid data')

    bio = str(data.get('bio', '')).strip()
    if len(bio) > 200:
        return error('Bio can have at most 200 characters')

    profile, _ = Profile.objects.get_or_create(user=me_user)
    profile.bio = bio
    profile.save()
    return JsonResponse({'bio': profile.bio})
