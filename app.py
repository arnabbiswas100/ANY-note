import os
import psycopg2
from flask import Flask, render_template, request, redirect, session, url_for
from werkzeug.security import generate_password_hash, check_password_hash

# --------------------
# App Setup
# --------------------

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "dev_secret_key")

DATABASE_URL = os.environ.get("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not set. Check Railway Variables tab.")

# --------------------
# Database Helpers
# --------------------

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
    );
    """)

    # Notes table
    cur.execute("""
    CREATE TABLE IF NOT EXISTS notes (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        title TEXT NOT NULL,
        content TEXT NOT NULL
    );
    """)

    conn.commit()
    cur.close()
    conn.close()

    print("DB INIT OK")


# --------------------
# Auth Routes
# --------------------

@app.route("/signup", methods=["GET", "POST"])
def signup():
    if request.method == "POST":
        username = request.form["username"]
        password = generate_password_hash(request.form["password"])

        try:
            conn = get_db()
            cur = conn.cursor()

            cur.execute(
                "INSERT INTO users (username, password) VALUES (%s, %s)",
                (username, password)
            )

            conn.commit()
            cur.close()
            conn.close()

            return redirect("/login")

        except Exception as e:
            return f"Signup error: {e}"

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
            return redirect("/")
        else:
            return "Invalid login"

    return render_template("login.html")


@app.route("/logout")
def logout():
    session.clear()
    return redirect("/login")


# --------------------
# Notes Routes
# --------------------

@app.route("/")
def index():
    if "user_id" not in session:
        return redirect("/login")

    conn = get_db()
    cur = conn.cursor()

    cur.execute(
        "SELECT id, title, content FROM notes WHERE user_id = %s",
        (session["user_id"],)
    )

    notes = cur.fetchall()

    cur.close()
    conn.close()

    return render_template("index.html", notes=notes)


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


@app.route("/delete/<int:note_id>")
def delete_note(note_id):
    if "user_id" not in session:
        return redirect("/login")

    conn = get_db()
    cur = conn.cursor()

    cur.execute(
        "DELETE FROM notes WHERE id = %s AND user_id = %s",
        (note_id, session["user_id"])
    )

    conn.commit()
    cur.close()
    conn.close()

    return redirect("/")


# --------------------
# Railway Safe Startup
# --------------------

def start_app():
    try:
        init_db()
    except Exception as e:
        print("DB INIT FAILED:", e)

    port = int(os.environ.get("PORT", 8080))
    print("Starting server on port", port)

    app.run(host="0.0.0.0", port=port)


if __name__ == "__main__":
    start_app()
