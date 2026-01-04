#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <WebSocketsServer.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <FS.h>
#include <LittleFS.h>
#include "config.h"
#include "wifi_manager.h"
#include "gpio_manager.h"
#include "webserver_handler.h"

// Глобальные объекты
WiFiManager wifiManager;
GPIOManager gpioManager;
WebServer webServer(WEB_SERVER_PORT);
WebSocketsServer webSocket(WEB_SOCKET_PORT);
Preferences preferences;

// Таймеры
unsigned long lastDebounceCheck = 0;
unsigned long lastReconnectAttempt = 0;
unsigned long lastMemorySave = 0;
unsigned long lastInputCheck = 0;

// Функция для отправки состояния входа через WebSocket
void sendInputState(uint8_t pin, uint8_t value) {
    String json = "{\"pin\":" + String(pin) + ",\"val\":" + String(value) + "}";
    webSocket.broadcastTXT(json);
    Serial.printf("Broadcasting input state: %s\n", json.c_str());
}

void setup() {
    Serial.begin(115200);
    delay(1000);
    
    Serial.println("\n\n=== ESP32 GPIO Controller ===");
    Serial.println("Version: " + String(FIRMWARE_VERSION));
    
    // Инициализация файловой системы
    if (!LittleFS.begin(true)) {
        Serial.println("Ошибка монтирования LittleFS!");
        return;
    }
    Serial.println("LittleFS mounted successfully");
    
    // Показываем файлы в LittleFS
    Serial.println("Files in LittleFS:");
    File root = LittleFS.open("/");
    File file = root.openNextFile();
    while(file) {
        Serial.printf("  %s (%d bytes)\n", file.name(), file.size());
        file = root.openNextFile();
    }
    root.close();
    
    // Инициализация NVS
    preferences.begin(NVS_CONFIG_NAMESPACE, false);
    
    // Загрузка конфигурации
    gpioManager.loadConfig();
    
    // Инициализация WiFi
    wifiManager.init();
    
    // Инициализация GPIO
    gpioManager.init();
    
    // Инициализация веб-сервера
    initWebServer();
    
    // Инициализация WebSocket
    webSocket.begin();
    webSocket.onEvent(webSocketEvent);
    
    // Настройка пинов по умолчанию (для теста)
    Serial.println("Configured pins:");
    auto pinConfigs = gpioManager.getPinConfigs();
    for (const auto& config : pinConfigs) {
        Serial.printf("  Pin %d: %s (%s)\n", 
            config.pin, config.name, config.type);
    }
    
    Serial.println("System initialized");
}

void loop() {
    unsigned long currentMillis = millis();
    
    // Обслуживание WiFi
    wifiManager.handle(currentMillis);
    
    // Обслуживание WebSocket
    webSocket.loop();
    
    // Обслуживание веб-сервера
    webServer.handleClient();
    
    // Проверка входов каждые 50мс
    if (currentMillis - lastDebounceCheck >= DEBOUNCE_DELAY) {
        gpioManager.checkInputs();
        
        // Проверяем изменения входов вручную
        auto pinConfigs = gpioManager.getPinConfigs();
        for (const auto& config : pinConfigs) {
            if (strcmp(config.type, "input") == 0) {
                uint8_t currentState = digitalRead(config.pin);
                static uint8_t lastStates[40] = {0};
                
                if (currentState != lastStates[config.pin]) {
                    lastStates[config.pin] = currentState;
                    sendInputState(config.pin, currentState);
                }
            }
        }
        
        lastDebounceCheck = currentMillis;
    }
    
    // Автосохранение состояний с памятью
    if (currentMillis - lastMemorySave >= SAVE_DELAY) {
        gpioManager.saveStatesIfNeeded();
        lastMemorySave = currentMillis;
    }
    
    // Фоновое переподключение к WiFi
    if (WiFi.status() != WL_CONNECTED && 
        currentMillis - lastReconnectAttempt >= STA_RETRY_INTERVAL) {
        Serial.println("Attempting WiFi reconnection...");
        wifiManager.reconnectSTA();
        lastReconnectAttempt = currentMillis;
    }
}