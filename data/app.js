// ESP32 GPIO Controller - Веб-интерфейс
// Version: 1.0.0

// WebSocket соединение
let ws = null;
let currentConfig = { pins: [] };
let availablePins = [];
let pendingAction = null;

// ==================== ОСНОВНЫЕ ФУНКЦИИ ====================

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    console.log('ESP32 GPIO Controller initialized');
    
    // Инициализация WebSocket
    initWebSocket();
    
    // Загрузка конфигурации
    loadPinConfig();
    
    // Загрузка доступных пинов
    updateAvailablePins();
    
    // Показываем первую вкладку
    showTab('inputs');
    
    // Настройка обработчиков событий
    setupEventListeners();
});

// Обновление статуса соединения
function updateConnectionStatus(connected) {
    const statusElement = document.getElementById('connection-status');
    if (statusElement) {
        statusElement.textContent = connected ? '✅ Подключено' : '🔌 Отключено';
        statusElement.className = `connection-status ${connected ? 'connected' : 'disconnected'}`;
    }
}

// В функции initWebSocket обновите обработчики:
ws.onopen = function() {
    console.log('WebSocket connected');
    updateConnectionStatus(true);
    // ... остальной код
};

ws.onclose = function() {
    console.log('WebSocket disconnected');
    updateConnectionStatus(false);
    setTimeout(initWebSocket, 2000);
};

ws.onerror = function(error) {
    console.error('WebSocket error:', error);
    updateConnectionStatus(false);
};

// Настройка обработчиков событий
function setupEventListeners() {
    // Форма WiFi
    const wifiForm = document.getElementById('wifi-form');
    if (wifiForm) {
        wifiForm.addEventListener('submit', saveWiFiConfig);
    }
    
    // Кнопка проверки IP
    const checkIpBtn = document.getElementById('check-ip-btn');
    if (checkIpBtn) {
        checkIpBtn.addEventListener('click', checkCurrentIP);
    }
    
    // Переключение типа пина
    const pinTypeSelect = document.getElementById('pin-type');
    if (pinTypeSelect) {
        pinTypeSelect.addEventListener('change', togglePinOptions);
    }
    
    // Кнопка добавления пина
    const addPinBtn = document.getElementById('add-pin-btn');
    if (addPinBtn) {
        addPinBtn.addEventListener('click', addPinConfig);
    }
    
    // Статический IP
    const staticIpCheckbox = document.getElementById('use-static');
    if (staticIpCheckbox) {
        staticIpCheckbox.addEventListener('change', toggleStaticIP);
    }
}

// ==================== УПРАВЛЕНИЕ ВКЛАДКАМИ ====================

// Переключение вкладок
function showTab(tabName) {
    // Скрыть все вкладки
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Показать выбранную вкладку
    const tabElement = document.getElementById(tabName);
    if (tabElement) {
        tabElement.classList.add('active');
    }
    
    // Обновить навигацию
    document.querySelectorAll('nav a').forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('onclick')?.includes(tabName)) {
            link.classList.add('active');
        }
    });
}

// ==================== WEBSOCKET ====================

