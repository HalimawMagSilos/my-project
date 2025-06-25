// src/main.ts

// Define ang base URL para sa ating backend API. Siguraduhin na tugma ito sa port ng backend (hal., 5000).
const API_BASE_URL = 'http://localhost:5000/api';

// Interface para sa Task object, na naglalarawan ng istraktura at uri nito.
interface Task {
    id: number; // Task ID mula sa MySQL, na isang number (auto-incremented)
    text: string;
    completed: boolean;
    userId: string; // Ang user ID na nauugnay sa task
    createdAt: number; // Timestamp ng paglikha ng task
}

// Global variable para mag-imbak ng user ID ng kasalukuyang user (simulated para sa demo na ito).
let currentUserId: string = '';

// Kumuha ng references sa iba't ibang HTML elements gamit ang kanilang IDs.
// Idinagdag ang mga check para sa posibleng nulls sa graceful na paraan sa unang pag-access ng DOM.
const userIdDisplay = document.getElementById('user-id') as HTMLSpanElement | null;
const newTaskInput = document.getElementById('new-task-input') as HTMLInputElement | null;
// --- KRITIKAL NA PAGBABAGO DITO ---
// Ang ID na ito ay DAPAT tumugma sa ID sa "Add Task" button ng iyong index.html.
const addPostButton = document.getElementById('add-task-button') as HTMLButtonElement | null;
// --- KATAPUSAN NG KRITIKAL NA PAGBABAGO ---
const taskList = document.getElementById('task-list') as HTMLUListElement | null;
const loadingIndicator = document.getElementById('loading-indicator') as HTMLDivElement | null;
const noTasksMessage = document.getElementById('no-tasks-message') as HTMLParagraphElement | null;

// Mga elemento para sa custom message box (ginagamit sa halip na native alert/confirm).
const messageBox = document.getElementById('message-box') as HTMLDivElement | null;
const messageBoxTitle = document.getElementById('message-box-title') as HTMLHeadingElement | null;
const messageBoxContent = document.getElementById('message-box-content') as HTMLParagraphElement | null;
const messageBoxConfirmButton = document.getElementById('message-box-confirm') as HTMLButtonElement | null;
const messageBoxCancelButton = document.getElementById('message-box-cancel') as HTMLButtonElement | null;

/**
 * Nagpapakita ng custom message box para sa mga alert o kumpirmasyon.
 * @param title - Ang pamagat ng message box.
 * @param message - Ang mensaheng nilalaman na ipapakita.
 * @param isConfirm - Kung totoo, kasama sa message box ang "Kanselahin" na button.
 * @returns Isang Promise<boolean> kung `isConfirm` ay totoo, kung hindi ay void.
 */
function showMessageBox(title: string, message: string, isConfirm: boolean = false): Promise<boolean> | void {
    // Kritikal: Suriin kung ang lahat ng elemento ng message box ay available
    if (!messageBox || !messageBoxTitle || !messageBoxContent || !messageBoxConfirmButton || !messageBoxCancelButton) {
        console.error('Isa o higit pang elemento ng message box ay hindi natagpuan sa DOM. Bumabalik sa native alerts.');
        // Fallback sa native alert/confirm kung nawawala ang mahahalagang elemento ng message box
        if (isConfirm) {
            return Promise.resolve(confirm(message));
        } else {
            alert(message);
            return;
        }
    }

    messageBoxTitle.textContent = title;
    messageBoxContent.textContent = message;

    // Linisin ang mga nakaraang event listener para maiwasan ang maraming trigger (mahalaga para sa confirm logic)
    // Gamit ang mga pinangalanang function para sa tamang pagtanggal
    const onConfirmHandler = () => {
        messageBox.classList.add('hidden');
        messageBoxConfirmButton.removeEventListener('click', onConfirmHandler);
        messageBoxCancelButton.removeEventListener('click', onCancelHandler);
        // @ts-ignore - Ang property na ito ay dynamically idinagdag para sa promise resolution
        if (messageBoxConfirmButton._resolve) messageBoxConfirmButton._resolve(true);
    };
    const onCancelHandler = () => {
        messageBox.classList.add('hidden');
        messageBoxConfirmButton.removeEventListener('click', onConfirmHandler);
        messageBoxCancelButton.removeEventListener('click', onCancelHandler);
        // @ts-ignore
        if (messageBoxCancelButton._resolve) messageBoxCancelButton._resolve(false);
    };

    messageBoxConfirmButton.removeEventListener('click', onConfirmHandler); // Tanggalin muna ang mga nakaraang handler
    messageBoxCancelButton.removeEventListener('click', onCancelHandler);

    if (isConfirm) {
        messageBoxCancelButton.classList.remove('hidden');
        messageBoxConfirmButton.textContent = 'Kumpirmahin';
        return new Promise((resolve) => {
            messageBoxConfirmButton.addEventListener('click', onConfirmHandler);
            messageBoxCancelButton.addEventListener('click', onCancelHandler);
            // Ikabit ang mga resolve function sa mga button para sa pag-access sa susunod
            // @ts-ignore
            messageBoxConfirmButton._resolve = resolve;
            // @ts-ignore
            messageBoxCancelButton._resolve = resolve;
        });
    } else {
        messageBoxCancelButton.classList.add('hidden'); // Itago ang cancel para sa mga alert
        messageBoxConfirmButton.textContent = 'OK';
        // Para sa simpleng alert, itago lang sa pag-click
        messageBoxConfirmButton.addEventListener('click', onConfirmHandler);
    }

    messageBox.classList.remove('hidden'); // Ipakita ang message box
}


