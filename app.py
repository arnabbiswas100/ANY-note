from flask import Flask, render_template, request, redirect, jsonify
import sqlite3
from datetime import datetime
import random

app = Flask(__name__)
DB_NAME = "notes.db"

COLORS = ["blue", "warm", "peach", "pink", "green", "purple", "grey"]


# ------------------------
# Database Helpers
# ------------------------

def get_db():
    db = sqlite3.connect(DB_NAME)
    db.row_factory = sqlite3.Row
    return db


def init_db():
    with get_db() as db:
        db.execute("""
        CREATE TABLE IF NOT EXISTS folders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            color TEXT DEFAULT 'grey'
        )
        """)

        db.execute("""
        CREATE TABLE IF NOT EXISTS notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            folder_id INTEGER,
            title TEXT,
            content TEXT NOT NULL,
            pinned INTEGER DEFAULT 0,
            color TEXT DEFAULT 'grey',
            updated_at TEXT
        )
        """)

        db.execute("""
        INSERT OR IGNORE INTO folders (id, name, color)
        VALUES (1, 'My Notes', 'grey')
        """)


# ------------------------
# Routes
# ------------------------

@app.route("/", methods=["GET", "POST"])
def index():
    db = get_db()
    folder_id = int(request.args.get("folder", 0))

    if request.method == "POST":
        title = request.form.get("title", "")
        content = request.form["note"]
        color = request.form.get("color", "grey")

        save_folder = folder_id if folder_id != 0 else 1

        db.execute("""
            INSERT INTO notes (title, content, folder_id, pinned, color, updated_at)
            VALUES (?, ?, ?, 0, ?, ?)
        """, (title, content, save_folder, color, datetime.utcnow().isoformat()))
        db.commit()

    folders = db.execute("SELECT * FROM folders").fetchall()

    if folder_id == 0:
        notes = db.execute("""
            SELECT * FROM notes
            ORDER BY pinned DESC, updated_at DESC
        """).fetchall()
    else:
        notes = db.execute("""
            SELECT * FROM notes
            WHERE folder_id=?
            ORDER BY pinned DESC, updated_at DESC
        """, (folder_id,)).fetchall()

    return render_template("index.html",
                           folders=folders,
                           notes=notes,
                           active_folder=folder_id)


# ---------------- Folder Management ----------------

@app.route("/new_folder", methods=["POST"])
def new_folder():
    name = request.form["name"]
    color = random.choice(COLORS)

    db = get_db()
    db.execute("INSERT INTO folders (name, color) VALUES (?, ?)", (name, color))
    db.commit()
    return redirect("/")


@app.route("/rename_folder/<int:id>", methods=["POST"])
def rename_folder(id):
    name = request.form["name"]
    db = get_db()
    db.execute("UPDATE folders SET name=? WHERE id=?", (name, id))
    db.commit()
    return redirect("/")


@app.route("/color_folder/<int:id>/<color>")
def color_folder(id, color):
    db = get_db()
    db.execute("UPDATE folders SET color=? WHERE id=?", (color, id))
    db.commit()
    return redirect("/")


# ---------------- Notes ----------------

@app.route("/delete/<int:id>")
def delete(id):
    db = get_db()
    db.execute("DELETE FROM notes WHERE id=?", (id,))
    db.commit()
    return redirect("/")


@app.route("/edit/<int:id>", methods=["GET", "POST"])
def edit(id):
    db = get_db()

    if request.method == "POST":
        title = request.form.get("title", "")
        content = request.form["note"]
        color = request.form.get("color", "grey")

        db.execute("""
            UPDATE notes
            SET title=?, content=?, color=?, updated_at=?
            WHERE id=?
        """, (title, content, color, datetime.utcnow().isoformat(), id))
        db.commit()
        return redirect("/")

    note = db.execute("SELECT * FROM notes WHERE id=?", (id,)).fetchone()
    return render_template("edit.html", note=note)


# ---------------- API (No Reload) ----------------

@app.route("/pin/<int:id>")
def toggle_pin(id):
    db = get_db()
    note = db.execute("SELECT pinned FROM notes WHERE id=?", (id,)).fetchone()

    new_state = 0 if note["pinned"] == 1 else 1

    db.execute("""
        UPDATE notes
        SET pinned=?, updated_at=?
        WHERE id=?
    """, (new_state, datetime.utcnow().isoformat(), id))
    db.commit()

    return jsonify({"pinned": new_state})


@app.route("/move_note/<int:note_id>/<int:folder_id>")
def move_note(note_id, folder_id):
    db = get_db()
    db.execute("""
        UPDATE notes
        SET folder_id=?, updated_at=?
        WHERE id=?
    """, (folder_id, datetime.utcnow().isoformat(), note_id))
    db.commit()
    return jsonify({"status": "ok"})


# ---------------- Start ----------------

#if __name__ == "__main__":
 #   init_db()
  #  app.run(debug=True, host="0.0.0.0")
if __name__ == "__main__":
    init_db()
    app.run(host="0.0.0.0", port=5000)
