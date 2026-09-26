// DocStudio - Sejda-Style PDF Editor Engine
// Supports: Line-by-line text editing, line deletion/redaction, image upload & positioning per page, whiteout, and annotation.

let currentPdfDoc = null;
let currentPdfFile = null;
let currentPdfPage = 1;
let totalPdfPages = 0;
let pdfScale = 1.3;
let currentTool = 'text'; // 'text', 'image', 'whiteout', 'pen', 'highlighter'
let strokeColor = '#000000';
let strokeWidth = 3;

// Per-page edits storage: { [pageNum]: { deletedLines: [], editedLines: [], images: [], whiteouts: [], drawingDataUrl: null } }
let pageEdits = {};
let actionHistory = [];

// DOM References
const pdfUploadInput = document.getElementById('pdf-upload-input');
const pdfWorkspace = document.getElementById('pdf-workspace');
const pdfEmptyState = document.getElementById('pdf-empty-state');
const renderCanvas = document.getElementById('pdf-render-canvas');
const drawCanvas = document.getElementById('pdf-draw-canvas');
const interactiveLayer = document.getElementById('pdf-interactive-layer');

const btnPrevPage = document.getElementById('btn-prev-page');
const btnNextPage = document.getElementById('btn-next-page');
const currentPageSpan = document.getElementById('pdf-current-page');
const totalPagesSpan = document.getElementById('pdf-total-pages');
const btnApplyChanges = document.getElementById('btn-apply-changes');

const toolText = document.getElementById('tool-text');
const toolImageBtn = document.getElementById('tool-image-btn');
const pdfImageUpload = document.getElementById('pdf-image-upload');
const toolWhiteout = document.getElementById('tool-whiteout');
const toolPen = document.getElementById('tool-pen');
const toolHighlighter = document.getElementById('tool-highlighter');
const toolColor = document.getElementById('tool-color');
const toolUndo = document.getElementById('tool-undo');
const toolAnnotate = document.getElementById('tool-annotate');
const toolShapes = document.getElementById('tool-shapes');
const btnZoomIn = document.getElementById('btn-zoom-in');
const btnZoomOut = document.getElementById('btn-zoom-out');
const zoomLevelSpan = document.getElementById('zoom-level');

let selectedAnnotateType = 'highlight'; // 'strikeout', 'highlight', 'underline'
let selectedAnnotateColor = '#ef4444';
let selectedShapeType = 'rectangle'; // 'ellipse', 'rectangle', 'line', 'arrow'
let selectedShapeColor = '#ef4444';
let isDraggingShape = false;
let shapeStart = { x: 0, y: 0 };
let shapePreview = null;
let annotationsVisible = true;

// Drawing context
let drawCtx = drawCanvas ? drawCanvas.getContext('2d') : null;
let isDrawing = false;

// Whiteout drag state
let isDraggingWhiteout = false;
let whiteoutStart = { x: 0, y: 0 };
let whiteoutPreview = null;

// Helpers
function getPageEdits(pageNum) {
    if (!pageEdits[pageNum]) {
        pageEdits[pageNum] = {
            deletedLines: [],
            editedLines: [],
            addedTexts: [],
            symbols: [],
            formFields: [],
            shapes: [],
            textAnnotations: [],
            images: [],
            whiteouts: [],
            drawingDataUrl: null
        };
    }
    if (!pageEdits[pageNum].addedTexts) pageEdits[pageNum].addedTexts = [];
    if (!pageEdits[pageNum].symbols) pageEdits[pageNum].symbols = [];
    if (!pageEdits[pageNum].formFields) pageEdits[pageNum].formFields = [];
    if (!pageEdits[pageNum].shapes) pageEdits[pageNum].shapes = [];
    if (!pageEdits[pageNum].textAnnotations) pageEdits[pageNum].textAnnotations = [];
    return pageEdits[pageNum];
}

// -------------------------------------------------------------
// PDF Upload & Initialization
// -------------------------------------------------------------
if (pdfUploadInput) {
    pdfUploadInput.addEventListener('change', async (e) => {
        if (e.target.files.length > 0) {
            currentPdfFile = e.target.files[0];
            await loadPdfDocument(currentPdfFile);
        }
    });
}

let editorPages = [];
const btnInsertPage = document.getElementById('btn-insert-page');
const btnDeletePage = document.getElementById('btn-delete-page');

async function loadPdfDocument(file) {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        currentPdfDoc = await loadingTask.promise;
        
        editorPages = [];
        for (let i = 1; i <= currentPdfDoc.numPages; i++) {
            const page = await currentPdfDoc.getPage(i);
            const vp = page.getViewport({ scale: 1.0 });
            editorPages.push({
                type: 'pdf',
                pdfPageNum: i,
                width: vp.width,
                height: vp.height
            });
        }

        totalPdfPages = editorPages.length;
        currentPdfPage = 1;
        pageEdits = {};
        actionHistory = [];

        if (totalPagesSpan) totalPagesSpan.innerText = totalPdfPages;
        if (currentPageSpan) currentPageSpan.innerText = currentPdfPage;

        pdfEmptyState.classList.add('hidden');
        pdfWorkspace.classList.remove('hidden');

        await renderCurrentPage();
        showToast('PDF loaded successfully! Click any line to edit or delete.', 'success');
    } catch (err) {
        showToast('Failed to load PDF: ' + err.message, 'error');
    }
}

// -------------------------------------------------------------
// Render PDF Page & Setup Layers
// -------------------------------------------------------------
async function renderCurrentPage() {
    if (!currentPdfDoc && editorPages.length === 0) return;

    saveCurrentPageDrawings();

    if (currentPageSpan) currentPageSpan.innerText = currentPdfPage;
    if (totalPagesSpan) totalPagesSpan.innerText = totalPdfPages;

    const curPage = editorPages[currentPdfPage - 1] || { type: 'pdf', pdfPageNum: currentPdfPage, width: 595, height: 842 };
    const displayWidth = Math.round(curPage.width * pdfScale);
    const displayHeight = Math.round(curPage.height * pdfScale);

    // Canvas sizes
    renderCanvas.width = displayWidth;
    renderCanvas.height = displayHeight;
    drawCanvas.width = displayWidth;
    drawCanvas.height = displayHeight;

    // Interactive layer size
    interactiveLayer.style.width = displayWidth + 'px';
    interactiveLayer.style.height = displayHeight + 'px';
    interactiveLayer.innerHTML = '';

    const renderCtx = renderCanvas.getContext('2d');
    renderCtx.clearRect(0, 0, displayWidth, displayHeight);

    if (curPage.type === 'pdf') {
        const page = await currentPdfDoc.getPage(curPage.pdfPageNum);
        const viewport = page.getViewport({ scale: pdfScale });
        await page.render({ canvasContext: renderCtx, viewport }).promise;

        // Extract text content and render interactive line overlays
        const textContent = await page.getTextContent();
        renderInteractiveTextLines(textContent, viewport);
    } else {
        // Blank inserted page: render clean white paper sheet
        renderCtx.fillStyle = '#ffffff';
        renderCtx.fillRect(0, 0, displayWidth, displayHeight);
    }

    // Render existing page edits (whiteouts, deleted lines, edited lines, images, text, shapes)
    renderSavedPageEdits();

    // Restore freehand drawings
    restorePageDrawings();

    // Re-bind drawing context
    drawCtx = drawCanvas.getContext('2d');
    setupDrawCanvasListeners();

    if (window.lucide) lucide.createIcons();
}

function saveCurrentPageDrawings() {
    if (drawCanvas && drawCanvas.width > 0) {
        const pageData = getPageEdits(currentPdfPage);
        const blank = document.createElement('canvas');
        blank.width = drawCanvas.width;
        blank.height = drawCanvas.height;
        if (drawCanvas.toDataURL() !== blank.toDataURL()) {
            pageData.drawingDataUrl = drawCanvas.toDataURL('image/png');
        }
    }
}

function restorePageDrawings() {
    if (!drawCtx) return;
    drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    const pageData = getPageEdits(currentPdfPage);
    if (pageData.drawingDataUrl) {
        const img = new Image();
        img.onload = () => {
            drawCtx.drawImage(img, 0, 0, drawCanvas.width, drawCanvas.height);
        };
        img.src = pageData.drawingDataUrl;
    }
}

// -------------------------------------------------------------
// Interactive Text Layer: Grouping Items into Lines
// -------------------------------------------------------------
function renderInteractiveTextLines(textContent, viewport) {
    const rawItems = [];
    for (const item of textContent.items) {
        if (!item.str || item.str.trim() === '') continue;
        const tx = item.transform[4];
        const ty = item.transform[5];
        const [vx, vy] = viewport.convertToViewportPoint(tx, ty);
        const vh = Math.abs(item.height * pdfScale) || 14;
        const vw = item.width * pdfScale;
        rawItems.push({
            str: item.str,
            x: vx,
            y: vy - vh,
            w: vw,
            h: vh,
            fontSize: vh
        });
    }

    // Sort items top-to-bottom, left-to-right
    rawItems.sort((a, b) => a.y - b.y || a.x - b.x);

    // Group items into lines within 5px vertical variance
    const lines = [];
    for (const item of rawItems) {
        let matchedLine = lines.find(l => Math.abs(l.y - item.y) <= 5);
        if (matchedLine) {
            matchedLine.items.push(item);
            matchedLine.str += ' ' + item.str;
            matchedLine.x = Math.min(matchedLine.x, item.x);
            matchedLine.w = Math.max(matchedLine.w, (item.x + item.w) - matchedLine.x);
            matchedLine.h = Math.max(matchedLine.h, item.h);
        } else {
            lines.push({
                str: item.str,
                x: item.x,
                y: item.y,
                w: item.w,
                h: item.h,
                fontSize: item.fontSize,
                items: [item]
            });
        }
    }

    const pageData = getPageEdits(currentPdfPage);

    lines.forEach((line, idx) => {
        // Skip if this line is already marked as deleted
        const isDeleted = pageData.deletedLines.some(dl =>
            Math.abs(dl.x * pdfScale - line.x) < 12 && Math.abs(dl.y * pdfScale - line.y) < 12
        );
        if (isDeleted) return;

        // Skip if this line is already edited (renderSavedPageEdits renders it)
        const edited = pageData.editedLines.find(el =>
            Math.abs(el.x * pdfScale - line.x) < 12 && Math.abs(el.y * pdfScale - line.y) < 12
        );
        if (edited) return;

        const lineEl = document.createElement('div');
        lineEl.className = 'pdf-text-line group';
        lineEl.style.left = `${line.x}px`;
        lineEl.style.top = `${line.y}px`;
        lineEl.style.width = `${Math.max(line.w, 35)}px`;
        lineEl.style.height = `${Math.max(line.h, 16)}px`;
        lineEl.setAttribute('data-text', line.str);

        // Hover Action Buttons (Edit + Delete)
        const actionsBar = document.createElement('div');
        actionsBar.className = 'pdf-line-actions';

        const editBtn = document.createElement('button');
        editBtn.className = 'pdf-line-action-btn';
        editBtn.title = 'Edit line';
        editBtn.innerHTML = '<i data-lucide="edit-3" class="w-3 h-3 text-white"></i>';
        editBtn.onclick = (e) => {
            e.stopPropagation();
            startLineEdit(lineEl, line);
        };

        const delBtn = document.createElement('button');
        delBtn.className = 'pdf-line-action-btn delete';
        delBtn.title = 'Delete line';
        delBtn.innerHTML = '<i data-lucide="trash-2" class="w-3 h-3 text-white"></i>';
        delBtn.onclick = (e) => {
            e.stopPropagation();
            deleteTextLine(lineEl, line);
        };

        actionsBar.appendChild(editBtn);
        actionsBar.appendChild(delBtn);
        lineEl.appendChild(actionsBar);

        // Click on line to start edit directly in Text mode or apply Annotation
        lineEl.onclick = () => {
            if (currentTool === 'text') {
                startLineEdit(lineEl, line);
            } else if (currentTool === 'annotate-text' && selectedAnnotateType) {
                const pageData = getPageEdits(currentPdfPage);
                const annotRecord = {
                    id: 'annot_' + Date.now(),
                    type: selectedAnnotateType,
                    x: line.x / pdfScale,
                    y: line.y / pdfScale,
                    w: (line.w + 4) / pdfScale,
                    h: (line.h + 2) / pdfScale,
                    color: selectedAnnotateColor
                };
                pageData.textAnnotations.push(annotRecord);
                actionHistory.push({ type: 'addAnnotation', page: currentPdfPage, data: annotRecord });
                renderTextAnnotationItem(annotRecord);
                showToast(`${selectedAnnotateType} added to line!`, 'success');
            }
        };

        interactiveLayer.appendChild(lineEl);
    });
}