/**
 * Isinasa-initialize ang frontend application.
 * Bumubuo ng natatanging user ID at sinisimulan ang proseso ng pagkuha ng mga task.
 */
function initializeApp() {
    // Kritikal: Suriin kung ang lahat ng pangunahing elemento ng DOM ay natagpuan bago magpatuloy.
    if (!userIdDisplay || !newTaskInput || !addPostButton || !taskList || !loadingIndicator || !noTasksMessage) {
        console.error('Isa o higit pang pangunahing elemento ng DOM ng application ay hindi natagpuan. Hindi maaaring isinasa-initialize ang app.');
        showMessageBox('Error sa Pag-initialize', 'Nawawala ang kinakailangang elemento ng application mula sa HTML. Paki-check ang console para sa mga detalye.', false);
        return; // Itigil ang pag-initialize kung nawawala ang mga kritikal na elemento
    }

    currentUserId = crypto.randomUUID(); // Bumuo ng simpleng natatanging ID para sa session na ito.
    userIdDisplay.textContent = currentUserId;

    // Magdagdag ng event listener sa input field at button.
    addPostButton.addEventListener('click', addTask);
    newTaskInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            addTask();
        }
    });

    fetchTasks(); // Kumuha ng mga task sa pag-load ng application.
}

/**
 * Nagre-render ng isang task item sa HTML list (#task-list).
 * @param task - Ang Task object na ire-render.
 */
function renderTask(task: Task) {
    // Siguraduhin na umiiral ang elemento ng taskList bago mag-render.
    if (!taskList) {
        console.error('Hindi natagpuan ang elemento ng listahan ng task, hindi maaaring mag-render ng task.');
        return;
    }

    const listItem = document.createElement('li');
    listItem.id = `task-${task.id}`;
    listItem.className = `flex items-center justify-between p-3 border border-gray-200 rounded-lg shadow-sm ${task.completed ? 'completed' : ''}`;

    const taskContent = document.createElement('div');
    taskContent.className = 'flex items-center flex-grow min-w-0';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = task.completed;
    checkbox.className = 'form-checkbox h-5 w-5 text-blue-600 rounded-md transition duration-150 ease-in-out';
    checkbox.addEventListener('change', async () => {
        await toggleTaskCompletion(task.id, checkbox.checked);
    });

    const taskText = document.createElement('span');
    taskText.className = `task-text ml-3 text-lg text-gray-800 break-words ${task.completed ? 'line-through text-gray-600' : ''}`;
    taskText.textContent = task.text;

    taskContent.appendChild(checkbox);
    taskContent.appendChild(taskText);

    const taskActions = document.createElement('div');
    taskActions.className = 'flex items-center space-x-2 ml-4 flex-shrink-0';

    const deleteButton = document.createElement('button');
    deleteButton.className = 'bg-red-500 text-white px-3 py-1 rounded-md hover:bg-red-600 transition duration-200 shadow';
    deleteButton.textContent = 'Tanggalin';
    deleteButton.addEventListener('click', async () => {
        // Tamang paghawak sa Promise mula sa showMessageBox
        const confirmed = await showMessageBox('Kumpirmahin ang Pagtanggal', `Sigurado ka bang gusto mong tanggalin ang "${task.text}"?`, true) as boolean | void;
        if (confirmed) { // Magpatuloy lang kung totoo ang confirmed (hindi undefined/void)
            await deleteTask(task.id);
        }
    });

    taskActions.appendChild(deleteButton);
    listItem.appendChild(taskContent);
    listItem.appendChild(taskActions);

    taskList.appendChild(listItem);
}

