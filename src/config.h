#ifndef CONFIG_H
#define CONFIG_H

// Версия прошивки
#define FIRMWARE_VERSION "1.0.0"

// Настройки WiFi
#define AP_SSID "ESP32_Config"
#define AP_PASSWORD "Esp_Test"
#define AP_MAX_CONN 1
#define STA_RETRY_INTERVAL 300000   // 5 минут (мс)
#define STA_CONNECT_TIMEOUT 15000   // 15 секунд

// Настройки сервера
#define WEB_SERVER_PORT 80
#define WEB_SOCKET_PORT 81
#define JSON_BUFFER_SIZE 3072

// Настройки GPIO
#define DEBOUNCE_DELAY 50           // мс
#define SAVE_DELAY 2000             // Задержка записи в NVS (мс)

// Разрешенные пины
const uint8_t ALLOWED_PINS[] = {2, 4, 5, 13, 14, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33};
const uint8_t ALLOWED_PINS_COUNT = 17;

// Запрещенные пины
const uint8_t EXCLUDED_PINS[] = {0, 1, 3, 6, 7, 8, 9, 10, 11, 12, 15, 34, 35, 36, 37, 38, 39};

// Пространства NVS
#define NVS_CONFIG_NAMESPACE "config"
#define NVS_STATES_NAMESPACE "states"
#define NVS_WIFI_KEY "wifi_config"
#define NVS_GPIO_KEY "gpio_config"

// Структура конфигурации пина
struct PinConfig {
  uint8_t pin;
  char name[32];
  char type[16];        // "input", "output"
  char mode[16];        // "pullup", "float", "normal", "memory"
  bool memory;
  bool enabled;
};

// Структура WiFi конфигурации
struct WiFiConfig {
  char ssid[32];
  char password[64];
  bool use_static_ip;
  char static_ip[16];
  char gateway[16];
  char subnet[16];
  char dns[16];
};

#endif