// Инициализация WebSocket
function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.hostname}:81/ws`;
    
    console.log('Connecting to WebSocket:', wsUrl);
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = function() {
        console.log('WebSocket connected');
        
        // Запросить текущие состояния после подключения
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ action: 'getStates' }));
        }
    };
    
    ws.onmessage = function(event) {
        try {
            const data = JSON.parse(event.data);
            console.log('WebSocket message:', data);
            
            // Обработка обновления состояния пина
            if (data.pin !== undefined && data.val !== undefined) {
                updatePinStatus(data.pin, data.val);
            }
            
            // Обработка других сообщений
            if (data.type === 'info') {
                updateSystemInfo(data);
            }
        } catch (error) {
            console.error('Error parsing WebSocket message:', error, event.data);
        }
    };
    
    ws.onclose = function() {
        console.log('WebSocket disconnected, reconnecting in 2s...');
        setTimeout(initWebSocket, 2000);
    };
    
    ws.onerror = function(error) {
        console.error('WebSocket error:', error);
    };
}

// Обновление статуса пина
function updatePinStatus(pin, value) {
    const pinValue = value ? 1 : 0;
    
    // Обновление на вкладке входов
    const inputElement = document.querySelector(`.input-status[data-pin="${pin}"]`);
    if (inputElement) {
        const indicator = inputElement.querySelector('.status-indicator');
        if (indicator) {
            indicator.className = `status-indicator ${pinValue ? 'status-high' : 'status-low'}`;
            indicator.title = pinValue ? 'HIGH' : 'LOW';
        }
        
        const valueText = inputElement.querySelector('.pin-value');
        if (valueText) {
            valueText.textContent = pinValue ? 'HIGH' : 'LOW';
        }
    }
    
    // Обновление на вкладке выходов
    const outputElement = document.querySelector(`.output-control[data-pin="${pin}"]`);
    if (outputElement) {
        const button = outputElement.querySelector('button');
        if (button) {
            button.textContent = pinValue ? 'Выключить' : 'Включить';
            button.className = `output-button ${pinValue ? 'primary' : 'secondary'}`;
        }
        
        const stateText = outputElement.querySelector('.pin-state');
        if (stateText) {
            stateText.textContent = pinValue ? 'ВКЛ' : 'ВЫКЛ';
        }
    }
    
    // Обновление в таблице конфигурации (если есть)
    const tableRow = document.querySelector(`#gpio-table tr[data-pin="${pin}"]`);
    if (tableRow) {
        const statusCell = tableRow.querySelector('.pin-status');
        if (statusCell) {
            statusCell.textContent = pinValue ? 'HIGH' : 'LOW';
            statusCell.className = `pin-status ${pinValue ? 'status-high' : 'status-low'}`;
        }
    }
}

// Управление выходом
function toggleOutput(pin) {
    const outputElement = document.querySelector(`.output-control[data-pin="${pin}"]`);
    if (!outputElement) return;
    
    const button = outputElement.querySelector('button');
    if (!button) return;
    
    // Определяем текущее состояние по тексту кнопки
    const currentState = button.textContent === 'Включить' ? 0 : 1;
    const newState = currentState === 0 ? 1 : 0;
    
    // Отправляем команду через WebSocket
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ 
            pin: parseInt(pin), 
            val: newState 
        }));
        console.log(`Toggling pin ${pin} to ${newState}`);
    } else {
        console.error('WebSocket not connected');
        alert('WebSocket не подключен. Обновите страницу.');
    }
}

// ==================== ЗАГРУЗКА КОНФИГУРАЦИИ ====================

// Загрузка конфигурации пинов
async function loadPinConfig() {
    try {
        console.log('Loading pin configuration...');
        const response = await fetch('/api/config');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const config = await response.json();
        console.log('Loaded config:', config);
        
        // Проверяем структуру ответа
        if (config && Array.isArray(config.pins)) {
            currentConfig = config;
            renderPinConfig();
            updateStatusDisplays();
        } else {
            console.warn('Invalid config format, using empty config');
            currentConfig = { pins: [] };
        }
    } catch (error) {
        console.error('Error loading config:', error);
        currentConfig = { pins: [] };
        showError('Не удалось загрузить конфигурацию. Проверьте подключение.');
    }
}

// Загрузка доступных пинов
async function updateAvailablePins() {
    try {
        console.log('Loading available pins...');
        const response = await fetch('/api/available-pins');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Available pins response:', data);
        
        // Обрабатываем разные форматы ответа
        if (data && Array.isArray(data)) {
            // Если ответ - массив
            availablePins = data;
        } else if (data && data.pins && Array.isArray(data.pins)) {
            // Если ответ - объект с полем pins
            availablePins = data.pins;
        } else {
            console.warn('Unexpected response format:', data);
            availablePins = [];
        }
        
        // Обновляем выпадающий список
        updatePinSelect();
    } catch (error) {
        console.error('Error loading available pins:', error);
        availablePins = [];
        showError('Не удалось загрузить список доступных пинов.');
    }
}

