#ifndef WEBSERVER_HANDLER_H
#define WEBSERVER_HANDLER_H

#include <WebServer.h>
#include <WebSocketsServer.h>
#include <ArduinoJson.h>
#include "config.h"

void initWebServer();
void webSocketEvent(uint8_t num, WStype_t type, uint8_t * payload, size_t length);
void handleGetConfig();
void handlePostConfig();
void handleGetInfo();
void handleGetReboot();
void handleGetAvailablePins();
void handlePostWiFi();
void handleNotFound();

#endif