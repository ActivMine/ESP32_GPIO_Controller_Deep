#include <WebServer.h>
#include <WebSocketsServer.h>
#include <ArduinoJson.h>
#include <Preferences.h>  // ← ДОБАВЬТЕ ЭТУ СТРОКУ
#include <FS.h>
#include <LittleFS.h>
#include "config.h"
#include "wifi_manager.h"
#include "gpio_manager.h"
#include "webserver_handler.h"

extern WebServer webServer;
extern WebSocketsServer webSocket;
extern WiFiManager wifiManager;
extern GPIOManager gpioManager;
extern Preferences preferences;  // Теперь этот тип будет известен

void initWebServer() {
    // API endpoints
    webServer.on("/api/config", HTTP_GET, handleGetConfig);
    webServer.on("/api/config", HTTP_POST, handlePostConfig);
    webServer.on("/api/info", HTTP_GET, handleGetInfo);
    webServer.on("/api/reboot", HTTP_GET, handleGetReboot);
    webServer.on("/api/available-pins", HTTP_GET, handleGetAvailablePins);
    webServer.on("/api/wifi", HTTP_POST, handlePostWiFi);
    
    // Корневой запрос
    webServer.on("/", HTTP_GET, []() {
        File file = LittleFS.open("/index.html", "r");
        webServer.streamFile(file, "text/html");
        file.close();
    });
    
    // Статические файлы
    webServer.on("/style.css", HTTP_GET, []() {
        File file = LittleFS.open("/style.css", "r");
        webServer.streamFile(file, "text/css");
        file.close();
    });
    
    webServer.on("/app.js", HTTP_GET, []() {
        File file = LittleFS.open("/app.js", "r");
        webServer.streamFile(file, "application/javascript");
        file.close();
    });
    
    webServer.on("/favicon.ico", HTTP_GET, []() {
        File file = LittleFS.open("/favicon.ico", "r");
        webServer.streamFile(file, "image/x-icon");
        file.close();
    });
    
    // Обработка ошибок 404
    webServer.onNotFound(handleNotFound);
    
    webServer.begin();
    Serial.println("HTTP server started");
}

void webSocketEvent(uint8_t num, WStype_t type, uint8_t * payload, size_t length) {
    switch (type) {
        case WStype_DISCONNECTED:
            Serial.printf("[%u] Disconnected!\n", num);
            break;
        case WStype_CONNECTED: {
            IPAddress ip = webSocket.remoteIP(num);
            Serial.printf("[%u] Connected from %d.%d.%d.%d\n", num, ip[0], ip[1], ip[2], ip[3]);
            
            // Отправляем текущие состояния всех выходов
            auto pinConfigs = gpioManager.getPinConfigs();
            for (const auto& config : pinConfigs) {
                if (strcmp(config.type, "output") == 0) {
                    uint8_t value = digitalRead(config.pin);
                    String json = "{\"pin\":" + String(config.pin) + ",\"val\":" + String(value) + "}";
                    webSocket.sendTXT(num, json);
                }
            }
            break;
        }
        case WStype_TEXT: {
            Serial.printf("[%u] Received text: %s\n", num, payload);
            JsonDocument doc;
            DeserializationError error = deserializeJson(doc, payload);
            
            if (error) {
                Serial.println("Failed to parse JSON");
                return;
            }
            
            if (doc.containsKey("pin") && doc.containsKey("val")) {
                uint8_t pin = doc["pin"].as<uint8_t>();
                uint8_t value = doc["val"].as<uint8_t>();
                
                // Проверяем, что пин настроен как выход
                PinConfig* config = gpioManager.getPinConfig(pin);
                if (config && strcmp(config->type, "output") == 0) {
                    gpioManager.setOutput(pin, value);
                    
                    // Рассылаем новое состояние всем клиентам
                    String json = "{\"pin\":" + String(pin) + ",\"val\":" + String(value) + "}";
                    webSocket.broadcastTXT(json);
                }
            }
            break;
        }
        default:
            break;
    }
}

void handleGetConfig() {
    JsonDocument doc;
    JsonArray pinsArray = doc["pins"].to<JsonArray>();
    
    auto pinConfigs = gpioManager.getPinConfigs();
    for (const auto& config : pinConfigs) {
        JsonObject pinObj = pinsArray.add<JsonObject>();
        pinObj["pin"] = config.pin;
        pinObj["name"] = config.name;
        pinObj["type"] = config.type;
        pinObj["mode"] = config.mode;
        pinObj["memory"] = config.memory;
        pinObj["enabled"] = config.enabled;
    }
    
    String response;
    serializeJson(doc, response);
    webServer.send(200, "application/json", response);
}

