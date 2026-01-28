import os
from datetime import datetime

from flask import Flask, render_template, request, redirect, url_for, session
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from werkzeug.security import generate_password_hash, check_password_hash

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# ---------------- App Setup ----------------

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "dev-secret-key")

DATABASE_URL = os.environ.get("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL not set")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = "login"

# ---------------- Models ----------------

class User(UserMixin):
    def __init__(self, id, username, password_hash):
        self.id = id
        self.username = username
        self.password_hash = password_hash

# ---------------- DB Setup ----------------

def init_db():
    db = SessionLocal()

    db.execute(text("""
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL
        );
    """))

    db.execute(text("""
        CREATE TABLE IF NOT EXISTS notes (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            content TEXT NOT NULL,
            created_at TIMESTAMP NOT NULL
        );
    """))

    db.commit()
    db.close()

# ---------------- Login Manager ----------------

@login_manager.user_loader
def load_user(user_id):
    db = SessionLocal()
    result = db.execute(
        text("SELECT id, username, password_hash FROM users WHERE id = :id"),
        {"id": int(user_id)}
    ).fetchone()
    db.close()

    if result:
        return User(result[0], result[1], result[2])
    return None

# ---------------- Routes ----------------

@app.route("/")
@login_required
def index():
    db = SessionLocal()
    notes = db.execute(
        text("SELECT id, content, created_at FROM notes WHERE user_id = :uid ORDER BY created_at DESC"),
        {"uid": current_user.id}
    ).fetchall()
    db.close()

    return render_template("index.html", notes=notes, user=current_user)

# -------- Auth --------

@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form["username"]
        password = request.form["password"]

        db = SessionLocal()
        user = db.execute(
            text("SELECT id, username, password_hash FROM users WHERE username = :u"),
            {"u": username}
        ).fetchone()
        db.close()

        if user and check_password_hash(user[2], password):
            login_user(User(user[0], user[1], user[2]))
            return redirect(url_for("index"))

        return "Invalid login", 401

    return render_template("login.html")

@app.route("/signup", methods=["GET", "POST"])
def signup():
    if request.method == "POST":
        username = request.form["username"]
        password = request.form["password"]

        db = SessionLocal()
        try:
            db.execute(
                text("INSERT INTO users (username, password_hash) VALUES (:u, :p)"),
                {"u": username, "p": generate_password_hash(password)}
            )
            db.commit()
        except:
            db.close()
            return "User already exists", 400

        db.close()
        return redirect(url_for("login"))

    return render_template("signup.html")

@app.route("/logout")
@login_required
def logout():
    logout_user()
    return redirect(url_for("login"))

# -------- Notes --------

@app.route("/add", methods=["POST"])
@login_required
def add_note():
    content = request.form["content"]

    db = SessionLocal()
    db.execute(
        text("INSERT INTO notes (user_id, content, created_at) VALUES (:u, :c, :t)"),
        {
            "u": current_user.id,
            "c": content,
            "t": datetime.utcnow()
        }
    )
    db.commit()
    db.close()

    return redirect(url_for("index"))

# ---------------- Start ----------------

if __name__ == "__main__":
    init_db()
    app.run(host="0.0.0.0", port=5000, debug=True)
