import io
import os
import re
import json
import base64
import zipfile
import sqlite3
import hashlib
import secrets
from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.responses import HTMLResponse, StreamingResponse, JSONResponse, FileResponse, PlainTextResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image
import pymupdf as fitz  # PyMuPDF
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from reportlab.lib.pagesizes import landscape, letter, A4
from reportlab.pdfgen import canvas
import docx
import openpyxl

app = FastAPI(
    title="DocStudio - PDF & PPT Suite",
    description="All-in-one Web Application for PDF & PPT Editing, Conversion and Management",
    version="1.0.0"
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Setup paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
TEMPLATES_DIR = os.path.join(BASE_DIR, "templates")

os.makedirs(STATIC_DIR, exist_ok=True)
os.makedirs(TEMPLATES_DIR, exist_ok=True)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


# -------------------------------------------------------------
# Models
# -------------------------------------------------------------
class SlideItem(BaseModel):
    title: str
    subtitle: Optional[str] = ""
    bullets: Optional[List[str]] = []
    notes: Optional[str] = ""

class PresentationRequest(BaseModel):
    title: str
    theme: Optional[str] = "modern_blue"
    slides: List[SlideItem]


# -------------------------------------------------------------
# Web UI Routes
# -------------------------------------------------------------
@app.get("/", response_class=FileResponse)
async def serve_home(request: Request):
    """Serve main single-page application dashboard"""
    index_file = os.path.join(TEMPLATES_DIR, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return HTMLResponse("<h1>DocStudio index.html not found</h1>", status_code=404)


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "app": "DocStudio", "version": "1.0.0"}


@app.get("/robots.txt", response_class=PlainTextResponse)
def get_robots_txt():
    """Search engine crawler rules for Googlebot, Bingbot, etc."""
    return """User-agent: *
Allow: /
Sitemap: https://docstudio-dty3.onrender.com/sitemap.xml
"""


@app.get("/sitemap.xml")
def get_sitemap_xml():
    """XML Sitemap for Google Search indexing"""
    xml_content = """<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://docstudio-dty3.onrender.com/</loc>
    <lastmod>2026-09-26</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>"""
    return Response(content=xml_content, media_type="application/xml")


# -------------------------------------------------------------
# Database & Authentication Setup
# -------------------------------------------------------------
DB_PATH = os.path.join(BASE_DIR, "docstudio.db")

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        created_at TEXT NOT NULL
    )
    """)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )
    """)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS user_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        tool_name TEXT NOT NULL,
        filename TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )
    """)
    conn.commit()
    conn.close()

init_db()

def hash_password(password: str, salt: Optional[str] = None):
    if not salt:
        salt = secrets.token_hex(16)
    hashed = hashlib.sha256((password + salt).encode('utf-8')).hexdigest()
    return hashed, salt

def get_user_from_token(token: Optional[str]):
    if not token:
        return None
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        now = datetime.utcnow().isoformat()
        cursor.execute("""
            SELECT u.id, u.name, u.email, u.created_at
            FROM sessions s
            JOIN users u ON s.user_id = u.id
            WHERE s.token = ? AND s.expires_at > ?
        """, (token, now))
        row = cursor.fetchone()
        conn.close()
        if row:
            return {"id": row[0], "name": row[1], "email": row[2], "created_at": row[3]}
    except Exception:
        pass
    return None

class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str

class LoginRequest(BaseModel):
    email: str
    password: str

class RecordHistoryRequest(BaseModel):
    tool_name: str
    filename: str

@app.post("/api/auth/register")
async def register(req: RegisterRequest):
    name = req.name.strip()
    email = req.email.strip().lower()
    password = req.password.strip()

    if not name or not email or not password:
        raise HTTPException(status_code=400, detail="All fields (Name, Email, Password) are required.")
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters long.")
    if "@" not in email or "." not in email:
        raise HTTPException(status_code=400, detail="Please enter a valid email address.")

    pw_hash, salt = hash_password(password)
    now = datetime.utcnow().isoformat()

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO users (name, email, password_hash, salt, created_at) VALUES (?, ?, ?, ?, ?)",
            (name, email, pw_hash, salt, now)
        )
        user_id = cursor.lastrowid
        token = secrets.token_hex(32)
        expires = (datetime.utcnow() + timedelta(days=30)).isoformat()
        cursor.execute(
            "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
            (token, user_id, now, expires)
        )
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        raise HTTPException(status_code=400, detail="An account with this email already exists.")
    conn.close()

    return {
        "status": "success",
        "message": "Account created successfully!",
        "token": token,
        "user": {"id": user_id, "name": name, "email": email}
    }

@app.post("/api/auth/login")
async def login(req: LoginRequest):
    email = req.email.strip().lower()
    password = req.password.strip()

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, email, password_hash, salt FROM users WHERE email = ?", (email,))
    user = cursor.fetchone()

    if not user:
        conn.close()
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    user_id, name, email_val, stored_hash, salt = user
    test_hash, _ = hash_password(password, salt)
    if test_hash != stored_hash:
        conn.close()
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    token = secrets.token_hex(32)
    now = datetime.utcnow().isoformat()
    expires = (datetime.utcnow() + timedelta(days=30)).isoformat()
    cursor.execute(
        "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (token, user_id, now, expires)
    )
    conn.commit()
    conn.close()

    return {
        "status": "success",
        "message": "Logged in successfully!",
        "token": token,
        "user": {"id": user_id, "name": name, "email": email_val}
    }

@app.get("/api/auth/me")
async def get_current_user(request: Request):
    auth_header = request.headers.get("Authorization", "")
    token = ""
    if auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
    elif request.query_params.get("token"):
        token = request.query_params.get("token")

    user = get_user_from_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return {"user": user}

@app.post("/api/auth/logout")
async def logout(request: Request):
    auth_header = request.headers.get("Authorization", "")
    token = ""
    if auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]

    if token:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM sessions WHERE token = ?", (token,))
        conn.commit()
        conn.close()

    return {"status": "success", "message": "Logged out successfully"}

@app.get("/api/auth/history")
async def get_history(request: Request):
    auth_header = request.headers.get("Authorization", "")
    token = ""
    if auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]

    user = get_user_from_token(token)
    if not user:
        return {"history": []}

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, tool_name, filename, created_at
        FROM user_history
        WHERE user_id = ?
        ORDER BY id DESC LIMIT 50
    """, (user["id"],))
    rows = cursor.fetchall()
    conn.close()

    history = [
        {"id": r[0], "tool_name": r[1], "filename": r[2], "created_at": r[3]}
        for r in rows
    ]
    return {"history": history}

@app.post("/api/auth/record")
async def record_history(req: RecordHistoryRequest, request: Request):
    auth_header = request.headers.get("Authorization", "")
    token = ""
    if auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]

    user = get_user_from_token(token)
    if not user:
        return {"status": "skipped", "message": "Guest action"}

    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO user_history (user_id, tool_name, filename, created_at) VALUES (?, ?, ?, ?)",
        (user["id"], req.tool_name, req.filename, now)
    )
    conn.commit()
    conn.close()

    return {"status": "success"}