void handlePostConfig() {
    if (!webServer.hasArg("plain")) {
        webServer.send(400, "application/json", "{\"error\":\"No data\"}");
        return;
    }
    
    String body = webServer.arg("plain");
    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, body);
    
    if (error) {
        webServer.send(400, "application/json", "{\"error\":\"Invalid JSON\"}");
        return;
    }
    
    std::vector<PinConfig> newConfigs;
    JsonArray pinsArray = doc["pins"].as<JsonArray>();
    
    for (JsonObject pinObj : pinsArray) {
        PinConfig config;
        config.pin = pinObj["pin"].as<uint8_t>();
        strlcpy(config.name, pinObj["name"] | "", sizeof(config.name));
        strlcpy(config.type, pinObj["type"] | "input", sizeof(config.type));
        strlcpy(config.mode, pinObj["mode"] | "pullup", sizeof(config.mode));
        config.memory = pinObj["memory"] | false;
        config.enabled = pinObj["enabled"] | true;
        
        newConfigs.push_back(config);
    }
    
    if (gpioManager.saveConfig(newConfigs)) {
        webServer.send(200, "application/json", "{\"success\":true}");
    } else {
        webServer.send(500, "application/json", "{\"error\":\"Failed to save config\"}");
    }
}

void handleGetInfo() {
    JsonDocument doc;
    doc["uptime"] = millis();
    doc["rssi"] = WiFi.RSSI();
    doc["ver"] = FIRMWARE_VERSION;
    doc["free_heap"] = ESP.getFreeHeap();
    doc["ip"] = WiFi.localIP().toString();
    doc["ap_mode"] = (WiFi.getMode() == WIFI_MODE_APSTA || WiFi.getMode() == WIFI_MODE_AP);
    
    String response;
    serializeJson(doc, response);
    webServer.send(200, "application/json", response);
}

void handleGetReboot() {
    webServer.send(200, "application/json", "{\"rebooting\":true}");
    delay(100);
    ESP.restart();
}

void handleGetAvailablePins() {
    auto availablePins = gpioManager.getAvailablePins();
    JsonDocument doc;
    JsonArray pinsArray = doc["pins"].to<JsonArray>();
    
    for (uint8_t pin : availablePins) {
        pinsArray.add(pin);
    }
    
    String response;
    serializeJson(doc, response);
    webServer.send(200, "application/json", response);
}

void handlePostWiFi() {
    if (!webServer.hasArg("plain")) {
        webServer.send(400, "application/json", "{\"error\":\"No data\"}");
        return;
    }
    
    String body = webServer.arg("plain");
    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, body);
    
    if (error) {
        webServer.send(400, "application/json", "{\"error\":\"Invalid JSON\"}");
        return;
    }
    
    WiFiConfig config;
    strlcpy(config.ssid, doc["ssid"] | "", sizeof(config.ssid));
    strlcpy(config.password, doc["password"] | "", sizeof(config.password));
    config.use_static_ip = doc["use_static_ip"] | false;
    strlcpy(config.static_ip, doc["static_ip"] | "192.168.1.100", sizeof(config.static_ip));
    strlcpy(config.gateway, doc["gateway"] | "192.168.1.1", sizeof(config.gateway));
    strlcpy(config.subnet, doc["subnet"] | "255.255.255.0", sizeof(config.subnet));
    strlcpy(config.dns, doc["dns"] | "8.8.8.8", sizeof(config.dns));
    
    if (wifiManager.saveWiFiConfig(config)) {
        webServer.send(200, "application/json", "{\"success\":true, \"message\":\"WiFi settings saved. Rebooting...\"}");
        delay(1000);
        ESP.restart();
    } else {
        webServer.send(500, "application/json", "{\"error\":\"Failed to save WiFi config\"}");
    }
}

void handleNotFound() {
    String path = webServer.uri();
    if (path.endsWith("/")) {
        path += "index.html";
    }
    
    if (LittleFS.exists(path)) {
        File file = LittleFS.open(path, "r");
        String contentType = "text/plain";
        
        if (path.endsWith(".html")) contentType = "text/html";
        else if (path.endsWith(".css")) contentType = "text/css";
        else if (path.endsWith(".js")) contentType = "application/javascript";
        else if (path.endsWith(".ico")) contentType = "image/x-icon";
        
        webServer.streamFile(file, contentType);
        file.close();
    } else {
        webServer.send(404, "text/plain", "File not found");
    }
}