let saveData = null;
let uploadedFileName = '';
let innerFileName = '';
let editingItemId = null;
let pickerLeftId = null;
let pickerRightId = null;

// File upload
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const editor = document.getElementById('editor');

uploadArea.addEventListener('click', () => fileInput.click());
uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('dragover'); });
uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
uploadArea.addEventListener('drop', e => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) loadFile(file);
});
fileInput.addEventListener('change', e => {
    if (e.target.files[0]) loadFile(e.target.files[0]);
});

function getGzipFilename(bytes) {
    if (bytes[0] !== 0x1f || bytes[1] !== 0x8b || bytes[2] !== 8) return null;
    const flags = bytes[3];
    let offset = 10;
    if (flags & 4) {
        const xlen = bytes[offset] | (bytes[offset + 1] << 8);
        offset += 2 + xlen;
    }
    if (flags & 8) {
        let name = '';
        while (offset < bytes.length && bytes[offset] !== 0) {
            name += String.fromCharCode(bytes[offset]);
            offset++;
        }
        return name || null;
    }
    return null;
}

function loadFile(file) {
    uploadedFileName = file.name;
    const reader = new FileReader();
    reader.onload = function(e) {
        const arrayBuffer = e.target.result;
        const bytes = new Uint8Array(arrayBuffer);
        innerFileName = getGzipFilename(bytes) || uploadedFileName.replace(/\.ic$/i, '') + '.json';
        try {
            const decompressed = pako.inflate(bytes);
            const text = new TextDecoder().decode(decompressed);
            const data = JSON.parse(text);
            if (!data.items || !Array.isArray(data.items)) {
                alert('Invalid save file: missing "items" array');
                return;
            }
            saveData = data;
            if (!saveData.instances) saveData.instances = [];
            uploadArea.classList.add('hidden');
            editor.classList.remove('hidden');
            renderAll();
        } catch (err) {
            alert('Failed to parse file: ' + err.message);
        }
    };
    reader.readAsArrayBuffer(file);
}

// Rendering
const searchBar = document.getElementById('searchBar');
const itemList = document.getElementById('itemList');
const saveName = document.getElementById('saveName');
const statItems = document.getElementById('statItems');
const statRecipes = document.getElementById('statRecipes');

let searchFilter = '';
searchBar.addEventListener('input', () => {
    searchFilter = searchBar.value.toLowerCase();
    renderItems();
});

function renderAll() {
    saveName.textContent = 'Save: ' + (saveData.name || 'Untitled');
    renderItems();
    updateStats();
}

function getItem(id) {
    return saveData.items.find(i => i.id === id);
}

function getItemName(id) {
    const item = getItem(id);
    return item ? item.text : '???';
}

function getItemEmoji(id) {
    const item = getItem(id);
    return item ? item.emoji : '❓';
}

function renderItems() {
    const items = saveData.items;
    const filtered = searchFilter
        ? items.filter(i => i.text.toLowerCase().includes(searchFilter) || i.emoji.includes(searchFilter))
        : items;
    itemList.innerHTML = '';
    if (filtered.length === 0) {
        itemList.innerHTML = '<div class="empty-state">No items found</div>';
        return;
    }
    for (const item of filtered) {
        const card = document.createElement('div');
        card.className = 'item-card';
        const recipeStr = item.recipes && item.recipes.length
            ? item.recipes.map(r => {
                const a = getItemName(r[0]) || '???';
                const b = getItemName(r[1]) || '???';
                return a + ' + ' + b;
            }).join(', ')
            : '';
        card.innerHTML = `
            <span class="id-badge">#${item.id}</span>
            <span class="emoji">${item.emoji}</span>
            <span class="name">${item.text}</span>
            <span class="recipes-preview">${recipeStr}</span>
        `;
        card.addEventListener('click', () => openRecipeModal(item.id));
        itemList.appendChild(card);
    }
}

function updateStats() {
    const totalRecipes = saveData.items.reduce((sum, i) => sum + (i.recipes ? i.recipes.length : 0), 0);
    statItems.textContent = 'Items: ' + saveData.items.length;
    statRecipes.textContent = 'Recipes: ' + totalRecipes;
}

// Add new item
const btnAdd = document.getElementById('btnAdd');
const addForm = document.getElementById('addForm');
const btnConfirmAdd = document.getElementById('btnConfirmAdd');
const btnCancelAdd = document.getElementById('btnCancelAdd');
const newName = document.getElementById('newName');
const newEmoji = document.getElementById('newEmoji');

btnAdd.addEventListener('click', () => {
    addForm.classList.toggle('hidden');
    if (!addForm.classList.contains('hidden')) {
        newName.value = 'New Element';
        newEmoji.value = '❓';
        newName.focus();
    }
});

btnCancelAdd.addEventListener('click', () => addForm.classList.add('hidden'));