// -------------------------------------------------------------
// Line Deletion & Line Edit Handlers
// -------------------------------------------------------------
function deleteTextLine(lineEl, line) {
    const pageData = getPageEdits(currentPdfPage);
    const ptX = line.x / pdfScale;
    const ptY = line.y / pdfScale;
    const ptW = (line.w + 4) / pdfScale;
    const ptH = (line.h + 2) / pdfScale;

    const delRecord = { x: ptX, y: ptY, w: ptW, h: ptH, text: line.str };
    pageData.deletedLines.push(delRecord);
    actionHistory.push({ type: 'deleteLine', page: currentPdfPage, data: delRecord });

    lineEl.remove();
    createDeletedWhiteoutDOM(line.x, line.y, line.w + 4, line.h + 2);
    showToast('Line deleted (redacted)', 'success');
}

function createDeletedWhiteoutDOM(x, y, w, h) {
    const whiteoutEl = document.createElement('div');
    whiteoutEl.className = 'pdf-deleted-whiteout';
    whiteoutEl.style.left = `${x}px`;
    whiteoutEl.style.top = `${y}px`;
    whiteoutEl.style.width = `${w}px`;
    whiteoutEl.style.height = `${h}px`;
    interactiveLayer.appendChild(whiteoutEl);
}

function startLineEdit(lineEl, line) {
    const currentText = lineEl.getAttribute('data-text') || line.str;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'w-full h-full px-1.5 bg-white text-slate-900 border-2 border-sky-500 rounded outline-none shadow-md z-30 font-medium';
    input.value = currentText;
    input.style.fontSize = `${line.fontSize * 0.9}px`;

    lineEl.innerHTML = '';
    lineEl.style.backgroundColor = '#ffffff';
    lineEl.style.zIndex = '30';
    lineEl.appendChild(input);
    input.focus();
    input.select();

    let finished = false;
    const finishEdit = () => {
        if (finished) return;
        finished = true;
        const newText = input.value.trim();
        if (newText !== currentText && newText.length > 0) {
            const pageData = getPageEdits(currentPdfPage);
            const ptX = line.x / pdfScale;
            const ptY = line.y / pdfScale;
            const ptW = (line.w + 4) / pdfScale;
            const ptH = (line.h + 2) / pdfScale;

            const editRecord = {
                x: ptX,
                y: ptY,
                w: ptW,
                h: ptH,
                originalText: line.str,
                newText: newText,
                fontSize: (line.fontSize * 0.85) / pdfScale
            };
            pageData.editedLines.push(editRecord);
            actionHistory.push({ type: 'editLine', page: currentPdfPage, data: editRecord });
            showToast('Line edited successfully!', 'success');
        }
        renderCurrentPage();
    };

    input.onblur = finishEdit;
    input.onkeydown = (e) => {
        if (e.key === 'Enter') {
            finishEdit();
        } else if (e.key === 'Escape') {
            finished = true;
            renderCurrentPage();
        }
    };
}

// -------------------------------------------------------------
// Render Saved Page Edits (Whiteouts, Images, Deleted/Edited Overlays)
// -------------------------------------------------------------
function renderSavedPageEdits() {
    const pageData = getPageEdits(currentPdfPage);

    // 1. Deleted lines whiteouts
    pageData.deletedLines.forEach(dl => {
        createDeletedWhiteoutDOM(dl.x * pdfScale, dl.y * pdfScale, dl.w * pdfScale, dl.h * pdfScale);
    });

    // 2. Edited lines whiteouts + replacement text
    pageData.editedLines.forEach(el => {
        createDeletedWhiteoutDOM(el.x * pdfScale, el.y * pdfScale, el.w * pdfScale, el.h * pdfScale);
        const textEl = document.createElement('div');
        textEl.className = 'pdf-edited-line';
        textEl.style.left = `${el.x * pdfScale}px`;
        textEl.style.top = `${el.y * pdfScale}px`;
        textEl.style.fontSize = `${el.fontSize * pdfScale}px`;
        textEl.innerText = el.newText;
        interactiveLayer.appendChild(textEl);
    });

    // 3. User Whiteouts
    pageData.whiteouts.forEach(wo => {
        renderWhiteoutBox(wo);
    });

    // 4. Added Images for this specific page
    pageData.images.forEach(img => {
        renderImageContainer(img);
    });

    // 5. Added Texts for this specific page
    pageData.addedTexts.forEach(txt => {
        renderAddedTextItem(txt, false);
    });

    // 6. Placed Symbols for this specific page
    pageData.symbols.forEach(sym => {
        renderSymbolItem(sym);
    });

    // 7. Placed Form Fields for this specific page
    pageData.formFields.forEach((fld, idx) => {
        renderFormFieldItem(fld, idx + 1);
    });

    // 8. Placed Shapes for this specific page
    pageData.shapes.forEach(shp => {
        renderShapeItem(shp);
    });

    // 9. Placed Text Annotations for this specific page
    pageData.textAnnotations.forEach(annot => {
        renderTextAnnotationItem(annot);
    });
}

function renderWhiteoutBox(wo) {
    const box = document.createElement('div');
    box.className = 'pdf-whiteout-item group';
    box.style.left = `${wo.x * pdfScale}px`;
    box.style.top = `${wo.y * pdfScale}px`;
    box.style.width = `${wo.w * pdfScale}px`;
    box.style.height = `${wo.h * pdfScale}px`;

    box.title = 'Whiteout block (click to remove)';
    box.onclick = (e) => {
        e.stopPropagation();
        const pageData = getPageEdits(currentPdfPage);
        pageData.whiteouts = pageData.whiteouts.filter(w => w.id !== wo.id);
        box.remove();
        showToast('Whiteout removed', 'info');
    };

    interactiveLayer.appendChild(box);
}

function renderShapeItem(shp) {
    const el = document.createElement('div');
    el.className = 'pdf-shape-item group';
    el.setAttribute('data-id', shp.id);
    el.style.left = `${shp.x * pdfScale}px`;
    el.style.top = `${shp.y * pdfScale}px`;
    el.style.width = `${shp.w * pdfScale}px`;
    el.style.height = `${shp.h * pdfScale}px`;

    const w = Math.max(10, shp.w * pdfScale);
    const h = Math.max(10, shp.h * pdfScale);
    const color = shp.strokeColor || '#ef4444';
    const strokeW = (shp.strokeWidth || 2) * (pdfScale >= 1 ? 1 : pdfScale);

    let svgHtml = '';
    if (shp.type === 'rectangle') {
        svgHtml = `<svg viewBox="0 0 ${w} ${h}">
            <rect x="${strokeW/2}" y="${strokeW/2}" width="${Math.max(1, w - strokeW)}" height="${Math.max(1, h - strokeW)}" fill="none" stroke="${color}" stroke-width="${strokeW}" rx="2" />
        </svg>`;
    } else if (shp.type === 'ellipse') {
        svgHtml = `<svg viewBox="0 0 ${w} ${h}">
            <ellipse cx="${w/2}" cy="${h/2}" rx="${Math.max(1, (w - strokeW)/2)}" ry="${Math.max(1, (h - strokeW)/2)}" fill="none" stroke="${color}" stroke-width="${strokeW}" />
        </svg>`;
    } else if (shp.type === 'line') {
        svgHtml = `<svg viewBox="0 0 ${w} ${h}">
            <line x1="2" y1="${h - 2}" x2="${w - 2}" y2="2" stroke="${color}" stroke-width="${strokeW}" stroke-linecap="round" />
        </svg>`;
    } else if (shp.type === 'arrow') {
        const markerId = 'arrow-marker-' + shp.id;
        svgHtml = `<svg viewBox="0 0 ${w} ${h}">
            <defs>
                <marker id="${markerId}" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                    <polygon points="0 0, 8 4, 0 8" fill="${color}" />
                </marker>
            </defs>
            <line x1="4" y1="${h - 4}" x2="${w - 6}" y2="4" stroke="${color}" stroke-width="${strokeW}" stroke-linecap="round" marker-end="url(#${markerId})" />
        </svg>`;
    }

    el.innerHTML = svgHtml;

    // Delete button
    const delBtn = document.createElement('button');
    delBtn.className = 'pdf-shape-del-btn';
    delBtn.innerHTML = '✕';
    delBtn.title = 'Delete shape';
    delBtn.onclick = (e) => {
        e.stopPropagation();
        const pageData = getPageEdits(currentPdfPage);
        pageData.shapes = pageData.shapes.filter(s => s.id !== shp.id);
        el.remove();
        showToast('Shape removed', 'info');
    };
    el.appendChild(delBtn);

    // Draggable shape
    let isMoving = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let initialX = 0;
    let initialY = 0;

    el.onmousedown = (e) => {
        if (e.target === delBtn) return;
        isMoving = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        initialX = parseFloat(el.style.left) || 0;
        initialY = parseFloat(el.style.top) || 0;
        e.stopPropagation();

        const onMove = (mEvt) => {
            if (!isMoving) return;
            const dx = mEvt.clientX - dragStartX;
            const dy = mEvt.clientY - dragStartY;
            el.style.left = `${initialX + dx}px`;
            el.style.top = `${initialY + dy}px`;
        };

        const onUp = () => {
            if (!isMoving) return;
            isMoving = false;
            shp.x = (parseFloat(el.style.left) || 0) / pdfScale;
            shp.y = (parseFloat(el.style.top) || 0) / pdfScale;
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    };

    interactiveLayer.appendChild(el);
    return el;
}

function renderTextAnnotationItem(annot) {
    const el = document.createElement('div');
    el.className = 'pdf-text-annotation group';
    el.setAttribute('data-id', annot.id);
    el.style.left = `${annot.x * pdfScale}px`;
    el.style.top = `${annot.y * pdfScale}px`;
    el.style.width = `${annot.w * pdfScale}px`;
    el.style.height = `${annot.h * pdfScale}px`;
    if (!annotationsVisible) el.style.display = 'none';

    if (annot.type === 'strikeout') {
        const line = document.createElement('div');
        line.style.cssText = `position:absolute; left:0; right:0; top:50%; height:2px; background-color:${annot.color}; transform:translateY(-50%); pointer-events:none;`;
        el.appendChild(line);
    } else if (annot.type === 'underline') {
        const line = document.createElement('div');
        line.style.cssText = `position:absolute; left:0; right:0; bottom:1px; height:2px; background-color:${annot.color}; pointer-events:none;`;
        el.appendChild(line);
    } else {
        // highlight
        const col = (annot.color && annot.color.length === 7) ? `${annot.color}55` : 'rgba(234, 179, 8, 0.35)';
        el.style.backgroundColor = col;
        el.style.borderRadius = '2px';
    }

    // Delete button
    const delBtn = document.createElement('button');
    delBtn.className = 'pdf-annot-del-btn';
    delBtn.innerHTML = '✕';
    delBtn.title = 'Remove annotation';
    delBtn.onclick = (e) => {
        e.stopPropagation();
        const pageData = getPageEdits(currentPdfPage);
        pageData.textAnnotations = pageData.textAnnotations.filter(a => a.id !== annot.id);
        el.remove();
        showToast('Annotation removed', 'info');
    };
    el.appendChild(delBtn);

    interactiveLayer.appendChild(el);
    return el;
}

// -------------------------------------------------------------
// Image Placement & Manipulation (Drag & Resize)
// -------------------------------------------------------------
if (toolImageBtn && pdfImageUpload) {
    toolImageBtn.addEventListener('click', () => {
        pdfImageUpload.click();
    });

    pdfImageUpload.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = (re) => {
                insertImageOnCurrentPage(re.target.result);
                pdfImageUpload.value = '';
            };
            reader.readAsDataURL(file);
        }
    });
}