// Обновление выпадающего списка пинов
function updatePinSelect() {
    const select = document.getElementById('pin-select');
    if (!select) return;
    
    // Очищаем список
    select.innerHTML = '<option value="">Выберите пин...</option>';
    
    // Добавляем доступные пины
    if (Array.isArray(availablePins)) {
        availablePins.forEach(pin => {
            const option = document.createElement('option');
            option.value = pin;
            option.textContent = `GPIO ${pin}`;
            select.appendChild(option);
        });
    }
    
    // Если нет доступных пинов
    if (availablePins.length === 0) {
        const option = document.createElement('option');
        option.value = "";
        option.textContent = "Нет доступных пинов";
        option.disabled = true;
        select.appendChild(option);
    }
}

// ==================== ОТОБРАЖЕНИЕ КОНФИГУРАЦИИ ====================

// Отрисовка конфигурации пинов
function renderPinConfig() {
    if (!currentConfig.pins || !Array.isArray(currentConfig.pins)) {
        console.error('No pin configuration to render');
        return;
    }
    
    // Обновляем таблицу конфигурации
    renderConfigTable();
    
    // Обновляем вкладку входов
    renderInputsTab();
    
    // Обновляем вкладку выходов
    renderOutputsTab();
}

// Отрисовка таблицы конфигурации
function renderConfigTable() {
    const tableBody = document.querySelector('#gpio-table tbody');
    if (!tableBody) return;
    
    tableBody.innerHTML = '';
    
    currentConfig.pins.forEach(pinConfig => {
        const row = document.createElement('tr');
        row.dataset.pin = pinConfig.pin;
        
        row.innerHTML = `
            <td>${pinConfig.pin}</td>
            <td>${pinConfig.name || 'Без имени'}</td>
            <td>${pinConfig.type === 'input' ? 'Вход' : 'Выход'}</td>
            <td>${pinConfig.memory ? 'Да' : 'Нет'}</td>
            <td class="pin-status ${pinConfig.type === 'output' ? (digitalRead(pinConfig.pin) ? 'status-high' : 'status-low') : ''}">
                ${pinConfig.type === 'output' ? (digitalRead(pinConfig.pin) ? 'HIGH' : 'LOW') : '-'}
            </td>
            <td>
                <button onclick="editPin(${pinConfig.pin})" class="outline small">Изменить</button>
                <button onclick="deletePin(${pinConfig.pin})" class="secondary small">Удалить</button>
            </td>
        `;
        
        tableBody.appendChild(row);
    });
}

// Отрисовка вкладки входов
function renderInputsTab() {
    const container = document.getElementById('input-status');
    if (!container) return;
    
    container.innerHTML = '';
    
    const inputPins = currentConfig.pins.filter(pin => pin.type === 'input');
    
    if (inputPins.length === 0) {
        container.innerHTML = '<div class="empty-state">Нет настроенных входов</div>';
        return;
    }
    
    inputPins.forEach(pin => {
        const card = document.createElement('div');
        card.className = 'pin-card input-status';
        card.dataset.pin = pin.pin;
        
        card.innerHTML = `
            <div class="pin-header">
                <h4>${pin.name || 'Без имени'}</h4>
                <span class="pin-label">GPIO${pin.pin}</span>
            </div>
            <div class="pin-status-display">
                <div class="status-indicator status-low" title="LOW"></div>
                <div class="status-info">
                    <span class="pin-value">LOW</span>
                    <small>${pin.mode === 'pullup' ? 'С подтяжкой' : 'Без подтяжки'}</small>
                </div>
            </div>
        `;
        
        container.appendChild(card);
    });
}

