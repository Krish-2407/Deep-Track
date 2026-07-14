/**
 * Zen Module
 * Handles Zen Notes and Task List functionality.
 */
import { ZenStore } from '../data/zen-store.js';
// DOMPurify will be loaded via CDN script; use global DOMPurify

let selectedNoteColor = 'transparent';
let currentEditingNote = null;
let originalNoteData = null;

// DOM Elements (assigned during initZen)
let noteInput, noteTitle, saveNoteBtn, notesGrid, zenTaskInput, zenTaskList;
let noteModal, modalTitle, modalBody, modalDate, modalFormattingToolbar, modalEditActions, editNoteBtn, cancelEditBtn, saveEditBtn, closeModal;

export function initZen() {
  noteInput = document.getElementById('note-input');
  noteTitle = document.getElementById('note-title');
  saveNoteBtn = document.getElementById('save-note-btn');
  notesGrid = document.getElementById('notes-grid');
  zenTaskInput = document.getElementById('zen-task-input');
  zenTaskList = document.getElementById('zen-task-list');

  noteModal = document.getElementById('note-modal');
  modalTitle = document.getElementById('modal-note-title');
  modalBody = document.getElementById('modal-note-body');
  modalDate = document.getElementById('modal-note-date');
  modalFormattingToolbar = document.querySelector('.modal-formatting-toolbar');
  modalEditActions = document.querySelector('.modal-edit-actions');
  editNoteBtn = document.getElementById('edit-note-btn');
  cancelEditBtn = document.getElementById('cancel-edit-btn');
  saveEditBtn = document.getElementById('save-edit-btn');
  closeModal = document.getElementById('close-modal');

  // Initialize main editor toolbar
  initFormattingToolbar('.formatting-toolbar', '#note-input');

  // Update toolbar states when selection changes
  if (noteInput) {
    noteInput.addEventListener('keyup', () => {
      updateToolbarStates('.formatting-toolbar', '#note-input');
    });
    noteInput.addEventListener('mouseup', () => {
      updateToolbarStates('.formatting-toolbar', '#note-input');
    });
  }

  if (saveNoteBtn) {
    saveNoteBtn.addEventListener('click', () => {
      const title = noteTitle.value.trim();
      const content = sanitizeContent(noteInput.innerHTML.trim());
      if (!content && !title) return;

      const notes = ZenStore.getNotes();
      notes.push({
        id: Date.now().toString(),
        title: title || 'Untitled',
        content: content,
        color: selectedNoteColor,
        date: new Date().toISOString()
      });
      ZenStore.saveNotes(notes);
      noteTitle.value = '';
      noteInput.innerHTML = '';
      renderZenContent();
    });
  }

  document.querySelectorAll('.color-dot').forEach(dot => {
    dot.addEventListener('click', () => {
      const activeDot = document.querySelector('.color-dot.active');
      if (activeDot) activeDot.classList.remove('active');
      dot.classList.add('active');
      selectedNoteColor = dot.dataset.color;
    });
  });

  if (zenTaskInput) {
    zenTaskInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && zenTaskInput.value.trim()) {
        const tasks = ZenStore.getTasks();
        tasks.push({ id: Date.now().toString(), text: zenTaskInput.value.trim(), completed: false });
        ZenStore.saveTasks(tasks);
        zenTaskInput.value = '';
        renderZenContent();
      }
    });
  }

  // Modal Event Listeners
  if (editNoteBtn) {
    editNoteBtn.addEventListener('click', () => setModalEditMode());
  }

  if (cancelEditBtn) {
    cancelEditBtn.addEventListener('click', () => {
      modalTitle.value = originalNoteData.title || '';
      modalBody.innerHTML = sanitizeContent(originalNoteData.content || '');
      setModalViewMode();
    });
  }

  if (saveEditBtn) {
    saveEditBtn.addEventListener('click', () => {
      const notes = ZenStore.getNotes();
      const noteIndex = notes.findIndex(n => n.id === currentEditingNote.id);

      if (noteIndex !== -1) {
        const selectedColor = noteModal.querySelector('.color-dot.active')?.dataset.color || 'transparent';
        notes[noteIndex] = {
          ...notes[noteIndex],
          title: modalTitle.value.trim() || 'Untitled',
          content: sanitizeContent(modalBody.innerHTML.trim()),
          color: selectedColor
        };
        ZenStore.saveNotes(notes);
        renderZenContent();
      }
      setModalViewMode();
    });
  }

  noteModal?.querySelectorAll('.color-dot').forEach(dot => {
    dot.addEventListener('click', () => {
      noteModal.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
      dot.classList.add('active');
    });
  });

  closeModal?.addEventListener('click', () => {
    noteModal.classList.remove('active');
    currentEditingNote = null;
    originalNoteData = null;
  });

  modalBody?.addEventListener('click', handleNoteLinkClick);

  noteModal?.addEventListener('click', (e) => {
    if (e.target === noteModal) {
      noteModal.classList.remove('active');
      currentEditingNote = null;
      originalNoteData = null;
    }
  });

  // Re-expose global functions for inline onclick in renderZenContent
  window.deleteNote = (id, event) => {
    if (event) event.stopPropagation();
    const notes = ZenStore.getNotes();
    ZenStore.saveNotes(notes.filter(n => n.id !== id));
    renderZenContent();
  };

  window.toggleZenTask = (id) => {
    const tasks = ZenStore.getTasks();
    const task = tasks.find(t => t.id === id);
    if (task) task.completed = !task.completed;
    ZenStore.saveTasks(tasks);
    renderZenContent();
  };

  window.deleteZenTask = (id) => {
    const tasks = ZenStore.getTasks();
    ZenStore.saveTasks(tasks.filter(t => t.id !== id));
    renderZenContent();
  };

  window.openNoteModal = (note) => {
    if (!noteModal || !modalBody) return;
    currentEditingNote = note;
    originalNoteData = { ...note };

    modalTitle.value = note.title || '';
    modalBody.innerHTML = sanitizeContent(note.content || '');
    if (modalDate) modalDate.textContent = new Date(note.date).toLocaleDateString();

    setModalViewMode();
    noteModal.classList.add('active');
  };

  renderZenContent();
}

