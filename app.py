import os
from datetime import datetime

from flask import Flask, render_template, request, redirect, jsonify, session, url_for
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user

from werkzeug.security import generate_password_hash, check_password_hash

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# ---------------- App Setup ----------------

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "dev-secret-key")

# ---------------- Database Setup ----------------

DATABASE_URL = os.environ.get("DATABASE_URL")

if DATABASE_URL:
    # Railway Postgres fix
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
else:
    DATABASE_URL = "sqlite:///notes.db"

engine = create_engine(DATABASE_URL, echo=False)
SessionLocal = sessionmaker(bind=engine)

# ---------------- Login Manager ----------------

login_manager = LoginManager()
login_manager.login_view = "login"
login_manager.init_app(app)

# ---------------- Models ----------------

class User(UserMixin):
    def __init__(self, id, username, password):
        self.id = id
        self.username = username
        self.password = password

# ---------------- Database Init ----------------

def init_db():
    with engine.begin() as conn:
        conn.execute(text("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL
        )
        """))

        conn.execute(text("""
        CREATE TABLE IF NOT EXISTS folders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            color TEXT DEFAULT 'grey',
            user_id INTEGER NOT NULL
        )
        """))

        conn.execute(text("""
        CREATE TABLE IF NOT EXISTS notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            content TEXT,
            color TEXT DEFAULT 'grey',
            pinned INTEGER DEFAULT 0,
            folder_id INTEGER DEFAULT 0,
            user_id INTEGER NOT NULL,
            updated_at TEXT NOT NULL
        )
        """))

# ---------------- Login Loader ----------------

@login_manager.user_loader
def load_user(user_id):
    db = SessionLocal()
    user = db.execute(
        text("SELECT * FROM users WHERE id = :id"),
        {"id": user_id}
    ).fetchone()
    db.close()

    if user:
        return User(user.id, user.username, user.password)
    return None

# ---------------- Auth Routes ----------------

@app.route("/signup", methods=["GET", "POST"])
def signup():
    if request.method == "POST":
        username = request.form["username"]
        password = generate_password_hash(request.form["password"])

        db = SessionLocal()
        try:
            db.execute(
                text("INSERT INTO users (username, password) VALUES (:u, :p)"),
                {"u": username, "p": password}
            )
            db.commit()
        except:
            db.close()
            return "Username already exists"

        db.close()
        return redirect("/login")

    return """
    <h2>Signup</h2>
    <form method="POST">
        <input name="username" placeholder="Username" required><br>
        <input name="password" type="password" placeholder="Password" required><br>
        <button>Create Account</button>
    </form>
    """

@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form["username"]
        password = request.form["password"]

        db = SessionLocal()
        user = db.execute(
            text("SELECT * FROM users WHERE username = :u"),
            {"u": username}
        ).fetchone()
        db.close()

        if user and check_password_hash(user.password, password):
            login_user(User(user.id, user.username, user.password))
            return redirect("/")
        return "Invalid login"

    return """
    <h2>Login</h2>
    <form method="POST">
        <input name="username" placeholder="Username" required><br>
        <input name="password" type="password" placeholder="Password" required><br>
        <button>Login</button>
    </form>
    """

@app.route("/logout")
@login_required
def logout():
    logout_user()
    return redirect("/login")

# ---------------- Main App ----------------

@app.route("/")
@login_required
def index():
    folder_id = int(request.args.get("folder", 0))

    db = SessionLocal()

    folders = db.execute(
        text("SELECT * FROM folders WHERE user_id = :u"),
        {"u": current_user.id}
    ).fetchall()

    if folder_id == 0:
        notes = db.execute(
            text("SELECT * FROM notes WHERE user_id = :u ORDER BY pinned DESC, updated_at DESC"),
            {"u": current_user.id}
        ).fetchall()
    else:
        notes = db.execute(
            text("""
            SELECT * FROM notes
            WHERE user_id = :u AND folder_id = :f
            ORDER BY pinned DESC, updated_at DESC
            """),
            {"u": current_user.id, "f": folder_id}
        ).fetchall()

    db.close()

    return render_template(
        "index.html",
        notes=notes,
        folders=folders,
        active_folder=folder_id
    )

# ---------------- Notes ----------------

@app.route("/", methods=["POST"])
@login_required
def add_note():
    title = request.form.get("title")
    content = request.form.get("note")
    color = request.form.get("color", "grey")

    db = SessionLocal()
    db.execute(
        text("""
        INSERT INTO notes (title, content, color, user_id, updated_at)
        VALUES (:t, :c, :col, :u, :time)
        """),
        {
            "t": title,
            "c": content,
            "col": color,
            "u": current_user.id,
            "time": datetime.now().isoformat()
        }
    )
    db.commit()
    db.close()

    return redirect("/")

# ---------------- Edit ----------------

@app.route("/edit/<int:id>", methods=["GET", "POST"])
@login_required
def edit(id):
    db = SessionLocal()

    if request.method == "POST":
        db.execute(
            text("""
            UPDATE notes
            SET title=:t, content=:c, updated_at=:time
            WHERE id=:id AND user_id=:u
            """),
            {
                "t": request.form["title"],
                "c": request.form["note"],
                "time": datetime.now().isoformat(),
                "id": id,
                "u": current_user.id
            }
        )
        db.commit()
        db.close()
        return redirect("/")

    note = db.execute(
        text("SELECT * FROM notes WHERE id=:id AND user_id=:u"),
        {"id": id, "u": current_user.id}
    ).fetchone()

    db.close()
    return render_template("edit.html", note=note)

# ---------------- Delete ----------------

@app.route("/delete/<int:id>")
@login_required
def delete(id):
    db = SessionLocal()
    db.execute(
        text("DELETE FROM notes WHERE id=:id AND user_id=:u"),
        {"id": id, "u": current_user.id}
    )
    db.commit()
    db.close()
    return redirect("/")

# ---------------- Pin ----------------

@app.route("/pin/<int:id>")
@login_required
def pin(id):
    db = SessionLocal()

    note = db.execute(
        text("SELECT pinned FROM notes WHERE id=:id AND user_id=:u"),
        {"id": id, "u": current_user.id}
    ).fetchone()

    new_state = 0 if note.pinned else 1

    db.execute(
        text("""
        UPDATE notes SET pinned=:p, updated_at=:time
        WHERE id=:id AND user_id=:u
        """),
        {
            "p": new_state,
            "time": datetime.now().isoformat(),
            "id": id,
            "u": current_user.id
        }
    )

    db.commit()
    db.close()
    return jsonify({"pinned": new_state})

# ---------------- Folders ----------------

@app.route("/new_folder", methods=["POST"])
@login_required
def new_folder():
    name = request.form["name"]

    db = SessionLocal()
    db.execute(
        text("INSERT INTO folders (name, user_id) VALUES (:n, :u)"),
        {"n": name, "u": current_user.id}
    )
    db.commit()
    db.close()

    return redirect("/")

@app.route("/move_note/<int:note_id>/<int:folder_id>")
@login_required
def move_note(note_id, folder_id):
    db = SessionLocal()

    db.execute(
        text("""
        UPDATE notes
        SET folder_id=:f, updated_at=:time
        WHERE id=:n AND user_id=:u
        """),
        {
            "f": folder_id,
            "n": note_id,
            "u": current_user.id,
            "time": datetime.now().isoformat()
        }
    )

    db.commit()
    db.close()
    return "OK"

# ---------------- Start ----------------

if __name__ == "__main__":
    init_db()
    app.run(host="0.0.0.0", port=5000)
