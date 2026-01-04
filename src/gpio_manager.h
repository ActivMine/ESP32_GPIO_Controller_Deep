#ifndef GPIO_MANAGER_H
#define GPIO_MANAGER_H

#include <Arduino.h>
#include <vector>
#include "config.h"

struct PinState {
    uint8_t pin;
    uint8_t value;
    unsigned long lastChange;
    bool needsSave;
};

class GPIOManager {
public:
    void init();
    void checkInputs();
    void setOutput(uint8_t pin, uint8_t value);
    uint8_t getInput(uint8_t pin);
    void loadConfig();
    bool saveConfig(const std::vector<PinConfig>& configs);
    void saveStatesIfNeeded();
    std::vector<uint8_t> getAvailablePins();
    std::vector<PinConfig> getPinConfigs();
    PinConfig* getPinConfig(uint8_t pin);
    
private:
    std::vector<PinConfig> pinConfigs;
    std::vector<PinState> pinStates;
    uint8_t lastInputState[40] = {0};
    unsigned long lastDebounceTime[40] = {0};
    
    void configurePin(const PinConfig& config);
    bool isPinAvailable(uint8_t pin);
    void loadStates();
    void saveState(uint8_t pin, uint8_t value);
};

#endif