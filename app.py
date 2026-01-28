import os
import sqlite3
import psycopg2
from flask import Flask, render_template, request, redirect, session, url_for
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "dev-secret")

DATABASE_URL = os.environ.get("DATABASE_URL")
LOCAL_DB = "notes.db"

# ---------------- DATABASE ----------------

def get_db():
    if DATABASE_URL:
        return psycopg2.connect(DATABASE_URL)
    return sqlite3.connect(LOCAL_DB)

def init_db():
    conn = get_db()
    cur = conn.cursor()

    if DATABASE_URL:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL
            )
        """)
    else:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL
            )
        """)

    conn.commit()
    cur.close()
    conn.close()

# ---------------- ROUTES ----------------

@app.route("/")
def home():
    if "user" not in session:
        return redirect("/login")
    return render_template("index.html")

# ---------------- SIGNUP ----------------

@app.route("/signup", methods=["GET", "POST"])
def signup():
    if request.method == "POST":
        username = request.form["username"]
        password = request.form["password"]

        hashed = generate_password_hash(password)

        try:
            conn = get_db()
            cur = conn.cursor()

            if DATABASE_URL:
                cur.execute(
                    "INSERT INTO users (username, password) VALUES (%s, %s)",
                    (username, hashed)
                )
            else:
                cur.execute(
                    "INSERT INTO users (username, password) VALUES (?, ?)",
                    (username, hashed)
                )

            conn.commit()
            cur.close()
            conn.close()

            return redirect("/login")

        except Exception as e:
            return f"Signup failed: {str(e)}"

    return """
    <h2>Signup</h2>
    <form method="POST">
        <input name="username" placeholder="Username" required>
        <input name="password" type="password" placeholder="Password" required>
        <button>Sign up</button>
    </form>
    """

# ---------------- LOGIN ----------------

@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form["username"]
        password = request.form["password"]

        conn = get_db()
        cur = conn.cursor()

        if DATABASE_URL:
            cur.execute("SELECT password FROM users WHERE username=%s", (username,))
        else:
            cur.execute("SELECT password FROM users WHERE username=?", (username,))

        user = cur.fetchone()

        cur.close()
        conn.close()

        if user and check_password_hash(user[0], password):
            session["user"] = username
            return redirect("/")
        else:
            return "Invalid username or password"

    return render_template("login.html")

# ---------------- LOGOUT ----------------

@app.route("/logout")
def logout():
    session.pop("user", None)
    return redirect("/login")

# ---------------- START ----------------

if __name__ == "__main__":
    init_db()
    app.run(host="0.0.0.0", port=5000)
else:
    init_db()
