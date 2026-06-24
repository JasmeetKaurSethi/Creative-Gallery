/**
 * My Creative Sandbox — Main JavaScript Application
 * Handles Zero-Local-Storage Cloud Gallery, Light Image Editing, Tag Filtering, and Cloud API Integrations.
 */

// ==========================================
// 1. STATE & INDEXEDDB OFFLINE STORAGE
// ==========================================
let currentTagFilter = 'all';

// Pre-loaded initial gallery data
let galleryData = [
    {
        id: 'art-1',
        title: 'Sunset Neon Euphoria',
        tag: '🎨 Painting',
        imageUrl: 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=600&q=80',
        timestamp: Date.now() - 10000000
    },
    {
        id: 'art-2',
        title: 'Late Night Coffee Doodles',
        tag: '✏️ Doodles',
        imageUrl: 'https://images.unsplash.com/photo-1583507198754-db9ceec2b347?auto=format&fit=crop&w=600&q=80',
        timestamp: Date.now() - 8000000
    }
];

// Offline Database Setup (Saves inside the app sandbox, NOT your phone's camera roll!)
const dbName = 'SandboxDB';
let db;

function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);
        request.onupgradeneeded = (e) => {
            const tempDb = e.target.result;
            if (!tempDb.objectStoreNames.contains('gallery')) {
                tempDb.createObjectStore('gallery', { keyPath: 'id' });
            }
        };
        request.onsuccess = (e) => {
            db = e.target.result;
            resolve();
        };
        request.onerror = (e) => reject(e.target.error);
    });
}

function loadFromDB() {
    return new Promise((resolve) => {
        const transaction = db.transaction('gallery', 'readonly');
        const store = transaction.objectStore('gallery');
        const request = store.getAll();
        request.onsuccess = () => {
            if (request.result && request.result.length > 0) {
                // Combine default data and saved DB data, avoiding duplicates
                const savedIds = new Set(request.result.map(item => item.id));
                const mergedData = [...request.result, ...galleryData.filter(item => !savedIds.has(item.id))];
                galleryData = mergedData.sort((a, b) => b.timestamp - a.timestamp);
            }
            resolve();
        };
    });
}

function saveToDB(item) {
    const transaction = db.transaction('gallery', 'readwrite');
    const store = transaction.objectStore('gallery');
    store.put(item);
}

// Editor active state
let editorState = {
    originalImageObj: null,
    rotation: 0,
    straightenAngle: 0,
    scale: 1,
    selectedTag: '🎨 Painting',
    title: ''
};

// ==========================================
// 2. DOM ELEMENT SELECTORS
// ==========================================
const galleryGrid = document.getElementById('gallery-grid');
const emptyState = document.getElementById('empty-state');
const tagsBar = document.getElementById('tags-bar');
const quickCameraBtn = document.getElementById('quick-camera-btn');
const cameraInput = document.getElementById('camera-input');

// Editor Modal DOM
const editorModal = document.getElementById('editor-modal');
const closeEditorBtn = document.getElementById('close-editor-btn');
const editCanvas = document.getElementById('edit-canvas');
const ctx = editCanvas.getContext('2d');

const rotateLeftBtn = document.getElementById('rotate-left-btn');
const rotateRightBtn = document.getElementById('rotate-right-btn');
const resetEditBtn = document.getElementById('reset-edit-btn');
const straightenSlider = document.getElementById('straighten-slider');
const angleDisplay = document.getElementById('angle-display');
const zoomSlider = document.getElementById('zoom-slider');
const zoomDisplay = document.getElementById('zoom-display');

const modalTagsSelector = document.getElementById('modal-tags-selector');
const artworkTitleInput = document.getElementById('artwork-title-input');
const uploadCloudBtn = document.getElementById('upload-cloud-btn');
const toastNotification = document.getElementById('toast-notification');

// ==========================================
// 3. GALLERY & RENDERING LOGIC
// ==========================================
function renderGallery() {
    const emptyStateEl = emptyState;
    galleryGrid.innerHTML = '';
    galleryGrid.appendChild(emptyStateEl);

    const filteredData = currentTagFilter === 'all' 
        ? galleryData 
        : galleryData.filter(item => item.tag === currentTagFilter);

    if (filteredData.length === 0) {
        emptyState.classList.remove('hidden');
    } else {
        emptyState.classList.add('hidden');
        filteredData.forEach(art => {
            const card = document.createElement('div');
            card.className = 'art-card';
            card.innerHTML = `
                <div class="art-image-container">
                    <img src="${art.imageUrl}" alt="${art.title}" class="art-image" loading="lazy">
                </div>
                <div class="art-info">
                    <span class="art-tag-badge" data-tag="${art.tag}">${art.tag}</span>
                    <h3 class="art-title" title="${art.title}">${art.title}</h3>
                </div>
            `;
            card.addEventListener('click', () => window.open(art.imageUrl, '_blank'));
            galleryGrid.appendChild(card);
        });
    }
}