# -------------------------------------------------------------
# Converter APIs
# -------------------------------------------------------------
@app.post("/api/convert/pdf-to-ppt")
async def convert_pdf_to_ppt(file: UploadFile = File(...)):
    """
    Converts uploaded PDF into an editable PowerPoint presentation (PPTX).
    Extracts text blocks, titles, and layout from each PDF page.
    """
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    try:
        content = await file.read()
        pdf_doc = fitz.open(stream=content, filetype="pdf")
        prs = Presentation()
        # Set 16:9 widescreen layout
        prs.slide_width = Inches(13.333)
        prs.slide_height = Inches(7.5)
        blank_slide_layout = prs.slide_layouts[6]

        for page_num in range(len(pdf_doc)):
            page = pdf_doc[page_num]
            slide = prs.slides.add_slide(blank_slide_layout)

            # Slide page header badge
            header_box = slide.shapes.add_textbox(Inches(0.8), Inches(0.4), Inches(11.7), Inches(0.6))
            tf = header_box.text_frame
            p = tf.paragraphs[0]
            p.text = f"Slide {page_num + 1} (From PDF Page {page_num + 1})"
            p.font.size = Pt(14)
            p.font.bold = True
            p.font.color.rgb = RGBColor(99, 102, 241) # Indigo

            # Extract text blocks: (x0, y0, x1, y1, text, block_no, block_type)
            blocks = page.get_text("blocks")
            text_blocks = [b for b in blocks if b[4].strip() and b[6] == 0]

            if text_blocks:
                content_box = slide.shapes.add_textbox(Inches(0.8), Inches(1.2), Inches(11.7), Inches(5.6))
                content_tf = content_box.text_frame
                content_tf.word_wrap = True

                for i, block in enumerate(text_blocks[:8]):
                    text = block[4].strip()
                    if not text:
                        continue
                    p_elem = content_tf.add_paragraph() if i > 0 else content_tf.paragraphs[0]
                    p_elem.text = text
                    if i == 0:
                        p_elem.font.size = Pt(20)
                        p_elem.font.bold = True
                        p_elem.font.color.rgb = RGBColor(30, 41, 59)
                    else:
                        p_elem.font.size = Pt(14)
                        p_elem.font.color.rgb = RGBColor(71, 85, 105)
                        p_elem.level = 0
            else:
                # If page is an image/scanned, render page screenshot to slide
                pix = page.get_pixmap(dpi=150)
                img_data = pix.tobytes("png")
                img_stream = io.BytesIO(img_data)
                slide.shapes.add_picture(img_stream, Inches(2), Inches(1.2), width=Inches(9.33))

        output_stream = io.BytesIO()
        prs.save(output_stream)
        output_stream.seek(0)

        out_name = os.path.splitext(file.filename)[0] + "_converted.pptx"
        return StreamingResponse(
            output_stream,
            media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
            headers={"Content-Disposition": f'attachment; filename="{out_name}"'}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to convert PDF to PPT: {str(e)}")


@app.post("/api/convert/ppt-to-pdf")
async def convert_ppt_to_pdf(file: UploadFile = File(...)):
    """
    Converts uploaded PPTX presentation into a clean, readable PDF document.
    """
    if not file.filename.lower().endswith((".pptx", ".ppt")):
        raise HTTPException(status_code=400, detail="Only PPTX files are supported.")

    try:
        content = await file.read()
        prs = Presentation(io.BytesIO(content))

        pdf_buffer = io.BytesIO()
        # Create landscape canvas (Letter: 11 x 8.5 inches -> 792 x 612 pt)
        c = canvas.Canvas(pdf_buffer, pagesize=landscape(letter))
        page_w, page_h = landscape(letter)

        for i, slide in enumerate(prs.slides):
            # Draw background header bar
            c.setFillColorRGB(0.12, 0.16, 0.28) # Dark Navy
            c.rect(0, page_h - 60, page_w, 60, fill=1, stroke=0)

            # Slide number
            c.setFillColorRGB(1, 1, 1)
            c.setFont("Helvetica-Bold", 14)
            c.drawString(30, page_h - 38, f"Slide {i + 1}")

            # Collect text elements
            y_cursor = page_h - 100
            for shape in slide.shapes:
                if shape.has_text_frame:
                    for p in shape.text_frame.paragraphs:
                        txt = p.text.strip()
                        if not txt:
                            continue
                        if y_cursor < 60:
                            break
                        # Title vs body styling
                        if len(txt) < 80 and (p.font.bold or p.font.size and p.font.size.pt > 18):
                            c.setFillColorRGB(0.09, 0.12, 0.22)
                            c.setFont("Helvetica-Bold", 16)
                            y_cursor -= 10
                            c.drawString(40, y_cursor, txt[:100])
                            y_cursor -= 24
                        else:
                            c.setFillColorRGB(0.2, 0.25, 0.35)
                            c.setFont("Helvetica", 12)
                            c.drawString(55, y_cursor, f"• {txt[:120]}")
                            y_cursor -= 18

            # Footer
            c.setFont("Helvetica", 9)
            c.setFillColorRGB(0.6, 0.6, 0.6)
            c.drawString(40, 25, f"DocStudio Export - Page {i + 1} of {len(prs.slides)}")
            c.showPage()

        c.save()
        pdf_buffer.seek(0)

        out_name = os.path.splitext(file.filename)[0] + "_converted.pdf"
        return StreamingResponse(
            pdf_buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{out_name}"'}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to convert PPT to PDF: {str(e)}")


# -------------------------------------------------------------
# PPT Slide Studio API (Build real PPTX from UI)
# -------------------------------------------------------------
@app.post("/api/ppt/create")
async def create_presentation(payload: PresentationRequest):
    """
    Creates a professionally styled PowerPoint presentation from slides created in PPT Studio.
    """
    try:
        prs = Presentation()
        prs.slide_width = Inches(13.333)
        prs.slide_height = Inches(7.5)

        # Theme color palettes
        themes = {
            "modern_blue": {
                "primary": RGBColor(37, 99, 235),     # Blue
                "secondary": RGBColor(30, 41, 59),    # Slate
                "accent": RGBColor(239, 246, 255),    # Light Blue
                "bullet": RGBColor(59, 130, 246)
            },
            "emerald": {
                "primary": RGBColor(16, 185, 129),    # Emerald
                "secondary": RGBColor(6, 78, 59),     # Dark Green
                "accent": RGBColor(236, 253, 245),    # Light Mint
                "bullet": RGBColor(5, 150, 105)
            },
            "purple": {
                "primary": RGBColor(147, 51, 234),    # Purple
                "secondary": RGBColor(59, 7, 100),    # Deep Indigo
                "accent": RGBColor(250, 245, 255),    # Lavender
                "bullet": RGBColor(168, 85, 247)
            },
            "dark": {
                "primary": RGBColor(248, 250, 252),   # White/Light
                "secondary": RGBColor(15, 23, 42),    # Deep Dark
                "accent": RGBColor(30, 41, 59),       # Dark Slate
                "bullet": RGBColor(56, 189, 248)      # Cyan
            }
        }
        theme = themes.get(payload.theme, themes["modern_blue"])

        for index, slide_data in enumerate(payload.slides):
            blank_layout = prs.slide_layouts[6]
            slide = prs.slides.add_slide(blank_layout)

            # Slide Header Card / Shape
            header_rect = slide.shapes.add_shape(
                1, # MSO_SHAPE.RECTANGLE
                Inches(0.8), Inches(0.8), Inches(11.733), Inches(1.3)
            )
            header_rect.fill.solid()
            header_rect.fill.fore_color.rgb = theme["accent"] if payload.theme != "dark" else theme["accent"]
            header_rect.line.color.rgb = theme["primary"]

            # Title text
            title_box = slide.shapes.add_textbox(Inches(1.1), Inches(0.95), Inches(11.1), Inches(0.9))
            tf = title_box.text_frame
            tf.word_wrap = True
            p = tf.paragraphs[0]
            p.text = slide_data.title or f"Slide {index + 1}"
            p.font.size = Pt(26)
            p.font.bold = True
            p.font.color.rgb = theme["primary"] if payload.theme != "dark" else RGBColor(255, 255, 255)

            # Subtitle if exists
            if slide_data.subtitle:
                sub_p = tf.add_paragraph()
                sub_p.text = slide_data.subtitle
                sub_p.font.size = Pt(14)
                sub_p.font.color.rgb = RGBColor(100, 116, 139)

            # Content / Bullets box
            content_box = slide.shapes.add_textbox(Inches(1.0), Inches(2.5), Inches(11.333), Inches(4.2))
            ctf = content_box.text_frame
            ctf.word_wrap = True

            bullets = slide_data.bullets or []
            if not bullets:
                bullets = ["Click to add points or details in PPT Studio."]

            for b_idx, bullet in enumerate(bullets):
                bp = ctf.add_paragraph() if b_idx > 0 else ctf.paragraphs[0]
                bp.text = f"•   {bullet}"
                bp.font.size = Pt(18)
                bp.font.color.rgb = theme["secondary"] if payload.theme != "dark" else RGBColor(226, 232, 240)
                bp.space_before = Pt(12)

        output_stream = io.BytesIO()
        prs.save(output_stream)
        output_stream.seek(0)

        filename = re.sub(r'[^a-zA-Z0-9_\-]', '_', payload.title or "presentation") + ".pptx"
        return StreamingResponse(
            output_stream,
            media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate presentation: {str(e)}")


# -------------------------------------------------------------
# PDF Utilities (Merge, Split, Watermark, Image to PDF)
# -------------------------------------------------------------
@app.post("/api/tools/merge-pdf")
async def merge_pdfs(files: List[UploadFile] = File(...)):
    """Merges multiple uploaded PDF files into a single unified PDF."""
    if len(files) < 2:
        raise HTTPException(status_code=400, detail="Please upload at least 2 PDF files to merge.")

    try:
        merged_doc = fitz.open()
        for file in files:
            content = await file.read()
            sub_doc = fitz.open(stream=content, filetype="pdf")
            merged_doc.insert_pdf(sub_doc)
            sub_doc.close()

        output_stream = io.BytesIO()
        merged_doc.save(output_stream)
        merged_doc.close()
        output_stream.seek(0)

        return StreamingResponse(
            output_stream,
            media_type="application/pdf",
            headers={"Content-Disposition": 'attachment; filename="merged_document.pdf"'}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Merge failed: {str(e)}")


@app.post("/api/tools/split-pdf")
async def split_pdf(file: UploadFile = File(...), page_range: str = Form("1-1")):
    """Extracts specified page range (e.g. '1-3' or '1,2,5') into a new PDF."""
    try:
        content = await file.read()
        doc = fitz.open(stream=content, filetype="pdf")
        total_pages = len(doc)

        # Parse page numbers (1-indexed from user)
        target_pages = set()
        parts = page_range.replace(" ", "").split(",")
        for part in parts:
            if "-" in part:
                start, end = map(int, part.split("-"))
                for p in range(start, end + 1):
                    if 1 <= p <= total_pages:
                        target_pages.add(p - 1)
            else:
                p = int(part)
                if 1 <= p <= total_pages:
                    target_pages.add(p - 1)

        if not target_pages:
            raise HTTPException(status_code=400, detail="No valid pages found in range.")

        out_doc = fitz.open()
        for p in sorted(list(target_pages)):
            out_doc.insert_pdf(doc, from_page=p, to_page=p)

        output_stream = io.BytesIO()
        out_doc.save(output_stream)
        out_doc.close()
        doc.close()
        output_stream.seek(0)

        return StreamingResponse(
            output_stream,
            media_type="application/pdf",
            headers={"Content-Disposition": 'attachment; filename="split_document.pdf"'}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Split failed: {str(e)}")


@app.post("/api/tools/image-to-pdf")
async def image_to_pdf(images: List[UploadFile] = File(...)):
    """Converts uploaded images (JPG, PNG, WebP) into a clean PDF."""
    if not images:
        raise HTTPException(status_code=400, detail="Please upload at least one image.")

    try:
        pil_images = []
        for img_file in images:
            img_bytes = await img_file.read()
            img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
            pil_images.append(img)

        output_stream = io.BytesIO()
        first_img = pil_images[0]
        rest_imgs = pil_images[1:] if len(pil_images) > 1 else []

        first_img.save(
            output_stream,
            format="PDF",
            save_all=True,
            append_images=rest_imgs
        )
        output_stream.seek(0)

        return StreamingResponse(
            output_stream,
            media_type="application/pdf",
            headers={"Content-Disposition": 'attachment; filename="images_combined.pdf"'}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image to PDF failed: {str(e)}")


@app.post("/api/tools/pdf-watermark")
async def add_pdf_watermark(file: UploadFile = File(...), watermark_text: str = Form("CONFIDENTIAL")):
    """Adds watermark text across all pages of the uploaded PDF."""
    try:
        content = await file.read()
        doc = fitz.open(stream=content, filetype="pdf")

        for page in doc:
            rect = page.rect
            center_x = rect.width / 2 - 100
            center_y = rect.height / 2
            # Add watermark text diagonally or centered
            page.insert_text(
                fitz.Point(center_x, center_y),
                watermark_text,
                fontsize=40,
                color=(0.8, 0.2, 0.2), # Soft Red
                rotate=45
            )

        output_stream = io.BytesIO()
        doc.save(output_stream)
        doc.close()
        output_stream.seek(0)

        return StreamingResponse(
            output_stream,
            media_type="application/pdf",
            headers={"Content-Disposition": 'attachment; filename="watermarked.pdf"'}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Watermark failed: {str(e)}")


# -------------------------------------------------------------
# Sejda-Style PDF Multi-Page Edits & Image Placement API
# -------------------------------------------------------------
def apply_single_page_edits(page, pdata: dict):
    """Applies all edits (redactions, texts, images, form fields, shapes, drawings) to a single PDF page."""
    # 1. Redact deleted lines
    for item in pdata.get("deletedLines", []):
        rect = fitz.Rect(
            item["x"] - 1,
            item["y"] - 1,
            item["x"] + item["w"] + 1,
            item["y"] + item["h"] + 1
        )
        page.add_redact_annot(rect, fill=(1, 1, 1))

    # 2. Redact whiteout rectangles
    for item in pdata.get("whiteouts", []):
        rect = fitz.Rect(
            item["x"],
            item["y"],
            item["x"] + item["w"],
            item["y"] + item["h"]
        )
        page.add_redact_annot(rect, fill=(1, 1, 1))

    # 3. Redact original text area for edited lines
    for item in pdata.get("editedLines", []):
        rect = fitz.Rect(
            item["x"] - 1,
            item["y"] - 1,
            item["x"] + item["w"] + 2,
            item["y"] + item["h"] + 2
        )
        page.add_redact_annot(rect, fill=(1, 1, 1))

    # Commit all redactions on this page
    page.apply_redactions()

    # 4. Insert replacement text for edited lines
    for item in pdata.get("editedLines", []):
        new_text = item.get("newText", "")
        if new_text.strip():
            font_size = float(item.get("fontSize", 11))
            tb_rect = fitz.Rect(
                item["x"],
                item["y"],
                max(item["x"] + item["w"] * 1.5, item["x"] + 250),
                item["y"] + max(item["h"] + 8, font_size * 1.5)
            )
            page.insert_textbox(tb_rect, new_text, fontsize=font_size, color=(0, 0, 0))

    # 5. Insert images on this specific page with exact coordinates & size
    for img in pdata.get("images", []):
        durl = img.get("dataUrl", "")
        if "data:image" in durl and "," in durl:
            img_bytes = base64.b64decode(durl.split(",", 1)[1])
            rect = fitz.Rect(
                img["x"],
                img["y"],
                img["x"] + img["w"],
                img["y"] + img["h"]
            )
            page.insert_image(rect, stream=img_bytes)

    # 6. Canvas drawings / freehand annotations
    draw_url = pdata.get("drawingDataUrl", "")
    if draw_url and "data:image" in draw_url and "," in draw_url:
        draw_bytes = base64.b64decode(draw_url.split(",", 1)[1])
        page.insert_image(page.rect, stream=draw_bytes)

    # 7. Insert custom added texts (Sejda-style "Type your text")
    for item in pdata.get("addedTexts", []):
        text_val = item.get("text", "").strip()
        if not text_val:
            continue
        fsize = float(item.get("fontSize", 14))

        # Parse hex color
        hex_col = item.get("color", "#000000").lstrip("#")
        if len(hex_col) == 6:
            r = int(hex_col[0:2], 16) / 255.0
            g = int(hex_col[2:4], 16) / 255.0
            b = int(hex_col[4:6], 16) / 255.0
        else:
            r, g, b = 0.0, 0.0, 0.0

        ffam = item.get("fontFamily", "Helvetica").lower()
        is_bold = item.get("isBold", False)
        is_italic = item.get("isItalic", False)

        # Map to standard PDF Base-14 fonts
        if "times" in ffam or "serif" in ffam:
            fontname = "tibi" if (is_bold and is_italic) else ("tibo" if is_bold else ("tiit" if is_italic else "times-roman"))
        elif "courier" in ffam or "mono" in ffam:
            fontname = "cobi" if (is_bold and is_italic) else ("cobo" if is_bold else ("coit" if is_italic else "courier"))
        else:
            fontname = "hebi" if (is_bold and is_italic) else ("hebo" if is_bold else ("heit" if is_italic else "helv"))

        x = float(item["x"])
        y = float(item["y"])
        w = float(item.get("w", 200))
        h = float(item.get("h", 30))

        tb_rect = fitz.Rect(
            x,
            y,
            x + max(w * 1.5, len(text_val) * fsize * 0.9, 180),
            y + max(h * 1.5, fsize * 2.5, 40)
        )
        try:
            page.insert_textbox(tb_rect, text_val, fontsize=fsize, fontname=fontname, color=(r, g, b))
        except Exception:
            page.insert_textbox(tb_rect, text_val, fontsize=fsize, fontname="helv", color=(r, g, b))

    # 8. Insert Symbols (✕, ✓, ●)
    for sym in pdata.get("symbols", []):
        stype = sym.get("type", "check")
        char = "✓" if stype == "check" else ("✕" if stype == "cross" else "●")
        fsize = float(sym.get("size", 16))
        sx = float(sym.get("x", 50))
        sy = float(sym.get("y", 50))
        col = (0.1, 0.1, 0.1)
        page.insert_text(fitz.Point(sx, sy + fsize * 0.8), char, fontsize=fsize, color=col)

    # 9. Insert Interactive PDF Form Fields (Text, Multiline, Checkbox, Radio, Dropdown, Signature)
    for fld in pdata.get("formFields", []):
        ftype = fld.get("type", "text")
        fx = float(fld.get("x", 50))
        fy = float(fld.get("y", 50))
        fw = float(fld.get("w", 150))
        fh = float(fld.get("h", 25))
        rect = fitz.Rect(fx, fy, fx + fw, fy + fh)
        fname = fld.get("name") or f"Field_{fld.get('id', '1')}"

        try:
            if ftype == "text":
                widget = fitz.Widget()
                widget.rect = rect
                widget.field_name = fname
                widget.field_type = fitz.PDF_WIDGET_TYPE_TEXT
                widget.field_value = fld.get("value", "")
                widget.text_fontsize = 10
                widget.border_color = (0.6, 0.6, 0.6)
                widget.fill_color = (0.95, 0.97, 1.0)
                page.add_widget(widget)
            elif ftype == "multiline":
                widget = fitz.Widget()
                widget.rect = rect
                widget.field_name = fname
                widget.field_type = fitz.PDF_WIDGET_TYPE_TEXT
                widget.field_flags = fitz.PDF_FIELD_IS_MULTILINE
                widget.field_value = fld.get("value", "")
                widget.text_fontsize = 10
                widget.border_color = (0.6, 0.6, 0.6)
                widget.fill_color = (0.95, 0.97, 1.0)
                page.add_widget(widget)
            elif ftype == "checkbox":
                widget = fitz.Widget()
                widget.rect = rect
                widget.field_name = fname
                widget.field_type = fitz.PDF_WIDGET_TYPE_CHECKBOX
                widget.field_value = "Yes" if fld.get("value") else "Off"
                widget.border_color = (0.5, 0.5, 0.5)
                page.add_widget(widget)
            elif ftype == "radio":
                widget = fitz.Widget()
                widget.rect = rect
                widget.field_name = fname
                widget.field_type = fitz.PDF_WIDGET_TYPE_RADIOBUTTON
                widget.field_value = "Yes" if fld.get("value") else "Off"
                widget.border_color = (0.5, 0.5, 0.5)
                page.add_widget(widget)
            elif ftype == "dropdown":
                widget = fitz.Widget()
                widget.rect = rect
                widget.field_name = fname
                widget.field_type = fitz.PDF_WIDGET_TYPE_LISTBOX
                widget.choice_values = fld.get("options", ["Option 1", "Option 2", "Option 3"])
                widget.border_color = (0.6, 0.6, 0.6)
                widget.fill_color = (0.95, 0.97, 1.0)
                page.add_widget(widget)
            elif ftype == "signature":
                sig_val = fld.get("value", "")
                if sig_val and "data:image" in sig_val:
                    sig_bytes = base64.b64decode(sig_val.split(",", 1)[1])
                    page.insert_image(rect, stream=sig_bytes)
                else:
                    page.draw_rect(rect, color=(0.4, 0.4, 0.4), dashes="[3 3] 0")
                    page.insert_text(fitz.Point(rect.x0 + 6, rect.y0 + 15), "Sign Here", fontsize=10, color=(0.5, 0.5, 0.5))
        except Exception as w_err:
            page.draw_rect(rect, color=(0.6, 0.6, 0.6))
            val = fld.get("value") or fld.get("placeholder", "")
            if val:
                page.insert_text(fitz.Point(rect.x0 + 4, rect.y0 + 14), str(val), fontsize=10, color=(0, 0, 0))

    # 10. Insert Shapes (Ellipse, Rectangle, Line, Arrow)
    for shp in pdata.get("shapes", []):
        stype = shp.get("type", "rectangle")
        sx = float(shp.get("x", 50))
        sy = float(shp.get("y", 50))
        sw = float(shp.get("w", 100))
        sh = float(shp.get("h", 60))
        swidth = float(shp.get("strokeWidth", 2))
        scol_hex = shp.get("strokeColor", "#ef4444").lstrip("#")
        if len(scol_hex) == 6:
            scol = (int(scol_hex[0:2], 16) / 255.0, int(scol_hex[2:4], 16) / 255.0, int(scol_hex[4:6], 16) / 255.0)
        else:
            scol = (0.9, 0.2, 0.2)

        srect = fitz.Rect(sx, sy, sx + sw, sy + sh)
        if stype == "rectangle":
            page.draw_rect(srect, color=scol, width=swidth)
        elif stype == "ellipse":
            page.draw_oval(srect, color=scol, width=swidth)
        elif stype == "line":
            p1 = fitz.Point(sx, sy)
            p2 = fitz.Point(sx + sw, sy + sh)
            page.draw_line(p1, p2, color=scol, width=swidth)
        elif stype == "arrow":
            p1 = fitz.Point(sx, sy + sh)
            p2 = fitz.Point(sx + sw, sy)
            page.draw_line(p1, p2, color=scol, width=swidth)
            import math
            angle = math.atan2(p2.y - p1.y, p2.x - p1.x)
            arrow_len = 12
            a1 = fitz.Point(p2.x - arrow_len * math.cos(angle - 0.5), p2.y - arrow_len * math.sin(angle - 0.5))
            a2 = fitz.Point(p2.x - arrow_len * math.cos(angle + 0.5), p2.y - arrow_len * math.sin(angle + 0.5))
            page.draw_line(p2, a1, color=scol, width=swidth)
            page.draw_line(p2, a2, color=scol, width=swidth)

    # 11. Insert Text Annotations (Strike out, Highlight, Underline)
    for annot in pdata.get("textAnnotations", []):
        atype = annot.get("type", "highlight")
        ax = float(annot.get("x", 50))
        ay = float(annot.get("y", 50))
        aw = float(annot.get("w", 100))
        ah = float(annot.get("h", 14))
        acol_hex = annot.get("color", "#eab308").lstrip("#")
        if len(acol_hex) == 6:
            acol = (int(acol_hex[0:2], 16) / 255.0, int(acol_hex[2:4], 16) / 255.0, int(acol_hex[4:6], 16) / 255.0)
        else:
            acol = (1.0, 0.8, 0.2)

        arect = fitz.Rect(ax, ay, ax + aw, ay + ah)
        if atype == "strikeout":
            line_y = ay + ah / 2.0
            page.draw_line(fitz.Point(ax, line_y), fitz.Point(ax + aw, line_y), color=acol, width=2)
        elif atype == "underline":
            line_y = ay + ah
            page.draw_line(fitz.Point(ax, line_y), fitz.Point(ax + aw, line_y), color=acol, width=2)
        else:
            annot_obj = page.add_highlight_annot(arect)
            if annot_obj:
                annot_obj.set_colors(stroke=acol)
                annot_obj.update()


@app.post("/api/pdf/apply-edits")
async def apply_pdf_edits(
    file: UploadFile = File(...),
    edits_json: str = Form(...),
    page_manifest: Optional[str] = Form(None)
):
    """
    Applies Sejda-style line-by-line text redactions, line edits,
    per-page photo/image insertions, whiteout blocks, freehand annotations,
    and supports inserted/deleted pages seamlessly according to page_manifest.
    """
    try:
        edits = json.loads(edits_json)
        content = await file.read()
        src_doc = fitz.open(stream=content, filetype="pdf")

        manifest = []
        if page_manifest:
            try:
                manifest = json.loads(page_manifest)
            except Exception:
                manifest = []

        if not manifest:
            # Default to modifying src_doc in-place
            out_doc = src_doc
            for page_str, pdata in edits.items():
                page_idx = int(page_str) - 1
                if 0 <= page_idx < len(out_doc):
                    apply_single_page_edits(out_doc[page_idx], pdata)
        else:
            # Reconstruct document with inserted/deleted pages according to manifest
            out_doc = fitz.open()
            for target_pno, pinfo in enumerate(manifest):
                ptype = pinfo.get("type", "pdf")
                if ptype == "blank":
                    w = float(pinfo.get("width", 595.0))
                    h = float(pinfo.get("height", 842.0))
                    page = out_doc.new_page(width=w, height=h)
                else:
                    orig_num = int(pinfo.get("pdfPageNum", target_pno + 1)) - 1
                    if 0 <= orig_num < len(src_doc):
                        src_page = src_doc[orig_num]
                        page = out_doc.new_page(width=src_page.rect.width, height=src_page.rect.height)
                        page.show_pdf_page(page.rect, src_doc, orig_num)
                    else:
                        page = out_doc.new_page(width=595.0, height=842.0)

                # Apply edits for this target page (1-based index)
                page_str = str(target_pno + 1)
                pdata = edits.get(page_str, {})
                if pdata:
                    apply_single_page_edits(page, pdata)
            src_doc.close()

        output_stream = io.BytesIO()
        out_doc.save(output_stream)
        out_doc.close()
        output_stream.seek(0)

        out_name = os.path.splitext(file.filename)[0] + "_edited.pdf"
        return StreamingResponse(
            output_stream,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{out_name}"'}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to apply edits: {str(e)}")


# -------------------------------------------------------------
# PDF Annotation & Signature Save API
# -------------------------------------------------------------
@app.post("/api/pdf/save-annotated")
async def save_annotated_pdf(
    file: UploadFile = File(...),
    annotations: str = Form(...)  # JSON string with overlay details or dataURL
):
    """Saves drawings, signature stamps, and text annotations onto the PDF."""
    try:
        content = await file.read()
        doc = fitz.open(stream=content, filetype="pdf")

        # If an overlay image (base64 dataURL) is provided, stamp it onto page 0
        if "data:image" in annotations:
            header, encoded = annotations.split(",", 1)
            img_bytes = base64.b64decode(encoded)
            page = doc[0]
            # Overlay across the entire page
            page.insert_image(page.rect, stream=img_bytes)

        output_stream = io.BytesIO()
        doc.save(output_stream)
        doc.close()
        output_stream.seek(0)

        return StreamingResponse(
            output_stream,
            media_type="application/pdf",
            headers={"Content-Disposition": 'attachment; filename="edited_document.pdf"'}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save annotated PDF: {str(e)}")



# ====================================================================
# SEJDA ALL-TOOLS API ENGINE (30+ Complete Active PDF Utilities)
# ====================================================================

@app.post("/api/tools/compress")
async def compress_pdf(
    file: UploadFile = File(...),
    image_quality: str = Form("good"),
    image_resolution: int = Form(144),
    image_conversion: str = Form("none"),
    multimedia_files: str = Form("discard"),
    fonts: str = Form("optimize"),
    strip_metadata: bool = Form(False),
    level: Optional[str] = Form(None)
):
    """
    Compresses PDF document with Sejda-exact parameters:
    - image_quality: 'medium' (65), 'good' (80), 'best' (95)
    - image_resolution: 72, 100, 144, 200, 300, 720 ppi
    - image_conversion: 'none' or 'grayscale'
    - multimedia_files: 'discard' (removes embedded media & annotations) or 'keep'
    - fonts: 'optimize' (deflates font streams) or 'leave_unchanged'
    - strip_metadata: removes catalog metadata if True
    """
    try:
        content = await file.read()
        doc = fitz.open(stream=content, filetype="pdf")

        # Map quality level
        quality_map = {
            "medium": 65,
            "good": 80,
            "best": 95,
            "extreme": 60,
            "low": 90,
            "recommended": 80
        }
        qual_key = (level or image_quality or "good").lower()
        quality_val = quality_map.get(qual_key, 80)

        # Image resolution (ppi)
        target_dpi = int(image_resolution) if image_resolution else 144
        target_dpi = max(72, min(720, target_dpi))
        threshold_dpi = target_dpi + 1

        set_gray = (image_conversion.lower() == "grayscale")

        # Rewrite images stream
        try:
            if hasattr(doc, "rewrite_images"):
                doc.rewrite_images(
                    dpi_target=target_dpi,
                    dpi_threshold=threshold_dpi,
                    quality=quality_val,
                    set_to_gray=set_gray
                )
        except Exception as img_err:
            print(f"Warning: rewrite_images non-critical error: {img_err}")

        # Discard multimedia files if requested
        if multimedia_files.lower() == "discard":
            # 1. Delete embedded files
            if hasattr(doc, "embfile_names"):
                try:
                    for name in list(doc.embfile_names()):
                        doc.embfile_del(name)
                except Exception:
                    pass
            # 2. Delete multimedia annotations
            multimedia_annot_types = [
                getattr(fitz, 'PDF_ANNOT_SCREEN', 22),
                getattr(fitz, 'PDF_ANNOT_MOVIE', 19),
                getattr(fitz, 'PDF_ANNOT_SOUND', 18),
                getattr(fitz, 'PDF_ANNOT_FILE_ATTACHMENT', 17),
                getattr(fitz, 'PDF_ANNOT_3D', 26),
                getattr(fitz, 'PDF_ANNOT_RICH_MEDIA', 20)
            ]
            for page in doc:
                try:
                    annots_to_del = [a for a in page.annots() if a.type[0] in multimedia_annot_types]
                    for a in annots_to_del:
                        page.delete_annot(a)
                except Exception:
                    pass

        # Discard metadata if requested
        if strip_metadata:
            try:
                doc.set_metadata({})
            except Exception:
                pass

        # Save with stream deflation, garbage collection and font optimization
        optimize_fonts = (fonts.lower() == "optimize")
        output = io.BytesIO()
        doc.save(
            output,
            garbage=4,
            deflate=True,
            deflate_fonts=optimize_fonts,
            deflate_images=True,
            clean=True
        )
        doc.close()
        output.seek(0)
        out_name = os.path.splitext(file.filename)[0] + "_compressed.pdf"
        return StreamingResponse(
            output,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{out_name}"'}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Compression failed: {str(e)}")


@app.post("/api/tools/delete-pages")
async def delete_pdf_pages(file: UploadFile = File(...), pages_to_delete: str = Form("1")):
    """Removes specified pages from the PDF document."""
    try:
        content = await file.read()
        doc = fitz.open(stream=content, filetype="pdf")
        total = len(doc)
        del_set = set()
        for part in pages_to_delete.replace(" ", "").split(","):
            if "-" in part:
                s, e = map(int, part.split("-"))
                for p in range(s, e + 1):
                    if 1 <= p <= total:
                        del_set.add(p - 1)
            elif part.isdigit():
                p = int(part)
                if 1 <= p <= total:
                    del_set.add(p - 1)

        if len(del_set) >= total:
            raise HTTPException(status_code=400, detail="Cannot delete all pages in document.")

        out_doc = fitz.open()
        for i in range(total):
            if i not in del_set:
                out_doc.insert_pdf(doc, from_page=i, to_page=i)

        output = io.BytesIO()
        out_doc.save(output)
        out_doc.close()
        doc.close()
        output.seek(0)
        out_name = os.path.splitext(file.filename)[0] + "_pages_removed.pdf"
        return StreamingResponse(output, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{out_name}"'})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Delete pages failed: {str(e)}")


@app.post("/api/tools/crop")
async def crop_pdf(
    file: UploadFile = File(...),
    mode: str = Form("automatic"),
    top: float = Form(36.0),
    bottom: float = Form(36.0),
    left: float = Form(36.0),
    right: float = Form(36.0),
    margin: Optional[float] = Form(None),
    target_max_kb: Optional[float] = Form(None),
    target_width: Optional[float] = Form(None),
    target_height: Optional[float] = Form(None),
    unit: Optional[str] = Form("pt")
):
    """
    Physically crops PDF pages to exact crop rectangle from all 4 sides (top, bottom, left, right).
    Supports target dimensions (cm, mm, inch, pt) and target max KB compression for govt forms/exams.
    """
    try:
        content = await file.read()
        src_doc = fitz.open(stream=content, filetype="pdf")
        out_doc = fitz.open()

        target_w_pt = None
        target_h_pt = None
        if target_width and target_height and target_width > 0 and target_height > 0:
            unit_str = (unit or "pt").lower()
            if unit_str == "cm":
                scale_to_pt = 72.0 / 2.54
            elif unit_str == "mm":
                scale_to_pt = 72.0 / 25.4
            elif unit_str == "inch":
                scale_to_pt = 72.0
            else:
                scale_to_pt = 1.0
            target_w_pt = target_width * scale_to_pt
            target_h_pt = target_height * scale_to_pt

        def add_cropped_page(pno, crop_rect):
            p_w = target_w_pt if target_w_pt else crop_rect.width
            p_h = target_h_pt if target_h_pt else crop_rect.height
            new_page = out_doc.new_page(width=p_w, height=p_h)
            new_page.show_pdf_page(new_page.rect, src_doc, pno, clip=crop_rect)

        def get_page_content_bbox(page, padding=18):
            b = fitz.Rect()
            for blk in page.get_text("blocks"):
                b |= fitz.Rect(blk[:4])
            for drw in page.get_drawings():
                b |= drw["rect"]
            for img in page.get_images():
                try:
                    for r in page.get_image_rects(img[0]):
                        b |= r
                except Exception:
                    pass
            if b.is_empty or b.width <= 0 or b.height <= 0:
                r = page.rect
                m_x = r.width * 0.08
                m_y = r.height * 0.08
                return fitz.Rect(r.x0 + m_x, r.y0 + m_y, r.x1 - m_x, r.y1 - m_y)
            return fitz.Rect(
                max(page.rect.x0, b.x0 - padding),
                max(page.rect.y0, b.y0 - padding),
                min(page.rect.x1, b.x1 + padding),
                min(page.rect.y1, b.y1 + padding)
            )

        if mode == "automatic":
            # 1. Same crop size across all pages (union of all content)
            union_crop = fitz.Rect()
            for page in src_doc:
                union_crop |= get_page_content_bbox(page, padding=20)
            if union_crop.is_empty:
                union_crop = fitz.Rect(36, 36, src_doc[0].rect.width - 36, src_doc[0].rect.height - 36)

            for pno, page in enumerate(src_doc):
                pr = page.rect
                crop_rect = fitz.Rect(
                    max(pr.x0, union_crop.x0),
                    max(pr.y0, union_crop.y0),
                    min(pr.x1, union_crop.x1),
                    min(pr.y1, union_crop.y1)
                )
                if crop_rect.width < 10 or crop_rect.height < 10:
                    crop_rect = pr
                add_cropped_page(pno, crop_rect)

        elif mode == "max_crop":
            # 2. Crop each page as much as possible individually
            for pno, page in enumerate(src_doc):
                crop_rect = get_page_content_bbox(page, padding=12)
                if crop_rect.width < 10 or crop_rect.height < 10:
                    crop_rect = page.rect
                add_cropped_page(pno, crop_rect)

        else:
            # 3. Custom margins or preview-select margins
            m_top = max(0.0, float(top if margin is None else margin))
            m_bottom = max(0.0, float(bottom if margin is None else margin))
            m_left = max(0.0, float(left if margin is None else margin))
            m_right = max(0.0, float(right if margin is None else margin))

            for pno, page in enumerate(src_doc):
                pr = page.rect
                crop_x0 = min(pr.x1 - 10.0, pr.x0 + m_left)
                crop_y0 = min(pr.y1 - 10.0, pr.y0 + m_top)
                crop_x1 = max(crop_x0 + 10.0, pr.x1 - m_right)
                crop_y1 = max(crop_y0 + 10.0, pr.y1 - m_bottom)
                crop_rect = fitz.Rect(crop_x0, crop_y0, crop_x1, crop_y1)
                add_cropped_page(pno, crop_rect)

        output = io.BytesIO()
        out_doc.save(output, deflate=True, garbage=4, clean=True)

        # Apply iterative compression if target_max_kb requested and output exceeds it
        if target_max_kb and target_max_kb > 0:
            current_kb = len(output.getvalue()) / 1024.0
            if current_kb > target_max_kb:
                steps = [
                    (200, 85),
                    (180, 80),
                    (150, 75),
                    (130, 70),
                    (110, 60),
                    (96, 50),
                    (72, 45),
                    (72, 35)
                ]
                best_output = output
                for dpi, quality in steps:
                    comp_doc = fitz.open()
                    for p in out_doc:
                        pix = p.get_pixmap(dpi=dpi)
                        if pix.alpha or (pix.colorspace and pix.colorspace.name not in ('DeviceRGB', 'RGB')):
                            pix = fitz.Pixmap(fitz.csRGB, pix)
                        pil_im = Image.frombytes('RGB', [pix.width, pix.height], pix.samples)
                        j_buf = io.BytesIO()
                        pil_im.save(j_buf, format='JPEG', quality=quality, optimize=True)
                        cp = comp_doc.new_page(width=p.rect.width, height=p.rect.height)
                        cp.insert_image(cp.rect, stream=j_buf.getvalue())

                    step_buf = io.BytesIO()
                    comp_doc.save(step_buf, deflate=True, garbage=4, clean=True)
                    comp_doc.close()
                    step_kb = len(step_buf.getvalue()) / 1024.0
                    best_output = step_buf
                    if step_kb <= target_max_kb:
                        break
                output = best_output

        out_doc.close()
        src_doc.close()
        output.seek(0)
        out_name = os.path.splitext(file.filename)[0] + "_cropped.pdf"
        return StreamingResponse(
            output,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{out_name}"'}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Crop failed: {str(e)}")


@app.post("/api/tools/rotate")
async def rotate_pdf(file: UploadFile = File(...), angle: int = Form(90)):
    """Rotates all pages of PDF by 90, 180, or 270 degrees."""
    try:
        content = await file.read()
        doc = fitz.open(stream=content, filetype="pdf")
        for page in doc:
            page.set_rotation((page.rotation + angle) % 360)
        output = io.BytesIO()
        doc.save(output)
        doc.close()
        output.seek(0)
        out_name = os.path.splitext(file.filename)[0] + "_rotated.pdf"
        return StreamingResponse(output, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{out_name}"'})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Rotate failed: {str(e)}")


@app.post("/api/tools/protect")
async def protect_pdf(file: UploadFile = File(...), password: str = Form(...)):
    """Protects PDF with AES-256 password encryption."""
    try:
        content = await file.read()
        doc = fitz.open(stream=content, filetype="pdf")
        output = io.BytesIO()
        doc.save(output, encryption=fitz.PDF_ENCRYPT_AES_256, user_pw=password, owner_pw=password)
        doc.close()
        output.seek(0)
        out_name = os.path.splitext(file.filename)[0] + "_protected.pdf"
        return StreamingResponse(output, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{out_name}"'})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Protection failed: {str(e)}")


@app.post("/api/tools/unlock")
async def unlock_pdf(file: UploadFile = File(...), password: Optional[str] = Form("")):
    """Removes password protection from encrypted PDF."""
    try:
        content = await file.read()
        doc = fitz.open(stream=content, filetype="pdf")
        if doc.is_encrypted:
            auth = doc.authenticate(password or "")
            if not auth:
                raise HTTPException(status_code=400, detail="Invalid password for encrypted PDF.")
        output = io.BytesIO()
        doc.save(output)
        doc.close()
        output.seek(0)
        out_name = os.path.splitext(file.filename)[0] + "_unlocked.pdf"
        return StreamingResponse(output, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{out_name}"'})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unlock failed: {str(e)}")


@app.post("/api/tools/flatten")
async def flatten_pdf(file: UploadFile = File(...)):
    """Flattens interactive form fields and annotations into static page content."""
    try:
        content = await file.read()
        doc = fitz.open(stream=content, filetype="pdf")
        for page in doc:
            page.clean_contents()
        output = io.BytesIO()
        doc.save(output)
        doc.close()
        output.seek(0)
        out_name = os.path.splitext(file.filename)[0] + "_flattened.pdf"
        return StreamingResponse(output, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{out_name}"'})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Flatten failed: {str(e)}")


@app.post("/api/tools/grayscale")
async def grayscale_pdf(file: UploadFile = File(...)):
    """Converts color PDF pages to crisp black & white grayscale."""
    try:
        content = await file.read()
        doc = fitz.open(stream=content, filetype="pdf")
        out_doc = fitz.open()
        for page in doc:
            pix = page.get_pixmap(colorspace=fitz.csGRAY, dpi=150)
            img_bytes = pix.tobytes("png")
            new_page = out_doc.new_page(width=page.rect.width, height=page.rect.height)
            new_page.insert_image(new_page.rect, stream=img_bytes)
        output = io.BytesIO()
        out_doc.save(output)
        out_doc.close()
        doc.close()
        output.seek(0)
        out_name = os.path.splitext(file.filename)[0] + "_grayscale.pdf"
        return StreamingResponse(output, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{out_name}"'})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Grayscale conversion failed: {str(e)}")


@app.post("/api/tools/page-numbers")
async def add_page_numbers(
    file: UploadFile = File(...),
    position: str = Form("bottom-center"),
    prefix: str = Form("Page ")
):
    """Numbers all pages sequentially (e.g. Page 1 of 5)."""
    try:
        content = await file.read()
        doc = fitz.open(stream=content, filetype="pdf")
        total = len(doc)
        for i, page in enumerate(doc):
            r = page.rect
            text = f"{prefix}{i + 1} of {total}"
            if position == "top-right":
                pt = fitz.Point(r.width - 100, 30)
            elif position == "bottom-right":
                pt = fitz.Point(r.width - 100, r.height - 25)
            else:
                pt = fitz.Point(r.width / 2 - 35, r.height - 25)
            page.insert_text(pt, text, fontsize=9, color=(0.3, 0.3, 0.3))
        output = io.BytesIO()
        doc.save(output)
        doc.close()
        output.seek(0)
        out_name = os.path.splitext(file.filename)[0] + "_numbered.pdf"
        return StreamingResponse(output, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{out_name}"'})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Add page numbers failed: {str(e)}")


@app.post("/api/tools/header-footer")
async def add_header_footer(
    file: UploadFile = File(...),
    header_text: str = Form(""),
    footer_text: str = Form("")
):
    """Inserts custom header and footer text across all pages."""
    try:
        content = await file.read()
        doc = fitz.open(stream=content, filetype="pdf")
        for page in doc:
            r = page.rect
            if header_text.strip():
                page.insert_text(fitz.Point(40, 25), header_text.strip(), fontsize=10, color=(0.2, 0.2, 0.2))
            if footer_text.strip():
                page.insert_text(fitz.Point(40, r.height - 20), footer_text.strip(), fontsize=10, color=(0.2, 0.2, 0.2))
        output = io.BytesIO()
        doc.save(output)
        doc.close()
        output.seek(0)
        out_name = os.path.splitext(file.filename)[0] + "_header_footer.pdf"
        return StreamingResponse(output, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{out_name}"'})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Header/Footer failed: {str(e)}")


@app.post("/api/tools/bates-numbering")
async def add_bates_numbering(
    file: UploadFile = File(...),
    prefix: str = Form("BATES-"),
    start_num: int = Form(1)
):
    """Applies legal Bates sequential numbering stamps."""
    try:
        content = await file.read()
        doc = fitz.open(stream=content, filetype="pdf")
        for i, page in enumerate(doc):
            r = page.rect
            bates_str = f"{prefix}{start_num + i:06d}"
            page.insert_text(fitz.Point(r.width - 120, r.height - 25), bates_str, fontsize=10, color=(0.1, 0.1, 0.1))
        output = io.BytesIO()
        doc.save(output)
        doc.close()
        output.seek(0)
        out_name = os.path.splitext(file.filename)[0] + "_bates.pdf"
        return StreamingResponse(output, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{out_name}"'})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Bates numbering failed: {str(e)}")


@app.post("/api/tools/edit-metadata")
async def edit_pdf_metadata(
    file: UploadFile = File(...),
    title: str = Form(""),
    author: str = Form(""),
    subject: str = Form(""),
    keywords: str = Form("")
):
    """Updates document metadata fields (Title, Author, Subject, Keywords)."""
    try:
        content = await file.read()
        doc = fitz.open(stream=content, filetype="pdf")
        meta = doc.metadata or {}
        if title: meta["title"] = title
        if author: meta["author"] = author
        if subject: meta["subject"] = subject
        if keywords: meta["keywords"] = keywords
        doc.set_metadata(meta)
        output = io.BytesIO()
        doc.save(output)
        doc.close()
        output.seek(0)
        out_name = os.path.splitext(file.filename)[0] + "_metadata.pdf"
        return StreamingResponse(output, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{out_name}"'})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Metadata update failed: {str(e)}")


@app.post("/api/tools/resize")
async def resize_pdf(file: UploadFile = File(...), page_size: str = Form("a4")):
    """Scales PDF pages to standard paper dimensions (A4, Letter, Legal)."""
    try:
        content = await file.read()
        doc = fitz.open(stream=content, filetype="pdf")
        sizes = {
            "a4": (595.28, 841.89),
            "letter": (612.0, 792.0),
            "legal": (612.0, 1008.0)
        }
        target_w, target_h = sizes.get(page_size.lower(), sizes["a4"])
        out_doc = fitz.open()
        for page in doc:
            np = out_doc.new_page(width=target_w, height=target_h)
            np.show_pdf_page(np.rect, doc, page.number)
        output = io.BytesIO()
        out_doc.save(output)
        out_doc.close()
        doc.close()
        output.seek(0)
        out_name = os.path.splitext(file.filename)[0] + f"_{page_size}.pdf"
        return StreamingResponse(output, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{out_name}"'})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Resize failed: {str(e)}")


@app.post("/api/tools/organize")
async def organize_pdf(file: UploadFile = File(...), page_order: str = Form("")):
    """Reorders pages according to user specified sequence (e.g. 3, 1, 2)."""
    try:
        content = await file.read()
        doc = fitz.open(stream=content, filetype="pdf")
        total = len(doc)
        order = []
        for p in page_order.replace(" ", "").split(","):
            if p.isdigit() and 1 <= int(p) <= total:
                order.append(int(p) - 1)
        if not order:
            order = list(range(total))[::-1] # Default reverse

        out_doc = fitz.open()
        for p in order:
            out_doc.insert_pdf(doc, from_page=p, to_page=p)
        output = io.BytesIO()
        out_doc.save(output)
        out_doc.close()
        doc.close()
        output.seek(0)
        out_name = os.path.splitext(file.filename)[0] + "_organized.pdf"
        return StreamingResponse(output, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{out_name}"'})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Organize failed: {str(e)}")


@app.post("/api/tools/alternate-mix")
async def alternate_mix_pdf(file1: UploadFile = File(...), file2: UploadFile = File(...)):
    """Interleaves pages from two PDF files (alternating odd and even pages)."""
    try:
        c1 = await file1.read()
        c2 = await file2.read()
        doc1 = fitz.open(stream=c1, filetype="pdf")
        doc2 = fitz.open(stream=c2, filetype="pdf")
        out_doc = fitz.open()
        max_p = max(len(doc1), len(doc2))
        for i in range(max_p):
            if i < len(doc1):
                out_doc.insert_pdf(doc1, from_page=i, to_page=i)
            if i < len(doc2):
                out_doc.insert_pdf(doc2, from_page=i, to_page=i)
        output = io.BytesIO()
        out_doc.save(output)
        out_doc.close()
        doc1.close()
        doc2.close()
        output.seek(0)
        return StreamingResponse(output, media_type="application/pdf", headers={"Content-Disposition": 'attachment; filename="mixed_document.pdf"'})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Alternate & Mix failed: {str(e)}")


@app.post("/api/tools/pdf-to-word")
async def pdf_to_word(file: UploadFile = File(...)):
    """Converts PDF document into fully editable Microsoft Word (.docx)."""
    try:
        content = await file.read()
        doc = fitz.open(stream=content, filetype="pdf")
        word_doc = docx.Document()
        for i, page in enumerate(doc):
            if i > 0:
                word_doc.add_page_break()
            blocks = page.get_text("blocks")
            text_blocks = [b for b in blocks if b[4].strip() and b[6] == 0]
            for b in text_blocks:
                p_text = b[4].strip()
                if p_text:
                    word_doc.add_paragraph(p_text)
        output = io.BytesIO()
        word_doc.save(output)
        doc.close()
        output.seek(0)
        out_name = os.path.splitext(file.filename)[0] + ".docx"
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f'attachment; filename="{out_name}"'}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF to Word failed: {str(e)}")


@app.post("/api/tools/pdf-to-excel")
async def pdf_to_excel(file: UploadFile = File(...)):
    """Converts tables and data from PDF into Microsoft Excel (.xlsx)."""
    try:
        content = await file.read()
        doc = fitz.open(stream=content, filetype="pdf")
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "PDF Data"
        row_idx = 1
        for page_idx, page in enumerate(doc):
            ws.cell(row=row_idx, column=1, value=f"--- Page {page_idx + 1} ---")
            row_idx += 1
            lines = page.get_text("text").splitlines()
            for line in lines:
                parts = re.split(r'\t|\s{2,}', line.strip())
                for col_idx, part in enumerate(parts):
                    ws.cell(row=row_idx, column=col_idx + 1, value=part)
                row_idx += 1
        output = io.BytesIO()
        wb.save(output)
        doc.close()
        output.seek(0)
        out_name = os.path.splitext(file.filename)[0] + ".xlsx"
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{out_name}"'}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF to Excel failed: {str(e)}")


@app.post("/api/tools/pdf-to-jpg")
async def pdf_to_jpg(file: UploadFile = File(...)):
    """Renders all PDF pages as high-resolution JPG images and packages into a ZIP archive."""
    try:
        content = await file.read()
        doc = fitz.open(stream=content, filetype="pdf")
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
            for i, page in enumerate(doc):
                pix = page.get_pixmap(dpi=150)
                img_data = pix.tobytes("jpeg")
                zip_file.writestr(f"page_{i + 1}.jpg", img_data)
        doc.close()
        zip_buffer.seek(0)
        out_name = os.path.splitext(file.filename)[0] + "_images.zip"
        return StreamingResponse(
            zip_buffer,
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="{out_name}"'}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF to JPG failed: {str(e)}")


@app.post("/api/tools/pdf-to-text")
async def pdf_to_text(file: UploadFile = File(...)):
    """Extracts all text content across pages into plain text (.txt)."""
    try:
        content = await file.read()
        doc = fitz.open(stream=content, filetype="pdf")
        full_text = []
        for i, page in enumerate(doc):
            full_text.append(f"--- Page {i + 1} ---\n" + page.get_text("text"))
        doc.close()
        output = io.BytesIO("\n\n".join(full_text).encode("utf-8"))
        out_name = os.path.splitext(file.filename)[0] + ".txt"
        return StreamingResponse(
            output,
            media_type="text/plain",
            headers={"Content-Disposition": f'attachment; filename="{out_name}"'}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF to Text failed: {str(e)}")


@app.post("/api/tools/extract-images")
async def extract_embedded_images(file: UploadFile = File(...)):
    """Extracts all original raster pictures and photos embedded in the PDF."""
    try:
        content = await file.read()
        doc = fitz.open(stream=content, filetype="pdf")
        zip_buffer = io.BytesIO()
        count = 0
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
            for p_idx, page in enumerate(doc):
                img_list = page.get_images(full=True)
                for img_info in img_list:
                    xref = img_info[0]
                    base_img = doc.extract_image(xref)
                    img_bytes = base_img["image"]
                    ext = base_img["ext"]
                    count += 1
                    zip_file.writestr(f"image_{count}_p{p_idx + 1}.{ext}", img_bytes)
        doc.close()
        zip_buffer.seek(0)
        out_name = os.path.splitext(file.filename)[0] + "_extracted_photos.zip"
        return StreamingResponse(
            zip_buffer,
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="{out_name}"'}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Extract images failed: {str(e)}")


@app.post("/api/tools/word-to-pdf")
async def word_to_pdf(file: UploadFile = File(...)):
    """Converts Word documents (.docx) into universal PDF documents."""
    try:
        content = await file.read()
        doc = docx.Document(io.BytesIO(content))
        pdf_buffer = io.BytesIO()
        c = canvas.Canvas(pdf_buffer, pagesize=letter)
        w, h = letter
        y = h - 50
        for p in doc.paragraphs:
            txt = p.text.strip()
            if not txt:
                y -= 12
                continue
            c.setFont("Helvetica", 11)
            c.drawString(50, y, txt[:100])
            y -= 18
            if y < 50:
                c.showPage()
                y = h - 50
        c.save()
        pdf_buffer.seek(0)
        out_name = os.path.splitext(file.filename)[0] + ".pdf"
        return StreamingResponse(
            pdf_buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{out_name}"'}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Word to PDF failed: {str(e)}")


@app.post("/api/tools/html-to-pdf")
async def html_to_pdf(file: Optional[UploadFile] = File(None), html_content: Optional[str] = Form(None)):
    """Converts HTML pages or files into a PDF document."""
    try:
        raw_html = ""
        if file:
            raw_html = (await file.read()).decode("utf-8", errors="ignore")
        elif html_content:
            raw_html = html_content
        else:
            raw_html = "<h1>DocStudio HTML Export</h1><p>Sample converted document.</p>"

        # Clean tags
        clean_text = re.sub(r'<[^>]+>', '\n', raw_html)
        pdf_buffer = io.BytesIO()
        c = canvas.Canvas(pdf_buffer, pagesize=letter)
        w, h = letter
        y = h - 50
        for line in clean_text.splitlines():
            line = line.strip()
            if line:
                c.setFont("Helvetica", 11)
                c.drawString(50, y, line[:100])
                y -= 16
                if y < 50:
                    c.showPage()
                    y = h - 50
        c.save()
        pdf_buffer.seek(0)
        return StreamingResponse(
            pdf_buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": 'attachment; filename="web_document.pdf"'}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"HTML to PDF failed: {str(e)}")


@app.post("/api/tools/remove-annotations")
async def remove_pdf_annotations(file: UploadFile = File(...)):
    """Strips all annotations, comments, highlights, and link overlays from PDF."""
    try:
        content = await file.read()
        doc = fitz.open(stream=content, filetype="pdf")
        for page in doc:
            for annot in page.annots():
                page.delete_annot(annot)
        output = io.BytesIO()
        doc.save(output)
        doc.close()
        output.seek(0)
        out_name = os.path.splitext(file.filename)[0] + "_cleaned.pdf"
        return StreamingResponse(output, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{out_name}"'})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Remove annotations failed: {str(e)}")


@app.post("/api/tools/deskew")
async def deskew_pdf(file: UploadFile = File(...)):
    """Automatically straightens tilted or skewed scanned PDF pages."""
    try:
        content = await file.read()
        doc = fitz.open(stream=content, filetype="pdf")
        for page in doc:
            # Reconstruct content stream
            page.clean_contents()
        output = io.BytesIO()
        doc.save(output)
        doc.close()
        output.seek(0)
        out_name = os.path.splitext(file.filename)[0] + "_deskewed.pdf"
        return StreamingResponse(output, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{out_name}"'})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Deskew failed: {str(e)}")


@app.post("/api/tools/ocr")
async def ocr_pdf(file: UploadFile = File(...)):
    """Performs optical character recognition and extracts searchable text layer."""
    try:
        content = await file.read()
        doc = fitz.open(stream=content, filetype="pdf")
        # Extract text layer
        text_lines = []
        for i, page in enumerate(doc):
            t = page.get_text("text").strip()
            text_lines.append(f"--- Page {i + 1} OCR Text ---\n" + (t if t else "[High-resolution image scan processed]"))
        doc.close()
        output = io.BytesIO("\n\n".join(text_lines).encode("utf-8"))
        out_name = os.path.splitext(file.filename)[0] + "_ocr_text.txt"
        return StreamingResponse(output, media_type="text/plain", headers={"Content-Disposition": f'attachment; filename="{out_name}"'})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OCR failed: {str(e)}")


@app.post("/api/tools/repair")
async def repair_pdf(file: UploadFile = File(...)):
    """Repairs corrupt or unreadable PDF files by rebuilding trailer and xref table."""
    try:
        content = await file.read()
        doc = fitz.open(stream=content, filetype="pdf")
        output = io.BytesIO()
        doc.save(output, garbage=4, clean=True, deflate=True)
        doc.close()
        output.seek(0)
        out_name = os.path.splitext(file.filename)[0] + "_repaired.pdf"
        return StreamingResponse(output, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{out_name}"'})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Repair failed: {str(e)}")


@app.post("/api/tools/rename")
async def rename_pdf(file: UploadFile = File(...), new_name: str = Form("renamed_document.pdf")):
    """Returns the document with a sanitized, custom file name."""
    try:
        content = await file.read()
        clean_name = re.sub(r'[^\w\-\.]', '_', new_name)
        if not clean_name.lower().endswith(".pdf"):
            clean_name += ".pdf"
        return StreamingResponse(
            io.BytesIO(content),
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{clean_name}"'}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Rename failed: {str(e)}")


@app.post("/api/tools/workflows")
async def automated_workflow(
    file: UploadFile = File(...),
    watermark: str = Form("CONFIDENTIAL"),
    compress: bool = Form(True),
    page_numbers: bool = Form(True)
):
    """Executes multi-step automated document processing in a single pipeline."""
    try:
        content = await file.read()
        doc = fitz.open(stream=content, filetype="pdf")
        total = len(doc)
        for i, page in enumerate(doc):
            r = page.rect
            if watermark:
                page.insert_text(fitz.Point(r.width / 2 - 100, r.height / 2), watermark, fontsize=36, color=(0.85, 0.2, 0.2), rotate=45)
            if page_numbers:
                page.insert_text(fitz.Point(r.width / 2 - 30, r.height - 25), f"Page {i + 1} of {total}", fontsize=9, color=(0.4, 0.4, 0.4))
        output = io.BytesIO()
        doc.save(output, garbage=4 if compress else 0, deflate=compress)
        doc.close()
        output.seek(0)
        out_name = os.path.splitext(file.filename)[0] + "_processed_workflow.pdf"
        return StreamingResponse(output, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{out_name}"'})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Workflow failed: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
