#include "wifi_manager.h"
#include <Preferences.h>
#include <ArduinoJson.h>

extern Preferences preferences;

void WiFiManager::init() {
    if (!loadConfig() || wifiConfig.ssid[0] == '\0') {
        startAP();
        return;
    }
    
    WiFi.mode(WIFI_STA);
    WiFi.begin(wifiConfig.ssid, wifiConfig.password);
    
    if (wifiConfig.use_static_ip) {
        IPAddress ip, gateway, subnet, dns;
        ip.fromString(wifiConfig.static_ip);
        gateway.fromString(wifiConfig.gateway);
        subnet.fromString(wifiConfig.subnet);
        dns.fromString(wifiConfig.dns);
        WiFi.config(ip, gateway, subnet, dns);
    }
    
    Serial.println("Connecting to WiFi...");
    unsigned long startTime = millis();
    
    while (WiFi.status() != WL_CONNECTED && millis() - startTime < STA_CONNECT_TIMEOUT) {
        delay(500);
        Serial.print(".");
    }
    
    if (WiFi.status() == WL_CONNECTED) {
        Serial.println("\nWiFi connected!");
        Serial.print("IP address: ");
        Serial.println(WiFi.localIP());
        apMode = false;
    } else {
        Serial.println("\nFailed to connect to WiFi, starting AP mode");
        startAP();
    }
}

void WiFiManager::handle(unsigned long currentMillis) {
    if (apMode && WiFi.softAPgetStationNum() > 0) {
        // Клиент подключен к AP
    }
}

void WiFiManager::reconnectSTA() {
    if (wifiConfig.ssid[0] == '\0') return;
    
    if (WiFi.status() != WL_CONNECTED) {
        WiFi.disconnect();
        delay(100);
        WiFi.begin(wifiConfig.ssid, wifiConfig.password);
    }
}

void WiFiManager::startAP() {
    WiFi.mode(WIFI_AP);
    WiFi.softAP(AP_SSID, AP_PASSWORD);
    Serial.println("AP Mode Started");
    Serial.print("AP IP: ");
    Serial.println(WiFi.softAPIP());
    apMode = true;
}

bool WiFiManager::isConnected() {
    return WiFi.status() == WL_CONNECTED && !apMode;
}

String WiFiManager::getIP() {
    if (apMode) return WiFi.softAPIP().toString();
    return WiFi.localIP().toString();
}

int WiFiManager::getRSSI() {
    return WiFi.RSSI();
}

bool WiFiManager::loadConfig() {
    String jsonStr = preferences.getString(NVS_WIFI_KEY, "");
    if (jsonStr.length() == 0) return false;
    
    StaticJsonDocument<512> doc;
    DeserializationError error = deserializeJson(doc, jsonStr);
    if (error) return false;
    
    strlcpy(wifiConfig.ssid, doc["ssid"] | "", sizeof(wifiConfig.ssid));
    strlcpy(wifiConfig.password, doc["password"] | "", sizeof(wifiConfig.password));
    wifiConfig.use_static_ip = doc["use_static_ip"] | false;
    strlcpy(wifiConfig.static_ip, doc["static_ip"] | "192.168.1.100", sizeof(wifiConfig.static_ip));
    strlcpy(wifiConfig.gateway, doc["gateway"] | "192.168.1.1", sizeof(wifiConfig.gateway));
    strlcpy(wifiConfig.subnet, doc["subnet"] | "255.255.255.0", sizeof(wifiConfig.subnet));
    strlcpy(wifiConfig.dns, doc["dns"] | "8.8.8.8", sizeof(wifiConfig.dns));
    
    return true;
}

bool WiFiManager::saveWiFiConfig(WiFiConfig& config) {
    StaticJsonDocument<512> doc;
    doc["ssid"] = config.ssid;
    doc["password"] = config.password;
    doc["use_static_ip"] = config.use_static_ip;
    doc["static_ip"] = config.static_ip;
    doc["gateway"] = config.gateway;
    doc["subnet"] = config.subnet;
    doc["dns"] = config.dns;
    
    String jsonStr;
    serializeJson(doc, jsonStr);
    
    wifiConfig = config;
    
    return preferences.putString(NVS_WIFI_KEY, jsonStr) > 0;
}