function insertImageOnCurrentPage(dataUrl) {
    const img = new Image();
    img.onload = () => {
        const aspect = img.naturalWidth / img.naturalHeight;
        let initW = 200;
        let initH = initW / aspect;

        const pageData = getPageEdits(currentPdfPage);
        const imgRecord = {
            id: 'img_' + Date.now(),
            x: 60 / pdfScale,
            y: 60 / pdfScale,
            w: initW / pdfScale,
            h: initH / pdfScale,
            dataUrl: dataUrl
        };

        pageData.images.push(imgRecord);
        actionHistory.push({ type: 'addImage', page: currentPdfPage, data: imgRecord });
        renderImageContainer(imgRecord);
        showToast('Photo added to Page ' + currentPdfPage + '! Drag or resize as needed.', 'success');
    };
    img.src = dataUrl;
}

function renderImageContainer(imgRecord) {
    const container = document.createElement('div');
    container.className = 'pdf-image-container';
    container.style.left = `${imgRecord.x * pdfScale}px`;
    container.style.top = `${imgRecord.y * pdfScale}px`;
    container.style.width = `${imgRecord.w * pdfScale}px`;
    container.style.height = `${imgRecord.h * pdfScale}px`;

    const imgEl = document.createElement('img');
    imgEl.src = imgRecord.dataUrl;
    container.appendChild(imgEl);

    // Delete button
    const delBtn = document.createElement('div');
    delBtn.className = 'pdf-image-del-btn';
    delBtn.innerHTML = '<i data-lucide="x" class="w-3.5 h-3.5"></i>';
    delBtn.title = 'Remove photo';
    delBtn.onclick = (e) => {
        e.stopPropagation();
        const pageData = getPageEdits(currentPdfPage);
        pageData.images = pageData.images.filter(i => i.id !== imgRecord.id);
        container.remove();
        showToast('Photo removed', 'info');
    };
    container.appendChild(delBtn);

    // Resize handle
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'pdf-image-resize-handle';
    resizeHandle.title = 'Drag to resize';
    container.appendChild(resizeHandle);

    // Drag to Move logic
    let isMoving = false;
    let startX = 0;
    let startY = 0;
    let origLeft = 0;
    let origTop = 0;

    container.onmousedown = (e) => {
        if (e.target === delBtn || e.target === resizeHandle) return;
        isMoving = true;
        startX = e.clientX;
        startY = e.clientY;
        origLeft = parseFloat(container.style.left);
        origTop = parseFloat(container.style.top);

        const onMouseMove = (moveEvt) => {
            if (!isMoving) return;
            const dx = moveEvt.clientX - startX;
            const dy = moveEvt.clientY - startY;
            const newLeft = Math.max(0, origLeft + dx);
            const newTop = Math.max(0, origTop + dy);

            container.style.left = `${newLeft}px`;
            container.style.top = `${newTop}px`;

            imgRecord.x = newLeft / pdfScale;
            imgRecord.y = newTop / pdfScale;
        };

        const onMouseUp = () => {
            isMoving = false;
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    };

    // Resize logic
    resizeHandle.onmousedown = (e) => {
        e.stopPropagation();
        let isResizing = true;
        let sX = e.clientX;
        let sY = e.clientY;
        let origW = parseFloat(container.style.width);
        let origH = parseFloat(container.style.height);

        const onResizeMove = (mEvt) => {
            if (!isResizing) return;
            const dw = mEvt.clientX - sX;
            const dh = mEvt.clientY - sY;
            const newW = Math.max(30, origW + dw);
            const newH = Math.max(30, origH + dh);

            container.style.width = `${newW}px`;
            container.style.height = `${newH}px`;

            imgRecord.w = newW / pdfScale;
            imgRecord.h = newH / pdfScale;
        };

        const onResizeUp = () => {
            isResizing = false;
            window.removeEventListener('mousemove', onResizeMove);
            window.removeEventListener('mouseup', onResizeUp);
        };

        window.addEventListener('mousemove', onResizeMove);
        window.addEventListener('mouseup', onResizeUp);
    };

    interactiveLayer.appendChild(container);
    if (window.lucide) lucide.createIcons();
}

// -------------------------------------------------------------
// Sejda Floating Mini-Formatting Toolbar & Added Texts Engine
// -------------------------------------------------------------
let activeTextRecord = null;
let activeTextEl = null;
let floatingToolbarEl = null;

function getOrCreateFloatingToolbar() {
    if (floatingToolbarEl && document.body.contains(floatingToolbarEl)) {
        return floatingToolbarEl;
    }

    floatingToolbarEl = document.createElement('div');
    floatingToolbarEl.className = 'sejda-floating-toolbar';
    floatingToolbarEl.innerHTML = `
        <button class="sejda-tb-btn sejda-tb-btn-bold" id="stb-bold" title="Bold (B)">B</button>
        <button class="sejda-tb-btn sejda-tb-btn-italic" id="stb-italic" title="Italic (I)">I</button>

        <div class="relative flex items-stretch">
            <button class="sejda-tb-btn" id="stb-size-btn" title="Font size">
                <span class="flex items-center gap-0.5 pointer-events-none">
                    <span class="font-bold text-xs">T</span>
                    <svg class="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M7 10l5-5 5 5M7 14l5 5 5-5"/></svg>
                    <svg class="w-2 h-2 ml-0.5 opacity-70" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>
                </span>
            </button>
            <div class="sejda-dropdown-menu" id="stb-size-menu">
                <button class="sejda-dropdown-item" data-size="10">10 pt</button>
                <button class="sejda-dropdown-item" data-size="12">12 pt</button>
                <button class="sejda-dropdown-item" data-size="14">14 pt</button>
                <button class="sejda-dropdown-item" data-size="16">16 pt</button>
                <button class="sejda-dropdown-item" data-size="18">18 pt</button>
                <button class="sejda-dropdown-item" data-size="20">20 pt</button>
                <button class="sejda-dropdown-item" data-size="24">24 pt</button>
                <button class="sejda-dropdown-item" data-size="28">28 pt</button>
                <button class="sejda-dropdown-item" data-size="32">32 pt</button>
                <button class="sejda-dropdown-item" data-size="40">40 pt</button>
            </div>
        </div>

        <div class="relative flex items-stretch">
            <button class="sejda-tb-btn" id="stb-font-btn" title="Font family">
                <span class="flex items-center gap-0.5 text-xs font-semibold pointer-events-none">
                    <span>Aa</span>
                    <svg class="w-2 h-2 ml-0.5 opacity-70" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>
                </span>
            </button>
            <div class="sejda-dropdown-menu" id="stb-font-menu">
                <button class="sejda-dropdown-item font-sans" data-font="Helvetica, Arial, sans-serif">Helvetica (Sans)</button>
                <button class="sejda-dropdown-item font-serif" data-font="'Times New Roman', Times, serif">Times (Serif)</button>
                <button class="sejda-dropdown-item font-mono" data-font="'Courier New', Courier, monospace">Courier (Mono)</button>
            </div>
        </div>

        <div class="relative flex items-stretch">
            <button class="sejda-tb-btn" id="stb-color-btn" title="Text Color">
                <span class="flex items-center gap-0.5 pointer-events-none">
                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/>
                        <circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/>
                        <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.563-2.512 5.563-5.563C22 6.5 17.5 2 12 2z"/>
                    </svg>
                    <svg class="w-2 h-2 ml-0.5 opacity-70" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>
                </span>
            </button>
            <div class="sejda-dropdown-menu" id="stb-color-menu">
                <div class="sejda-color-grid">
                    <div class="sejda-color-swatch" style="background:#000000" data-color="#000000" title="Black"></div>
                    <div class="sejda-color-swatch" style="background:#475569" data-color="#475569" title="Slate"></div>
                    <div class="sejda-color-swatch" style="background:#dc2626" data-color="#dc2626" title="Red"></div>
                    <div class="sejda-color-swatch" style="background:#ea580c" data-color="#ea580c" title="Orange"></div>
                    <div class="sejda-color-swatch" style="background:#16a34a" data-color="#16a34a" title="Green"></div>
                    <div class="sejda-color-swatch" style="background:#0284c7" data-color="#0284c7" title="Sky Blue"></div>
                    <div class="sejda-color-swatch" style="background:#2563eb" data-color="#2563eb" title="Royal Blue"></div>
                    <div class="sejda-color-swatch" style="background:#9333ea" data-color="#9333ea" title="Purple"></div>
                    <div class="sejda-color-swatch" style="background:#db2777" data-color="#db2777" title="Pink"></div>
                    <div class="sejda-color-swatch" style="background:#ffffff" data-color="#ffffff" title="White"></div>
                </div>
                <label class="px-2 py-1 flex items-center justify-between text-xs text-slate-600 hover:bg-slate-100 cursor-pointer rounded border-t border-slate-100 mt-1">
                    <span>Custom</span>
                    <input type="color" id="stb-custom-color" value="#000000" class="w-4 h-4 border-0 p-0 cursor-pointer">
                </label>
            </div>
        </div>

        <button class="sejda-tb-btn" id="stb-link" title="Insert Link">
            <svg class="w-3.5 h-3.5 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
        </button>

        <button class="sejda-tb-btn sejda-tb-btn-move" id="stb-move" title="Drag to move text">
            <svg class="w-3.5 h-3.5 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/>
                <polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/>
                <line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/>
            </svg>
        </button>

        <button class="sejda-tb-btn" id="stb-copy" title="Duplicate text">
            <svg class="w-3.5 h-3.5 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
        </button>

        <button class="sejda-tb-btn sejda-tb-btn-trash" id="stb-trash" title="Delete text">
            <svg class="w-3.5 h-3.5 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
        </button>
    `;

    setupFloatingToolbarEvents();
    return floatingToolbarEl;
}

function closeAllDropdowns() {
    if (!floatingToolbarEl) return;
    floatingToolbarEl.querySelectorAll('.sejda-dropdown-menu').forEach(m => m.classList.remove('show'));
}

function setupFloatingToolbarEvents() {
    if (!floatingToolbarEl) return;

    floatingToolbarEl.addEventListener('click', (e) => e.stopPropagation());
    floatingToolbarEl.addEventListener('mousedown', (e) => e.stopPropagation());

    // 1. Bold toggle
    const boldBtn = floatingToolbarEl.querySelector('#stb-bold');
    boldBtn.onclick = () => {
        if (!activeTextRecord || !activeTextEl) return;
        activeTextRecord.isBold = !activeTextRecord.isBold;
        boldBtn.classList.toggle('active', activeTextRecord.isBold);
        const ed = activeTextEl.querySelector('.sejda-text-editable');
        if (ed) ed.style.fontWeight = activeTextRecord.isBold ? 'bold' : 'normal';
    };

    // 2. Italic toggle
    const italicBtn = floatingToolbarEl.querySelector('#stb-italic');
    italicBtn.onclick = () => {
        if (!activeTextRecord || !activeTextEl) return;
        activeTextRecord.isItalic = !activeTextRecord.isItalic;
        italicBtn.classList.toggle('active', activeTextRecord.isItalic);
        const ed = activeTextEl.querySelector('.sejda-text-editable');
        if (ed) ed.style.fontStyle = activeTextRecord.isItalic ? 'italic' : 'normal';
    };

    // 3. Font size dropdown
    const sizeBtn = floatingToolbarEl.querySelector('#stb-size-btn');
    const sizeMenu = floatingToolbarEl.querySelector('#stb-size-menu');
    sizeBtn.onclick = (e) => {
        e.stopPropagation();
        const isOpen = sizeMenu.classList.contains('show');
        closeAllDropdowns();
        if (!isOpen) sizeMenu.classList.add('show');
    };

    sizeMenu.querySelectorAll('.sejda-dropdown-item').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            if (!activeTextRecord || !activeTextEl) return;
            const size = parseInt(btn.getAttribute('data-size'));
            activeTextRecord.fontSize = size;
            const ed = activeTextEl.querySelector('.sejda-text-editable');
            if (ed) ed.style.fontSize = `${size * pdfScale}px`;
            closeAllDropdowns();
            positionFloatingToolbar(activeTextEl);
        };
    });

    // 4. Font family dropdown
    const fontBtn = floatingToolbarEl.querySelector('#stb-font-btn');
    const fontMenu = floatingToolbarEl.querySelector('#stb-font-menu');
    fontBtn.onclick = (e) => {
        e.stopPropagation();
        const isOpen = fontMenu.classList.contains('show');
        closeAllDropdowns();
        if (!isOpen) fontMenu.classList.add('show');
    };

    fontMenu.querySelectorAll('.sejda-dropdown-item').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            if (!activeTextRecord || !activeTextEl) return;
            const font = btn.getAttribute('data-font');
            activeTextRecord.fontFamily = font;
            const ed = activeTextEl.querySelector('.sejda-text-editable');
            if (ed) ed.style.fontFamily = font;
            closeAllDropdowns();
            positionFloatingToolbar(activeTextEl);
        };
    });

    // 5. Color picker dropdown
    const colorBtn = floatingToolbarEl.querySelector('#stb-color-btn');
    const colorMenu = floatingToolbarEl.querySelector('#stb-color-menu');
    colorBtn.onclick = (e) => {
        e.stopPropagation();
        const isOpen = colorMenu.classList.contains('show');
        closeAllDropdowns();
        if (!isOpen) colorMenu.classList.add('show');
    };

    colorMenu.querySelectorAll('.sejda-color-swatch').forEach(sw => {
        sw.onclick = (e) => {
            e.stopPropagation();
            if (!activeTextRecord || !activeTextEl) return;
            const col = sw.getAttribute('data-color');
            activeTextRecord.color = col;
            const ed = activeTextEl.querySelector('.sejda-text-editable');
            if (ed) ed.style.color = col;
            closeAllDropdowns();
        };
    });

    const customColInput = floatingToolbarEl.querySelector('#stb-custom-color');
    if (customColInput) {
        customColInput.oninput = (e) => {
            if (!activeTextRecord || !activeTextEl) return;
            activeTextRecord.color = e.target.value;
            const ed = activeTextEl.querySelector('.sejda-text-editable');
            if (ed) ed.style.color = e.target.value;
        };
    }

    // 6. Link button
    const linkBtn = floatingToolbarEl.querySelector('#stb-link');
    linkBtn.onclick = () => {
        if (!activeTextRecord) return;
        const url = prompt('Enter URL for hyperlink (e.g. https://example.com):', activeTextRecord.url || 'https://');
        if (url && url.trim()) {
            activeTextRecord.url = url.trim();
            showToast('Link attached to text!', 'success');
        }
    };

    // 7. Move button drag handle
    const moveBtn = floatingToolbarEl.querySelector('#stb-move');
    let isMovingText = false;
    let sX = 0, sY = 0, origLeft = 0, origTop = 0;

    moveBtn.onmousedown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!activeTextEl || !activeTextRecord) return;

        isMovingText = true;
        sX = e.clientX;
        sY = e.clientY;
        origLeft = parseFloat(activeTextEl.style.left) || 0;
        origTop = parseFloat(activeTextEl.style.top) || 0;

        const onMouseMove = (me) => {
            if (!isMovingText || !activeTextEl) return;
            const dx = me.clientX - sX;
            const dy = me.clientY - sY;
            const newL = Math.max(0, origLeft + dx);
            const newT = Math.max(0, origTop + dy);

            activeTextEl.style.left = `${newL}px`;
            activeTextEl.style.top = `${newT}px`;
            positionFloatingToolbar(activeTextEl);

            activeTextRecord.x = newL / pdfScale;
            activeTextRecord.y = newT / pdfScale;
        };

        const onMouseUp = () => {
            isMovingText = false;
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    };

    // 8. Duplicate button
    const copyBtn = floatingToolbarEl.querySelector('#stb-copy');
    copyBtn.onclick = () => {
        if (!activeTextRecord) return;
        const pageData = getPageEdits(currentPdfPage);
        const dupRecord = {
            id: 'txt_' + Date.now(),
            x: activeTextRecord.x + (15 / pdfScale),
            y: activeTextRecord.y + (25 / pdfScale),
            w: activeTextRecord.w || 160,
            h: activeTextRecord.h || 24,
            text: activeTextRecord.text,
            fontSize: activeTextRecord.fontSize,
            fontFamily: activeTextRecord.fontFamily,
            color: activeTextRecord.color,
            isBold: activeTextRecord.isBold,
            isItalic: activeTextRecord.isItalic
        };
        pageData.addedTexts.push(dupRecord);
        actionHistory.push({ type: 'addText', page: currentPdfPage, data: dupRecord });
        renderAddedTextItem(dupRecord, true);
        showToast('Text duplicated', 'info');
    };

    // 9. Delete button
    const trashBtn = floatingToolbarEl.querySelector('#stb-trash');
    trashBtn.onclick = () => {
        if (!activeTextRecord || !activeTextEl) return;
        const pageData = getPageEdits(currentPdfPage);
        pageData.addedTexts = pageData.addedTexts.filter(t => t.id !== activeTextRecord.id);
        activeTextEl.remove();
        deactivateCurrentTextItem();
        showToast('Text deleted', 'info');
    };
}