// Отрисовка вкладки выходов
function renderOutputsTab() {
    const container = document.getElementById('output-controls');
    if (!container) return;
    
    container.innerHTML = '';
    
    const outputPins = currentConfig.pins.filter(pin => pin.type === 'output');
    
    if (outputPins.length === 0) {
        container.innerHTML = '<div class="empty-state">Нет настроенных выходов</div>';
        return;
    }
    
    outputPins.forEach(pin => {
        const card = document.createElement('div');
        card.className = 'pin-card output-control';
        card.dataset.pin = pin.pin;
        
        card.innerHTML = `
            <div class="pin-header">
                <h4>${pin.name || 'Без имени'}</h4>
                <span class="pin-label">GPIO${pin.pin}</span>
            </div>
            <div class="pin-status-display">
                <div class="status-info">
                    <span class="pin-state">Неизвестно</span>
                    <small>${pin.memory ? 'Сохраняет состояние' : 'Без памяти'}</small>
                </div>
                <button onclick="toggleOutput(${pin.pin})" class="output-button secondary">
                    Включить
                </button>
            </div>
        `;
        
        container.appendChild(card);
    });
}

// ==================== УПРАВЛЕНИЕ ПИНАМИ ====================

// Добавление нового пина
async function addPinConfig() {
    // Получаем значения из формы
    const pinSelect = document.getElementById('pin-select');
    const pinName = document.getElementById('pin-name');
    const pinType = document.getElementById('pin-type');
    const pinMemory = document.getElementById('pin-memory');
    const inputMode = document.getElementById('input-mode');
    
    if (!pinSelect || !pinName || !pinType) {
        showError('Форма не найдена');
        return;
    }
    
    const pin = parseInt(pinSelect.value);
    const name = pinName.value.trim();
    const type = pinType.value;
    const memory = pinMemory ? pinMemory.checked : false;
    const mode = type === 'input' ? (inputMode ? inputMode.value : 'pullup') : (memory ? 'memory' : 'normal');
    
    // Валидация
    if (!pin || isNaN(pin)) {
        showError('Выберите корректный GPIO пин');
        return;
    }
    
    if (!name) {
        showError('Введите имя для пина');
        return;
    }
    
    // Проверяем, не занят ли уже этот пин
    if (currentConfig.pins.some(p => p.pin === pin)) {
        showError(`GPIO ${pin} уже используется`);
        return;
    }
    
    // Создаем объект конфигурации пина
    const newPin = {
        pin: pin,
        name: name,
        type: type,
        mode: mode,
        memory: type === 'output' ? memory : false,
        enabled: true
    };
    
    // Добавляем в текущую конфигурацию
    if (!currentConfig.pins) {
        currentConfig.pins = [];
    }
    currentConfig.pins.push(newPin);
    
    // Сохраняем на сервере
    try {
        const response = await fetch('/api/config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(currentConfig)
        });
        
        if (response.ok) {
            showSuccess('Пин успешно добавлен');
            
            // Сбрасываем форму
            pinSelect.value = '';
            pinName.value = '';
            pinType.value = 'input';
            if (pinMemory) pinMemory.checked = false;
            togglePinOptions();
            
            // Перезагружаем конфигурацию
            setTimeout(() => {
                loadPinConfig();
                updateAvailablePins();
            }, 500);
            
        } else {
            const error = await response.text();
            throw new Error(error);
        }
    } catch (error) {
        console.error('Error saving pin config:', error);
        showError('Ошибка при сохранении пина: ' + error.message);
        
        // Удаляем пин из текущей конфигурации (так как сохранение не удалось)
        currentConfig.pins = currentConfig.pins.filter(p => p.pin !== pin);
    }
}