tagsBar.addEventListener('click', (e) => {
    const button = e.target.closest('.tag-btn');
    if (!button) return;
    tagsBar.querySelectorAll('.tag-btn').forEach(btn => btn.classList.remove('active'));
    button.classList.add('active');
    currentTagFilter = button.getAttribute('data-tag');
    renderGallery();
});

// ==========================================
// 4. IN-APP CAMERA & CAPTURE
// ==========================================
quickCameraBtn.addEventListener('click', () => cameraInput.click());

cameraInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
        editorState.originalImageObj = img;
        editorState.rotation = 0;
        editorState.straightenAngle = 0;
        editorState.scale = 1;
        editorState.selectedTag = '🎨 Painting';
        
        straightenSlider.value = 0;
        angleDisplay.textContent = '0°';
        zoomSlider.value = 100;
        zoomDisplay.textContent = '100%';
        artworkTitleInput.value = '';
        
        modalTagsSelector.querySelectorAll('.modal-tag-btn').forEach((btn, index) => {
            btn.classList.toggle('active', index === 0);
        });

        editorModal.classList.remove('hidden');
        updateCanvas();
        URL.revokeObjectURL(url);
    };
    img.src = url;
    cameraInput.value = '';
});

// ==========================================
// 5. LIGHT IMAGE EDITING (CANVAS LOGIC)
// ==========================================
function updateCanvas() {
    const img = editorState.originalImageObj;
    if (!img) return;

    const targetSize = 800;
    editCanvas.width = targetSize;
    editCanvas.height = targetSize;

    ctx.save();
    ctx.translate(targetSize / 2, targetSize / 2);
    const totalRotation = editorState.rotation + editorState.straightenAngle;
    ctx.rotate((totalRotation * Math.PI) / 180);
    ctx.scale(editorState.scale, editorState.scale);

    const scaleCover = Math.max(targetSize / img.width, targetSize / img.height);
    const width = img.width * scaleCover;
    const height = img.height * scaleCover;

    ctx.drawImage(img, -width / 2, -height / 2, width, height);
    ctx.restore();
}

rotateLeftBtn.addEventListener('click', () => { editorState.rotation = (editorState.rotation - 90) % 360; updateCanvas(); });
rotateRightBtn.addEventListener('click', () => { editorState.rotation = (editorState.rotation + 90) % 360; updateCanvas(); });
resetEditBtn.addEventListener('click', () => {
    editorState.rotation = 0; editorState.straightenAngle = 0; editorState.scale = 1;
    straightenSlider.value = 0; angleDisplay.textContent = '0°';
    zoomSlider.value = 100; zoomDisplay.textContent = '100%';
    updateCanvas();
});

straightenSlider.addEventListener('input', (e) => {
    editorState.straightenAngle = parseInt(e.target.value, 10);
    angleDisplay.textContent = `${editorState.straightenAngle}°`;
    updateCanvas();
});

zoomSlider.addEventListener('input', (e) => {
    editorState.scale = parseInt(e.target.value, 10) / 100;
    zoomDisplay.textContent = `${e.target.value}%`;
    updateCanvas();
});

modalTagsSelector.addEventListener('click', (e) => {
    const button = e.target.closest('.modal-tag-btn');
    if (!button) return;
    modalTagsSelector.querySelectorAll('.modal-tag-btn').forEach(btn => btn.classList.remove('active'));
    button.classList.add('active');
    editorState.selectedTag = button.getAttribute('data-tag');
});

closeEditorBtn.addEventListener('click', () => editorModal.classList.add('hidden'));

// ==========================================
// 6. UPLOAD & OFFLINE SAVE LOGIC
// ==========================================
uploadCloudBtn.addEventListener('click', () => {
    uploadCloudBtn.disabled = true;
    uploadCloudBtn.innerHTML = `<span class="spinner">⏳</span> Saving to App...`;

    // Convert canvas to a Base64 string for easy offline storage
    const base64Image = editCanvas.toDataURL('image/jpeg', 0.85);
    
    const uniqueId = `art-${Date.now()}`;
    const title = artworkTitleInput.value.trim() || 'My Cute Creation';
    
    const newArt = {
        id: uniqueId,
        title: title,
        tag: editorState.selectedTag,
        imageUrl: base64Image,
        timestamp: Date.now()
    };

    // Save to Offline Database
    saveToDB(newArt);

    // Update UI Gallery
    galleryData.unshift(newArt);
    
    if (currentTagFilter !== 'all' && currentTagFilter !== newArt.tag) {
        currentTagFilter = newArt.tag;
        tagsBar.querySelectorAll('.tag-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-tag') === newArt.tag);
        });
    }

    renderGallery();

    editorModal.classList.add('hidden');
    uploadCloudBtn.disabled = false;
    uploadCloudBtn.innerHTML = `<span id="upload-btn-icon">🚀</span><span id="upload-btn-label">Save Directly to Cloud/App</span>`;

    toastNotification.classList.remove('hidden');
    setTimeout(() => toastNotification.classList.add('hidden'), 3500);
});

// ==========================================
// 7. INITIALIZE APP
// ==========================================
initDB().then(() => loadFromDB()).then(() => renderGallery());