function positionFloatingToolbar(itemEl) {
    if (!floatingToolbarEl || !itemEl) return;
    const topOffset = itemEl.offsetTop - 34;
    floatingToolbarEl.style.left = `${Math.max(2, itemEl.offsetLeft)}px`;
    floatingToolbarEl.style.top = `${topOffset >= 4 ? topOffset : itemEl.offsetTop + itemEl.offsetHeight + 4}px`;
    floatingToolbarEl.style.display = 'inline-flex';
}

function updateToolbarState(record) {
    if (!floatingToolbarEl) return;
    const boldBtn = floatingToolbarEl.querySelector('#stb-bold');
    if (boldBtn) boldBtn.classList.toggle('active', !!record.isBold);

    const italicBtn = floatingToolbarEl.querySelector('#stb-italic');
    if (italicBtn) italicBtn.classList.toggle('active', !!record.isItalic);
}

function renderAddedTextItem(record, activateImmediately = false) {
    const itemEl = document.createElement('div');
    itemEl.className = 'sejda-text-item';
    itemEl.style.left = `${record.x * pdfScale}px`;
    itemEl.style.top = `${record.y * pdfScale}px`;

    const editableEl = document.createElement('div');
    editableEl.className = 'sejda-text-editable';
    editableEl.contentEditable = 'true';
    editableEl.spellcheck = false;
    editableEl.innerText = record.text;

    editableEl.style.fontSize = `${(record.fontSize || 16) * pdfScale}px`;
    editableEl.style.color = record.color || '#000000';
    editableEl.style.fontFamily = record.fontFamily || 'Helvetica, Arial, sans-serif';
    editableEl.style.fontWeight = record.isBold ? 'bold' : 'normal';
    editableEl.style.fontStyle = record.isItalic ? 'italic' : 'normal';

    itemEl.appendChild(editableEl);
    interactiveLayer.appendChild(itemEl);

    // Click handler to activate
    itemEl.addEventListener('click', (e) => {
        e.stopPropagation();
        if (currentTool === 'text') {
            activateTextItem(itemEl, record, false);
        }
    });

    editableEl.addEventListener('input', () => {
        itemEl.classList.remove('is-initial-select');
        record.text = editableEl.innerText;
        record.w = editableEl.offsetWidth / pdfScale;
        record.h = editableEl.offsetHeight / pdfScale;
    });

    editableEl.addEventListener('keydown', (e) => {
        itemEl.classList.remove('is-initial-select');
        if (e.key === 'Escape') {
            deactivateCurrentTextItem();
        }
    });

    if (activateImmediately) {
        activateTextItem(itemEl, record, true);
    }

    return itemEl;
}