// Удаление пина
async function deletePin(pin) {
    showConfirmModal(
        `Удалить конфигурацию GPIO ${pin}?`,
        async () => {
            try {
                // Фильтруем удаляемый пин
                currentConfig.pins = currentConfig.pins.filter(p => p.pin !== pin);
                
                const response = await fetch('/api/config', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(currentConfig)
                });
                
                if (response.ok) {
                    showSuccess('Пин удален');
                    
                    // Перезагружаем конфигурацию
                    setTimeout(() => {
                        loadPinConfig();
                        updateAvailablePins();
                    }, 500);
                    
                } else {
                    const error = await response.text();
                    throw new Error(error);
                }
            } catch (error) {
                console.error('Error deleting pin:', error);
                showError('Ошибка при удалении пина: ' + error.message);
            }
        }
    );
}

// Редактирование пина
function editPin(pin) {
    // Находим конфигурацию пина
    const pinConfig = currentConfig.pins.find(p => p.pin === pin);
    if (!pinConfig) {
        showError('Пин не найден');
        return;
    }
    
    // Заполняем форму значениями
    const pinSelect = document.getElementById('pin-select');
    const pinName = document.getElementById('pin-name');
    const pinType = document.getElementById('pin-type');
    const pinMemory = document.getElementById('pin-memory');
    const inputMode = document.getElementById('input-mode');
    
    if (pinSelect && pinName && pinType) {
        // Нельзя изменить номер пина при редактировании, поэтому disabled
        pinSelect.value = pinConfig.pin;
        pinSelect.disabled = true;
        
        pinName.value = pinConfig.name;
        pinType.value = pinConfig.type;
        
        if (pinMemory) {
            pinMemory.checked = pinConfig.memory || false;
        }
        
        if (inputMode && pinConfig.mode) {
            inputMode.value = pinConfig.mode;
        }
        
        // Показываем соответствующие опции
        togglePinOptions();
        
        // Переходим на вкладку настроек
        showTab('settings');
        
        // Прокручиваем к форме
        document.getElementById('gpio-config').scrollIntoView({ behavior: 'smooth' });
        
        showInfo(`Редактирование GPIO ${pin}. Измените параметры и сохраните.`);
    }
}

// ==================== НАСТРОЙКИ WiFi ====================

// Переключение полей статического IP
function toggleStaticIP() {
    const fields = document.getElementById('static-ip-fields');
    const checkbox = document.getElementById('use-static');
    
    if (fields && checkbox) {
        fields.style.display = checkbox.checked ? 'block' : 'none';
    }
}

// Сохранение настроек WiFi
async function saveWiFiConfig(event) {
    event.preventDefault();
    
    const ssid = document.getElementById('wifi-ssid')?.value || '';
    const password = document.getElementById('wifi-password')?.value || '';
    const useStatic = document.getElementById('use-static')?.checked || false;
    const staticIp = document.getElementById('static-ip')?.value || '';
    const gateway = document.getElementById('static-gateway')?.value || '';
    const subnet = document.getElementById('static-subnet')?.value || '';
    const dns = document.getElementById('static-dns')?.value || '';
    
    // Базовая валидация
    if (!ssid) {
        showError('Введите имя WiFi сети (SSID)');
        return;
    }
    
    // Подготавливаем данные
    const wifiConfig = {
        ssid: ssid,
        password: password,
        use_static_ip: useStatic,
        static_ip: staticIp,
        gateway: gateway,
        subnet: subnet,
        dns: dns
    };
    
    try {
        const response = await fetch('/api/wifi', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(wifiConfig)
        });
        
        if (response.ok) {
            const result = await response.json();
            showSuccess('Настройки WiFi сохранены. Устройство перезагружается...');
            
            // Перезагрузка через 3 секунды
            setTimeout(() => {
                location.reload();
            }, 3000);
            
        } else {
            const error = await response.text();
            throw new Error(error);
        }
    } catch (error) {
        console.error('Error saving WiFi config:', error);
        showError('Ошибка сохранения настроек WiFi: ' + error.message);
    }
}

