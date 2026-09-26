// DocStudio - Main Application Controller

// -------------------------------------------------------------
// Toast Notification Utility
// -------------------------------------------------------------
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    const colors = {
        info: 'bg-slate-900 text-white',
        success: 'bg-emerald-600 text-white',
        error: 'bg-rose-600 text-white',
        loading: 'bg-brand-600 text-white animate-pulse'
    };

    toast.className = `toast-msg pointer-events-auto px-4 py-3 rounded-xl shadow-xl flex items-center space-x-2 text-sm font-medium ${colors[type] || colors.info}`;
    toast.innerHTML = `<span>${message}</span>`;
    
    container.appendChild(toast);

    if (type !== 'loading') {
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(8px)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }
    return toast;
}

// -------------------------------------------------------------
// Tab Switching
// -------------------------------------------------------------
function switchTab(tabName, extra = null) {
    // Hide all tab panes
    document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.add('hidden');
        pane.classList.remove('active');
    });

    // Remove active class from nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    // Show active pane
    const targetPane = document.getElementById(`tab-${tabName}`);
    if (targetPane) {
        targetPane.classList.remove('hidden');
        targetPane.classList.add('active');
    }

    // Set active nav button
    const activeBtn = document.getElementById(`nav-${tabName}`);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Refresh icons
    if (window.lucide) {
        lucide.createIcons();
    }
}

// Helper: Download a Blob with filename
function triggerDownload(blob, filename) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
}

// -------------------------------------------------------------
// Converter Hub Logic (PDF <-> PPT)
// -------------------------------------------------------------
let selectedPdfToPptFile = null;
let selectedPptToPdfFile = null;

// Setup Drag and Drop for PDF to PPT
const dropzonePdf = document.getElementById('dropzone-pdf-to-ppt');
const inputPdf = document.getElementById('file-pdf-to-ppt');

if (dropzonePdf && inputPdf) {
    dropzonePdf.addEventListener('click', () => inputPdf.click());
    inputPdf.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            selectedPdfToPptFile = e.target.files[0];
            document.getElementById('name-pdf-to-ppt').innerText = selectedPdfToPptFile.name;
            document.getElementById('status-pdf-to-ppt').classList.remove('hidden');
        }
    });
}

// Setup Drag and Drop for PPT to PDF
const dropzonePpt = document.getElementById('dropzone-ppt-to-pdf');
const inputPpt = document.getElementById('file-ppt-to-pdf');

if (dropzonePpt && inputPpt) {
    dropzonePpt.addEventListener('click', () => inputPpt.click());
    inputPpt.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            selectedPptToPdfFile = e.target.files[0];
            document.getElementById('name-ppt-to-pdf').innerText = selectedPptToPdfFile.name;
            document.getElementById('status-ppt-to-pdf').classList.remove('hidden');
        }
    });
}

async function startPdfToPpt() {
    if (!selectedPdfToPptFile) {
        showToast('Please select a PDF file first.', 'error');
        return;
    }

    const btn = document.getElementById('btn-convert-pdf-to-ppt');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="animate-spin mr-2">⏳</span> Converting to PPTX...';
    const toast = showToast('Converting PDF to PowerPoint slides...', 'loading');

    const formData = new FormData();
    formData.append('file', selectedPdfToPptFile);

    try {
        const response = await fetch('/api/convert/pdf-to-ppt', {
            method: 'POST',
            body: formData
        });

        toast.remove();

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || 'Conversion failed');
        }

        const blob = await response.blob();
        const filename = selectedPdfToPptFile.name.replace(/\.pdf$/i, '') + '_converted.pptx';
        triggerDownload(blob, filename);
        showToast('Successfully converted & downloaded PPTX!', 'success');
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
        if (window.lucide) lucide.createIcons();
    }
}

async function startPptToPdf() {
    if (!selectedPptToPdfFile) {
        showToast('Please select a PPTX file first.', 'error');
        return;
    }

    const btn = document.getElementById('btn-convert-ppt-to-pdf');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="animate-spin mr-2">⏳</span> Converting to PDF...';
    const toast = showToast('Converting PPT to PDF...', 'loading');

    const formData = new FormData();
    formData.append('file', selectedPptToPdfFile);

    try {
        const response = await fetch('/api/convert/ppt-to-pdf', {
            method: 'POST',
            body: formData
        });

        toast.remove();

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || 'Conversion failed');
        }

        const blob = await response.blob();
        const filename = selectedPptToPdfFile.name.replace(/\.pptx?$/i, '') + '_converted.pdf';
        triggerDownload(blob, filename);
        showToast('Successfully converted & downloaded PDF!', 'success');
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
        if (window.lucide) lucide.createIcons();
    }
}