function activateTextItem(itemEl, record, isNew = false) {
    if (activeTextEl && activeTextEl !== itemEl) {
        deactivateCurrentTextItem();
    }

    activeTextRecord = record;
    activeTextEl = itemEl;

    itemEl.classList.add('active');

    const toolbar = getOrCreateFloatingToolbar();
    if (!interactiveLayer.contains(toolbar)) {
        interactiveLayer.appendChild(toolbar);
    }
    positionFloatingToolbar(itemEl);
    updateToolbarState(record);

    const editableEl = itemEl.querySelector('.sejda-text-editable');
    if (editableEl) {
        editableEl.focus();

        if (isNew || record.text === 'Type your text') {
            itemEl.classList.add('is-initial-select');
            try {
                const range = document.createRange();
                range.selectNodeContents(editableEl);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
            } catch (err) {}
        }
    }
}

function deactivateCurrentTextItem() {
    if (activeTextEl) {
        activeTextEl.classList.remove('active', 'is-initial-select');
        const editableEl = activeTextEl.querySelector('.sejda-text-editable');
        if (editableEl && activeTextRecord) {
            activeTextRecord.text = editableEl.innerText.trim();
            if (!activeTextRecord.text) {
                const pageData = getPageEdits(currentPdfPage);
                pageData.addedTexts = pageData.addedTexts.filter(t => t.id !== activeTextRecord.id);
                activeTextEl.remove();
            }
        }
    }
    activeTextEl = null;
    activeTextRecord = null;
    hideFloatingToolbar();
}

function hideFloatingToolbar() {
    if (floatingToolbarEl) {
        floatingToolbarEl.style.display = 'none';
        closeAllDropdowns();
    }
}

// Click on interactiveLayer to create new text in Text mode
if (interactiveLayer) {
    interactiveLayer.addEventListener('click', (e) => {
        if (e.target.closest('.sejda-floating-toolbar') ||
            e.target.closest('.sejda-dropdown-menu') ||
            e.target.closest('.sejda-text-item') ||
            e.target.closest('.pdf-text-line') ||
            e.target.closest('.pdf-image-container') ||
            e.target.closest('.pdf-whiteout-item') ||
            e.target.closest('.pdf-symbol-item') ||
            e.target.closest('.pdf-form-field-container')) {
            return;
        }

        if (currentTool === 'text') {
            const rect = interactiveLayer.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;

            deactivateCurrentTextItem();

            const pageData = getPageEdits(currentPdfPage);
            const newRecord = {
                id: 'txt_' + Date.now(),
                x: clickX / pdfScale,
                y: clickY / pdfScale,
                w: 160,
                h: 24,
                text: 'Type your text',
                fontSize: 16,
                fontFamily: 'Helvetica, Arial, sans-serif',
                color: '#000000',
                isBold: false,
                isItalic: false
            };
            pageData.addedTexts.push(newRecord);
            actionHistory.push({ type: 'addText', page: currentPdfPage, data: newRecord });

            renderAddedTextItem(newRecord, true);
        } else if (currentTool === 'symbol' && selectedSymbolType) {
            const rect = interactiveLayer.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;

            const pageData = getPageEdits(currentPdfPage);
            const symRecord = {
                id: 'sym_' + Date.now(),
                type: selectedSymbolType,
                x: (clickX - 8) / pdfScale,
                y: (clickY - 10) / pdfScale,
                size: 18,
                color: '#0f172a'
            };
            pageData.symbols.push(symRecord);
            actionHistory.push({ type: 'addSymbol', page: currentPdfPage, data: symRecord });
            renderSymbolItem(symRecord);
            showToast('Symbol placed! Drag to move, or hover to delete.', 'success');
        } else if (currentTool === 'form-field' && selectedFieldType) {
            const rect = interactiveLayer.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;

            let defW = 150;
            let defH = 26;
            if (selectedFieldType === 'multiline') { defW = 200; defH = 60; }
            else if (selectedFieldType === 'checkbox' || selectedFieldType === 'radio') { defW = 24; defH = 24; }
            else if (selectedFieldType === 'dropdown') { defW = 160; defH = 28; }
            else if (selectedFieldType === 'signature') { defW = 160; defH = 46; }

            const pageData = getPageEdits(currentPdfPage);
            const fldRecord = {
                id: 'fld_' + Date.now(),
                type: selectedFieldType,
                x: clickX / pdfScale,
                y: clickY / pdfScale,
                w: defW / pdfScale,
                h: defH / pdfScale,
                name: selectedFieldType + '_' + Date.now(),
                placeholder: selectedFieldType === 'multiline' ? 'Multiline text...' : 'Type here...',
                value: '',
                options: selectedFieldType === 'dropdown' ? ['Select option', 'Option 1', 'Option 2', 'Option 3'] : []
            };
            pageData.formFields.push(fldRecord);
            actionHistory.push({ type: 'addFormField', page: currentPdfPage, data: fldRecord });
            renderFormFieldItem(fldRecord, pageData.formFields.length);
            showToast(`${selectedFieldType} field placed! (Toggle Form Edit mode to drag/resize)`, 'success');
        } else {
            deactivateCurrentTextItem();
        }
    });
}

// Global click outside toolbar to close dropdowns
document.addEventListener('click', (e) => {
    if (!e.target.closest('.sejda-floating-toolbar')) {
        closeAllDropdowns();
    }
});

// -------------------------------------------------------------
// Sejda Forms Engine (Symbols, Interactive Form Fields, Mode & Publish)
// -------------------------------------------------------------
let isFormEditMode = false;
let isTabOrderVisible = false;
let selectedSymbolType = null;
let selectedFieldType = null;