btnConfirmAdd.addEventListener('click', () => {
    const name = newName.value.trim() || 'New Element';
    const emoji = newEmoji.value.trim() || '❓';
    const maxId = saveData.items.reduce((m, i) => Math.max(m, i.id), -1);
    const newItem = { id: maxId + 1, text: name, emoji };
    saveData.items.push(newItem);
    saveData.updated = Date.now();
    addForm.classList.add('hidden');
    renderAll();
});

// Recipe Modal
const modalOverlay = document.getElementById('recipeModal');
const modalTitle = document.getElementById('modalTitle');
const modalInfo = document.getElementById('modalInfo');
const recipeTags = document.getElementById('recipeTags');
const pickerLeft = document.getElementById('pickerLeft');
const pickerRight = document.getElementById('pickerRight');
const pickerPreview = document.getElementById('pickerPreview');
const btnCloseModal = document.getElementById('btnCloseModal');
const btnConfirmRecipe = document.getElementById('btnConfirmRecipe');

btnCloseModal.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });

function closeModal() {
    modalOverlay.classList.remove('active');
    editingItemId = null;
    pickerLeftId = null;
    pickerRightId = null;
}

function openRecipeModal(itemId) {
    editingItemId = itemId;
    const item = getItem(itemId);
    if (!item) return;

    modalTitle.innerHTML = `✏️ Edit: ${item.emoji} ${item.text}`;
    modalInfo.innerHTML = `<span>ID: ${item.id}</span><span>Text: ${item.text}</span>`;

    const tags = document.getElementById('recipeTags');
    tags.innerHTML = '';
    if (item.recipes && item.recipes.length) {
        for (const r of item.recipes) {
            const tag = document.createElement('span');
            tag.className = 'recipe-tag';
            tag.textContent = `${getItemEmoji(r[0])} ${getItemName(r[0])} + ${getItemEmoji(r[1])} ${getItemName(r[1])}`;
            tags.appendChild(tag);
        }
    } else {
        tags.innerHTML = '<span style="color:#666;font-size:.85rem">No recipes defined</span>';
    }

    pickerLeftId = null;
    pickerRightId = null;
    renderPickers();
    pickerPreview.textContent = 'Select two ingredients';
    modalOverlay.classList.add('active');
}

function renderPickers() {
    const items = saveData.items;
    renderPickerList('pickerLeft', items, side => pickerLeftId = side, () => pickerLeftId, 'left');
    renderPickerList('pickerRight', items, side => pickerRightId = side, () => pickerRightId, 'right');
    updatePickerPreview();
}

function renderPickerList(containerId, items, setter, getter, side) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    for (const item of items) {
        const div = document.createElement('div');
        div.className = 'picker-item' + (getter() === item.id ? ' selected' : '');
        div.innerHTML = `<span class="emoji-sm">${item.emoji}</span> ${item.text} <span style="color:#555;font-size:.75rem">(#${item.id})</span>`;
        div.addEventListener('click', () => {
            setter(item.id);
            renderPickers();
        });
        container.appendChild(div);
    }
}

function updatePickerPreview() {
    if (pickerLeftId !== null && pickerRightId !== null) {
        const a = getItem(pickerLeftId);
        const b = getItem(pickerRightId);
        if (a && b) {
            pickerPreview.textContent = `${a.emoji} ${a.text}  +  ${b.emoji} ${b.text}`;
            return;
        }
    }
    pickerPreview.textContent = 'Select two ingredients';
}

btnConfirmRecipe.addEventListener('click', () => {
    if (pickerLeftId === null || pickerRightId === null) {
        alert('Please select two ingredients');
        return;
    }
    const item = getItem(editingItemId);
    if (!item) return;
    if (!item.recipes) item.recipes = [];
    const exists = item.recipes.some(r =>
        (r[0] === pickerLeftId && r[1] === pickerRightId) ||
        (r[0] === pickerRightId && r[1] === pickerLeftId)
    );
    if (exists) {
        alert('This recipe already exists');
        return;
    }
    item.recipes.push([pickerLeftId, pickerRightId]);
    saveData.updated = Date.now();
    renderAll();
    openRecipeModal(editingItemId);
});

// Download
const btnDownload = document.getElementById('btnDownload');
btnDownload.addEventListener('click', downloadSave);

function downloadSave() {
    if (!saveData) return;
    try {
        const jsonStr = JSON.stringify(saveData, null, 2);
        const encoded = new TextEncoder().encode(jsonStr);
        const compressed = pako.gzip(encoded, { filename: innerFileName });

        const blob = new Blob([compressed], { type: 'application/gzip' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const downloadName = uploadedFileName.replace(/\.[^.]+$/, '') + '.ic';
        a.download = downloadName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (err) {
        alert('Download failed: ' + err.message);
    }
}
