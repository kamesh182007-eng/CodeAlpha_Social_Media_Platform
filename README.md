# ConnectHub - Social Media Platform

CodeAlpha Full Stack Development Internship - Task 2.

A small social network built with **Django** (backend), **SQLite** (database) and **HTML / CSS / JavaScript** (frontend).

## Features
- Register and login (token based, passwords are hashed)
- User profiles with a bio, followers / following / post counts
- Create and delete your own posts
- Comments on posts
- Like / unlike posts
- Follow / unfollow users, and a "Following" feed
- Django admin panel for managing data

## Database tables
User, Profile, Post, Comment, Like, Follow

## How to run
```
cd backend
python -m venv venv
venv\Scripts\activate          (Windows)
pip install -r requirements.txt
python manage.py makemigrations network
python manage.py migrate
python manage.py runserver
```
Open http://127.0.0.1:8000/

## API (all under /api/)
| Method | URL | What it does |
|---|---|---|
| POST | register/ | create account |
| POST | login/ | get token |
| GET/POST | posts/ | list (`?scope=following`, `?user=ID`) / create post |
| POST | posts/ID/like/ | like or unlike |
| GET/POST | posts/ID/comments/ | list / add comment |
| POST | posts/ID/delete/ | delete own post |
| GET | users/, users/ID/ | users and profiles |
| POST | users/ID/follow/ | follow or unfollow |
| POST | profile/ | update own bio |
