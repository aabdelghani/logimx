// A Node-API module for the app's own process on macOS: Input Monitoring can only be asked for by
// the app people see. Asked from the agent (a background helper), macOS refuses without a prompt
// and never lists NotLogi under Privacy & Security > Input Monitoring. The agent runs as the
// app's child, so once the app is allowed, the agent can open keyboards too.
// Node-API is a stable C ABI exported by Electron itself: no headers or node-gyp needed, the few
// declarations below are all it takes, and the symbols resolve when Electron loads the module.
#include <IOKit/hidsystem/IOHIDLib.h>
#include <string.h>

typedef struct napi_env__* napi_env;
typedef struct napi_value__* napi_value;
typedef struct napi_callback_info__* napi_callback_info;
typedef int napi_status;
typedef napi_value (*napi_callback)(napi_env, napi_callback_info);
napi_status napi_create_function(napi_env, const char*, size_t, napi_callback, void*, napi_value*);
napi_status napi_set_named_property(napi_env, napi_value, const char*, napi_value);
napi_status napi_create_string_utf8(napi_env, const char*, size_t, napi_value*);

static napi_value state(napi_env env) {
    IOHIDAccessType a = IOHIDCheckAccess(kIOHIDRequestTypeListenEvent);
    const char* s = a == kIOHIDAccessTypeGranted ? "granted" : a == kIOHIDAccessTypeDenied ? "denied" : "unknown";
    napi_value v;
    napi_create_string_utf8(env, s, strlen(s), &v);
    return v;
}
// "granted", "denied" or "unknown" (never asked)
static napi_value check(napi_env env, napi_callback_info info) { return state(env); }
// the first time: the system's prompt, and NotLogi listed (switched off) in the setting
static napi_value request(napi_env env, napi_callback_info info) {
    if (IOHIDCheckAccess(kIOHIDRequestTypeListenEvent) != kIOHIDAccessTypeGranted) IOHIDRequestAccess(kIOHIDRequestTypeListenEvent);
    return state(env);
}

__attribute__((visibility("default"))) napi_value napi_register_module_v1(napi_env env, napi_value exports) {
    napi_value f;
    napi_create_function(env, "check", 5, check, NULL, &f);
    napi_set_named_property(env, exports, "check", f);
    napi_create_function(env, "request", 7, request, NULL, &f);
    napi_set_named_property(env, exports, "request", f);
    return exports;
}