/**
 * Kumuha ng lahat ng task para sa kasalukuyang user mula sa backend API. (READ operation)
 */
async function fetchTasks() {
    // Suriin kung available ang mga kritikal na elemento bago subukang i-access ang kanilang classList
    if (!loadingIndicator || !taskList || !noTasksMessage) {
        console.error('Nawawala ang kinakailangang elemento para sa pagkuha ng task mula sa DOM.');
        showMessageBox('Error sa UI', 'Hindi maipakita ang loading state o listahan ng task dahil sa nawawalang HTML elements.', false);
        return; // Pigilan ang karagdagang errors
    }

    loadingIndicator.classList.remove('hidden'); // Ipakita ang loading indicator
    try {
        const response = await fetch(`${API_BASE_URL}/tasks?userId=${currentUserId}`);
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Nabigo ang pagkuha ng mga task');
        }
        const tasks: Task[] = await response.json();

        taskList.innerHTML = ''; // Linisin ang mga kasalukuyang task
        if (tasks.length === 0) {
            noTasksMessage.classList.remove('hidden'); // Ipakita ang walang task message
        } else {
            noTasksMessage.classList.add('hidden'); // Itago ang walang task message
            tasks.forEach(renderTask);
        }
    } catch (error: any) {
        console.error('Error sa pagkuha ng mga task:', error);
        showMessageBox('Error', `Nabigo ang pag-load ng mga task: ${error.message}. Siguraduhin na tumatakbo ang backend at tama ang pagka-configure.`);
    } finally {
        loadingIndicator.classList.add('hidden'); // Itago ang loading indicator
    }
}

/**
 * Nagdaragdag ng bagong task sa pamamagitan ng pagpapadala ng POST request sa backend API. (CREATE operation)
 */
async function addTask() {
    if (!newTaskInput) {
        console.error('Hindi natagpuan ang bagong elemento ng input ng task.');
        showMessageBox('Error', 'Hindi makapagdagdag ng task: nawawala ang input field mula sa HTML.', false);
        return;
    }

    const text = newTaskInput.value.trim();
    if (text === '') {
        showMessageBox('Kinakailangan ang Input', 'Paki-enter ng task bago magdagdag.', false);
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/tasks`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ text, userId: currentUserId })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Nabigo ang pagdagdag ng task');
        }

        newTaskInput.value = ''; // Linisin ang input pagkatapos ng matagumpay na pagdagdag
        await fetchTasks(); // I-refresh ang listahan ng task para ipakita ang bagong idinagdag na task
    } catch (error: any) {
        console.error('Error sa pagdagdag ng task:', error);
        showMessageBox('Error', `Nabigo ang pagdagdag ng task: ${error.message}.`);
    }
}

/**
 * Nagpapalit ng completion status ng task sa pamamagitan ng pagpapadala ng PUT request sa backend API. (UPDATE operation)
 * @param taskId - Ang ID ng task na i-a-update.
 * @param completed - Ang bagong completion status (boolean).
 */
async function toggleTaskCompletion(taskId: number, completed: boolean) {
    try {
        const response = await fetch(`${API_BASE_URL}/tasks/${taskId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ completed: completed, userId: currentUserId })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Nabigo ang pag-update ng task');
        }

        await fetchTasks(); // I-refresh ang listahan ng task para ipakita ang pagbabago
    } catch (error: any) {
        console.error('Error sa pag-update ng task:', error);
        showMessageBox('Error', `Nabigo ang pag-update ng task: ${error.message}.`);
    }
}

/**
 * Nagtatanggal ng task sa pamamagitan ng pagpapadala ng DELETE request sa backend API. (DELETE operation)
 * @param taskId - Ang ID ng task na tatanggalin.
 */
async function deleteTask(taskId: number) {
    try {
        const response = await fetch(`${API_BASE_URL}/tasks/${taskId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ userId: currentUserId })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Nabigo ang pagtanggal ng task');
        }

        await fetchTasks(); // I-refresh ang listahan ng task pagkatapos ng matagumpay na pagtanggal
    } catch (error: any) {
        console.error('Error sa pagtanggal ng task:', error);
        showMessageBox('Error', `Nabigo ang pagtanggal ng task: ${error.message}.`);
    }
}

// Isinasa-initialize ang application kapag na-load na ang buong HTML document.
// Ginagamit ang window.onload dito para masiguro na ang lahat ng resources (kasama ang mga larawan, kung mayroon) ay na-load.
// Para sa mga interaksyon lamang sa DOM, gagana rin ang 'DOMContentLoaded' at maaaring mas maaga mag-fire.
window.onload = initializeApp;
    