function sanitizeContent(content) {
  // Use globally available DOMPurify (loaded from CDN)
  const sanitized = DOMPurify.sanitize(content);
  const template = document.createElement('template');
  template.innerHTML = sanitized;

  template.content.querySelectorAll('a[href]').forEach((anchor) => {
    const href = anchor.getAttribute('href') || '';
    if (!isSafeExternalHref(href)) {
      anchor.replaceWith(document.createTextNode(anchor.textContent || href));
      return;
    }

    anchor.setAttribute('target', '_blank');
    anchor.setAttribute('rel', 'noopener noreferrer');
  });

  return template.innerHTML;
}

function isSafeExternalHref(href) {
  try {
    const url = new URL(href, 'https://deeptrack.local');
    return ['http:', 'https:', 'mailto:'].includes(url.protocol);
  } catch (error) {
    return false;
  }
}

function handleNoteLinkClick(event) {
  const link = event.target.closest('a[href]');
  if (!link) return;

  event.preventDefault();
  event.stopPropagation();

  const href = link.href;
  if (window.electronAPI?.openExternalUrl) {
    window.electronAPI.openExternalUrl(href).catch(() => {});
  } else {
    window.open(href, '_blank', 'noopener');
  }
}

function initFormattingToolbar(toolbarSelector, editorSelector) {
  const toolbar = document.querySelector(toolbarSelector);
  const editor = document.querySelector(editorSelector);
  if (!toolbar || !editor || toolbar.dataset.initialized) return;
  toolbar.dataset.initialized = 'true';

  toolbar.addEventListener('click', (e) => {
    const button = e.target.closest('.format-btn');
    if (!button) return;
    const command = button.dataset.command;
    document.execCommand(command, false, null);
    updateToolbarStates(toolbarSelector, editorSelector);
    editor.focus();
  });
}

function updateToolbarStates(toolbarSelector, editorSelector) {
  const toolbar = document.querySelector(toolbarSelector);
  const editor = document.querySelector(editorSelector);
  if (!toolbar || !editor) return;

  ['bold', 'italic', 'underline'].forEach(command => {
    const button = toolbar.querySelector(`[data-command="${command}"]`);
    if (button) {
      button.classList.toggle('active', document.queryCommandState(command));
    }
  });
}

