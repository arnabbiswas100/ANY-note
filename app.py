from flask import Flask, render_template, request, redirect, url_for, session, flash, jsonify
import sqlite3
from datetime import datetime
import os
import hashlib

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "dev-secret")

DB_NAME = "notes.db"

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

    # Notes table
    cur.execute("""
        CREATE TABLE IF NOT EXISTS notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            color TEXT NOT NULL,
            folder TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)

    db.commit()

# ------------------------
# Helpers
# ------------------------

def hash_password(pw):
    return hashlib.sha256(pw.encode()).hexdigest()

def logged_in():
    return "user_id" in session

# ------------------------
# Auth
# ------------------------

@app.route("/signup", methods=["GET", "POST"])
def signup():
    if request.method == "POST":
        username = request.form["username"]
        password = request.form["password"]

        db = get_db()
        cur = db.cursor()

        try:
            cur.execute(
                "INSERT INTO users (username, password) VALUES (?, ?)",
                (username, hash_password(password))
            )
            db.commit()
        except:
            return "Username already exists"

        return redirect(url_for("login"))

    return render_template("login.html", signup=True)

@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form["username"]
        password = request.form["password"]

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

        return "Invalid username or password"

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

    title = request.form["title"]
    content = request.form["content"]
    folder = request.form.get("folder", "My Folder")
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
    return render_template("edit.html", note=note)

@app.route("/update/<int:note_id>", methods=["POST"])
def update(note_id):
    if not logged_in():
        return redirect(url_for("login"))

    title = request.form["title"]
    content = request.form["content"]
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
# Utils
# ------------------------

def random_color():
    import random
    return random.choice(COLORS)


# -------------------
# LOGIN
# -------------------
@app.route("/login", methods=["GET", "POST"])
def login():
    error = None

    if request.method == "POST":
        username = request.form["username"]
        password = request.form["password"]

        db = get_db()
        cursor = db.cursor()
        cursor.execute("SELECT password FROM users WHERE username = ?", (username,))
        row = cursor.fetchone()
        db.close()

        if row and check_password_hash(row[0], password):
            session["user"] = username
            return redirect("/")
        else:
            error = "Invalid username or password"

    return render_template("login.html", error=error)


# -------------------
# SIGNUP
# -------------------
@app.route("/signup", methods=["GET", "POST"])
def signup():
    error = None

    if request.method == "POST":
        username = request.form["username"]
        password = request.form["password"]

        hashed = generate_password_hash(password)

        try:
            db = get_db()
            cursor = db.cursor()
            cursor.execute("INSERT INTO users (username, password) VALUES (?, ?)", (username, hashed))
            db.commit()
            db.close()

            return redirect("/login")

        except sqlite3.IntegrityError:
            error = "Username already exists"

    return render_template("signup.html", error=error)


# -------------------
# LOGOUT
# -------------------
@app.route("/logout")
def logout():
    session.clear()
    return redirect("/login")


# -------------------
# RUN
# -------------------
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port, debug=True)
