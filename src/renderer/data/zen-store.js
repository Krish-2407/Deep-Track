// Zen Notes & Tasks Store
function readStoredArray(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn(`[ZenStore] Failed to parse ${key}; resetting corrupt data.`, error);
    localStorage.removeItem(key);
    return [];
  }
}

export const ZenStore = {
  getNotes: () => readStoredArray('sm_zen_notes'),

  saveNotes: (notes) => {
    localStorage.setItem('sm_zen_notes', JSON.stringify(notes));
    window.dispatchEvent(new CustomEvent('zen-data-updated'));
  },

  getTasks: () => readStoredArray('sm_zen_tasks'),

  saveTasks: (tasks) => {
    localStorage.setItem('sm_zen_tasks', JSON.stringify(tasks));
    window.dispatchEvent(new CustomEvent('zen-data-updated'));
  },

  addNote: (note) => {
    const notes = ZenStore.getNotes();
    notes.unshift(note); // Newest first
    ZenStore.saveNotes(notes);
  },

  deleteNote: (id) => {
    const notes = ZenStore.getNotes().filter(n => n.id !== id);
    ZenStore.saveNotes(notes);
  },

  addTask: (task) => {
    const tasks = ZenStore.getTasks();
    tasks.push(task);
    ZenStore.saveTasks(tasks);
  },

  deleteTask: (id) => {
    const tasks = ZenStore.getTasks().filter(t => t.id !== id);
    ZenStore.saveTasks(tasks);
  }
};