function setModalViewMode() {
  modalTitle.readOnly = true;
  modalBody.contentEditable = false;
  modalFormattingToolbar?.classList.remove('active');
  if (modalEditActions) modalEditActions.style.display = 'none';
  if (editNoteBtn) editNoteBtn.style.display = 'block';

  noteModal?.querySelectorAll('.color-dot').forEach(dot => {
    dot.classList.toggle('active', dot.dataset.color === (currentEditingNote?.color || 'transparent'));
  });
}

function setModalEditMode() {
  modalTitle.readOnly = false;
  modalBody.contentEditable = true;
  modalFormattingToolbar?.classList.add('active');
  if (modalEditActions) modalEditActions.style.display = 'flex';
  if (editNoteBtn) editNoteBtn.style.display = 'none';

  initFormattingToolbar('.modal-formatting-toolbar', '#modal-note-body');
  
  modalBody.addEventListener('keyup', () => updateToolbarStates('.modal-formatting-toolbar', '#modal-note-body'));
  modalBody.addEventListener('mouseup', () => updateToolbarStates('.modal-formatting-toolbar', '#modal-note-body'));

  if (!modalTitle.value || modalTitle.value === 'Untitled') {
    modalTitle.focus();
    modalTitle.select();
  } else {
    modalBody.focus();
  }
}

export function renderZenContent() {
  const notes = ZenStore.getNotes();
  const tasks = ZenStore.getTasks();

  if (notesGrid) notesGrid.innerHTML = '';
  notes.slice().reverse().forEach(note => {
    const card = document.createElement('div');
    card.className = 'note-card';
    
    if (note.color !== 'transparent') {
      card.style.borderColor = `${note.color}40`; // 25% opacity border
      card.style.boxShadow = `0 4px 24px ${note.color}25`; // 15% opacity ambient glow
    } else {
      card.style.borderColor = 'rgba(255, 255, 255, 0.04)';
    }

    if (note.title && note.title !== 'Untitled') {
      const titleDiv = document.createElement('div');
      titleDiv.className = 'n-title';
      titleDiv.textContent = note.title;
      card.appendChild(titleDiv);
    }

    const contentDiv = document.createElement('div');
    contentDiv.className = 'n-content';
    contentDiv.innerHTML = sanitizeContent(note.content || '');
    contentDiv.addEventListener('click', handleNoteLinkClick);
    card.appendChild(contentDiv);

    const footer = document.createElement('div');
    footer.className = 'n-footer';
    const dateSpan = document.createElement('span');
    dateSpan.className = 'n-date';
    dateSpan.textContent = new Date(note.date).toLocaleDateString();
    const deleteButton = document.createElement('button');
    deleteButton.className = 'delete-note';
    deleteButton.textContent = 'Delete';
    deleteButton.onclick = (e) => {
      e.stopPropagation();
      window.deleteNote(note.id, e);
    };

    footer.appendChild(dateSpan);
    footer.appendChild(deleteButton);
    card.appendChild(footer);

    card.addEventListener('click', (e) => {
      if (!e.target.classList.contains('delete-note') && !e.target.closest('a[href]')) {
        window.openNoteModal(note);
      }
    });

    notesGrid.appendChild(card);
  });

  if (zenTaskList) {
    zenTaskList.innerHTML = '';
    tasks.forEach(task => {
      const li = document.createElement('li');
      li.className = `zen-task-item ${task.completed ? 'completed' : ''}`;

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = Boolean(task.completed);
      checkbox.addEventListener('change', () => window.toggleZenTask(task.id));

      const span = document.createElement('span');
      span.textContent = task.text;

      const deleteButton = document.createElement('button');
      deleteButton.className = 'delete-task';
      deleteButton.textContent = '✕';
      deleteButton.addEventListener('click', () => window.deleteZenTask(task.id));

      li.appendChild(checkbox);
      li.appendChild(span);
      li.appendChild(deleteButton);
      zenTaskList.appendChild(li);
    });
  }
}
