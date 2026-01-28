import os
import psycopg2
from flask import Flask, render_template, request, redirect, url_for, session
from werkzeug.security import generate_password_hash, check_password_hash

# ---------------- CONFIG ----------------

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "dev-secret-key")

DATABASE_URL = os.environ.get("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL not set. Check Railway Variables.")

# ---------------- DATABASE ----------------

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
            content TEXT NOT NULL
        )
    """)

    conn.commit()
    cur.close()
    conn.close()

# ---------------- ROUTES ----------------

@app.route("/", methods=["GET", "POST"])
def index():
    if "user_id" not in session:
        return redirect(url_for("login"))

    conn = get_db()
    cur = conn.cursor()

    if request.method == "POST":
        content = request.form["content"]
        cur.execute(
            "INSERT INTO notes (user_id, content) VALUES (%s, %s)",
            (session["user_id"], content)
        )
        conn.commit()

    cur.execute(
        "SELECT id, content FROM notes WHERE user_id = %s ORDER BY id DESC",
        (session["user_id"],)
    )
    notes = cur.fetchall()

    cur.close()
    conn.close()

    return render_template("index.html", notes=notes)

# ---------------- AUTH ----------------

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
            cur.close()
            conn.close()
            return "Username already exists"

        cur.close()
        conn.close()
        return redirect(url_for("login"))

    return render_template("signup.html")

@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form["username"]
        password = request.form["password"]

        conn = get_db()
        cur = conn.cursor()

        cur.execute(
            "SELECT id, password FROM users WHERE username = %s",
            (username,)
        )
        user = cur.fetchone()

        cur.close()
        conn.close()

        if user and check_password_hash(user[1], password):
            session["user_id"] = user[0]
            return redirect(url_for("index"))

        return "Invalid credentials"

    return render_template("login.html")

@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))

# ---------------- STARTUP ----------------

init_db()

# Gunicorn runs this, NOT Flask dev server
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