// Проверка текущего IP
async function checkCurrentIP() {
    try {
        const response = await fetch('/api/info');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const info = await response.json();
        
        let message = `IP адрес: ${info.ip || 'Не подключен'}\n`;
        message += `Сила сигнала (RSSI): ${info.rssi || 0} dBm\n`;
        message += `Время работы: ${formatUptime(info.uptime || 0)}\n`;
        message += `Свободная память: ${formatBytes(info.free_heap || 0)}`;
        
        alert(message);
    } catch (error) {
        console.error('Error checking IP:', error);
        showError('Не удалось получить информацию о сети');
    }
}

// ==================== СИСТЕМНЫЕ ФУНКЦИИ ====================

// Перезагрузка устройства
function rebootDevice() {
    showConfirmModal(
        'Перезагрузить устройство?',
        async () => {
            try {
                const response = await fetch('/api/reboot');
                if (response.ok) {
                    showSuccess('Устройство перезагружается...');
                    
                    // Перезагрузка страницы через 3 секунды
                    setTimeout(() => {
                        location.reload();
                    }, 3000);
                    
                } else {
                    throw new Error('Ошибка перезагрузки');
                }
            } catch (error) {
                console.error('Error rebooting:', error);
                showError('Ошибка при перезагрузке устройства');
            }
        }
    );
}

// Показать информацию о системе
async function showSystemInfo() {
    try {
        const response = await fetch('/api/info');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const info = await response.json();
        
        // Форматируем информацию
        const formattedInfo = {
            'Версия прошивки': info.ver || 'Неизвестно',
            'IP адрес': info.ip || 'Не подключен',
            'Режим': info.ap_mode ? 'Точка доступа' : 'Клиент WiFi',
            'Сила сигнала (RSSI)': `${info.rssi || 0} dBm`,
            'Время работы': formatUptime(info.uptime || 0),
            'Свободная память': formatBytes(info.free_heap || 0),
            'Имя сети': info.ssid || 'Неизвестно'
        };
        
        // Отображаем в модальном окне
        const infoDialog = document.getElementById('info-dialog');
        const infoContent = document.getElementById('system-info');
        
        if (infoDialog && infoContent) {
            infoContent.innerHTML = '';
            
            Object.entries(formattedInfo).forEach(([key, value]) => {
                const row = document.createElement('div');
                row.className = 'info-row';
                row.innerHTML = `
                    <strong>${key}:</strong>
                    <span>${value}</span>
                `;
                infoContent.appendChild(row);
            });
            
            infoDialog.showModal();
        } else {
            // Если модальное окно не найдено, показываем в alert
            let message = 'Информация о системе:\n\n';
            Object.entries(formattedInfo).forEach(([key, value]) => {
                message += `${key}: ${value}\n`;
            });
            alert(message);
        }
    } catch (error) {
        console.error('Error loading system info:', error);
        showError('Не удалось загрузить информацию о системе');
    }
}

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================

// Переключение опций в зависимости от типа пина
function togglePinOptions() {
    const pinType = document.getElementById('pin-type');
    const inputOptions = document.getElementById('input-options');
    const outputOptions = document.getElementById('output-options');
    
    if (pinType && inputOptions && outputOptions) {
        if (pinType.value === 'input') {
            inputOptions.style.display = 'block';
            outputOptions.style.display = 'none';
        } else {
            inputOptions.style.display = 'none';
            outputOptions.style.display = 'block';
        }
    }
}

// Обновление статусов
function updateStatusDisplays() {
    // Запрашиваем начальные состояния через WebSocket
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: 'getStates' }));
    }
}

// Обновление информации о системе
function updateSystemInfo(info) {
    // Можно обновлять информацию на странице в реальном времени
    const uptimeElement = document.getElementById('uptime-display');
    if (uptimeElement && info.uptime) {
        uptimeElement.textContent = formatUptime(info.uptime);
    }
}

