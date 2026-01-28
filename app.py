import os
import psycopg2
from psycopg2.extras import RealDictCursor
from flask import Flask, render_template, request, redirect, session, url_for
from werkzeug.security import generate_password_hash, check_password_hash

# -----------------------------
# App setup
# -----------------------------
app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "dev-secret-key")

DATABASE_URL = os.environ.get("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not set. Did you add it in Railway Variables?")

# -----------------------------
# Database helper
# -----------------------------
def get_db():
    return psycopg2.connect(DATABASE_URL, sslmode="require")

def init_db():
    conn = get_db()
    cur = conn.cursor()

    # Users table
    cur.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL
    )
    """)

    # Notes table
    cur.execute("""
    CREATE TABLE IF NOT EXISTS notes (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        title TEXT NOT NULL,
        content TEXT NOT NULL
    )
    """)

    conn.commit()
    cur.close()
    conn.close()

# -----------------------------
# Routes
# -----------------------------
@app.route("/")
def index():
    if "user_id" not in session:
        return redirect("/login")

    conn = get_db()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    cur.execute(
        "SELECT * FROM notes WHERE user_id = %s ORDER BY id DESC",
        (session["user_id"],)
    )
    notes = cur.fetchall()

    cur.close()
    conn.close()

    return render_template("index.html", notes=notes)

# -----------------------------
# Auth
# -----------------------------
@app.route("/signup", methods=["GET", "POST"])
def signup():
    if request.method == "POST":
        username = request.form["username"]
        password = generate_password_hash(request.form["password"])

        conn = get_db()
        cur = conn.cursor()

        try:
            cur.execute(
                "INSERT INTO users (username, password) VALUES (%s, %s)",
                (username, password)
            )
            conn.commit()
        except Exception:
            conn.rollback()
            return "Username already exists"
        finally:
            cur.close()
            conn.close()

        return redirect("/login")

    return render_template("signup.html")

@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form["username"]
        password = request.form["password"]

        conn = get_db()
        cur = conn.cursor(cursor_factory=RealDictCursor)

        cur.execute(
            "SELECT * FROM users WHERE username = %s",
            (username,)
        )
        user = cur.fetchone()

        cur.close()
        conn.close()

        if user and check_password_hash(user["password"], password):
            session["user_id"] = user["id"]
            return redirect("/")
        else:
            return "Invalid credentials"

    return render_template("login.html")

@app.route("/logout")
def logout():
    session.clear()
    return redirect("/login")

# -----------------------------
# Notes
# -----------------------------
@app.route("/add", methods=["POST"])
def add_note():
    if "user_id" not in session:
        return redirect("/login")

    title = request.form["title"]
    content = request.form["content"]

    conn = get_db()
    cur = conn.cursor()

    cur.execute(
        "INSERT INTO notes (user_id, title, content) VALUES (%s, %s, %s)",
        (session["user_id"], title, content)
    )

    conn.commit()
    cur.close()
    conn.close()

    return redirect("/")

# -----------------------------
# Railway/Gunicorn startup
# -----------------------------
init_db()
