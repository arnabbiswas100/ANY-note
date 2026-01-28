from flask import Flask, render_template, request, redirect, url_for
import sqlite3
from datetime import datetime
import os
import random

app = Flask(__name__)

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

    cur.execute("""
        CREATE TABLE IF NOT EXISTS notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            color TEXT NOT NULL,
            folder TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    """)

    db.commit()

# ------------------------
# Routes
# ------------------------

@app.route("/")
def index():
    db = get_db()
    cur = db.cursor()

    cur.execute("""
        SELECT id, title, content, color, folder
        FROM notes
        ORDER BY updated_at DESC
    """)

    notes = cur.fetchall()
    return render_template("index.html", notes=notes)

@app.route("/add", methods=["POST"])
def add_note():
    title = request.form["title"]
    content = request.form["content"]
    folder = request.form.get("folder", "My Folder")
    color = random.choice(COLORS)

    now = datetime.utcnow().isoformat()

    db = get_db()
    cur = db.cursor()

    cur.execute("""
        INSERT INTO notes (title, content, color, folder, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (title, content, color, folder, now, now))

    db.commit()
    return redirect(url_for("index"))

@app.route("/delete/<int:note_id>", methods=["POST"])
def delete_note(note_id):
    db = get_db()
    cur = db.cursor()

    cur.execute("DELETE FROM notes WHERE id = ?", (note_id,))
    db.commit()

    return redirect(url_for("index"))

@app.route("/edit/<int:note_id>")
def edit(note_id):
    db = get_db()
    cur = db.cursor()

    cur.execute("""
        SELECT id, title, content, folder
        FROM notes
        WHERE id = ?
    """, (note_id,))

    note = cur.fetchone()
    return render_template("edit.html", note=note)

@app.route("/update/<int:note_id>", methods=["POST"])
def update(note_id):
    title = request.form["title"]
    content = request.form["content"]
    folder = request.form.get("folder", "My Folder")
    now = datetime.utcnow().isoformat()

    db = get_db()
    cur = db.cursor()

    cur.execute("""
        UPDATE notes
        SET title = ?, content = ?, folder = ?, updated_at = ?
        WHERE id = ?
    """, (title, content, folder, now, note_id))

    db.commit()
    return redirect(url_for("index"))

# ------------------------
# Start
# ------------------------

if __name__ == "__main__":
    init_db()
    app.run(host="0.0.0.0", port=5000)
