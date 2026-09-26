// DocStudio - PPT Slide Studio Designer

let presentationData = {
    title: "Project Presentation",
    theme: "modern_blue",
    currentSlideIndex: 0,
    slides: [
        {
            title: "Welcome to DocStudio",
            subtitle: "Modern Web-Based Presentation Designer",
            bullets: [
                "Create, edit, and style presentation slides in your browser",
                "Export directly into genuine Microsoft PowerPoint (.pptx) format",
                "Full support for color themes, bullet hierarchy, and notes"
            ]
        },
        {
            title: "Key Features & Capabilities",
            subtitle: "All-in-One Productivity",
            bullets: [
                "Bidirectional PDF and PowerPoint conversion engine",
                "Integrated PDF annotation, digital signatures, and page tools",
                "Deployable to Render.com with 1-click cloud setup"
            ]
        }
    ]
};

// Initialize PPT Studio
function initPptStudio() {
    renderSlideThumbnails();
    loadSlideIntoEditor(presentationData.currentSlideIndex);
}

// Render Left Sidebar Slide Thumbnails
function renderSlideThumbnails() {
    const container = document.getElementById('slide-thumbs-container');
    const badge = document.getElementById('slide-count-badge');
    if (!container) return;

    badge.innerText = `${presentationData.slides.length} Slide${presentationData.slides.length > 1 ? 's' : ''}`;
    container.innerHTML = '';

    presentationData.slides.forEach((slide, idx) => {
        const thumb = document.createElement('div');
        const isActive = idx === presentationData.currentSlideIndex;
        thumb.className = `slide-thumb ${isActive ? 'active' : ''}`;
        thumb.onclick = () => selectSlide(idx);

        thumb.innerHTML = `
            <div class="flex items-center justify-between mb-1">
                <span class="text-xs font-bold text-slate-400">#${idx + 1}</span>
                <span class="text-[10px] text-slate-400 truncate max-w-[120px]">${slide.subtitle || ''}</span>
            </div>
            <p class="text-xs font-semibold text-slate-800 truncate">${slide.title || 'Untitled Slide'}</p>
        `;

        container.appendChild(thumb);
    });
}

// Select Slide
function selectSlide(index) {
    if (index >= 0 && index < presentationData.slides.length) {
        presentationData.currentSlideIndex = index;
        renderSlideThumbnails();
        loadSlideIntoEditor(index);
    }
}

// Load slide data into editor form & live preview
function loadSlideIntoEditor(index) {
    const slide = presentationData.slides[index];
    if (!slide) return;

    // Form inputs
    document.getElementById('input-slide-title').value = slide.title || '';
    document.getElementById('input-slide-subtitle').value = slide.subtitle || '';
    document.getElementById('input-slide-bullets').value = (slide.bullets || []).join('\n');

    // Update Live Preview Canvas
    updateLivePreview(slide, index);
}

// Update Live Preview Card
function updateLivePreview(slide, index) {
    const previewTitle = document.getElementById('preview-title');
    const previewSubtitle = document.getElementById('preview-subtitle');
    const previewBullets = document.getElementById('preview-bullets-list');
    const previewHeader = document.getElementById('slide-preview-header');
    const previewCard = document.getElementById('slide-canvas-card');
    const indexLabel = document.getElementById('preview-index-label');
    const themeLabel = document.getElementById('preview-theme-label');

    previewTitle.innerText = slide.title || 'Untitled Slide';
    previewSubtitle.innerText = slide.subtitle || '';
    indexLabel.innerText = `Slide ${index + 1} of ${presentationData.slides.length}`;
    themeLabel.innerText = `Theme: ${getThemeDisplayName(presentationData.theme)}`;

    // Bullets list
    previewBullets.innerHTML = '';
    const bullets = slide.bullets || [];
    if (bullets.length === 0) {
        previewBullets.innerHTML = '<li class="text-slate-400 italic">No bullet points added yet.</li>';
    } else {
        bullets.forEach(b => {
            const li = document.createElement('li');
            li.className = 'flex items-start';
            li.innerHTML = `<span class="mr-2 font-bold select-none">•</span> <span>${escapeHtml(b)}</span>`;
            previewBullets.appendChild(li);
        });
    }

    // Apply theme styling
    applyThemeStyles(presentationData.theme, previewCard, previewHeader, previewTitle, previewBullets);
}

