#include "gpio_manager.h"
#include <Preferences.h>
#include <ArduinoJson.h>

extern Preferences preferences;

void GPIOManager::init() {
    for (const auto& config : pinConfigs) {
        if (config.enabled) {
            configurePin(config);
        }
    }
    loadStates();
}

void GPIOManager::configurePin(const PinConfig& config) {
    if (strcmp(config.type, "input") == 0) {
        if (strcmp(config.mode, "pullup") == 0) {
            pinMode(config.pin, INPUT_PULLUP);
        } else {
            pinMode(config.pin, INPUT);
        }
        lastInputState[config.pin] = digitalRead(config.pin);
    } else if (strcmp(config.type, "output") == 0) {
        pinMode(config.pin, OUTPUT);
        uint8_t initialState = LOW;
        if (config.memory) {
            // Восстановление состояния из NVS - ИСПРАВЛЕНО
            char key[16];
            snprintf(key, sizeof(key), "pin_%d", config.pin);
            initialState = preferences.getUChar(key, LOW);
        }
        digitalWrite(config.pin, initialState);
        
        PinState state;
        state.pin = config.pin;
        state.value = initialState;
        state.lastChange = millis();
        state.needsSave = false;
        pinStates.push_back(state);
    }
}

void GPIOManager::checkInputs() {
    unsigned long currentMillis = millis();
    
    for (const auto& config : pinConfigs) {
        if (!config.enabled || strcmp(config.type, "input") != 0) continue;
        
        uint8_t currentState = digitalRead(config.pin);
        
        if (currentState != lastInputState[config.pin]) {
            lastDebounceTime[config.pin] = currentMillis;
        }
        
        if ((currentMillis - lastDebounceTime[config.pin]) > DEBOUNCE_DELAY) {
            if (currentState != lastInputState[config.pin]) {
                lastInputState[config.pin] = currentState;
                // Событие изменения входа
                Serial.printf("Pin %d changed to %d\n", config.pin, currentState);
            }
        }
    }
}

void GPIOManager::setOutput(uint8_t pin, uint8_t value) {
    for (auto& state : pinStates) {
        if (state.pin == pin) {
            digitalWrite(pin, value);
            state.value = value;
            state.lastChange = millis();
            state.needsSave = true;
            break;
        }
    }
}

uint8_t GPIOManager::getInput(uint8_t pin) {
    return lastInputState[pin];
}

void GPIOManager::loadConfig() {
    // ИСПРАВЛЕНО: используем DynamicJsonDocument вместо StaticJsonDocument
    DynamicJsonDocument doc(JSON_BUFFER_SIZE);
    
    String jsonStr = preferences.getString(NVS_GPIO_KEY, "{\"pins\":[]}");
    DeserializationError error = deserializeJson(doc, jsonStr);
    if (error) {
        Serial.println("Failed to load GPIO config, using default");
        return;
    }
    
    JsonArray pinsArray = doc["pins"].as<JsonArray>();
    pinConfigs.clear();
    
    for (JsonObject pinObj : pinsArray) {
        PinConfig config;
        config.pin = pinObj["pin"].as<uint8_t>();
        strlcpy(config.name, pinObj["name"] | "", sizeof(config.name));
        strlcpy(config.type, pinObj["type"] | "input", sizeof(config.type));
        strlcpy(config.mode, pinObj["mode"] | "pullup", sizeof(config.mode));
        config.memory = pinObj["memory"] | false;
        config.enabled = pinObj["enabled"] | true;
        
        pinConfigs.push_back(config);
    }
}

bool GPIOManager::saveConfig(const std::vector<PinConfig>& configs) {
    DynamicJsonDocument doc(JSON_BUFFER_SIZE);
    JsonArray pinsArray = doc.createNestedArray("pins");
    
    for (const auto& config : configs) {
        JsonObject pinObj = pinsArray.createNestedObject();
        pinObj["pin"] = config.pin;
        pinObj["name"] = config.name;
        pinObj["type"] = config.type;
        pinObj["mode"] = config.mode;
        pinObj["memory"] = config.memory;
        pinObj["enabled"] = config.enabled;
    }
    
    String jsonStr;
    serializeJson(doc, jsonStr);
    
    pinConfigs = configs;
    
    return preferences.putString(NVS_GPIO_KEY, jsonStr) > 0;
}

void GPIOManager::saveStatesIfNeeded() {
    unsigned long currentMillis = millis();
    for (auto& state : pinStates) {
        if (state.needsSave && (currentMillis - state.lastChange) >= SAVE_DELAY) {
            saveState(state.pin, state.value);
            state.needsSave = false;
        }
    }
}

std::vector<uint8_t> GPIOManager::getAvailablePins() {
    std::vector<uint8_t> available;
    bool usedPins[40] = {false};
    
    for (const auto& config : pinConfigs) {
        if (config.enabled) {
            usedPins[config.pin] = true;
        }
    }
    
    for (uint8_t i = 0; i < ALLOWED_PINS_COUNT; i++) {
        uint8_t pin = ALLOWED_PINS[i];
        bool excluded = false;
        
        // Проверка на исключенные пины
        for (uint8_t j = 0; j < sizeof(EXCLUDED_PINS); j++) {
            if (pin == EXCLUDED_PINS[j]) {
                excluded = true;
                break;
            }
        }
        
        if (!excluded && !usedPins[pin]) {
            available.push_back(pin);
        }
    }
    
    return available;
}

std::vector<PinConfig> GPIOManager::getPinConfigs() {
    return pinConfigs;
}

PinConfig* GPIOManager::getPinConfig(uint8_t pin) {
    for (auto& config : pinConfigs) {
        if (config.pin == pin) {
            return &config;
        }
    }
    return nullptr;
}

bool GPIOManager::isPinAvailable(uint8_t pin) {
    // Проверка на запрещенные пины
    for (uint8_t i = 0; i < sizeof(EXCLUDED_PINS); i++) {
        if (pin == EXCLUDED_PINS[i]) {
            return false;
        }
    }
    
    // Проверка на разрешенные пины
    bool allowed = false;
    for (uint8_t i = 0; i < ALLOWED_PINS_COUNT; i++) {
        if (pin == ALLOWED_PINS[i]) {
            allowed = true;
            break;
        }
    }
    
    if (!allowed) return false;
    
    // Проверка на занятость
    for (const auto& config : pinConfigs) {
        if (config.pin == pin && config.enabled) {
            return false;
        }
    }
    
    return true;
}

void GPIOManager::loadStates() {
    // Загрузка состояний для выходов с памятью - ИСПРАВЛЕНО
    for (auto& config : pinConfigs) {
        if (config.enabled && strcmp(config.type, "output") == 0 && config.memory) {
            char key[16];
            snprintf(key, sizeof(key), "pin_%d", config.pin);
            uint8_t savedState = preferences.getUChar(key, LOW);
            for (auto& state : pinStates) {
                if (state.pin == config.pin) {
                    state.value = savedState;
                    digitalWrite(config.pin, savedState);
                    break;
                }
            }
        }
    }
}

void GPIOManager::saveState(uint8_t pin, uint8_t value) {
    // ИСПРАВЛЕНО: использование char array вместо String
    char key[16];
    snprintf(key, sizeof(key), "pin_%d", pin);
    preferences.putUChar(key, value);
}