function renderSymbolItem(sym) {
    const symEl = document.createElement('div');
    symEl.className = 'pdf-symbol-item';
    symEl.style.left = `${sym.x * pdfScale}px`;
    symEl.style.top = `${sym.y * pdfScale}px`;
    symEl.style.fontSize = `${(sym.size || 18) * pdfScale}px`;
    symEl.style.color = sym.color || '#0f172a';

    const char = sym.type === 'check' ? '✓' : (sym.type === 'cross' ? '✕' : '●');
    symEl.innerText = char;

    const delBtn = document.createElement('div');
    delBtn.className = 'pdf-symbol-del-btn';
    delBtn.innerHTML = '✕';
    delBtn.title = 'Remove symbol';
    delBtn.onclick = (e) => {
        e.stopPropagation();
        const pageData = getPageEdits(currentPdfPage);
        pageData.symbols = pageData.symbols.filter(s => s.id !== sym.id);
        symEl.remove();
        showToast('Symbol removed', 'info');
    };
    symEl.appendChild(delBtn);

    let isMoving = false;
    let sX = 0, sY = 0, origL = 0, origT = 0;

    symEl.onmousedown = (e) => {
        if (e.target === delBtn) return;
        isMoving = true;
        sX = e.clientX;
        sY = e.clientY;
        origL = parseFloat(symEl.style.left) || 0;
        origT = parseFloat(symEl.style.top) || 0;

        const onMouseMove = (me) => {
            if (!isMoving) return;
            const dx = me.clientX - sX;
            const dy = me.clientY - sY;
            const nL = Math.max(0, origL + dx);
            const nT = Math.max(0, origT + dy);
            symEl.style.left = `${nL}px`;
            symEl.style.top = `${nT}px`;
            sym.x = nL / pdfScale;
            sym.y = nT / pdfScale;
        };

        const onMouseUp = () => {
            isMoving = false;
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    };

    interactiveLayer.appendChild(symEl);
    return symEl;
}

function renderFormFieldItem(fld, tabIndex = 1) {
    const fldContainer = document.createElement('div');
    fldContainer.className = 'pdf-form-field-container' + (isFormEditMode ? ' edit-mode' : '');
    fldContainer.style.left = `${fld.x * pdfScale}px`;
    fldContainer.style.top = `${fld.y * pdfScale}px`;
    fldContainer.style.width = `${fld.w * pdfScale}px`;
    fldContainer.style.height = `${fld.h * pdfScale}px`;

    const tabBadge = document.createElement('div');
    tabBadge.className = 'pdf-field-tab-badge' + (isTabOrderVisible ? '' : ' hidden');
    tabBadge.innerText = tabIndex;
    fldContainer.appendChild(tabBadge);

    let inputEl = null;
    if (fld.type === 'text') {
        inputEl = document.createElement('input');
        inputEl.type = 'text';
        inputEl.className = 'pdf-form-field-input';
        inputEl.placeholder = fld.placeholder || 'Type here...';
        inputEl.value = fld.value || '';
        inputEl.tabIndex = tabIndex;
        inputEl.oninput = (e) => { fld.value = e.target.value; };
        fldContainer.appendChild(inputEl);
    } else if (fld.type === 'multiline') {
        inputEl = document.createElement('textarea');
        inputEl.className = 'pdf-form-field-textarea';
        inputEl.placeholder = fld.placeholder || 'Multiline text...';
        inputEl.value = fld.value || '';
        inputEl.tabIndex = tabIndex;
        inputEl.oninput = (e) => { fld.value = e.target.value; };
        fldContainer.appendChild(inputEl);
    } else if (fld.type === 'checkbox') {
        inputEl = document.createElement('input');
        inputEl.type = 'checkbox';
        inputEl.className = 'pdf-form-field-checkbox';
        inputEl.checked = !!fld.value;
        inputEl.tabIndex = tabIndex;
        inputEl.onchange = (e) => { fld.value = e.target.checked; };
        fldContainer.appendChild(inputEl);
    } else if (fld.type === 'radio') {
        inputEl = document.createElement('input');
        inputEl.type = 'radio';
        inputEl.name = fld.group || 'pdf_radio_group';
        inputEl.className = 'pdf-form-field-radio';
        inputEl.checked = !!fld.value;
        inputEl.tabIndex = tabIndex;
        inputEl.onchange = (e) => { fld.value = e.target.checked; };
        fldContainer.appendChild(inputEl);
    } else if (fld.type === 'dropdown') {
        inputEl = document.createElement('select');
        inputEl.className = 'pdf-form-field-select';
        inputEl.tabIndex = tabIndex;
        const options = fld.options && fld.options.length ? fld.options : ['Select option', 'Option 1', 'Option 2', 'Option 3'];
        options.forEach(opt => {
            const opEl = document.createElement('option');
            opEl.value = opt;
            opEl.innerText = opt;
            if (fld.value === opt) opEl.selected = true;
            inputEl.appendChild(opEl);
        });
        inputEl.onchange = (e) => { fld.value = e.target.value; };
        fldContainer.appendChild(inputEl);
    } else if (fld.type === 'signature') {
        inputEl = document.createElement('div');
        inputEl.className = 'pdf-form-field-signature';
        if (fld.value && fld.value.startsWith('data:image')) {
            inputEl.innerHTML = `<img src="${fld.value}" class="max-h-full max-w-full object-contain pointer-events-none">`;
        } else {
            inputEl.innerHTML = '<i data-lucide="pen-tool" class="w-3.5 h-3.5"></i><span>Click to sign</span>';
        }
        inputEl.onclick = (e) => {
            e.stopPropagation();
            if (isFormEditMode) return;
            const signText = prompt('Enter signature name or initials:', 'Signed');
            if (signText && signText.trim()) {
                const cvs = document.createElement('canvas');
                cvs.width = 250;
                cvs.height = 70;
                const ctx = cvs.getContext('2d');
                ctx.font = 'italic 28px "Brush Script MT", cursive, sans-serif';
                ctx.fillStyle = '#1e3a8a';
                ctx.fillText(signText.trim(), 15, 45);
                fld.value = cvs.toDataURL('image/png');
                inputEl.innerHTML = `<img src="${fld.value}" class="max-h-full max-w-full object-contain pointer-events-none">`;
                showToast('Signature added!', 'success');
            }
        };
        fldContainer.appendChild(inputEl);
    }

    const delBtn = document.createElement('div');
    delBtn.className = 'pdf-field-del-btn';
    delBtn.innerHTML = '✕';
    delBtn.title = 'Delete form field';
    delBtn.onclick = (e) => {
        e.stopPropagation();
        const pageData = getPageEdits(currentPdfPage);
        pageData.formFields = pageData.formFields.filter(f => f.id !== fld.id);
        fldContainer.remove();
        showToast('Form field removed', 'info');
    };
    fldContainer.appendChild(delBtn);

    let isMoving = false;
    let sX = 0, sY = 0, origL = 0, origT = 0;

    fldContainer.onmousedown = (e) => {
        if (!isFormEditMode) return;
        if (e.target === delBtn) return;
        isMoving = true;
        sX = e.clientX;
        sY = e.clientY;
        origL = parseFloat(fldContainer.style.left) || 0;
        origT = parseFloat(fldContainer.style.top) || 0;

        const onMouseMove = (me) => {
            if (!isMoving) return;
            const dx = me.clientX - sX;
            const dy = me.clientY - sY;
            const nL = Math.max(0, origL + dx);
            const nT = Math.max(0, origT + dy);
            fldContainer.style.left = `${nL}px`;
            fldContainer.style.top = `${nT}px`;
            fld.x = nL / pdfScale;
            fld.y = nT / pdfScale;
        };

        const onMouseUp = () => {
            isMoving = false;
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    };

    interactiveLayer.appendChild(fldContainer);
    if (window.lucide) lucide.createIcons();
    return fldContainer;
}

function detectAndPlaceFormFields() {
    const pageData = getPageEdits(currentPdfPage);
    const textLines = interactiveLayer.querySelectorAll('.pdf-text-line');
    let count = 0;

    textLines.forEach(lineEl => {
        const text = lineEl.getAttribute('data-text') || '';
        if (text.includes('____') || text.includes('.....') || text.includes('__') || /(Name|Date|Signature|Address|Email|Phone)\s*:/i.test(text)) {
            const left = parseFloat(lineEl.style.left) || 0;
            const top = parseFloat(lineEl.style.top) || 0;
            const w = parseFloat(lineEl.style.width) || 100;
            const h = parseFloat(lineEl.style.height) || 20;

            const fldRecord = {
                id: 'fld_det_' + Date.now() + '_' + count,
                type: 'text',
                x: (left + w + 8) / pdfScale,
                y: (top - 2) / pdfScale,
                w: 150 / pdfScale,
                h: Math.max(h + 4, 24) / pdfScale,
                name: 'Field_' + (count + 1),
                placeholder: 'Type here...',
                value: ''
            };

            pageData.formFields.push(fldRecord);
            renderFormFieldItem(fldRecord, pageData.formFields.length);
            count++;
        }
    });

    if (count > 0) {
        showToast(`Auto-detected and created ${count} form field(s)!`, 'success');
    } else {
        const fldRecord = {
            id: 'fld_det_' + Date.now(),
            type: 'text',
            x: 80 / pdfScale,
            y: 100 / pdfScale,
            w: 160 / pdfScale,
            h: 26 / pdfScale,
            name: 'Field_1',
            placeholder: 'Type here...',
            value: ''
        };
        pageData.formFields.push(fldRecord);
        renderFormFieldItem(fldRecord, pageData.formFields.length);
        showToast('Form field placed on page!', 'success');
    }
}

function setupFormsEngine() {
    const toolForms = document.getElementById('tool-forms');
    const formsDropdown = document.getElementById('sejda-forms-dropdown');

    if (toolForms && formsDropdown) {
        toolForms.addEventListener('click', (e) => {
            e.stopPropagation();
            formsDropdown.classList.toggle('hidden');
        });

        document.addEventListener('click', (e) => {
            if (!formsDropdown.contains(e.target) && e.target !== toolForms && !toolForms.contains(e.target)) {
                formsDropdown.classList.add('hidden');
            }
        });
    }

    // Symbol Buttons
    const sbtnText = document.getElementById('sbtn-text');
    if (sbtnText && toolText) {
        sbtnText.onclick = () => {
            toolText.click();
            if (formsDropdown) formsDropdown.classList.add('hidden');
        };
    }

    const sbtnCross = document.getElementById('sbtn-cross');
    if (sbtnCross) {
        sbtnCross.onclick = () => {
            selectedSymbolType = 'cross';
            setActiveTool('symbol', toolForms);
            if (formsDropdown) formsDropdown.classList.add('hidden');
            showToast('Click anywhere on PDF to place ✕ cross mark', 'info');
        };
    }

    const sbtnCheck = document.getElementById('sbtn-check');
    if (sbtnCheck) {
        sbtnCheck.onclick = () => {
            selectedSymbolType = 'check';
            setActiveTool('symbol', toolForms);
            if (formsDropdown) formsDropdown.classList.add('hidden');
            showToast('Click anywhere on PDF to place ✓ check mark', 'info');
        };
    }

    const sbtnDot = document.getElementById('sbtn-dot');
    if (sbtnDot) {
        sbtnDot.onclick = () => {
            selectedSymbolType = 'dot';
            setActiveTool('symbol', toolForms);
            if (formsDropdown) formsDropdown.classList.add('hidden');
            showToast('Click anywhere on PDF to place ● bullet dot', 'info');
        };
    }

    // Field Placement Buttons
    const fieldBtns = ['text', 'multiline', 'dropdown', 'radio', 'checkbox', 'signature'];
    fieldBtns.forEach(ft => {
        const btn = document.getElementById('sbtn-field-' + ft);
        if (btn) {
            btn.onclick = () => {
                selectedFieldType = ft;
                setActiveTool('form-field', toolForms);
                if (formsDropdown) formsDropdown.classList.add('hidden');
                showToast(`Click anywhere on PDF to place ${ft} field`, 'info');
            };
        }
    });

    // Detect Fields Button
    const sbtnDetect = document.getElementById('sbtn-field-detect');
    if (sbtnDetect) {
        sbtnDetect.onclick = () => {
            detectAndPlaceFormFields();
            if (formsDropdown) formsDropdown.classList.add('hidden');
        };
    }

    // Form Edit Mode Toggle
    const sbtnEditMode = document.getElementById('sbtn-edit-mode');
    if (sbtnEditMode) {
        sbtnEditMode.onclick = () => {
            isFormEditMode = !isFormEditMode;
            const badge = document.getElementById('sbtn-edit-mode-badge');
            if (badge) {
                badge.innerText = isFormEditMode ? 'ON' : 'OFF';
                badge.className = isFormEditMode
                    ? 'ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700'
                    : 'ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600';
            }
            document.querySelectorAll('.pdf-form-field-container').forEach(c => c.classList.toggle('edit-mode', isFormEditMode));
            showToast(isFormEditMode ? 'Form Edit Mode: ON (Drag & delete enabled)' : 'Form Edit Mode: OFF (Fill form enabled)', 'info');
        };
    }

    // Tab Order Toggle
    const sbtnTabOrder = document.getElementById('sbtn-tab-order');
    if (sbtnTabOrder) {
        sbtnTabOrder.onclick = () => {
            isTabOrderVisible = !isTabOrderVisible;
            document.querySelectorAll('.pdf-field-tab-badge').forEach(b => b.classList.toggle('hidden', !isTabOrderVisible));
            showToast(isTabOrderVisible ? 'Tab order numbers visible' : 'Tab order hidden', 'info');
        };
    }

    // Publish Modal
    const sbtnPublish = document.getElementById('sbtn-publish');
    const pubModal = document.getElementById('publish-modal');
    if (sbtnPublish && pubModal) {
        sbtnPublish.onclick = () => {
            if (formsDropdown) formsDropdown.classList.add('hidden');
            pubModal.classList.remove('hidden');
            if (window.lucide) lucide.createIcons();
        };

        const btnClosePub = document.getElementById('btn-close-publish-modal');
        const btnDonePub = document.getElementById('btn-close-publish-done');
        const btnCopyPub = document.getElementById('btn-copy-publish-link');

        if (btnClosePub) btnClosePub.onclick = () => pubModal.classList.add('hidden');
        if (btnDonePub) btnDonePub.onclick = () => pubModal.classList.add('hidden');
        if (btnCopyPub) {
            btnCopyPub.onclick = () => {
                const inp = document.getElementById('publish-link-input');
                if (inp) {
                    navigator.clipboard.writeText(inp.value);
                    showToast('Shareable link copied to clipboard!', 'success');
                }
            };
        }
    }
}

// Call setupFormsEngine on load
setupFormsEngine();

// -------------------------------------------------------------
// Sejda Annotate & Shapes Engine
// -------------------------------------------------------------
function setupAnnotateAndShapesEngine() {
    const formsDropdown = document.getElementById('sejda-forms-dropdown');
    const annotateDropdown = document.getElementById('sejda-annotate-dropdown');
    const shapesDropdown = document.getElementById('sejda-shapes-dropdown');

    // Toggle Annotate Dropdown
    if (toolAnnotate && annotateDropdown) {
        toolAnnotate.addEventListener('click', (e) => {
            e.stopPropagation();
            if (formsDropdown) formsDropdown.classList.add('hidden');
            if (shapesDropdown) shapesDropdown.classList.add('hidden');
            annotateDropdown.classList.toggle('hidden');
        });
    }

    // Toggle Shapes Dropdown
    if (toolShapes && shapesDropdown) {
        toolShapes.addEventListener('click', (e) => {
            e.stopPropagation();
            if (formsDropdown) formsDropdown.classList.add('hidden');
            if (annotateDropdown) annotateDropdown.classList.add('hidden');
            shapesDropdown.classList.toggle('hidden');
        });
    }

    // Close on click outside
    document.addEventListener('click', (e) => {
        if (annotateDropdown && !annotateDropdown.contains(e.target) && e.target !== toolAnnotate && !toolAnnotate.contains(e.target)) {
            annotateDropdown.classList.add('hidden');
        }
        if (shapesDropdown && !shapesDropdown.contains(e.target) && e.target !== toolShapes && !toolShapes.contains(e.target)) {
            shapesDropdown.classList.add('hidden');
        }
    });

    // 1. Show / Hide Annotations Toggle
    const abtnToggleShow = document.getElementById('abtn-toggle-show');
    if (abtnToggleShow) {
        abtnToggleShow.onclick = () => {
            annotationsVisible = !annotationsVisible;
            const eyeIcon = document.getElementById('abtn-eye-icon');
            if (eyeIcon) {
                eyeIcon.setAttribute('data-lucide', annotationsVisible ? 'eye' : 'eye-off');
            }
            const labelSpan = abtnToggleShow.querySelector('span');
            if (labelSpan) {
                labelSpan.innerText = annotationsVisible ? 'Show annotations' : 'Hide annotations';
            }
            if (window.lucide) lucide.createIcons();

            document.querySelectorAll('.pdf-text-annotation').forEach(el => {
                el.style.display = annotationsVisible ? 'block' : 'none';
            });

            showToast(annotationsVisible ? 'Annotations visible' : 'Annotations hidden', 'info');
        };
    }

    // 2. Text Annotations selection via Color Dots
    document.querySelectorAll('.sejda-color-dot').forEach(dot => {
        dot.onclick = (e) => {
            e.stopPropagation();
            const dType = dot.getAttribute('data-type');
            const dColor = dot.getAttribute('data-color') || '#ef4444';

            document.querySelectorAll('.sejda-color-dot').forEach(d => d.classList.remove('active'));
            dot.classList.add('active');

            if (dType === 'strikeout') {
                selectedAnnotateType = 'strikeout';
                selectedAnnotateColor = dColor;
                setActiveTool('annotate-text', toolAnnotate);
                showToast('Strike out selected. Click any text line to strike out.', 'info');
            } else if (dType === 'texthighlight') {
                selectedAnnotateType = 'highlight';
                selectedAnnotateColor = dColor;
                setActiveTool('annotate-text', toolAnnotate);
                showToast('Highlight selected. Click any text line to highlight.', 'info');
            } else if (dType === 'underline') {
                selectedAnnotateType = 'underline';
                selectedAnnotateColor = dColor;
                setActiveTool('annotate-text', toolAnnotate);
                showToast('Underline selected. Click any text line to underline.', 'info');
            } else if (dType === 'freehandhighlight') {
                strokeColor = dColor;
                setActiveTool('highlighter', toolAnnotate);
                showToast('Freehand highlighter active with selected color.', 'info');
            } else if (dType === 'freehanddraw') {
                strokeColor = dColor;
                setActiveTool('pen', toolAnnotate);
                showToast('Freehand drawing active with selected color.', 'info');
            }

            if (annotateDropdown) annotateDropdown.classList.add('hidden');
        };
    });

    // 3. Text Section Row Buttons
    const abtnStrikeout = document.getElementById('abtn-strikeout-label');
    if (abtnStrikeout) {
        abtnStrikeout.onclick = () => {
            selectedAnnotateType = 'strikeout';
            selectedAnnotateColor = '#ef4444';
            setActiveTool('annotate-text', toolAnnotate);
            if (annotateDropdown) annotateDropdown.classList.add('hidden');
            showToast('Strike out selected. Click any text line to strike out.', 'info');
        };
    }

    const abtnHighlight = document.getElementById('abtn-highlight-label');
    if (abtnHighlight) {
        abtnHighlight.onclick = () => {
            selectedAnnotateType = 'highlight';
            selectedAnnotateColor = '#eab308';
            setActiveTool('annotate-text', toolAnnotate);
            if (annotateDropdown) annotateDropdown.classList.add('hidden');
            showToast('Highlight selected. Click any text line to highlight.', 'info');
        };
    }

    const abtnUnderline = document.getElementById('abtn-underline-label');
    if (abtnUnderline) {
        abtnUnderline.onclick = () => {
            selectedAnnotateType = 'underline';
            selectedAnnotateColor = '#ef4444';
            setActiveTool('annotate-text', toolAnnotate);
            if (annotateDropdown) annotateDropdown.classList.add('hidden');
            showToast('Underline selected. Click any text line to underline.', 'info');
        };
    }

    const abtnFreehandHighlighter = document.getElementById('abtn-freehand-highlighter');
    if (abtnFreehandHighlighter) {
        abtnFreehandHighlighter.onclick = () => {
            strokeColor = '#eab308';
            setActiveTool('highlighter', toolAnnotate);
            if (annotateDropdown) annotateDropdown.classList.add('hidden');
            showToast('Freehand highlighter active.', 'info');
        };
    }

    const abtnFreehandDraw = document.getElementById('abtn-freehand-draw');
    if (abtnFreehandDraw) {
        abtnFreehandDraw.onclick = () => {
            strokeColor = '#ef4444';
            setActiveTool('pen', toolAnnotate);
            if (annotateDropdown) annotateDropdown.classList.add('hidden');
            showToast('Freehand pen active.', 'info');
        };
    }

    // 4. Shapes Selection
    document.querySelectorAll('.sejda-shape-item-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const sType = btn.getAttribute('data-shape') || 'rectangle';
            selectedShapeType = sType;
            selectedShapeColor = '#ef4444';
            setActiveTool('shape', toolShapes);
            if (shapesDropdown) shapesDropdown.classList.add('hidden');
            showToast(`${sType.toUpperCase()} selected! Click & drag on page to draw, or click to place.`, 'info');
        };
    });
}