// Theme display name helper
function getThemeDisplayName(t) {
    const map = {
        modern_blue: "Modern Blue",
        emerald: "Emerald Pitch",
        purple: "Vibrant Purple",
        dark: "Dark Tech"
    };
    return map[t] || "Modern Blue";
}

// Helper: Escape HTML
function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Apply theme to DOM
function applyThemeStyles(theme, card, header, title, bullets) {
    // Reset styles
    card.className = "w-full aspect-video rounded-2xl border shadow-xl p-8 flex flex-col justify-between relative overflow-hidden transition-all ";
    header.className = "p-4 rounded-xl border mb-4 ";

    if (theme === 'modern_blue') {
        card.classList.add('bg-white', 'border-slate-200');
        header.classList.add('bg-blue-50', 'border-blue-100');
        title.className = "text-2xl font-bold text-blue-600";
        bullets.className = "space-y-2 text-slate-700 text-base font-medium";
    } else if (theme === 'emerald') {
        card.classList.add('bg-white', 'border-slate-200');
        header.classList.add('bg-emerald-50', 'border-emerald-100');
        title.className = "text-2xl font-bold text-emerald-600";
        bullets.className = "space-y-2 text-slate-700 text-base font-medium";
    } else if (theme === 'purple') {
        card.classList.add('bg-white', 'border-slate-200');
        header.classList.add('bg-purple-50', 'border-purple-100');
        title.className = "text-2xl font-bold text-purple-600";
        bullets.className = "space-y-2 text-slate-700 text-base font-medium";
    } else if (theme === 'dark') {
        card.classList.add('bg-slate-900', 'border-slate-800');
        header.classList.add('bg-slate-800', 'border-slate-700');
        title.className = "text-2xl font-bold text-cyan-400";
        bullets.className = "space-y-2 text-slate-200 text-base font-medium";
    }
}

// Sync Editor Inputs to Data Model
function updateCurrentSlide() {
    const slide = presentationData.slides[presentationData.currentSlideIndex];
    if (!slide) return;

    slide.title = document.getElementById('input-slide-title').value;
    slide.subtitle = document.getElementById('input-slide-subtitle').value;
    
    const bulletsRaw = document.getElementById('input-slide-bullets').value;
    slide.bullets = bulletsRaw.split('\n').filter(line => line.trim().length > 0);

    // Update Live Preview and Thumbnails
    updateLivePreview(slide, presentationData.currentSlideIndex);
    renderSlideThumbnails();
}

// Add New Slide
function addSlide() {
    const newSlide = {
        title: `New Slide ${presentationData.slides.length + 1}`,
        subtitle: "",
        bullets: ["Add points, ideas or milestones here."]
    };
    presentationData.slides.push(newSlide);
    presentationData.currentSlideIndex = presentationData.slides.length - 1;
    renderSlideThumbnails();
    loadSlideIntoEditor(presentationData.currentSlideIndex);
    showToast('New slide added!', 'info');
}

// Delete Current Slide
function deleteCurrentSlide() {
    if (presentationData.slides.length <= 1) {
        showToast('Presentation must have at least 1 slide.', 'error');
        return;
    }
    presentationData.slides.splice(presentationData.currentSlideIndex, 1);
    if (presentationData.currentSlideIndex >= presentationData.slides.length) {
        presentationData.currentSlideIndex = presentationData.slides.length - 1;
    }
    renderSlideThumbnails();
    loadSlideIntoEditor(presentationData.currentSlideIndex);
    showToast('Slide deleted', 'info');
}

// Change Theme
function changeTheme(newTheme) {
    presentationData.theme = newTheme;
    updateLivePreview(
        presentationData.slides[presentationData.currentSlideIndex],
        presentationData.currentSlideIndex
    );
}

// Export Genuine .PPTX file
async function exportPresentation() {
    const toast = showToast('Generating .PPTX presentation file...', 'loading');
    try {
        const payload = {
            title: presentationData.title,
            theme: presentationData.theme,
            slides: presentationData.slides
        };

        const response = await fetch('/api/ppt/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        toast.remove();
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || 'Presentation creation failed');
        }

        const blob = await response.blob();
        triggerDownload(blob, `${presentationData.title.replace(/\s+/g, '_')}.pptx`);
        showToast('Presentation .PPTX downloaded successfully!', 'success');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', initPptStudio);