// Форматирование времени работы
function formatUptime(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (days > 0) {
        return `${days}д ${hours}ч ${minutes}м`;
    } else if (hours > 0) {
        return `${hours}ч ${minutes}м ${secs}с`;
    } else if (minutes > 0) {
        return `${minutes}м ${secs}с`;
    } else {
        return `${secs}с`;
    }
}

// Форматирование байтов
function formatBytes(bytes) {
    if (bytes === 0) return '0 Б';
    
    const k = 1024;
    const sizes = ['Б', 'КБ', 'МБ', 'ГБ'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Эмуляция digitalRead для отображения в таблице
function digitalRead(pin) {
    // Это заглушка для отображения в таблице
    // Фактическое состояние будет обновляться через WebSocket
    return false;
}

// ==================== УВЕДОМЛЕНИЯ И МОДАЛЬНЫЕ ОКНА ====================

// Показать подтверждение
function showConfirmModal(message, confirmCallback) {
    const dialog = document.getElementById('confirm-dialog');
    const messageElement = document.getElementById('confirm-message');
    
    if (dialog && messageElement) {
        messageElement.textContent = message;
        pendingAction = confirmCallback;
        dialog.showModal();
    } else {
        // Если модальное окно не найдено, используем confirm
        if (confirm(message)) {
            confirmCallback();
        }
    }
}

// Подтвердить действие
function confirmAction() {
    if (pendingAction) {
        pendingAction();
    }
    closeModal();
}

// Закрыть модальное окно
function closeModal() {
    const dialog = document.getElementById('confirm-dialog');
    if (dialog) {
        dialog.close();
    }
    pendingAction = null;
}

// Закрыть информационное окно
function closeInfoModal() {
    const dialog = document.getElementById('info-dialog');
    if (dialog) {
        dialog.close();
    }
}

// Показать уведомление об ошибке
function showError(message) {
    console.error('Error:', message);
    alert('Ошибка: ' + message);
}

// Показать уведомление об успехе
function showSuccess(message) {
    console.log('Success:', message);
    alert('✓ ' + message);
}

// Показать информационное сообщение
function showInfo(message) {
    console.log('Info:', message);
    alert('ℹ ' + message);
}

// ==================== CSS ДЛЯ ДОПОЛНИТЕЛЬНЫХ СТИЛЕЙ ====================

// Добавляем дополнительные стили динамически
const additionalStyles = `
.pin-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
}

.pin-header h4 {
    margin: 0;
    font-size: 1.1em;
}

.pin-label {
    background: #e0e0e0;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 0.9em;
    color: #666;
}

.pin-status-display {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 10px;
}

.status-info {
    display: flex;
    flex-direction: column;
}

.status-info small {
    color: #666;
    font-size: 0.8em;
}

.empty-state {
    text-align: center;
    padding: 40px 20px;
    color: #666;
    font-style: italic;
}

.info-row {
    display: flex;
    justify-content: space-between;
    padding: 8px 0;
    border-bottom: 1px solid #eee;
}

.info-row:last-child {
    border-bottom: none;
}

.info-row strong {
    color: #333;
}

.info-row span {
    color: #666;
}

.status-high {
    background-color: #4caf50 !important;
}

.status-low {
    background-color: #f44336 !important;
}

.pin-status {
    padding: 4px 8px;
    border-radius: 4px;
    font-weight: bold;
    text-align: center;
}
`;

// Добавляем стили в документ
if (document.head) {
    const styleElement = document.createElement('style');
    styleElement.textContent = additionalStyles;
    document.head.appendChild(styleElement);
}

// ==================== АВТООБНОВЛЕНИЕ ====================

// Автоматическое обновление статусов каждые 30 секунд
setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: 'ping' }));
    }
}, 30000);

// Автоматическое обновление информации о системе каждую минуту
setInterval(() => {
    updateAvailablePins();
}, 60000);