// Call setupAnnotateAndShapesEngine on load
setupAnnotateAndShapesEngine();

// -------------------------------------------------------------
// Whiteout & Shapes Drag & Drop Drawing Tool
// -------------------------------------------------------------
if (interactiveLayer) {
    interactiveLayer.onmousedown = (e) => {
        if (currentTool !== 'whiteout' && currentTool !== 'shape') return;
        if (e.target !== interactiveLayer) return;

        const rect = interactiveLayer.getBoundingClientRect();
        const startX = e.clientX - rect.left;
        const startY = e.clientY - rect.top;

        if (currentTool === 'whiteout') {
            isDraggingWhiteout = true;
            whiteoutStart = { x: startX, y: startY };

            whiteoutPreview = document.createElement('div');
            whiteoutPreview.className = 'pdf-whiteout-preview';
            whiteoutPreview.style.left = `${whiteoutStart.x}px`;
            whiteoutPreview.style.top = `${whiteoutStart.y}px`;
            interactiveLayer.appendChild(whiteoutPreview);

            const onWhiteoutMove = (mEvt) => {
                if (!isDraggingWhiteout || !whiteoutPreview) return;
                const curX = mEvt.clientX - rect.left;
                const curY = mEvt.clientY - rect.top;

                const x = Math.min(whiteoutStart.x, curX);
                const y = Math.min(whiteoutStart.y, curY);
                const w = Math.abs(curX - whiteoutStart.x);
                const h = Math.abs(curY - whiteoutStart.y);

                whiteoutPreview.style.left = `${x}px`;
                whiteoutPreview.style.top = `${y}px`;
                whiteoutPreview.style.width = `${w}px`;
                whiteoutPreview.style.height = `${h}px`;
            };

            const onWhiteoutUp = (uEvt) => {
                if (!isDraggingWhiteout) return;
                isDraggingWhiteout = false;
                const curX = uEvt.clientX - rect.left;
                const curY = uEvt.clientY - rect.top;
                const x = Math.min(whiteoutStart.x, curX);
                const y = Math.min(whiteoutStart.y, curY);
                const w = Math.abs(curX - whiteoutStart.x);
                const h = Math.abs(curY - whiteoutStart.y);

                if (whiteoutPreview) {
                    whiteoutPreview.remove();
                    whiteoutPreview = null;
                }

                if (w > 8 && h > 8) {
                    const pageData = getPageEdits(currentPdfPage);
                    const woRecord = {
                        id: 'wo_' + Date.now(),
                        x: x / pdfScale,
                        y: y / pdfScale,
                        w: w / pdfScale,
                        h: h / pdfScale
                    };
                    pageData.whiteouts.push(woRecord);
                    actionHistory.push({ type: 'whiteout', page: currentPdfPage, data: woRecord });
                    renderWhiteoutBox(woRecord);
                    showToast('Area erased with whiteout', 'success');
                }

                window.removeEventListener('mousemove', onWhiteoutMove);
                window.removeEventListener('mouseup', onWhiteoutUp);
            };

            window.addEventListener('mousemove', onWhiteoutMove);
            window.addEventListener('mouseup', onWhiteoutUp);
            return;
        }

        if (currentTool === 'shape') {
            isDraggingShape = true;
            shapeStart = { x: startX, y: startY };

            shapePreview = document.createElement('div');
            shapePreview.className = 'pdf-shape-item';
            shapePreview.style.pointerEvents = 'none';
            shapePreview.style.left = `${shapeStart.x}px`;
            shapePreview.style.top = `${shapeStart.y}px`;
            shapePreview.style.border = `2px dashed ${selectedShapeColor}`;
            interactiveLayer.appendChild(shapePreview);

            const onShapeMove = (mEvt) => {
                if (!isDraggingShape || !shapePreview) return;
                const curX = mEvt.clientX - rect.left;
                const curY = mEvt.clientY - rect.top;

                const x = Math.min(shapeStart.x, curX);
                const y = Math.min(shapeStart.y, curY);
                const w = Math.abs(curX - shapeStart.x);
                const h = Math.abs(curY - shapeStart.y);

                shapePreview.style.left = `${x}px`;
                shapePreview.style.top = `${y}px`;
                shapePreview.style.width = `${w}px`;
                shapePreview.style.height = `${h}px`;
            };

            const onShapeUp = (uEvt) => {
                if (!isDraggingShape) return;
                isDraggingShape = false;
                const curX = uEvt.clientX - rect.left;
                const curY = uEvt.clientY - rect.top;
                let x = Math.min(shapeStart.x, curX);
                let y = Math.min(shapeStart.y, curY);
                let w = Math.abs(curX - shapeStart.x);
                let h = Math.abs(curY - shapeStart.y);

                if (shapePreview) {
                    shapePreview.remove();
                    shapePreview = null;
                }

                // If clicked without dragging, place a default sized shape
                if (w < 10 || h < 10) {
                    w = selectedShapeType === 'line' || selectedShapeType === 'arrow' ? 120 : 150;
                    h = selectedShapeType === 'line' || selectedShapeType === 'arrow' ? 60 : 90;
                    x = Math.max(10, shapeStart.x - w / 2);
                    y = Math.max(10, shapeStart.y - h / 2);
                }

                const pageData = getPageEdits(currentPdfPage);
                const shpRecord = {
                    id: 'shp_' + Date.now(),
                    type: selectedShapeType,
                    x: x / pdfScale,
                    y: y / pdfScale,
                    w: w / pdfScale,
                    h: h / pdfScale,
                    strokeColor: selectedShapeColor,
                    strokeWidth: 2
                };
                pageData.shapes.push(shpRecord);
                actionHistory.push({ type: 'addShape', page: currentPdfPage, data: shpRecord });
                renderShapeItem(shpRecord);
                showToast(`${selectedShapeType.toUpperCase()} shape created!`, 'success');

                window.removeEventListener('mousemove', onShapeMove);
                window.removeEventListener('mouseup', onShapeUp);
            };

            window.addEventListener('mousemove', onShapeMove);
            window.addEventListener('mouseup', onShapeUp);
            return;
        }
    };
}

