#ifndef WIFI_MANAGER_H
#define WIFI_MANAGER_H

#include <WiFi.h>
#include "config.h"

class WiFiManager {
public:
    void init();
    void handle(unsigned long currentMillis);
    void reconnectSTA();
    void startAP();
    bool isConnected();
    String getIP();
    int getRSSI();
    bool saveWiFiConfig(WiFiConfig& config);
    
private:
    WiFiConfig wifiConfig;
    bool apMode = false;
    unsigned long lastConnectionAttempt = 0;
    bool loadConfig();
};

#endif