// -------------------------------------------------------------
// PDF Utility Tools (Merge, Split, Images to PDF, Watermark)
// -------------------------------------------------------------
async function startMergePdf() {
    const input = document.getElementById('file-merge');
    if (!input.files || input.files.length < 2) {
        showToast('Please select at least 2 PDF files to merge.', 'error');
        return;
    }

    const formData = new FormData();
    for (let i = 0; i < input.files.length; i++) {
        formData.append('files', input.files[i]);
    }

    const toast = showToast('Merging PDF files...', 'loading');
    try {
        const res = await fetch('/api/tools/merge-pdf', { method: 'POST', body: formData });
        toast.remove();
        if (!res.ok) throw new Error('Merge failed');
        const blob = await res.blob();
        triggerDownload(blob, 'merged_document.pdf');
        showToast('PDF files merged successfully!', 'success');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function startSplitPdf() {
    const input = document.getElementById('file-split');
    const range = document.getElementById('split-range').value.trim();
    if (!input.files || input.files.length === 0) {
        showToast('Please select a PDF file to split.', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('file', input.files[0]);
    formData.append('page_range', range);

    const toast = showToast('Extracting pages...', 'loading');
    try {
        const res = await fetch('/api/tools/split-pdf', { method: 'POST', body: formData });
        toast.remove();
        if (!res.ok) throw new Error('Split failed');
        const blob = await res.blob();
        triggerDownload(blob, 'split_document.pdf');
        showToast('Extracted pages downloaded!', 'success');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function startImageToPdf() {
    const input = document.getElementById('file-images');
    if (!input.files || input.files.length === 0) {
        showToast('Please select images to convert.', 'error');
        return;
    }

    const formData = new FormData();
    for (let i = 0; i < input.files.length; i++) {
        formData.append('images', input.files[i]);
    }

    const toast = showToast('Creating PDF from images...', 'loading');
    try {
        const res = await fetch('/api/tools/image-to-pdf', { method: 'POST', body: formData });
        toast.remove();
        if (!res.ok) throw new Error('Conversion failed');
        const blob = await res.blob();
        triggerDownload(blob, 'images_converted.pdf');
        showToast('Images converted to PDF successfully!', 'success');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function startWatermarkPdf() {
    const input = document.getElementById('file-watermark');
    const watermarkText = document.getElementById('watermark-text').value.trim() || 'CONFIDENTIAL';
    if (!input.files || input.files.length === 0) {
        showToast('Please select a PDF file.', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('file', input.files[0]);
    formData.append('watermark_text', watermarkText);

    const toast = showToast('Stamping watermark...', 'loading');
    try {
        const res = await fetch('/api/tools/pdf-watermark', { method: 'POST', body: formData });
        toast.remove();
        if (!res.ok) throw new Error('Watermarking failed');
        const blob = await res.blob();
        triggerDownload(blob, 'watermarked_document.pdf');
        showToast('Watermarked PDF downloaded!', 'success');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// =============================================================
// SEJDA ALL-TOOLS MEGA MENU & UNIVERSAL TOOL RUNNER ENGINE
// =============================================================

let currentActiveToolId = 'delete-pages';
let currentRunnerFile = null;

function toggleAllToolsMegaMenu(forceState = null) {
    const menu = document.getElementById('all-tools-megamenu');
    if (!menu) return;
    if (forceState !== null) {
        menu.classList.toggle('hidden', !forceState);
    } else {
        menu.classList.toggle('hidden');
    }
    if (window.lucide) lucide.createIcons();
}

// Global click outside to close Mega Menu
document.addEventListener('click', (e) => {
    const menu = document.getElementById('all-tools-megamenu');
    const btn = document.getElementById('btn-all-tools-nav');
    if (menu && !menu.classList.contains('hidden')) {
        if (!menu.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
            menu.classList.add('hidden');
        }
    }
});

const ALL_TOOLS_CONFIG = {
    'delete-pages': {
        title: 'Delete PDF Pages',
        subtitle: 'Remove unwanted pages from your PDF document easily and download the result.',
        icon: 'trash-2',
        iconColor: 'text-sky-500',
        accept: '.pdf',
        acceptText: 'Select a PDF to delete pages from.',
        submitText: 'Delete Pages & Download',
        endpoint: '/api/tools/delete-pages',
        renderOptions: (container) => {
            container.innerHTML = `
                <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Pages to delete:</label>
                <div class="flex items-center space-x-2">
                    <input type="text" id="opt-delete-pages" placeholder="e.g. 1, 3, 5-7" value="1" class="w-full p-2.5 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-emerald-500">
                    <button type="button" onclick="document.getElementById('opt-delete-pages').value='1'" class="px-3 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-200">Page 1</button>
                    <button type="button" onclick="document.getElementById('opt-delete-pages').value='odd'" class="px-3 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-200">Odd</button>
                </div>
                <p class="text-xs text-slate-400 mt-1">Specify comma-separated page numbers or ranges (e.g. 1, 3-5).</p>
            `;
        },
        buildFormData: (fd) => {
            let val = document.getElementById('opt-delete-pages')?.value.trim() || '1';
            fd.append('pages_to_delete', val);
        }
    },
    'compress': {
        title: 'Compress PDF',
        subtitle: 'Reduce the size of your PDF',
        icon: 'minimize-2',
        iconColor: 'text-cyan-500',
        accept: '.pdf',
        acceptText: 'Select a PDF document to compress.',
        submitText: 'Compress PDF',
        endpoint: '/api/tools/compress',
        renderOptions: (container) => {
            const fileName = currentRunnerFile ? currentRunnerFile.name : '';
            container.innerHTML = `
                <div class="sejda-compress-container space-y-6 pt-2">
                    <!-- Selected file label matching Sejda screenshot -->
                    <div id="sejda-compress-file-badge" class="${currentRunnerFile ? '' : 'hidden'} text-slate-500 text-sm font-medium">
                        Selected: <span id="sejda-compress-file-name" class="text-slate-800 font-semibold">${fileName}</span>
                        <button type="button" onclick="clearSelectedRunnerFile()" class="ml-2 text-xs text-emerald-600 hover:text-emerald-700 underline font-normal">(change)</button>
                    </div>

                    <!-- 1. Image Quality -->
                    <div>
                        <div class="sejda-compress-group-title">Image quality:</div>
                        <div class="sejda-segmented-group" id="grp-img-quality" data-selected="good">
                            <button type="button" class="sejda-segmented-btn" onclick="selectSegmentedBtn(this, 'grp-img-quality', 'medium')">
                                Medium <span class="sejda-help-circle" title="Medium quality: Higher compression, smaller file size">?</span>
                            </button>
                            <button type="button" class="sejda-segmented-btn active" onclick="selectSegmentedBtn(this, 'grp-img-quality', 'good')">
                                Good <span class="sejda-help-circle" title="Good quality: Recommended balance of sharpness and file size">?</span>
                            </button>
                            <button type="button" class="sejda-segmented-btn" onclick="selectSegmentedBtn(this, 'grp-img-quality', 'best')">
                                Best <span class="sejda-help-circle" title="Best quality: Minimal loss, highest visual clarity">?</span>
                            </button>
                        </div>
                    </div>

                    <!-- 2. Image Resolution (ppi) -->
                    <div>
                        <div class="sejda-compress-group-title">Image resolution (ppi):</div>
                        <div class="sejda-segmented-group" id="grp-img-resolution" data-selected="144">
                            <button type="button" class="sejda-segmented-btn" onclick="selectSegmentedBtn(this, 'grp-img-resolution', '72')">72</button>
                            <button type="button" class="sejda-segmented-btn" onclick="selectSegmentedBtn(this, 'grp-img-resolution', '100')">100</button>
                            <button type="button" class="sejda-segmented-btn active" onclick="selectSegmentedBtn(this, 'grp-img-resolution', '144')">144</button>
                            <button type="button" class="sejda-segmented-btn" onclick="selectSegmentedBtn(this, 'grp-img-resolution', '200')">200</button>
                            <button type="button" class="sejda-segmented-btn" onclick="selectSegmentedBtn(this, 'grp-img-resolution', '300')">300</button>
                            <button type="button" class="sejda-segmented-btn" onclick="selectSegmentedBtn(this, 'grp-img-resolution', '720')">720</button>
                        </div>
                    </div>

                    <!-- 3. Image Conversion -->
                    <div>
                        <div class="sejda-compress-group-title">Image conversion:</div>
                        <div class="sejda-segmented-group" id="grp-img-conversion" data-selected="none">
                            <button type="button" class="sejda-segmented-btn active" onclick="selectSegmentedBtn(this, 'grp-img-conversion', 'none')">None</button>
                            <button type="button" class="sejda-segmented-btn" onclick="selectSegmentedBtn(this, 'grp-img-conversion', 'grayscale')">
                                Grayscale <span class="sejda-help-circle" title="Converts images to grayscale for maximum file size reduction">?</span>
                            </button>
                        </div>
                    </div>

                    <!-- 4. Multimedia Files -->
                    <div>
                        <div class="sejda-compress-group-title">Multimedia files:</div>
                        <div class="sejda-segmented-group" id="grp-multimedia" data-selected="discard">
                            <button type="button" class="sejda-segmented-btn active" onclick="selectSegmentedBtn(this, 'grp-multimedia', 'discard')">
                                Discard <span class="sejda-help-circle" title="Discards embedded multimedia files & rich annotations">?</span>
                            </button>
                            <button type="button" class="sejda-segmented-btn" onclick="selectSegmentedBtn(this, 'grp-multimedia', 'keep')">Keep</button>
                        </div>
                    </div>

                    <!-- 5. Fonts: Experimental -->
                    <div>
                        <div class="sejda-compress-group-title">
                            <span>Fonts:</span>
                            <span class="sejda-badge-experimental">Experimental</span>
                        </div>
                        <div class="sejda-segmented-group" id="grp-fonts" data-selected="optimize">
                            <button type="button" class="sejda-segmented-btn" onclick="selectSegmentedBtn(this, 'grp-fonts', 'leave_unchanged')">Leave unchanged</button>
                            <button type="button" class="sejda-segmented-btn active" onclick="selectSegmentedBtn(this, 'grp-fonts', 'optimize')">
                                Optimize <span class="sejda-help-circle" title="Optimizes and deflates font streams">?</span>
                            </button>
                        </div>
                    </div>

                    <!-- Action Buttons -->
                    <div class="flex items-center justify-center space-x-3 pt-4">
                        <button type="button" onclick="executeCurrentToolAction()" class="sejda-btn-compress-action">
                            Compress PDF
                        </button>
                        <button type="button" onclick="toggleCompressMoreOptions()" class="sejda-btn-more-options">
                            More options
                        </button>
                    </div>

                    <!-- Expandable More options -->
                    <div id="sejda-compress-more-opts" class="hidden text-left bg-slate-50 border border-slate-200 rounded-xl p-4 mt-3 max-w-sm mx-auto space-y-2 text-xs text-slate-700 shadow-inner">
                        <label class="flex items-center space-x-2 cursor-pointer">
                            <input type="checkbox" id="opt-strip-meta" class="accent-emerald-600">
                            <span>Discard PDF metadata</span>
                        </label>
                        <label class="flex items-center space-x-2 cursor-pointer">
                            <input type="checkbox" id="opt-clean-streams" checked class="accent-emerald-600">
                            <span>Clean page content streams</span>
                        </label>
                        <label class="flex items-center space-x-2 cursor-pointer">
                            <input type="checkbox" id="opt-deflate-all" checked class="accent-emerald-600">
                            <span>Deflate internal stream objects</span>
                        </label>
                    </div>
                </div>
            `;
        },
        buildFormData: (fd) => {
            const quality = document.getElementById('grp-img-quality')?.dataset.selected || 'good';
            const resolution = document.getElementById('grp-img-resolution')?.dataset.selected || '144';
            const conversion = document.getElementById('grp-img-conversion')?.dataset.selected || 'none';
            const multimedia = document.getElementById('grp-multimedia')?.dataset.selected || 'discard';
            const fonts = document.getElementById('grp-fonts')?.dataset.selected || 'optimize';
            const stripMeta = document.getElementById('opt-strip-meta')?.checked ? 'true' : 'false';

            fd.append('image_quality', quality);
            fd.append('image_resolution', resolution);
            fd.append('image_conversion', conversion);
            fd.append('multimedia_files', multimedia);
            fd.append('fonts', fonts);
            fd.append('strip_metadata', stripMeta);
        }
    },
    'crop': {
        title: 'Crop PDF Online',
        subtitle: 'Trim PDF margins, change PDF page size',
        icon: 'crop',
        iconColor: 'text-emerald-600',
        accept: '.pdf',
        acceptText: 'Select a PDF document to crop.',
        submitText: 'Continue',
        endpoint: '/api/tools/crop',
        renderOptions: (container) => {
            const fileName = currentRunnerFile ? currentRunnerFile.name : '';
            container.innerHTML = `
                <div class="sejda-crop-container space-y-5 pt-1">
                    <!-- GOVT FORM & EXAM DOCUMENT PROMPT ASSISTANT (UPSC, SSC, IBPS, Passport, IDs) -->
                    <div class="govt-assistant-box max-w-3xl mx-auto text-left">
                        <div class="flex items-center justify-between mb-1.5">
                            <div class="flex items-center gap-2">
                                <span class="p-1.5 bg-emerald-600 text-white rounded-lg shadow-sm flex items-center justify-center">
                                    <i data-lucide="sparkles" class="w-4 h-4"></i>
                                </span>
                                <div>
                                    <h4 class="text-sm font-bold text-slate-800 flex items-center gap-2">
                                        Govt Form & Exam Document Assistant
                                        <span class="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">AI Prompt</span>
                                    </h4>
                                    <p class="text-xs text-slate-500">Auto-crop & compress for UPSC, SSC, IBPS, Passport, State PSC, Govt IDs</p>
                                </div>
                            </div>
                        </div>

                        <!-- Prompt Input Field -->
                        <div class="flex items-center gap-2 mt-2.5">
                            <div class="relative flex-1">
                                <i data-lucide="message-square" class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
                                <input type="text" id="crop-prompt-input" 
                                    placeholder="Type requirement, e.g. 'passport photo 3.5x4.5 cm under 50kb' or 'signature 4x2 cm under 20kb'..." 
                                    class="w-full pl-9 pr-3 py-2 text-xs md:text-sm bg-white border border-slate-300 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 shadow-inner"
                                    onkeydown="if(event.key === 'Enter'){ applyCropPrompt(); event.preventDefault(); }">
                            </div>
                            <button type="button" onclick="applyCropPrompt()" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs md:text-sm rounded-lg shadow transition flex items-center gap-1.5 shrink-0">
                                <i data-lucide="wand-2" class="w-4 h-4"></i>
                                Apply
                            </button>
                        </div>

                        <!-- Quick Presets -->
                        <div class="mt-2.5 pt-2 border-t border-emerald-200/60 flex items-center flex-wrap gap-1.5 text-xs">
                            <span class="text-slate-500 font-semibold text-[11px] uppercase tracking-wider mr-1">Presets:</span>
                            <button type="button" onclick="applyCropPreset('passport_photo')" class="govt-preset-chip" title="UPSC, SSC, IBPS, Visa standard photo">
                                📷 Passport Photo (3.5×4.5 cm, &lt;50KB)
                            </button>
                            <button type="button" onclick="applyCropPreset('govt_signature')" class="govt-preset-chip" title="Govt forms standard signature">
                                ✍️ Signature (4.0×2.0 cm, &lt;20KB)
                            </button>
                            <button type="button" onclick="applyCropPreset('id_card')" class="govt-preset-chip" title="Aadhaar, PAN Card, Voter ID">
                                🪪 ID / PAN Card (8.5×5.5 cm, &lt;100KB)
                            </button>
                            <button type="button" onclick="applyCropPreset('marksheet_a4')" class="govt-preset-chip" title="10th/12th Marksheet, Certificate">
                                📄 Marksheet / Doc (&lt;200KB)
                            </button>
                        </div>
                    </div>

                    <!-- VIEW 1: Choice view (3 cards) -->
                    <div id="crop-options-choice-container">
                        <!-- Selected file label matching Sejda screenshot -->
                        <div id="sejda-crop-file-badge" class="${currentRunnerFile ? '' : 'hidden'} text-slate-500 text-sm font-medium mb-4">
                            Selected: <span id="sejda-crop-file-name" class="text-slate-800 font-semibold">${fileName}</span>
                            <button type="button" onclick="clearSelectedRunnerFile()" class="ml-2 text-xs text-emerald-600 hover:text-emerald-700 underline font-normal">(change)</button>
                        </div>

                        <!-- Heading -->
                        <h3 class="text-base font-bold text-slate-800 mb-4">Choose an option</h3>

                        <!-- 3 Cards Grid Matching Screenshot -->
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-3xl mx-auto" id="crop-mode-grid" data-selected="automatic">
                            <!-- Card 1: Automatic (Same crop size across all pages) -->
                            <div class="sejda-crop-card active" onclick="selectCropMode('automatic')" id="crop-card-automatic">
                                <div class="sejda-crop-icon">
                                    <i data-lucide="copy" class="w-8 h-8"></i>
                                </div>
                                <div class="sejda-crop-desc">
                                    Same crop size across all pages
                                </div>
                                <div class="sejda-crop-action">
                                    Automatic &rarr;
                                </div>
                            </div>

                            <!-- Card 2: Automatic maximum crop (Crop each page as much as possible) -->
                            <div class="sejda-crop-card" onclick="selectCropMode('max_crop')" id="crop-card-max_crop">
                                <div class="sejda-crop-icon">
                                    <i data-lucide="layers" class="w-8 h-8"></i>
                                </div>
                                <div class="sejda-crop-desc">
                                    Crop each page as much as possible
                                </div>
                                <div class="sejda-crop-action">
                                    <span>Automatic<br>maximum crop &rarr;</span>
                                </div>
                            </div>

                            <!-- Card 3: Preview pages and choose crop areas -->
                            <div class="sejda-crop-card" onclick="selectCropMode('preview_select')" id="crop-card-preview_select">
                                <div class="sejda-crop-icon">
                                    <i data-lucide="crop" class="w-8 h-8"></i>
                                </div>
                                <div class="sejda-crop-desc">
                                    Preview pages and choose crop areas
                                </div>
                                <div class="sejda-crop-action">
                                    <span>Preview pages &<br>select &rarr;</span>
                                </div>
                            </div>
                        </div>

                        <!-- Continue Button -->
                        <div class="pt-6">
                            <button type="button" onclick="executeCurrentToolAction()" class="sejda-btn-crop-continue">
                                Continue &gt;
                            </button>
                        </div>
                    </div>

                    <!-- VIEW 2: Visual Interactive Crop Editor Matching User Screenshot (media_1790308406873.png) -->
                    <div id="crop-visual-editor-container" class="hidden text-center space-y-4">
                        <div class="flex items-center justify-between max-w-3xl mx-auto pb-1 border-b border-slate-100">
                            <button type="button" onclick="closeCropVisualEditor()" class="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center">
                                <i data-lucide="arrow-left" class="w-3.5 h-3.5 mr-1"></i> Back to options
                            </button>
                            <div class="text-slate-500 text-xs font-medium">
                                Selected: <span id="crop-visual-file-name" class="text-slate-800 font-semibold">${fileName}</span>
                            </div>
                        </div>

                        <!-- Preview mode selector -->
                        <div>
                            <div class="text-sm font-semibold text-slate-800 mb-2">Preview mode</div>
                            <div class="sejda-segmented-group inline-flex" id="crop-preview-mode" data-selected="blended">
                                <button type="button" class="sejda-segmented-btn active" onclick="setCropPreviewMode(this, 'blended')">Blended</button>
                                <button type="button" class="sejda-segmented-btn" onclick="setCropPreviewMode(this, 'page_by_page')">Page by page</button>
                                <button type="button" class="sejda-segmented-btn" onclick="setCropPreviewMode(this, 'odd_even')">Odd & even</button>
                            </div>
                        </div>

                        <!-- Measurement Card -->
                        <div class="flex justify-center">
                            <div class="crop-measure-card">
                                <!-- Coordinate inputs & Target KB Limit -->
                                <div class="crop-measure-grid">
                                    <div class="crop-measure-field">
                                        <span class="crop-measure-label">Top</span>
                                        <input type="number" step="0.01" id="crop-in-top" value="0.00" oninput="onCropInputChange('top')" class="crop-measure-input">
                                    </div>
                                    <div class="crop-measure-field">
                                        <span class="crop-measure-label">Width</span>
                                        <input type="number" step="0.01" id="crop-in-width" value="0.00" oninput="onCropInputChange('width')" class="crop-measure-input font-bold text-emerald-700">
                                    </div>
                                    <div class="crop-measure-field">
                                        <span class="crop-measure-label">Height</span>
                                        <input type="number" step="0.01" id="crop-in-height" value="0.00" oninput="onCropInputChange('height')" class="crop-measure-input font-bold text-emerald-700">
                                    </div>
                                    <div class="crop-measure-field">
                                        <span class="crop-measure-label">Bottom</span>
                                        <input type="number" step="0.01" id="crop-in-bottom" value="0.00" oninput="onCropInputChange('bottom')" class="crop-measure-input">
                                    </div>
                                    <div class="crop-measure-field">
                                        <span class="crop-measure-label">Left</span>
                                        <input type="number" step="0.01" id="crop-in-left" value="0.00" oninput="onCropInputChange('left')" class="crop-measure-input">
                                    </div>
                                    <div class="crop-measure-field">
                                        <span class="crop-measure-label">Right</span>
                                        <input type="number" step="0.01" id="crop-in-right" value="0.00" oninput="onCropInputChange('right')" class="crop-measure-input">
                                    </div>
                                    <div class="crop-measure-field col-span-2 md:col-span-3 pt-2 border-t border-slate-200 mt-1 flex flex-wrap items-center justify-between gap-3">
                                        <div class="flex items-center gap-2">
                                            <span class="text-xs font-bold text-amber-800 flex items-center gap-1">
                                                <i data-lucide="file-check-2" class="w-3.5 h-3.5 text-amber-600"></i> Max File Size:
                                            </span>
                                            <input type="number" step="1" min="1" id="crop-target-kb" placeholder="e.g. 50" oninput="onCropTargetKbChange(this.value)" class="crop-measure-input text-amber-900 font-bold border-amber-300 focus:border-amber-500 w-20">
                                            <span class="text-xs text-amber-700 font-semibold">KB (Target limit)</span>
                                        </div>
                                        <label class="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-slate-700 select-none hover:text-emerald-700">
                                            <input type="checkbox" id="crop-lock-ratio" onchange="toggleCropLockRatio(this.checked)" class="accent-emerald-600 rounded">
                                            <span>🔒 Lock Aspect Ratio</span>
                                        </label>
                                    </div>
                                </div>

                                <!-- Units & Auto-crop -->
                                <div class="crop-measure-side">
                                    <div class="sejda-segmented-group" id="crop-unit-group">
                                        <button type="button" class="sejda-segmented-btn active" onclick="setCropUnit(this, 'cm')">cm</button>
                                        <button type="button" class="sejda-segmented-btn" onclick="setCropUnit(this, 'mm')">mm</button>
                                        <button type="button" class="sejda-segmented-btn" onclick="setCropUnit(this, 'inch')">inch</button>
                                    </div>
                                    <button type="button" onclick="performVisualAutoCrop()" class="crop-btn-autocrop">
                                        Auto-crop
                                    </button>
                                </div>
                            </div>
                        </div>

                        <!-- Page by page navigation (shown in page_by_page mode) -->
                        <div id="crop-page-nav-bar" class="crop-page-nav hidden">
                            <button type="button" onclick="changeCropPage(-1)" class="crop-page-nav-btn">&larr; Previous Page</button>
                            <span id="crop-page-num-display" class="font-semibold text-slate-700 text-xs">Page 1 of 1</span>
                            <button type="button" onclick="changeCropPage(1)" class="crop-page-nav-btn">Next Page &rarr;</button>
                        </div>

                        <!-- Canvas Stage with Interactive Crop Box -->
                        <div class="overflow-x-auto py-2 text-center">
                            <div id="crop-stage-wrapper" class="crop-stage-wrapper">
                                <canvas id="crop-stage-canvas"></canvas>
                                <!-- 4 Dimming overlays -->
                                <div id="crop-dim-top" class="crop-dim"></div>
                                <div id="crop-dim-bottom" class="crop-dim"></div>
                                <div id="crop-dim-left" class="crop-dim"></div>
                                <div id="crop-dim-right" class="crop-dim"></div>
                                <!-- Resizable Crop Box with Edges and Handles -->
                                <div id="crop-rect-box">
                                    <div class="crop-edge edge-t" data-handle="n"></div>
                                    <div class="crop-edge edge-b" data-handle="s"></div>
                                    <div class="crop-edge edge-l" data-handle="w"></div>
                                    <div class="crop-edge edge-r" data-handle="e"></div>
                                    <div class="crop-handle handle-nw" data-handle="nw"></div>
                                    <div class="crop-handle handle-ne" data-handle="ne"></div>
                                    <div class="crop-handle handle-sw" data-handle="sw"></div>
                                    <div class="crop-handle handle-se" data-handle="se"></div>
                                    <div class="crop-handle handle-n" data-handle="n"></div>
                                    <div class="crop-handle handle-s" data-handle="s"></div>
                                    <div class="crop-handle handle-w" data-handle="w"></div>
                                    <div class="crop-handle handle-e" data-handle="e"></div>
                                </div>
                            </div>
                        </div>

                        <!-- Sticky Bottom Bar -->
                        <div class="crop-sticky-bar">
                            <button type="button" onclick="executeVisualCrop()" class="sejda-btn-crop-action">
                                Crop PDF
                            </button>
                        </div>
                    </div>
                </div>
            `;
            if (window.lucide) lucide.createIcons();
        },
        buildFormData: (fd) => {
            const grid = document.getElementById('crop-mode-grid');
            const mode = grid ? grid.dataset.selected || 'automatic' : 'automatic';
            fd.append('mode', mode);
            if (mode === 'preview_select') {
                const topPt = cropBox.y / cropCanvasScale;
                const leftPt = cropBox.x / cropCanvasScale;
                const bottomPt = Math.max(0, cropPageNaturalHeight - ((cropBox.y + cropBox.height) / cropCanvasScale));
                const rightPt = Math.max(0, cropPageNaturalWidth - ((cropBox.x + cropBox.width) / cropCanvasScale));
                fd.append('top', topPt.toFixed(2));
                fd.append('bottom', bottomPt.toFixed(2));
                fd.append('left', leftPt.toFixed(2));
                fd.append('right', rightPt.toFixed(2));
            }
            const targetKbInput = document.getElementById('crop-target-kb');
            const targetKb = targetKbInput ? parseFloat(targetKbInput.value) : (cropTargetMaxKb || null);
            if (targetKb && targetKb > 0) {
                fd.append('target_max_kb', targetKb.toString());
            }
            if (cropTargetWidth && cropTargetHeight) {
                fd.append('target_width', cropTargetWidth.toString());
                fd.append('target_height', cropTargetHeight.toString());
                fd.append('unit', cropUnit);
            }
        }
    },
    'rotate': {
        title: 'Rotate PDF',
        subtitle: 'Rotate all pages of your PDF document permanently.',
        icon: 'rotate-cw',
        iconColor: 'text-pink-500',
        accept: '.pdf',
        acceptText: 'Select a PDF to rotate.',
        submitText: 'Rotate PDF',
        endpoint: '/api/tools/rotate',
        renderOptions: (container) => {
            container.innerHTML = `
                <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Rotation Angle:</label>
                <div class="grid grid-cols-3 gap-3">
                    <label class="p-3 border border-emerald-500 bg-emerald-50/50 rounded-xl cursor-pointer flex flex-col items-center text-center">
                        <input type="radio" name="opt-rotate-angle" value="90" checked class="accent-emerald-600 mb-1">
                        <span class="text-xs font-bold text-slate-800">90° Right</span>
                        <span class="text-[10px] text-slate-500">Clockwise</span>
                    </label>
                    <label class="p-3 border border-slate-200 hover:border-slate-300 rounded-xl cursor-pointer flex flex-col items-center text-center">
                        <input type="radio" name="opt-rotate-angle" value="180" class="accent-emerald-600 mb-1">
                        <span class="text-xs font-bold text-slate-800">180°</span>
                        <span class="text-[10px] text-slate-500">Upside down</span>
                    </label>
                    <label class="p-3 border border-slate-200 hover:border-slate-300 rounded-xl cursor-pointer flex flex-col items-center text-center">
                        <input type="radio" name="opt-rotate-angle" value="270" class="accent-emerald-600 mb-1">
                        <span class="text-xs font-bold text-slate-800">90° Left</span>
                        <span class="text-[10px] text-slate-500">Counter-clockwise</span>
                    </label>
                </div>
            `;
        },
        buildFormData: (fd) => {
            const checked = document.querySelector('input[name="opt-rotate-angle"]:checked');
            fd.append('angle', checked ? checked.value : '90');
        }
    },
    'protect': {
        title: 'Protect PDF with Password',
        subtitle: 'Encrypt your PDF with strong AES-256 password protection.',
        icon: 'lock',
        iconColor: 'text-sky-500',
        accept: '.pdf',
        acceptText: 'Select a PDF to protect with a password.',
        submitText: 'Encrypt & Download',
        endpoint: '/api/tools/protect',
        renderOptions: (container) => {
            container.innerHTML = `
                <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Choose Password:</label>
                <input type="password" id="opt-protect-pw" placeholder="Enter secure password" class="w-full p-2.5 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-emerald-500">
                <p class="text-xs text-slate-400 mt-1">Users will be prompted to enter this password to view the PDF.</p>
            `;
        },
        buildFormData: (fd) => {
            const pw = document.getElementById('opt-protect-pw')?.value.trim();
            if (!pw) throw new Error('Please enter a password.');
            fd.append('password', pw);
        }
    },
    'unlock': {
        title: 'Unlock Password Protected PDF',
        subtitle: 'Remove password and encryption from your PDF document.',
        icon: 'unlock',
        iconColor: 'text-sky-500',
        accept: '.pdf',
        acceptText: 'Select an encrypted PDF document.',
        submitText: 'Unlock PDF',
        endpoint: '/api/tools/unlock',
        renderOptions: (container) => {
            container.innerHTML = `
                <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Current Password (if known):</label>
                <input type="password" id="opt-unlock-pw" placeholder="Password (leave blank if none)" class="w-full p-2.5 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-emerald-500">
            `;
        },
        buildFormData: (fd) => {
            fd.append('password', document.getElementById('opt-unlock-pw')?.value || '');
        }
    },
    'flatten': {
        title: 'Flatten PDF',
        subtitle: 'Convert fillable form fields and annotations into permanently baked page elements.',
        icon: 'layers',
        iconColor: 'text-sky-500',
        accept: '.pdf',
        acceptText: 'Select a PDF with form fields or annotations.',
        submitText: 'Flatten PDF',
        endpoint: '/api/tools/flatten',
        renderOptions: (container) => {
            container.innerHTML = `<p class="text-xs text-slate-600">Flattening locks interactive form widgets, checkboxes, and text fields into static vector elements so they cannot be altered.</p>`;
        },
        buildFormData: () => {}
    },
    'grayscale': {
        title: 'Grayscale PDF',
        subtitle: 'Convert colored PDF documents into crisp black and white grayscale format.',
        icon: 'moon',
        iconColor: 'text-fuchsia-500',
        accept: '.pdf',
        acceptText: 'Select a color PDF to convert to black and white.',
        submitText: 'Convert to Grayscale',
        endpoint: '/api/tools/grayscale',
        renderOptions: (container) => {
            container.innerHTML = `<p class="text-xs text-slate-600">Converts all text, images, and vector shapes to monochrome gray tones, perfect for economical printing.</p>`;
        },
        buildFormData: () => {}
    },
    'page-numbers': {
        title: 'Add Page Numbers',
        subtitle: 'Number pages of your PDF document sequentially.',
        icon: 'list-ordered',
        iconColor: 'text-fuchsia-500',
        accept: '.pdf',
        acceptText: 'Select a PDF document.',
        submitText: 'Add Page Numbers',
        endpoint: '/api/tools/page-numbers',
        renderOptions: (container) => {
            container.innerHTML = `
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Position:</label>
                        <select id="opt-pnum-pos" class="w-full p-2.5 border border-slate-200 rounded-lg text-xs font-medium">
                            <option value="bottom-center">Bottom Center</option>
                            <option value="bottom-right">Bottom Right</option>
                            <option value="top-right">Top Right</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Format Prefix:</label>
                        <input type="text" id="opt-pnum-prefix" value="Page " class="w-full p-2.5 border border-slate-200 rounded-lg text-xs font-medium">
                    </div>
                </div>
            `;
        },
        buildFormData: (fd) => {
            fd.append('position', document.getElementById('opt-pnum-pos')?.value || 'bottom-center');
            fd.append('prefix', document.getElementById('opt-pnum-prefix')?.value || 'Page ');
        }
    },
    'header-footer': {
        title: 'Header & Footer',
        subtitle: 'Add custom recurring headers and footers to every page of your PDF.',
        icon: 'align-center',
        iconColor: 'text-fuchsia-500',
        accept: '.pdf',
        acceptText: 'Select a PDF document.',
        submitText: 'Apply Header & Footer',
        endpoint: '/api/tools/header-footer',
        renderOptions: (container) => {
            container.innerHTML = `
                <div class="space-y-3">
                    <div>
                        <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Header text (top):</label>
                        <input type="text" id="opt-hf-header" placeholder="e.g. Confidential Report - 2026" class="w-full p-2.5 border border-slate-200 rounded-lg text-xs font-medium">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Footer text (bottom):</label>
                        <input type="text" id="opt-hf-footer" placeholder="e.g. DocStudio Generated Document" class="w-full p-2.5 border border-slate-200 rounded-lg text-xs font-medium">
                    </div>
                </div>
            `;
        },
        buildFormData: (fd) => {
            fd.append('header_text', document.getElementById('opt-hf-header')?.value || '');
            fd.append('footer_text', document.getElementById('opt-hf-footer')?.value || '');
        }
    },
    'bates': {
        title: 'Bates Numbering',
        subtitle: 'Apply legal Bates sequential numbering stamps across documents.',
        icon: 'hash',
        iconColor: 'text-fuchsia-500',
        accept: '.pdf',
        acceptText: 'Select a PDF for Bates numbering.',
        submitText: 'Apply Bates Stamps',
        endpoint: '/api/tools/bates-numbering',
        renderOptions: (container) => {
            container.innerHTML = `
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Prefix:</label>
                        <input type="text" id="opt-bates-prefix" value="BATES-" class="w-full p-2.5 border border-slate-200 rounded-lg text-xs font-medium">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Start Number:</label>
                        <input type="number" id="opt-bates-start" value="1" min="1" class="w-full p-2.5 border border-slate-200 rounded-lg text-xs font-medium">
                    </div>
                </div>
            `;
        },
        buildFormData: (fd) => {
            fd.append('prefix', document.getElementById('opt-bates-prefix')?.value || 'BATES-');
            fd.append('start_num', document.getElementById('opt-bates-start')?.value || '1');
        }
    },
    'metadata': {
        title: 'Edit PDF Metadata',
        subtitle: 'Inspect and update Document Title, Author, Subject, and Search Keywords.',
        icon: 'info',
        iconColor: 'text-fuchsia-500',
        accept: '.pdf',
        acceptText: 'Select a PDF to edit metadata.',
        submitText: 'Save Metadata',
        endpoint: '/api/tools/edit-metadata',
        renderOptions: (container) => {
            container.innerHTML = `
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-xs font-bold text-slate-700 mb-1">Title:</label>
                        <input type="text" id="opt-meta-title" placeholder="Document Title" class="w-full p-2 border border-slate-200 rounded-lg text-xs">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-slate-700 mb-1">Author:</label>
                        <input type="text" id="opt-meta-author" placeholder="Author Name" class="w-full p-2 border border-slate-200 rounded-lg text-xs">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-slate-700 mb-1">Subject:</label>
                        <input type="text" id="opt-meta-subject" placeholder="Subject" class="w-full p-2 border border-slate-200 rounded-lg text-xs">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-slate-700 mb-1">Keywords:</label>
                        <input type="text" id="opt-meta-keywords" placeholder="Keywords, comma separated" class="w-full p-2 border border-slate-200 rounded-lg text-xs">
                    </div>
                </div>
            `;
        },
        buildFormData: (fd) => {
            fd.append('title', document.getElementById('opt-meta-title')?.value || '');
            fd.append('author', document.getElementById('opt-meta-author')?.value || '');
            fd.append('subject', document.getElementById('opt-meta-subject')?.value || '');
            fd.append('keywords', document.getElementById('opt-meta-keywords')?.value || '');
        }
    },
    'resize': {
        title: 'Resize PDF Pages',
        subtitle: 'Rescale PDF pages to standard paper dimensions like A4, US Letter, or Legal.',
        icon: 'maximize-2',
        iconColor: 'text-pink-500',
        accept: '.pdf',
        acceptText: 'Select a PDF to resize.',
        submitText: 'Resize PDF',
        endpoint: '/api/tools/resize',
        renderOptions: (container) => {
            container.innerHTML = `
                <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Target Page Size:</label>
                <select id="opt-resize-size" class="w-full p-2.5 border border-slate-200 rounded-lg text-xs font-medium">
                    <option value="a4">A4 (210 x 297 mm)</option>
                    <option value="letter">US Letter (8.5 x 11 in)</option>
                    <option value="legal">US Legal (8.5 x 14 in)</option>
                </select>
            `;
        },
        buildFormData: (fd) => {
            fd.append('page_size', document.getElementById('opt-resize-size')?.value || 'a4');
        }
    },
    'organize': {
        title: 'Organize & Reorder Pages',
        subtitle: 'Reorder pages of your document in any custom sequence.',
        icon: 'layout-grid',
        iconColor: 'text-emerald-600',
        accept: '.pdf',
        acceptText: 'Select a PDF document.',
        submitText: 'Reorder & Download',
        endpoint: '/api/tools/organize',
        renderOptions: (container) => {
            container.innerHTML = `
                <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">New Page Order (comma separated):</label>
                <input type="text" id="opt-org-order" placeholder="e.g. 3, 1, 2 or leave blank to reverse" class="w-full p-2.5 border border-slate-200 rounded-lg text-xs font-medium">
            `;
        },
        buildFormData: (fd) => {
            fd.append('page_order', document.getElementById('opt-org-order')?.value || '');
        }
    },
    'alternate-mix': {
        title: 'Alternate & Mix PDFs',
        subtitle: 'Interleave pages from two different PDF files (e.g. scanned odd and even pages).',
        icon: 'shuffle',
        iconColor: 'text-emerald-600',
        accept: '.pdf',
        acceptText: 'Select the first PDF document.',
        submitText: 'Mix Documents',
        endpoint: '/api/tools/alternate-mix',
        renderOptions: () => {
            const sec = document.getElementById('tr-second-file-container');
            if (sec) sec.classList.remove('hidden');
        },
        buildFormData: (fd) => {
            const secInp = document.getElementById('tr-second-file-input');
            if (!secInp.files || secInp.files.length === 0) throw new Error('Please select the second PDF file.');
            fd.append('file1', currentRunnerFile);
            fd.append('file2', secInp.files[0]);
        }
    },
    'pdf-to-word': {
        title: 'PDF to Word (.docx)',
        subtitle: 'Convert PDF documents into editable Microsoft Word documents with paragraph styling.',
        icon: 'file-code',
        iconColor: 'text-orange-500',
        accept: '.pdf',
        acceptText: 'Select a PDF to convert to Word.',
        submitText: 'Convert to .DOCX',
        endpoint: '/api/tools/pdf-to-word',
        renderOptions: (container) => {
            container.innerHTML = `<p class="text-xs text-slate-600">Extracts paragraphs, text layouts, and headings directly into Microsoft Word format.</p>`;
        },
        buildFormData: () => {}
    },
    'pdf-to-excel': {
        title: 'PDF to Excel (.xlsx)',
        subtitle: 'Extract data, tables, and numeric columns from PDF into a structured Microsoft Excel spreadsheet.',
        icon: 'table',
        iconColor: 'text-orange-500',
        accept: '.pdf',
        acceptText: 'Select a PDF with tables or data.',
        submitText: 'Convert to .XLSX',
        endpoint: '/api/tools/pdf-to-excel',
        renderOptions: (container) => {
            container.innerHTML = `<p class="text-xs text-slate-600">Extracts line-by-line tables and numbers into Excel cells.</p>`;
        },
        buildFormData: () => {}
    },
    'pdf-to-jpg': {
        title: 'PDF to JPG',
        subtitle: 'Convert all pages of your PDF document into crisp, high-resolution JPG images packaged in a ZIP.',
        icon: 'image',
        iconColor: 'text-orange-500',
        accept: '.pdf',
        acceptText: 'Select a PDF document.',
        submitText: 'Convert & Download Images (.zip)',
        endpoint: '/api/tools/pdf-to-jpg',
        renderOptions: (container) => {
            container.innerHTML = `<p class="text-xs text-slate-600">Renders each page at 150 DPI and bundles them as individual JPEG files in a ZIP archive.</p>`;
        },
        buildFormData: () => {}
    },
    'pdf-to-text': {
        title: 'PDF to Text (.txt)',
        subtitle: 'Extract all readable text across all pages into a clean, unformatted plain text file.',
        icon: 'file-text',
        iconColor: 'text-orange-500',
        accept: '.pdf',
        acceptText: 'Select a PDF document.',
        submitText: 'Extract Text (.txt)',
        endpoint: '/api/tools/pdf-to-text',
        renderOptions: (container) => {
            container.innerHTML = `<p class="text-xs text-slate-600">Extracts full text with page separation banners.</p>`;
        },
        buildFormData: () => {}
    },
    'extract-images': {
        title: 'Extract Images from PDF',
        subtitle: 'Extract all original photographs and embedded graphics without losing quality.',
        icon: 'image',
        iconColor: 'text-fuchsia-500',
        accept: '.pdf',
        acceptText: 'Select a PDF document containing images.',
        submitText: 'Extract Images (.zip)',
        endpoint: '/api/tools/extract-images',
        renderOptions: (container) => {
            container.innerHTML = `<p class="text-xs text-slate-600">Extracts embedded PNG, JPEG, and TIFF raster images from all pages into a ZIP archive.</p>`;
        },
        buildFormData: () => {}
    },
    'word-to-pdf': {
        title: 'Word (.docx) to PDF',
        subtitle: 'Convert Microsoft Word documents into universal PDF format.',
        icon: 'file-text',
        iconColor: 'text-purple-500',
        accept: '.docx,.doc',
        acceptText: 'Select a Word (.docx) file.',
        submitText: 'Convert to .PDF',
        endpoint: '/api/tools/word-to-pdf',
        renderOptions: (container) => {
            container.innerHTML = `<p class="text-xs text-slate-600">Converts paragraphs and text formatting into a standard PDF.</p>`;
        },
        buildFormData: () => {}
    },
    'html-to-pdf': {
        title: 'HTML to PDF',
        subtitle: 'Convert HTML web documents or raw markup into a downloadable PDF.',
        icon: 'globe',
        iconColor: 'text-purple-500',
        accept: '.html,.htm',
        acceptText: 'Select an HTML file or enter markup below.',
        submitText: 'Render to .PDF',
        endpoint: '/api/tools/html-to-pdf',
        renderOptions: (container) => {
            container.innerHTML = `
                <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Or paste HTML content directly:</label>
                <textarea id="opt-html-content" rows="4" placeholder="<h1>Title</h1><p>Content...</p>" class="w-full p-2 border border-slate-200 rounded-lg text-xs font-mono"></textarea>
            `;
        },
        buildFormData: (fd) => {
            const h = document.getElementById('opt-html-content')?.value.trim();
            if (h) fd.append('html_content', h);
        }
    },
    'remove-annotations': {
        title: 'Remove Annotations',
        subtitle: 'Strip all comments, highlight markings, strikeouts, and link overlays from PDF.',
        icon: 'eraser',
        iconColor: 'text-pink-500',
        accept: '.pdf',
        acceptText: 'Select a PDF containing annotations.',
        submitText: 'Clean PDF & Download',
        endpoint: '/api/tools/remove-annotations',
        renderOptions: (container) => {
            container.innerHTML = `<p class="text-xs text-slate-600">Cleans document by permanently stripping all annotation objects.</p>`;
        },
        buildFormData: () => {}
    },
    'deskew': {
        title: 'Deskew PDF',
        subtitle: 'Automatically straighten crooked or tilted scanned pages.',
        icon: 'compass',
        iconColor: 'text-rose-500',
        accept: '.pdf',
        acceptText: 'Select a scanned PDF.',
        submitText: 'Deskew & Straighten',
        endpoint: '/api/tools/deskew',
        renderOptions: (container) => {
            container.innerHTML = `<p class="text-xs text-slate-600">Reconstructs content stream to realign page orientation.</p>`;
        },
        buildFormData: () => {}
    },
    'ocr': {
        title: 'OCR - Text Recognition',
        subtitle: 'Extract searchable text from scanned PDFs or images.',
        icon: 'scan-text',
        iconColor: 'text-rose-500',
        accept: '.pdf',
        acceptText: 'Select a scanned document.',
        submitText: 'Run OCR & Extract Text',
        endpoint: '/api/tools/ocr',
        renderOptions: (container) => {
            container.innerHTML = `<p class="text-xs text-slate-600">Processes image streams and generates structured text transcripts.</p>`;
        },
        buildFormData: () => {}
    },
    'repair': {
        title: 'Repair Corrupt PDF',
        subtitle: 'Reconstruct unreadable or corrupted PDF files by repairing the xref table.',
        icon: 'wrench',
        iconColor: 'text-pink-500',
        accept: '.pdf',
        acceptText: 'Select a damaged PDF file.',
        submitText: 'Repair PDF',
        endpoint: '/api/tools/repair',
        renderOptions: (container) => {
            container.innerHTML = `<p class="text-xs text-slate-600">Scans document streams and rebuilds the trailer and cross-reference table.</p>`;
        },
        buildFormData: () => {}
    },
    'rename': {
        title: 'Rename PDF',
        subtitle: 'Rename and sanitize your PDF document file name.',
        icon: 'edit-2',
        iconColor: 'text-pink-500',
        accept: '.pdf',
        acceptText: 'Select a PDF to rename.',
        submitText: 'Download Renamed File',
        endpoint: '/api/tools/rename',
        renderOptions: (container) => {
            container.innerHTML = `
                <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">New File Name:</label>
                <input type="text" id="opt-rename-name" placeholder="my_document.pdf" class="w-full p-2.5 border border-slate-200 rounded-lg text-xs font-medium">
            `;
        },
        buildFormData: (fd) => {
            fd.append('new_name', document.getElementById('opt-rename-name')?.value || 'document.pdf');
        }
    },
    'workflows': {
        title: 'Automated Document Workflows',
        subtitle: 'Execute multi-step document pipelines (Compress + Watermark + Page Numbers) in 1-click.',
        icon: 'workflow',
        iconColor: 'text-slate-700',
        accept: '.pdf',
        acceptText: 'Select a PDF document.',
        submitText: 'Execute Workflow',
        endpoint: '/api/tools/workflows',
        renderOptions: (container) => {
            container.innerHTML = `
                <div class="space-y-3">
                    <label class="flex items-center space-x-2 cursor-pointer">
                        <input type="checkbox" id="opt-wf-compress" checked class="accent-emerald-600">
                        <span class="text-xs font-semibold text-slate-700">Compress stream data</span>
                    </label>
                    <label class="flex items-center space-x-2 cursor-pointer">
                        <input type="checkbox" id="opt-wf-pnums" checked class="accent-emerald-600">
                        <span class="text-xs font-semibold text-slate-700">Stamp page numbers</span>
                    </label>
                    <div>
                        <label class="block text-xs font-bold text-slate-700 mb-1">Watermark text:</label>
                        <input type="text" id="opt-wf-wm" value="CONFIDENTIAL" class="w-full p-2 border border-slate-200 rounded-lg text-xs font-medium">
                    </div>
                </div>
            `;
        },
        buildFormData: (fd) => {
            fd.append('compress', document.getElementById('opt-wf-compress')?.checked ? 'true' : 'false');
            fd.append('page_numbers', document.getElementById('opt-wf-pnums')?.checked ? 'true' : 'false');
            fd.append('watermark', document.getElementById('opt-wf-wm')?.value || '');
        }
    }
};

// Aliases for mega menu mapping
ALL_TOOLS_CONFIG['split-pages'] = ALL_TOOLS_CONFIG['delete-pages'];
ALL_TOOLS_CONFIG['split-bookmarks'] = ALL_TOOLS_CONFIG['delete-pages'];
ALL_TOOLS_CONFIG['split-half'] = ALL_TOOLS_CONFIG['delete-pages'];
ALL_TOOLS_CONFIG['split-size'] = ALL_TOOLS_CONFIG['delete-pages'];
ALL_TOOLS_CONFIG['split-text'] = ALL_TOOLS_CONFIG['delete-pages'];
ALL_TOOLS_CONFIG['n-up'] = ALL_TOOLS_CONFIG['resize'];
ALL_TOOLS_CONFIG['flip'] = ALL_TOOLS_CONFIG['rotate'];
ALL_TOOLS_CONFIG['bookmarks'] = ALL_TOOLS_CONFIG['metadata'];
ALL_TOOLS_CONFIG['jpg-to-pdf'] = {
    title: 'JPG to PDF Converter',
    subtitle: 'Turn photos and image files into a single unified PDF document.',
    icon: 'image',
    iconColor: 'text-purple-500',
    accept: 'image/*',
    acceptText: 'Select image files (JPG, PNG, WebP).',
    submitText: 'Convert Images to PDF',
    endpoint: '/api/tools/image-to-pdf',
    renderOptions: (container) => {
        container.innerHTML = `<p class="text-xs text-slate-600">Upload one or multiple photos to convert into PDF.</p>`;
    },
    buildFormData: () => {}
};

function openToolSection(toolId) {
    toggleAllToolsMegaMenu(false);

    // If edit / fill & sign / create forms -> go directly to editor tab
    if (toolId === 'edit' || toolId === 'fill-sign' || toolId === 'create-forms') {
        switchTab('pdf-editor');
        showToast(toolId === 'fill-sign' ? 'Fill & Sign mode active' : 'PDF Editor loaded', 'info');
        return;
    }

    if (toolId === 'merge') {
        switchTab('pdf-tools');
        showToast('Merge PDF utility loaded', 'info');
        return;
    }

    if (toolId === 'split') {
        switchTab('pdf-tools');
        showToast('Split PDF utility loaded', 'info');
        return;
    }

    if (toolId === 'watermark') {
        switchTab('pdf-tools');
        showToast('Watermark tool loaded', 'info');
        return;
    }

    const cfg = ALL_TOOLS_CONFIG[toolId] || ALL_TOOLS_CONFIG['delete-pages'];
    currentActiveToolId = toolId;
    currentRunnerFile = null;

    // Switch to tool-runner tab
    switchTab('tool-runner');

    // Update Hero elements
    document.getElementById('tr-title').innerText = cfg.title;
    document.getElementById('tr-subtitle').innerText = cfg.subtitle;
    document.getElementById('tr-accept-text').innerText = cfg.acceptText || 'Files stay private and secure.';
    document.getElementById('tr-submit-text').innerText = cfg.submitText || 'Process Document';

    // Update Icon
    const iconContainer = document.getElementById('tr-icon-container');
    if (iconContainer) {
        iconContainer.innerHTML = `<i data-lucide="${cfg.icon}" class="w-8 h-8 ${cfg.iconColor || 'text-emerald-600'}"></i>`;
    }

    // Set input accept attribute
    const inp = document.getElementById('tr-file-input');
    if (inp) {
        inp.value = '';
        inp.setAttribute('accept', cfg.accept || '.pdf');
    }

    // Reset Dropzone & Display
    document.getElementById('tr-dropzone').classList.remove('hidden');
    document.getElementById('tr-file-info').classList.add('hidden');
    document.getElementById('tr-action-container').classList.add('hidden');

    const secFile = document.getElementById('tr-second-file-container');
    if (secFile) secFile.classList.add('hidden');

    // Render Options
    const optPanel = document.getElementById('tr-options-panel');
    if (optPanel) {
        optPanel.innerHTML = '';
        if (cfg.renderOptions) {
            cfg.renderOptions(optPanel);
            optPanel.classList.remove('hidden');
        } else {
            optPanel.classList.add('hidden');
        }
    }

    if (window.lucide) lucide.createIcons();
}

function selectSegmentedBtn(btn, groupId, val) {
    const group = document.getElementById(groupId);
    if (!group) return;
    group.querySelectorAll('.sejda-segmented-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    group.dataset.selected = val;
}

function toggleCompressMoreOptions() {
    const panel = document.getElementById('sejda-compress-more-opts');
    if (panel) {
        panel.classList.toggle('hidden');
    }
}

let cropPdfDoc = null;
let cropCurrentPage = 1;
let cropTotalPages = 1;
let cropUnit = 'cm';
let cropTargetMaxKb = null;
let cropTargetWidth = null;
let cropTargetHeight = null;
let cropLockRatio = false;
let cropAspectRatio = null;
let cropBox = { x: 30, y: 30, width: 400, height: 300 };
let cropPageNaturalWidth = 595;
let cropPageNaturalHeight = 842;
let cropCanvasScale = 1.0;
let isCropDragging = false;
let isCropResizing = false;
let isCropDrawing = false;
let cropResizeHandle = null;
let cropDragStart = { x: 0, y: 0 };
let cropDrawStart = { x: 0, y: 0 };
let cropBoxStart = { x: 0, y: 0, width: 0, height: 0 };

function getCropUnitFactor() {
    if (cropUnit === 'cm') return 28.3464567;
    if (cropUnit === 'mm') return 2.83464567;
    return 72.0; // inch
}

function parseCropPrompt(promptText) {
    if (!promptText || typeof promptText !== 'string') return null;
    const text = promptText.trim().toLowerCase();
    const result = {
        width: null,
        height: null,
        unit: 'cm',
        maxKb: null,
        label: ''
    };

    if (text.includes('passport')) {
        result.width = 3.5;
        result.height = 4.5;
        result.unit = 'cm';
        result.maxKb = 50;
        result.label = 'Passport Photo';
    } else if (text.includes('signature') || text.includes('sign') || text.includes('dastakhat')) {
        result.width = 4.0;
        result.height = 2.0;
        result.unit = 'cm';
        result.maxKb = 20;
        result.label = 'Signature';
    } else if (text.includes('pan') || text.includes('aadhaar') || text.includes('id card') || text.includes('voter')) {
        result.width = 8.5;
        result.height = 5.5;
        result.unit = 'cm';
        result.maxKb = 100;
        result.label = 'Govt ID / Card';
    } else if (text.includes('marksheet') || text.includes('certificate')) {
        result.width = 21.0;
        result.height = 29.7;
        result.unit = 'cm';
        result.maxKb = 200;
        result.label = 'Marksheet / Certificate';
    }

    const dimMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:x|×|\*|by)\s*(\d+(?:\.\d+)?)\s*(cm|mm|inch|in|px)?/i);
    if (dimMatch) {
        result.width = parseFloat(dimMatch[1]);
        result.height = parseFloat(dimMatch[2]);
        if (dimMatch[3]) {
            let u = dimMatch[3].toLowerCase();
            if (u === 'in') u = 'inch';
            result.unit = u;
        }
    } else {
        const wMatch = text.match(/(?:width|w|chaudaai)[:\s]+(\d+(?:\.\d+)?)\s*(cm|mm|inch|in|px)?/i);
        const hMatch = text.match(/(?:height|h|lambaai)[:\s]+(\d+(?:\.\d+)?)\s*(cm|mm|inch|in|px)?/i);
        if (wMatch) {
            result.width = parseFloat(wMatch[1]);
            if (wMatch[2]) result.unit = wMatch[2].toLowerCase() === 'in' ? 'inch' : wMatch[2].toLowerCase();
        }
        if (hMatch) {
            result.height = parseFloat(hMatch[1]);
            if (hMatch[2]) result.unit = hMatch[2].toLowerCase() === 'in' ? 'inch' : hMatch[2].toLowerCase();
        }
    }

    const kbMatch = text.match(/(?:under|max|less than|within|size|upto|up to|se kam|below|<=|<)?\s*(\d+(?:\.\d+)?)\s*(kb|k|mb)/i);
    if (kbMatch) {
        let val = parseFloat(kbMatch[1]);
        let u = kbMatch[2].toLowerCase();
        if (u === 'mb') val = val * 1024;
        result.maxKb = val;
    }

    return result;
}

function applyParsedCropRequirements(parsed) {
    if (!parsed) return;

    if (parsed.unit) {
        cropUnit = parsed.unit;
        const group = document.getElementById('crop-unit-group');
        if (group) {
            group.querySelectorAll('.sejda-segmented-btn').forEach(b => {
                b.classList.toggle('active', b.innerText.trim().toLowerCase() === cropUnit.toLowerCase());
            });
        }
    }

    if (parsed.maxKb) {
        cropTargetMaxKb = parsed.maxKb;
        const targetKbIn = document.getElementById('crop-target-kb');
        if (targetKbIn) targetKbIn.value = parsed.maxKb;
    }

    if (parsed.width && parsed.height) {
        cropTargetWidth = parsed.width;
        cropTargetHeight = parsed.height;
        cropAspectRatio = parsed.width / parsed.height;
        cropLockRatio = true;
        const lockCb = document.getElementById('crop-lock-ratio');
        if (lockCb) lockCb.checked = true;
    }

    const visualContainer = document.getElementById('crop-visual-editor-container');
    const isVisualOpen = visualContainer && !visualContainer.classList.contains('hidden');

    if (!isVisualOpen) {
        if (currentRunnerFile) {
            openCropVisualEditor();
        } else {
            const desc = `${parsed.width ? parsed.width + '×' + parsed.height + ' ' + parsed.unit : ''} ${parsed.maxKb ? '<= ' + parsed.maxKb + ' KB' : ''}`.trim();
            showToast(`Preset applied (${desc}). Please choose or drop your file!`, 'success');
        }
    } else {
        const canvas = document.getElementById('crop-stage-canvas');
        if (canvas && cropAspectRatio) {
            const maxH = canvas.height * 0.75;
            const maxW = canvas.width * 0.75;
            let boxH = maxH;
            let boxW = boxH * cropAspectRatio;
            if (boxW > maxW) {
                boxW = maxW;
                boxH = boxW / cropAspectRatio;
            }
            cropBox = {
                x: Math.round((canvas.width - boxW) / 2),
                y: Math.round((canvas.height - boxH) / 2),
                width: Math.round(boxW),
                height: Math.round(boxH)
            };
            updateCropVisualElements();
            updateCropInputsFromBox();
        }
        const desc = `${parsed.width ? parsed.width + '×' + parsed.height + ' ' + parsed.unit : ''} ${parsed.maxKb ? '<= ' + parsed.maxKb + ' KB' : ''}`.trim();
        showToast(`Govt requirement applied: ${desc}`, 'success');
    }
}

function applyCropPreset(presetKey) {
    let parsed = null;
    if (presetKey === 'passport_photo') {
        parsed = { width: 3.5, height: 4.5, unit: 'cm', maxKb: 50, label: 'Passport Photo' };
    } else if (presetKey === 'govt_signature') {
        parsed = { width: 4.0, height: 2.0, unit: 'cm', maxKb: 20, label: 'Govt Signature' };
    } else if (presetKey === 'id_card') {
        parsed = { width: 8.5, height: 5.5, unit: 'cm', maxKb: 100, label: 'Govt ID / PAN Card' };
    } else if (presetKey === 'marksheet_a4') {
        parsed = { width: 21.0, height: 29.7, unit: 'cm', maxKb: 200, label: 'Marksheet / Doc' };
    }

    if (parsed) {
        const input = document.getElementById('crop-prompt-input');
        if (input) input.value = `${parsed.label} ${parsed.width}x${parsed.height} ${parsed.unit} under ${parsed.maxKb}kb`;
        applyParsedCropRequirements(parsed);
    }
}

function applyCropPrompt() {
    const input = document.getElementById('crop-prompt-input');
    const text = input ? input.value : '';
    if (!text || !text.trim()) {
        showToast('Please type a requirement (e.g. "passport photo 3.5x4.5 cm under 50kb")', 'info');
        return;
    }
    const parsed = parseCropPrompt(text);
    if (!parsed || (!parsed.width && !parsed.maxKb)) {
        showToast('Could not detect dimensions or file size. E.g. try: "passport photo 3.5x4.5 cm under 50kb"', 'error');
        return;
    }
    applyParsedCropRequirements(parsed);
}

function toggleCropLockRatio(locked) {
    cropLockRatio = locked;
    if (cropLockRatio && (!cropAspectRatio || cropAspectRatio <= 0)) {
        if (cropBox.height > 0) {
            cropAspectRatio = cropBox.width / cropBox.height;
        }
    }
}

function onCropTargetKbChange(val) {
    const kb = parseFloat(val);
    cropTargetMaxKb = (kb && kb > 0) ? kb : null;
}

function selectCropMode(mode) {
    const grid = document.getElementById('crop-mode-grid');
    if (!grid) return;
    grid.dataset.selected = mode;
    ['automatic', 'max_crop', 'preview_select'].forEach(m => {
        const card = document.getElementById(`crop-card-${m}`);
        if (card) {
            if (m === mode) card.classList.add('active');
            else card.classList.remove('active');
        }
    });

    if (mode === 'preview_select') {
        openCropVisualEditor();
    }
}

async function openCropVisualEditor() {
    if (!currentRunnerFile) {
        showToast('Please select a PDF document first.', 'error');
        return;
    }

    const choiceContainer = document.getElementById('crop-options-choice-container');
    const visualContainer = document.getElementById('crop-visual-editor-container');
    if (choiceContainer && visualContainer) {
        choiceContainer.classList.add('hidden');
        visualContainer.classList.remove('hidden');
    }

    const nameSpan = document.getElementById('crop-visual-file-name');
    if (nameSpan) nameSpan.innerText = currentRunnerFile.name;

    try {
        const arrayBuffer = await currentRunnerFile.arrayBuffer();
        cropPdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        cropTotalPages = cropPdfDoc.numPages;
        cropCurrentPage = 1;
        cropBox = { x: 0, y: 0, width: 0, height: 0 };
        await renderCropStagePage(cropCurrentPage);
        initCropBoxInteraction();
        if (window.lucide) lucide.createIcons();
    } catch (err) {
        showToast('Failed to load PDF preview: ' + err.message, 'error');
    }
}

function closeCropVisualEditor() {
    const choiceContainer = document.getElementById('crop-options-choice-container');
    const visualContainer = document.getElementById('crop-visual-editor-container');
    if (choiceContainer && visualContainer) {
        visualContainer.classList.add('hidden');
        choiceContainer.classList.remove('hidden');
    }
    const grid = document.getElementById('crop-mode-grid');
    if (grid) {
        grid.dataset.selected = 'automatic';
        ['automatic', 'max_crop', 'preview_select'].forEach(m => {
            const card = document.getElementById(`crop-card-${m}`);
            if (card) {
                if (m === 'automatic') card.classList.add('active');
                else card.classList.remove('active');
            }
        });
    }
}

async function renderCropStagePage(pageNum) {
    if (!cropPdfDoc) return;
    cropCurrentPage = pageNum;
    const pageNumSpan = document.getElementById('crop-page-num-display');
    if (pageNumSpan) pageNumSpan.innerText = `Page ${cropCurrentPage} of ${cropTotalPages}`;

    const page = await cropPdfDoc.getPage(pageNum);
    const unscaledViewport = page.getViewport({ scale: 1.0 });
    cropPageNaturalWidth = unscaledViewport.width;
    cropPageNaturalHeight = unscaledViewport.height;

    const maxDisplayWidth = Math.min(680, Math.max(320, window.innerWidth - 60));
    cropCanvasScale = maxDisplayWidth / cropPageNaturalWidth;
    const viewport = page.getViewport({ scale: cropCanvasScale });

    const canvas = document.getElementById('crop-stage-canvas');
    if (!canvas) return;
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    canvas.style.width = `${canvas.width}px`;
    canvas.style.height = `${canvas.height}px`;

    const wrapper = document.getElementById('crop-stage-wrapper');
    if (wrapper) {
        wrapper.style.width = `${canvas.width}px`;
        wrapper.style.height = `${canvas.height}px`;
    }

    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport: viewport }).promise;

    if (!cropBox || cropBox.width <= 0) {
        if (cropAspectRatio && cropAspectRatio > 0) {
            const maxH = canvas.height * 0.75;
            const maxW = canvas.width * 0.75;
            let boxH = maxH;
            let boxW = boxH * cropAspectRatio;
            if (boxW > maxW) {
                boxW = maxW;
                boxH = boxW / cropAspectRatio;
            }
            cropBox = {
                x: Math.round((canvas.width - boxW) / 2),
                y: Math.round((canvas.height - boxH) / 2),
                width: Math.round(boxW),
                height: Math.round(boxH)
            };
        } else {
            const insetX = Math.round(canvas.width * 0.08);
            const insetY = Math.round(canvas.height * 0.08);
            cropBox = {
                x: insetX,
                y: insetY,
                width: canvas.width - (insetX * 2),
                height: canvas.height - (insetY * 2)
            };
        }
    } else {
        cropBox.x = Math.max(0, Math.min(canvas.width - 10, cropBox.x));
        cropBox.y = Math.max(0, Math.min(canvas.height - 10, cropBox.y));
        cropBox.width = Math.max(10, Math.min(canvas.width - cropBox.x, cropBox.width));
        cropBox.height = Math.max(10, Math.min(canvas.height - cropBox.y, cropBox.height));
    }

    const targetKbIn = document.getElementById('crop-target-kb');
    if (targetKbIn && cropTargetMaxKb) targetKbIn.value = cropTargetMaxKb;
    const lockCb = document.getElementById('crop-lock-ratio');
    if (lockCb) lockCb.checked = cropLockRatio;

    updateCropVisualElements();
    updateCropInputsFromBox();
}

function updateCropVisualElements() {
    const canvas = document.getElementById('crop-stage-canvas');
    const box = document.getElementById('crop-rect-box');
    const dimT = document.getElementById('crop-dim-top');
    const dimB = document.getElementById('crop-dim-bottom');
    const dimL = document.getElementById('crop-dim-left');
    const dimR = document.getElementById('crop-dim-right');

    if (!canvas || !box) return;

    const cw = canvas.width;
    const ch = canvas.height;

    box.style.left = `${cropBox.x}px`;
    box.style.top = `${cropBox.y}px`;
    box.style.width = `${cropBox.width}px`;
    box.style.height = `${cropBox.height}px`;

    if (dimT) {
        dimT.style.top = '0px';
        dimT.style.left = '0px';
        dimT.style.width = `${cw}px`;
        dimT.style.height = `${Math.max(0, cropBox.y)}px`;
    }
    if (dimB) {
        dimB.style.top = `${cropBox.y + cropBox.height}px`;
        dimB.style.left = '0px';
        dimB.style.width = `${cw}px`;
        dimB.style.height = `${Math.max(0, ch - (cropBox.y + cropBox.height))}px`;
    }
    if (dimL) {
        dimL.style.top = `${cropBox.y}px`;
        dimL.style.left = '0px';
        dimL.style.width = `${Math.max(0, cropBox.x)}px`;
        dimL.style.height = `${cropBox.height}px`;
    }
    if (dimR) {
        dimR.style.top = `${cropBox.y}px`;
        dimR.style.left = `${cropBox.x + cropBox.width}px`;
        dimR.style.width = `${Math.max(0, cw - (cropBox.x + cropBox.width))}px`;
        dimR.style.height = `${cropBox.height}px`;
    }
}

function updateCropInputsFromBox(skipField = null) {
    if (!cropCanvasScale || cropCanvasScale <= 0) return;
    const ptPerUnit = getCropUnitFactor();

    const leftPt = cropBox.x / cropCanvasScale;
    const topPt = cropBox.y / cropCanvasScale;
    const widthPt = cropBox.width / cropCanvasScale;
    const heightPt = cropBox.height / cropCanvasScale;
    const bottomPt = Math.max(0, cropPageNaturalHeight - (topPt + heightPt));
    const rightPt = Math.max(0, cropPageNaturalWidth - (leftPt + widthPt));

    const inTop = document.getElementById('crop-in-top');
    const inBottom = document.getElementById('crop-in-bottom');
    const inLeft = document.getElementById('crop-in-left');
    const inRight = document.getElementById('crop-in-right');
    const inWidth = document.getElementById('crop-in-width');
    const inHeight = document.getElementById('crop-in-height');

    if (inTop && skipField !== 'top') inTop.value = (topPt / ptPerUnit).toFixed(2);
    if (inBottom && skipField !== 'bottom') inBottom.value = (bottomPt / ptPerUnit).toFixed(2);
    if (inLeft && skipField !== 'left') inLeft.value = (leftPt / ptPerUnit).toFixed(2);
    if (inRight && skipField !== 'right') inRight.value = (rightPt / ptPerUnit).toFixed(2);
    if (inWidth && skipField !== 'width') inWidth.value = (widthPt / ptPerUnit).toFixed(2);
    if (inHeight && skipField !== 'height') inHeight.value = (heightPt / ptPerUnit).toFixed(2);
}

function onCropInputChange(changedField) {
    const ptPerUnit = getCropUnitFactor();
    const canvas = document.getElementById('crop-stage-canvas');
    if (!canvas || !cropCanvasScale) return;

    const W = cropPageNaturalWidth;
    const H = cropPageNaturalHeight;

    let curLeftPt = cropBox.x / cropCanvasScale;
    let curTopPt = cropBox.y / cropCanvasScale;
    let curWidthPt = cropBox.width / cropCanvasScale;
    let curHeightPt = cropBox.height / cropCanvasScale;
    let curRightPt = Math.max(0, W - (curLeftPt + curWidthPt));
    let curBottomPt = Math.max(0, H - (curTopPt + curHeightPt));

    const inVal = Math.max(0, parseFloat(document.getElementById(`crop-in-${changedField}`)?.value || '0')) * ptPerUnit;

    if (changedField === 'left') {
        const leftPt = Math.max(0, Math.min(W - 10, inVal));
        const widthPt = Math.max(10, W - leftPt - curRightPt);
        cropBox.x = leftPt * cropCanvasScale;
        cropBox.width = widthPt * cropCanvasScale;
    } else if (changedField === 'right') {
        const rightPt = Math.max(0, Math.min(W - 10, inVal));
        const widthPt = Math.max(10, W - curLeftPt - rightPt);
        cropBox.width = widthPt * cropCanvasScale;
    } else if (changedField === 'width') {
        const widthPt = Math.max(10, Math.min(W - curLeftPt, inVal));
        cropBox.width = widthPt * cropCanvasScale;
        if (cropLockRatio && cropAspectRatio) {
            const heightPt = Math.max(10, Math.min(H - curTopPt, widthPt / cropAspectRatio));
            cropBox.height = heightPt * cropCanvasScale;
        }
    } else if (changedField === 'top') {
        const topPt = Math.max(0, Math.min(H - 10, inVal));
        const heightPt = Math.max(10, H - topPt - curBottomPt);
        cropBox.y = topPt * cropCanvasScale;
        cropBox.height = heightPt * cropCanvasScale;
    } else if (changedField === 'bottom') {
        const bottomPt = Math.max(0, Math.min(H - 10, inVal));
        const heightPt = Math.max(10, H - curTopPt - bottomPt);
        cropBox.height = heightPt * cropCanvasScale;
    } else if (changedField === 'height') {
        const heightPt = Math.max(10, Math.min(H - curTopPt, inVal));
        cropBox.height = heightPt * cropCanvasScale;
        if (cropLockRatio && cropAspectRatio) {
            const widthPt = Math.max(10, Math.min(W - curLeftPt, heightPt * cropAspectRatio));
            cropBox.width = widthPt * cropCanvasScale;
        }
    }

    // Clamping to canvas bounds
    cropBox.x = Math.max(0, Math.min(canvas.width - 10, cropBox.x));
    cropBox.y = Math.max(0, Math.min(canvas.height - 10, cropBox.y));
    cropBox.width = Math.max(10, Math.min(canvas.width - cropBox.x, cropBox.width));
    cropBox.height = Math.max(10, Math.min(canvas.height - cropBox.y, cropBox.height));

    updateCropVisualElements();
    updateCropInputsFromBox(changedField);
}

function setCropUnit(btn, unit) {
    if (cropUnit === unit) return;
    cropUnit = unit;
    const group = document.getElementById('crop-unit-group');
    if (group) {
        group.querySelectorAll('.sejda-segmented-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    }
    updateCropInputsFromBox();
}

function setCropPreviewMode(btn, mode) {
    const group = document.getElementById('crop-preview-mode');
    if (group) {
        group.querySelectorAll('.sejda-segmented-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    }
    const nav = document.getElementById('crop-page-nav-bar');
    if (nav) {
        if (mode === 'page_by_page') nav.classList.remove('hidden');
        else nav.classList.add('hidden');
    }
}

async function changeCropPage(delta) {
    if (!cropPdfDoc) return;
    const target = cropCurrentPage + delta;
    if (target >= 1 && target <= cropTotalPages) {
        await renderCropStagePage(target);
    }
}

function performVisualAutoCrop() {
    const canvas = document.getElementById('crop-stage-canvas');
    if (!canvas) return;
    const insetX = Math.round(canvas.width * 0.10);
    const insetY = Math.round(canvas.height * 0.10);
    cropBox = {
        x: insetX,
        y: insetY,
        width: Math.max(20, canvas.width - (insetX * 2)),
        height: Math.max(20, canvas.height - (insetY * 2))
    };
    updateCropVisualElements();
    updateCropInputsFromBox();
    showToast('Auto-cropped to margins', 'info');
}

function initCropBoxInteraction() {
    const box = document.getElementById('crop-rect-box');
    const wrapper = document.getElementById('crop-stage-wrapper');
    const canvas = document.getElementById('crop-stage-canvas');
    if (!box || !wrapper || !canvas) return;

    // 1. Move existing box
    box.onmousedown = (e) => {
        if (e.target.classList.contains('crop-handle') || e.target.classList.contains('crop-edge')) return;
        e.preventDefault();
        e.stopPropagation();
        isCropDragging = true;
        cropDragStart = { x: e.clientX, y: e.clientY };
        cropBoxStart = { ...cropBox };
    };

    // 2. Resize via handles & edge bars
    box.querySelectorAll('.crop-handle, .crop-edge').forEach(handle => {
        handle.onmousedown = (e) => {
            e.preventDefault();
            e.stopPropagation();
            isCropResizing = true;
            cropResizeHandle = e.currentTarget.dataset.handle;
            cropDragStart = { x: e.clientX, y: e.clientY };
            cropBoxStart = { ...cropBox };
        };
    });

    // 3. Draw new crop box if clicking on wrapper outside box
    wrapper.onmousedown = (e) => {
        if (e.target.closest('#crop-rect-box')) return;
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const startX = Math.max(0, Math.min(canvas.width, e.clientX - rect.left));
        const startY = Math.max(0, Math.min(canvas.height, e.clientY - rect.top));

        isCropDrawing = true;
        cropDrawStart = { x: startX, y: startY };
        cropBox = { x: startX, y: startY, width: 0, height: 0 };
        updateCropVisualElements();
    };
}

document.addEventListener('mousemove', (e) => {
    if (!isCropDragging && !isCropResizing && !isCropDrawing) return;
    const canvas = document.getElementById('crop-stage-canvas');
    if (!canvas) return;

    const maxW = canvas.width;
    const maxH = canvas.height;

    if (isCropDrawing) {
        const rect = canvas.getBoundingClientRect();
        const curX = Math.max(0, Math.min(maxW, e.clientX - rect.left));
        const curY = Math.max(0, Math.min(maxH, e.clientY - rect.top));

        cropBox.x = Math.min(cropDrawStart.x, curX);
        cropBox.y = Math.min(cropDrawStart.y, curY);
        cropBox.width = Math.max(1, Math.abs(curX - cropDrawStart.x));
        cropBox.height = Math.max(1, Math.abs(curY - cropDrawStart.y));

        updateCropVisualElements();
        updateCropInputsFromBox();
        return;
    }

    const dx = e.clientX - cropDragStart.x;
    const dy = e.clientY - cropDragStart.y;

    if (isCropDragging) {
        let newX = cropBoxStart.x + dx;
        let newY = cropBoxStart.y + dy;
        newX = Math.max(0, Math.min(maxW - cropBox.width, newX));
        newY = Math.max(0, Math.min(maxH - cropBox.height, newY));
        cropBox.x = newX;
        cropBox.y = newY;
    } else if (isCropResizing) {
        let x = cropBoxStart.x;
        let y = cropBoxStart.y;
        let w = cropBoxStart.width;
        let h = cropBoxStart.height;

        if (cropResizeHandle.includes('e')) {
            w = Math.max(10, Math.min(maxW - x, cropBoxStart.width + dx));
        }
        if (cropResizeHandle.includes('s')) {
            h = Math.max(10, Math.min(maxH - y, cropBoxStart.height + dy));
        }
        if (cropResizeHandle.includes('w')) {
            const possibleX = Math.max(0, Math.min(cropBoxStart.x + cropBoxStart.width - 10, cropBoxStart.x + dx));
            w = cropBoxStart.width + (cropBoxStart.x - possibleX);
            x = possibleX;
        }
        if (cropResizeHandle.includes('n')) {
            const possibleY = Math.max(0, Math.min(cropBoxStart.y + cropBoxStart.height - 10, cropBoxStart.y + dy));
            h = cropBoxStart.height + (cropBoxStart.y - possibleY);
            y = possibleY;
        }

        if (cropLockRatio && cropAspectRatio) {
            if (['se', 'sw', 'ne', 'nw'].includes(cropResizeHandle)) {
                if (Math.abs(dx) > Math.abs(dy)) {
                    h = Math.max(10, Math.min(maxH - y, w / cropAspectRatio));
                } else {
                    w = Math.max(10, Math.min(maxW - x, h * cropAspectRatio));
                }
                if (cropResizeHandle.includes('w')) {
                    x = cropBoxStart.x + (cropBoxStart.width - w);
                }
                if (cropResizeHandle.includes('n')) {
                    y = cropBoxStart.y + (cropBoxStart.height - h);
                }
            }
        }

        cropBox = { x, y, width: w, height: h };
    }

    updateCropVisualElements();
    updateCropInputsFromBox();
});

document.addEventListener('mouseup', () => {
    if (isCropDrawing) {
        isCropDrawing = false;
        if (cropBox.width < 10 || cropBox.height < 10) {
            cropBox.width = Math.max(20, cropBox.width);
            cropBox.height = Math.max(20, cropBox.height);
            updateCropVisualElements();
            updateCropInputsFromBox();
        }
    }
    isCropDragging = false;
    isCropResizing = false;
    cropResizeHandle = null;
});

async function executeVisualCrop() {
    if (!currentRunnerFile) {
        showToast('Please select a file first.', 'error');
        return;
    }

    const topPt = cropBox.y / cropCanvasScale;
    const leftPt = cropBox.x / cropCanvasScale;
    const bottomPt = Math.max(0, cropPageNaturalHeight - ((cropBox.y + cropBox.height) / cropCanvasScale));
    const rightPt = Math.max(0, cropPageNaturalWidth - ((cropBox.x + cropBox.width) / cropCanvasScale));

    const formData = new FormData();
    formData.append('file', currentRunnerFile);
    formData.append('mode', 'preview_select');
    formData.append('top', topPt.toFixed(2));
    formData.append('bottom', bottomPt.toFixed(2));
    formData.append('left', leftPt.toFixed(2));
    formData.append('right', rightPt.toFixed(2));

    const targetKbInput = document.getElementById('crop-target-kb');
    const targetKb = targetKbInput ? parseFloat(targetKbInput.value) : (cropTargetMaxKb || null);
    if (targetKb && targetKb > 0) {
        formData.append('target_max_kb', targetKb.toString());
    }

    if (cropTargetWidth && cropTargetHeight) {
        formData.append('target_width', cropTargetWidth.toString());
        formData.append('target_height', cropTargetHeight.toString());
        formData.append('unit', cropUnit);
    }

    const msg = (targetKb && targetKb > 0) ? `Cropping & compressing to <= ${targetKb} KB...` : 'Cropping PDF according to your custom area...';
    const toast = showToast(msg, 'loading');
    try {
        const res = await fetch('/api/tools/crop', {
            method: 'POST',
            body: formData
        });

        toast.remove();
        if (!res.ok) {
            const errJson = await res.json().catch(() => ({}));
            throw new Error(errJson.detail || 'Crop failed');
        }

        const blob = await res.blob();
        let filename = 'cropped_document.pdf';
        const disp = res.headers.get('content-disposition');
        if (disp && disp.includes('filename=')) {
            const m = disp.match(/filename="?([^"]+)"?/);
            if (m) filename = m[1];
        }

        triggerDownload(blob, filename);
        showToast('PDF cropped successfully!', 'success');
        recordUserAction('Crop PDF', filename);
    } catch (err) {
        toast.remove();
        showToast(err.message, 'error');
    }
}

function clearSelectedRunnerFile() {
    currentRunnerFile = null;
    const inp = document.getElementById('tr-file-input');
    if (inp) inp.value = '';
    document.getElementById('tr-dropzone').classList.remove('hidden');
    document.getElementById('tr-file-info').classList.add('hidden');
    document.getElementById('tr-action-container').classList.add('hidden');
    const badge = document.getElementById('sejda-compress-file-badge');
    if (badge) badge.classList.add('hidden');
    const badgeCrop = document.getElementById('sejda-crop-file-badge');
    if (badgeCrop) badgeCrop.classList.add('hidden');
}

// Setup Runner File Input Listeners
const trDropzone = document.getElementById('tr-dropzone');
const trFileInput = document.getElementById('tr-file-input');

if (trDropzone && trFileInput) {
    trDropzone.addEventListener('click', (e) => {
        if (e.target.tagName !== 'LABEL' && e.target.tagName !== 'INPUT') {
            trFileInput.click();
        }
    });

    trDropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        trDropzone.classList.add('border-emerald-500', 'bg-emerald-50/40');
    });

    trDropzone.addEventListener('dragleave', () => {
        trDropzone.classList.remove('border-emerald-500', 'bg-emerald-50/40');
    });

    trDropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        trDropzone.classList.remove('border-emerald-500', 'bg-emerald-50/40');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleRunnerFileSelected(e.dataTransfer.files[0]);
        }
    });

    trFileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
            handleRunnerFileSelected(e.target.files[0]);
        }
    });
}

function handleRunnerFileSelected(file) {
    currentRunnerFile = file;
    document.getElementById('tr-file-name').innerText = file.name;
    document.getElementById('tr-file-size').innerText = (file.size / (1024 * 1024)).toFixed(2) + ' MB';

    document.getElementById('tr-dropzone').classList.add('hidden');

    if (currentActiveToolId === 'compress') {
        document.getElementById('tr-file-info').classList.add('hidden');
        document.getElementById('tr-action-container').classList.add('hidden');
        const badge = document.getElementById('sejda-compress-file-badge');
        const nameSpan = document.getElementById('sejda-compress-file-name');
        if (badge && nameSpan) {
            badge.classList.remove('hidden');
            nameSpan.innerText = file.name;
        }
    } else if (currentActiveToolId === 'crop') {
        document.getElementById('tr-file-info').classList.add('hidden');
        document.getElementById('tr-action-container').classList.add('hidden');
        const badge = document.getElementById('sejda-crop-file-badge');
        const nameSpan = document.getElementById('sejda-crop-file-name');
        if (badge && nameSpan) {
            badge.classList.remove('hidden');
            nameSpan.innerText = file.name;
        }
    } else {
        document.getElementById('tr-file-info').classList.remove('hidden');
        document.getElementById('tr-action-container').classList.remove('hidden');
    }
    showToast(`File "${file.name}" selected! Click to process.`, 'info');
}

async function executeCurrentToolAction() {
    if (!currentRunnerFile) {
        showToast('Please select a file first.', 'error');
        return;
    }

    if (currentActiveToolId === 'crop') {
        const grid = document.getElementById('crop-mode-grid');
        const mode = grid ? grid.dataset.selected : 'automatic';
        const visualContainer = document.getElementById('crop-visual-editor-container');
        const isVisualOpen = visualContainer && !visualContainer.classList.contains('hidden');

        if (isVisualOpen) {
            await executeVisualCrop();
            return;
        }

        if (mode === 'preview_select') {
            await openCropVisualEditor();
            return;
        }
    }

    const cfg = ALL_TOOLS_CONFIG[currentActiveToolId];
    if (!cfg) return;

    const formData = new FormData();
    if (currentActiveToolId === 'jpg-to-pdf') {
        formData.append('images', currentRunnerFile);
    } else if (currentActiveToolId !== 'alternate-mix') {
        formData.append('file', currentRunnerFile);
    }

    try {
        if (cfg.buildFormData) {
            cfg.buildFormData(formData);
        }
    } catch (err) {
        showToast(err.message, 'error');
        return;
    }

    const toast = showToast(`Processing document with ${cfg.title}...`, 'loading');
    try {
        const res = await fetch(cfg.endpoint, {
            method: 'POST',
            body: formData
        });

        toast.remove();
        if (!res.ok) {
            const errJson = await res.json().catch(() => ({}));
            throw new Error(errJson.detail || 'Processing failed');
        }

        const blob = await res.blob();
        let filename = 'processed_document.pdf';
        const disp = res.headers.get('content-disposition');
        if (disp && disp.includes('filename=')) {
            const m = disp.match(/filename="?([^"]+)"?/);
            if (m) filename = m[1];
        }

        triggerDownload(blob, filename);
        showToast(`${cfg.title} completed successfully!`, 'success');
        recordUserAction(cfg.title, filename);
    } catch (err) {
        toast.remove();
        showToast(err.message, 'error');
    }
}

// -------------------------------------------------------------
// Authentication & User State Module
// -------------------------------------------------------------
let currentUser = null;
let currentAuthTab = 'login';

function openAuthModal(tab = 'login') {
    const modal = document.getElementById('auth-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    switchAuthTab(tab);
    clearAuthAlert();
    if (window.lucide) lucide.createIcons();
}

function closeAuthModal() {
    const modal = document.getElementById('auth-modal');
    if (modal) modal.classList.add('hidden');
    clearAuthAlert();
}

function switchAuthTab(tab) {
    currentAuthTab = tab;
    const tabLogin = document.getElementById('tab-auth-login');
    const tabSignup = document.getElementById('tab-auth-signup');
    const fieldName = document.getElementById('auth-field-name');
    const btnText = document.getElementById('auth-btn-text');
    const pwdHint = document.getElementById('auth-pwd-hint');
    const switchPrompt = document.getElementById('auth-switch-prompt');

    clearAuthAlert();

    if (tab === 'login') {
        if (tabLogin) tabLogin.className = 'flex-1 py-3 text-center border-b-2 border-emerald-600 text-emerald-700 bg-white font-bold transition';
        if (tabSignup) tabSignup.className = 'flex-1 py-3 text-center border-b-2 border-transparent text-slate-500 hover:text-slate-800 transition';
        if (fieldName) fieldName.classList.add('hidden');
        if (pwdHint) pwdHint.classList.add('hidden');
        if (btnText) btnText.innerText = 'Sign in';
        if (switchPrompt) {
            switchPrompt.innerHTML = `Don't have an account? <a href="javascript:void(0)" onclick="switchAuthTab('signup')" class="text-emerald-600 font-bold hover:underline">Sign up for free</a>`;
        }
    } else {
        if (tabLogin) tabLogin.className = 'flex-1 py-3 text-center border-b-2 border-transparent text-slate-500 hover:text-slate-800 transition';
        if (tabSignup) tabSignup.className = 'flex-1 py-3 text-center border-b-2 border-emerald-600 text-emerald-700 bg-white font-bold transition';
        if (fieldName) fieldName.classList.remove('hidden');
        if (pwdHint) pwdHint.classList.remove('hidden');
        if (btnText) btnText.innerText = 'Create Account';
        if (switchPrompt) {
            switchPrompt.innerHTML = `Already have an account? <a href="javascript:void(0)" onclick="switchAuthTab('login')" class="text-emerald-600 font-bold hover:underline">Log in</a>`;
        }
    }
}

function showAuthAlert(msg, type = 'error') {
    const alert = document.getElementById('auth-alert');
    if (!alert) return;
    alert.classList.remove('hidden', 'bg-red-50', 'text-red-700', 'border-red-200', 'bg-emerald-50', 'text-emerald-700', 'border-emerald-200');
    if (type === 'error') {
        alert.classList.add('bg-red-50', 'text-red-700', 'border', 'border-red-200');
    } else {
        alert.classList.add('bg-emerald-50', 'text-emerald-700', 'border', 'border-emerald-200');
    }
    alert.innerText = msg;
}

function clearAuthAlert() {
    const alert = document.getElementById('auth-alert');
    if (alert) alert.classList.add('hidden');
}

async function handleAuthSubmit(e) {
    e.preventDefault();
    clearAuthAlert();

    const email = document.getElementById('auth-email')?.value.trim();
    const password = document.getElementById('auth-password')?.value.trim();
    const btn = document.getElementById('auth-submit-btn');

    if (!email || !password) {
        showAuthAlert('Please enter both email and password.');
        return;
    }

    if (btn) btn.disabled = true;

    try {
        if (currentAuthTab === 'signup') {
            const name = document.getElementById('auth-name')?.value.trim();
            if (!name) {
                showAuthAlert('Please enter your full name.');
                if (btn) btn.disabled = false;
                return;
            }

            const res = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, password })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Sign up failed');

            localStorage.setItem('docstudio_auth_token', data.token);
            currentUser = data.user;
            renderAuthHeaderState();
            closeAuthModal();
            showToast(`Welcome to DocStudio, ${data.user.name}!`, 'success');
        } else {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Login failed');

            localStorage.setItem('docstudio_auth_token', data.token);
            currentUser = data.user;
            renderAuthHeaderState();
            closeAuthModal();
            showToast(`Welcome back, ${data.user.name}!`, 'success');
        }
    } catch (err) {
        showAuthAlert(err.message);
    } finally {
        if (btn) btn.disabled = false;
    }
}

async function checkAuthState() {
    const token = localStorage.getItem('docstudio_auth_token');
    if (!token) {
        currentUser = null;
        renderAuthHeaderState();
        return;
    }

    try {
        const res = await fetch('/api/auth/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            const data = await res.json();
            currentUser = data.user;
        } else {
            localStorage.removeItem('docstudio_auth_token');
            currentUser = null;
        }
    } catch (err) {
        currentUser = null;
    }
    renderAuthHeaderState();
}

function renderAuthHeaderState() {
    const container = document.getElementById('nav-auth-container');
    if (!container) return;

    if (currentUser) {
        const initials = currentUser.name ? currentUser.name.split(' ').map(n => n[0]).join('').substring(0, 2) : 'U';
        container.innerHTML = `
            <div class="user-avatar-badge" onclick="toggleUserMenu(event)">
                <div class="user-avatar-circle">${initials}</div>
                <span class="text-xs font-bold text-slate-800 max-w-[100px] truncate">${currentUser.name}</span>
                <i data-lucide="chevron-down" class="w-3.5 h-3.5 text-slate-500"></i>
            </div>
            <div id="user-profile-dropdown" class="user-profile-menu hidden" onclick="event.stopPropagation()">
                <div class="p-3 border-b border-slate-100 bg-slate-50">
                    <p class="text-xs font-bold text-slate-800">${currentUser.name}</p>
                    <p class="text-[11px] text-slate-500 truncate">${currentUser.email}</p>
                </div>
                <div class="py-1">
                    <button type="button" onclick="openHistoryModal()" class="user-menu-item">
                        <i data-lucide="history" class="w-4 h-4 text-emerald-600"></i>
                        <span>My Document History</span>
                    </button>
                    <button type="button" onclick="logoutUser()" class="user-menu-item logout">
                        <i data-lucide="log-out" class="w-4 h-4"></i>
                        <span>Log out</span>
                    </button>
                </div>
            </div>
        `;
    } else {
        container.innerHTML = `
            <button onclick="openAuthModal('login')" class="hover:text-slate-900 font-semibold cursor-pointer text-slate-700 hover:text-emerald-600 transition flex items-center">
                Log in
            </button>
        `;
    }

    if (window.lucide) lucide.createIcons();
}

function toggleUserMenu(e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('user-profile-dropdown');
    if (menu) menu.classList.toggle('hidden');
}

document.addEventListener('click', (e) => {
    const menu = document.getElementById('user-profile-dropdown');
    if (menu && !menu.classList.contains('hidden') && !e.target.closest('#nav-auth-container')) {
        menu.classList.add('hidden');
    }
});

async function logoutUser() {
    const token = localStorage.getItem('docstudio_auth_token');
    if (token) {
        fetch('/api/auth/logout', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        }).catch(() => {});
    }
    localStorage.removeItem('docstudio_auth_token');
    currentUser = null;
    renderAuthHeaderState();
    showToast('Logged out successfully', 'info');
}

async function openHistoryModal() {
    const dropdown = document.getElementById('user-profile-dropdown');
    if (dropdown) dropdown.classList.add('hidden');

    const modal = document.getElementById('history-modal');
    if (!modal) return;
    modal.classList.remove('hidden');

    const userInfo = document.getElementById('history-user-info');
    if (userInfo && currentUser) {
        userInfo.innerText = `Activity for ${currentUser.name} (${currentUser.email})`;
    }

    const container = document.getElementById('history-list-container');
    if (!container) return;
    container.innerHTML = '<div class="text-center py-8 text-slate-400 text-sm">Loading your history...</div>';

    const token = localStorage.getItem('docstudio_auth_token');
    if (!token) {
        container.innerHTML = '<div class="text-center py-8 text-slate-400 text-sm">Please log in to see document history.</div>';
        return;
    }

    try {
        const res = await fetch('/api/auth/history', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.history && data.history.length > 0) {
            container.innerHTML = data.history.map(item => `
                <div class="history-item">
                    <div class="flex items-center space-x-3">
                        <div class="w-8 h-8 rounded bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">
                            <i data-lucide="file-check" class="w-4 h-4"></i>
                        </div>
                        <div>
                            <p class="text-xs font-bold text-slate-800">${item.filename}</p>
                            <p class="text-[11px] text-slate-500">Tool: <span class="font-semibold text-emerald-600">${item.tool_name}</span></p>
                        </div>
                    </div>
                    <div class="text-[11px] text-slate-400">${item.created_at}</div>
                </div>
            `).join('');
            if (window.lucide) lucide.createIcons();
        } else {
            container.innerHTML = `
                <div class="text-center py-10 space-y-2">
                    <div class="w-12 h-12 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
                        <i data-lucide="file-text" class="w-6 h-6"></i>
                    </div>
                    <p class="text-sm font-semibold text-slate-700">No documents processed yet</p>
                    <p class="text-xs text-slate-400">Use any PDF tool while logged in, and your activity will show here!</p>
                </div>
            `;
            if (window.lucide) lucide.createIcons();
        }
    } catch (err) {
        container.innerHTML = `<div class="text-center py-8 text-red-500 text-xs">Failed to load history: ${err.message}</div>`;
    }
}

function closeHistoryModal() {
    const modal = document.getElementById('history-modal');
    if (modal) modal.classList.add('hidden');
}

function recordUserAction(toolName, filename) {
    const token = localStorage.getItem('docstudio_auth_token');
    if (!token) return;
    fetch('/api/auth/record', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ tool_name: toolName, filename: filename })
    }).catch(() => {});
}

// Check user login status on script load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkAuthState);
} else {
    checkAuthState();
}