// -------------------------------------------------------------
// Freehand Drawing (Pen & Highlighter)
// -------------------------------------------------------------
function setupDrawCanvasListeners() {
    if (!drawCanvas || !drawCtx) return;

    drawCanvas.onmousedown = (e) => {
        if (currentTool !== 'pen' && currentTool !== 'highlighter') return;
        isDrawing = true;
        drawCtx.beginPath();
        const rect = drawCanvas.getBoundingClientRect();
        drawCtx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    };

    drawCanvas.onmousemove = (e) => {
        if (!isDrawing) return;
        const rect = drawCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (currentTool === 'highlighter') {
            drawCtx.strokeStyle = strokeColor + '55'; // translucent
            drawCtx.lineWidth = 18;
            drawCtx.lineCap = 'square';
        } else {
            drawCtx.strokeStyle = strokeColor;
            drawCtx.lineWidth = strokeWidth;
            drawCtx.lineCap = 'round';
            drawCtx.lineJoin = 'round';
        }

        drawCtx.lineTo(x, y);
        drawCtx.stroke();
    };

    drawCanvas.onmouseup = () => { isDrawing = false; };
    drawCanvas.onmouseleave = () => { isDrawing = false; };
}

// -------------------------------------------------------------
// Toolbar Tool Switching & Undo
// -------------------------------------------------------------
function setActiveTool(toolName, element) {
    currentTool = toolName;
    if (currentTool !== 'text') {
        deactivateCurrentTextItem();
    }
    [toolText, toolImageBtn, toolWhiteout, toolPen, toolHighlighter, toolAnnotate, toolShapes].forEach(b => b && b.classList.remove('active'));
    if (element) element.classList.add('active');

    if (currentTool === 'pen' || currentTool === 'highlighter') {
        drawCanvas.classList.remove('pointer-events-none');
        drawCanvas.classList.add('pointer-events-auto', 'cursor-crosshair');
    } else {
        drawCanvas.classList.remove('pointer-events-auto', 'cursor-crosshair');
        drawCanvas.classList.add('pointer-events-none');
    }
}

if (toolText) toolText.addEventListener('click', () => setActiveTool('text', toolText));
if (toolWhiteout) toolWhiteout.addEventListener('click', () => setActiveTool('whiteout', toolWhiteout));
if (toolPen) toolPen.addEventListener('click', () => setActiveTool('pen', toolPen));
if (toolHighlighter) toolHighlighter.addEventListener('click', () => setActiveTool('highlighter', toolHighlighter));
if (toolColor) toolColor.addEventListener('input', (e) => strokeColor = e.target.value);

if (toolUndo) {
    toolUndo.addEventListener('click', () => {
        if (actionHistory.length === 0) {
            showToast('Nothing to undo', 'info');
            return;
        }
        const lastAction = actionHistory.pop();
        const pageData = getPageEdits(lastAction.page);

        if (lastAction.type === 'deleteLine') {
            pageData.deletedLines = pageData.deletedLines.filter(dl => dl !== lastAction.data);
        } else if (lastAction.type === 'editLine') {
            pageData.editedLines = pageData.editedLines.filter(el => el !== lastAction.data);
        } else if (lastAction.type === 'whiteout') {
            pageData.whiteouts = pageData.whiteouts.filter(w => w.id !== lastAction.data.id);
        } else if (lastAction.type === 'addImage') {
            pageData.images = pageData.images.filter(i => i.id !== lastAction.data.id);
        } else if (lastAction.type === 'addText') {
            pageData.addedTexts = pageData.addedTexts.filter(t => t.id !== lastAction.data.id);
            if (activeTextRecord && activeTextRecord.id === lastAction.data.id) {
                deactivateCurrentTextItem();
            }
        } else if (lastAction.type === 'addSymbol') {
            pageData.symbols = pageData.symbols.filter(s => s.id !== lastAction.data.id);
        } else if (lastAction.type === 'addFormField') {
            pageData.formFields = pageData.formFields.filter(f => f.id !== lastAction.data.id);
        } else if (lastAction.type === 'addShape') {
            pageData.shapes = pageData.shapes.filter(s => s.id !== lastAction.data.id);
        } else if (lastAction.type === 'addAnnotation') {
            pageData.textAnnotations = pageData.textAnnotations.filter(a => a.id !== lastAction.data.id);
        }

        renderCurrentPage();
        showToast('Last action undone', 'info');
    });
}

// -------------------------------------------------------------
// Page Navigation & Zoom
// -------------------------------------------------------------
// -------------------------------------------------------------
// Page Navigation & Insert / Delete Page & Zoom
// -------------------------------------------------------------
if (btnPrevPage) {
    btnPrevPage.addEventListener('click', async () => {
        if (currentPdfPage > 1) {
            saveCurrentPageDrawings();
            currentPdfPage--;
            await renderCurrentPage();
        }
    });
}

if (btnNextPage) {
    btnNextPage.addEventListener('click', async () => {
        if (currentPdfPage < totalPdfPages) {
            saveCurrentPageDrawings();
            currentPdfPage++;
            await renderCurrentPage();
        }
    });
}

// Insert Blank Page Here Button
if (btnInsertPage) {
    btnInsertPage.addEventListener('click', async () => {
        if (!currentPdfDoc && editorPages.length === 0) {
            showToast('Please open a PDF file first.', 'error');
            return;
        }

        saveCurrentPageDrawings();

        const curPageObj = editorPages[currentPdfPage - 1];
        const newWidth = curPageObj ? curPageObj.width : 595;
        const newHeight = curPageObj ? curPageObj.height : 842;

        const newPage = {
            type: 'blank',
            pdfPageNum: null,
            width: newWidth,
            height: newHeight
        };

        // Insert right after current page position
        const insertIndex = currentPdfPage; // 1-based index means insert after it in 0-based array
        editorPages.splice(insertIndex, 0, newPage);

        // Shift existing edits for pages after insertIndex
        const shiftedEdits = {};
        for (const [k, v] of Object.entries(pageEdits)) {
            const pnum = parseInt(k, 10);
            if (pnum <= insertIndex) {
                shiftedEdits[pnum] = v;
            } else {
                shiftedEdits[pnum + 1] = v;
            }
        }
        pageEdits = shiftedEdits;

        totalPdfPages = editorPages.length;
        currentPdfPage = insertIndex + 1;

        if (totalPagesSpan) totalPagesSpan.innerText = totalPdfPages;
        if (currentPageSpan) currentPageSpan.innerText = currentPdfPage;

        await renderCurrentPage();
        showToast(`Blank page inserted as Page ${currentPdfPage} of ${totalPdfPages}!`, 'success');
    });
}

// Delete Current Page Button
if (btnDeletePage) {
    btnDeletePage.addEventListener('click', async () => {
        if (!currentPdfDoc && editorPages.length === 0) {
            showToast('Please open a PDF file first.', 'error');
            return;
        }

        if (editorPages.length <= 1) {
            showToast('Document must contain at least one page.', 'warning');
            return;
        }

        if (!confirm(`Are you sure you want to delete Page ${currentPdfPage}?`)) {
            return;
        }

        const pageToDelete = currentPdfPage;
        editorPages.splice(pageToDelete - 1, 1);

        // Shift existing edits
        const shiftedEdits = {};
        for (const [k, v] of Object.entries(pageEdits)) {
            const pnum = parseInt(k, 10);
            if (pnum < pageToDelete) {
                shiftedEdits[pnum] = v;
            } else if (pnum > pageToDelete) {
                shiftedEdits[pnum - 1] = v;
            }
        }
        pageEdits = shiftedEdits;

        totalPdfPages = editorPages.length;
        if (currentPdfPage > totalPdfPages) {
            currentPdfPage = totalPdfPages;
        }

        if (totalPagesSpan) totalPagesSpan.innerText = totalPdfPages;
        if (currentPageSpan) currentPageSpan.innerText = currentPdfPage;

        await renderCurrentPage();
        showToast(`Page ${pageToDelete} deleted successfully.`, 'info');
    });
}

if (btnZoomIn) {
    btnZoomIn.addEventListener('click', async () => {
        if (pdfScale < 2.5) {
            pdfScale = Math.round((pdfScale + 0.15) * 100) / 100;
            if (zoomLevelSpan) zoomLevelSpan.innerText = Math.round(pdfScale * 100) + '%';
            await renderCurrentPage();
        }
    });
}

if (btnZoomOut) {
    btnZoomOut.addEventListener('click', async () => {
        if (pdfScale > 0.6) {
            pdfScale = Math.round((pdfScale - 0.15) * 100) / 100;
            if (zoomLevelSpan) zoomLevelSpan.innerText = Math.round(pdfScale * 100) + '%';
            await renderCurrentPage();
        }
    });
}

// Rotate Page Buttons
const btnRotateLeft = document.getElementById('btn-rotate-left');
const btnRotateRight = document.getElementById('btn-rotate-right');
let pageRotation = 0;

if (btnRotateLeft) {
    btnRotateLeft.addEventListener('click', () => {
        pageRotation = (pageRotation - 90) % 360;
        const container = document.getElementById('pdf-canvas-container');
        if (container) container.style.transform = `rotate(${pageRotation}deg)`;
        showToast('Page rotated 90° counter-clockwise', 'info');
    });
}

if (btnRotateRight) {
    btnRotateRight.addEventListener('click', () => {
        pageRotation = (pageRotation + 90) % 360;
        const container = document.getElementById('pdf-canvas-container');
        if (container) container.style.transform = `rotate(${pageRotation}deg)`;
        showToast('Page rotated 90° clockwise', 'info');
    });
}

// Sign Tool
const toolSign = document.getElementById('tool-sign');
if (toolSign) {
    toolSign.addEventListener('click', () => {
        const signText = prompt('Type your Name or Signature text to place on Page ' + currentPdfPage + ':');
        if (signText && signText.trim()) {
            const pageData = getPageEdits(currentPdfPage);
            const canvas = document.createElement('canvas');
            canvas.width = 300;
            canvas.height = 100;
            const ctx = canvas.getContext('2d');
            ctx.font = 'italic 32px "Brush Script MT", cursive, sans-serif';
            ctx.fillStyle = '#1e3a8a';
            ctx.fillText(signText.trim(), 20, 60);
            insertImageOnCurrentPage(canvas.toDataURL('image/png'));
            showToast('Signature stamp created! Drag it to desired location.', 'success');
        }
    });
}

// -------------------------------------------------------------
// Apply Changes & Export Final PDF
// -------------------------------------------------------------
if (btnApplyChanges) {
    btnApplyChanges.addEventListener('click', async () => {
        if (!currentPdfFile) {
            showToast('Please open a PDF file first.', 'error');
            return;
        }

        saveCurrentPageDrawings();

        const toast = showToast('Applying edits and generating high-fidelity PDF...', 'loading');
        try {
            const formData = new FormData();
            formData.append('file', currentPdfFile);
            formData.append('edits_json', JSON.stringify(pageEdits));
            formData.append('page_manifest', JSON.stringify(editorPages));

            const res = await fetch('/api/pdf/apply-edits', {
                method: 'POST',
                body: formData
            });

            toast.remove();
            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.detail || 'Export failed');
            }

            const blob = await res.blob();
            const outName = currentPdfFile.name.replace(/\.pdf$/i, '') + '_edited.pdf';
            triggerDownload(blob, outName);
            showToast('PDF exported successfully with exact changes!', 'success');
            if (typeof recordUserAction === 'function') {
                recordUserAction('PDF Editor', outName);
            }
        } catch (err) {
            toast.remove();
            showToast('Export failed: ' + err.message, 'error');
        }
    });
}

