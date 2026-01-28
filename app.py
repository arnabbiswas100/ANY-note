from flask import Flask, render_template, request, redirect, url_for, session, flash
import sqlite3
from datetime import datetime
import os
import hashlib
import random

# ------------------------
# App Setup
# ------------------------

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "dev-secret")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_NAME = os.path.join(BASE_DIR, "notes.db")

COLORS = ["blue", "warm", "peach", "pink", "green", "purple", "grey"]

# ------------------------
# Database
# ------------------------

def get_db():
    return sqlite3.connect(DB_NAME, check_same_thread=False)

def init_db():
    db = get_db()
    cur = db.cursor()

    # Users table
    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL
        )
    """)

    # Notes table (new schema)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            color TEXT NOT NULL,
            folder TEXT DEFAULT 'My Folder',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)

    # ---- MIGRATION FIX ----
    # Add folder column if old DB doesn't have it
    try:
        cur.execute("SELECT folder FROM notes LIMIT 1")
    except:
        cur.execute("ALTER TABLE notes ADD COLUMN folder TEXT DEFAULT 'My Folder'")

    db.commit()

# ------------------------
# Helpers
# ------------------------

def hash_password(pw):
    return hashlib.sha256(pw.encode()).hexdigest()

def logged_in():
    return "user_id" in session

def random_color():
    return random.choice(COLORS)

# ------------------------
# Auth
# ------------------------

@app.route("/signup", methods=["GET", "POST"])
def signup():
    if request.method == "POST":
        username = request.form.get("username")
        password = request.form.get("password")

        if not username or not password:
            flash("Username and password required")
            return redirect(url_for("signup"))

        db = get_db()
        cur = db.cursor()

        try:
            cur.execute(
                "INSERT INTO users (username, password) VALUES (?, ?)",
                (username, hash_password(password))
            )
            db.commit()
        except:
            flash("Username already exists")
            return redirect(url_for("signup"))

        flash("Account created. Please log in.")
        return redirect(url_for("login"))

    return render_template("login.html", signup=True)

@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form.get("username")
        password = request.form.get("password")

        db = get_db()
        cur = db.cursor()

        cur.execute(
            "SELECT id, password FROM users WHERE username = ?",
            (username,)
        )
        user = cur.fetchone()

        if user and user[1] == hash_password(password):
            session["user_id"] = user[0]
            session["username"] = username
            return redirect(url_for("index"))

        flash("Invalid username or password")
        return redirect(url_for("login"))

    return render_template("login.html", signup=False)

@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))

# ------------------------
# Notes App
# ------------------------

@app.route("/")
def index():
    if not logged_in():
        return redirect(url_for("login"))

    db = get_db()
    cur = db.cursor()

    cur.execute("""
        SELECT id, title, content, color, folder
        FROM notes
        WHERE user_id = ?
        ORDER BY updated_at DESC
    """, (session["user_id"],))

    notes = cur.fetchall()
    return render_template("index.html", notes=notes, username=session["username"])

@app.route("/add", methods=["POST"])
def add_note():
    if not logged_in():
        return redirect(url_for("login"))

    title = request.form.get("title")
    content = request.form.get("content")
    folder = request.form.get("folder", "My Folder")

    if not title or not content:
        flash("Title and content required")
        return redirect(url_for("index"))

    color = random_color()
    now = datetime.utcnow().isoformat()

    db = get_db()
    cur = db.cursor()

    cur.execute("""
        INSERT INTO notes (user_id, title, content, color, folder, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (session["user_id"], title, content, color, folder, now, now))

    db.commit()
    return redirect(url_for("index"))

@app.route("/delete/<int:note_id>", methods=["POST"])
def delete_note(note_id):
    if not logged_in():
        return redirect(url_for("login"))

    db = get_db()
    cur = db.cursor()

    cur.execute("""
        DELETE FROM notes
        WHERE id = ? AND user_id = ?
    """, (note_id, session["user_id"]))

    db.commit()
    return redirect(url_for("index"))

@app.route("/edit/<int:note_id>")
def edit(note_id):
    if not logged_in():
        return redirect(url_for("login"))

    db = get_db()
    cur = db.cursor()

    cur.execute("""
        SELECT id, title, content, folder
        FROM notes
        WHERE id = ? AND user_id = ?
    """, (note_id, session["user_id"]))

    note = cur.fetchone()

    if not note:
        return redirect(url_for("index"))

    return render_template("edit.html", note=note)

@app.route("/update/<int:note_id>", methods=["POST"])
def update(note_id):
    if not logged_in():
        return redirect(url_for("login"))

    title = request.form.get("title")
    content = request.form.get("content")
    folder = request.form.get("folder", "My Folder")

    now = datetime.utcnow().isoformat()

    db = get_db()
    cur = db.cursor()

    cur.execute("""
        UPDATE notes
        SET title = ?, content = ?, folder = ?, updated_at = ?
        WHERE id = ? AND user_id = ?
    """, (title, content, folder, now, note_id, session["user_id"]))

    db.commit()
    return redirect(url_for("index"))

# ------------------------
# Startup
# ------------------------

init_db()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
